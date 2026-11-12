/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Building, BuildingType } from '../types/game';

/**
 * Military base architecture (V10).
 *
 * Every building type has its own 2.5D design built from real volumes: prisms with a lit roof, a south wall and a darker
 * east wall (cabinet/oblique projection, light from the north-west), cylinders, domes, pipes, ramps and machinery.
 * The projection is the game's existing top-down oblique view: a point at height z is drawn z px up and K*z px right, so the
 * footprint, selection, collision, placement and pathfinding stay exactly as they were. Each design is inset so its roof and
 * east wall stay inside the footprint horizontally.
 *
 * Static geometry is rendered once per (type, faction, size) into a cached sprite; only genuinely animated parts (radar dish,
 * turret barrels, lights, smoke, cranes, flags, conveyor) are drawn live. The construction sequence is a pure function of the
 * building's real `constructionProgress`, so it can never disagree with the game timer.
 */

type Ctx = CanvasRenderingContext2D;
export type Faction = 'player' | 'enemy';

export const K = 0.4; // horizontal shift of the roof per unit of height (east wall width)

/** Highest point of each design above the ground, in px (used for sprite bounds, construction reveal and tests). */
export const ART_HEIGHT: Record<BuildingType, number> = {
  headquarters: 78, power_plant: 60, coin_generator: 58, supply_depot: 40, barracks: 44, field_hospital: 36,
  vehicle_factory: 66, helipad: 26, airfield: 56, research_lab: 56, turret_gun: 28, turret_missile: 40, turret_aa: 32,
  heavy_turret: 44, radar_station: 66, repair_bay: 46, defense_wall: 30,
};

// ───────────────────────── colour helpers ─────────────────────────

const shadeCache = new Map<string, string>();
export function shade(hex: string, f: number): string {
  const key = hex + f;
  const hit = shadeCache.get(key);
  if (hit) return hit;
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  const out = `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
  shadeCache.set(key, out);
  return out;
}
interface Pal { top: string; south: string; east: string; edge: string }
const pal = (base: string): Pal => ({ top: shade(base, 1.2), south: base, east: shade(base, 0.66), edge: shade(base, 0.38) });

const FAC = {
  player: { body: '#8d978d', body2: '#a3aca2', roof: '#6c7a70', accent: '#2fb68a', dark: '#44505a' },
  enemy: { body: '#9b8a84', body2: '#b0a09a', roof: '#7a6560', accent: '#e45b63', dark: '#58464a' },
};
const STEEL = '#7d8993', DARK = '#3b4650', CONCRETE = '#a9afb0', GLASS = '#1c2d3f', ORANGE = '#e0902f', YELLOW = '#f2c230', WHITE = '#dfe5e8';

interface G { w: number; d: number; f: typeof FAC.player; fac: Faction; type: BuildingType }

// ───────────────────────── primitives (origin: footprint top-left on the ground, z up) ─────────────────────────

function poly(c: Ctx, pts: number[], fill: string, stroke?: string, lw = 1) {
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath();
  c.fillStyle = fill; c.fill();
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
}

/** Box with roof, south wall and east wall. x,y,w,d are the ground footprint; z0..z1 the vertical extent. */
function prism(c: Ctx, x: number, y: number, w: number, d: number, z0: number, z1: number, p: Pal, o: { ribs?: number; band?: [number, number, string] } = {}) {
  const b = y + d;
  // south wall
  poly(c, [x + z0 * K, b - z0, x + w + z0 * K, b - z0, x + w + z1 * K, b - z1, x + z1 * K, b - z1], p.south, p.edge, 0.8);
  // east wall
  poly(c, [x + w + z0 * K, b - z0, x + w + z0 * K, y - z0, x + w + z1 * K, y - z1, x + w + z1 * K, b - z1], p.east, p.edge, 0.8);
  // roof
  poly(c, [x + z1 * K, y - z1, x + w + z1 * K, y - z1, x + w + z1 * K, b - z1, x + z1 * K, b - z1], p.top, p.edge, 0.8);
  if (o.ribs) {
    c.strokeStyle = 'rgba(0,0,0,0.22)'; c.lineWidth = 0.8; c.beginPath();
    for (let i = 1; i < o.ribs; i++) { const rx = x + (w * i) / o.ribs; c.moveTo(rx + z0 * K, b - z0); c.lineTo(rx + z1 * K, b - z1); }
    c.stroke();
  }
  if (o.band) { // horizontal band on the south wall (hazard stripe, accent)
    const [zb, zh, col] = o.band;
    poly(c, [x + zb * K, b - zb, x + w + zb * K, b - zb, x + w + (zb + zh) * K, b - zb - zh, x + (zb + zh) * K, b - zb - zh], col);
  }
}

/** Gabled roof along x: ridge at the middle of the depth. */
function ridge(c: Ctx, x: number, y: number, w: number, d: number, z: number, h: number, p: Pal) {
  const b = y + d, m = y + d / 2, zr = z + h;
  poly(c, [x + z * K, b - z, x + w + z * K, b - z, x + w + zr * K, m - zr, x + zr * K, m - zr], p.top, p.edge, 0.8);      // south slope (lit)
  poly(c, [x + zr * K, m - zr, x + w + zr * K, m - zr, x + w + z * K, y - z, x + z * K, y - z], p.east, p.edge, 0.8);    // north slope
  poly(c, [x + w + z * K, b - z, x + w + zr * K, m - zr, x + w + z * K, y - z], shade(p.south, 0.8), p.edge, 0.8);      // east gable
}

/** Vertical cylinder (silo, tank, tower). */
function cyl(c: Ctx, cx: number, cy: number, r: number, z0: number, z1: number, base: string, o: { cap?: string; rings?: number; taper?: number } = {}) {
  const ry = r * 0.5, bx = cx + z0 * K, by = cy - z0, tx = cx + z1 * K, ty = cy - z1, tr = r * (o.taper ?? 1);
  const g = c.createLinearGradient(tx - tr, 0, tx + tr, 0);
  g.addColorStop(0, shade(base, 1.18)); g.addColorStop(0.35, base); g.addColorStop(1, shade(base, 0.58));
  c.beginPath();
  c.moveTo(bx - r, by); c.lineTo(tx - tr, ty); c.lineTo(tx + tr, ty); c.lineTo(bx + r, by);
  c.ellipse(bx, by, r, ry, 0, 0, Math.PI);
  c.closePath();
  c.fillStyle = g; c.fill();
  c.strokeStyle = shade(base, 0.4); c.lineWidth = 0.8; c.stroke();
  if (o.rings) {
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 0.8;
    for (let i = 1; i <= o.rings; i++) { const z = z0 + ((z1 - z0) * i) / (o.rings + 1); const f = (z - z0) / (z1 - z0); const rr = r + (tr - r) * f; c.beginPath(); c.ellipse(cx + z * K, cy - z, rr, rr * 0.5, 0, 0, Math.PI); c.stroke(); }
  }
  c.beginPath(); c.ellipse(tx, ty, tr, tr * 0.5, 0, 0, Math.PI * 2);
  c.fillStyle = o.cap ?? shade(base, 1.28); c.fill(); c.strokeStyle = shade(base, 0.4); c.stroke();
}

function dome(c: Ctx, cx: number, cy: number, z: number, r: number, base: string) {
  const px = cx + z * K, py = cy - z;
  const g = c.createRadialGradient(px - r * 0.35, py - r * 0.5, r * 0.1, px, py - r * 0.2, r * 1.1);
  g.addColorStop(0, shade(base, 1.5)); g.addColorStop(0.6, base); g.addColorStop(1, shade(base, 0.5));
  c.beginPath(); c.ellipse(px, py, r, r * 0.55, 0, 0, Math.PI); c.lineTo(px - r, py);
  c.ellipse(px, py, r, r * 0.95, 0, Math.PI, Math.PI * 2);
  c.fillStyle = g; c.fill(); c.strokeStyle = shade(base, 0.4); c.lineWidth = 0.8; c.stroke();
}

function line(c: Ctx, pts: number[], col: string, lw = 1) {
  c.beginPath(); c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.strokeStyle = col; c.lineWidth = lw; c.stroke();
}
const rect = (c: Ctx, x: number, y: number, w: number, h: number, col: string) => { c.fillStyle = col; c.fillRect(x, y, w, h); };

/** Pad on the ground (flat). */
function pad(c: Ctx, x: number, y: number, w: number, d: number, col: string, lines = true) {
  col = shade(col, 0.84);
  c.fillStyle = col; c.beginPath(); c.roundRect(x, y, w, d, 3); c.fill();
  c.strokeStyle = shade(col, 0.55); c.lineWidth = 1; c.stroke();
  if (lines) { c.strokeStyle = 'rgba(0,0,0,0.16)'; c.lineWidth = 0.6; c.beginPath(); for (let i = 1; i < 4; i++) { c.moveTo(x + (w * i) / 4, y); c.lineTo(x + (w * i) / 4, y + d); } c.stroke(); }
}

/** Window grid on a south wall segment. Returns rects so the live layer can light them. */
function windowRects(x: number, y: number, w: number, d: number, z0: number, z1: number, cols: number, rows: number): number[][] {
  const out: number[][] = [], b = y + d, ww = (w / cols) * 0.5, wh = ((z1 - z0) / rows) * 0.5;
  for (let r = 0; r < rows; r++) for (let i = 0; i < cols; i++) {
    const z = z0 + ((z1 - z0) * (r + 0.28)) / rows;
    out.push([x + (w * (i + 0.25)) / cols + z * K, b - z - wh, ww, wh]);
  }
  return out;
}
function windows(c: Ctx, rs: number[][]) { for (const r of rs) { rect(c, r[0], r[1], r[2], r[3], GLASS); rect(c, r[0], r[1], r[2], 1, 'rgba(255,255,255,0.28)'); } }
function lit(c: Ctx, rs: number[][], t: number, seed: number, col = '#ffd27a') {
  rs.forEach((r, i) => {
    const on = ((Math.floor(t * 0.4 + i * 7 + seed) * 2654435761) >>> 0) % 5 !== 0;
    if (!on) return;
    c.globalAlpha = 0.9; rect(c, r[0], r[1], r[2], r[3], col); c.globalAlpha = 0.18; rect(c, r[0] - 1, r[1] - 1, r[2] + 2, r[3] + 2, col); c.globalAlpha = 1;
  });
}

function mast(c: Ctx, x: number, y: number, z0: number, z1: number, col = '#9aa5ad') { line(c, [x + z0 * K, y - z0, x + z1 * K, y - z1], col, 1.4); }
function beacon(c: Ctx, x: number, y: number, z: number, t: number, col = '#ff4d4d', rate = 1.6) {
  const on = (t * rate) % 1 < 0.35;
  c.globalAlpha = on ? 1 : 0.25; c.fillStyle = col; c.beginPath(); c.arc(x + z * K, y - z, 1.8, 0, Math.PI * 2); c.fill();
  if (on) { c.globalAlpha = 0.25; c.beginPath(); c.arc(x + z * K, y - z, 4.5, 0, Math.PI * 2); c.fill(); }
  c.globalAlpha = 1;
}
function dish(c: Ctx, x: number, y: number, z: number, r: number, ang: number, col = '#d8dee2') {
  const px = x + z * K, py = y - z, ca = Math.cos(ang), sa = Math.sin(ang);
  const rx = r * (0.28 + 0.72 * Math.abs(ca)), ry = r * 0.62;
  const cx = px + sa * r * 0.18, cy = py - r * 0.1;
  c.fillStyle = shade(col, 0.55); c.beginPath(); c.ellipse(cx + 1, cy + 1, rx, ry, -0.35, 0, Math.PI * 2); c.fill();
  const g = c.createRadialGradient(cx - rx * 0.3, cy - ry * 0.3, 1, cx, cy, Math.max(rx, ry));
  g.addColorStop(0, '#ffffff'); g.addColorStop(1, shade(col, 0.7));
  c.fillStyle = g; c.beginPath(); c.ellipse(cx, cy, rx, ry, -0.35, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#5b6770'; c.lineWidth = 0.8; c.stroke();
  line(c, [px, py, cx + ca * r * 0.7, cy - r * 0.45 + sa * 2], '#44505a', 1);
  rect(c, cx + ca * r * 0.7 - 1, cy - r * 0.45 + sa * 2 - 1, 2.4, 2.4, '#f2c230');
}
function smoke(c: Ctx, x: number, y: number, t: number, seed: number, n = 3, col = '180,190,198') {
  for (let i = 0; i < n; i++) {
    const ph = (t * 0.45 + i / n + seed) % 1;
    c.globalAlpha = 0.5 * (1 - ph); c.fillStyle = `rgb(${col})`;
    c.beginPath(); c.arc(x + ph * 9 + Math.sin(ph * 6 + seed) * 2, y - ph * 24, 2.2 + ph * 5, 0, Math.PI * 2); c.fill();
  }
  c.globalAlpha = 1;
}
function hazard(c: Ctx, x: number, y: number, w: number, h: number) {
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
  rect(c, x, y, w, h, YELLOW); c.fillStyle = '#222';
  for (let i = -h; i < w + h; i += 6) { c.beginPath(); c.moveTo(x + i, y + h); c.lineTo(x + i + 3, y + h); c.lineTo(x + i + 3 + h, y); c.lineTo(x + i + h, y); c.fill(); }
  c.restore();
}
function flag(c: Ctx, x: number, y: number, z0: number, z1: number, col: string, t: number) {
  mast(c, x, y, z0, z1, '#dfe5e8');
  const px = x + z1 * K, py = y - z1, w = Math.sin(t * 5) * 1.5;
  poly(c, [px, py, px + 9, py + 1.5 + w, px + 7, py + 4, px + 9, py + 6.5 - w, px, py + 6], col);
}
function crate(c: Ctx, x: number, y: number, s: number, z: number, col: string) { prism(c, x, y, s, s * 0.8, z, z + s * 0.75, pal(col)); }

// ───────────────────────── designs ─────────────────────────
// Each design draws its STATIC geometry in `base` and its animated parts in `live`.

interface Design {
  base: (c: Ctx, g: G) => void;
  live?: (c: Ctx, g: G, t: number, b: LiveState) => void;
  windows?: (g: G) => number[][];
}
interface LiveState { progress: number; level: number; producing: boolean; repairing: boolean; aim: number | null; recoil: number; hpRatio: number; seed: number; neighbors: number }

const iw = (g: G, h: number) => g.w - h * K - 2;

const HQ_WIN = (g: G) => { const W = iw(g, 78); return [...windowRects(6, g.d * 0.3, W - 12, g.d * 0.56, 12, 34, 7, 2), ...windowRects(16, g.d * 0.38, W - 32, g.d * 0.38, 36, 50, 4, 1)]; };

const DESIGNS: Record<BuildingType, Design> = {
  headquarters: {
    windows: HQ_WIN,
    base(c, g) {
      const { f } = g, W = iw(g, 78), d = g.d;
      pad(c, 0, d * 0.08, g.w, d * 0.9, '#8f979a');
      prism(c, 0, d * 0.22, W, d * 0.74, 0, 10, pal('#b4bbbd'), { ribs: 10 });                                  // reinforced podium
      prism(c, 6, d * 0.3, W - 12, d * 0.56, 10, 34, pal(f.body), { ribs: 7, band: [26, 3, f.accent] });         // main hall
      windows(c, HQ_WIN(g).slice(0, 14));
      prism(c, 16, d * 0.38, W - 32, d * 0.38, 34, 50, pal(f.body2), { ribs: 4 });                              // upper command tier
      windows(c, HQ_WIN(g).slice(14));
      prism(c, W - 34, d * 0.36, 20, 20, 50, 66, pal('#6e7c88'));                                                // command tower
      rect(c, W - 34 + 66 * K - 4, d * 0.36 + 20 - 62, 18, 5, '#143a52');                                       // tower glass band
      prism(c, 0, d * 0.52, 14, d * 0.32, 10, 24, pal(f.roof));                                                  // west annex
      prism(c, 8, d * 0.84, 22, 7, 0, 5, pal('#c3c8c9'));                                                        // entrance ramp
      prism(c, W - 12, d * 0.84, 12, 8, 0, 8, pal('#6a747c'));                                                   // guard post
      for (let i = 0; i < 4; i++) rect(c, 12 + i * 5 + 7 * K, d * 0.86 - 7, 2.4, 6, '#475560');                  // pillars
      mast(c, W - 30, d * 0.4, 66, 78); mast(c, W - 22, d * 0.4, 66, 74, '#8b969e');                             // antennas
      mast(c, 20, d * 0.42, 50, 62, '#8b969e');
      c.strokeStyle = '#6a747c'; c.lineWidth = 0.8; c.strokeRect(10 + 50 * K, d * 0.4 - 50, 14, 8);             // roof hatch
    },
    live(c, g, t, s) {
      const W = iw(g, 78), d = g.d;
      dish(c, 36, d * 0.44, 50, 7, t * 0.9 + s.seed);
      beacon(c, W - 30, d * 0.4, 78, t);
      beacon(c, 20, d * 0.42, 62, t, '#ff4d4d', 1.1);
      rect(c, W - 34 + 66 * K - 4, d * 0.36 + 20 - 62, 18, 5, `rgba(80,210,255,${0.65 + 0.3 * Math.sin(t * 3)})`); // tactical display glow
      flag(c, W - 4, d * 0.9, 8, 38, g.f.accent, t);
    },
  },

  barracks: {
    base(c, g) {
      const { f } = g, W = iw(g, 44), d = g.d;
      pad(c, 0, 0, g.w, d, '#9b9a88');                                                                           // training yard (packed earth)
      c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1; c.setLineDash([3, 3]); c.strokeRect(5, d * 0.62, g.w * 0.5, d * 0.3); c.setLineDash([]);
      for (let i = 0; i < 3; i++) rect(c, 8 + i * 9, d * 0.74, 2, 5, '#6d5a3c');                                 // obstacle posts
      line(c, [8, d * 0.76, 28, d * 0.76], '#6d5a3c', 1.4);
      prism(c, 2, d * 0.06, W * 0.58, d * 0.32, 0, 16, pal(f.body), { ribs: 5 });                                // dorm block A
      ridge(c, 2, d * 0.06, W * 0.58, d * 0.32, 16, 10, pal(f.roof));
      prism(c, W * 0.34, d * 0.34, W * 0.62, d * 0.3, 0, 18, pal(f.body2), { ribs: 5, band: [11, 2.5, f.accent] }); // dorm block B
      ridge(c, W * 0.34, d * 0.34, W * 0.62, d * 0.3, 18, 9, pal(f.roof));
      windows(c, windowRects(2, d * 0.06, W * 0.58, d * 0.32, 4, 13, 4, 1));
      windows(c, windowRects(W * 0.34, d * 0.34, W * 0.62, d * 0.3, 4, 15, 4, 1));
      prism(c, W * 0.7, d * 0.7, 14, 9, 0, 3, pal('#b0b4b0'));                                                   // entry ramp
      crate(c, 6, d * 0.4, 7, 0, '#6b5d3b'); crate(c, 14, d * 0.4, 7, 0, '#5b6b45'); crate(c, 10, d * 0.4, 7, 5, '#6b5d3b'); // equipment store
      prism(c, W * 0.2, d * 0.46, 8, 6, 0, 9, pal('#6d7870'));                                                   // guard hut
    },
    live(c, g, t, s) {
      const W = iw(g, 44), d = g.d;
      flag(c, W * 0.9, d * 0.7, 0, 30, g.f.accent, t);
      lit(c, windowRects(2, d * 0.06, W * 0.58, d * 0.32, 4, 13, 4, 1), t, s.seed);
      lit(c, windowRects(W * 0.34, d * 0.34, W * 0.62, d * 0.3, 4, 15, 4, 1), t, s.seed + 3);
      if (s.producing) { c.globalAlpha = 0.8; rect(c, W * 0.7 + 3, d * 0.7 + 1, 8, 2, '#ffd27a'); c.globalAlpha = 1; }
    },
  },

  vehicle_factory: {
    base(c, g) {
      const { f } = g, W = iw(g, 66), d = g.d;
      pad(c, 0, 0, g.w, d, '#8c9194');
      hazard(c, W * 0.2 + 4, d * 0.9, W * 0.45, 3);                                                              // vehicle exit marking
      c.strokeStyle = YELLOW; c.lineWidth = 1; c.setLineDash([6, 5]); line(c, [W * 0.24, d * 0.96, W * 0.62, d * 0.96], YELLOW, 1); c.setLineDash([]);
      prism(c, 2, d * 0.1, W - 4, d * 0.74, 0, 30, pal(f.body), { ribs: 9 });                                    // assembly hall
      for (let i = 0; i < 3; i++) ridge(c, 2 + ((W - 4) * i) / 3, d * 0.1, (W - 4) / 3, d * 0.74, 30, 8, pal(f.roof)); // sawtooth roof
      // reinforced vehicle bay door
      const dx = W * 0.2 + 4, dw = W * 0.42;
      poly(c, [dx, d * 0.84, dx + dw, d * 0.84, dx + dw, d * 0.84 - 22, dx, d * 0.84 - 22], '#2b333a', '#11161a', 1);
      for (let i = 0; i < 6; i++) rect(c, dx + 1, d * 0.84 - 21 + i * 3.4, dw - 2, 1, '#4a5660');                // roll-up slats
      hazard(c, dx, d * 0.84 - 24, dw, 2.6);
      prism(c, W * 0.74, d * 0.34, 14, 18, 30, 44, pal(f.body2));                                                // control room
      windows(c, windowRects(W * 0.74, d * 0.34, 14, 18, 33, 42, 2, 1));
      cyl(c, W * 0.12, d * 0.22, 4, 30, 54, '#7a828a', { cap: '#4a525a' }); cyl(c, W * 0.2, d * 0.22, 4, 30, 62, '#7a828a', { cap: '#4a525a' }); // stacks
      rect(c, W * 0.12 + 54 * K - 4, d * 0.22 - 54, 8, 1.6, f.accent);
      prism(c, W * 0.7, d * 0.6, 10, 10, 30, 36, pal(DARK));                                                     // vents
      line(c, [W * 0.55 + 30 * K, d * 0.1 - 30, W * 0.55 + 56 * K, d * 0.1 - 56], '#d79b2a', 2);                  // gantry mast
    },
    live(c, g, t, s) {
      const W = iw(g, 66), d = g.d;
      const sw = Math.sin(t * (s.producing ? 1.4 : 0.35)) * 12;                                                  // gantry crane jib swings while producing
      const mx = W * 0.55 + 56 * K, my = d * 0.1 - 56;
      line(c, [mx - 14 + sw * 0.4, my + 2, mx + 22 + sw, my + 2], ORANGE, 2.4);
      line(c, [mx + 22 + sw, my + 2, mx + 22 + sw, my + 12 + Math.sin(t * 2) * 4], '#c9d1d6', 0.9);
      rect(c, mx + 20 + sw, my + 12 + Math.sin(t * 2) * 4, 5, 4, '#cfd6da');
      smoke(c, W * 0.12 + 54 * K, d * 0.22 - 54, t, 0.1); smoke(c, W * 0.2 + 62 * K, d * 0.22 - 62, t, 0.5, 3);
      beacon(c, W * 0.12, d * 0.22, 54, t, '#ff7a3a');
      if (s.producing) { const sp = (t * 8) % 1; c.globalAlpha = 1 - sp; rect(c, W * 0.3 + sp * 20, d * 0.84 - 8 - sp * 4, 2, 2, '#ffe07a'); c.globalAlpha = 1; }
      lit(c, windowRects(W * 0.74, d * 0.34, 14, 18, 33, 42, 2, 1), t, s.seed);
    },
  },

  power_plant: {
    base(c, g) {
      const { f } = g, d = g.d, W = iw(g, 60);
      pad(c, 0, 0, g.w, d, '#8e9396');
      prism(c, 3, d * 0.5, W * 0.62, d * 0.38, 0, 20, pal(f.body), { ribs: 5, band: [12, 3, f.accent] });         // generator hall
      cyl(c, W * 0.22, d * 0.36, 11, 0, 46, '#b9bfc1', { rings: 3, taper: 0.78, cap: '#5b6770' });               // cooling towers
      cyl(c, W * 0.58, d * 0.3, 10, 0, 40, '#aab1b4', { rings: 3, taper: 0.8, cap: '#5b6770' });
      line(c, [W * 0.3, d * 0.58 - 14, W * 0.5 + 6, d * 0.46 - 14], '#7d8993', 2.5);                             // pipes
      line(c, [W * 0.3, d * 0.58 - 10, W * 0.5 + 6, d * 0.46 - 10], '#6b7781', 2.5);
      for (let i = 0; i < 3; i++) {                                                                               // transformers with fins
        prism(c, W * 0.7 + i * 9, d * 0.68, 7, 8, 0, 11, pal('#6f7d87'));
        for (let k = 0; k < 3; k++) rect(c, W * 0.7 + i * 9 + 8 * K - 1 + k * 2.2, d * 0.68 + 8 - 11, 0.8, 8, '#44505a');
        rect(c, W * 0.7 + i * 9 + 11 * K + 2.5, d * 0.68 - 11 - 3, 1.5, 4, '#e2e6e9');
      }
      prism(c, W * 0.05, d * 0.82, 16, 7, 0, 7, pal('#7b8691'));                                                 // vent bank
    },
    live(c, g, t, s) {
      const d = g.d, W = iw(g, 60);
      smoke(c, W * 0.22 + 46 * K, d * 0.36 - 46, t, 0.2, 4, '230,236,240');
      smoke(c, W * 0.58 + 40 * K, d * 0.3 - 40, t, 0.6, 4, '230,236,240');
      const pulse = 0.5 + 0.5 * Math.sin(t * 4 + s.seed);                                                         // animated energy indicators
      for (let i = 0; i < 4; i++) { c.fillStyle = `rgba(${i % 2 ? '70,255,170' : '90,200,255'},${0.45 + 0.5 * ((pulse + i * 0.25) % 1)})`; c.beginPath(); c.arc(8 + i * 8 + 18 * K, d * 0.88 - 18 + 0.5, 1.6, 0, Math.PI * 2); c.fill(); }
      c.strokeStyle = `rgba(90,220,255,${0.25 + 0.5 * pulse})`; c.lineWidth = 1;
      c.beginPath(); c.ellipse(W * 0.22 + 20 * K, d * 0.36 - 20, 11, 5.5, 0, 0, Math.PI * 2); c.stroke();
    },
  },

  coin_generator: {
    base(c, g) {
      const { f } = g, d = g.d, W = iw(g, 58);
      pad(c, 0, 0, g.w, d, '#8d9093');
      pad(c, 3, d * 0.72, W * 0.5, d * 0.24, '#767b80', false);                                                  // loading apron
      hazard(c, 5, d * 0.95, W * 0.45, 2.5);
      prism(c, 2, d * 0.36, W * 0.5, d * 0.32, 0, 22, pal(f.body), { ribs: 4, band: [14, 3, f.accent] });         // processing block
      cyl(c, W * 0.64, d * 0.22, 9, 0, 52, '#c4cacd', { rings: 4, cap: '#7b868d' });                              // silos
      cyl(c, W * 0.8, d * 0.34, 9, 0, 44, '#b3babd', { rings: 4, cap: '#7b868d' });
      cyl(c, W * 0.5, d * 0.14, 8, 0, 36, '#a9b0b3', { rings: 3, cap: '#7b868d' });
      cyl(c, W * 0.7, d * 0.66, 11, 0, 12, '#8a6c3a', { cap: '#6b5a40' });                                        // storage tanks
      cyl(c, W * 0.46, d * 0.7, 8, 0, 9, '#6f7d87', { cap: '#55616a' });
      line(c, [W * 0.4 + 22 * K, d * 0.42 - 22, W * 0.62 + 44 * K, d * 0.26 - 44], '#58636b', 4);                  // conveyor gantry
      line(c, [W * 0.4 + 22 * K, d * 0.42 - 22, W * 0.62 + 44 * K, d * 0.26 - 44], '#2b333a', 2);
      line(c, [W * 0.5, d * 0.4 - 22, W * 0.7, d * 0.4 - 12], '#7d8993', 2);                                      // pipes
      mast(c, W * 0.9, d * 0.5, 0, 38, '#7a828a');                                                                 // flare stack
    },
    live(c, g, t) {
      const d = g.d, W = iw(g, 58);
      const x0 = W * 0.4 + 22 * K, y0 = d * 0.42 - 22, x1 = W * 0.62 + 44 * K, y1 = d * 0.26 - 44;
      for (let i = 0; i < 5; i++) { const p = (t * 0.7 + i / 5) % 1; rect(c, x0 + (x1 - x0) * p - 1, y0 + (y1 - y0) * p - 2, 2.4, 2.4, '#e0b23a'); } // ore on the belt
      const fl = 2 + Math.sin(t * 17) * 1.2;
      c.fillStyle = '#f97316'; c.beginPath(); c.ellipse(W * 0.9 + 38 * K, d * 0.5 - 40 - fl, 2.2, 3 + fl, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffd36b'; c.beginPath(); c.ellipse(W * 0.9 + 38 * K, d * 0.5 - 39, 1.1, 1.8, 0, 0, Math.PI * 2); c.fill();
      beacon(c, W * 0.64, d * 0.22, 52, t, '#ffb040', 0.9);
    },
  },

  supply_depot: {
    base(c, g) {
      const { f } = g, d = g.d, W = iw(g, 40);
      pad(c, 0, 0, g.w, d, '#979a97');
      line(c, [1, d - 1, g.w - 1, d - 1], '#56606a', 1.2);                                                         // fence
      for (let i = 0; i < 8; i++) rect(c, 2 + (g.w - 4) * i / 7, d - 5, 1.2, 5, '#56606a');
      prism(c, 3, d * 0.06, W * 0.55, d * 0.4, 0, 20, pal(f.body), { ribs: 5 });                                   // warehouse
      ridge(c, 3, d * 0.06, W * 0.55, d * 0.4, 20, 7, pal(f.roof));
      rect(c, 6 + 20 * K, d * 0.46 - 14, 10, 12, '#2b333a');                                                      // loading door
      const cols = ['#b5533d', '#3f6f8f', '#c79a2f', '#4d7a52', '#8a8f94'];
      for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) {                                                    // container stacks
        const x = 4 + i * 11 + (r ? 4 : 0), y = d * 0.54 + r * 11;
        prism(c, x, y, 10, 5.5, 0, 6, pal(cols[(i + r * 2) % 5]), { ribs: 3 });
        if ((i + r) % 2 === 0) prism(c, x, y, 10, 5.5, 6, 12, pal(cols[(i + r + 2) % 5]), { ribs: 3 });
      }
      prism(c, W * 0.66, d * 0.12, 11, 10, 0, 12, pal('#6f7d87'));                                                 // reinforced store
      cyl(c, W * 0.86, d * 0.2, 5, 0, 14, '#7d8993', { cap: '#56606a' });                                          // fuel drum tank
    },
    live(c, g, t) { const d = g.d; flag(c, 4, d * 0.5, 0, 28, g.f.accent, t); },
  },

  airfield: {
    base(c, g) {
      const { f } = g, d = g.d, W = iw(g, 56);
      pad(c, 0, 0, g.w, d, '#7a7f84');
      rect(c, 4, d * 0.62, g.w - 8, d * 0.3, '#53595f');                                                           // runway
      c.setLineDash([8, 6]); line(c, [8, d * 0.77, g.w - 8, d * 0.77], '#e8ebe9', 1.6); c.setLineDash([]);
      for (let i = 0; i < 5; i++) { rect(c, 7, d * 0.65 + i * 4.5, 8, 1.6, '#e8ebe9'); rect(c, g.w - 15, d * 0.65 + i * 4.5, 8, 1.6, '#e8ebe9'); } // threshold stripes
      for (let i = 0; i < 2; i++) {                                                                                // arched hangars
        const hx = 3 + i * (W * 0.5), hw = W * 0.46;
        prism(c, hx, d * 0.06, hw, d * 0.46, 0, 16, pal(f.body), { ribs: 4 });
        c.beginPath(); c.moveTo(hx + 16 * K, d * 0.52 - 16); c.quadraticCurveTo(hx + hw / 2 + 28 * K, d * 0.52 - 40, hx + hw + 16 * K, d * 0.52 - 16);
        c.lineTo(hx + hw + 16 * K, d * 0.06 - 16); c.quadraticCurveTo(hx + hw / 2 + 28 * K, d * 0.06 - 36, hx + 16 * K, d * 0.06 - 16); c.closePath();
        c.fillStyle = f.roof; c.fill(); c.strokeStyle = shade(f.roof, 0.45); c.lineWidth = 0.8; c.stroke();
        poly(c, [hx + 6, d * 0.52, hx + hw - 6, d * 0.52, hx + hw - 6, d * 0.52 - 12, hx + 6, d * 0.52 - 12], '#2b333a');   // hangar door
        hazard(c, hx + 6, d * 0.52 - 14, hw - 12, 2);
      }
      prism(c, W * 0.93, d * 0.1, 9, 9, 0, 34, pal('#9aa4aa'));                                                     // control tower
      prism(c, W * 0.93 - 1, d * 0.1 - 1, 11, 11, 34, 42, pal('#47647a'));
      c.strokeStyle = '#e8ebe9'; c.lineWidth = 1.2; c.beginPath(); c.arc(W * 0.45, d * 0.77, 6, 0, Math.PI * 2); c.stroke(); // landing pad ring
    },
    live(c, g, t) {
      const d = g.d, W = iw(g, 56);
      beacon(c, W * 0.93 + 5, d * 0.1 + 5, 42, t, '#ff4d4d');
      for (let i = 0; i < 6; i++) { const on = Math.floor(t * 3 + i) % 6 === 0; c.fillStyle = on ? '#fff3b0' : '#6d6a50'; c.fillRect(6 + i * ((g.w - 12) / 5), d * 0.62 - 1.5, 1.8, 1.8); }
      const sw = Math.sin(t * 2) * 2; poly(c, [W * 0.88, d * 0.6, W * 0.88 + 8, d * 0.6 + sw, W * 0.88 + 7, d * 0.6 + 3, W * 0.88, d * 0.6 + 2], '#ff8c3a');
    },
  },

  helipad: {
    base(c, g) {
      const d = g.d;
      pad(c, 0, 0, g.w, d, '#80868a');
      c.fillStyle = '#5a6168'; c.beginPath(); c.arc(g.w * 0.45, d * 0.5, g.w * 0.34, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#f2f4f2'; c.lineWidth = 2; c.stroke();
      c.fillStyle = '#f2f4f2'; c.font = 'bold 14px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('H', g.w * 0.45, d * 0.5 + 1);
      prism(c, g.w * 0.78 - 8, d * 0.08, 10, 8, 0, 9, pal('#6f7d87'));
      cyl(c, g.w * 0.8 - 6, d * 0.78, 4, 0, 10, '#9b5b3b', { cap: '#6a3d28' });                                     // fuel tank
      prism(c, 2, d * 0.74, 14, 8, 0, 8, pal(g.f.body));                                                           // maintenance shed
    },
    live(c, g, t) {
      const d = g.d;
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const on = Math.floor(t * 4) % 8 === i; c.fillStyle = on ? '#fff3b0' : '#7a7a58'; c.beginPath(); c.arc(g.w * 0.45 + Math.cos(a) * g.w * 0.34, d * 0.5 + Math.sin(a) * g.w * 0.34, 1.6, 0, Math.PI * 2); c.fill(); }
      flag(c, g.w * 0.86, d * 0.5, 0, 16, '#ff8c3a', t);
    },
  },

  research_lab: {
    windows: g => windowRects(4, g.d * 0.36, iw(g, 56) * 0.64, g.d * 0.44, 4, 26, 4, 2),
    base(c, g) {
      const { f } = g, d = g.d, W = iw(g, 56);
      pad(c, 0, 0, g.w, d, '#929a9e');
      prism(c, 4, d * 0.36, W * 0.64, d * 0.44, 0, 28, pal('#a9b6bd'), { ribs: 4, band: [20, 3, f.accent] });      // laboratory wing
      windows(c, windowRects(4, d * 0.36, W * 0.64, d * 0.44, 4, 26, 4, 2));
      prism(c, W * 0.5, d * 0.1, W * 0.45, d * 0.36, 0, 38, pal('#8d9aa3'), { ribs: 3 });                          // tall research block
      prism(c, W * 0.5 + 4, d * 0.1 + 3, W * 0.45 - 8, d * 0.36 - 6, 38, 44, pal('#4f7a92'));                       // glass atrium
      dome(c, W * 0.22, d * 0.26, 28, 11, '#cfe4ee');                                                              // lab dome
      for (let i = 0; i < 3; i++) prism(c, 4 + i * 11, d * 0.84, 9, 6, 0, 8, pal('#6f7d87'));                       // cooling units
      mast(c, W * 0.92, d * 0.2, 44, 56);
    },
    live(c, g, t, s) {
      const d = g.d, W = iw(g, 56);
      for (let i = 0; i < 3; i++) { const a = t * 9 + i; const cx = 4 + i * 11 + 4.5 + 8 * K, cy = d * 0.84 + 3 - 8; c.strokeStyle = '#2b333a'; c.lineWidth = 1; c.beginPath(); c.moveTo(cx - Math.cos(a) * 3, cy - Math.sin(a) * 1.5); c.lineTo(cx + Math.cos(a) * 3, cy + Math.sin(a) * 1.5); c.stroke(); }
      beacon(c, W * 0.92, d * 0.2, 56, t, '#5ad2ff', 0.8);
      c.globalAlpha = 0.25 + 0.2 * Math.sin(t * 2 + s.seed); rect(c, W * 0.5 + 4 + 44 * K, d * 0.1 + 3 - 44, W * 0.45 - 8, d * 0.36 - 6, '#7be0ff'); c.globalAlpha = 1;
      lit(c, windowRects(4, d * 0.36, W * 0.64, d * 0.44, 4, 26, 4, 2), t, s.seed, '#a8e8ff');
    },
  },

  turret_gun: { base: (c, g) => turretBase(c, g, 9, 12, '#6b7780'), live: (c, g, t, s) => turretHead(c, g, t, s, { r: 9, z: 12, len: 14, twin: false, w: 2.6 }) },
  turret_missile: {
    base(c, g) {
      const d = g.d;
      pad(c, 0, 0, g.w, d, '#8a9094');
      prism(c, 4, d * 0.3, g.w * 0.55, d * 0.5, 0, 12, pal(g.f.body), { ribs: 4 });
      prism(c, 6, d * 0.34, g.w * 0.5, d * 0.4, 12, 20, pal(g.f.roof));
      for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {                                                    // launch tubes
        const x = 10 + i * 8, y = d * 0.4 + j * 9;
        cyl(c, x + 3, y + 3, 3.2, 20, 31, '#4c5760', { cap: '#15191d' });
      }
      prism(c, g.w * 0.62, d * 0.55, 12, 10, 0, 10, pal('#6f7d87'));                                               // fire-control cabin
    },
    live(c, g, t, s) {
      dish(c, g.w * 0.66, g.d * 0.62, 10 + 18, 6, t * 1.6 + s.seed);
      beacon(c, g.w * 0.66, g.d * 0.55, 40, t, '#ff4d4d');
      if (s.recoil > 0) { c.globalAlpha = s.recoil; c.fillStyle = '#ffd36b'; c.beginPath(); c.arc(16 + 31 * K, g.d * 0.4 + 3 - 33, 5 * s.recoil + 2, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; }
    },
  },
  turret_aa: {
    base: (c, g) => turretBase(c, g, 9, 10, '#667279'),
    live(c, g, t, s) {
      const cx = g.w / 2 - 4, cy = g.d / 2, ang = s.aim ?? t * 0.8 + s.seed;
      const z = 10, px = cx + z * K, py = cy - z;
      c.save(); c.translate(px, py - 3);
      c.fillStyle = '#4a555d'; c.beginPath(); c.ellipse(0, 0, 7, 4.5, 0, 0, Math.PI * 2); c.fill();
      for (const o of [-3, 3]) {
        const bx = Math.cos(ang) * o * 0.4, by = Math.sin(ang) * 1.6;
        line(c, [bx, by, bx + Math.cos(ang) * 3, by - 15 + s.recoil * 2.5], '#20272c', 2.4);
        line(c, [bx + Math.cos(ang) * 3, by - 15, bx + Math.cos(ang) * 3, by - 17], '#8b969e', 1.4);
      }
      c.restore();
      if (s.recoil > 0) { c.globalAlpha = s.recoil; c.fillStyle = '#ffd36b'; c.beginPath(); c.arc(px, py - 20, 3 * s.recoil + 1, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; }
    },
  },
  heavy_turret: {
    base(c, g) {
      const d = g.d;
      pad(c, 0, 0, g.w, d, '#878d90');
      prism(c, 3, d * 0.18, g.w * 0.62, d * 0.64, 0, 16, pal('#9a9f9d'), { ribs: 6 });                             // reinforced concrete bunker
      prism(c, 6, d * 0.24, g.w * 0.62 - 6, d * 0.52, 16, 20, pal('#6e7a72'));
      for (let i = 0; i < 4; i++) rect(c, 8 + i * 8 + 12 * K, d * 0.82 - 12, 4, 3, '#14191d');                       // firing slits
      cyl(c, g.w * 0.5, d * 0.5, 12, 20, 24, '#56626a', { cap: '#3b464e' });                                        // turret ring
      prism(c, g.w * 0.72, d * 0.5, 9, 10, 0, 22, pal('#8b8f8d'));                                                   // watchtower
      prism(c, g.w * 0.72 - 1, d * 0.5 - 1, 11, 12, 22, 27, pal(g.f.roof));
    },
    live: (c, g, t, s) => turretHead(c, g, t, s, { r: 11, z: 24, len: 21, twin: true, w: 3.6, cxf: 0.5, cyf: 0.5 }),
  },
  radar_station: {
    base(c, g) {
      const { f } = g, d = g.d, W = iw(g, 66);
      pad(c, 0, 0, g.w, d, '#8f979b');
      prism(c, 3, d * 0.42, W * 0.7, d * 0.46, 0, 20, pal(f.body), { ribs: 5, band: [12, 3, f.accent] });         // communications building
      windows(c, windowRects(3, d * 0.42, W * 0.7, d * 0.46, 4, 16, 4, 1));
      prism(c, W * 0.34, d * 0.2, 12, 12, 20, 50, pal('#aeb6b9'));                                                  // sensor tower
      mast(c, W * 0.34 + 6, d * 0.26, 50, 66);
      for (let i = 0; i < 2; i++) mast(c, 8 + i * 12, d * 0.5, 20, 34 + i * 6, '#8b969e');                         // antennas
      prism(c, W * 0.76, d * 0.62, 12, 9, 0, 9, pal('#6f7d87'));                                                    // generator
      c.strokeStyle = '#7d8993'; c.lineWidth = 1; c.strokeRect(W * 0.74, d * 0.6, 17, 14);                          // fence
    },
    live(c, g, t, s) {
      const d = g.d, W = iw(g, 66);
      dish(c, W * 0.34 + 6, d * 0.26, 54, 14, t * 1.5 + s.seed, '#e6ebee');
      beacon(c, W * 0.34 + 6, d * 0.26, 66, t, '#ff4d4d');
      for (let i = 0; i < 2; i++) beacon(c, 8 + i * 12, d * 0.5, 34 + i * 6 + 1, t + i * 0.3, '#5ad2ff', 1.2);
      lit(c, windowRects(3, d * 0.42, W * 0.7, d * 0.46, 4, 16, 4, 1), t, s.seed, '#9fe3ff');
    },
  },

  repair_bay: {
    base(c, g) {
      const { f } = g, d = g.d, W = iw(g, 46);
      pad(c, 0, 0, g.w, d, '#8e969a');
      hazard(c, 6, d * 0.9, W * 0.55, 2.5);
      prism(c, 3, d * 0.1, W * 0.78, d * 0.2, 0, 26, pal(f.body));                                                 // back wall
      prism(c, 3, d * 0.1, 7, d * 0.7, 0, 26, pal(f.body2));                                                       // side pillars
      prism(c, W * 0.78 - 4, d * 0.1, 7, d * 0.7, 0, 26, pal(f.body2));
      prism(c, 3, d * 0.5, W * 0.78, 6, 24, 30, pal('#d79b2a'));                                                    // gantry arch beam
      prism(c, W * 0.8, d * 0.48, 12, 12, 0, 12, pal('#6f7d87'));                                                   // tool shed
      rect(c, W * 0.8 + 12 * K + 2, d * 0.48 + 12 - 8, 4, 3, '#14191d');
      prism(c, 12, d * 0.62, W * 0.55, d * 0.22, 0, 3, pal('#5f676d'));                                             // service floor
    },
    live(c, g, t, s) {
      const d = g.d, W = iw(g, 46), x = 10 + (Math.sin(t * 1.3) * 0.5 + 0.5) * W * 0.5;
      line(c, [x + 28 * K, d * 0.5 - 28, x + 16 * K, d * 0.62 - 16 + Math.sin(t * 3) * 2], ORANGE, 2.4);               // robotic arm
      c.fillStyle = '#e8ebe9'; c.beginPath(); c.arc(x + 16 * K, d * 0.62 - 16 + Math.sin(t * 3) * 2, 1.8, 0, Math.PI * 2); c.fill();
      if (s.repairing || s.producing || Math.sin(t * 2.4) > 0.7) { c.fillStyle = '#fff3b0'; for (let i = 0; i < 3; i++) c.fillRect(x + 16 * K + Math.sin(t * 40 + i) * 4, d * 0.62 - 14 + Math.cos(t * 33 + i) * 3, 1.2, 1.2); }
      beacon(c, 6, d * 0.2, 26, t, '#f2c230', 1.4);
    },
  },

  field_hospital: {
    base(c, g) {
      const d = g.d, W = iw(g, 36);
      pad(c, 0, 0, g.w, d, '#a2a8a6');
      prism(c, 3, d * 0.1, W * 0.62, d * 0.46, 0, 22, pal('#e4e8e8'), { ribs: 4, band: [14, 2.5, '#d9444b'] });     // clinic block
      windows(c, windowRects(3, d * 0.1, W * 0.62, d * 0.46, 4, 17, 4, 1));
      // red cross on the roof
      const rx = 3 + W * 0.31 + 22 * K, ry = d * 0.1 + d * 0.23 - 22;
      rect(c, rx - 7, ry - 2.2, 14, 4.4, '#d9444b'); rect(c, rx - 2.2, ry - 7, 4.4, 14, '#d9444b');
      poly(c, [W * 0.66, d * 0.58, W * 0.96, d * 0.58, W * 0.96 - 4, d * 0.58 - 14, W * 0.66 + 4, d * 0.58 - 14], '#cfd6c9', '#6a7568');            // ward tent
      poly(c, [W * 0.66 + 4, d * 0.58 - 14, W * 0.81, d * 0.58 - 22, W * 0.96 - 4, d * 0.58 - 14], '#e8ece2', '#6a7568');
      prism(c, 4, d * 0.66, 18, 9, 0, 9, pal('#e8ebea'), { band: [4, 2, '#d9444b'] });                               // ambulance bay vehicle
      hazard(c, 3, d * 0.9, 22, 2.4);
    },
    live(c, g, t) { const d = g.d; flag(c, g.w * 0.82, d * 0.62, 0, 26, g.f.accent, t); beacon(c, 6, d * 0.66 + 4, 9, t, '#ff3d4d', 2.2); beacon(c, 18, d * 0.66 + 4, 9, t + 0.3, '#4da3ff', 2.2); },
  },

  defense_wall: {
    base(c, g) {
      const s = g.w;
      prism(c, 3, 3, s - 8, s - 8, 0, 15, pal('#9ba0a1'), { ribs: 2, band: [10, 2, g.f.accent] });
      for (let i = 0; i < 3; i++) rect(c, 6 + i * 8 + 12 * K, s - 5 - 12, 1.6, 4, '#2b333a');
    },
    live(c, g, t, s) {
      // modular connection: pillars and joiners towards neighbouring wall pieces (bit 1 N, 2 E, 4 S, 8 W)
      const w = g.w, n = s.neighbors;
      const post = (x: number, y: number) => prism(c, x, y, 7, 7, 0, 22, pal('#8a9092'));
      if (n & 2) prism(c, w - 6, w * 0.32, 10, w * 0.36, 0, 12, pal('#9ba0a1'));
      if (n & 8) prism(c, -4, w * 0.32, 10, w * 0.36, 0, 12, pal('#9ba0a1'));
      if (n & 1) prism(c, w * 0.32, -4, w * 0.36, 10, 0, 12, pal('#9ba0a1'));
      if (n & 4) prism(c, w * 0.32, w - 6, w * 0.36, 10, 0, 12, pal('#9ba0a1'));
      const bits = (n & 1 ? 1 : 0) + (n & 2 ? 1 : 0) + (n & 4 ? 1 : 0) + (n & 8 ? 1 : 0);
      if (bits !== 2 || ((n & 5) === 5 || (n & 10) === 10) === false) {                                              // corners / ends / junctions become watchtowers
        post(w * 0.5 - 3, w * 0.5 - 4);
        prism(c, w * 0.5 - 5, w * 0.5 - 6, 11, 11, 22, 27, pal(g.f.roof));
        beacon(c, w * 0.5, w * 0.5, 27, t, g.f.accent, 0.7);
      }
    },
  },
};

// ───────────────────────── turrets ─────────────────────────

function turretBase(c: Ctx, g: G, r: number, z: number, col: string) {
  const cx = g.w / 2 - 4, cy = g.d / 2;
  pad(c, 0, 0, g.w, g.d, '#878d90', false);
  cyl(c, cx, cy + 3, r + 4, 0, 6, '#9aa0a2', { cap: '#7b8185', rings: 1 });                                         // concrete emplacement
  cyl(c, cx, cy + 3, r, 6, z - 2, col, { cap: '#4d5961', rings: 1 });                                               // armoured drum
  rect(c, cx - r + 6 * K, cy + 3 - 6 * 0.5 - 4, r * 2, 1.8, g.f.accent);                                             // faction band
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; rect(c, cx + Math.cos(a) * (r + 3) + 6 * K - 1, cy + 3 + Math.sin(a) * (r + 3) * 0.5 - 4, 2.5, 2, '#3a4249'); } // sandbag ring
}

function turretHead(c: Ctx, g: G, t: number, s: LiveState, o: { r: number; z: number; len: number; twin: boolean; w: number; cxf?: number; cyf?: number }) {
  const cx = g.w * (o.cxf ?? 0.5) - (o.cxf ? 0 : 4), cy = g.d * (o.cyf ?? 0.5) + (o.cyf ? 0 : 3);
  const ang = s.aim ?? Math.sin(t * 0.5 + s.seed) * 0.6 + 0.9;                                                      // tracks its target, otherwise sweeps slowly
  const px = cx + o.z * K, py = cy - o.z;
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const recoil = s.recoil * 3.2;
  c.fillStyle = '#4b565e'; c.beginPath(); c.ellipse(px, py, o.r * 0.78, o.r * 0.42, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#20272c'; c.lineWidth = 0.8; c.stroke();
  const offs = o.twin ? [-2.4, 2.4] : [0];
  for (const off of offs) {
    const bx = px - sa * off * 0.5 - ca * recoil, by = py + ca * off * 0.5 - sa * 0.5 * recoil - 1;
    const ex = bx + ca * o.len, ey = by + sa * o.len * 0.85;
    line(c, [bx, by, ex, ey], '#1a2024', o.w + 1.2); line(c, [bx, by, ex, ey], '#6d7b85', o.w);
    line(c, [ex - ca * 3, ey - sa * 1.5, ex, ey], '#2a3237', o.w + 1);
    if (s.recoil > 0.35) {
      c.globalAlpha = s.recoil; c.fillStyle = '#ffd36b'; c.beginPath(); c.ellipse(ex + ca * 3, ey + sa * 1.5, 3.8 * s.recoil + 1, 2.2 * s.recoil + 1, ang * 0.5, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(ex + ca * 2, ey + sa, 1.4, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
    }
  }
  c.fillStyle = '#6d7b85'; c.beginPath(); c.ellipse(px, py - 1.5, o.r * 0.5, o.r * 0.3, 0, 0, Math.PI * 2); c.fill();   // targeting hatch
  c.fillStyle = s.aim !== null ? '#ff4d4d' : '#2fe08a'; c.fillRect(px - 1, py - 3.5, 2, 1.6);                         // sight lamp: red while locked on
}

// ───────────────────────── construction ─────────────────────────

export type ConstructionStage = 'foundation' | 'assembly' | 'finishing' | 'operational';
/** Pure mapping of the REAL construction progress (0..1) to a visual stage and how much of the structure is built. */
export function constructionStage(p: number): { stage: ConstructionStage; built: number; scaffold: number } {
  const q = Math.max(0, Math.min(1, Number.isFinite(p) ? p : 1));
  if (q >= 1) return { stage: 'operational', built: 1, scaffold: 0 };
  if (q < 0.2) return { stage: 'foundation', built: 0, scaffold: 0.35 + q };
  if (q < 0.9) return { stage: 'assembly', built: (q - 0.2) / 0.7, scaffold: 1 };
  return { stage: 'finishing', built: 1, scaffold: (1 - q) / 0.1 };
}

// ───────────────────────── sprite cache and public drawing API ─────────────────────────

const SPR = 2;           // sprite supersampling
const MARGIN = 14;
export interface ArtOptions { aim?: number | null; recoil?: number; neighbors?: number; quality?: 'low' | 'medium' | 'high' | 'ultra' | 'auto' }

const sprites = new Map<string, HTMLCanvasElement>();
const holograms = new Map<string, HTMLCanvasElement>();
export const artCacheSize = () => sprites.size + holograms.size;

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(w * SPR); cv.height = Math.ceil(h * SPR);
  return cv;
}
const geom = (type: BuildingType, w: number, d: number, fac: Faction): G => ({ w, d, f: FAC[fac], fac, type });

function getSprite(type: BuildingType, fac: Faction, w: number, d: number): HTMLCanvasElement {
  const key = `${type}|${fac}|${w}x${d}`;
  let cv = sprites.get(key);
  if (cv) return cv;
  const H = ART_HEIGHT[type];
  cv = makeCanvas(w + MARGIN * 2, d + H + MARGIN * 2);
  const c = cv.getContext('2d')!;
  c.scale(SPR, SPR);
  c.translate(MARGIN, MARGIN + H);
  c.lineJoin = 'round';
  DESIGNS[type].base(c, geom(type, w, d, fac));
  sprites.set(key, cv);
  return cv;
}

/** Ghost used for placement: the real design tinted green (valid) or red (blocked). */
export function getHologram(type: BuildingType, w: number, d: number, valid: boolean): HTMLCanvasElement {
  const key = `${type}|${w}x${d}|${valid}`;
  let cv = holograms.get(key);
  if (cv) return cv;
  const src = getSprite(type, 'player', w, d);
  cv = document.createElement('canvas'); cv.width = src.width; cv.height = src.height;
  const c = cv.getContext('2d')!;
  c.drawImage(src, 0, 0);
  c.globalCompositeOperation = 'source-atop';
  c.fillStyle = valid ? 'rgba(40,255,170,0.45)' : 'rgba(255,60,70,0.5)';
  c.fillRect(0, 0, cv.width, cv.height);
  holograms.set(key, cv);
  return cv;
}

const hashSeed = (b: Building) => Math.abs(Math.sin(b.x * 12.9898 + b.y * 78.233) * 43758.5453) % 1;

/**
 * Draw one building. (x,y) is the top-left of its footprint in world px, (w,d) the footprint size.
 * Draws: ground apron + volumes + live animation, or the staged construction sequence from `b.constructionProgress`.
 */
export function drawBuildingArt(c: Ctx, b: Building, x: number, y: number, w: number, d: number, t: number, o: ArtOptions = {}): void {
  const fac: Faction = b.faction === 'enemy' ? 'enemy' : 'player';
  const H = ART_HEIGHT[b.type];
  const spr = getSprite(b.type, fac, w, d);
  const ox = x - MARGIN, oy = y - MARGIN - H;
  const cw = w + MARGIN * 2, ch = d + H + MARGIN * 2;
  const g = geom(b.type, w, d, fac);
  const { stage, built, scaffold } = constructionStage(b.constructionProgress);
  const seed = hashSeed(b);
  const state: LiveState = {
    progress: b.constructionProgress, level: b.level ?? 1, producing: (b.productionQueue?.length ?? 0) > 0, repairing: !!b.isRepairing,
    aim: o.aim ?? null, recoil: o.recoil ?? 0, hpRatio: b.maxHp > 0 ? b.hp / b.maxHp : 1, seed: seed * 10, neighbors: o.neighbors ?? 0,
  };

  if (stage === 'operational') {
    c.drawImage(spr, ox, oy, cw, ch);
    c.save(); c.translate(x, y + 0);
    DESIGNS[b.type].live?.(c, g, t, state);
    if (state.level > 1) drawLevelMarks(c, g, state.level);
    c.restore();
    return;
  }

  // ── construction: ground preparation, foundation, progressive assembly, scaffolding, crane, finishing ──
  c.save();
  // prepared ground and hazard-taped footprint
  c.fillStyle = 'rgba(92,72,48,0.85)'; c.beginPath(); c.roundRect(x + 1, y + 1, w - 2, d - 2, 3); c.fill();
  const pour = stage === 'foundation' ? b.constructionProgress / 0.2 : 1;               // concrete pour grows across the footprint
  c.fillStyle = '#a9afb0'; c.beginPath(); c.roundRect(x + 3, y + 3, (w - 6) * Math.min(1, 0.15 + pour * 0.85), d - 6, 2); c.fill();
  c.strokeStyle = '#f2c230'; c.lineWidth = 1.4; c.setLineDash([5, 4]); c.strokeRect(x + 0.5, y + 0.5, w - 1, d - 1); c.setLineDash([]);
  if (stage === 'foundation') {                                                           // rebar grid / formwork stakes
    c.strokeStyle = 'rgba(60,40,28,0.7)'; c.lineWidth = 1;
    for (let i = 1; i < 5; i++) { c.beginPath(); c.moveTo(x + (w * i) / 5, y + 3); c.lineTo(x + (w * i) / 5, y + d - 3); c.stroke(); }
    for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(x + 3, y + (d * i) / 4); c.lineTo(x + w - 3, y + (d * i) / 4); c.stroke(); }
  }
  if (built > 0) {
    // reveal the real design from the ground up
    const top = oy, cut = top + (1 - built) * ch;
    c.save(); c.beginPath(); c.rect(ox, cut, cw, ch - (cut - top)); c.clip();
    c.drawImage(spr, ox, oy, cw, ch);
    c.restore();
    if (stage === 'assembly') {                                                           // welding line at the build height
      c.strokeStyle = 'rgba(255,190,80,0.9)'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(ox + MARGIN, cut); c.lineTo(ox + cw - MARGIN, cut); c.stroke();
      for (let i = 0; i < 4; i++) { const sx = ox + MARGIN + ((t * 40 + i * 31) % (cw - MARGIN * 2)); c.fillStyle = '#fff3b0'; c.fillRect(sx, cut - ((t * 23 + i * 7) % 6), 1.4, 1.4); }
    }
  }
  if (scaffold > 0) {                                          // scaffolding over the unbuilt volume
    const top = oy + MARGIN * 0.6, bottom = y + d;
    const cutY = stage === 'foundation' ? bottom - 18 * scaffold : oy + (1 - built) * ch;
    c.globalAlpha = Math.min(1, 0.25 + scaffold * 0.75); c.strokeStyle = '#d8a43a'; c.lineWidth = 1.1;
    const poles = Math.max(3, Math.round(w / 22));
    for (let i = 0; i <= poles; i++) { const px = x + 2 + ((w - 4) * i) / poles; c.beginPath(); c.moveTo(px, bottom); c.lineTo(px + (stage === 'foundation' ? 0 : H * K * 0.3), Math.max(top, cutY - 6)); c.stroke(); }
    for (let yy = bottom - 12; yy > Math.max(top, cutY - 8); yy -= 14) { c.beginPath(); c.moveTo(x + 2, yy); c.lineTo(x + w - 2, yy); c.stroke(); }
    c.strokeStyle = 'rgba(216,164,58,0.55)'; c.beginPath(); c.moveTo(x + 2, bottom); c.lineTo(x + w - 2, Math.max(top, cutY - 6)); c.stroke();
    c.globalAlpha = 1;
  }
  // tower crane with a moving hook (only while there is something to lift)
  const cx = x + w - 6, ctop = y + d - Math.min(H + 10, 56);
  c.globalAlpha = stage === 'finishing' ? scaffold : 1;
  c.strokeStyle = '#f2b02a'; c.lineWidth = 2.2; c.beginPath(); c.moveTo(cx, y + d - 2); c.lineTo(cx, ctop); c.stroke();
  c.lineWidth = 2; c.beginPath(); c.moveTo(cx - w * 0.7, ctop); c.lineTo(cx + 6, ctop); c.stroke();
  const hx = cx - w * (0.18 + 0.34 * (0.5 + 0.5 * Math.sin(t * 0.9 + seed * 6)));
  const hy = ctop + (y + d - ctop) * (0.35 + 0.35 * (0.5 + 0.5 * Math.sin(t * 1.3 + seed)));
  c.strokeStyle = '#c9d1d6'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(hx, ctop); c.lineTo(hx, hy); c.stroke();
  c.fillStyle = '#cfd6da'; c.fillRect(hx - 2.5, hy, 5, 4); c.fillStyle = '#e0902f'; c.fillRect(hx - 4, hy + 4, 8, 3);
  c.globalAlpha = 1;
  // construction vehicle shuttling along the front
  const vx = x + 8 + ((Math.sin(t * 0.8 + seed * 5) * 0.5 + 0.5) * Math.max(10, w - 34));
  c.fillStyle = '#f2b02a'; c.fillRect(vx, y + d - 7, 14, 6); c.fillStyle = '#2b333a'; c.fillRect(vx + 1, y + d - 2, 4, 2); c.fillRect(vx + 9, y + d - 2, 4, 2);
  c.strokeStyle = '#f2b02a'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(vx + 11, y + d - 6); c.lineTo(vx + 17, y + d - 12 + Math.sin(t * 3) * 3); c.stroke();
  c.restore();
}

function drawLevelMarks(c: Ctx, g: G, level: number) {
  for (let i = 0; i < Math.min(4, level - 1); i++) {
    const x = 3 + i * 6, y = g.d - 3;
    poly(c, [x, y, x + 5, y, x + 2.5, y - 4], '#ffd36b', '#6b5420', 0.6);
  }
}

/** For the placement hologram and for tests. */
export function drawHologram(c: Ctx, type: BuildingType, x: number, y: number, w: number, d: number, valid: boolean, t: number): void {
  const H = ART_HEIGHT[type];
  c.save();
  c.globalAlpha = 0.62 + 0.12 * Math.sin(t * 5);
  c.drawImage(getHologram(type, w, d, valid), x - MARGIN, y - MARGIN - H, w + MARGIN * 2, d + H + MARGIN * 2);
  c.restore();
}

/** Neighbour bit mask (1 N, 2 E, 4 S, 8 W) of same-faction walls, for modular wall connections. */
export function wallNeighbors(b: Building, index: Map<string, Building>): number {
  let m = 0;
  const has = (dx: number, dy: number) => { const o = index.get(`${b.faction}:${b.x + dx}:${b.y + dy}`); return o && o.type === 'defense_wall' ? 1 : 0; };
  if (has(0, -1)) m |= 1; if (has(1, 0)) m |= 2; if (has(0, 1)) m |= 4; if (has(-1, 0)) m |= 8;
  return m;
}

export const BUILDING_ART_TYPES = Object.keys(DESIGNS) as BuildingType[];
/** Test hook: draw the static and live layers of a design on any 2D context. */
export function __drawDesignForTest(c: Ctx, type: BuildingType, fac: Faction, w: number, d: number, t: number, s: Partial<LiveState> = {}): void {
  const g = geom(type, w, d, fac);
  DESIGNS[type].base(c, g);
  DESIGNS[type].live?.(c, g, t, { progress: 1, level: 1, producing: false, repairing: false, aim: null, recoil: 0, hpRatio: 1, seed: 1, neighbors: 0, ...s });
}
