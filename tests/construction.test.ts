import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/audio/soundEngine', () => ({ soundEngine: new Proxy({}, { get: () => () => {} }) }));

import { GameEngine } from '../src/game/engine';
import { BUILDING_CONFIGS } from '../src/data/gameData';
import {
  activeTasks, approveAllTasks, approveTask, cancelTask, getReservedCredits, getSlotViews, queueProject,
  setConstructionLimit, setConstructionMode, taskProgress,
} from '../src/game/constructionAI';
import type { Building, BuildingType, ConstructionTask } from '../src/types/game';

/**
 * These tests exercise the five-slot MACHINERY (real reservations, charging, construction progress, cancel, save/load).
 * Projects are started with queueProject(), which follows exactly the same path as an AI-planned project, so five can
 * run at once regardless of what the planner currently wants. What the planner chooses is covered in
 * construction-ai-v81.test.ts.
 */

const run = (e: GameEngine, s: number) => { for (let i = 0; i < s * 20; i++) e.update(0.05); };
function mk(credits = 200000) {
  const e = new GameEngine('skirmish', 'normal');
  e.units = e.units.filter(u => u.faction === 'player');
  e.buildings = e.buildings.filter(b => b.faction === 'player' || b.type === 'headquarters');
  e.pathGrid.rebuild(e.mapData, e.buildings);
  e.economy.credits = credits;
  e.aiArchitect.reserveCredits = 0;
  return e;
}
const FIVE: BuildingType[] = ['power_plant', 'coin_generator', 'barracks', 'supply_depot', 'turret_gun'];
function fillFive(e: GameEngine, approved = true) {
  const out: ConstructionTask[] = [];
  for (const t of FIVE) { const task = queueProject(e, t, { approved }); expect(task, `no slot/site for ${t}`).toBeTruthy(); out.push(task!); }
  return out;
}
const constructing = (e: GameEngine) => activeTasks(e).filter(t => t.status === 'constructing');
const rect = (b: { x: number; y: number; width: number; height: number }) => ({ x: b.x, y: b.y, w: b.width, h: b.height });
const overlap = (a: ReturnType<typeof rect>, b: ReturnType<typeof rect>) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const mine = (e: GameEngine) => e.buildings.filter(b => b.faction === 'player');

describe('Construction slots: five real simultaneous projects', () => {
  it('1. five valid buildings are constructed concurrently (default limit 5)', () => {
    const e = mk();
    expect(e.aiArchitect.maxConcurrentConstruction).toBe(5);
    fillFive(e);
    run(e, 1);
    expect(constructing(e).length).toBe(5);
    expect(new Set(constructing(e).map(t => t.slot)).size).toBe(5);
    expect(queueProject(e, 'power_plant')).toBeNull(); // a sixth is refused: five is the maximum
  });

  it('2. every project is a real building that progresses independently', () => {
    const e = mk();
    fillFive(e);
    run(e, 2);
    const tasks = constructing(e);
    expect(tasks.length).toBe(5);
    expect(new Set(tasks.map(t => t.buildingId)).size).toBe(5);
    const before = tasks.map(t => taskProgress(e, t));
    run(e, 1);
    const after = tasks.map(t => taskProgress(e, t));
    for (let i = 0; i < tasks.length; i++) {
      const b = e.buildings.find(x => x.id === tasks[i].buildingId) as Building | undefined;
      if (b && b.constructionProgress < 1) {
        expect(b.isUnderConstruction).toBe(true);
        expect(after[i]).toBeCloseTo(b.constructionProgress, 6); // dashboard value == engine value
      }
      expect(after[i]).toBeGreaterThan(before[i]);
    }
    expect(new Set(before.map(p => p.toFixed(3))).size).toBeGreaterThan(1); // different build times -> different percentages
  });

  it('3. a completed building frees its slot, which a new project can use', () => {
    const e = mk();
    fillFive(e);
    run(e, 1);
    const first = constructing(e).slice().sort((a, b) => BUILDING_CONFIGS[a.type].buildTime - BUILDING_CONFIGS[b.type].buildTime)[0];
    for (let i = 0; i < 20 * 60 && !(e.aiArchitect.taskHistory ?? []).some(t => t.id === first.id); i++) e.update(0.05);
    const done = e.aiArchitect.taskHistory!.find(t => t.id === first.id)!;
    expect(done.status).toBe('completed');
    expect(e.buildings.find(b => b.id === done.buildingId)!.constructionProgress).toBe(1);
    expect(activeTasks(e).some(t => t.id === first.id)).toBe(false);
    expect(activeTasks(e).length).toBeLessThan(5);
    const again = queueProject(e, 'supply_depot');
    expect(again).toBeTruthy();
    expect(again!.slot).toBe(first.slot); // the freed slot is reused
  });

  it('4. insufficient credits prevent starts, charge nothing, and wait (no repeated attempts)', () => {
    const e = mk(10);
    setConstructionMode(e, 'suggest'); // AI active (approved projects still start); OFF would release unstarted ones
    const calls: { type: string; credits: number }[] = [];
    const original = e.placeBuilding.bind(e);
    e.placeBuilding = ((...args: Parameters<GameEngine['placeBuilding']>) => {
      if ((args[3] ?? 'player') === 'player') calls.push({ type: args[0], credits: e.economy.credits });
      return original(...args);
    }) as GameEngine['placeBuilding'];
    const t = queueProject(e, 'barracks');
    expect(t).toBeTruthy();
    run(e, 1.5);
    expect(calls.length).toBe(0);
    expect(constructing(e).length).toBe(0);
    expect(activeTasks(e)[0].status).toBe('waiting_resources');
    expect(e.economy.credits).toBeGreaterThanOrEqual(10 - 1e-6);
    run(e, 40);
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(c.credits).toBeGreaterThanOrEqual(BUILDING_CONFIGS[c.type as BuildingType].cost);
    expect(e.economy.credits).toBeGreaterThanOrEqual(0);
  });

  it('5. buildings and reserved sites never overlap', () => {
    const e = mk();
    setConstructionMode(e, 'suggest');
    const tasks = fillFive(e, false); // reserved, not started
    run(e, 1);
    expect(activeTasks(e).length).toBe(5);
    const rects = tasks.map(t => { const c = BUILDING_CONFIGS[t.type]; return { x: t.gridX, y: t.gridY, w: c.size.width, h: c.size.height }; });
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlap(rects[i], rects[j]), `reserved ${i} vs ${j}`).toBe(false);
    approveAllTasks(e);
    run(e, 30);
    const own = mine(e).map(rect);
    for (let i = 0; i < own.length; i++) for (let j = i + 1; j < own.length; j++) expect(overlap(own[i], own[j]), `building ${i} vs ${j}`).toBe(false);
  });

  it('6. cancelling one project leaves the other four running', () => {
    const e = mk();
    fillFive(e);
    run(e, 1);
    const tasks = constructing(e);
    expect(tasks.length).toBe(5);
    const victim = tasks[2];
    const credits = e.economy.credits;
    expect(cancelTask(e, victim.id)).toBe(true);
    expect(e.buildings.some(b => b.id === victim.buildingId)).toBe(false);
    expect(e.economy.credits).toBeGreaterThan(credits); // existing demolish refund (50%)
    for (const t of tasks.filter(x => x.id !== victim.id)) {
      expect(e.buildings.some(b => b.id === t.buildingId)).toBe(true);
      expect(activeTasks(e).find(x => x.id === t.id)?.status).toBe('constructing');
    }
    expect(e.aiArchitect.taskHistory!.find(t => t.id === victim.id)?.status).toBe('cancelled');
  });

  it('7. OFF mode: no new construction, pending projects released, running ones finish', () => {
    const e = mk();
    setConstructionMode(e, 'auto');
    run(e, 20);
    const running = constructing(e).map(t => t.buildingId);
    setConstructionMode(e, 'off');
    run(e, 1);
    expect(activeTasks(e).every(t => t.status === 'constructing')).toBe(true);
    const started = e.aiArchitect.nextTaskSeq;
    run(e, 120);
    expect(e.aiArchitect.nextTaskSeq).toBe(started); // nothing new was planned
    for (const id of running) expect(e.buildings.find(b => b.id === id)?.constructionProgress ?? 1).toBe(1);
  });

  it('8. SUGGEST mode proposes projects and starts none without approval', () => {
    const e = mk();
    setConstructionMode(e, 'suggest');
    const credits = e.economy.credits;
    const mineCount = () => mine(e).length;
    const buildings = mineCount();
    run(e, 40);
    const proposals = activeTasks(e);
    expect(proposals.length).toBeGreaterThanOrEqual(1);
    expect(proposals.every(t => !t.approved && t.status === 'planned')).toBe(true);
    expect(mineCount()).toBe(buildings);
    expect(e.economy.credits).toBeGreaterThanOrEqual(credits);
    const first = proposals[0];
    expect(approveTask(e, first.id)).toBe(true);
    run(e, 3);
    expect(activeTasks(e).find(t => t.id === first.id)?.status).toBe('constructing');
    expect(e.aiArchitect.pendingAssistedRecommendation === null || String(e.aiArchitect.pendingAssistedRecommendation!.id).startsWith('ctask_')).toBe(true);
    // the original banner mirrors the next unapproved project, and approving it works
    if (activeTasks(e).some(t => !t.approved)) {
      expect(e.aiArchitect.pendingAssistedRecommendation).toBeTruthy();
      expect(e.acceptAssistedRecommendation()).toBe(true);
    }
  });

  it('9. AUTO keeps managing a base over time without exceeding five at once', () => {
    const e = mk();
    e.aiArchitect.strategy = 'adaptive';
    setConstructionMode(e, 'auto');
    let peak = 0;
    for (let i = 0; i < 20 * 240; i++) { e.update(0.05); peak = Math.max(peak, activeTasks(e).length); }
    expect(peak).toBeLessThanOrEqual(5);
    expect(e.aiArchitect.taskHistory!.filter(t => t.status === 'completed').length).toBeGreaterThanOrEqual(5);
  });

  it('limit 1..5 is respected (and clamped)', () => {
    const e = mk();
    expect(setConstructionLimit(e, 2)).toBe(2);
    expect(setConstructionLimit(e, 99)).toBe(5);
    expect(setConstructionLimit(e, 0)).toBe(1);
    setConstructionLimit(e, 2);
    expect(queueProject(e, 'power_plant')).toBeTruthy();
    expect(queueProject(e, 'coin_generator')).toBeTruthy();
    expect(queueProject(e, 'barracks')).toBeNull();
  });

  it('10. save/load restores active projects, progress, reservations and does not double-charge', () => {
    const e = mk();
    setConstructionLimit(e, 4);
    setConstructionMode(e, 'auto');
    for (const t of FIVE.slice(0, 3)) queueProject(e, t);
    queueProject(e, 'turret_gun', { approved: false }); // one reserved-but-not-started project
    run(e, 3);
    const save = e.exportSaveData('t', 'test');
    const tasksBefore = JSON.parse(JSON.stringify(activeTasks(e))) as ConstructionTask[];
    const creditsBefore = e.economy.credits;
    const e2 = new GameEngine('skirmish', 'normal');
    expect(e2.importSaveData(save)).toBe(true);
    const tasksAfter = activeTasks(e2);
    expect(tasksAfter.map(t => [t.id, t.slot, t.type, t.status, t.buildingId, t.gridX, t.gridY, t.approved]))
      .toEqual(tasksBefore.map(t => [t.id, t.slot, t.type, t.status, t.buildingId, t.gridX, t.gridY, t.approved]));
    expect(e2.aiArchitect.maxConcurrentConstruction).toBe(4);
    expect(e2.aiArchitect.strategy).toBe(e.aiArchitect.strategy);
    expect(Math.round(e2.economy.credits)).toBe(Math.round(creditsBefore));
    for (const t of tasksAfter.filter(x => x.status === 'constructing')) {
      expect(taskProgress(e2, t)).toBeCloseTo(e.buildings.find(b => b.id === t.buildingId)!.constructionProgress, 3);
    }
    run(e2, 4);
    for (const t of tasksAfter) expect(e2.buildings.filter(b => b.id === t.buildingId).length).toBeLessThanOrEqual(1);
    expect(activeTasks(e2).length).toBeLessThanOrEqual(4);
  });

  it('old saves without task state still load (limit kept, safe defaults)', () => {
    const e = mk();
    const save = e.exportSaveData('t', 'old');
    const st = JSON.parse(save.stateJson);
    for (const k of ['tasks', 'taskHistory', 'blockedTypes', 'strategy', 'avoidDuplicates', 'allowPrerequisites', 'prioritizeDefense', 'typeLimits', 'decisionLog', 'lastPlanned']) delete st.aiArchitect[k];
    st.aiArchitect.maxConcurrentConstruction = 1;
    save.stateJson = JSON.stringify(st);
    const e2 = new GameEngine('skirmish', 'normal');
    expect(e2.importSaveData(save)).toBe(true);
    expect(e2.aiArchitect.tasks).toEqual([]);
    expect(e2.aiArchitect.maxConcurrentConstruction).toBe(1);
    expect(e2.aiArchitect.strategy).toBe('balanced');
    expect(e2.aiArchitect.avoidDuplicates).toBe(true);
    expect(e2.aiArchitect.allowPrerequisites).toBe(true);
    expect(e2.aiArchitect.decisionLog).toEqual([]);
  });

  it('11. manual construction still works and takes priority over a reserved AI site', () => {
    const e = mk();
    const proposal = queueProject(e, 'barracks', { approved: false })!;
    expect(proposal).toBeTruthy();
    const credits = e.economy.credits;
    const manual = e.placeBuilding(proposal.type, proposal.gridX, proposal.gridY, 'player', 0); // the player builds by hand on the reserved site
    expect(manual).toBeTruthy();
    expect(e.economy.credits).toBeCloseTo(credits - BUILDING_CONFIGS[proposal.type].cost, 3);
    e.aiArchitect.strategy = 'army_production';
    setConstructionMode(e, 'suggest');
    run(e, 4);
    const moved = activeTasks(e).find(t => t.id === proposal.id);
    if (moved) {
      expect(moved.retries).toBeGreaterThanOrEqual(1);
      expect(e.canPlaceBuilding(moved.type, moved.gridX, moved.gridY, 'player').valid).toBe(true);
    } else {
      expect(e.aiArchitect.taskHistory!.some(t => t.id === proposal.id)).toBe(true);
    }
  });

  it('bounded retries: a project whose site keeps going invalid fails instead of looping', () => {
    const e = mk();
    setConstructionMode(e, 'suggest');
    const t = queueProject(e, 'barracks', { approved: false })!;
    for (let i = 0; i < 6; i++) {
      const cur = activeTasks(e).find(x => x.id === t.id);
      if (!cur) break;
      e.economy.credits = 100000;
      e.placeBuilding('power_plant', cur.gridX, cur.gridY, 'player', 0) || e.placeBuilding('defense_wall', cur.gridX, cur.gridY, 'player', 0);
      run(e, 3);
    }
    const hist = e.aiArchitect.taskHistory!.find(x => x.id === t.id);
    const cur = activeTasks(e).find(x => x.id === t.id);
    expect(cur ? cur.retries <= 3 : hist?.status === 'failed').toBe(true);
  });

  it('never charges twice: exactly one successful placeBuilding per started project', () => {
    const e = mk();
    const placed: string[] = [];
    const original = e.placeBuilding.bind(e);
    e.placeBuilding = ((...args: Parameters<GameEngine['placeBuilding']>) => {
      const b = original(...args);
      if (b && (args[3] ?? 'player') === 'player') placed.push(b.id);
      return b;
    }) as GameEngine['placeBuilding'];
    e.aiArchitect.strategy = 'adaptive';
    setConstructionMode(e, 'auto');
    const seen = new Set<string>();
    for (let i = 0; i < 20 * 120; i++) {
      e.update(0.05);
      for (const t of [...activeTasks(e), ...e.aiArchitect.taskHistory!]) if (t.buildingId) seen.add(t.buildingId);
    }
    expect(placed.length).toBeGreaterThan(3);
    expect(new Set(placed).size).toBe(placed.length);
    expect(seen.size).toBe(placed.length);
  });

  it('reservations: approved waiting projects reserve credits that troop auto-production leaves alone', () => {
    const e = mk(900);
    setConstructionMode(e, 'suggest');
    queueProject(e, 'coin_generator');   // 500 - affordable, starts
    queueProject(e, 'vehicle_factory');  // 750 - waits
    run(e, 1);
    const waiting = activeTasks(e).filter(t => t.status === 'waiting_resources');
    expect(waiting.length).toBe(1);
    expect(getReservedCredits(e)).toBe(waiting[0].cost);
    expect(getSlotViews(e).length).toBe(5);
  });
});

describe('Regression: the rest of the game still works with Construction AI active', () => {
  it('12. enemy AI, recruitment and combat keep functioning', () => {
    const e = new GameEngine('skirmish', 'normal');
    setConstructionMode(e, 'auto');
    e.economy.credits = 60000;
    const enemy0 = e.units.filter(u => u.faction === 'enemy').length + e.buildings.filter(b => b.faction === 'enemy').length;
    run(e, 300);
    const enemy1 = e.units.filter(u => u.faction === 'enemy').length + e.buildings.filter(b => b.faction === 'enemy').length;
    expect(enemy1).toBeGreaterThan(enemy0);
    const barracks = e.buildings.find(b => b.faction === 'player' && b.type === 'barracks' && b.constructionProgress >= 1);
    expect(barracks, 'the Construction AI produced a working barracks').toBeTruthy();
    const n0 = e.units.filter(u => u.faction === 'player').length;
    expect(e.queueUnitProduction(barracks!.id, 'rifleman')).toBe(true);
    run(e, 15);
    expect(e.units.filter(u => u.faction === 'player').length).toBeGreaterThan(n0);
    const me = e.spawnUnit('rifleman', 'player', { x: 400, y: 400 });
    const foe = e.spawnUnit('rifleman', 'enemy', { x: 440, y: 400 });
    const hp = foe.hp;
    e.issueAttack([me.id], foe.id);
    run(e, 4);
    expect(foe.hp).toBeLessThan(hp);
  });
});
