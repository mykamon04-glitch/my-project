/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MapData, MapProp, MapSize, Vector2 } from '../../types/game';

/**
 * Seeded battlefield generator (V14).
 *
 * Same parameters + same seed => the same map, tile for tile (no Math.random anywhere).
 * Layouts are point-symmetric about the map centre, so both sides get mirrored terrain, routes and resources.
 * Every map is validated (both HQ sites buildable, a ground route between the bases, every deposit reachable, room to
 * expand) and repaired if needed before it is returned.
 *
 * Tiles keep the engine's meaning: 0 open ground, 1 rough ground (rubble, gravel, dry riverbed, sand), 2 road / bridge,
 * 3 water (impassable), 4 cliff / ruin / industrial block (impassable), 5 forest (passable cover).
 */

export type Environment = 'temperate' | 'desert' | 'urban' | 'mountain' | 'coastal';
export type Density = 'low' | 'normal' | 'high';

export interface MapGenParams {
  environment: Environment;
  size: MapSize;
  seed: number;
  resourceDensity: Density;
  forestDensity: Density;
  obstacleDensity: Density;
  roads: boolean;
  layout: 'diagonal' | 'horizontal';
}

export interface MapValidation {
  ok: boolean;
  hqSitesClear: boolean;
  basesConnected: boolean;
  routeLength: number;          // tiles on the shortest ground route between the bases
  resourcesReachable: number;   // deposits with a reachable, walkable neighbour
  resourceCount: number;
  buildableNearPlayer: number;  // buildable tiles within 10 tiles of each HQ
  buildableNearEnemy: number;
  repairs: number;              // corridors carved / sites cleared by the repair pass
}

export interface GeneratedMap extends MapData {
  seed: number;
  environment: Environment;
  params: MapGenParams;
  elevation: number[];          // width*height, 0..1 (rendering shading + high ground)
  validation: MapValidation;
}

// ───────────────────────── seeded randomness ─────────────────────────

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function lattice(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1442695041)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const fade = (t: number) => t * t * (3 - 2 * t);
export function noise2(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const a = lattice(xi, yi, seed), b = lattice(xi + 1, yi, seed), c = lattice(xi, yi + 1, seed), d = lattice(xi + 1, yi + 1, seed);
  const u = fade(xf), v = fade(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm2(x: number, y: number, seed: number, oct = 4): number {
  let s = 0, amp = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += noise2(x * f, y * f, seed + i * 31) * amp; n += amp; amp *= 0.5; f *= 2.03; }
  return s / n;
}

// ───────────────────────── helpers ─────────────────────────

export const SIZE_TILES: Record<MapSize, number> = { small: 48, medium: 64, large: 80, extra_large: 96 };
const TILE = 40;
const HQ = 3; // HQ footprint in tiles (headquarters config is 3x3)

class Grid {
  t: number[][];
  constructor(public w: number, public h: number, fill = 0) { this.t = Array.from({ length: h }, () => new Array(w).fill(fill)); }
  in(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x: number, y: number) { return this.in(x, y) ? this.t[y][x] : 4; }
  set(x: number, y: number, v: number) { if (this.in(x, y)) this.t[y][x] = v; }
  /** set a tile and its point-mirror (fair layouts) */
  sym(x: number, y: number, v: number) { this.set(x, y, v); this.set(this.w - 1 - x, this.h - 1 - y, v); }
}

const walkable = (v: number) => v !== 3 && v !== 4;
const D: Record<Density, number> = { low: 0.6, normal: 1, high: 1.45 };

// ───────────────────────── generation ─────────────────────────

export function generateMap(p: MapGenParams, id: string, name: string): GeneratedMap {
  const n = SIZE_TILES[p.size] ?? 64;
  const w = n, h = n;
  const rnd = mulberry32(p.seed ^ hashString(p.environment) ^ (n * 7919));
  const ns = Math.floor(rnd() * 1e9);
  const g = new Grid(w, h, 0);
  const elev = new Float32Array(w * h);

  // spawns (player bottom-left, enemy mirrored top-right)
  const ps: Vector2 = p.layout === 'horizontal' ? { x: Math.round(w * 0.14), y: Math.round(h * 0.5) } : { x: Math.round(w * 0.17), y: Math.round(h * 0.82) };
  const es: Vector2 = { x: w - 1 - ps.x, y: h - 1 - ps.y };
  const cx = (w - 1) / 2, cy = (h - 1) / 2;

  // elevation: smooth hills, stronger relief in the mountains; bases sit on flat ground
  const relief = p.environment === 'mountain' ? 1 : p.environment === 'desert' ? 0.55 : p.environment === 'urban' ? 0.15 : 0.4;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // symmetric elevation: average of the field and its point mirror
    const e1 = fbm2(x / 13, y / 13, ns), e2 = fbm2((w - 1 - x) / 13, (h - 1 - y) / 13, ns);
    let e = (e1 + e2) / 2;
    if (p.environment === 'mountain') {
      const r1 = 1 - Math.abs(fbm2(x / 9, y / 9, ns + 7) * 2 - 1), r2 = 1 - Math.abs(fbm2((w - 1 - x) / 9, (h - 1 - y) / 9, ns + 7) * 2 - 1);
      e = e * 0.45 + ((r1 + r2) / 2) * 0.55;
    }
    const dBase = Math.min(Math.hypot(x - ps.x, y - ps.y), Math.hypot(x - es.x, y - es.y));
    const flat = Math.min(1, Math.max(0, (dBase - 7) / 6));
    elev[y * w + x] = 0.35 + (e - 0.5) * relief * flat * 1.6;
  }

  // ── environment terrain ──
  const env = p.environment;
  const forest = D[p.forestDensity], obst = D[p.obstacleDensity];
  const half = (x: number, y: number) => (x + y < cx + cy) || (x + y === cx + cy && x <= cx); // one half; the other is mirrored

  if (env === 'temperate' || env === 'mountain' || env === 'coastal') {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!half(x, y)) continue;
      const f = fbm2(x / 7, y / 7, ns + 11);
      if (f > 0.62 - 0.07 * (forest - 1) && env !== 'coastal') g.sym(x, y, 5);
      else if (env === 'coastal' && f > 0.66 - 0.06 * (forest - 1)) g.sym(x, y, 5);
      const r = fbm2(x / 4, y / 4, ns + 23);
      if (r > 0.79 - 0.05 * (obst - 1) && env !== 'mountain') g.sym(x, y, 4);
    }
  }
  if (env === 'mountain') {
    // cliffs where the relief is highest, then three passes carved through every ridge (choke points)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (half(x, y) && elev[y * w + x] > 0.6 - 0.03 * (obst - 1)) g.sym(x, y, 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (half(x, y) && g.get(x, y) === 0 && elev[y * w + x] < 0.3 && fbm2(x / 6, y / 6, ns + 41) > 0.45) g.sym(x, y, 5);
  }
  if (env === 'desert') {
    // rocky ridgelines across the battlefield with gaps (choke points), dry riverbed, scattered outcrops
    const ridges = 2 + (obst > 1 ? 1 : 0);
    for (let k = 0; k < ridges; k++) {
      const t = (k + 1) / (ridges + 1);
      const ox = ps.x + (cx - ps.x) * t * 1.6, oy = ps.y + (cy - ps.y) * t * 1.6;
      const len = Math.round(n * 0.32);
      const gap = Math.floor(rnd() * len * 0.6) + Math.round(len * 0.2);
      for (let i = -len; i <= len; i++) {
        if (Math.abs(i - (gap - len / 2)) < 2.5) continue; // pass through the ridge
        const x = Math.round(ox + i * 0.7), y = Math.round(oy + i * 0.7 + Math.sin(i / 3 + k) * 1.2);
        if (half(x, y)) { g.sym(x, y, 4); if (rnd() < 0.5) g.sym(x + 1, y, 4); }
      }
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!half(x, y)) continue;
      // the bases lie on the (1,-1) diagonal, so a band around x - y = 0 crosses between them
      const across = (x - y) / Math.SQRT2;
      if (Math.abs(across + Math.sin((x + y) / 5) * 2.2) < 1.6) g.sym(x, y, 1); // dry riverbed across the middle
      else if (fbm2(x / 4, y / 4, ns + 61) > 0.8 - 0.04 * (obst - 1) && g.get(x, y) === 0) g.sym(x, y, 4);
      else if (fbm2(x / 6, y / 6, ns + 67) > 0.66 && g.get(x, y) === 0) g.sym(x, y, 1);
    }
  }
  if (env === 'urban') {
    // street grid; blocks become ruined buildings (impassable), rubble or open lots
    const step = 8;
    // some street lines are dropped (symmetrically) so blocks vary in size: avenues, side streets and large lots
    const keepCol = (i: number) => lattice(i, 0, ns + 17) > 0.45 || i % 3 === 0;
    const keepRow = (i: number) => lattice(0, i, ns + 19) > 0.45 || i % 3 === 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!half(x, y)) continue;
      const street = (x % step < 2 && keepCol(Math.floor(x / step))) || (y % step < 2 && keepRow(Math.floor(y / step)));
      if (street) { g.sym(x, y, 2); continue; }
      const bx = Math.floor(x / step), by = Math.floor(y / step);
      const r = lattice(bx, by, ns + 3);
      const inset = x % step >= 3 && x % step <= step - 2 && y % step >= 3 && y % step <= step - 2;
      if (r < 0.5 * obst && inset) g.sym(x, y, 4);
      else if (r < 0.75) g.sym(x, y, fbm2(x / 2, y / 2, ns + 5) > 0.55 ? 1 : 0);
    }
  }
  if (env === 'coastal') {
    // sea in two opposite corners, and a river through the middle crossed by bridges
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!half(x, y)) continue;
      const d = Math.hypot(x - 0, y - 0) / n;                       // top-left corner (mirrored: bottom-right)
      if (d < 0.36 + (fbm2(x / 6, y / 6, ns + 71) - 0.5) * 0.12) g.sym(x, y, 3);
      const offs = (x - y) / Math.SQRT2;                            // river between the bases (perpendicular to their axis)
      if (Math.abs(offs + Math.sin((x + y) / 6) * 1.8) < 1.7) g.sym(x, y, 3);
    }
  }

  // ── roads: main supply route between the bases through the centre, plus spurs to the flanks ──
  const roadW = env === 'urban' ? 3 : 2;
  const roadTiles: Vector2[] = [];
  const paint = (x: number, y: number) => {
    for (let dy = 0; dy < roadW; dy++) for (let dx = 0; dx < roadW; dx++) {
      const tx = x + dx - (roadW >> 1), ty = y + dy - (roadW >> 1);
      if (!g.in(tx, ty)) continue;
      // roads cross water as bridges (tile 2 is walkable) and cut through obstacles
      g.sym(tx, ty, 2);
      roadTiles.push({ x: tx, y: ty });
    }
  };
  // curved routes: a Catmull-Rom spline through jittered control points (deterministic), sampled densely
  const route = (pts: Vector2[]) => {
    const P = [pts[0], ...pts, pts[pts.length - 1]];
    for (let k = 1; k < P.length - 2; k++) {
      const [p0, p1, p2, p3] = [P[k - 1], P[k], P[k + 1], P[k + 2]];
      const steps = Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) * 2);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps, t2 = t * t, t3 = t2 * t;
        const q = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        paint(Math.round(q(p0.x, p1.x, p2.x, p3.x)), Math.round(q(p0.y, p1.y, p2.y, p3.y)));
      }
    }
  };
  const via = (a: Vector2, b: Vector2, bends: number, amp: number): Vector2[] => {
    const out = [a];
    const nx = -(b.y - a.y), ny = b.x - a.x, nl = Math.hypot(nx, ny) || 1;
    for (let i = 1; i <= bends; i++) {
      const t = i / (bends + 1), o = (rnd() - 0.5) * 2 * amp;
      out.push({ x: a.x + (b.x - a.x) * t + (nx / nl) * o, y: a.y + (b.y - a.y) * t + (ny / nl) * o });
    }
    out.push(b);
    return out;
  };
  if (p.roads) {
    const C = { x: Math.round(cx), y: Math.round(cy) };
    if (env === 'urban') route([{ x: ps.x + 2, y: ps.y - 2 }, C]);                       // main boulevard
    else route(via({ x: ps.x + 2, y: ps.y - 2 }, C, 2, n * 0.08));
    // flank routes: further approaches to the front (multiple attack approaches), curving around the terrain
    route(via({ x: ps.x + 5, y: ps.y }, { x: Math.round(cx + n * 0.2), y: Math.round(cy + n * 0.12) }, 2, n * 0.07));
    route(via({ x: ps.x, y: ps.y - 5 }, { x: Math.round(cx - n * 0.12), y: Math.round(cy - n * 0.2) }, 2, n * 0.07));
  }

  // ── base sites: flat, clear staging areas ──
  const clearDisc = (c: Vector2, r: number, v = 0) => {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      if (x * x + y * y > r * r) continue;
      const tx = c.x + x, ty = c.y + y;
      if (g.in(tx, ty) && g.get(tx, ty) !== 2) g.set(tx, ty, v);
    }
  };
  clearDisc(ps, 8); clearDisc(es, 8);

  // ── resources: near-base, forward and contested deposits (mirrored) ──
  const rd = D[p.resourceDensity];
  const nodes: MapData['resourceNodes'] = [];
  const addNode = (x: number, y: number, amount: number) => {
    x = Math.max(2, Math.min(w - 3, Math.round(x))); y = Math.max(2, Math.min(h - 3, Math.round(y)));
    for (const [nx, ny] of [[x, y], [w - 1 - x, h - 1 - y]]) {
      if (nodes.some(o => o.x === nx && o.y === ny)) continue;
      clearDisc({ x: nx, y: ny }, 2);
      nodes.push({ x: nx, y: ny, amount, remaining: amount });
    }
  };
  const toC = { x: cx - ps.x, y: cy - ps.y }, L = Math.hypot(toC.x, toC.y) || 1;
  const ux = toC.x / L, uy = toC.y / L, vx = -uy, vy = ux;
  addNode(ps.x + ux * 9 + vx * 5, ps.y + uy * 9 + vy * 5, Math.round(26000 * rd));
  addNode(ps.x + ux * L * 0.55 - vx * n * 0.16, ps.y + uy * L * 0.55 - vy * n * 0.16, Math.round(24000 * rd));
  if (p.resourceDensity !== 'low') addNode(ps.x + ux * L * 0.6 + vx * n * 0.2, ps.y + uy * L * 0.6 + vy * n * 0.2, 22000);
  if (p.resourceDensity === 'high') addNode(ps.x + ux * 6 - vx * 7, ps.y + uy * 6 - vy * 7, 20000);
  // contested deposits: a mirrored pair across the centre (an even-sized map has no exact centre tile, so a single
  // "central" deposit would sit one tile closer to one side)
  addNode(cx + vx * 3.5, cy + vy * 3.5, Math.round(36000 * rd));

  // ── validate and repair ──
  let repairs = 0;
  const hqOrigin = (c: Vector2) => ({ x: c.x - 1, y: c.y - 1 }); // engine centres the 3x3 HQ on the spawn tile
  for (const c of [ps, es]) {
    const o = hqOrigin(c);
    for (let y = 0; y < HQ; y++) for (let x = 0; x < HQ; x++) if (!walkable(g.get(o.x + x, o.y + y))) { g.set(o.x + x, o.y + y, 0); repairs++; }
  }
  let v = validate(g, ps, es, nodes);
  for (let pass = 0; pass < 4 && !(v.basesConnected && v.resourcesReachable === nodes.length); pass++) {
    // carve a corridor along the straight line between the bases (and to any unreachable deposit), mirrored
    const carve = (a: Vector2, b: Vector2) => {
      const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2);
      for (let i = 0; i <= steps; i++) {
        const x = Math.round(a.x + (b.x - a.x) * (i / steps)), y = Math.round(a.y + (b.y - a.y) * (i / steps));
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) if (!walkable(g.get(x + dx, y + dy))) { g.sym(x + dx, y + dy, g.get(x + dx, y + dy) === 3 ? 2 : 1); repairs++; }
      }
    };
    if (!v.basesConnected) carve(ps, es);
    for (const node of nodes) if (!reachable(g, ps, node)) carve(ps, node);
    v = validate(g, ps, es, nodes);
  }
  v.repairs = repairs;

  // ── props (decoration never blocks a walkable tile; blocking props sit on impassable tiles only) ──
  const props = decorate(g, env, rnd, forest, elev, nodes, roadTiles, ps, es);

  const tiles = g.t;
  return {
    id, name,
    biome: env === 'mountain' ? 'mountain' : env === 'coastal' ? 'coastal' : env,
    width: w, height: h, tileSize: TILE, tiles,
    resourceNodes: nodes,
    props,
    playerSpawn: { x: ps.x * TILE + TILE / 2, y: ps.y * TILE + TILE / 2 },
    enemySpawn: { x: es.x * TILE + TILE / 2, y: es.y * TILE + TILE / 2 },
    seed: p.seed, environment: env, params: { ...p }, elevation: Array.from(elev, e => Math.round(e * 1000) / 1000),
    validation: v,
  } as GeneratedMap;
}

function neighbours(g: Grid, x: number, y: number): [number, number][] {
  return [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].filter(([a, b]) => g.in(a, b)) as [number, number][];
}

function bfs(g: Grid, from: Vector2): Int32Array {
  const dist = new Int32Array(g.w * g.h).fill(-1);
  const q: number[] = [];
  if (!walkable(g.get(from.x, from.y))) return dist;
  dist[from.y * g.w + from.x] = 0; q.push(from.y * g.w + from.x);
  for (let i = 0; i < q.length; i++) {
    const c = q[i], x = c % g.w, y = (c / g.w) | 0;
    for (const [nx, ny] of neighbours(g, x, y)) {
      const k = ny * g.w + nx;
      if (dist[k] < 0 && walkable(g.t[ny][nx])) { dist[k] = dist[c] + 1; q.push(k); }
    }
  }
  return dist;
}

function reachable(g: Grid, from: Vector2, node: { x: number; y: number }): boolean {
  const d = bfs(g, from);
  return [[node.x, node.y], ...neighbours(g, node.x, node.y)].some(([x, y]) => d[y * g.w + x] >= 0);
}

function validate(g: Grid, ps: Vector2, es: Vector2, nodes: { x: number; y: number }[]): MapValidation {
  const d = bfs(g, ps);
  const route = d[es.y * g.w + es.x];
  const hqClear = (c: Vector2) => { for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) if (!walkable(g.get(c.x + x, c.y + y))) return false; return true; };
  const build = (c: Vector2) => { let k = 0; for (let y = -10; y <= 10; y++) for (let x = -10; x <= 10; x++) if (x * x + y * y <= 100 && g.in(c.x + x, c.y + y) && walkable(g.get(c.x + x, c.y + y))) k++; return k; };
  const reach = nodes.filter(nd => [[nd.x, nd.y], ...neighbours(g, nd.x, nd.y)].some(([x, y]) => d[y * g.w + x] >= 0)).length;
  const v: MapValidation = {
    ok: false, hqSitesClear: hqClear(ps) && hqClear(es), basesConnected: route >= 0, routeLength: route,
    resourcesReachable: reach, resourceCount: nodes.length, buildableNearPlayer: build(ps), buildableNearEnemy: build(es), repairs: 0,
  };
  v.ok = v.hqSitesClear && v.basesConnected && reach === nodes.length && v.buildableNearPlayer >= 200 && v.buildableNearEnemy >= 200;
  return v;
}

function decorate(g: Grid, env: Environment, rnd: () => number, forest: number, elev: Float32Array, nodes: { x: number; y: number }[],
  roads: Vector2[], ps: Vector2, es: Vector2): MapProp[] {
  const props: MapProp[] = [];
  let k = 0;
  const id = (t: string) => `${t}_${k++}`;
  const near = (x: number, y: number, r: number) => nodes.some(n => Math.abs(n.x - x) <= r && Math.abs(n.y - y) <= r);
  const nearBase = (x: number, y: number, r: number) => Math.hypot(x - ps.x, y - ps.y) < r || Math.hypot(x - es.x, y - es.y) < r;
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const t = g.t[y][x];
    const jx = () => x * TILE + TILE / 2 + (rnd() - 0.5) * 16, jy = () => y * TILE + TILE / 2 + (rnd() - 0.5) * 16;
    if (t === 5) {
      const count = rnd() < 0.55 * forest ? 2 : 1;
      for (let i = 0; i < count; i++) props.push({ id: id('tree'), x: jx(), y: jy(), type: 'tree', size: 10 + rnd() * 6, rotation: rnd() * 6.28, variant: Math.floor(rnd() * 4) });
    } else if (t === 4) {
      if (env === 'urban') {
        // ruined building blocks: one prop per block corner tile (drawn as an extruded broken structure)
        if (g.get(x - 1, y) !== 4 && g.get(x, y - 1) !== 4) {
          let bw = 0, bh = 0;
          while (g.get(x + bw, y) === 4) bw++;
          while (g.get(x, y + bh) === 4) bh++;
          props.push({ id: id('ruin'), x: x * TILE, y: y * TILE, type: 'ruin', size: bw * TILE, rotation: bh * TILE, blocking: true, variant: Math.floor(rnd() * 4) });
        }
      } else if ((env === 'desert' || env === 'coastal') && g.get(x - 1, y) !== 4 && g.get(x, y - 1) !== 4 && rnd() < 0.18 && !near(x, y, 3)) {
        props.push({ id: id('ind'), x: x * TILE + TILE / 2, y: y * TILE + TILE / 2, type: 'barricade', size: 14 + rnd() * 8, rotation: rnd() * 6.28, blocking: true, variant: Math.floor(rnd() * 3) });
      } else if (env !== 'mountain' || rnd() < 0.1) {
        // boulders (sparse on mountain cliffs: the rock face itself is rendered by the terrain)
        props.push({ id: id('rock'), x: jx(), y: jy(), type: 'rock', size: (env === 'mountain' ? 18 : 14) + rnd() * 10 + elev[y * g.w + x] * 6, rotation: rnd() * 6.28, blocking: true });
      }
    } else if ((t === 0 || t === 1) && !nearBase(x, y, 6) && !near(x, y, 2)) {
      const r = rnd();
      if (env === 'temperate' || env === 'mountain' || env === 'coastal') {
        if (r < 0.025 * forest) props.push({ id: id('bush'), x: jx(), y: jy(), type: 'bush', size: 8 + rnd() * 5, rotation: 0, variant: Math.floor(rnd() * 4) });
        else if (r < 0.035 * forest) props.push({ id: id('tree'), x: jx(), y: jy(), type: 'tree', size: 9 + rnd() * 5, rotation: rnd() * 6.28, variant: Math.floor(rnd() * 4) });
      } else if (env === 'desert' && r < 0.012) {
        props.push({ id: id('rock'), x: jx(), y: jy(), type: 'rock', size: 7 + rnd() * 5, rotation: rnd() * 6.28 });
      }
    }
  }
  // abandoned vehicles along roads (urban, desert) — off the carriageway centre, never blocking
  if (env === 'urban' || env === 'desert') {
    for (let i = 0; i < roads.length; i += 37) {
      const r = roads[i];
      if (nearBase(r.x, r.y, 9) || rnd() < 0.5) continue;
      props.push({ id: id('wreck'), x: r.x * TILE + 8 + rnd() * 24, y: r.y * TILE + 8 + rnd() * 24, type: 'wreck', size: 20, rotation: rnd() * 6.28, variant: Math.floor(rnd() * 3) });
    }
  }
  return props;
}

/** Minimal check used by tests and the match setup screen. */
export function isValidMap(m: GeneratedMap): boolean { return m.validation.ok; }
