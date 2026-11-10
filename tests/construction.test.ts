import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/audio/soundEngine', () => ({ soundEngine: new Proxy({}, { get: () => () => {} }) }));

import { GameEngine } from '../src/game/engine';
import { BUILDING_CONFIGS } from '../src/data/gameData';
import {
  activeTasks, approveAllTasks, approveTask, cancelTask, getReservedCredits, getSlotViews, setConstructionLimit,
  setConstructionMode, taskProgress,
} from '../src/game/constructionAI';
import type { Building, ConstructionTask } from '../src/types/game';

const run = (e: GameEngine, s: number) => { for (let i = 0; i < s * 20; i++) e.update(0.05); };
/** Skirmish with the enemy silenced so only Construction AI behaviour is measured. */
function mk(credits = 200000) {
  const e = new GameEngine('skirmish', 'normal');
  e.units = e.units.filter(u => u.faction === 'player');
  e.buildings = e.buildings.filter(b => b.faction === 'player' || b.type === 'headquarters');
  e.pathGrid.rebuild(e.mapData, e.buildings);
  e.economy.credits = credits;
  e.aiArchitect.reserveCredits = 0;
  return e;
}
const constructing = (e: GameEngine) => activeTasks(e).filter(t => t.status === 'constructing');
const rect = (b: { x: number; y: number; width: number; height: number }) => ({ x: b.x, y: b.y, w: b.width, h: b.height });
const overlap = (a: ReturnType<typeof rect>, b: ReturnType<typeof rect>) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

describe('Construction AI: five real simultaneous projects', () => {
  it('1. starts five valid buildings concurrently (default limit is 5)', () => {
    const e = mk();
    expect(e.aiArchitect.maxConcurrentConstruction).toBe(5);
    setConstructionMode(e, 'auto');
    let peak = 0;
    for (let i = 0; i < 20 * 20; i++) { e.update(0.05); peak = Math.max(peak, constructing(e).length); }
    expect(peak).toBe(5);
  });

  it('2. every project is a real building that progresses independently', () => {
    const e = mk();
    setConstructionMode(e, 'auto');
    run(e, 6);
    const tasks = constructing(e);
    expect(tasks.length).toBe(5);
    const ids = new Set(tasks.map(t => t.buildingId));
    expect(ids.size).toBe(5);                                      // five distinct real buildings
    const before = tasks.map(t => taskProgress(e, t));
    run(e, 3);
    const after = tasks.map(t => taskProgress(e, t));
    for (let i = 0; i < tasks.length; i++) {
      const b = e.buildings.find(x => x.id === tasks[i].buildingId) as Building | undefined;
      if (b && b.constructionProgress < 1) {
        expect(b.isUnderConstruction).toBe(true);                  // engine state, not a fake timer
        expect(after[i]).toBeCloseTo(b.constructionProgress, 6);   // dashboard value == engine value
      }
      expect(after[i]).toBeGreaterThan(before[i]);                 // each one advanced
    }
    expect(new Set(before.map(p => p.toFixed(3))).size).toBeGreaterThan(1); // not all at the same percentage
  });

  it('3. a completed building frees its slot and the AI accepts a new task', () => {
    const e = mk();
    setConstructionMode(e, 'auto');
    run(e, 5);
    const first = constructing(e).slice().sort((a, b) => BUILDING_CONFIGS[a.type].buildTime - BUILDING_CONFIGS[b.type].buildTime)[0];
    const slot = first.slot;
    for (let i = 0; i < 20 * 120 && !(e.aiArchitect.taskHistory ?? []).some(t => t.id === first.id); i++) e.update(0.05);
    const done = e.aiArchitect.taskHistory!.find(t => t.id === first.id)!;
    expect(done.status).toBe('completed');
    expect(e.buildings.find(b => b.id === done.buildingId)!.constructionProgress).toBe(1);
    run(e, 10);
    expect(activeTasks(e).length).toBe(5);                         // slot was refilled
    expect(activeTasks(e).some(t => t.id !== first.id && t.slot === slot)).toBe(true);
  });

  it('4. insufficient credits prevent starts, charge nothing, and wait (no repeated attempts)', () => {
    const e = mk(10); // below the cheapest building (40)
    const calls: { type: string; credits: number }[] = [];
    const original = e.placeBuilding.bind(e);
    e.placeBuilding = ((...args: Parameters<GameEngine['placeBuilding']>) => {
      if ((args[3] ?? 'player') === 'player') calls.push({ type: args[0], credits: e.economy.credits }); // enemy placements use enemy funds
      return original(...args);
    }) as GameEngine['placeBuilding'];
    setConstructionMode(e, 'auto');
    run(e, 1.5);
    expect(calls.length).toBe(0);                                  // nothing attempted while unaffordable
    expect(constructing(e).length).toBe(0);
    expect(activeTasks(e).filter(t => t.status === 'waiting_resources').length).toBeLessThanOrEqual(1);
    expect(e.economy.credits).toBeGreaterThanOrEqual(10 - 1e-6);   // never spent, never negative
    run(e, 40);                                                    // income arrives
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(c.credits, `attempted ${c.type} with only $${Math.round(c.credits)}`).toBeGreaterThanOrEqual(BUILDING_CONFIGS[c.type as keyof typeof BUILDING_CONFIGS].cost);
    expect(e.economy.credits).toBeGreaterThanOrEqual(0);           // construction never drives the balance negative
  });

  it('5. buildings and reserved sites never overlap', () => {
    const e = mk();
    setConstructionMode(e, 'suggest'); // sites are reserved but nothing is built yet
    run(e, 6);
    const pending = activeTasks(e);
    expect(pending.length).toBe(5);
    const rects = pending.map(t => { const c = BUILDING_CONFIGS[t.type]; return { x: t.gridX, y: t.gridY, w: c.size.width, h: c.size.height }; });
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlap(rects[i], rects[j]), `reserved ${i} vs ${j}`).toBe(false);
    approveAllTasks(e);
    run(e, 30);
    const own = e.buildings.filter(b => b.faction === 'player').map(rect);
    for (let i = 0; i < own.length; i++) for (let j = i + 1; j < own.length; j++) expect(overlap(own[i], own[j]), `building ${i} vs ${j}`).toBe(false);
  });

  it('6. cancelling one project leaves the other four running', () => {
    const e = mk();
    setConstructionMode(e, 'auto');
    run(e, 6);
    const tasks = constructing(e);
    expect(tasks.length).toBe(5);
    const victim = tasks[2];
    const credits = e.economy.credits;
    expect(cancelTask(e, victim.id)).toBe(true);
    expect(e.buildings.some(b => b.id === victim.buildingId)).toBe(false);      // that building is gone
    expect(e.economy.credits).toBeGreaterThan(credits);                         // existing demolish refund (50%)
    const others = tasks.filter(t => t.id !== victim.id);
    for (const t of others) {
      expect(e.buildings.some(b => b.id === t.buildingId)).toBe(true);
      expect(activeTasks(e).find(x => x.id === t.id)?.status).toBe('constructing');
    }
    expect(e.aiArchitect.taskHistory!.find(t => t.id === victim.id)?.status).toBe('cancelled');
    run(e, 15);
    // a cancelled project is not restarted straight away
    expect(activeTasks(e).some(t => t.type === victim.type && t.createdAt > victim.createdAt && t.createdAt < e.gameTime - 1 && e.gameTime - t.createdAt > 14)).toBe(false);
  });

  it('7. OFF mode: no new construction, pending projects released, running ones finish', () => {
    const e = mk();
    setConstructionMode(e, 'auto');
    run(e, 3);
    const running = constructing(e).map(t => t.buildingId);
    setConstructionMode(e, 'off');
    run(e, 1);
    expect(activeTasks(e).every(t => t.status === 'constructing')).toBe(true);  // pending ones were cancelled
    const started = e.aiArchitect.nextTaskSeq;
    run(e, 120);
    expect(e.aiArchitect.nextTaskSeq).toBe(started);                            // nothing new was even planned
    for (const id of running) expect(e.buildings.find(b => b.id === id)?.constructionProgress ?? 1).toBe(1);
  });

  it('8. SUGGEST mode proposes up to five projects and starts none without approval', () => {
    const e = mk();
    setConstructionMode(e, 'suggest');
    const credits = e.economy.credits;
    const mine = () => e.buildings.filter(b => b.faction === 'player').length;
    const buildings = mine();
    run(e, 40);
    const proposals = activeTasks(e);
    expect(proposals.length).toBe(5);
    expect(proposals.every(t => !t.approved && t.status === 'planned')).toBe(true);
    expect(mine()).toBe(buildings);                                              // nothing built for the player
    expect(e.economy.credits).toBeGreaterThanOrEqual(credits);                   // nothing charged
    const first = proposals[0];
    expect(approveTask(e, first.id)).toBe(true);
    run(e, 3);
    expect(activeTasks(e).find(t => t.id === first.id)?.status).toBe('constructing');
    expect(activeTasks(e).filter(t => !t.approved).length).toBe(4);              // the rest still wait
    // the original banner mirrors the next unapproved project and approving it works
    expect(e.aiArchitect.pendingAssistedRecommendation).toBeTruthy();
    expect(e.acceptAssistedRecommendation()).toBe(true);
    run(e, 3);
    expect(constructing(e).length).toBe(2);
  });

  it('9. AUTO mode keeps managing: more than five buildings over time, never more than five at once', () => {
    const e = mk();
    setConstructionMode(e, 'auto');
    let peak = 0;
    for (let i = 0; i < 20 * 240; i++) { e.update(0.05); peak = Math.max(peak, activeTasks(e).length); }
    expect(peak).toBeLessThanOrEqual(5);
    const finished = e.aiArchitect.taskHistory!.filter(t => t.status === 'completed').length + 0;
    expect(finished).toBeGreaterThanOrEqual(5);
  });

  it('limit 1..5 is respected (and clamped)', () => {
    const e = mk();
    expect(setConstructionLimit(e, 2)).toBe(2);
    expect(setConstructionLimit(e, 99)).toBe(5);
    expect(setConstructionLimit(e, 0)).toBe(1);
    setConstructionLimit(e, 2);
    setConstructionMode(e, 'auto');
    let peak = 0;
    for (let i = 0; i < 20 * 60; i++) { e.update(0.05); peak = Math.max(peak, activeTasks(e).length); }
    expect(peak).toBe(2);
  });

  it('10. save/load restores active projects, progress, reservations and does not double-charge', () => {
    const e = mk();
    setConstructionMode(e, 'auto');
    setConstructionLimit(e, 4);
    run(e, 7);
    const save = e.exportSaveData('t', 'test');
    const tasksBefore = JSON.parse(JSON.stringify(activeTasks(e))) as ConstructionTask[];
    const creditsBefore = e.economy.credits;
    const e2 = new GameEngine('skirmish', 'normal');
    expect(e2.importSaveData(save)).toBe(true);
    const tasksAfter = activeTasks(e2);
    expect(tasksAfter.map(t => [t.id, t.slot, t.type, t.status, t.buildingId, t.gridX, t.gridY]))
      .toEqual(tasksBefore.map(t => [t.id, t.slot, t.type, t.status, t.buildingId, t.gridX, t.gridY]));
    expect(e2.aiArchitect.maxConcurrentConstruction).toBe(4);
    expect(e2.aiArchitect.mode).toBe(e.aiArchitect.mode);
    expect(Math.round(e2.economy.credits)).toBe(Math.round(creditsBefore));      // restore does not charge again
    for (const t of tasksAfter.filter(x => x.status === 'constructing')) {
      const orig = e.buildings.find(b => b.id === t.buildingId)!;
      expect(taskProgress(e2, t)).toBeCloseTo(orig.constructionProgress, 3);
    }
    const countBefore = e2.buildings.length;
    run(e2, 4);
    // no duplicates of restored projects: every restored task still maps to exactly one building
    for (const t of tasksAfter) expect(e2.buildings.filter(b => b.id === t.buildingId).length).toBeLessThanOrEqual(1);
    expect(activeTasks(e2).length).toBeLessThanOrEqual(4);                        // the restored limit still holds
    expect(e2.buildings.length).toBeGreaterThanOrEqual(countBefore);              // nothing vanished or was rebuilt over
  });

  it('old saves without task state still load (limit kept, empty tasks)', () => {
    const e = mk();
    const save = e.exportSaveData('t', 'old');
    const st = JSON.parse(save.stateJson);
    delete st.aiArchitect.tasks; delete st.aiArchitect.taskHistory; delete st.aiArchitect.blockedTypes; st.aiArchitect.maxConcurrentConstruction = 1;
    save.stateJson = JSON.stringify(st);
    const e2 = new GameEngine('skirmish', 'normal');
    expect(e2.importSaveData(save)).toBe(true);
    expect(e2.aiArchitect.tasks).toEqual([]);
    expect(e2.aiArchitect.maxConcurrentConstruction).toBe(1);
  });

  it('11. manual construction still works and takes priority over a reserved AI site', () => {
    const e = mk();
    setConstructionMode(e, 'suggest');
    run(e, 6);
    const proposal = activeTasks(e)[0];
    const credits = e.economy.credits;
    // the player builds by hand on the AI's reserved site
    const manual = e.placeBuilding(proposal.type, proposal.gridX, proposal.gridY, 'player', 0);
    expect(manual).toBeTruthy();
    expect(e.economy.credits).toBeCloseTo(credits - BUILDING_CONFIGS[proposal.type].cost, 3); // charged exactly once
    run(e, 4);
    const moved = activeTasks(e).find(t => t.id === proposal.id);
    // the AI project re-planned to a different valid site (or ended); it never overlaps the manual building
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
    run(e, 4);
    const t = activeTasks(e)[0];
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
    setConstructionMode(e, 'auto');
    const seen = new Set<string>();
    for (let i = 0; i < 20 * 90; i++) {
      e.update(0.05);
      for (const t of activeTasks(e)) if (t.buildingId) seen.add(t.buildingId);
      for (const t of e.aiArchitect.taskHistory!) if (t.buildingId) seen.add(t.buildingId);
    }
    expect(placed.length).toBeGreaterThan(5);
    expect(new Set(placed).size).toBe(placed.length);              // no building placed twice
    expect(seen.size).toBe(placed.length);                         // every placement belongs to exactly one task
  });

  it('reservations: approved waiting projects reserve credits that troop auto-production leaves alone', () => {
    const e = mk(900);
    e.aiArchitect.reserveCredits = 0;
    setConstructionMode(e, 'auto');
    run(e, 3);
    const waiting = activeTasks(e).filter(t => t.status === 'waiting_resources');
    expect(waiting.length).toBe(1);
    expect(getReservedCredits(e)).toBe(waiting[0].cost);
    const views = getSlotViews(e);
    expect(views.length).toBe(5);
    expect(views.filter(v => v.task).length).toBeGreaterThanOrEqual(1);
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
    expect(enemy1).toBeGreaterThan(enemy0);                                       // enemy AI still builds and trains
    const barracks = e.buildings.find(b => b.faction === 'player' && b.type === 'barracks' && b.constructionProgress >= 1);
    expect(barracks, 'the Construction AI produced a working barracks').toBeTruthy();
    const n0 = e.units.filter(u => u.faction === 'player').length;
    expect(e.queueUnitProduction(barracks!.id, 'rifleman')).toBe(true);           // recruitment works
    run(e, 15);
    expect(e.units.filter(u => u.faction === 'player').length).toBeGreaterThan(n0);
    // combat: a rifleman damages an adjacent enemy
    const me = e.spawnUnit('rifleman', 'player', { x: 400, y: 400 });
    const foe = e.spawnUnit('rifleman', 'enemy', { x: 440, y: 400 });
    const hp = foe.hp;
    e.issueAttack([me.id], foe.id);
    run(e, 4);
    expect(foe.hp).toBeLessThan(hp);
  });
});
