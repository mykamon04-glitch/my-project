import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/audio/soundEngine', () => ({ soundEngine: new Proxy({}, { get: () => () => {} }) }));

import { GameEngine } from '../src/game/engine';
import type { SquadFormation, UnitType } from '../src/types/game';

const run = (e: GameEngine, s: number) => { for (let i = 0; i < s * 20; i++) e.update(0.05); };
const mk = () => new GameEngine('skirmish', 'normal');

/** A walkable point ~distance px from the player HQ. */
function nearHQ(e: GameEngine, dx: number, dy: number) {
  const hq = e.buildings.find(b => b.type === 'headquarters' && b.faction === 'player')!;
  return { x: hq.pixelX + dx, y: hq.pixelY + dy };
}
function spawnGroup(e: GameEngine, n: number, type: UnitType = 'rifleman') {
  const hq = e.buildings.find(b => b.type === 'headquarters' && b.faction === 'player')!;
  // lattice of walkable points around the base so large groups never spawn off-map or inside buildings
  const pts: { x: number; y: number }[] = [];
  for (let r = 150; r < 700 && pts.length < n; r += 24) {
    for (let a = 0; a < 360 && pts.length < n; a += 6) {
      const x = hq.pixelX + Math.cos((a * Math.PI) / 180) * r, y = hq.pixelY + Math.sin((a * Math.PI) / 180) * r;
      if (e.pathGrid.isPixelWalkable(x, y) && !pts.some(p => Math.hypot(p.x - x, p.y - y) < 22)) pts.push({ x, y });
    }
  }
  expect(pts.length).toBeGreaterThanOrEqual(n);
  return pts.slice(0, n).map(p => e.spawnUnit(type, 'player', p).id);
}
const unitsById = (e: GameEngine, ids: string[]) => ids.map(id => e.units.find(u => u.id === id)!).filter(Boolean);

describe('formations are real destinations', () => {
  const formations: SquadFormation[] = ['line', 'column', 'wedge', 'spread', 'circle'];
  for (const f of formations) {
    it(`${f}: 12 infantry reach distinct, walkable spots near the target and none end inside a building`, () => {
      const e = mk();
      const ids = spawnGroup(e, 12);
      const target = nearHQ(e, 260, 220);
      e.issueMove(ids, target, f);
      run(e, 40);
      const us = unitsById(e, ids);
      expect(us.length).toBe(12);
      for (const u of us) {
        expect(e.pathGrid.isPixelWalkable(u.x, u.y), `${f}: unit ended on a blocked tile at ${Math.round(u.x)},${Math.round(u.y)}`).toBe(true);
        expect(Math.hypot(u.x - target.x, u.y - target.y), `${f}: unit far from target`).toBeLessThan(330); // wedge/column are wide by design
      }
      // no stacking: every pair separated by a minimum distance
      let minD = Infinity;
      for (let i = 0; i < us.length; i++) for (let j = i + 1; j < us.length; j++) minD = Math.min(minD, Math.hypot(us[i].x - us[j].x, us[i].y - us[j].y));
      // eslint-disable-next-line no-console
      console.log(`[formation ${f}] min separation = ${minD.toFixed(1)}px`);
      expect(minD).toBeGreaterThan(8);
    });
  }

  it('the formations produce genuinely different layouts', () => {
    const layouts = new Map<string, string>();
    for (const f of ['line', 'column', 'wedge', 'circle'] as SquadFormation[]) {
      const e = mk();
      const ids = spawnGroup(e, 10);
      const t = nearHQ(e, 260, 220);
      e.issueMove(ids, t, f);
      const dests = unitsById(e, ids).map(u => `${Math.round((u.targetX ?? 0) - t.x)},${Math.round((u.targetY ?? 0) - t.y)}`).sort().join('|');
      layouts.set(f, dests);
    }
    expect(new Set(layouts.values()).size).toBe(4);
  });
});

describe('blocked destinations', () => {
  it('PROBE: a move order onto a building/water tile still leaves units on walkable ground', () => {
    const e = mk();
    const ids = spawnGroup(e, 8);
    const hq = e.buildings.find(b => b.type === 'headquarters' && b.faction === 'player')!;
    e.issueMove(ids, { x: hq.pixelX, y: hq.pixelY }, 'circle'); // order straight into the HQ
    run(e, 40);
    const us = unitsById(e, ids);
    const inside = us.filter(u => !e.pathGrid.isPixelWalkable(u.x, u.y));
    // eslint-disable-next-line no-console
    console.log(`[blocked-dest] units standing on blocked tiles: ${inside.length}/${us.length}`);
    expect(inside.length).toBe(0);
  });

  it('PROBE: units do not stay stuck mid-route (everyone makes progress or arrives)', () => {
    const e = mk();
    const ids = spawnGroup(e, 20, 'main_battle_tank');
    const t = nearHQ(e, 520, -300);
    e.issueMove(ids, t, 'wedge');
    run(e, 15);
    const mid = unitsById(e, ids).map(u => ({ id: u.id, x: u.x, y: u.y }));
    run(e, 60);
    const end = unitsById(e, ids);
    const stuck = end.filter(u => {
      const m = mid.find(q => q.id === u.id)!;
      const arrived = Math.hypot(u.x - (u.targetX ?? u.x), u.y - (u.targetY ?? u.y)) < 40;
      return !arrived && Math.hypot(u.x - m.x, u.y - m.y) < 5;
    });
    // eslint-disable-next-line no-console
    console.log(`[stuck] units that stopped short of destination: ${stuck.length}/${end.length}`);
    expect(stuck.length).toBe(0);
  });
});

describe('large armies', () => {
  it('PROBE: selecting + commanding 200 units is cheap (command dispatch)', () => {
    const e = mk();
    const ids = spawnGroup(e, 200);
    const t0 = performance.now();
    const sel = e.selectAllUnits('player');
    const t1 = performance.now();
    e.issueMove(sel, nearHQ(e, 300, 200), 'spread');
    const t2 = performance.now();
    // eslint-disable-next-line no-console
    console.log(`[perf] selectAll(${sel.length}) ${(t1 - t0).toFixed(1)}ms, issueMove ${(t2 - t1).toFixed(1)}ms`);
    expect(sel.length).toBeGreaterThanOrEqual(200);
    expect(t1 - t0).toBeLessThan(50);
    expect(t2 - t1).toBeLessThan(250);
  });

  it('PROBE: one sim tick with 200 moving units stays within a frame budget', () => {
    const e = mk();
    const ids = spawnGroup(e, 200);
    e.issueMove(ids, nearHQ(e, 300, 200), 'spread');
    const times: number[] = [];
    for (let i = 0; i < 40; i++) { const a = performance.now(); e.update(0.05); times.push(performance.now() - a); }
    times.sort((a, b) => a - b);
    const med = times[20], p95 = times[Math.floor(times.length * 0.95)];
    // eslint-disable-next-line no-console
    console.log(`[perf] 200 units update(): median ${med.toFixed(2)}ms, p95 ${p95.toFixed(2)}ms (Node, not a phone)`);
    expect(p95).toBeLessThan(33);
  });
});
