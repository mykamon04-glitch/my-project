/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MapData } from '../../types/game';
import { fbm2, noise2 } from './generator';

/**
 * Terrain material compositor (V14). Pure: given a map and a world position it returns the ground colour.
 *
 *  - Materials per environment: grass / soil / sand / gravel / asphalt / concrete / rock / water / forest floor.
 *  - Organic borders: material lookups are domain-warped and two samples are blended, so tiles never show as squares.
 *  - Relief: a hill-shade from the elevation field (sun from the north-west, as for buildings and units), plus
 *    ambient occlusion at the foot of cliffs and under forest.
 *  - Roads: worn asphalt or dirt with darker wheel ruts and lighter shoulders; urban concrete with expansion joints.
 *  - Water: depth-graded colour, lighter shallows and a foam / wet-sand line at the shore.
 * The renderer bakes it into cached chunks (see TerrainChunks in renderer.ts); the map preview uses the same function.
 */

type RGB = [number, number, number];
interface Palette {
  ground: [RGB, RGB, RGB];   // base, dry/light variant, damp/dark variant
  rough: [RGB, RGB];
  road: [RGB, RGB];          // surface, shoulder
  rock: [RGB, RGB];
  forest: RGB;
  water: [RGB, RGB];         // deep, shallow
  shore: RGB;
  asphalt: boolean;          // roads are paved (asphalt / concrete)
  high?: RGB;                // high-elevation tint (alpine rock / snow)
}

const PAL: Record<string, Palette> = {
  temperate: {
    ground: [[86, 101, 62], [112, 116, 74], [64, 80, 52]], rough: [[104, 92, 70], [88, 78, 60]],
    road: [[112, 98, 76], [92, 84, 64]], rock: [[112, 110, 104], [78, 76, 72]], forest: [52, 66, 42],
    water: [[38, 62, 72], [62, 92, 96]], shore: [150, 140, 108], asphalt: false,
  },
  desert: {
    ground: [[176, 152, 112], [196, 172, 128], [150, 124, 92]], rough: [[150, 128, 98], [132, 112, 86]],
    road: [[108, 102, 94], [150, 132, 104]], rock: [[146, 112, 84], [104, 80, 62]], forest: [118, 112, 74],
    water: [[44, 76, 86], [86, 118, 116]], shore: [196, 178, 140], asphalt: true,
  },
  urban: {
    ground: [[118, 118, 112], [132, 130, 122], [96, 98, 94]], rough: [[116, 108, 98], [94, 88, 80]],
    road: [[64, 66, 68], [96, 96, 94]], rock: [[92, 88, 84], [70, 68, 66]], forest: [70, 84, 56],
    water: [[40, 60, 70], [64, 88, 92]], shore: [120, 118, 110], asphalt: true,
  },
  mountain: {
    ground: [[88, 100, 70], [114, 116, 86], [66, 78, 56]], rough: [[118, 112, 100], [96, 92, 84]],
    road: [[118, 108, 88], [96, 90, 76]], rock: [[124, 122, 118], [84, 84, 82]], forest: [46, 62, 44],
    water: [[40, 64, 78], [70, 98, 108]], shore: [140, 136, 122], asphalt: false, high: [206, 210, 212],
  },
  coastal: {
    ground: [[96, 110, 70], [124, 124, 84], [74, 90, 60]], rough: [[150, 138, 108], [124, 114, 92]],
    road: [[82, 84, 84], [118, 112, 98]], rock: [[124, 120, 112], [88, 86, 82]], forest: [56, 74, 48],
    water: [[30, 72, 92], [70, 124, 132]], shore: [204, 190, 150], asphalt: true,
  },
  // legacy biomes
  snow: {
    ground: [[200, 206, 210], [218, 222, 224], [170, 180, 188]], rough: [[150, 156, 160], [126, 132, 138]],
    road: [[110, 112, 116], [150, 154, 158]], rock: [[110, 114, 120], [80, 84, 90]], forest: [64, 80, 72],
    water: [[120, 150, 170], [170, 196, 210]], shore: [210, 216, 220], asphalt: true,
  },
  volcanic: {
    ground: [[66, 58, 54], [86, 74, 66], [48, 42, 40]], rough: [[90, 70, 58], [70, 56, 48]],
    road: [[56, 54, 52], [82, 74, 66]], rock: [[50, 46, 44], [34, 32, 30]], forest: [60, 64, 46],
    water: [[150, 60, 30], [200, 96, 40]], shore: [96, 70, 56], asphalt: true,
  },
  industrial: {
    ground: [[108, 106, 98], [124, 120, 110], [88, 88, 84]], rough: [[112, 100, 88], [90, 82, 74]],
    road: [[60, 62, 64], [92, 92, 90]], rock: [[86, 82, 78], [64, 62, 60]], forest: [70, 84, 56],
    water: [[40, 60, 70], [64, 88, 92]], shore: [120, 118, 110], asphalt: true,
  },
};

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export class TerrainSampler {
  readonly pal: Palette;
  readonly ts: number;
  private w: number; private h: number;
  private tiles: number[][];
  private elev: number[] | null;
  private seed: number;
  private wbuf = new Float32Array(6);
  private waterDist: Float32Array;   // distance (tiles) from each tile to land (0 on land)
  private landDist: Float32Array;    // distance from each land tile to water (shore band)

  constructor(private map: MapData) {
    const env = map.environment ?? map.biome;
    this.pal = PAL[env] ?? PAL.temperate;
    this.ts = map.tileSize; this.w = map.width; this.h = map.height; this.tiles = map.tiles;
    this.elev = map.elevation ?? null;
    this.seed = (map.seed ?? 1337) % 100000;
    this.waterDist = this.distance(t => t === 3);
    this.landDist = this.distance(t => t !== 3);
  }

  /** chamfer distance transform: for tiles where `inside` holds, distance to the nearest tile where it does not */
  private distance(inside: (t: number) => boolean): Float32Array {
    const { w, h } = this, d = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[y * w + x] = inside(this.tiles[y][x]) ? 1e6 : 0;
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x; if (!d[i]) continue;
        if (x > 0) d[i] = Math.min(d[i], d[i - 1] + 1); if (y > 0) d[i] = Math.min(d[i], d[i - w] + 1);
        if (x > 0 && y > 0) d[i] = Math.min(d[i], d[i - w - 1] + 1.414);
      }
      for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x; if (!d[i]) continue;
        if (x < w - 1) d[i] = Math.min(d[i], d[i + 1] + 1); if (y < h - 1) d[i] = Math.min(d[i], d[i + w] + 1);
        if (x < w - 1 && y < h - 1) d[i] = Math.min(d[i], d[i + w + 1] + 1.414);
      }
    }
    return d;
  }

  tileAt(tx: number, ty: number): number {
    tx = tx < 0 ? 0 : tx >= this.w ? this.w - 1 : tx; ty = ty < 0 ? 0 : ty >= this.h ? this.h - 1 : ty;
    return this.tiles[ty][tx];
  }
  /** bilinear elevation at fractional tile coordinates */
  elevAt(fx: number, fy: number): number {
    const e = this.elev; if (!e) return 0.35;
    fx = Math.max(0, Math.min(this.w - 1.001, fx - 0.5)); fy = Math.max(0, Math.min(this.h - 1.001, fy - 0.5));
    const x0 = fx | 0, y0 = fy | 0, u = fx - x0, v = fy - y0, w = this.w;
    const a = e[y0 * w + x0], b = e[y0 * w + x0 + 1], c = e[(y0 + 1) * w + x0], d = e[(y0 + 1) * w + x0 + 1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  private field(arr: Float32Array, fx: number, fy: number): number {
    fx = Math.max(0, Math.min(this.w - 1.001, fx - 0.5)); fy = Math.max(0, Math.min(this.h - 1.001, fy - 0.5));
    const x0 = fx | 0, y0 = fy | 0, u = fx - x0, v = fy - y0, w = this.w;
    const a = arr[y0 * w + x0], b = arr[y0 * w + x0 + 1], c = arr[(y0 + 1) * w + x0], d = arr[(y0 + 1) * w + x0 + 1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  /** Material colour of a tile type at a world position (before relief and AO). */
  private material(t: number, wx: number, wy: number, fx: number, fy: number): RGB {
    const P = this.pal, s = this.seed;
    switch (t) {
      case 2: { // road
        const along = noise2(wx / 9, wy / 9, s + 5);
        if (P.asphalt) {
          let c = mix(P.road[0], P.road[1], 0.12 + along * 0.18);
          const joint = (Math.abs((wx % 80) - 40) < 0.9 || Math.abs((wy % 80) - 40) < 0.9) && noise2(wx / 30, wy / 30, s + 9) > 0.45;
          if (joint) c = mix(c, [30, 30, 30], 0.35);
          if (noise2(wx / 3, wy / 3, s + 13) > 0.86) c = mix(c, [40, 38, 36], 0.4); // cracks / patches
          return c;
        }
        // dirt road: packed earth with darker worn patches and scattered gravel
        const wear = fbm2(wx / 14, wy / 14, s + 7, 2);
        let c = mix(mix(P.road[0], P.road[1], along * 0.5), [64, 56, 44], clamp01((wear - 0.55) * 2.2) * 0.35);
        if (noise2(wx / 2.2, wy / 2.2, s + 8) > 0.84) c = mix(c, [P.road[0][0] + 26, P.road[0][1] + 24, P.road[0][2] + 20], 0.45);
        return c;
      }
      case 3: { // water: depth graded
        const depth = clamp01(this.field(this.waterDist, fx, fy) / 4);
        const ripple = (noise2(wx / 14, wy / 14, s + 21) - 0.5) * 0.12;
        return mix(P.water[1], P.water[0], clamp01(depth + ripple));
      }
      case 4: { // rock / cliff / blocks
        const n = fbm2(wx / 26, wy / 26, s + 31, 3);
        let c = mix(P.rock[1], P.rock[0], n);
        if (noise2(wx / 5, wy / 5, s + 33) > 0.8) c = mix(c, [40, 38, 36], 0.35); // fissures
        return c;
      }
      case 5: { // forest floor (canopy is drawn by tree props)
        const n = fbm2(wx / 40, wy / 40, s + 41, 2);
        return mix(P.forest, P.ground[2], n * 0.5);
      }
      case 1: { // rough ground: gravel / rubble / dry bed
        const n = fbm2(wx / 18, wy / 18, s + 51, 3);
        let c = mix(P.rough[1], P.rough[0], n);
        if (noise2(wx / 2.5, wy / 2.5, s + 53) > 0.78) c = mix(c, [P.rough[0][0] + 30, P.rough[0][1] + 28, P.rough[0][2] + 24], 0.5); // pebbles
        return c;
      }
      default: { // open ground
        const big = fbm2(wx / 700, wy / 700, s + 61, 3), mid = fbm2(wx / 190, wy / 190, s + 63, 3), fine = noise2(wx / 22, wy / 22, s + 65);
        const dry = clamp01((mid - 0.56) / 0.18), damp = clamp01((0.44 - mid) / 0.18);
        let c = mix(P.ground[0], P.ground[1], dry);
        c = mix(c, P.ground[2], damp);
        const k = 1 + (big - 0.5) * 0.14 + (fine - 0.5) * 0.08;
        return [c[0] * k, c[1] * k, c[2] * k];
      }
    }
  }

  /** Final ground colour at a world position. */
  colorAt(wx: number, wy: number): RGB {
    const ts = this.ts, s = this.seed;
    // Organic borders: the lookup is domain-warped, then the four surrounding tile centres are blended bilinearly per
    // material and the strongest material wins. Contours follow smooth curves instead of the 40 px tile grid.
    const warpX = (fbm2(wx / 60, wy / 60, s + 71, 2) - 0.5) * 26, warpY = (fbm2(wx / 60, wy / 60, s + 73, 2) - 0.5) * 26;
    const fx = (wx + warpX) / ts, fy = (wy + warpY) / ts;
    const gx = fx - 0.5, gy = fy - 0.5, x0 = Math.floor(gx), y0 = Math.floor(gy), u = gx - x0, v = gy - y0;
    const W = this.wbuf; W.fill(0);
    W[this.tileAt(x0, y0)] += (1 - u) * (1 - v); W[this.tileAt(x0 + 1, y0)] += u * (1 - v);
    W[this.tileAt(x0, y0 + 1)] += (1 - u) * v; W[this.tileAt(x0 + 1, y0 + 1)] += u * v;
    // irregular edges for natural materials (forest, rock, rough ground); roads and water keep clean lines
    const jit = (noise2(wx / 11, wy / 11, s + 75) - 0.5) * 0.34;
    W[5] += jit; W[4] += jit * 0.6; W[1] -= jit * 0.8;
    let t: number, wt: number;
    if (W[2] > (this.pal.asphalt && this.map.environment === 'urban' ? 0.6 : 0.7)) { t = 2; wt = W[2]; } // narrower visual carriageway inside the walkable road tiles
    else if (W[3] > 0.5) { t = 3; wt = W[3]; }
    else {
      t = 0; wt = -1;
      for (const m of [0, 1, 4, 5, 2, 3]) { const w = m === 2 ? W[m] * 0.55 : m === 3 ? W[m] * 0.9 : W[m]; if (w > wt) { wt = w; t = m; } }
    }
    let c = this.material(t, wx, wy, fx, fy);
    // soft transition band: blend toward the runner-up material near the contour
    let t2 = -1, w2 = -1;
    for (let m = 0; m < 6; m++) if (m !== t && W[m] > w2) { w2 = W[m]; t2 = m; }
    if (t2 >= 0 && w2 > 0.18 && t !== 3 && t2 !== 3) {
      const k = clamp01((w2 - (t === 2 ? 0.25 : 0.32)) / 0.3) * (t === 2 || t2 === 2 ? 0.35 : 0.5);
      if (k > 0) c = mix(c, this.material(t2, wx, wy, fx, fy), k);
    }
    const ex = wx / ts, ey = wy / ts;
    // shoreline: wet sand / foam on land next to water
    if (t !== 3) {
      const ld = this.field(this.landDist, ex, ey);
      if (ld < 1.4) c = mix(c, this.pal.shore, clamp01((1.4 - ld) / 1.0) * 0.8);
    } else {
      const wd = this.field(this.waterDist, ex, ey);
      if (wd < 0.75) c = mix(c, [210, 220, 214], clamp01((0.75 - wd) / 0.75) * 0.35 * (noise2(wx / 6, wy / 6, s + 81) > 0.4 ? 1 : 0.4));
    }

    // relief: hill-shade from the elevation gradient (sun from the north-west), stronger on cliffs
    const e = this.elevAt(ex, ey);
    const dx = this.elevAt(ex + 0.5, ey) - this.elevAt(ex - 0.5, ey), dy = this.elevAt(ex, ey + 0.5) - this.elevAt(ex, ey - 0.5);
    const relief = t === 4 ? 9 : 5;
    let shade = 1 + (-dx * 0.7 - dy * 0.7) * relief;
    shade += (e - 0.35) * 0.35;
    if (t === 3) shade = 1 + (shade - 1) * 0.15;
    // alpine tint on high ground
    if (this.pal.high && e > 0.62 && t !== 3) c = mix(c, this.pal.high, clamp01((e - 0.62) / 0.12) * 0.65);
    // ambient occlusion: darker at the foot of cliffs and inside forests
    if (t !== 4 && t !== 3) {
      let occ = 0;
      for (const [ox, oy] of [[-0.6, 0], [0.6, 0], [0, -0.6], [0, 0.6]]) { const n = this.tileAt(Math.floor(ex + ox), Math.floor(ey + oy)); if (n === 4) occ += 0.07; else if (n === 5) occ += 0.025; }
      shade -= occ;
    }
    shade = shade < 0.55 ? 0.55 : shade > 1.3 ? 1.3 : shade;
    return [c[0] * shade, c[1] * shade, c[2] * shade];
  }
}

/** Fill an RGBA buffer with the terrain of a world rectangle at `texel` world px per pixel. */
export function bakeTerrain(sampler: TerrainSampler, wx0: number, wy0: number, wpx: number, hpx: number, texel: number, out?: Uint8ClampedArray): Uint8ClampedArray {
  const W = Math.ceil(wpx / texel), H = Math.ceil(hpx / texel);
  const d = out ?? new Uint8ClampedArray(W * H * 4);
  let h = (Math.imul(wx0 | 0, 73856093) ^ Math.imul(wy0 | 0, 19349663)) >>> 0;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const c = sampler.colorAt(wx0 + (i + 0.5) * texel, wy0 + (j + 0.5) * texel);
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    const grain = ((h >>> 8) / 16777216 - 0.5) * 7; // fine grain so surfaces are not smooth gradients
    const o = (j * W + i) * 4;
    d[o] = c[0] + grain; d[o + 1] = c[1] + grain; d[o + 2] = c[2] + grain * 0.8; d[o + 3] = 255;
  }
  return d;
}

/** Map preview / minimap image: terrain plus resource and HQ markers, `px` pixels square. */
export function renderMapPreview(map: MapData, px: number): { w: number; h: number; data: Uint8ClampedArray } {
  const s = new TerrainSampler(map);
  const worldW = map.width * map.tileSize, worldH = map.height * map.tileSize;
  const texel = Math.max(worldW, worldH) / px;
  const W = Math.ceil(worldW / texel), H = Math.ceil(worldH / texel);
  const d = bakeTerrain(s, 0, 0, worldW, worldH, texel);
  const dot = (wx: number, wy: number, r: number, col: RGB) => {
    const cx = wx / texel, cy = wy / texel;
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H || (x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
      const o = (y * W + x) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2];
    }
  };
  // forests as darker canopy in the preview
  for (const p of map.props) if (p.type === 'tree') dot(p.x, p.y, Math.max(0.6, (p.size / texel) * 0.8), [40, 58, 36]);
  for (const n of map.resourceNodes) dot(n.x * map.tileSize + map.tileSize / 2, n.y * map.tileSize + map.tileSize / 2, Math.max(1.5, px / 70), [92, 200, 230]);
  dot(map.playerSpawn.x, map.playerSpawn.y, Math.max(2.5, px / 40), [67, 201, 163]);
  dot(map.enemySpawn.x, map.enemySpawn.y, Math.max(2.5, px / 40), [229, 107, 114]);
  return { w: W, h: H, data: d };
}
