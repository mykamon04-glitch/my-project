/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BUILDING_CONFIGS, UNIT_CONFIGS } from '../data/gameData';
import type { GameEngine } from './engine';
import { BuildingType, ConstructionStrategyId, ConstructionTask } from '../types/game';

/**
 * Construction AI decision model (V8.1).
 *
 * Replaces the old fixed doctrine ladder, which had no notion of "enough" and ended in an unconditional
 * "build another refinery" (one run produced 26-35 refineries and 7-10 reactors for a base with 1 barracks).
 *
 * Every candidate building goes through:
 *   1. MANDATORY gates  - strategy, prerequisites, quantity caps, cooldown, player limits, power safety.
 *      A candidate that fails a gate is rejected with a reason BEFORE any ranking.
 *   2. NEED            - how much the base actually needs this building right now (0-100), from real state.
 *   3. SCORE           - need x strategy role weight x duplicate decay (+ mission / threat bonuses).
 * Only candidates scoring above MIN_SCORE are built, so the AI may leave construction slots empty.
 * The Construction AI re-runs this after every committed decision, counting planned projects as existing.
 */

export type ConstructionStrategy = ConstructionStrategyId;
export type BuildingRole = 'ECONOMY' | 'POWER' | 'ARMY_PRODUCTION' | 'DEFENSE' | 'TECHNOLOGY' | 'LOGISTICS' | 'SUPPORT';

export const STRATEGIES: { id: ConstructionStrategy; label: string; blurb: string }[] = [
  { id: 'balanced', label: 'Balanced Auto', blurb: 'A functional base: power, income, support, army, then defense and tech. Never overbuilds one category.' },
  { id: 'defense_only', label: 'Defense Only', blurb: 'Only defensive structures. Missing prerequisites are proposed for your approval.' },
  { id: 'army_production', label: 'Army Production', blurb: 'Barracks, factories and air facilities, added only where demand shows it.' },
  { id: 'economy', label: 'Economy & Infrastructure', blurb: 'Income, power, storage and capacity. No defenses unless you enable base defense.' },
  { id: 'adaptive', label: 'Adaptive Commander', blurb: 'Re-prioritises continuously from power, income, threats, coverage and production demand.' },
  { id: 'support_recovery', label: 'Support & Recovery', blurb: 'Repair, power restoration, logistics and medical support. Rebuilds what was lost; no army or economy expansion.' },
  { id: 'strategic', label: 'Strategic Planner', blurb: 'Weighs the whole base (income, power, threats, queues, losses, budget) and only commits to high-value projects.' },
];

/** Role classification of every existing building (a building may have several roles). */
export const BUILDING_ROLES: Record<BuildingType, BuildingRole[]> = {
  headquarters: ['LOGISTICS'],
  power_plant: ['POWER'],
  coin_generator: ['ECONOMY'],
  supply_depot: ['LOGISTICS'],
  barracks: ['ARMY_PRODUCTION'],
  vehicle_factory: ['ARMY_PRODUCTION'],
  helipad: ['ARMY_PRODUCTION'],
  airfield: ['ARMY_PRODUCTION'],
  field_hospital: ['SUPPORT'],
  repair_bay: ['SUPPORT', 'DEFENSE'],
  research_lab: ['TECHNOLOGY'],
  radar_station: ['TECHNOLOGY', 'DEFENSE'],
  turret_gun: ['DEFENSE'],
  turret_missile: ['DEFENSE'],
  turret_aa: ['DEFENSE'],
  heavy_turret: ['DEFENSE'],
  defense_wall: ['DEFENSE'],
};

export const MIN_SCORE = 25;
const minScoreFor = (st: ConstructionSettings) => (st.strategy === 'strategic' ? 35 : MIN_SCORE);

/** Mission objective id -> building the mission requires (campaign). */
const MISSION_BUILDINGS: Record<string, BuildingType> = {
  build_power: 'power_plant',
  build_barracks: 'barracks',
  build_factory: 'vehicle_factory',
  build_tech_lab: 'research_lab',
};

export interface ConstructionSettings {
  strategy: ConstructionStrategy;
  avoidDuplicates: boolean;
  allowPrerequisites: boolean;   // support policy: essential power / prerequisite buildings outside the strategy's focus
  prioritizeDefense: boolean;    // also approves defenses in non-defense strategies and boosts their need
  typeLimits: Partial<Record<BuildingType, number>>; // player restrictions (0 = never)
  rejected: Record<string, number>; // rejected suggestions: type -> game time until which it is not proposed again
}

export const DEFAULT_SETTINGS: ConstructionSettings = {
  strategy: 'balanced',
  avoidDuplicates: true,
  allowPrerequisites: true,
  prioritizeDefense: false,
  typeLimits: {},
  rejected: {},
};

export function settingsOf(e: GameEngine): ConstructionSettings {
  const a = e.aiArchitect;
  return {
    strategy: a.strategy ?? DEFAULT_SETTINGS.strategy,
    avoidDuplicates: a.avoidDuplicates ?? DEFAULT_SETTINGS.avoidDuplicates,
    allowPrerequisites: a.allowPrerequisites ?? DEFAULT_SETTINGS.allowPrerequisites,
    prioritizeDefense: a.prioritizeDefense ?? DEFAULT_SETTINGS.prioritizeDefense,
    typeLimits: a.typeLimits ?? {},
    rejected: a.rejected ?? {},
  };
}

// ───────────────────────── base analysis ─────────────────────────

export interface Count { done: number; building: number; planned: number }
export interface BaseSnapshot {
  time: number;
  counts: Record<string, Count>;
  total: (t: BuildingType) => number;
  power: { supply: number; demand: number; projectedSurplus: number };
  credits: number;
  incomePerMin: number;
  pop: number;
  popCap: number;
  barracksQueue: number; // average queued units per completed barracks
  factoryQueue: number;
  armyUnits: number;
  infantry: number;
  vehicles: number;
  threatLevel: string;
  groundThreats: number;
  armorThreats: number;
  airThreats: number;
  enemyAirKnown: boolean;
  approachAngles: number[];          // directions (radians from HQ) enemies come from
  groundCoverage: number;            // 0-1 of valued structures inside ground-turret range
  aaCoverage: number;                // 0-1 of valued structures inside AA range
  buildingCount: number;
  damaged: number;                   // completed buildings below 75% HP
  missionNeeds: Set<BuildingType>;
  unapproved: Set<BuildingType>; // pending projects still waiting for the player
  hqPx: { x: number; y: number };
  recentLosses: BuildingType[];      // completed structures destroyed in the last 3 minutes
  longRange: number;                 // visible enemy units that outrange ordinary turrets
  recruitEnabled: boolean;           // automatic recruitment (Smart Recruitment) is on
  productionQueued: number;          // units currently queued across completed barracks / factories
  productionIdle: boolean;           // production exists but nothing is queued
}

const THREAT_RANK = ['GREEN', 'YELLOW', 'ORANGE', 'RED'];
export const THREAT_HOLD_S = 20;
/** Hysteresis: a threat level that dropped in the last few seconds still counts, so priorities do not flicker. */
export function effectiveThreat(e: GameEngine): string {
  const cur = e.tacticalIntelligence.threatLevel;
  const m = e.aiArchitect.threatMemo;
  if (m && THREAT_RANK.indexOf(m.level) > THREAT_RANK.indexOf(cur) && e.gameTime - m.t < THREAT_HOLD_S) return m.level;
  return cur;
}
const compass = (a: number) => ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'][Math.round((((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 4)) % 8];

const centre = (b: { pixelX: number; pixelY: number }) => ({ x: b.pixelX, y: b.pixelY });

export function analyseBase(e: GameEngine, pending: ConstructionTask[]): BaseSnapshot {
  const counts: Record<string, Count> = {};
  const bump = (t: string, k: keyof Count) => { (counts[t] ??= { done: 0, building: 0, planned: 0 })[k]++; };
  const mine = e.buildings.filter(b => b.faction === 'player' && b.hp > 0);
  for (const b of mine) bump(b.type, b.constructionProgress >= 1 ? 'done' : 'building');
  // tasks that have not produced a real building yet are "planned" (their site and credits are already reserved)
  for (const t of pending) if (!t.buildingId) bump(t.type, 'planned');
  const total = (t: BuildingType) => { const c = counts[t]; return c ? c.done + c.building + c.planned : 0; };

  // Power / income only count COMPLETED buildings in the engine, so project the pending ones forward.
  let projSupply = e.economy.powerSupply, projDemand = e.economy.powerDemand;
  for (const [type, c] of Object.entries(counts)) {
    const cfg = BUILDING_CONFIGS[type as BuildingType];
    const pend = c.building + c.planned;
    projSupply += cfg.powerProduced * pend;
    projDemand += cfg.powerConsumed * pend;
  }

  const hq = mine.find(b => b.type === 'headquarters');
  const hqPx = hq ? centre(hq) : { x: e.mapData.playerSpawn.x, y: e.mapData.playerSpawn.y };

  const units = e.units.filter(u => u.faction === 'player' && u.hp > 0);
  const queueAvg = (type: BuildingType) => {
    const bs = mine.filter(b => b.type === type && b.constructionProgress >= 1);
    return bs.length ? bs.reduce((n, b) => n + b.productionQueue.length, 0) / bs.length : 0;
  };

  const ti = e.tacticalIntelligence;
  const threats = ti.activeThreats;
  const air = threats.filter(t => t.category === 'aircraft').length;
  const ts = e.mapData.tileSize;
  const visible = (px: number, py: number) => e.fogGrid[Math.floor(py / ts) * e.mapData.width + Math.floor(px / ts)] === 2;
  const enemyAirKnown = air > 0
    || e.units.some(u => u.faction === 'enemy' && u.hp > 0 && UNIT_CONFIGS[u.type].isAir && visible(u.x, u.y))
    || e.buildings.some(b => b.faction === 'enemy' && (b.type === 'airfield' || b.type === 'helipad') && visible(b.pixelX, b.pixelY));

  let approach = threats.map(t => Math.atan2(t.position.y - hqPx.y, t.position.x - hqPx.x));
  if (!approach.length) {
    const enemyHq = e.buildings.find(b => b.faction === 'enemy' && b.type === 'headquarters');
    const tx = enemyHq ? enemyHq.pixelX : (e.mapData.width * ts) / 2, ty = enemyHq ? enemyHq.pixelY : (e.mapData.height * ts) / 2;
    approach = [Math.atan2(ty - hqPx.y, tx - hqPx.x)];
  }

  // Defensive coverage of the structures worth protecting
  const valued = mine.filter(b => b.type === 'headquarters' || b.type === 'coin_generator' || b.type === 'vehicle_factory' || b.type === 'barracks' || b.type === 'power_plant' || b.type === 'airfield');
  const turrets = (types: BuildingType[]) => [
    ...mine.filter(b => types.includes(b.type)).map(centre),
    ...pending.filter(t => !t.buildingId && types.includes(t.type)).map(t => ({ x: (t.gridX + 0.5) * ts, y: (t.gridY + 0.5) * ts })),
  ].map(p => ({ ...p, r: 0 }));
  const withRange = (types: BuildingType[]) => types.flatMap(type => turrets([type]).map(p => ({ ...p, r: BUILDING_CONFIGS[type].range ?? 0 })));
  const covered = (turretList: { x: number; y: number; r: number }[]) =>
    valued.length === 0 ? 1 : valued.filter(v => turretList.some(t => Math.hypot(t.x - v.pixelX, t.y - v.pixelY) <= t.r)).length / valued.length;
  const groundT = withRange(['turret_gun', 'turret_missile', 'heavy_turret']);
  const aaT = withRange(['turret_aa']);

  const missionNeeds = new Set<BuildingType>();
  for (const o of e.currentMission?.objectives ?? []) {
    const t = MISSION_BUILDINGS[o.id];
    if (t && !o.completed) missionNeeds.add(t);
  }

  return {
    time: e.gameTime,
    counts,
    total,
    power: { supply: e.economy.powerSupply, demand: e.economy.powerDemand, projectedSurplus: projSupply - projDemand },
    credits: e.economy.credits,
    incomePerMin: e.economy.incomeRate,
    pop: e.economy.population,
    popCap: e.economy.populationCap,
    barracksQueue: queueAvg('barracks'),
    factoryQueue: queueAvg('vehicle_factory'),
    armyUnits: units.length,
    infantry: units.filter(u => UNIT_CONFIGS[u.type].category === 'infantry').length,
    vehicles: units.filter(u => UNIT_CONFIGS[u.type].category === 'vehicle').length,
    threatLevel: effectiveThreat(e),
    groundThreats: threats.filter(t => t.category !== 'aircraft').length,
    armorThreats: threats.filter(t => t.category === 'vehicle').length,
    airThreats: air,
    enemyAirKnown,
    approachAngles: approach,
    groundCoverage: covered(groundT),
    aaCoverage: covered(aaT),
    buildingCount: mine.length,
    damaged: mine.filter(b => b.constructionProgress >= 1 && b.hp < b.maxHp * 0.75).length,
    missionNeeds,
    unapproved: new Set(pending.filter(t => !t.approved).map(t => t.type)),
    hqPx,
    recentLosses: (e.aiArchitect.lossLog ?? []).filter(l => e.gameTime - l.t < 180).map(l => l.type),
    longRange: e.units.filter(u => u.faction === 'enemy' && u.hp > 0 && UNIT_CONFIGS[u.type].range > 330 && visible(u.x, u.y)).length,
    recruitEnabled: e.autoProduction.enabled,
    productionQueued: mine.filter(b => (b.type === 'barracks' || b.type === 'vehicle_factory') && b.constructionProgress >= 1).reduce((n, b) => n + b.productionQueue.length, 0),
    productionIdle: mine.some(b => (b.type === 'barracks' || b.type === 'vehicle_factory') && b.constructionProgress >= 1)
      && mine.filter(b => (b.type === 'barracks' || b.type === 'vehicle_factory') && b.constructionProgress >= 1).every(b => b.productionQueue.length === 0),
  };
}

// ───────────────────────── need model ─────────────────────────

interface Need { need: number; cap: number; why: string }
const name = (t: BuildingType) => BUILDING_CONFIGS[t].name;

/** How much the base needs `t` right now, and how many are justified. Pure function of the snapshot. */
export function needFor(t: BuildingType, s: BaseSnapshot, st: ConstructionSettings): Need {
  const n = s.total(t);
  const done = (x: BuildingType) => (s.counts[x]?.done ?? 0);
  const production = s.total('barracks') + s.total('vehicle_factory') + s.total('helipad') + s.total('airfield');
  const incomeLow = s.incomePerMin < 500 + 300 * production;
  const threatened = s.threatLevel !== 'GREEN';
  const sev = s.threatLevel === 'RED' ? 4 : s.threatLevel === 'ORANGE' ? 2 : s.threatLevel === 'YELLOW' ? 1 : 0;
  const strat: ConstructionStrategyId = st.strategy === 'strategic' ? 'adaptive' : st.strategy; // Strategic Planner uses Adaptive's demand model with a stricter bar
  const P = s.power.projectedSurplus;
  const sr = strat === 'support_recovery';

  switch (t) {
    case 'power_plant': {
      if (P < 0) return { need: 100, cap: 12, why: `power is short: projected surplus ${Math.round(P)} (supply ${s.power.supply}, demand ${s.power.demand})` };
      if (P < 25) return { need: 60, cap: 12, why: `power margin is thin: projected surplus ${Math.round(P)}` };
      return { need: 0, cap: 12, why: `power is adequate (projected surplus ${Math.round(P)})` };
    }
    case 'coin_generator': {
      const target = strat === 'economy'
        ? Math.min(8, 3 + Math.floor(production / 2) + (incomeLow ? 1 : 0))
        : Math.min(strat === 'adaptive' ? 5 : strat === 'balanced' ? 4 : 3, 2 + Math.floor(production / 3) + (incomeLow ? 1 : 0));
      const abundant = s.credits > 5000 && !incomeLow && !(strat === 'economy' && n < target);
      if (n < Math.max(target, 2) && !abundant) return { need: Math.min(90, 85 - 12 * n), cap: Math.max(target, 2), why: `income $${s.incomePerMin}/min is low for ${production} production building(s); ${n}/${Math.max(target, 2)} refineries` };
      return { need: 0, cap: Math.max(target, 2), why: abundant ? `credits are plentiful ($${Math.round(s.credits)})` : `refinery count ${n}/${Math.max(target, 2)} is sufficient for current demand` };
    }
    case 'supply_depot': {
      const room = s.popCap - s.pop;
      if (room <= (sr ? 10 : 6) || s.pop / Math.max(1, s.popCap) > 0.8) return { need: 80, cap: 8, why: `troop capacity is nearly full (${s.pop}/${s.popCap})` };
      return { need: 0, cap: 8, why: `troop capacity is adequate (${s.pop}/${s.popCap})` };
    }
    case 'barracks': {
      if (n === 0) return { need: 90, cap: 3, why: 'no infantry production exists' };
      const bottleneck = s.barracksQueue >= 3 && s.credits > 600;
      const cap = strat === 'army_production' ? 3 : 2;
      if (bottleneck && n < cap) return { need: 55, cap, why: `infantry queues are backed up (${s.barracksQueue.toFixed(1)} per barracks)` };
      return { need: 0, cap, why: s.productionIdle && s.armyUnits < 10 ? `existing production is idle (0 queued, ${s.armyUnits} units): more Barracks would not add troops${s.recruitEnabled ? '' : '; automatic recruitment is off'}` : 'existing Barracks can handle current recruitment demand' };
    }
    case 'vehicle_factory': {
      if (n === 0) return { need: strat === 'army_production' ? 85 : 70, cap: 3, why: 'no vehicle production exists' };
      const bottleneck = s.factoryQueue >= 3 && s.credits > 1000;
      const cap = strat === 'army_production' ? 3 : 2;
      if (bottleneck && n < cap) return { need: 50, cap, why: `vehicle queues are backed up (${s.factoryQueue.toFixed(1)} per factory)` };
      return { need: 0, cap, why: s.productionIdle && s.vehicles < 4 ? `existing production is idle (0 queued): another War Factory would not add vehicles${s.recruitEnabled ? '' : '; automatic recruitment is off'}` : 'existing vehicle production is adequate' };
    }
    case 'helipad': {
      const wanted = strat === 'army_production' || strat === 'adaptive' || (strat === 'balanced' && s.time > 240 && s.credits > 1200);
      if (wanted && n === 0 && done('vehicle_factory') > 0 && s.credits > 900) return { need: 45, cap: 1, why: 'no air production exists and the ground base is established' };
      return { need: 0, cap: 1, why: n > 0 ? 'a helipad already exists' : 'air production is not justified yet' };
    }
    case 'airfield': {
      if (strat === 'army_production' && n === 0 && done('helipad') > 0 && s.credits > 1800) return { need: 40, cap: 1, why: 'helipad is operational; heavy air production is the next step' };
      return { need: 0, cap: 1, why: n > 0 ? 'an airfield already exists' : 'airfield is not justified yet' };
    }
    case 'field_hospital': {
      if (n === 0 && s.infantry >= (sr ? 5 : 10) && done('barracks') > 0) return { need: 40, cap: 1, why: `${s.infantry} infantry in the field without medical support` };
      return { need: 0, cap: 1, why: 'medical support is not needed yet' };
    }
    case 'repair_bay': {
      const lost = s.recentLosses.length;
      if (n === 0 && (done('vehicle_factory') > 0 || sr) && (s.vehicles >= 3 || s.damaged > 0 || (sr && (lost > 0 || s.vehicles >= 1)))) return { need: sr ? 70 : 45, cap: sr ? 2 : 1, why: s.damaged > 0 ? `${s.damaged} damaged structure(s) and no repair facility` : lost > 0 ? `${lost} structure(s) lost recently and no repair facility` : `${s.vehicles} vehicles with no repair facility` };
      if (sr && n === 1 && (s.damaged >= 3 || lost >= 2) && s.credits > 600) return { need: 50, cap: 2, why: `${s.damaged} damaged structures and ${lost} recent losses exceed one repair bay` };
      return { need: 0, cap: sr ? 2 : 1, why: 'repair facilities are adequate' };
    }
    case 'research_lab': {
      if (n === 0 && done('vehicle_factory') > 0 && s.incomePerMin >= 900 && s.credits > 800) return { need: 40, cap: 1, why: 'income is stable and the factory line is running; technology is affordable' };
      return { need: 0, cap: 1, why: n > 0 ? 'a research lab already exists' : 'technology is not affordable yet' };
    }
    case 'radar_station': {
      if (n === 0 && (threatened || s.time > 120) && P > -10) return { need: threatened ? 65 : 40, cap: 1, why: threatened ? 'hostiles are active and there is no radar coverage' : 'no early-warning radar yet' };
      return { need: 0, cap: 1, why: n > 0 ? 'radar already exists' : 'radar is not needed yet' };
    }
    case 'turret_gun':
    case 'turret_missile':
    case 'heavy_turret':
    case 'turret_aa': {
      const isAA = t === 'turret_aa';
      const base = strat === 'defense_only' ? 4 : strat === 'adaptive' || strat === 'balanced' ? 2 : st.prioritizeDefense ? 2 : 0;
      const wanted = base + Math.floor(s.buildingCount / 8) + sev + (st.prioritizeDefense ? 1 : 0);
      const coverage = isAA ? s.aaCoverage : s.groundCoverage;
      if (isAA) {
        if (!s.enemyAirKnown) return { need: 0, cap: 0, why: 'no air threat has been detected' };
        const cap = Math.min(4, 1 + Math.floor((s.airThreats + (s.enemyAirKnown ? 1 : 0)) / 2) + (sev >= 2 ? 1 : 0));
        if (n < cap && coverage < 0.9) return { need: Math.round(30 + 60 * (1 - coverage)) + sev * 5, cap, why: `air threat detected and only ${Math.round(coverage * 100)}% of key structures are covered by anti-air` };
        return { need: 0, cap, why: `anti-air coverage is ${Math.round(coverage * 100)}%` };
      }
      const groundTotal = s.total('turret_gun') + s.total('turret_missile') + s.total('heavy_turret');
      if (groundTotal >= wanted || (coverage >= 0.85 && !threatened && groundTotal >= Math.max(1, base - 1))) {
        return { need: 0, cap: 0, why: `ground defense is adequate (${groundTotal} turrets, ${Math.round(coverage * 100)}% coverage)` };
      }
      // choose the turret type that matches the actual threat
      const armored = s.armorThreats >= 2 || s.threatLevel === 'RED' || s.longRange > 0;
      const dir = compass(s.approachAngles[0] ?? 0);
      const what = s.longRange > 0 ? 'long-range enemy fire' : s.armorThreats >= 2 ? 'enemy armor' : 'enemy ground forces';
      const per = t === 'turret_gun' ? Math.max(1, Math.ceil(wanted / 2)) : t === 'turret_missile' ? Math.floor(wanted / 3) + (armored ? 1 : 0) : armored ? Math.floor(wanted / 4) + (s.threatLevel === 'RED' ? 1 : 0) : 0;
      if (n >= per) return { need: 0, cap: per, why: `${n}/${per} of this turret type already cover the current ground threat` };
      const mix = t === 'turret_gun' ? 1 : armored ? 1.2 : 0.7;
      return { need: Math.round((35 + 55 * (1 - coverage) + sev * 6) * mix), cap: per, why: threatened ? `${what} detected on the ${dir} approach; only ${Math.round(coverage * 100)}% of key structures are covered (threat ${s.threatLevel})` : `${Math.round(coverage * 100)}% ground coverage with ${s.threatLevel} threat` };
    }
    case 'defense_wall':
      return { need: 0, cap: 0, why: 'walls are not built automatically because they can block troop movement' };
    default:
      return { need: 0, cap: 0, why: 'not an automatic construction target' };
  }
}

// ───────────────────────── evaluation ─────────────────────────

export interface CandidateEval {
  type: BuildingType;
  verdict: 'chosen' | 'rejected';
  score: number;
  need: number;
  count: number;
  reason: string;
  prerequisiteFor?: BuildingType; // this pick is a prerequisite of another wanted building
  requiresApproval?: boolean;     // violates the strategy focus: needs the player's approval even in AUTO
  tier: number;                   // budget priority: 1 imminent loss, 2 essential infrastructure, 3 sustain, 4 military, 5 expansion
}

/** Budget priority of a building given the current situation (see aiBudget.ts). */
export function tierFor(t: BuildingType, s: BaseSnapshot): number {
  const sev = s.threatLevel === 'RED' ? 4 : s.threatLevel === 'ORANGE' ? 2 : s.threatLevel === 'YELLOW' ? 1 : 0;
  const roles = BUILDING_ROLES[t];
  if (roles.includes('DEFENSE') && t !== 'repair_bay' && t !== 'radar_station') return sev >= 2 && s.groundCoverage < 0.5 ? 1 : 4;
  if (t === 'power_plant') return s.power.projectedSurplus < 0 || s.recentLosses.includes('power_plant') ? 2 : 3;
  if (t === 'repair_bay' || t === 'field_hospital') return s.damaged > 0 || s.recentLosses.length > 0 ? 2 : 4;
  if (t === 'coin_generator' || t === 'supply_depot') return 3;
  if (t === 'barracks' || t === 'vehicle_factory' || t === 'radar_station') return 4;
  return 5;
}


const ALL_TYPES = (Object.keys(BUILDING_CONFIGS) as BuildingType[]).filter(t => t !== 'headquarters');

/** Out-of-focus buildings a strategy may still need to function (the "support policy"). */
const ESSENTIAL_SUPPORT: Record<ConstructionStrategyId, BuildingType[]> = {
  balanced: [],
  adaptive: [],
  defense_only: ['power_plant'],
  army_production: ['power_plant', 'coin_generator', 'supply_depot'],
  economy: [],
  support_recovery: [],
  strategic: [],
};

function roleAllowed(t: BuildingType, st: ConstructionSettings): boolean {
  const roles = BUILDING_ROLES[t];
  const has = (r: BuildingRole) => roles.includes(r);
  switch (st.strategy) {
    case 'balanced':
    case 'adaptive':
    case 'strategic':
      return true;
    case 'support_recovery':
      return has('SUPPORT') || has('POWER') || has('LOGISTICS') || (st.prioritizeDefense && has('DEFENSE'));
    case 'defense_only':
      return has('DEFENSE');
    case 'army_production':
      return has('ARMY_PRODUCTION') || has('SUPPORT') || t === 'research_lab' || (st.prioritizeDefense && has('DEFENSE'));
    case 'economy':
      return has('ECONOMY') || has('POWER') || has('LOGISTICS') || (st.prioritizeDefense && has('DEFENSE'));
  }
}

function roleWeight(t: BuildingType, st: ConstructionSettings): number {
  const roles = BUILDING_ROLES[t];
  let w = 1;
  if (st.strategy === 'balanced') w = roles.includes('POWER') ? 1.2 : roles.includes('DEFENSE') ? 0.9 : roles.includes('TECHNOLOGY') || roles.includes('SUPPORT') ? 0.75 : 1;
  if (st.strategy === 'defense_only') w = 1.2;
  if (st.strategy === 'army_production') w = roles.includes('ARMY_PRODUCTION') ? 1.35 : 0.8;
  if (st.strategy === 'support_recovery') w = roles.includes('SUPPORT') ? 1.4 : roles.includes('POWER') ? 1.2 : 1;
  if (st.strategy === 'strategic') w = roles.includes('POWER') ? 1.1 : 1;
  if (st.strategy === 'economy') w = roles.includes('ECONOMY') || roles.includes('LOGISTICS') ? 1.3 : 1;
  if (st.prioritizeDefense && roles.includes('DEFENSE')) w += 0.25;
  return w;
}

/** Cooldown (game seconds) before the same type may be planned again. */
const cooldownFor = (t: BuildingType) => Math.max(5, BUILDING_CONFIGS[t].buildTime * 0.6);

/** First missing building along `t`'s prerequisite chain that is neither built nor in progress. */
function missingPrerequisite(t: BuildingType, s: BaseSnapshot): { missing: BuildingType | null; inProgress: BuildingType | null } {
  let cur: BuildingType | undefined = BUILDING_CONFIGS[t].requiredBuilding;
  while (cur) {
    const c = s.counts[cur];
    if (!c || c.done === 0) {
      if (c && (c.building + c.planned) > 0) return { missing: null, inProgress: cur };
      // find the deepest missing link so the chain is built from the bottom up
      const deeper = BUILDING_CONFIGS[cur].requiredBuilding;
      const dc = deeper ? s.counts[deeper] : undefined;
      if (deeper && (!dc || dc.done === 0)) { cur = deeper; continue; }
      return { missing: cur, inProgress: null };
    }
    break;
  }
  return { missing: null, inProgress: null };
}

export function evaluateCandidates(e: GameEngine, s: BaseSnapshot, st: ConstructionSettings, lastPlanned: Record<string, number>): CandidateEval[] {
  const out: CandidateEval[] = [];
  let powerBlocked: { type: BuildingType; need: number } | null = null; // best wanted building that only power is stopping
  const reject = (type: BuildingType, reason: string, need = 0): void => { out.push({ type, verdict: 'rejected', score: 0, need, count: s.total(type), reason, tier: tierFor(type, s) }); };

  for (const t of ALL_TYPES) {
    const nm = name(t);
    const missionReq = s.missionNeeds.has(t) && s.total(t) === 0;
    const limit = st.typeLimits[t];
    if (!missionReq && limit !== undefined && s.total(t) >= limit) { reject(t, `your limit for ${nm} is ${limit}`); continue; }

    const rejUntil = st.rejected[t];
    if (rejUntil !== undefined && rejUntil > s.time) { reject(t, `you rejected this suggestion; not proposed again for ${Math.ceil(rejUntil - s.time)} s`); continue; }

    const nd = needFor(t, s, st);
    const need = missionReq ? Math.max(nd.need, 95) : nd.need;
    const why = missionReq ? 'a mission objective requires it' : nd.why;

    if (need <= 0) { reject(t, nd.why); continue; }
    const count = s.total(t);
    const cap = missionReq ? Math.max(nd.cap, 1) : nd.cap;
    if (count >= cap) { reject(t, `${count} already built or planned (justified: ${cap})`, need); continue; }
    if (s.time - (lastPlanned[t] ?? -999) < cooldownFor(t)) { reject(t, 'recently planned (cooldown)', need); continue; }

    // strategy focus: support / prerequisite policy decides whether an out-of-focus building is allowed
    const inFocus = roleAllowed(t, st);
    let requiresApproval = false;
    if (!inFocus && !missionReq) {
      if (ESSENTIAL_SUPPORT[st.strategy].includes(t)) requiresApproval = !st.allowPrerequisites; // support policy: automatic when on, a proposal when off
      else { reject(t, `${STRATEGIES.find(x => x.id === st.strategy)!.label} does not build ${BUILDING_ROLES[t][0].toLowerCase().replace('_', ' ')} structures`, need); continue; }
    }

    // prerequisites (data: requiredBuilding). Never silently violate the strategy: ask for approval instead.
    let pick: BuildingType = t;
    let prerequisiteFor: BuildingType | undefined;
    const pre = missingPrerequisite(t, s);
    if (pre.inProgress) {
      reject(t, s.unapproved.has(pre.inProgress) ? `waiting for your approval of prerequisite ${name(pre.inProgress)}` : `waiting for prerequisite ${name(pre.inProgress)} (in progress)`, need);
      continue;
    }
    if (pre.missing) {
      pick = pre.missing;
      prerequisiteFor = t;
      // A prerequisite outside the strategy's focus is never built silently: only the support policy (essential power etc.) can waive approval.
      const waived = roleAllowed(pre.missing, st) || (ESSENTIAL_SUPPORT[st.strategy].includes(pre.missing) && st.allowPrerequisites);
      requiresApproval = !waived && !missionReq;
      const preRej = st.rejected[pick];
      if (preRej !== undefined && preRej > s.time) { reject(t, `needs ${name(pick)}, which you rejected recently`, need); continue; }
      const preLimit = st.typeLimits[pick];
      if (!missionReq && preLimit !== undefined && s.total(pick) >= preLimit) { reject(t, `needs ${name(pick)}, but your limit for it is ${preLimit}`, need); continue; }
      if (s.time - (lastPlanned[pick] ?? -999) < cooldownFor(pick)) { reject(t, `needs ${name(pick)} first (recently planned)`, need); continue; }
      if (s.total(pick) > 0) { reject(t, `waiting for prerequisite ${name(pick)}`, need); continue; }
    }

    // power safety: a consumer must not push the projected grid into a deficit (power buildings are exempt)
    const cfg = BUILDING_CONFIGS[pick];
    if (cfg.powerConsumed > 0 && s.power.projectedSurplus - cfg.powerConsumed < 0 && pick !== 'power_plant') {
      if (!prerequisiteFor || prerequisiteFor !== t) {
        if (!powerBlocked || need > powerBlocked.need) powerBlocked = { type: pick, need };
        reject(t, `would exceed power supply (projected surplus ${Math.round(s.power.projectedSurplus)}, needs ${cfg.powerConsumed})`, need);
        continue;
      }
    }

    // Diminishing priority for duplicates: the closer the count is to what demand justifies, the lower the priority.
    const ratio = Math.min(1, count / Math.max(1, cap));
    const dupFactor = st.avoidDuplicates ? 1 - 0.7 * ratio : 1 - 0.3 * ratio;
    let score = need * roleWeight(t, st) * dupFactor;
    if (missionReq) score += 20;
    if (BUILDING_ROLES[t].includes('DEFENSE') && st.prioritizeDefense) score += 15;
    if (prerequisiteFor) score *= 0.9; // a prerequisite is slightly less urgent than the thing that needs it
    let reasonText = why;
    if (s.recentLosses.includes(t)) { score += 15; reasonText = `rebuilding after a recent loss: ${why}`; }
    if (score < minScoreFor(st)) { reject(t, `priority too low (${Math.round(score)}): ${why}`, need); continue; }

    out.push({ type: pick, verdict: 'chosen', score: Math.round(score), need, count: s.total(pick), reason: prerequisiteFor ? `${name(pick)} is required for ${name(prerequisiteFor)} (${why})` : reasonText, prerequisiteFor, requiresApproval, tier: tierFor(pick, s) });
  }

  // A wanted building blocked only by power is a reason to build power (otherwise the planner would deadlock
  // with a surplus that is above the margin but below what the next building needs).
  if (powerBlocked) {
    const pp: BuildingType = 'power_plant';
    const pc = s.counts[pp];
    const pendingPower = (pc?.building ?? 0) + (pc?.planned ?? 0);
    const allowed = roleAllowed(pp, st) || ESSENTIAL_SUPPORT[st.strategy].includes(pp);
    if (pendingPower === 0 && allowed && s.total(pp) < 12 && s.time - (lastPlanned[pp] ?? -999) >= cooldownFor(pp)) {
      out.push({
        type: pp, verdict: 'chosen', score: Math.round(powerBlocked.need * 0.95), need: powerBlocked.need, count: s.total(pp),
        reason: `${name(powerBlocked.type)} is wanted but the grid cannot carry it yet`,
        requiresApproval: !roleAllowed(pp, st) && !st.allowPrerequisites,
        tier: 2,
      });
    }
  }

  // one entry per picked type (a prerequisite may be requested by several wanted buildings): keep the best
  const best = new Map<BuildingType, CandidateEval>();
  for (const c of out.filter(x => x.verdict === 'chosen')) { const prev = best.get(c.type); if (!prev || c.score > prev.score) best.set(c.type, c); }
  const chosen = [...best.values()].sort((a, b) => Math.min(a.tier, 3) - Math.min(b.tier, 3) || b.score - a.score);
  const rejected = out.filter(x => x.verdict === 'rejected').sort((a, b) => b.need - a.need);
  return [...chosen, ...rejected];
}

// ───────────────────────── layout ─────────────────────────

export interface Site { x: number; y: number }

/**
 * Re-rank the engine's valid candidate sites for layout quality:
 *  - defenses spread around approaches and cover structures that are not covered yet, never stacked;
 *  - production grouped loosely (3-9 tiles) but with gaps; crowding is penalised everywhere;
 *  - economy and power prefer the protected side. Validity (terrain, overlap, exits) is still the engine's.
 */
export function pickSite(e: GameEngine, type: BuildingType, s: BaseSnapshot, candidates: { gridX: number; gridY: number; score: number }[], pendingSites: Site[]): Site | null {
  if (!candidates.length) return null;
  const ts = e.mapData.tileSize;
  const cfg = BUILDING_CONFIGS[type];
  const roles = BUILDING_ROLES[type];
  const mine = e.buildings.filter(b => b.faction === 'player' && b.hp > 0);
  const centreOf = (c: { gridX: number; gridY: number }) => ({ x: (c.gridX + cfg.size.width / 2) * ts, y: (c.gridY + cfg.size.height / 2) * ts });
  const others = [...mine.map(b => ({ x: b.pixelX, y: b.pixelY, type: b.type })), ...pendingSites.map(p => ({ x: (p.x + 0.5) * ts, y: (p.y + 0.5) * ts, type: 'power_plant' as BuildingType }))];
  const isDefense = roles.includes('DEFENSE') && type !== 'repair_bay' && type !== 'radar_station';
  const range = cfg.range ?? 0;

  let best: Site | null = null, bestScore = -Infinity;
  for (const c of candidates) {
    const p = centreOf(c);
    let sc = c.score * 0.35;
    const crowd = others.filter(o => Math.hypot(o.x - p.x, o.y - p.y) < ts * 3.2).length;
    sc -= crowd * 6;
    const ang = Math.atan2(p.y - s.hqPx.y, p.x - s.hqPx.x);
    const towardThreat = Math.max(...s.approachAngles.map(a => Math.cos(ang - a)));
    if (isDefense) {
      sc += towardThreat * 14;
      const sameDefense = others.filter(o => BUILDING_ROLES[o.type].includes('DEFENSE') && o.type !== 'repair_bay' && o.type !== 'radar_station' && Math.hypot(o.x - p.x, o.y - p.y) < Math.max(ts * 4, range * 0.6));
      sc -= sameDefense.length * 14; // spread: do not stack defenses on the same spot
      const valued = mine.filter(b => b.type === 'headquarters' || b.type === 'coin_generator' || b.type === 'vehicle_factory' || b.type === 'barracks' || b.type === 'power_plant');
      const gain = valued.filter(v => Math.hypot(v.pixelX - p.x, v.pixelY - p.y) <= range).length;
      sc += (valued.length ? gain / valued.length : 0) * 35;
    } else if (roles.includes('ARMY_PRODUCTION')) {
      const near = others.filter(o => BUILDING_ROLES[o.type].includes('ARMY_PRODUCTION')).map(o => Math.hypot(o.x - p.x, o.y - p.y) / ts);
      if (near.length) sc += near.some(d => d >= 3 && d <= 9) ? 10 : -4; // loosely grouped
    } else {
      sc -= towardThreat * 8; // economy, power and support sit on the protected side
    }
    const fromHq = Math.hypot(p.x - s.hqPx.x, p.y - s.hqPx.y) / ts;
    if (fromHq < 4) sc -= 8; // keep the space around the HQ free for exits and expansion
    if (sc > bestScore) { bestScore = sc; best = { x: c.gridX, y: c.gridY }; }
  }
  return best;
}
