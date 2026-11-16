import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/audio/soundEngine', () => ({ soundEngine: new Proxy({}, { get: () => () => {} }) }));

import { GameEngine } from '../src/game/engine';
import { MAP_CATALOG, buildMap, resolveMapId, LEGACY_MAP_IDS } from '../src/game/maps/catalog';
import { PathfindingGrid } from '../src/game/pathfinding';
import { renderMapPreview } from '../src/game/maps/terrain';
import type { MapSize } from '../src/types/game';

const SIZES: MapSize[] = ['small', 'medium', 'large', 'extra_large'];

describe('V14 seeded maps', () => {
  it('generation is reproducible from its seed and different seeds give different maps', () => {
    for (const m of MAP_CATALOG) {
      const a = buildMap(m.id, { seed: 777 }), b = buildMap(m.id, { seed: 777 }), c = buildMap(m.id, { seed: 778 });
      expect(JSON.stringify(a.tiles)).toBe(JSON.stringify(b.tiles));
      expect(JSON.stringify(a.props)).toBe(JSON.stringify(b.props));
      expect(JSON.stringify(a.resourceNodes)).toBe(JSON.stringify(b.resourceNodes));
      expect(JSON.stringify(a.tiles) === JSON.stringify(c.tiles) && JSON.stringify(a.props) === JSON.stringify(c.props)).toBe(false);
    }
  });

  it('every environment x size x seed validates: HQ sites, base connection, reachable deposits, room to build', () => {
    for (const m of MAP_CATALOG) for (const size of SIZES) for (const seed of [m.defaultSeed, 1, 42, 9001]) {
      const g = buildMap(m.id, { size, seed });
      const v = g.validation;
      expect(v.ok, `${m.id} ${size} seed ${seed}: ${JSON.stringify(v)}`).toBe(true);
      // deposits and spawns lie inside the map (the old generators put 4 of 5 deposits off small maps)
      for (const n of g.resourceNodes) { expect(n.x).toBeGreaterThanOrEqual(0); expect(n.x).toBeLessThan(g.width); expect(n.y).toBeGreaterThanOrEqual(0); expect(n.y).toBeLessThan(g.height); }
      for (const s of [g.playerSpawn, g.enemySpawn]) { expect(s.x).toBeGreaterThan(0); expect(s.x).toBeLessThan(g.width * g.tileSize); }
    }
  });

  it('layouts are point-symmetric (fair): mirrored tiles and deposits', () => {
    for (const m of MAP_CATALOG) {
      const g = buildMap(m.id);
      let diff = 0;
      for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) if (g.tiles[y][x] !== g.tiles[g.height - 1 - y][g.width - 1 - x]) diff++;
      expect(diff / (g.width * g.height), m.id).toBeLessThan(0.02);
      for (const n of g.resourceNodes) expect(g.resourceNodes.some(o => o.x === g.width - 1 - n.x && o.y === g.height - 1 - n.y), `${m.id} deposit ${n.x},${n.y} mirrored`).toBe(true);
    }
  });

  it('decoration never blocks a walkable tile', () => {
    for (const m of MAP_CATALOG) {
      const g = buildMap(m.id);
      for (const p of g.props) if (p.blocking) {
        const tx = Math.floor((p.type === 'ruin' ? p.x + 4 : p.x) / g.tileSize), ty = Math.floor((p.type === 'ruin' ? p.y + 4 : p.y) / g.tileSize);
        expect([3, 4], `${m.id} ${p.type} at ${tx},${ty}`).toContain(g.tiles[ty][tx]);
      }
    }
  });

  it('every map starts a match; ground units can path to the enemy base with the engine pathfinder; buildings can be placed', () => {
    for (const m of MAP_CATALOG) {
      const e = new GameEngine('skirmish', 'normal', m.id);
      expect(e.mapData.id).toBe(m.id);
      expect(e.buildings.filter(b => b.type === 'headquarters').length).toBe(2);
      const grid = new PathfindingGrid(e.mapData);
      grid.rebuild(e.mapData, e.buildings);
      const ehq = e.buildings.find(b => b.type === 'headquarters' && b.faction === 'enemy')!;
      const from = { x: e.mapData.playerSpawn.x + 80, y: e.mapData.playerSpawn.y + 80 };
      const path = grid.findPath(from, { x: ehq.pixelX - 80, y: ehq.pixelY + 80 }, false);
      expect(path.length, `${m.id} path`).toBeGreaterThan(0);
      const last = path[path.length - 1];
      expect(Math.hypot(last.x - (ehq.pixelX - 80), last.y - (ehq.pixelY + 80)), m.id).toBeLessThan(120);
      e.economy.credits = 1e6;
      for (const t of ['power_plant', 'barracks', 'coin_generator'] as const) expect(e.autoPlaceBuilding(t), `${m.id} ${t}`).not.toBeNull();
    }
  });

  it('save / load preserves the map identity (id, seed, options) — the old loader always rebuilt the default map', () => {
    const e = new GameEngine('skirmish', 'normal', 'coastal_operations', undefined, { mapSize: 'large', seed: 4242, resourceDensity: 'high' });
    const save = e.exportSaveData('t', 't');
    const f = new GameEngine(save.mode, 'normal'); // what App does: a fresh engine, then import
    expect(f.mapData.id).toBe('temperate_warzone');
    expect(f.importSaveData(save)).toBe(true);
    expect(f.mapData.id).toBe('coastal_operations');
    expect(f.mapData.seed).toBe(4242);
    expect(f.mapData.width).toBe(80);
    expect(JSON.stringify(f.mapData.tiles)).toBe(JSON.stringify(e.mapData.tiles));
    expect(f.mapData.resourceNodes.length).toBe(e.mapData.resourceNodes.length);
  });

  it('legacy map ids (saves, campaign) resolve to a V14 battlefield', () => {
    for (const id of Object.keys(LEGACY_MAP_IDS)) expect(MAP_CATALOG.map(m => m.id)).toContain(resolveMapId(id));
    expect(new GameEngine('campaign', 'easy', 'verdant_valley', 1).mapData.environment).toBe('temperate');
  });

  it('map previews / radar coordinates match world coordinates (HQ markers at the spawns)', () => {
    const g = buildMap('desert_frontline');
    const px = 128, p = renderMapPreview(g, px);
    const scale = px / (g.width * g.tileSize);
    const at = (wx: number, wy: number) => { const i = (Math.floor(wy * scale) * p.w + Math.floor(wx * scale)) * 4; return [p.data[i], p.data[i + 1], p.data[i + 2]]; };
    expect(at(g.playerSpawn.x, g.playerSpawn.y)).toEqual([67, 201, 163]);
    expect(at(g.enemySpawn.x, g.enemySpawn.y)).toEqual([229, 107, 114]);
  });

  it('terrain cover is applied by the combat engine: infantry in forest takes 20% less damage, vehicles none', () => {
    const e = new GameEngine('skirmish', 'normal', 'temperate_warzone');
    const g = e.mapData, ts = g.tileSize;
    let forest: [number, number] | null = null, open: [number, number] | null = null;
    for (let y = 2; y < g.height - 2 && (!forest || !open); y++) for (let x = 2; x < g.width - 2; x++) {
      if (!forest && g.tiles[y][x] === 5) forest = [x, y];
      if (!open && g.tiles[y][x] === 0) open = [x, y];
    }
    const a = e.spawnUnit('rifleman', 'enemy', { x: forest![0] * ts + 20, y: forest![1] * ts + 20 });
    const b = e.spawnUnit('rifleman', 'enemy', { x: open![0] * ts + 20, y: open![1] * ts + 20 });
    const t = e.spawnUnit('light_tank', 'enemy', { x: forest![0] * ts + 20, y: forest![1] * ts + 20 });
    expect(e.coverFactor(a)).toBe(0.8);
    expect(e.coverFactor(b)).toBe(1);
    expect(e.coverFactor(t)).toBe(1);
    const shoot = (u: typeof a) => {
      const hp = u.hp;
      (e as any).resolveProjectileImpact({ id: 'x', x: u.x, y: u.y, startX: u.x, startY: u.y, targetX: u.x, targetY: u.y, targetUnitId: u.id, speed: 1, damage: 100, splashRadius: 0, faction: 'player', type: 'bullet', progress: 1 });
      return hp - u.hp;
    };
    const inForest = shoot(a), inOpen = shoot(b);
    expect(inForest).toBeLessThan(inOpen);
    expect(Math.abs(inForest - Math.round(inOpen * 0.8))).toBeLessThanOrEqual(1);
  });
});
