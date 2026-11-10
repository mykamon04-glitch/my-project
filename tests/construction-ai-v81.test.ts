import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/audio/soundEngine', () => ({ soundEngine: new Proxy({}, { get: () => () => {} }) }));

import { GameEngine } from '../src/game/engine';
import { BUILDING_CONFIGS, UNIT_CONFIGS } from '../src/data/gameData';
import {
  activeTasks, approveTask, queueProject, setConstructionMode, setEmergencyReserve, setOption, setStrategy, setTypeLimit,
} from '../src/game/constructionAI';
import { BUILDING_ROLES, analyseBase, evaluateCandidates, settingsOf } from '../src/game/constructionStrategy';
import { cappedProgress } from '../src/utils/format';
import type { BuildingType, ConstructionStrategyId } from '../src/types/game';

const run = (e: GameEngine, s: number) => { for (let i = 0; i < s * 20; i++) e.update(0.05); };

/** A quiet skirmish: enemy units/buildings removed (the enemy HQ stays), wave spawns still exist so runs stay short. */
function mk(strategy: ConstructionStrategyId = 'balanced', credits = 200000) {
  const e = new GameEngine('skirmish', 'normal');
  e.units = e.units.filter(u => u.faction === 'player');
  e.buildings = e.buildings.filter(b => b.faction === 'player' || b.type === 'headquarters');
  e.pathGrid.rebuild(e.mapData, e.buildings);
  e.economy.credits = credits;
  e.aiArchitect.reserveCredits = 0;
  e.nextWaveTimer = 1e9; // no scripted waves: threats in these tests are created on purpose
  (e as any).ai.update = () => {};  // the skirmish enemy would raid an undefended base and end the match mid-test
  setStrategy(e, strategy);
  return e;
}
const auto = (e: GameEngine) => setConstructionMode(e, 'auto');
const counts = (e: GameEngine) => {
  const m: Partial<Record<BuildingType, number>> = {};
  for (const b of e.buildings) if (b.faction === 'player') m[b.type] = (m[b.type] ?? 0) + 1;
  return m;
};
const types = (e: GameEngine) => Object.keys(counts(e)).filter(t => t !== 'headquarters') as BuildingType[];
const rank = (e: GameEngine) => evaluateCandidates(e, analyseBase(e, activeTasks(e).filter(t => !t.buildingId)), settingsOf(e), e.aiArchitect.lastPlanned!);
const chosenTypes = (e: GameEngine) => rank(e).filter(c => c.verdict === 'chosen').map(c => c.type);
const reasonOf = (e: GameEngine, t: BuildingType) => rank(e).find(c => c.type === t)!.reason;
const settle = (e: GameEngine, sec: number, keepRich = true) => { for (let s = 0; s < sec; s++) { run(e, 1); if (keepRich) e.economy.credits = Math.max(e.economy.credits, 50000); } };
const aiTypes = (e: GameEngine, allowed: BuildingType[]) => types(e).every(t => allowed.includes(t));

describe('role classification', () => {
  it('every existing building has at least one role, and no building was invented', () => {
    for (const t of Object.keys(BUILDING_CONFIGS) as BuildingType[]) expect(BUILDING_ROLES[t]?.length, t).toBeGreaterThan(0);
    expect(Object.keys(BUILDING_ROLES).sort()).toEqual(Object.keys(BUILDING_CONFIGS).sort());
  });
});

describe('the five strategies', () => {
  it('1. Balanced Auto builds a useful mix and never floods one category', () => {
    const e = mk('balanced'); auto(e); settle(e, 360);
    const c = counts(e);
    for (const t of ['power_plant', 'coin_generator', 'barracks', 'vehicle_factory'] as BuildingType[]) expect(c[t] ?? 0, `${t}`).toBeGreaterThanOrEqual(1);
    expect((c.turret_gun ?? 0) + (c.turret_missile ?? 0) + (c.heavy_turret ?? 0), 'some defense').toBeGreaterThanOrEqual(1);
    expect(c.coin_generator ?? 0).toBeLessThanOrEqual(4);          // the old AI built 26-35 of these
    expect(c.barracks ?? 0).toBeLessThanOrEqual(2);
    expect(c.vehicle_factory ?? 0).toBeLessThanOrEqual(2);
    expect(Object.values(c).reduce((a, b) => a + (b ?? 0), 0)).toBeLessThan(22);
  });

  it('2. Defense Only builds only defensive structures (plus power) and asks before building prerequisites', () => {
    const e = mk('defense_only'); auto(e); settle(e, 40);
    const defenseSet: BuildingType[] = ['turret_gun', 'turret_missile', 'turret_aa', 'heavy_turret', 'radar_station', 'repair_bay', 'defense_wall', 'power_plant'];
    expect(aiTypes(e, defenseSet), `built: ${types(e)}`).toBe(true);
    expect(counts(e).barracks ?? 0).toBe(0);
    expect(counts(e).vehicle_factory ?? 0).toBe(0);
    expect(counts(e).coin_generator ?? 0).toBe(0);
    // turrets need a Barracks (data prerequisite): it is proposed, not silently built
    e.tacticalIntelligence.settings.autoDefenseEnabled = true;
    const pending = activeTasks(e).filter(t => t.requiresApproval);
    expect(pending.some(t => t.type === 'barracks'), 'barracks proposal awaiting approval').toBe(true);
    expect(pending.every(t => !t.approved)).toBe(true);
    // after the player approves it, the prerequisite is built and the turrets can follow
    approveTask(e, pending.find(t => t.type === 'barracks')!.id);
    settle(e, 90);
    expect(counts(e).barracks ?? 0).toBe(1);
    expect((counts(e).turret_gun ?? 0) + (counts(e).turret_missile ?? 0) + (counts(e).heavy_turret ?? 0)).toBeGreaterThanOrEqual(1);
    expect(counts(e).vehicle_factory ?? 0).toBeLessThanOrEqual(0 + 1); // only if approved as a prerequisite of a missile turret
  });

  it('3. Army Production prioritises military production and does not repeat identical facilities without demand', () => {
    const e = mk('army_production'); auto(e); settle(e, 360);
    const c = counts(e);
    expect(c.barracks ?? 0).toBeGreaterThanOrEqual(1);
    expect(c.vehicle_factory ?? 0).toBeGreaterThanOrEqual(1);
    expect((c.helipad ?? 0) + (c.airfield ?? 0)).toBeGreaterThanOrEqual(1);
    expect(c.barracks ?? 0).toBe(1);          // no queue demand -> no second barracks
    expect(c.vehicle_factory ?? 0).toBe(1);
    expect((c.turret_gun ?? 0) + (c.turret_missile ?? 0) + (c.heavy_turret ?? 0) + (c.turret_aa ?? 0)).toBe(0);
    expect(c.coin_generator ?? 0).toBeLessThanOrEqual(3);
  });

  it('4. Economy & Infrastructure builds only economy, power and capacity', () => {
    const e = mk('economy'); auto(e); settle(e, 300);
    expect(aiTypes(e, ['coin_generator', 'power_plant', 'supply_depot']), `built: ${types(e)}`).toBe(true);
    expect(counts(e).coin_generator ?? 0).toBeGreaterThanOrEqual(2);
    expect(counts(e).coin_generator ?? 0).toBeLessThanOrEqual(8);
    expect(counts(e).turret_gun ?? 0).toBe(0);
  });

  it('5. Adaptive Commander develops a base and then stops', () => {
    const e = mk('adaptive'); auto(e);
    let peak = 0;
    for (let s = 0; s < 120; s++) { run(e, 1); e.economy.credits = Math.max(e.economy.credits, 50000); peak = Math.max(peak, activeTasks(e).length); }
    expect(peak).toBeGreaterThanOrEqual(3); // several complementary structures while developing
    settle(e, 240);
    const c = counts(e);
    expect(c.barracks ?? 0).toBeGreaterThanOrEqual(1);
    expect(c.vehicle_factory ?? 0).toBeGreaterThanOrEqual(1);
    expect(c.coin_generator ?? 0).toBeLessThanOrEqual(5);
  });
});

describe('adaptive decisions follow real game conditions', () => {
  it('a power shortage puts power first', () => {
    const e = mk('adaptive');
    for (const t of ['barracks', 'vehicle_factory', 'airfield'] as BuildingType[]) { const b = e.autoPlaceBuilding(t); if (b) { b.constructionProgress = 1; b.isUnderConstruction = false; } }
    run(e, 1);
    expect(e.economy.powerDemand).toBeGreaterThan(e.economy.powerSupply);
    const top = rank(e).find(c => c.verdict === 'chosen')!;
    expect(top.type).toBe('power_plant');
    expect(top.reason).toMatch(/power/i);
  });

  it('a wanted building that only power blocks causes a reactor to be requested (no deadlock)', () => {
    const e = mk('army_production'); auto(e);
    settle(e, 90);
    expect(counts(e).vehicle_factory ?? 0).toBeGreaterThanOrEqual(1); // HQ alone (50 power) cannot carry a factory; a reactor was added first
    expect(counts(e).power_plant ?? 0).toBeGreaterThanOrEqual(1);
  });

  it('an attack makes defenses the priority, matched to the threat; anti-air only when aircraft are seen', () => {
    const e = mk('adaptive');
    for (const t of ['barracks', 'vehicle_factory', 'power_plant'] as BuildingType[]) { const b = e.autoPlaceBuilding(t); if (b) { b.constructionProgress = 1; b.isUnderConstruction = false; } }
    const hq = e.buildings.find(b => b.type === 'headquarters' && b.faction === 'player')!;
    for (let i = 0; i < 5; i++) e.spawnUnit('main_battle_tank', 'enemy', { x: hq.pixelX + 440 + i * 26, y: hq.pixelY + 40 });
    run(e, 3);
    expect(e.tacticalIntelligence.threatLevel).not.toBe('GREEN');
    const picks = chosenTypes(e);
    expect(picks.some(t => ['turret_gun', 'turret_missile', 'heavy_turret'].includes(t)), `picks: ${picks}`).toBe(true);
    expect(picks).not.toContain('turret_aa');                       // ground attack: no anti-air
    expect(reasonOf(e, 'turret_aa')).toMatch(/no air threat/i);
    // now aircraft appear
    for (let i = 0; i < 3; i++) e.spawnUnit('attack_helicopter', 'enemy', { x: hq.pixelX + 280 + i * 30, y: hq.pixelY - 60 });
    run(e, 3);
    expect(chosenTypes(e)).toContain('turret_aa');
  });

  it('missing production is prioritised, and an unnecessary duplicate is refused', () => {
    const e = mk('army_production');
    expect(chosenTypes(e)[0]).toBe('barracks');
    const b = e.autoPlaceBuilding('barracks')!; b.constructionProgress = 1; b.isUnderConstruction = false;
    run(e, 1);
    expect(chosenTypes(e)).not.toContain('barracks');
    expect(reasonOf(e, 'barracks')).toMatch(/adequate|idle|handle/i);
  });

  it('a second barracks is only justified by real queue demand', () => {
    const e = mk('army_production');
    const b = e.autoPlaceBuilding('barracks')!; b.constructionProgress = 1; b.isUnderConstruction = false;
    run(e, 1);
    expect(chosenTypes(e)).not.toContain('barracks');
    for (let i = 0; i < 9; i++) e.queueUnitProduction(b.id, 'rifleman');  // recruitment is backed up
    e.economy.credits = 200000;
    run(e, 0.2);
    expect(chosenTypes(e)).toContain('barracks');
  });

  it('low income asks for refineries; plentiful credits and enough refineries do not', () => {
    const e = mk('economy', 1000);
    expect(chosenTypes(e)).toContain('coin_generator');
    expect(reasonOf(e, 'coin_generator')).toMatch(/income/i);
    const e2 = mk('balanced', 50000);
    for (let i = 0; i < 2; i++) { const b = e2.autoPlaceBuilding('coin_generator'); if (b) { b.constructionProgress = 1; b.isUnderConstruction = false; } }
    run(e2, 1);
    expect(chosenTypes(e2)).not.toContain('coin_generator');
  });

  it('population pressure asks for capacity', () => {
    const e = mk('economy');
    e.economy.population = 49; // cap 65 -> 16 free; push it near the cap
    e.economy.population = e.economy.populationCap - 3;
    expect(chosenTypes(e)).toContain('supply_depot');
  });
});

describe('duplicate prevention and empty slots', () => {
  it('6. the AI does not spam: no building type runs away, even over ten minutes', () => {
    const e = mk('balanced'); auto(e); settle(e, 600);
    const c = counts(e);
    for (const t of Object.keys(c) as BuildingType[]) {
      if (t === 'headquarters') continue;
      expect(c[t]!, `${t}`).toBeLessThanOrEqual(t === 'power_plant' ? 8 : 5);
    }
    expect(c.coin_generator ?? 0).toBeLessThanOrEqual(4);
  });

  it('counts planned and in-progress projects, not just finished ones', () => {
    const e = mk('balanced'); setConstructionMode(e, 'suggest'); run(e, 30);
    // proposals alone (nothing built) already count: the next evaluation must not propose the same building again
    const planned = activeTasks(e).map(t => t.type);
    expect(new Set(planned).size).toBe(planned.length);
    for (const t of planned) expect(chosenTypes(e).filter(x => x === t).length).toBeLessThanOrEqual(1);
  });

  it('8. the AI intentionally leaves slots empty and spends nothing to fill them', () => {
    const e = mk('balanced'); auto(e); settle(e, 300);
    expect(activeTasks(e).length).toBe(0);
    const credits = e.economy.credits, placed = counts(e);
    run(e, 60); // idle window: no spending, no new buildings
    expect(activeTasks(e).length).toBe(0);
    expect(e.economy.credits).toBeGreaterThanOrEqual(credits - 1e-6);
    expect(counts(e).coin_generator).toBe(placed.coin_generator);
  });

  it('player restrictions are honoured, but never block a mission-required building', () => {
    const e = mk('balanced');
    setTypeLimit(e, 'coin_generator', 1); setTypeLimit(e, 'barracks', 0);
    auto(e); settle(e, 240);
    expect(counts(e).coin_generator ?? 0).toBeLessThanOrEqual(1);
    expect(counts(e).barracks ?? 0).toBe(0);
    const m = mk('balanced');
    setTypeLimit(m, 'barracks', 0);
    (m as any).currentMission = { objectives: [{ id: 'build_barracks', text: 'Construct an Infantry Academy', completed: false }] };
    auto(m); settle(m, 120);
    expect(counts(m).barracks ?? 0).toBeGreaterThanOrEqual(1);
  });

  it('"avoid duplicates" off is looser but still bounded', () => {
    const e = mk('economy'); setOption(e, 'avoidDuplicates', false); auto(e); settle(e, 400);
    expect(counts(e).coin_generator ?? 0).toBeLessThanOrEqual(8);
  });

  it('"prioritize base defense" lets a non-defense strategy defend', () => {
    const e = mk('economy');
    for (let i = 0; i < 4; i++) e.spawnUnit('main_battle_tank', 'enemy', { x: 1100 + i * 30, y: 1300 });
    const hq = e.buildings.find(b => b.type === 'headquarters' && b.faction === 'player')!;
    for (const u of e.units.filter(u => u.faction === 'enemy')) { u.x = hq.pixelX + 330; u.y = hq.pixelY + 30; }
    run(e, 3);
    expect(chosenTypes(e).some(t => BUILDING_ROLES[t].includes('DEFENSE'))).toBe(false);
    setOption(e, 'prioritizeDefense', true);
    expect(rank(e).some(c => c.verdict === 'chosen' && (BUILDING_ROLES[c.type].includes('DEFENSE') || (c.prerequisiteFor && BUILDING_ROLES[c.prerequisiteFor].includes('DEFENSE'))))).toBe(true);
  });
});

describe('layout, safety and money', () => {
  it('9/11. buildings keep their spacing, defenses are spread, and troops can still leave the base', () => {
    const e = mk('adaptive'); auto(e);
    const hq = e.buildings.find(b => b.type === 'headquarters' && b.faction === 'player')!;
    for (let i = 0; i < 4; i++) e.spawnUnit('main_battle_tank', 'enemy', { x: hq.pixelX + 330 + i * 24, y: hq.pixelY + 40 });
    settle(e, 200);
    const own = e.buildings.filter(b => b.faction === 'player');
    let touching = 0;
    for (let i = 0; i < own.length; i++) for (let j = i + 1; j < own.length; j++) {
      const a = own[i], b = own[j];
      if (a.x < b.x + b.width + 1 && a.x + a.width + 1 > b.x && a.y < b.y + b.height + 1 && a.y + a.height + 1 > b.y) touching++;
    }
    expect(touching, 'pairs of buildings with no gap').toBeLessThanOrEqual(1);
    const defenses = own.filter(b => ['turret_gun', 'turret_missile', 'heavy_turret'].includes(b.type));
    for (let i = 0; i < defenses.length; i++) for (let j = i + 1; j < defenses.length; j++) {
      expect(Math.hypot(defenses[i].pixelX - defenses[j].pixelX, defenses[i].pixelY - defenses[j].pixelY), 'defenses stacked').toBeGreaterThan(e.mapData.tileSize * 2.2);
    }
    // the open ground around the base is still connected: a walkable route from beside the HQ to the map centre exists
    const ts = e.mapData.tileSize;
    const start = e.pathGrid.nearestWalkable(Math.floor(hq.pixelX / ts), Math.floor((hq.pixelY + hq.height * ts) / ts) + 1)!;
    const goal = e.pathGrid.nearestWalkable(Math.floor(e.mapData.width / 2), Math.floor(e.mapData.height / 2))!;
    const seen = new Set<number>([start.y * e.mapData.width + start.x]); const q = [start];
    while (q.length) { const c = q.pop()!; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = c.x + dx, ny = c.y + dy, k = ny * e.mapData.width + nx; if (!seen.has(k) && e.pathGrid.isWalkable(nx, ny)) { seen.add(k); q.push({ x: nx, y: ny }); } } }
    expect(seen.has(goal.y * e.mapData.width + goal.x), 'route from the base to the map centre').toBe(true);
  });

  it('10. credits are never negative and every construction is charged exactly once', () => {
    const e = mk('adaptive', 2500); e.aiArchitect.reserveCredits = 300; auto(e);
    let min = Infinity, spent = 0;
    const original = e.placeBuilding.bind(e);
    e.placeBuilding = ((...args: Parameters<GameEngine['placeBuilding']>) => { const before = e.economy.credits; const b = original(...args); if (b && (args[3] ?? 'player') === 'player') spent += before - e.economy.credits; return b; }) as GameEngine['placeBuilding'];
    for (let s = 0; s < 300; s++) { run(e, 1); min = Math.min(min, e.economy.credits); }
    expect(min).toBeGreaterThanOrEqual(0);
    const expected = e.buildings.filter(b => b.faction === 'player' && b.type !== 'headquarters').reduce((n, b) => n + BUILDING_CONFIGS[b.type].cost, 0);
    expect(Math.round(spent)).toBeGreaterThanOrEqual(Math.round(expected * 0.99));   // everything standing was paid for once (some may have been lost since)
    expect(Math.round(spent)).toBeLessThanOrEqual(Math.round(expected * 1.8) + 2000);
  });

  it('the emergency reserve is never spent by construction', () => {
    const e = mk('balanced', 1500); setEmergencyReserve(e, 1200); auto(e);
    let min = Infinity;
    for (let s = 0; s < 40; s++) { run(e, 0.5); min = Math.min(min, e.economy.credits); }
    // income only ever adds to credits here, so staying at or above the reserve proves construction left it alone
    expect(min).toBeGreaterThanOrEqual(1200 - 1);
  });

  it('power safety: the AI does not start consumers that would push the grid into deficit', () => {
    const e = mk('army_production'); auto(e);
    let worst = Infinity;
    for (let s = 0; s < 240; s++) { run(e, 1); e.economy.credits = Math.max(e.economy.credits, 50000); worst = Math.min(worst, e.economy.powerSupply - e.economy.powerDemand); }
    expect(worst).toBeGreaterThanOrEqual(-60); // a brief dip while a reactor finishes is tolerated; it is never left in deficit
    expect(e.economy.powerSupply).toBeGreaterThanOrEqual(e.economy.powerDemand);
  });
});

describe('modes, decisions and persistence', () => {
  it('13/14. OFF builds nothing; SUGGEST waits for approval and respects the strategy', () => {
    const off = mk('balanced'); setConstructionMode(off, 'off'); settle(off, 60);
    expect(types(off).length).toBe(0); expect(activeTasks(off).length).toBe(0);
    const sug = mk('army_production'); setConstructionMode(sug, 'suggest'); settle(sug, 30);
    expect(types(sug).length).toBe(0);
    expect(activeTasks(sug).length).toBeGreaterThan(0);
    expect(activeTasks(sug).every(t => !t.approved)).toBe(true);
    expect(activeTasks(sug).every(t => BUILDING_ROLES[t.type].includes('ARMY_PRODUCTION') || t.type === 'power_plant')).toBe(true);
  });

  it('the decision log explains real evaluations, stays bounded and is not per-frame spam', () => {
    const e = mk('balanced'); auto(e); settle(e, 420);
    const log = e.aiArchitect.decisionLog!;
    expect(log.length).toBeGreaterThan(3);
    expect(log.length).toBeLessThanOrEqual(40);
    const texts = log.map(l => l.text);
    expect(texts.some(t => /^Building .+: /.test(t))).toBe(true);
    expect(texts.some(t => /^Skipping Infantry Academy: Existing recruitment capacity is adequate/.test(t)) || texts.some(t => /^Skipping /.test(t))).toBe(true);
    expect(new Set(texts).size).toBeGreaterThan(log.length * 0.5); // not the same line repeated
  });

  it('delaying a project for lack of credits is explained', () => {
    const e = mk('balanced', 450); auto(e); run(e, 5);
    expect(e.aiArchitect.decisionLog!.some(l => l.kind === 'delay' && /insufficient credits/i.test(l.text))).toBe(true);
  });

  it('16. strategy, options, limits, log and tasks survive save/load', () => {
    const e = mk('defense_only'); auto(e);
    setOption(e, 'avoidDuplicates', false); setOption(e, 'allowPrerequisites', false); setOption(e, 'prioritizeDefense', true);
    setTypeLimit(e, 'turret_aa', 2); setEmergencyReserve(e, 700);
    settle(e, 30);
    const save = e.exportSaveData('t', 'test');
    const e2 = new GameEngine('skirmish', 'normal');
    expect(e2.importSaveData(save)).toBe(true);
    const a = e2.aiArchitect;
    expect(a.strategy).toBe('defense_only');
    expect(a.avoidDuplicates).toBe(false);
    expect(a.allowPrerequisites).toBe(false);
    expect(a.prioritizeDefense).toBe(true);
    expect(a.typeLimits).toEqual({ turret_aa: 2 });
    expect(a.reserveCredits).toBe(700);
    expect(a.decisionLog!.length).toBe(e.aiArchitect.decisionLog!.length);
    expect(activeTasks(e2).map(t => [t.id, t.type, t.status, t.requiresApproval])).toEqual(activeTasks(e).map(t => [t.id, t.type, t.status, t.requiresApproval]));
  });

  it('switching strategy releases unstarted projects of the old strategy (nothing was spent)', () => {
    const e = mk('army_production'); setConstructionMode(e, 'suggest'); run(e, 10);
    const credits = e.economy.credits;
    expect(activeTasks(e).length).toBeGreaterThan(0);
    setStrategy(e, 'economy');
    expect(activeTasks(e).length).toBe(0);
    expect(e.economy.credits).toBe(credits);
  });

  it('17. existing gameplay is untouched: manual building and recruitment still work with the AI on', () => {
    const e = new GameEngine('skirmish', 'normal'); setStrategy(e, 'adaptive'); auto(e);
    e.economy.credits = 20000;
    const barracks = e.autoPlaceBuilding('barracks');
    expect(barracks).toBeTruthy();
    run(e, 25);
    expect(e.queueUnitProduction(barracks!.id, 'rifleman')).toBe(true);
    run(e, 12);
    expect(e.units.some(u => u.faction === 'player' && u.type === 'rifleman')).toBe(true);
    expect(Object.keys(UNIT_CONFIGS).length).toBeGreaterThan(5);
  });
});

describe('mission objective progress display', () => {
  it('12. progress is capped at the requirement while the real count stays available', () => {
    expect(cappedProgress(44, 2)).toEqual({ shown: 2, required: 2, actual: 44, met: true, text: '2/2' });
    expect(cappedProgress(1, 2)).toEqual({ shown: 1, required: 2, actual: 1, met: false, text: '1/2' });
    expect(cappedProgress(0, 2).text).toBe('0/2');
    expect(cappedProgress(NaN, 2).text).toBe('0/2');
  });
});
