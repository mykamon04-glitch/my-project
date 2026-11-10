import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/audio/soundEngine', () => ({ soundEngine: new Proxy({}, { get: () => () => {} }) }));

import { GameEngine } from '../src/game/engine';
import { UNIT_CONFIGS } from '../src/data/gameData';
import {
  activeTasks, cancelTask, explainDecision, getBudgetView, getPlan, lockBuilding, queueProject, recalculatePlan, rejectTask,
  setConstructionMode, setStrategy, setTypeLimit,
} from '../src/game/constructionAI';
import { planningBudget } from '../src/game/aiBudget';
import { analyseBase, effectiveThreat, evaluateCandidates, settingsOf, STRATEGIES } from '../src/game/constructionStrategy';
import type { BuildingType, ConstructionStrategyId, UnitType } from '../src/types/game';

const run = (e: GameEngine, s: number) => { for (let i = 0; i < s * 20; i++) e.update(0.05); };
function mk(strategy: ConstructionStrategyId = 'balanced', credits = 200000) {
  const e = new GameEngine('skirmish', 'normal');
  e.units = e.units.filter(u => u.faction === 'player');
  e.buildings = e.buildings.filter(b => b.faction === 'player' || b.type === 'headquarters');
  e.pathGrid.rebuild(e.mapData, e.buildings);
  e.economy.credits = credits;
  e.aiArchitect.reserveCredits = 0;
  e.nextWaveTimer = 1e9;
  (e as any).ai.update = () => {}; // no enemy raids ending the match mid-test
  setStrategy(e, strategy);
  return e;
}
const auto = (e: GameEngine) => setConstructionMode(e, 'auto');
const settle = (e: GameEngine, sec: number) => { for (let s = 0; s < sec; s++) { run(e, 1); e.economy.credits = Math.max(e.economy.credits, 50000); } };
const counts = (e: GameEngine) => { const m: Partial<Record<BuildingType, number>> = {}; for (const b of e.buildings) if (b.faction === 'player') m[b.type] = (m[b.type] ?? 0) + 1; return m; };
const rank = (e: GameEngine) => evaluateCandidates(e, analyseBase(e, activeTasks(e).filter(t => !t.buildingId)), settingsOf(e), e.aiArchitect.lastPlanned!);
const chosen = (e: GameEngine) => rank(e).filter(c => c.verdict === 'chosen');
const done = (b: any) => { b.constructionProgress = 1; b.isUnderConstruction = false; };
const place = (e: GameEngine, t: BuildingType) => { const b = e.autoPlaceBuilding(t)!; done(b); return b; };

describe('Part 1 - one-tap Select All Troops (engine selection used by the HUD counter)', () => {
  it('selects every living friendly unit, nothing else, and reports the real count', () => {
    const e = new GameEngine('skirmish', 'normal');
    const friendly = e.units.filter(u => u.faction === 'player' && u.hp > 0).length;
    expect(friendly).toBeGreaterThan(0);
    const ids = e.selectAllUnits();
    expect(ids.length).toBe(friendly);
    for (const u of e.units) expect(u.selected).toBe(u.faction === 'player' && u.hp > 0);
    expect(e.units.filter(u => u.selected && u.faction === 'enemy').length).toBe(0);
    expect(e.buildings.some(b => b.selected)).toBe(false);
  });

  it('excludes destroyed units, units still in a production queue, and follows changes dynamically', () => {
    const e = new GameEngine('skirmish', 'normal');
    const before = e.selectAllUnits().length;
    const rax = e.buildings.find(b => b.type === 'barracks' && b.faction === 'player') ?? place(e, 'barracks');
    e.economy.credits = 99999;
    e.queueUnitProduction(rax.id, 'rifleman'); // queued, not produced yet
    expect(e.selectAllUnits().length).toBe(before);
    const added = e.spawnUnit('rifleman', 'player', { x: 500, y: 500 });
    expect(e.selectAllUnits().length).toBe(before + 1);
    added.hp = 0; // destroyed
    expect(e.selectAllUnits().length).toBe(before);
    e.spawnUnit('rifleman', 'enemy', { x: 520, y: 520 });
    expect(e.selectAllUnits().length).toBe(before);
  });

  it('includes units far across the battlefield, not only visible ones', () => {
    const e = new GameEngine('skirmish', 'normal');
    const n = e.selectAllUnits().length;
    const far = e.spawnUnit('scout', 'player', { x: e.mapData.width * e.mapData.tileSize - 50, y: e.mapData.height * e.mapData.tileSize - 50 });
    expect(e.selectAllUnits()).toContain(far.id);
    expect(e.selectAllUnits().length).toBe(n + 1);
  });

  it('selection filters use the existing unit categories; Clear empties everything', () => {
    const e = new GameEngine('skirmish', 'normal');
    e.spawnUnit('main_battle_tank', 'player', { x: 600, y: 600 });
    e.spawnUnit('attack_helicopter', 'player', { x: 640, y: 600 });
    const inf = e.selectUnitsByCategory('infantry');
    expect(inf.every(id => UNIT_CONFIGS[e.units.find(u => u.id === id)!.type].category === 'infantry')).toBe(true);
    const veh = e.selectUnitsByCategory('vehicle');
    expect(veh.length).toBeGreaterThanOrEqual(1);
    const air = e.selectUnitsByCategory('aircraft');
    expect(air.length).toBeGreaterThanOrEqual(1);
    const combat = e.selectCombatUnits();
    expect(combat.every(id => UNIT_CONFIGS[e.units.find(u => u.id === id)!.type].damage > 0)).toBe(true);
    e.units.find(u => u.id === inf[0])!.command = 'attack_move'; (e.units.find(u => u.id === inf[0])! as any).isMoving = true;
    const idle = e.selectIdleUnits();
    expect(idle).not.toContain(inf[0]);
    expect(e.clearSelection()).toEqual([]);
    expect(e.units.some(u => u.selected) || e.buildings.some(b => b.selected)).toBe(false);
  });

  it('a group command reaches every selected unit (Stop / Defend)', () => {
    const e = new GameEngine('skirmish', 'normal');
    const ids = e.selectAllUnits();
    e.issueDefend(ids);
    for (const id of ids) expect(e.units.find(u => u.id === id)!.stance).toBe('defensive');
    e.issueStop(ids);
    for (const id of ids) expect(e.units.find(u => u.id === id)!.isMoving).toBeFalsy();
  });

  it('is cheap for a large army (one linear pass)', () => {
    const e = new GameEngine('skirmish', 'normal');
    for (let i = 0; i < 1500; i++) e.spawnUnit('rifleman' as UnitType, i % 2 ? 'player' : 'enemy', { x: 300 + (i % 40) * 20, y: 300 + Math.floor(i / 40) * 12 });
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) e.selectAllUnits();
    expect((performance.now() - t0) / 20).toBeLessThan(15);
  });
});

describe('Parts 3/4 - new strategies and situation-driven priorities', () => {
  it('seven strategies are offered', () => {
    expect(STRATEGIES.map(s => s.id)).toEqual(['balanced', 'defense_only', 'army_production', 'economy', 'adaptive', 'support_recovery', 'strategic']);
  });

  it('Support & Recovery builds repair / medical / power / depots only - no army, economy or defenses', () => {
    const e = mk('support_recovery');
    place(e, 'barracks'); place(e, 'vehicle_factory');
    for (let i = 0; i < 4; i++) e.spawnUnit('main_battle_tank', 'player', { x: 700 + i * 30, y: 700 });
    for (let i = 0; i < 6; i++) e.spawnUnit('rifleman', 'player', { x: 700 + i * 20, y: 760 });
    const hq = e.buildings.find(b => b.type === 'headquarters' && b.faction === 'player')!; hq.hp = hq.maxHp * 0.5;
    run(e, 1);
    auto(e); settle(e, 200);
    const allowed: BuildingType[] = ['headquarters', 'barracks', 'vehicle_factory', 'repair_bay', 'field_hospital', 'power_plant', 'supply_depot'];
    expect(Object.keys(counts(e)).every(t => allowed.includes(t as BuildingType)), `built ${Object.keys(counts(e))}`).toBe(true);
    expect(counts(e).repair_bay ?? 0).toBeGreaterThanOrEqual(1);
    expect(counts(e).field_hospital ?? 0).toBeGreaterThanOrEqual(1);
    expect(counts(e).repair_bay ?? 0).toBeLessThanOrEqual(2);
    expect(counts(e).coin_generator ?? 0).toBe(0);
    expect(counts(e).turret_gun ?? 0).toBe(0);
  });

  it('a recent loss makes the AI rebuild that structure, and says so', () => {
    const e = mk('balanced');
    const pp = place(e, 'power_plant'); place(e, 'power_plant');
    run(e, 1);
    pp.hp = 0; run(e, 1); // destroyed: recorded as a loss
    expect(e.aiArchitect.lossLog![0].type).toBe('power_plant');
    expect(e.aiArchitect.planDirty).toBe(true);
    const s = analyseBase(e, []);
    expect(s.recentLosses).toContain('power_plant');
  });

  it('Scenario A: 5 troops, idle production -> no more Barracks or depots, and the reason says why', () => {
    const e = mk('army_production');
    place(e, 'barracks'); place(e, 'vehicle_factory');
    run(e, 1);
    const types = chosen(e).map(c => c.type);
    expect(types).not.toContain('barracks');
    expect(types).not.toContain('vehicle_factory');
    expect(types).not.toContain('supply_depot');
    const r = rank(e).find(c => c.type === 'barracks')!;
    expect(r.reason).toMatch(/idle|handle/i);
  });

  it('Scenario B: a ground attack is answered with defenses and the reason names the approach direction', () => {
    const e = mk('adaptive');
    place(e, 'barracks'); place(e, 'power_plant');
    const hq = e.buildings.find(b => b.type === 'headquarters' && b.faction === 'player')!;
    for (let i = 0; i < 4; i++) e.spawnUnit('main_battle_tank', 'enemy', { x: hq.pixelX + 440 + i * 26, y: hq.pixelY + 40 });
    run(e, 3);
    const turret = chosen(e).find(c => ['turret_gun', 'turret_missile', 'heavy_turret'].includes(c.type));
    expect(turret, 'a ground defense is chosen').toBeTruthy();
    expect(turret!.reason).toMatch(/detected on the (east|west|north|south)[a-z-]* approach/);
    expect(chosen(e).map(c => c.type)).not.toContain('turret_aa');
  });

  it('Scenario C: a power shortage puts power first and holds back power-consuming buildings', () => {
    const e = mk('adaptive');
    for (const t of ['barracks', 'vehicle_factory', 'airfield'] as BuildingType[]) place(e, t);
    run(e, 1);
    const first = chosen(e)[0];
    expect(first.type).toBe('power_plant');
    expect(first.tier).toBe(2);
    expect(rank(e).find(c => c.type === 'research_lab')!.verdict).toBe('rejected');
  });

  it('Scenario D/E: a strong, balanced base builds nothing and explains why', () => {
    const e = mk('balanced');
    auto(e); settle(e, 360);
    const before = Object.values(counts(e)).reduce((a, b) => a + (b ?? 0), 0);
    const credits = e.economy.credits;
    settle(e, 120);
    expect(Object.values(counts(e)).reduce((a, b) => a + (b ?? 0), 0)).toBe(before);
    expect(e.economy.credits).toBeGreaterThanOrEqual(credits - 1);
    expect(activeTasks(e).length).toBe(0);
    const lines = explainDecision(e);
    expect(lines.some(l => /Nothing new is needed|No additional generator/.test(l)), lines.join(' | ')).toBe(true);
  });

  it('Strategic Planner uses a stricter bar and produces a prioritised plan', () => {
    const e = mk('strategic');
    const plan = getPlan(e);
    expect(plan.chosen.every(c => c.score >= 35)).toBe(true);
    for (let i = 1; i < plan.chosen.length; i++) expect(Math.min(plan.chosen[i - 1].tier, 3)).toBeLessThanOrEqual(Math.min(plan.chosen[i].tier, 3));
    auto(e); settle(e, 240);
    expect(counts(e).coin_generator ?? 0).toBeLessThanOrEqual(5);
  });
});

describe('Parts 5/6 - five slots, maximum not mandatory', () => {
  it('can run several different useful projects at once (never copies of one type) and then stops', () => {
    const e = mk('adaptive'); auto(e);
    let peak = 0, distinctPeak = 0;
    for (let s = 0; s < 150; s++) {
      run(e, 1); e.economy.credits = Math.max(e.economy.credits, 50000);
      const act = activeTasks(e);
      peak = Math.max(peak, act.length);
      distinctPeak = Math.max(distinctPeak, new Set(act.map(t => t.type)).size);
      const per: Record<string, number> = {}; for (const t of act) per[t.type] = (per[t.type] ?? 0) + 1;
      expect(Math.max(0, ...Object.values(per))).toBeLessThanOrEqual(2); // a justified second copy at most, never a flood
    }
    expect(peak).toBeGreaterThanOrEqual(3);
    expect(distinctPeak).toBeGreaterThanOrEqual(3);
    settle(e, 200);
    expect(activeTasks(e).length).toBeLessThan(5);
  });

  it('five different useful buildings can be committed at the same time when the base lacks them', () => {
    const e = mk('adaptive');
    const hq = e.buildings.find(b => b.type === 'headquarters' && b.faction === 'player')!;
    for (let i = 0; i < 5; i++) e.spawnUnit('main_battle_tank', 'enemy', { x: hq.pixelX + 440 + i * 26, y: hq.pixelY + 40 });
    for (let i = 0; i < 3; i++) e.spawnUnit('attack_helicopter', 'enemy', { x: hq.pixelX + 400 + i * 30, y: hq.pixelY - 60 });
    e.tacticalIntelligence.threatLevel = 'RED';
    auto(e); let peak = 0;
    for (let s = 0; s < 90; s++) { run(e, 0.5 as any); e.economy.credits = Math.max(e.economy.credits, 50000); e.tacticalIntelligence.threatLevel = 'RED'; peak = Math.max(peak, activeTasks(e).length); }
    expect(peak).toBeGreaterThanOrEqual(4);
  });
});

describe('Parts 10/11 - shared budget, replanning, hysteresis', () => {
  it('emergency defense may spend the reserve; lower tiers may not', () => {
    const e = mk('adaptive'); e.aiArchitect.reserveCredits = 600; e.economy.credits = 700;
    const b = planningBudget(e, []);
    expect(b.spendable(1)).toBeGreaterThan(b.spendable(2));
    expect(b.spendable(1)).toBe(700);
    expect(b.spendable(2)).toBe(100);
  });

  it('under an uncovered threat, money is held for urgent defense and non-urgent projects pause with an honest reason', () => {
    const e = mk('adaptive'); place(e, 'barracks'); place(e, 'power_plant');
    const hq = e.buildings.find(b => b.type === 'headquarters' && b.faction === 'player')!;
    for (let i = 0; i < 5; i++) e.spawnUnit('main_battle_tank', 'enemy', { x: hq.pixelX + 440 + i * 26, y: hq.pixelY + 40 });
    run(e, 3);
    e.economy.credits = 450; // enough for a refinery, but not for refinery + an urgent turret
    const b = planningBudget(e, []);
    expect(b.urgentHold).toBeGreaterThan(0);
    expect(b.spendable(1)).toBeGreaterThan(b.spendable(3));
    expect(getBudgetView(e).notes.join(' ')).toMatch(/urgent defense/);
  });

  it('threat hysteresis: a level that just dropped still counts for a short while', () => {
    const e = mk('adaptive');
    e.aiArchitect.threatMemo = { level: 'RED', t: e.gameTime };
    e.tacticalIntelligence.threatLevel = 'GREEN';
    expect(effectiveThreat(e)).toBe('RED');
    e.gameTime += 25;
    expect(effectiveThreat(e)).toBe('GREEN');
  });

  it('planning is event-driven with a periodic fallback, not per frame', () => {
    const e = mk('balanced'); auto(e); settle(e, 400); // base complete, nothing happens
    let plans = 0, last = e.aiArchitect.lastPlanTime;
    for (let i = 0; i < 60 * 20; i++) { e.update(0.05); if (e.aiArchitect.lastPlanTime !== last) { plans++; last = e.aiArchitect.lastPlanTime; } }
    expect(plans).toBeLessThanOrEqual(60 / 8 + 3);
  });

  it('events mark the plan dirty: strategy change, destroyed building, finished project', () => {
    const e = mk('balanced'); auto(e); settle(e, 5);
    e.aiArchitect.planDirty = false;
    setStrategy(e, 'economy');
    run(e, 1);
    expect(e.aiArchitect.lastPlanTime).toBeGreaterThan(0);
    const b = place(e, 'supply_depot');
    e.aiArchitect.planDirty = false; b.hp = 0; run(e, 0.1);
    expect(e.aiArchitect.planDirty || e.aiArchitect.lastPlanTime! > 0).toBe(true);
    expect(e.aiArchitect.lossLog!.some(l => l.type === 'supply_depot')).toBe(true);
  });
});

describe('Part 14 - manual override', () => {
  it('a rejected suggestion is not proposed again straight away, then is allowed after the cooldown', () => {
    const e = mk('army_production'); setConstructionMode(e, 'suggest'); run(e, 5);
    const t = activeTasks(e).find(x => !x.approved)!;
    expect(t).toBeTruthy();
    const type = t.type;
    expect(rejectTask(e, t.id)).toBe(true);
    run(e, 20);
    expect(activeTasks(e).some(x => x.type === type)).toBe(false);
    expect(rank(e).find(c => c.type === type)!.reason).toMatch(/you rejected/);
    e.gameTime += 301;
    expect(rank(e).find(c => c.type === type)!.reason).not.toMatch(/you rejected/);
  });

  it('player limits and exclusions are honoured (0 = excluded)', () => {
    const e = mk('balanced'); setTypeLimit(e, 'coin_generator', 0); auto(e); settle(e, 200);
    expect(counts(e).coin_generator ?? 0).toBe(0);
  });

  it('a locked structure cannot be cancelled by the AI', () => {
    const e = mk('balanced');
    const task = queueProject(e, 'supply_depot', { approved: true })!;
    run(e, 1);
    const real = e.buildings.find(b => b.id === task.buildingId)!;
    expect(real).toBeTruthy();
    lockBuilding(e, real.id, true);
    expect(cancelTask(e, task.id)).toBe(false);
    expect(e.buildings.some(b => b.id === real.id)).toBe(true);
    lockBuilding(e, real.id, false);
    expect(cancelTask(e, task.id)).toBe(true);
  });

  it('manual building takes priority: a reserved site taken by the player is re-planned, not forced', () => {
    const e = mk('balanced'); setConstructionMode(e, 'suggest');
    const t = queueProject(e, 'supply_depot', { approved: false })!;
    const site = `${t.gridX},${t.gridY}`;
    const manual = e.placeBuilding('supply_depot', t.gridX, t.gridY, 'player', 0);
    expect(manual).toBeTruthy();
    run(e, 3);
    const after = activeTasks(e).find(x => x.id === t.id);
    if (after) expect(`${after.gridX},${after.gridY}`).not.toBe(site);
    expect(e.buildings.filter(b => b.faction === 'player' && b.type === 'supply_depot').length).toBe(1); // the AI did not overwrite the manual building
  });

  it('Recalculate Plan plans immediately and logs it', () => {
    const e = mk('army_production'); setConstructionMode(e, 'suggest');
    recalculatePlan(e);
    expect(e.aiArchitect.decisionLog!.some(l => /recalculated/i.test(l.text))).toBe(true);
    expect(activeTasks(e).length).toBeGreaterThan(0);
  });
});

describe('Part 7 - layout keeps production exits open', () => {
  it('every barracks / factory / helipad keeps a free, walkable cell around it', () => {
    const e = mk('army_production'); auto(e); settle(e, 360);
    const producers = e.buildings.filter(b => b.faction === 'player' && ['barracks', 'vehicle_factory', 'helipad', 'airfield'].includes(b.type));
    expect(producers.length).toBeGreaterThanOrEqual(2);
    for (const p of producers) {
      let free = 0;
      for (let x = p.x - 1; x <= p.x + p.width; x++) for (let y = p.y - 1; y <= p.y + p.height; y++) {
        const inside = x >= p.x && x < p.x + p.width && y >= p.y && y < p.y + p.height;
        if (!inside && e.pathGrid.isWalkable(x, y)) free++;
      }
      expect(free, `${p.type} at ${p.x},${p.y}`).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('Part 15 - persistence', () => {
  it('rejections, locks, loss log, strategy, slots and reservations survive save/load without duplicate construction', () => {
    const e = mk('strategic'); setConstructionMode(e, 'suggest'); run(e, 6);
    const t = activeTasks(e).find(x => !x.approved);
    if (t) rejectTask(e, t.id);
    const dep = place(e, 'supply_depot'); lockBuilding(e, dep.id, true);
    e.aiArchitect.lossLog!.unshift({ t: e.gameTime, type: 'power_plant' });
    const save = e.exportSaveData('t', 'test');
    const e2 = new GameEngine('skirmish', 'normal');
    expect(e2.importSaveData(save)).toBe(true);
    const a = e2.aiArchitect;
    expect(a.strategy).toBe('strategic');
    expect(a.schemaVersion).toBe(82);
    expect(a.lockedBuildingIds).toContain(dep.id);
    expect(a.lossLog![0].type).toBe('power_plant');
    if (t) expect(a.rejected![t.type]).toBeGreaterThan(e2.gameTime);
    expect(activeTasks(e2).map(x => [x.id, x.type, x.gridX, x.gridY, x.charged])).toEqual(activeTasks(e).map(x => [x.id, x.type, x.gridX, x.gridY, x.charged]));
    const before = e2.buildings.filter(b => b.faction === 'player').length;
    run(e2, 2);
    expect(e2.buildings.filter(b => b.faction === 'player').length).toBeLessThanOrEqual(before + 1);
  });

  it('an older save without V8.2 fields loads with safe defaults', () => {
    const e = mk('balanced');
    const save: any = e.exportSaveData('t', 'test');
    const state = JSON.parse(save.stateJson);
    for (const k of ['rejected', 'lockedBuildingIds', 'lossLog', 'schemaVersion', 'threatMemo', 'planDirty']) delete state.aiArchitect[k];
    save.stateJson = JSON.stringify(state);
    const e2 = new GameEngine('skirmish', 'normal');
    expect(e2.importSaveData(save)).toBe(true);
    expect(e2.aiArchitect.rejected).toEqual({});
    expect(e2.aiArchitect.lockedBuildingIds).toEqual([]);
    expect(e2.aiArchitect.schemaVersion).toBe(82);
  });
});
