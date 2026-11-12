/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Building, BuildingType } from '../types/game';

/**
 * Military base architecture (V10.1 - "modern military realism").
 *
 * Why V10 still looked like a cartoon: flat single-colour faces, dark outlines around every shape, bright saturated accents,
 * light uniform pads and exaggerated proportions. V10.1 replaces the drawing primitives with a small material pipeline:
 *
 *  - MATERIALS (concrete, corrugated steel, slate roofing, armour plate, galvanised metal): every face gets a lighting
 *    gradient (walls darken towards the ground = ambient occlusion), a procedural surface texture (form-work joints,
 *    corrugation, roof seams, grain), weathering (rain streaks, dust at the wall base, roof stains) and hairline edges with a
 *    lit top edge instead of outlines.
 *  - LIGHT: one sun (north-west). Each volume casts a soft shadow onto whatever is below it (ground slab or lower roofs).
 *  - GROUND: buildings stand on weathered concrete slabs with expansion joints, stains and a dusty feathered rim.
 *  - A film-grain pass over the finished sprite removes the "vector illustration" flatness.
 *
 * Projection is the game's existing top-down oblique view (a point at height z is drawn z px up and K*z px right), so
 * footprint, selection, collision, placement and pathfinding are untouched. All of the expensive work happens once per
 * (type, faction, size) into a cached sprite; only moving parts are drawn per frame.
 */

type Ctx = CanvasRenderingContext2D;
export type Faction = 'player' | 'enemy';

export const K = 0.4; // horizontal shift per unit of height (width of the visible east wall)

/** Highest point of each design above the ground, in px. */
export const ART_HEIGHT: Record<BuildingType, number> = {
  headquarters: 66, power_plant: 42, coin_generator: 44, supply_depot: 30, barracks: 26, field_hospital: 28,
  vehicle_factory: 46, helipad: 18, airfield: 40, research_lab: 44, turret_gun: 24, turret_missile: 34, turret_aa: 28,
  heavy_turret: 34, radar_station: 58, repair_bay: 34, defense_wall: 24,
};

// ───────────────────────── colour + deterministic noise ─────────────────────────

const shadeCache = new Map<string, string>();
export function shade(hex: string, f: number): string {
  const key = hex + f.toFixed(3);
  const hit = shadeCache.get(key);
  if (hit) return hit;
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  const out = `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
  shadeCache.set(key, out);
  return out;
}
let rngState = 1;
const seedRng = (s: number) => { rngState = (s >>> 0) || 1; };
const rnd = () => { rngState = (rngState * 1664525 + 1013904223) >>> 0; return rngState / 4294967296; };

type Kind = 'concrete' | 'corrugated' | 'slate' | 'armor' | 'galv' | 'paint';
interface Mat { base: string; kind: Kind }
const M = (base: string, kind: Kind = 'concrete'): Mat => ({ base, kind });

/** Muted military palette. Faction identity is carried by restrained paint bands and flags only. */
const FAC = {
  player: { wall: '#6f7566', wall2: '#7b8072', armor: '#59624f', accent: '#3f8a72' },
  enemy: { wall: '#7d7166', wall2: '#897c70', armor: '#6a584b', accent: '#9c4a4a' },
};
const CONCRETE = '#8b8a84', CONCRETE_D = '#75746e', CONCRETE_L = '#9c9b94';
const STEEL = '#6a7177', GUNMETAL = '#4a5056', SLATE = '#434a4f', GALV = '#8e969a';
const WARN = '#c2a033', GLASS = '#18222b', WARM = '#ffe6bd', RUST = '#7a4a30';

interface G { w: number; d: number; f: typeof FAC.player; fac: Faction; type: BuildingType }

// ───────────────────────── material pipeline ─────────────────────────

const hasDom = typeof document !== 'undefined';
let grainCanvas: HTMLCanvasElement | null = null;
function grain(): HTMLCanvasElement | null {
  if (!hasDom) return null;
  if (grainCanvas) return grainCanvas;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const c = cv.getContext('2d')!; const img = c.createImageData(64, 64);
  let s = 12345;
  for (let i = 0; i < img.data.length; i += 4) {
    s = (s * 1664525 + 1013904223) >>> 0; const v = s / 4294967296;
    const dark = v < 0.5; img.data[i] = img.data[i + 1] = img.data[i + 2] = dark ? 0 : 255; img.data[i + 3] = Math.round(Math.abs(v - 0.5) * 2 * 34);
  }
  c.putImageData(img, 0, 0);
  grainCanvas = cv;
  return cv;
}
const soft = (c: Ctx, px: number) => { if ('filter' in c) (c as any).filter = px > 0 ? `blur(${px}px)` : 'none'; };

function path(c: Ctx, pts: number[]) {
  c.beginPath(); c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath();
}

/** One lit, textured, weathered face. `orient` selects the lighting; no outlines, only hairline edges. */
function face(c: Ctx, pts: number[], m: Mat, orient: 'top' | 'south' | 'east', lightF = 1) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < pts.length; i += 2) { x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]); }
  const f = lightF * (orient === 'top' ? 1.12 : orient === 'south' ? 0.92 : 0.6);
  const g = orient === 'top' ? c.createLinearGradient(x0, y0, x1, y1) : c.createLinearGradient(0, y0, 0, y1);
  if (orient === 'top') { g.addColorStop(0, shade(m.base, f * 1.05)); g.addColorStop(1, shade(m.base, f * 0.93)); }
  else { g.addColorStop(0, shade(m.base, f * 1.04)); g.addColorStop(0.7, shade(m.base, f * 0.9)); g.addColorStop(1, shade(m.base, f * 0.72)); } // AO towards the ground
  path(c, pts); c.fillStyle = g; c.fill();

  c.save(); path(c, pts); c.clip();
  const w = x1 - x0, h = y1 - y0;
  // surface texture
  if (m.kind === 'corrugated' || m.kind === 'galv') {
    const step = m.kind === 'galv' ? 3.2 : 2.4;
    c.lineWidth = 0.5; c.strokeStyle = 'rgba(0,0,0,0.16)'; c.beginPath();
    for (let x = x0 - h; x < x1 + 2; x += step) { c.moveTo(x, y1); c.lineTo(x + (orient === 'top' ? 0 : h * K), y0); }
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.07)'; c.beginPath();
    for (let x = x0 - h + step / 2; x < x1 + 2; x += step) { c.moveTo(x, y1); c.lineTo(x + (orient === 'top' ? 0 : h * K), y0); }
    c.stroke();
  } else if (m.kind === 'concrete') {
    c.lineWidth = 0.5; c.strokeStyle = 'rgba(0,0,0,0.09)'; c.beginPath();
    if (orient !== 'top') { for (let y = y1 - 7; y > y0; y -= 7) { c.moveTo(x0, y); c.lineTo(x1, y); } }                   // form-work lift lines
    for (let x = x0 + 14 + rnd() * 6; x < x1; x += 16 + rnd() * 6) { c.moveTo(x, y0); c.lineTo(x, y1); }                    // panel joints
    c.stroke();
  } else if (m.kind === 'slate') {
    c.lineWidth = 0.5; c.strokeStyle = 'rgba(0,0,0,0.14)'; c.beginPath();
    for (let x = x0 + 9; x < x1; x += 9) { c.moveTo(x, y0); c.lineTo(x, y1); }
    c.stroke();
  } else if (m.kind === 'armor') {
    c.fillStyle = 'rgba(0,0,0,0.22)';
    for (let x = x0 + 3; x < x1 - 1; x += 7) { c.fillRect(x, y0 + 2, 0.9, 0.9); c.fillRect(x, y1 - 3, 0.9, 0.9); }           // bolt rows
  }
  // weathering
  if (orient !== 'top' && h > 5) {
    const n = Math.max(1, Math.round(w / 12));
    for (let i = 0; i < n; i++) {                                                                                           // rain / rust streaks from the top edge
      const sx = x0 + rnd() * w, len = h * (0.3 + rnd() * 0.6), sw = 0.8 + rnd() * 1.8;
      const sg = c.createLinearGradient(0, y0, 0, y0 + len);
      const rust = m.kind !== 'concrete' && rnd() < 0.3;
      sg.addColorStop(0, rust ? 'rgba(110,62,34,0.26)' : 'rgba(20,20,18,0.2)'); sg.addColorStop(1, 'rgba(20,20,18,0)');
      c.fillStyle = sg; c.fillRect(sx, y0, sw, len);
    }
    const dh = Math.min(h * 0.35, 7), dg = c.createLinearGradient(0, y1 - dh, 0, y1);                                       // dust at the wall base
    dg.addColorStop(0, 'rgba(104,92,68,0)'); dg.addColorStop(1, 'rgba(104,92,68,0.3)');
    c.fillStyle = dg; c.fillRect(x0, y1 - dh, w, dh);
  } else if (orient === 'top' && w * h > 120) {
    const n = Math.round((w * h) / 500) + 1;
    for (let i = 0; i < n; i++) {                                                                                           // roof stains / patches
      c.fillStyle = rnd() < 0.5 ? 'rgba(15,15,14,0.09)' : 'rgba(210,205,190,0.06)';
      c.beginPath(); c.ellipse(x0 + rnd() * w, y0 + rnd() * h, 2 + rnd() * 6, 1.5 + rnd() * 4, rnd() * 3, 0, Math.PI * 2); c.fill();
    }
  }
  const gr = grain();
  if (gr) { const p = c.createPattern(gr, 'repeat'); if (p) { c.globalAlpha = m.kind === 'concrete' ? 0.5 : 0.35; c.fillStyle = p; c.fillRect(x0, y0, w, h); c.globalAlpha = 1; } }
  c.restore();
  path(c, pts); c.strokeStyle = 'rgba(12,14,16,0.3)'; c.lineWidth = 0.5; c.stroke();
  if (orient !== 'top') { c.strokeStyle = 'rgba(255,255,255,0.2)'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(pts[4], pts[5]); c.lineTo(pts[6], pts[7]); c.stroke(); } // lit top edge
}

/** Soft shadow cast by a volume onto the surface it stands on (sun from the north-west). */
function castShadow(c: Ctx, x: number, y: number, w: number, d: number, z0: number, h: number) {
  const sh = h * 0.42, sv = h * 0.3, ox = z0 * K, oy = -z0;
  c.save(); soft(c, 1.6); c.globalAlpha = 0.34; c.fillStyle = '#0b0d0e';
  path(c, [x + ox, y + d + oy, x + sh + ox, y + d + sv + oy, x + w + sh + ox, y + d + sv + oy, x + w + sh + ox, y + sv + oy, x + w + ox, y + oy, x + ox, y + oy]);
  c.fill(); c.restore();
}

interface PrismOpt { noShadow?: boolean; pilasters?: number; band?: [number, number, string]; roof?: Mat }
/** Box volume: roof, south wall, east wall. */
function prism(c: Ctx, x: number, y: number, w: number, d: number, z0: number, z1: number, m: Mat, o: PrismOpt = {}) {
  const b = y + d;
  if (!o.noShadow) castShadow(c, x, y, w, d, z0, z1 - z0);
  face(c, [x + z0 * K, b - z0, x + w + z0 * K, b - z0, x + w + z1 * K, b - z1, x + z1 * K, b - z1], m, 'south');
  face(c, [x + w + z0 * K, b - z0, x + w + z0 * K, y - z0, x + w + z1 * K, y - z1, x + w + z1 * K, b - z1], m, 'east');
  face(c, [x + z1 * K, y - z1, x + w + z1 * K, y - z1, x + w + z1 * K, b - z1, x + z1 * K, b - z1], o.roof ?? m, 'top');
  if (o.pilasters) {                                                                                                         // structural columns on the south wall
    for (let i = 0; i <= o.pilasters; i++) {
      const px = x + ((w - 2) * i) / o.pilasters;
      c.fillStyle = 'rgba(255,255,255,0.1)'; path(c, [px + z0 * K, b - z0, px + 1.6 + z0 * K, b - z0, px + 1.6 + z1 * K, b - z1, px + z1 * K, b - z1]); c.fill();
      c.fillStyle = 'rgba(0,0,0,0.22)'; path(c, [px + 1.6 + z0 * K, b - z0, px + 2.6 + z0 * K, b - z0, px + 2.6 + z1 * K, b - z1, px + 1.6 + z1 * K, b - z1]); c.fill();
    }
  }
  if (o.band) {                                                                                                              // restrained painted band (faction marking / safety)
    const [zb, zh, col] = o.band;
    c.globalAlpha = 0.8; c.fillStyle = col; path(c, [x + zb * K, b - zb, x + w + zb * K, b - zb, x + w + (zb + zh) * K, b - zb - zh, x + (zb + zh) * K, b - zb - zh]); c.fill(); c.globalAlpha = 1;
  }
  // parapet lip on larger roofs
  if (w * d > 500) { c.strokeStyle = 'rgba(255,255,255,0.13)'; c.lineWidth = 0.8; c.strokeRect(x + z1 * K + 1.2, y - z1 + 1.2, w - 2.4, d - 2.4); c.strokeStyle = 'rgba(0,0,0,0.2)'; c.strokeRect(x + z1 * K + 2, y - z1 + 2, w - 4, d - 4); }
}

/** Shallow gabled roof along x (ridge at mid depth). */
function gable(c: Ctx, x: number, y: number, w: number, d: number, z: number, h: number, m: Mat) {
  const b = y + d, mid = y + d / 2, zr = z + h;
  face(c, [x + zr * K, mid - zr, x + w + zr * K, mid - zr, x + w + z * K, y - z, x + z * K, y - z], m, 'top', 0.78);            // north slope (away from the viewer)
  face(c, [x + z * K, b - z, x + w + z * K, b - z, x + w + zr * K, mid - zr, x + zr * K, mid - zr], m, 'top', 1.02);           // south slope
  c.fillStyle = shade(m.base, 0.55); path(c, [x + w + z * K, b - z, x + w + zr * K, mid - zr, x + w + z * K, y - z]); c.fill(); // east gable end
  c.strokeStyle = 'rgba(255,255,255,0.22)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(x + zr * K, mid - zr); c.lineTo(x + w + zr * K, mid - zr); c.stroke(); // ridge cap
}

/** Vertical cylinder: tank, silo, stack. */
function cyl(c: Ctx, cx: number, cy: number, r: number, z0: number, z1: number, base: string, o: { cap?: string; rings?: number; ladder?: boolean; noShadow?: boolean } = {}) {
  const ry = r * 0.5, bx = cx + z0 * K, by = cy - z0, tx = cx + z1 * K, ty = cy - z1;
  if (!o.noShadow) { c.save(); soft(c, 1.6); c.globalAlpha = 0.32; c.fillStyle = '#0b0d0e'; const h = z1 - z0; c.beginPath(); c.ellipse(bx + h * 0.24, by + h * 0.16, r + h * 0.2, ry + h * 0.12, 0.5, 0, Math.PI * 2); c.fill(); c.restore(); }
  const g = c.createLinearGradient(tx - r, 0, tx + r, 0);
  g.addColorStop(0, shade(base, 0.86)); g.addColorStop(0.28, shade(base, 1.14)); g.addColorStop(0.6, shade(base, 0.9)); g.addColorStop(1, shade(base, 0.5));
  c.beginPath(); c.moveTo(bx - r, by); c.lineTo(tx - r, ty); c.lineTo(tx + r, ty); c.lineTo(bx + r, by); c.ellipse(bx, by, r, ry, 0, 0, Math.PI); c.closePath();
  c.fillStyle = g; c.fill();
  c.save(); c.clip();
  for (let i = 0; i < Math.max(2, r / 3); i++) { const sx = tx - r + rnd() * r * 2, len = (z1 - z0) * (0.3 + rnd() * 0.6); const sg = c.createLinearGradient(0, ty, 0, ty + len); sg.addColorStop(0, rnd() < 0.4 ? 'rgba(110,62,34,0.3)' : 'rgba(15,15,14,0.22)'); sg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = sg; c.fillRect(sx, ty, 1 + rnd() * 1.6, len); }
  const dg = c.createLinearGradient(0, by - 5, 0, by + ry); dg.addColorStop(0, 'rgba(0,0,0,0)'); dg.addColorStop(1, 'rgba(0,0,0,0.3)'); c.fillStyle = dg; c.fillRect(bx - r - 2, by - 5, r * 2 + 4, 5 + ry);
  c.restore();
  if (o.rings) { c.strokeStyle = 'rgba(0,0,0,0.22)'; c.lineWidth = 0.6; for (let i = 1; i <= o.rings; i++) { const z = z0 + ((z1 - z0) * i) / (o.rings + 1); c.beginPath(); c.ellipse(cx + z * K, cy - z, r, ry, 0, 0.1, Math.PI - 0.1); c.stroke(); } }
  if (o.ladder) { c.strokeStyle = 'rgba(20,22,24,0.6)'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(bx - r * 0.3, by + ry * 0.9); c.lineTo(tx - r * 0.3, ty + ry * 0.9); c.moveTo(bx - r * 0.3 + 1.6, by + ry * 0.9); c.lineTo(tx - r * 0.3 + 1.6, ty + ry * 0.9); c.stroke(); }
  const tg = c.createLinearGradient(tx - r, ty - ry, tx + r, ty + ry); tg.addColorStop(0, shade(o.cap ?? base, 1.22)); tg.addColorStop(1, shade(o.cap ?? base, 0.86));
  c.beginPath(); c.ellipse(tx, ty, r, ry, 0, 0, Math.PI * 2); c.fillStyle = tg; c.fill(); c.strokeStyle = 'rgba(12,14,16,0.35)'; c.lineWidth = 0.5; c.stroke();
}

function dome(c: Ctx, cx: number, cy: number, z: number, r: number, base: string) {
  const px = cx + z * K, py = cy - z;
  const g = c.createRadialGradient(px - r * 0.35, py - r * 0.55, r * 0.1, px, py - r * 0.2, r * 1.15);
  g.addColorStop(0, shade(base, 1.25)); g.addColorStop(0.6, shade(base, 0.95)); g.addColorStop(1, shade(base, 0.5));
  c.beginPath(); c.ellipse(px, py, r, r * 0.5, 0, 0, Math.PI); c.ellipse(px, py, r, r * 0.92, 0, Math.PI, Math.PI * 2);
  c.fillStyle = g; c.fill();
  c.save(); c.clip(); c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = 0.5;                                                  // geodesic panel lines
  for (let i = -3; i <= 3; i++) { c.beginPath(); c.ellipse(px + i * r * 0.28, py, r * 0.3, r * 0.92, 0, Math.PI, Math.PI * 2); c.stroke(); }
  for (let i = 1; i < 4; i++) { c.beginPath(); c.ellipse(px, py - i * r * 0.22, r * (1 - i * 0.07), r * 0.4, 0, 0, Math.PI * 2); c.stroke(); }
  c.restore();
}

function line(c: Ctx, pts: number[], col: string, lw = 1) {
  c.beginPath(); c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.strokeStyle = col; c.lineWidth = lw; c.stroke();
}
const rect = (c: Ctx, x: number, y: number, w: number, h: number, col: string) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
/** Pipe with a highlight and a contact shadow. */
function pipe(c: Ctx, pts: number[], col: string, lw = 2) {
  c.save(); c.translate(0.8, 1.2); line(c, pts, 'rgba(0,0,0,0.3)', lw); c.restore();
  line(c, pts, shade(col, 0.8), lw); c.save(); c.translate(0, -lw * 0.22); line(c, pts, shade(col, 1.25), lw * 0.35); c.restore();
}

/** Weathered concrete ground slab with expansion joints, stains and a dusty feathered rim. */
function slab(c: Ctx, x: number, y: number, w: number, d: number, col = '#77766f', joints = 20) {
  c.save();
  soft(c, 2.4); c.globalAlpha = 0.6; c.fillStyle = '#4a4336'; c.beginPath(); c.roundRect(x - 1, y - 1, w + 2, d + 2, 4); c.fill();   // worn dirt rim
  soft(c, 0.6); c.globalAlpha = 1;
  const g = c.createLinearGradient(x, y, x + w, y + d); g.addColorStop(0, shade(col, 0.95)); g.addColorStop(1, shade(col, 0.8));
  c.fillStyle = g; c.beginPath(); c.roundRect(x + 1.5, y + 1.5, w - 3, d - 3, 2); c.fill();
  soft(c, 0);
  c.beginPath(); c.roundRect(x + 1.5, y + 1.5, w - 3, d - 3, 2); c.clip();
  c.strokeStyle = 'rgba(0,0,0,0.13)'; c.lineWidth = 0.6; c.beginPath();
  for (let i = joints; i < w; i += joints) { c.moveTo(x + i, y); c.lineTo(x + i, y + d); }
  for (let i = joints; i < d; i += joints) { c.moveTo(x, y + i); c.lineTo(x + w, y + i); }
  c.stroke();
  soft(c, 1.2);
  for (let i = 0; i < (w * d) / 900 + 2; i++) { c.fillStyle = rnd() < 0.6 ? 'rgba(20,20,18,0.12)' : 'rgba(200,190,160,0.08)'; c.beginPath(); c.ellipse(x + rnd() * w, y + rnd() * d, 3 + rnd() * 9, 2 + rnd() * 5, rnd() * 3, 0, Math.PI * 2); c.fill(); } // oil / dust
  soft(c, 0);
  const gr = grain(); if (gr) { const p = c.createPattern(gr, 'repeat'); if (p) { c.globalAlpha = 0.55; c.fillStyle = p; c.fillRect(x, y, w, d); } }
  c.restore();
}
/** Painted line on the ground (worn). */
function paint(c: Ctx, pts: number[], col: string, lw = 1, dash?: number[]) { c.save(); c.globalAlpha = 0.6; if (dash) c.setLineDash(dash); line(c, pts, col, lw); c.restore(); }
function tyreMarks(c: Ctx, x: number, y0: number, y1: number, gap = 7) { c.save(); soft(c, 0.7); c.globalAlpha = 0.22; line(c, [x, y0, x + rnd() * 2 - 1, y1], '#15161a', 1.6); if (gap) line(c, [x + gap, y0, x + gap + rnd() * 2 - 1, y1], '#15161a', 1.6); c.restore(); }

/** Window rectangles on a south wall (returned so the live layer can light some of them). */
function windowRects(x: number, y: number, w: number, d: number, z0: number, z1: number, cols: number, rows: number): number[][] {
  const out: number[][] = [], b = y + d, ww = (w / cols) * 0.42, wh = Math.min(3.2, ((z1 - z0) / rows) * 0.42);
  for (let r = 0; r < rows; r++) for (let i = 0; i < cols; i++) {
    const z = z0 + ((z1 - z0) * (r + 0.3)) / rows;
    out.push([x + (w * (i + 0.29)) / cols + z * K, b - z - wh, ww, wh]);
  }
  return out;
}
function windows(c: Ctx, rs: number[][]) {
  for (const r of rs) { rect(c, r[0] - 0.4, r[1] - 0.4, r[2] + 0.8, r[3] + 0.8, 'rgba(0,0,0,0.3)'); rect(c, r[0], r[1], r[2], r[3], GLASS); rect(c, r[0], r[1], r[2] * 0.5, 0.7, 'rgba(160,190,205,0.3)'); }
}
let litDim = 1;
function lit(c: Ctx, rs: number[][], t: number, seed: number, col = WARM) {
  rs.forEach((r, i) => {
    const on = ((Math.floor(t * 0.15 + i * 7 + seed) * 2654435761) >>> 0) % 3 === 0;
    if (!on) return;
    c.globalAlpha = 0.75 * litDim; rect(c, r[0], r[1], r[2], r[3], col); c.globalAlpha = 0.1 * litDim; rect(c, r[0] - 1, r[1] - 1, r[2] + 2, r[3] + 2, col); c.globalAlpha = 1;
  });
}
/** Recessed door on a south wall whose base is at yb. */
function door(c: Ctx, x: number, yb: number, z0: number, w: number, h: number, roll = false) {
  const px = x + z0 * K, py = yb - z0 - h;
  rect(c, px - 1, py - 1, w + 2, h + 1, 'rgba(0,0,0,0.35)');
  const g = c.createLinearGradient(0, py, 0, py + h); g.addColorStop(0, '#14181b'); g.addColorStop(1, roll ? '#3a4046' : '#22272b');
  c.fillStyle = g; c.fillRect(px, py, w, h);
  if (roll) { c.strokeStyle = 'rgba(255,255,255,0.07)'; c.lineWidth = 0.5; c.beginPath(); for (let yy = py + 1.5; yy < py + h; yy += 1.8) { c.moveTo(px, yy); c.lineTo(px + w, yy); } c.stroke(); }
  rect(c, px, py, w, 1.2, 'rgba(0,0,0,0.5)');                                                                                 // header shadow (recess)
}
function louvers(c: Ctx, x: number, yb: number, z: number, w: number, h: number) {
  const px = x + z * K, py = yb - z - h; rect(c, px, py, w, h, '#24292d');
  c.strokeStyle = 'rgba(255,255,255,0.12)'; c.lineWidth = 0.5; c.beginPath(); for (let yy = py + 1; yy < py + h; yy += 1.4) { c.moveTo(px, yy); c.lineTo(px + w, yy); } c.stroke();
}
/** Rooftop HVAC / ventilation unit with a fan grille. */
function hvac(c: Ctx, x: number, y: number, z: number, s = 7) {
  prism(c, x, y, s, s * 0.8, z, z + 3.2, M(GALV, 'galv'));
  c.fillStyle = '#1d2226'; c.beginPath(); c.ellipse(x + s / 2 + (z + 3.2) * K, y + s * 0.4 - z - 3.2, s * 0.3, s * 0.2, 0, 0, Math.PI * 2); c.fill();
}
function fanLive(c: Ctx, x: number, y: number, z: number, r: number, t: number) {
  const px = x + z * K, py = y - z, a = t * 7;
  c.strokeStyle = 'rgba(190,198,202,0.55)'; c.lineWidth = 0.8; c.beginPath();
  for (let i = 0; i < 2; i++) { const b = a + (i * Math.PI) / 2; c.moveTo(px - Math.cos(b) * r, py - Math.sin(b) * r * 0.55); c.lineTo(px + Math.cos(b) * r, py + Math.sin(b) * r * 0.55); }
  c.stroke();
}
/** Steel lattice mast. */
function lattice(c: Ctx, x: number, y: number, z0: number, z1: number, wb = 5) {
  const bx = x + z0 * K, by = y - z0, tx = x + z1 * K, ty = y - z1;
  c.strokeStyle = 'rgba(30,34,38,0.9)'; c.lineWidth = 0.7; c.beginPath();
  c.moveTo(bx - wb / 2, by); c.lineTo(tx - 0.6, ty); c.moveTo(bx + wb / 2, by); c.lineTo(tx + 0.6, ty);
  const n = Math.max(3, Math.round((z1 - z0) / 5));
  for (let i = 0; i < n; i++) { const f0 = i / n, f1 = (i + 1) / n; const w0 = (wb / 2) * (1 - f0) + 0.6 * f0, w1 = (wb / 2) * (1 - f1) + 0.6 * f1; const xa = bx + (tx - bx) * f0, ya = by + (ty - by) * f0, xb = bx + (tx - bx) * f1, yb = by + (ty - by) * f1; c.moveTo(xa - w0, ya); c.lineTo(xb + w1, yb); c.moveTo(xa + w0, ya); c.lineTo(xb - w1, yb); }
  c.stroke();
  c.strokeStyle = 'rgba(200,205,208,0.35)'; c.lineWidth = 0.4; c.beginPath(); c.moveTo(bx - wb / 2, by); c.lineTo(tx - 0.6, ty); c.stroke();
}
const whip = (c: Ctx, x: number, y: number, z0: number, z1: number) => line(c, [x + z0 * K, y - z0, x + z1 * K, y - z1], 'rgba(40,44,48,0.85)', 0.6);
function beacon(c: Ctx, x: number, y: number, z: number, t: number, col = '#e0463c', rate = 0.8) {
  const on = (t * rate) % 1 < 0.25;
  c.globalAlpha = on ? 0.95 : 0.3; c.fillStyle = col; c.beginPath(); c.arc(x + z * K, y - z, 1.1, 0, Math.PI * 2); c.fill();
  if (on) { c.globalAlpha = 0.16; c.beginPath(); c.arc(x + z * K, y - z, 3.2, 0, Math.PI * 2); c.fill(); }
  c.globalAlpha = 1;
}
/** Parabolic antenna; `ang` rotates it about the vertical axis. */
function dish(c: Ctx, x: number, y: number, z: number, r: number, ang: number) {
  const px = x + z * K, py = y - z, ca = Math.cos(ang), sa = Math.sin(ang);
  const rx = r * (0.25 + 0.75 * Math.abs(ca)), ry = r * 0.62, cx = px + sa * r * 0.15, cy = py - r * 0.35;
  line(c, [px, py, cx, cy + ry * 0.3], '#3a4046', 1.4);
  c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(cx + 0.8, cy + 0.8, rx, ry, -0.3, 0, Math.PI * 2); c.fill();
  const g = c.createRadialGradient(cx - rx * 0.3, cy - ry * 0.3, 0.5, cx, cy, Math.max(rx, ry));
  if (ca >= 0) { g.addColorStop(0, '#c9cdcf'); g.addColorStop(0.7, '#9aa0a3'); g.addColorStop(1, '#6d7377'); } else { g.addColorStop(0, '#7b8185'); g.addColorStop(1, '#4d5257'); }
  c.fillStyle = g; c.beginPath(); c.ellipse(cx, cy, rx, ry, -0.3, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(20,22,24,0.5)'; c.lineWidth = 0.5; c.stroke();
  if (ca >= 0) { line(c, [cx - rx * 0.5, cy + ry * 0.2, cx + ca * r * 0.45, cy - r * 0.2, cx + rx * 0.5, cy - ry * 0.2], 'rgba(40,44,48,0.8)', 0.5); rect(c, cx + ca * r * 0.45 - 0.8, cy - r * 0.2 - 0.8, 1.6, 1.6, '#2a2f33'); }
}
function smoke(c: Ctx, x: number, y: number, t: number, seed: number, n = 3, alpha = 0.22) {
  for (let i = 0; i < n; i++) {
    const ph = (t * 0.25 + i / n + seed) % 1;
    c.globalAlpha = alpha * (1 - ph) * Math.max(0.3, litDim); c.fillStyle = '#b9bcbb';
    c.beginPath(); c.arc(x + ph * 10 + Math.sin(ph * 6 + seed) * 1.5, y - ph * 20, 1.6 + ph * 5, 0, Math.PI * 2); c.fill();
  }
  c.globalAlpha = 1;
}
/** Restrained safety chevrons (worn industrial yellow / charcoal). */
function hazard(c: Ctx, x: number, y: number, w: number, h: number) {
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.globalAlpha = 0.8;
  rect(c, x, y, w, h, WARN); c.fillStyle = '#26292c';
  for (let i = -h; i < w + h; i += 5) { c.beginPath(); c.moveTo(x + i, y + h); c.lineTo(x + i + 2.5, y + h); c.lineTo(x + i + 2.5 + h, y); c.lineTo(x + i + h, y); c.fill(); }
  c.restore();
}
function flag(c: Ctx, x: number, y: number, z0: number, z1: number, col: string, t: number) {
  line(c, [x + z0 * K, y - z0, x + z1 * K, y - z1], 'rgba(190,195,198,0.9)', 0.7);
  const px = x + z1 * K, py = y - z1, w = Math.sin(t * 3) * 0.8;
  c.fillStyle = col; c.globalAlpha = 0.9; path(c, [px, py, px + 6, py + 0.8 + w, px + 6, py + 4 + w, px, py + 3.6]); c.fill(); c.globalAlpha = 1;
}
/** Precast concrete barrier run along x. */
function barriers(c: Ctx, x: number, y: number, len: number) { for (let i = 0; i + 6 <= len; i += 7) prism(c, x + i, y, 6, 2.6, 0, 3, M(CONCRETE_L), { noShadow: i > 0 }); }
function crate(c: Ctx, x: number, y: number, w: number, d: number, z: number, h: number, col: string) { prism(c, x, y, w, d, z, z + h, M(col, 'paint')); }
/** Shipping container. */
function container(c: Ctx, x: number, y: number, z: number, col: string) { prism(c, x, y, 11, 5, z, z + 5, M(col, 'corrugated')); }
/** Finned power transformer with bushings. */
function transformer(c: Ctx, x: number, y: number) {
  prism(c, x, y, 7, 6, 0, 7, M('#5f6861', 'armor'));
  c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 0.5; c.beginPath(); for (let k = 0; k < 4; k++) { c.moveTo(x + 1 + k * 1.6 + 2 * K, y + 6 - 1); c.lineTo(x + 1 + k * 1.6 + 7 * K, y + 6 - 6.5); } c.stroke();
  for (let k = 0; k < 3; k++) { rect(c, x + 1.2 + k * 2.2 + 7 * K, y + 2 - 7 - 2.6, 0.9, 2.8, '#b9b4a6'); }
}

// ───────────────────────── designs ─────────────────────────

interface LiveState { progress: number; level: number; producing: boolean; repairing: boolean; aim: number | null; recoil: number; hpRatio: number; seed: number; neighbors: number }
interface Design { base: (c: Ctx, g: G) => void; live?: (c: Ctx, g: G, t: number, b: LiveState) => void }

const iw = (g: G, h: number) => g.w - h * K - 3;
const HQ_W1 = (g: G) => windowRects(10, g.d * 0.26, iw(g, 66) - 18, g.d * 0.46, 9, 25, 9, 2);
const HQ_W2 = (g: G) => windowRects(20, g.d * 0.31, iw(g, 66) * 0.5, g.d * 0.32, 28, 37, 6, 1);

const DESIGNS: Record<BuildingType, Design> = {
  // Fortified command complex: podium, three-level command block with set-backs, armoured portal, ops room, roof plant,
  // lattice comms mast, generator annex, checkpoint with barriers.
  headquarters: {
    base(c, g) {
      const { f } = g, W = iw(g, 66), d = g.d;
      slab(c, 0, 0, g.w, d);
      paint(c, [g.w * 0.36, d * 0.8, g.w * 0.36, d - 2], '#d8d4c4', 0.8); paint(c, [g.w * 0.5, d * 0.8, g.w * 0.5, d - 2], '#d8d4c4', 0.8);   // approach lane
      tyreMarks(c, g.w * 0.39, d * 0.8, d - 1);
      prism(c, 4, d * 0.18, W - 6, d * 0.6, 0, 7, M(CONCRETE));                                                              // reinforced podium
      prism(c, 0, d * 0.46, 11, d * 0.2, 0, 11, M(STEEL, 'corrugated'), { roof: M(SLATE, 'slate') });                        // generator annex
      louvers(c, 2, d * 0.66, 3, 7, 5);
      prism(c, 9, d * 0.26, W - 16, d * 0.46, 7, 26, M(CONCRETE_L), { band: [22.5, 1.6, f.accent] });                        // command block
      windows(c, HQ_W1(g));
      prism(c, W * 0.6, d * 0.5, W * 0.33, d * 0.24, 7, 17, M(f.armor, 'armor'));                                            // armoured east wing
      windows(c, windowRects(W * 0.6, d * 0.5, W * 0.33, d * 0.24, 9, 16, 4, 1));
      prism(c, W * 0.3, d * 0.72, 20, 4.5, 7, 19, M(CONCRETE_D));                                                            // blast portal
      door(c, W * 0.3 + 4, d * 0.72 + 4.5, 7, 12, 9);
      prism(c, W * 0.3 + 2, d * 0.78, 16, 5, 0, 7, M(CONCRETE));                                                             // entrance steps / ramp
      prism(c, 18, d * 0.31, W * 0.52, d * 0.32, 26, 38, M(CONCRETE));                                                       // upper level
      windows(c, HQ_W2(g));
      prism(c, W * 0.22, d * 0.36, 24, 17, 38, 45, M(GUNMETAL, 'armor'));                                                    // operations room
      rect(c, W * 0.22 + 41 * K + 1, d * 0.36 + 17 - 44, 22, 2.6, GLASS); rect(c, W * 0.22 + 41 * K + 1, d * 0.36 + 17 - 44, 22, 0.6, 'rgba(150,185,200,0.35)');
      hvac(c, W * 0.66, d * 0.3, 26); hvac(c, W * 0.66 + 9, d * 0.3, 26); hvac(c, W * 0.66, d * 0.42, 26, 6);                // roof plant
      cyl(c, W * 0.8, d * 0.6, 1.6, 17, 21, GALV, { noShadow: true }); cyl(c, W * 0.86, d * 0.6, 1.6, 17, 21, GALV, { noShadow: true });
      pipe(c, [W * 0.66 + 26 * K + 3, d * 0.5 - 26, W * 0.66 + 26 * K + 18, d * 0.5 - 26], STEEL, 1.2);
      lattice(c, W * 0.56, d * 0.4, 38, 64, 5);                                                                               // comms mast
      rect(c, W * 0.56 + 56 * K - 2.5, d * 0.4 - 57, 5, 1, '#3a4046'); rect(c, W * 0.56 + 48 * K - 3, d * 0.4 - 49, 6, 1, '#3a4046');
      whip(c, W * 0.25, d * 0.38, 45, 56); whip(c, W * 0.3, d * 0.38, 45, 53);
      // security checkpoint
      barriers(c, 3, d - 6, g.w * 0.3); barriers(c, g.w * 0.56, d - 6, g.w * 0.38);
      prism(c, g.w * 0.52, d - 13, 6, 5, 0, 7, M(CONCRETE_D), { roof: M(SLATE, 'slate') });
      rect(c, g.w * 0.52 + 4 * K + 1, d - 8 - 6, 4, 2, GLASS);
    },
    live(c, g, t, s) {
      const W = iw(g, 66), d = g.d;
      dish(c, W * 0.74, d * 0.36, 29, 4.5, 0.6);                                                                              // fixed satcom dish
      const a = t * 1.2 + s.seed;                                                                                            // small search radar on the ops room
      line(c, [W * 0.4 + 45 * K - Math.cos(a) * 5, d * 0.44 - 46 - Math.sin(a) * 1.6, W * 0.4 + 45 * K + Math.cos(a) * 5, d * 0.44 - 46 + Math.sin(a) * 1.6], '#2a2f33', 1.6);
      beacon(c, W * 0.56, d * 0.4, 64, t);
      lit(c, HQ_W1(g), t, s.seed); lit(c, HQ_W2(g), t, s.seed + 5);
      c.globalAlpha = 0.5 * litDim; rect(c, W * 0.3 + 4 + 7 * K, d * 0.72 + 4.5 - 7 - 10.2, 12, 0.8, WARM); c.globalAlpha = 1;  // portal lighting
      line(c, [g.w * 0.52, d - 9, g.w * 0.37, d - 12], '#b9b4a6', 1); line(c, [g.w * 0.47, d - 10, g.w * 0.43, d - 10.8], '#a8413c', 1); // boom gate
      flag(c, g.w * 0.9, d - 8, 3, 20, g.f.accent, t);
    },
  },

  // Low-rise accommodation: two long blocks with shallow slate roofs, doors, windows, roof vents, store, assembly yard.
  barracks: {
    base(c, g) {
      const { f } = g, W = iw(g, 26), d = g.d;
      slab(c, 0, 0, g.w, d, '#7b786d');
      c.save(); c.globalAlpha = 0.5; c.strokeStyle = '#d8d4c4'; c.lineWidth = 0.7; c.strokeRect(W * 0.1, d * 0.76, W * 0.56, d * 0.18); c.restore();   // assembly square
      for (let i = 1; i < 4; i++) paint(c, [W * 0.1 + (W * 0.56 * i) / 4, d * 0.76, W * 0.1 + (W * 0.56 * i) / 4, d * 0.94], '#d8d4c4', 0.5);
      const block = (y: number, w: number) => {
        prism(c, 3, y, w, d * 0.2, 0, 10, M(f.wall, 'paint'), { band: [1, 1.4, CONCRETE_D] });
        gable(c, 2, y - 1, w + 2, d * 0.2 + 2, 10, 5, M(SLATE, 'slate'));
        windows(c, windowRects(3, y, w, d * 0.2, 3, 9, Math.round(w / 9), 1));
        door(c, 3 + w * 0.46, y + d * 0.2, 0, 4, 6.5);
        for (let i = 0; i < 3; i++) cyl(c, 10 + (w - 16) * (i / 2), y + d * 0.1, 1.1, 15, 17.5, GALV, { noShadow: true });          // ridge vents
      };
      block(d * 0.1, W - 6);
      block(d * 0.42, W * 0.64);
      prism(c, W * 0.74, d * 0.46, W * 0.23, d * 0.16, 0, 8, M(STEEL, 'corrugated'), { roof: M(SLATE, 'slate') });               // equipment store
      door(c, W * 0.74 + 3, d * 0.62, 0, 8, 5.5, true);
      crate(c, W * 0.76, d * 0.7, 5, 4, 0, 3.5, '#5b5a43'); crate(c, W * 0.76 + 6, d * 0.7, 5, 4, 0, 3.5, '#4d5340'); crate(c, W * 0.76 + 3, d * 0.7, 5, 4, 3.5, 3, '#5b5a43');
      cyl(c, W * 0.93, d * 0.34, 3, 0, 7, '#5d655c', { rings: 1 });                                                              // water tank
    },
    live(c, g, t, s) {
      const W = iw(g, 26), d = g.d;
      lit(c, windowRects(3, d * 0.1, W - 6, d * 0.2, 3, 9, Math.round((W - 6) / 9), 1), t, s.seed);
      lit(c, windowRects(3, d * 0.42, W * 0.64, d * 0.2, 3, 9, Math.round((W * 0.64) / 9), 1), t, s.seed + 2);
      flag(c, W * 0.06, d * 0.94, 0, 20, g.f.accent, t);
      if (s.producing) { c.globalAlpha = 0.7 * litDim; rect(c, 3 + (W - 6) * 0.46, d * 0.3 - 7.6, 4, 0.8, WARM); c.globalAlpha = 1; }
    },
  },

  // Steel-frame armoured-vehicle plant: portal-frame hall with corrugated cladding and columns, two roll-up assembly bays,
  // ridge ventilator, roof extract fans, exhaust stacks, office lean-to, marked apron.
  vehicle_factory: {
    base(c, g) {
      const { f } = g, W = iw(g, 46), d = g.d;
      slab(c, 0, 0, g.w, d, '#74736d', 24);
      rect(c, 6, d * 0.74, W * 0.76, d * 0.24, 'rgba(40,42,44,0.28)');                                                          // worn apron
      for (const x of [16, 22, 54, 60]) tyreMarks(c, x, d * 0.74, d - 1, 0);
      paint(c, [8, d * 0.75, 8, d - 2], WARN, 0.8); paint(c, [W * 0.4, d * 0.75, W * 0.4, d - 2], WARN, 0.8, [3, 3]); paint(c, [W * 0.8, d * 0.75, W * 0.8, d - 2], WARN, 0.8);
      prism(c, 3, d * 0.12, W - 6, d * 0.6, 0, 24, M(f.wall2, 'corrugated'), { pilasters: 7, band: [20, 1.6, f.accent] });      // assembly hall
      rect(c, 3, d * 0.72 - 2.4, W - 6, 2.4, 'rgba(60,62,60,0.55)');                                                            // concrete plinth
      gable(c, 2, d * 0.11, W - 4, d * 0.62, 24, 9, M(SLATE, 'corrugated'));
      prism(c, 14, d * 0.12 + d * 0.3 - 2.5, W - 28, 5, 33.5, 36.5, M(GUNMETAL, 'galv'), { noShadow: true });                    // ridge ventilator
      door(c, 11, d * 0.72, 0, 30, 17, true); door(c, 49, d * 0.72, 0, 30, 17, true);                                           // vehicle bays
      rect(c, 10, d * 0.72 - 18.6, 32, 1.4, '#3a3f43'); rect(c, 48, d * 0.72 - 18.6, 32, 1.4, '#3a3f43');                        // lintel beams
      for (const x of [9.5, 42, 47.5, 80]) { rect(c, x, d * 0.72 - 5, 1.6, 5, WARN); rect(c, x, d * 0.72 - 3.4, 1.6, 1.2, '#26292c'); } // bollards
      for (let i = 0; i < 4; i++) cyl(c, 16 + i * 20, d * 0.58, 2.6, 28, 30, GALV, { cap: '#22272b', noShadow: true });           // roof extract fans
      cyl(c, W * 0.9, d * 0.2, 2, 24, 44, '#565b5e', { rings: 2 }); cyl(c, W * 0.9 - 6, d * 0.2, 2, 24, 40, '#565b5e', { rings: 2 }); // exhaust stacks
      prism(c, W - 20, d * 0.74, 18, d * 0.13, 0, 9, M(CONCRETE), { roof: M(SLATE, 'slate') });                                  // office lean-to
      windows(c, windowRects(W - 20, d * 0.74, 18, d * 0.13, 3, 8, 3, 1));
      crate(c, W - 30, d * 0.9, 6, 4, 0, 4, '#5b5a43'); cyl(c, W - 36, d * 0.93, 1.8, 0, 4.5, '#6b3f2b', { noShadow: true }); cyl(c, W - 40, d * 0.93, 1.8, 0, 4.5, '#3f4a55', { noShadow: true });
    },
    live(c, g, t, s) {
      const W = iw(g, 46), d = g.d;
      for (let i = 0; i < 4; i++) fanLive(c, 16 + i * 20, d * 0.58, 30, 2.1, t * (s.producing ? 1.6 : 0.5) + i);
      smoke(c, W * 0.9 + 44 * K, d * 0.2 - 44, t, 0.1, 3, s.producing ? 0.34 : 0.14); smoke(c, W * 0.9 - 6 + 40 * K, d * 0.2 - 40, t, 0.55, 3, s.producing ? 0.3 : 0.1);
      const lamp = s.producing ? ((t * 2) % 1 < 0.5 ? '#e0a23c' : '#5a4a2a') : '#3c6a52';                                      // bay status lamps follow the real queue
      rect(c, 25, d * 0.72 - 20.6, 2, 1.2, lamp); rect(c, 63, d * 0.72 - 20.6, 2, 1.2, lamp);
      if (s.producing) { c.globalAlpha = 0.22 * litDim; rect(c, 11, d * 0.72 - 6, 30, 6, WARM); c.globalAlpha = (1 - ((t * 5) % 1)) * 0.9; rect(c, 20 + ((t * 37) % 14), d * 0.72 - 3 - ((t * 5) % 1) * 3, 1, 1, '#fff1c8'); c.globalAlpha = 1; } // welding glow
      lit(c, windowRects(W - 20, d * 0.74, 18, d * 0.13, 3, 8, 3, 1), t, s.seed);
    },
  },

  // Gas-turbine plant: turbine hall with louvres, twin exhaust stacks, fin-fan cooler bank, pipe rack, transformer yard
  // with bus gantry and fence.
  power_plant: {
    base(c, g) {
      const { f } = g, d = g.d, W = iw(g, 42);
      slab(c, 0, 0, g.w, d, '#76756f');
      prism(c, 3, d * 0.14, W * 0.58, d * 0.38, 0, 17, M(f.wall2, 'corrugated'), { pilasters: 4, roof: M(SLATE, 'slate'), band: [14, 1.4, f.accent] }); // turbine hall
      louvers(c, 6, d * 0.52, 3, 12, 6); louvers(c, 22, d * 0.52, 3, 12, 6); door(c, W * 0.58 - 5, d * 0.52, 0, 4, 6);
      cyl(c, W * 0.16, d * 0.26, 3.6, 17, 38, '#5a5f62', { rings: 3, cap: '#1c2023' }); cyl(c, W * 0.36, d * 0.26, 3.6, 17, 38, '#5a5f62', { rings: 3, cap: '#1c2023' }); // exhaust stacks
      prism(c, W * 0.1, d * 0.38, W * 0.34, 5, 17, 20, M(GALV, 'galv'), { noShadow: true });                                      // air-intake filter house
      prism(c, W * 0.66, d * 0.12, W * 0.31, d * 0.3, 0, 9, M(GUNMETAL, 'galv'));                                                // fin-fan cooler bank
      for (let i = 0; i < 2; i++) { c.fillStyle = '#15191c'; c.beginPath(); c.ellipse(W * 0.66 + W * 0.08 + i * W * 0.15 + 9 * K, d * 0.27 - 9, W * 0.06, W * 0.035, 0, 0, Math.PI * 2); c.fill(); }
      pipe(c, [W * 0.58 + 6 * K, d * 0.36 - 6, W * 0.66 + 6 * K, d * 0.36 - 6], STEEL, 2); pipe(c, [W * 0.58 + 3 * K, d * 0.4 - 3, W * 0.66 + 3 * K, d * 0.4 - 3], '#7a5a44', 1.6); // pipe rack
      // transformer yard
      for (let i = 0; i < 3; i++) transformer(c, W * 0.12 + i * 13, d * 0.7);
      for (const x of [W * 0.08, W * 0.72]) line(c, [x, d * 0.66, x + 13 * K, d * 0.66 - 13], '#3a4046', 1);                      // bus gantry posts
      line(c, [W * 0.08 + 13 * K, d * 0.66 - 13, W * 0.72 + 13 * K, d * 0.66 - 13], '#3a4046', 1);
      for (let i = 0; i < 5; i++) rect(c, W * 0.14 + i * 8 + 13 * K, d * 0.66 - 13, 0.8, 2.6, '#b9b4a6');                         // insulators
      c.strokeStyle = 'rgba(30,34,38,0.55)'; c.lineWidth = 0.5; c.strokeRect(W * 0.05, d * 0.62, W * 0.78, d * 0.3);             // fence
      prism(c, W * 0.86, d * 0.66, 7, 8, 0, 7, M(CONCRETE));                                                                      // switch-gear kiosk
      hazard(c, W * 0.05, d * 0.93, W * 0.3, 1.6);
    },
    live(c, g, t, s) {
      const d = g.d, W = iw(g, 42);
      for (let i = 0; i < 2; i++) fanLive(c, W * 0.66 + W * 0.08 + i * W * 0.15, d * 0.27, 9, W * 0.05, t + i);
      smoke(c, W * 0.16 + 38 * K, d * 0.26 - 38, t, 0.2, 3, 0.16); smoke(c, W * 0.36 + 38 * K, d * 0.26 - 38, t, 0.6, 3, 0.16);    // exhaust heat haze
      rect(c, W * 0.86 + 7 * K + 1, d * 0.74 - 6, 1.2, 1, (t * 0.7 + s.seed) % 1 < 0.8 ? '#4fae7c' : '#2b4a3a');                   // status lamps
      rect(c, W * 0.86 + 7 * K + 3.4, d * 0.74 - 6, 1.2, 1, '#c79a3a');
    },
  },

  // Ore processing: crusher/process building, twin silos, storage tank with ladder, pipe rack, inclined conveyor from a
  // loading hopper, marked loading bay.
  coin_generator: {
    base(c, g) {
      const { f } = g, d = g.d, W = iw(g, 44);
      slab(c, 0, 0, g.w, d, '#74726b');
      rect(c, 3, d * 0.74, W * 0.5, d * 0.22, 'rgba(40,42,44,0.26)'); tyreMarks(c, W * 0.14, d * 0.74, d - 1); hazard(c, 3, d * 0.955, W * 0.5, 1.6);   // loading bay
      prism(c, 3, d * 0.4, W * 0.46, d * 0.3, 0, 16, M(f.wall2, 'corrugated'), { pilasters: 3, roof: M(SLATE, 'slate'), band: [12.5, 1.4, f.accent] }); // process building
      door(c, 7, d * 0.7, 0, 11, 9, true); louvers(c, W * 0.3, d * 0.7, 5, 8, 5);
      hvac(c, W * 0.1, d * 0.46, 16, 6);
      cyl(c, W * 0.66, d * 0.24, 8.5, 0, 34, '#8c8f8c', { rings: 4, ladder: true, cap: '#7b7e7b' });                              // silos
      cyl(c, W * 0.86, d * 0.36, 8, 0, 30, '#858884', { rings: 4, cap: '#747773' });
      cyl(c, W * 0.74, d * 0.72, 11, 0, 10, '#6e6a5d', { rings: 1, ladder: true, cap: '#77735f' });                               // storage tank
      for (let i = 0; i < 3; i++) pipe(c, [W * 0.46 + 6 * K, d * 0.5 + i * 2.6 - 6, W * 0.62 + 6 * K, d * 0.5 + i * 2.6 - 6], i === 1 ? '#7a5a44' : STEEL, 1.5); // pipe rack
      line(c, [W * 0.5, d * 0.5, W * 0.5 + 6 * K, d * 0.5 - 6], '#3a4046', 0.8); line(c, [W * 0.58, d * 0.5, W * 0.58 + 6 * K, d * 0.5 - 6], '#3a4046', 0.8);
      prism(c, W * 0.3, d * 0.82, 9, 7, 0, 6, M(GUNMETAL, 'armor'));                                                              // loading hopper
      const x0 = W * 0.36 + 6 * K, y0 = d * 0.84 - 6, x1 = W * 0.62 + 30 * K, y1 = d * 0.3 - 30;                                  // inclined conveyor gallery
      line(c, [x0 + 1, y0 + 1.5, x1 + 1, y1 + 1.5], 'rgba(0,0,0,0.3)', 3.4); line(c, [x0, y0, x1, y1], '#565b5e', 3.2); line(c, [x0, y0 - 0.9, x1, y1 - 0.9], '#7d8386', 0.7);
      for (const fz of [0.35, 0.7]) line(c, [x0 + (x1 - x0) * fz, y0 + (y1 - y0) * fz, x0 + (x1 - x0) * fz - 2, y0 + (y1 - y0) * fz + 10 * fz + 5], '#3a4046', 0.8); // trestles
    },
    live(c, g, t, s) {
      const d = g.d, W = iw(g, 44);
      const x0 = W * 0.36 + 6 * K, y0 = d * 0.84 - 6, x1 = W * 0.62 + 30 * K, y1 = d * 0.3 - 30;
      for (let i = 0; i < 6; i++) { const p = (t * 0.35 + i / 6) % 1; rect(c, x0 + (x1 - x0) * p - 0.8, y0 + (y1 - y0) * p - 1.6, 1.6, 1.2, '#9a8455'); }   // ore on the belt
      beacon(c, W * 0.66, d * 0.24, 35, t, '#d99a3a', 0.6);
      rect(c, 7 + 4.5, d * 0.7 - 10.8, 2, 1, (t + s.seed) % 2 < 1.6 ? '#4fae7c' : '#2b4a3a');
    },
  },

  // Logistics compound: warehouse, container stacks, drum store, fence.
  supply_depot: {
    base(c, g) {
      const { f } = g, d = g.d, W = iw(g, 30);
      slab(c, 0, 0, g.w, d, '#77756e');
      prism(c, 3, d * 0.08, W * 0.56, d * 0.36, 0, 13, M(f.wall2, 'corrugated'), { pilasters: 4 });                               // warehouse
      gable(c, 2, d * 0.07, W * 0.56 + 2, d * 0.38, 13, 6, M(SLATE, 'corrugated'));
      door(c, 8, d * 0.44, 0, 12, 9, true); door(c, 24, d * 0.44, 0, 5, 7);
      const cols = ['#6f4638', '#3f5060', '#5c6048', '#7b7460', '#4a5258'];
      for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) {
        const x = 4 + i * 12.5 + (r ? 3 : 0), y = d * 0.58 + r * 13;
        container(c, x, y, 0, cols[(i + r * 2) % 5]);
        if ((i + r) % 2 === 0) container(c, x, y, 5, cols[(i + r + 3) % 5]);
      }
      prism(c, W * 0.68, d * 0.1, 13, 11, 0, 9, M(CONCRETE), { roof: M(SLATE, 'slate') });                                        // secure store
      door(c, W * 0.68 + 4, d * 0.1 + 11, 0, 5, 6);
      for (let i = 0; i < 4; i++) cyl(c, W * 0.7 + i * 4.2, d * 0.42, 1.8, 0, 4.5, i % 2 ? '#5b4334' : '#465058', { noShadow: i > 0 }); // drums
      c.strokeStyle = 'rgba(30,34,38,0.5)'; c.lineWidth = 0.5; c.strokeRect(1.5, 1.5, g.w - 3, d - 3);                            // perimeter fence
      c.globalAlpha = 0.7; rect(c, 3 + 10 * K, d * 0.44 - 11.4, W * 0.56, 1.2, f.accent); c.globalAlpha = 1;
    },
    live(c, g, t) { flag(c, g.w * 0.9, g.d * 0.94, 0, 16, g.f.accent, t); },
  },

  // Aviation facility: two large arched hangars with sliding doors, concrete apron, runway markings, control tower.
  airfield: {
    base(c, g) {
      const { f } = g, d = g.d, W = iw(g, 40);
      slab(c, 0, 0, g.w, d, '#6f6f6b', 30);
      rect(c, 3, d * 0.64, g.w - 6, d * 0.3, 'rgba(34,36,38,0.5)');                                                               // runway / taxi strip
      paint(c, [8, d * 0.79, g.w - 8, d * 0.79], '#e2dfd2', 1.2, [9, 7]);
      for (let i = 0; i < 4; i++) { paint(c, [7, d * 0.67 + i * 4.6, 15, d * 0.67 + i * 4.6], '#e2dfd2', 1.2); paint(c, [g.w - 15, d * 0.67 + i * 4.6, g.w - 7, d * 0.67 + i * 4.6], '#e2dfd2', 1.2); }
      paint(c, [W * 0.24, d * 0.52, W * 0.24, d * 0.64], WARN, 0.8); paint(c, [W * 0.7, d * 0.52, W * 0.7, d * 0.64], WARN, 0.8);   // taxi lead-in lines
      for (let i = 0; i < 2; i++) {
        const hx = 3 + i * (W * 0.47), hw = W * 0.44, hy = d * 0.08, hd = d * 0.42;
        castShadow(c, hx, hy, hw, hd, 0, 20);
        face(c, [hx, hy + hd, hx + hw, hy + hd, hx + hw + 9 * K, hy + hd - 9, hx + 9 * K, hy + hd - 9], M(f.wall2, 'corrugated'), 'south');
        face(c, [hx + hw, hy + hd, hx + hw, hy, hx + hw + 9 * K, hy - 9, hx + hw + 9 * K, hy + hd - 9], M(f.wall2, 'corrugated'), 'east');
        // barrel-vault roof
        c.save(); c.beginPath(); c.moveTo(hx + 9 * K, hy + hd - 9); c.quadraticCurveTo(hx + hw / 2 + 26 * K, hy + hd - 34, hx + hw + 9 * K, hy + hd - 9);
        c.lineTo(hx + hw + 9 * K, hy - 9); c.quadraticCurveTo(hx + hw / 2 + 26 * K, hy - 30, hx + 9 * K, hy - 9); c.closePath();
        const rg = c.createLinearGradient(hx, 0, hx + hw + 10, 0); rg.addColorStop(0, shade(SLATE, 0.8)); rg.addColorStop(0.35, shade(SLATE, 1.35)); rg.addColorStop(0.7, shade(SLATE, 1.0)); rg.addColorStop(1, shade(SLATE, 0.6));
        c.fillStyle = rg; c.fill(); c.clip();
        c.strokeStyle = 'rgba(0,0,0,0.16)'; c.lineWidth = 0.5; c.beginPath(); for (let yy = hy - 30; yy < hy + hd; yy += 3) { c.moveTo(hx, yy); c.lineTo(hx + hw + 12, yy); } c.stroke();
        for (let k = 0; k < 5; k++) { const sx = hx + 6 + rnd() * hw, sg = c.createLinearGradient(0, hy - 20, 0, hy + hd); sg.addColorStop(0, 'rgba(110,62,34,0.2)'); sg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = sg; c.fillRect(sx, hy - 20, 1.5, hd); }
        c.restore();
        // gable front + sliding doors
        c.fillStyle = shade(f.wall2, 0.8); c.beginPath(); c.moveTo(hx + 9 * K, hy + hd - 9); c.quadraticCurveTo(hx + hw / 2 + 26 * K, hy + hd - 34, hx + hw + 9 * K, hy + hd - 9); c.closePath(); c.fill();
        door(c, hx + 5, hy + hd, 0, hw - 10, 11, true); line(c, [hx + hw / 2, hy + hd - 11, hx + hw / 2, hy + hd], 'rgba(0,0,0,0.5)', 0.6);
        c.globalAlpha = 0.7; rect(c, hx + 5, hy + hd - 13.4, hw - 10, 1.2, f.accent); c.globalAlpha = 1;
      }
      prism(c, W * 0.95, d * 0.14, 8, 8, 0, 24, M(CONCRETE));                                                                     // control tower
      prism(c, W * 0.95 - 1.5, d * 0.14 - 1.5, 11, 11, 24, 29, M(GUNMETAL, 'armor'));
      rect(c, W * 0.95 - 1.5 + 25 * K, d * 0.14 + 9.5 - 28.5, 11, 2.4, GLASS);
      prism(c, W * 0.93, d * 0.44, 9, 5, 0, 4, M('#5b5a43', 'paint')); cyl(c, W * 0.9, d * 0.56, 2.4, 0, 4, '#6b3f2b', { noShadow: true });   // ground support equipment
    },
    live(c, g, t) {
      const d = g.d, W = iw(g, 40);
      beacon(c, W * 0.95 + 4, d * 0.14 + 4, 30, t);
      for (let i = 0; i < 6; i++) { const on = Math.floor(t * 2 + i) % 6 === 0; c.globalAlpha = on ? 0.9 : 0.35; rect(c, 6 + i * ((g.w - 12) / 5), d * 0.64 - 1, 1.2, 1.2, on ? WARM : '#8d8a70'); } c.globalAlpha = 1;
      const sw = Math.sin(t * 1.4) * 1.2; c.fillStyle = '#b0693e'; c.globalAlpha = 0.9; path(c, [W * 0.9, d * 0.62 - 10, W * 0.9 + 6, d * 0.62 - 10 + sw, W * 0.9 + 6, d * 0.62 - 8 + sw, W * 0.9, d * 0.62 - 7.4]); c.fill(); c.globalAlpha = 1;
      line(c, [W * 0.9, d * 0.62, W * 0.9, d * 0.62 - 10], 'rgba(190,195,198,0.9)', 0.6);
    },
  },

  helipad: {
    base(c, g) {
      const d = g.d;
      slab(c, 0, 0, g.w, d, '#70706c');
      c.save(); c.globalAlpha = 0.9; c.fillStyle = '#4b4f52'; c.beginPath(); c.arc(g.w * 0.45, d * 0.5, g.w * 0.34, 0, Math.PI * 2); c.fill(); c.restore();
      c.save(); c.globalAlpha = 0.6; c.strokeStyle = '#e2dfd2'; c.lineWidth = 1.4; c.beginPath(); c.arc(g.w * 0.45, d * 0.5, g.w * 0.32, 0, Math.PI * 2); c.stroke();
      c.lineWidth = 2.2; c.beginPath(); c.moveTo(g.w * 0.45 - 5, d * 0.5 - 7); c.lineTo(g.w * 0.45 - 5, d * 0.5 + 7); c.moveTo(g.w * 0.45 + 5, d * 0.5 - 7); c.lineTo(g.w * 0.45 + 5, d * 0.5 + 7); c.moveTo(g.w * 0.45 - 5, d * 0.5); c.lineTo(g.w * 0.45 + 5, d * 0.5); c.stroke(); c.restore();
      prism(c, 2, d * 0.78, 15, 8, 0, 7, M(g.f.wall2, 'corrugated'), { roof: M(SLATE, 'slate'), band: [5, 1, g.f.accent] });       // ground-crew shed
      door(c, 6, d * 0.78 + 8, 0, 6, 5, true);
      cyl(c, g.w * 0.86, d * 0.14, 3.4, 0, 6, '#6b3f2b', { rings: 1 }); prism(c, g.w * 0.72, d * 0.08, 6, 5, 0, 4, M(GUNMETAL, 'armor'));  // fuel bowser + pump
    },
    live(c, g, t) {
      const d = g.d;
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const on = Math.floor(t * 3) % 8 === i; c.globalAlpha = on ? 0.95 : 0.4; c.fillStyle = on ? WARM : '#8d8a70'; c.beginPath(); c.arc(g.w * 0.45 + Math.cos(a) * g.w * 0.34, d * 0.5 + Math.sin(a) * g.w * 0.34, 1, 0, Math.PI * 2); c.fill(); }
      c.globalAlpha = 1; flag(c, g.w * 0.9, d * 0.9, 0, 13, '#b0693e', t);
    },
  },

  // Research facility: laboratory wing, taller clean-room block with glazed band, radome, roof chillers, mast.
  research_lab: {
    base(c, g) {
      const { f } = g, d = g.d, W = iw(g, 44);
      slab(c, 0, 0, g.w, d, '#797974');
      prism(c, 4, d * 0.42, W * 0.62, d * 0.38, 0, 16, M(CONCRETE_L), { band: [12.5, 1.4, f.accent] });                           // laboratory wing
      windows(c, windowRects(4, d * 0.42, W * 0.62, d * 0.38, 3, 12, 6, 2));
      door(c, W * 0.5, d * 0.8, 0, 5, 7);
      prism(c, W * 0.48, d * 0.12, W * 0.48, d * 0.36, 0, 28, M(CONCRETE), { pilasters: 3 });                                     // clean-room block
      rect(c, W * 0.48 + 22 * K + 2, d * 0.48 - 24, W * 0.48 - 4, 3, GLASS); rect(c, W * 0.48 + 22 * K + 2, d * 0.48 - 24, W * 0.48 - 4, 0.7, 'rgba(150,185,200,0.3)');
      for (let i = 0; i < 3; i++) hvac(c, W * 0.52 + i * 8.5, d * 0.18, 28, 6.5);                                                 // chillers
      pipe(c, [W * 0.52 + 28 * K, d * 0.34 - 28, W * 0.9 + 28 * K, d * 0.34 - 28], STEEL, 1.2);
      dome(c, W * 0.22, d * 0.3, 0, 10, '#b4b6b1');                                                                               // radome
      prism(c, 4, d * 0.86, 20, 5, 0, 5, M(GUNMETAL, 'galv'));                                                                    // gas bottle store
      whip(c, W * 0.92, d * 0.2, 28, 44);
    },
    live(c, g, t, s) {
      const d = g.d, W = iw(g, 44);
      for (let i = 0; i < 3; i++) fanLive(c, W * 0.52 + i * 8.5 + 3.2, d * 0.18 + 2.6, 31.2, 1.8, t + i);
      beacon(c, W * 0.92, d * 0.2, 44, t, '#e0463c', 0.6);
      lit(c, windowRects(4, d * 0.42, W * 0.62, d * 0.38, 3, 12, 6, 2), t, s.seed, '#dfeaf0');
      c.globalAlpha = 0.25 * litDim; rect(c, W * 0.48 + 22 * K + 2, d * 0.48 - 24, W * 0.48 - 4, 3, '#cfe3ee'); c.globalAlpha = 1;
    },
  },

  turret_gun: { base: (c, g) => turretBase(c, g, 8, 9), live: (c, g, t, s) => turretHead(c, g, t, s, { r: 8, z: 9, len: 13, twin: false, w: 2 }) },

  // SAM battery: revetted pad, canister launcher box, fire-control cabin with tracking radar.
  turret_missile: {
    base(c, g) {
      const d = g.d;
      slab(c, 0, 0, g.w, d, '#74736d');
      prism(c, 3, d * 0.22, g.w * 0.6, 4, 0, 6, M(CONCRETE)); prism(c, 3, d * 0.22, 4, d * 0.56, 0, 6, M(CONCRETE));               // blast revetment
      prism(c, 10, d * 0.38, g.w * 0.44, d * 0.34, 0, 5, M(g.f.armor, 'armor'));                                                  // launcher turntable
      prism(c, 12, d * 0.4, g.w * 0.4, d * 0.26, 5, 14, M(g.f.armor, 'armor'), { band: [11, 1.2, g.f.accent] });                  // canister pack
      for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) { c.fillStyle = '#16191b'; c.beginPath(); c.ellipse(16 + i * 7.4 + 14 * K, d * 0.47 + j * 9 - 14, 2.6, 1.5, 0, 0, Math.PI * 2); c.fill(); c.strokeStyle = 'rgba(255,255,255,0.14)'; c.lineWidth = 0.5; c.stroke(); }
      prism(c, g.w * 0.64, d * 0.52, 12, 10, 0, 9, M(GUNMETAL, 'armor'));                                                         // fire-control cabin
      door(c, g.w * 0.64 + 3.5, d * 0.52 + 10, 0, 4, 6);
      barriers(c, g.w * 0.3, d - 5, g.w * 0.5);
    },
    live(c, g, t, s) {
      dish(c, g.w * 0.64 + 6, g.d * 0.57, 9, 5, s.aim !== null ? s.aim + Math.PI / 2 : t * 0.9 + s.seed);                          // tracking radar turns to the target
      if (s.recoil > 0) { c.globalAlpha = s.recoil * 0.9; c.fillStyle = '#ffdca0'; c.beginPath(); c.arc(20 + 14 * K, g.d * 0.47 - 15, 3.5 * s.recoil + 1.2, 0, Math.PI * 2); c.fill(); c.globalAlpha = s.recoil * 0.35; c.fillStyle = '#c9c9c4'; c.beginPath(); c.arc(22 + 14 * K, g.d * 0.47 - 18, 6, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; }
      rect(c, g.w * 0.64 + 9 * K + 9, g.d * 0.62 - 8, 1.2, 1, s.aim !== null ? '#d8463c' : '#4fae7c');
    },
  },

  turret_aa: {
    base: (c, g) => turretBase(c, g, 8, 8),
    live(c, g, t, s) {
      const cx = g.w / 2 - 3, cy = g.d / 2 + 2, ang = s.aim ?? t * 0.5 + s.seed, z = 8, px = cx + z * K, py = cy - z;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      c.fillStyle = shade(g.f.armor, 0.85); c.beginPath(); c.ellipse(px, py - 1, 6, 3.6, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 0.5; c.stroke();
      for (const o of [-2.6, -0.9, 0.9, 2.6]) {                                                                                    // quad barrels, elevated
        const bx = px - sa * o, by = py - 2 + ca * o * 0.5;
        line(c, [bx, by, bx + ca * 6, by - 11 + sa * 3 + s.recoil * 2], '#1f2326', 1.3); line(c, [bx, by, bx + ca * 6, by - 11 + sa * 3 + s.recoil * 2], '#5d6468', 0.5);
      }
      if (s.recoil > 0.3) { c.globalAlpha = s.recoil; c.fillStyle = '#ffdca0'; c.beginPath(); c.arc(px + ca * 6, py - 14 + sa * 3, 2.4 * s.recoil + 0.8, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; }
    },
  },

  // Coastal-battery style emplacement: thick reinforced-concrete casemate, armoured barbette, observation post.
  heavy_turret: {
    base(c, g) {
      const d = g.d;
      slab(c, 0, 0, g.w, d, '#74736d');
      prism(c, 3, d * 0.2, g.w * 0.66, d * 0.6, 0, 12, M(CONCRETE));                                                              // casemate
      prism(c, 7, d * 0.26, g.w * 0.66 - 8, d * 0.48, 12, 15, M(CONCRETE_D));
      for (let i = 0; i < 3; i++) rect(c, 10 + i * 13 + 8 * K, d * 0.8 - 9.5, 6, 1.6, '#101214');                                  // embrasures
      door(c, g.w * 0.5, d * 0.8, 0, 5, 6);
      cyl(c, g.w * 0.36, d * 0.52, 11, 15, 18, g.f.armor, { noShadow: true });                                                    // barbette
      prism(c, g.w * 0.74, d * 0.5, 8, 8, 0, 16, M(CONCRETE_L));                                                                  // observation post
      rect(c, g.w * 0.74 + 12 * K, d * 0.58 - 14, 8, 1.4, '#101214');
      barriers(c, 4, d - 5, g.w * 0.6);
    },
    live: (c, g, t, s) => turretHead(c, g, t, s, { r: 10, z: 18, len: 20, twin: true, w: 2.8, cxf: 0.36, cyf: 0.52 }),
  },

  // Radar / communications site: equipment building, lattice tower with rotating antenna, whip aerials, generator.
  radar_station: {
    base(c, g) {
      const { f } = g, d = g.d, W = iw(g, 58);
      slab(c, 0, 0, g.w, d, '#787873');
      prism(c, 3, d * 0.46, W * 0.66, d * 0.36, 0, 13, M(CONCRETE_L), { roof: M(SLATE, 'slate'), band: [10, 1.4, f.accent] });      // equipment building
      windows(c, windowRects(3, d * 0.46, W * 0.66, d * 0.36, 3, 11, 5, 1)); door(c, W * 0.5, d * 0.82, 0, 4.5, 7);
      hvac(c, 8, d * 0.52, 13, 6); hvac(c, 16, d * 0.52, 13, 6);
      prism(c, W * 0.42, d * 0.16, 12, 12, 0, 4, M(CONCRETE));                                                                    // tower footing
      lattice(c, W * 0.42 + 6, d * 0.22, 4, 44, 11);
      prism(c, W * 0.42 + 2, d * 0.18, 8, 8, 44, 46, M(GUNMETAL, 'galv'), { noShadow: true });                                    // antenna platform
      whip(c, 6, d * 0.5, 13, 30); whip(c, 12, d * 0.5, 13, 26);
      prism(c, W * 0.78, d * 0.62, 11, 8, 0, 7, M(f.armor, 'armor'));                                                             // generator
      pipe(c, [W * 0.66, d * 0.74 - 2, W * 0.78, d * 0.7 - 2], '#2a2f33', 1);
      c.strokeStyle = 'rgba(30,34,38,0.5)'; c.lineWidth = 0.5; c.strokeRect(W * 0.36, d * 0.1, 22, 24);
    },
    live(c, g, t, s) {
      const d = g.d, W = iw(g, 58), a = t * 1.3 + s.seed, px = W * 0.42 + 6 + 46 * K, py = d * 0.22 - 46;
      line(c, [px, py, px, py - 5], '#3a4046', 1.4);                                                                               // rotating open-frame antenna
      const hw = Math.cos(a) * 12, hy = Math.sin(a) * 3.4;
      c.fillStyle = 'rgba(52,58,62,0.92)'; path(c, [px - hw, py - 5 - hy, px + hw, py - 5 + hy, px + hw, py - 10 + hy, px - hw, py - 10 - hy]); c.fill();
      c.strokeStyle = 'rgba(190,196,200,0.45)'; c.lineWidth = 0.5; c.stroke();
      for (let i = -2; i <= 2; i++) line(c, [px + (hw * i) / 3, py - 5 + (hy * i) / 3, px + (hw * i) / 3, py - 10 + (hy * i) / 3], 'rgba(190,196,200,0.3)', 0.4);
      beacon(c, W * 0.42 + 6, d * 0.22, 58, t);
      lit(c, windowRects(3, d * 0.46, W * 0.66, d * 0.36, 3, 11, 5, 1), t, s.seed);
    },
  },

  // Vehicle maintenance: workshop with roll-up bays, open steel portal with hoist beam, service pit, parts store.
  repair_bay: {
    base(c, g) {
      const { f } = g, d = g.d, W = iw(g, 34);
      slab(c, 0, 0, g.w, d, '#74736d');
      rect(c, 10, d * 0.5, W * 0.56, d * 0.34, 'rgba(34,36,38,0.4)'); rect(c, 22, d * 0.56, 5, d * 0.22, '#17191b');               // service floor + pit
      tyreMarks(c, 18, d * 0.5, d - 1, 12); hazard(c, 9, d * 0.86, W * 0.58, 1.6);
      prism(c, 3, d * 0.12, W * 0.78, d * 0.22, 0, 20, M(f.wall2, 'corrugated'), { pilasters: 4, roof: M(SLATE, 'corrugated'), band: [17, 1.2, f.accent] });   // workshop
      door(c, 8, d * 0.34, 0, 14, 12, true); door(c, 26, d * 0.34, 0, 14, 12, true);
      for (const x of [4, W * 0.74]) { line(c, [x, d * 0.84, x + 20 * K, d * 0.84 - 20], '#4b5156', 2); line(c, [x - 0.6, d * 0.84, x - 0.6 + 20 * K, d * 0.84 - 20], 'rgba(255,255,255,0.18)', 0.5); } // portal columns
      line(c, [4 + 20 * K, d * 0.84 - 20, W * 0.74 + 20 * K, d * 0.84 - 20], shade(WARN, 0.9), 2.2);                               // hoist beam
      prism(c, W * 0.82, d * 0.46, 11, 11, 0, 9, M(CONCRETE), { roof: M(SLATE, 'slate') });                                       // parts store
      crate(c, W * 0.84, d * 0.74, 5, 4, 0, 3.5, '#5b5a43'); cyl(c, W * 0.95, d * 0.78, 1.8, 0, 4.5, '#3f4a55', { noShadow: true });
    },
    live(c, g, t, s) {
      const d = g.d, W = iw(g, 34), x = 10 + (Math.sin(t * 0.6) * 0.5 + 0.5) * W * 0.5 + 20 * K, y = d * 0.84 - 20;
      rect(c, x - 2, y - 1.4, 4, 2.8, '#3a4046'); line(c, [x, y, x, y + 9 + Math.sin(t * 1.4) * 2], 'rgba(200,205,208,0.7)', 0.5); rect(c, x - 1, y + 9 + Math.sin(t * 1.4) * 2, 2, 1.6, '#2a2f33'); // hoist trolley
      if (s.repairing || s.producing) { c.fillStyle = '#fff1c8'; for (let i = 0; i < 3; i++) c.fillRect(24 + Math.sin(t * 40 + i) * 3, d * 0.66 + Math.cos(t * 33 + i) * 2, 1, 1); c.globalAlpha = 0.18 * litDim; rect(c, 16, d * 0.56, 18, 12, '#cfe3ff'); c.globalAlpha = 1; }
      beacon(c, 4, d * 0.84, 21, t, '#d99a3a', 0.9);
    },
  },

  // Field medical station: clinic module, canvas ward tents, ambulance, marked casualty bay.
  field_hospital: {
    base(c, g) {
      const d = g.d, W = iw(g, 28);
      slab(c, 0, 0, g.w, d, '#7b7a73');
      prism(c, 3, d * 0.1, W * 0.6, d * 0.34, 0, 12, M('#b3b1a6', 'paint'), { roof: M('#a5a399', 'slate') });                     // clinic module
      windows(c, windowRects(3, d * 0.1, W * 0.6, d * 0.34, 3, 10, 5, 1)); door(c, W * 0.3, d * 0.44, 0, 5, 7);
      const rx = 3 + W * 0.3 + 12 * K, ry = d * 0.27 - 12;                                                                         // roof red cross (worn)
      c.globalAlpha = 0.75; rect(c, rx - 6, ry - 1.8, 12, 3.6, '#9c3a36'); rect(c, rx - 1.8, ry - 6, 3.6, 12, '#9c3a36'); c.globalAlpha = 1;
      hvac(c, W * 0.5, d * 0.14, 12, 5.5);
      for (let i = 0; i < 2; i++) { const tx = W * 0.44 + i * 17; prism(c, tx, d * 0.52, 15, d * 0.2, 0, 5, M('#6d705a', 'paint')); gable(c, tx - 0.5, d * 0.52 - 0.5, 16, d * 0.2 + 1, 5, 5, M('#74775f', 'paint')); } // ward tents
      prism(c, 5, d * 0.62, 17, 8, 0, 7, M('#a9a79c', 'paint'), { band: [3, 1.4, '#9c3a36'] });                                    // ambulance
      rect(c, 5 + 17 - 5 + 5 * K, d * 0.7 - 6.4, 4, 2.2, GLASS);
      hazard(c, 3, d * 0.93, 24, 1.6);
    },
    live(c, g, t) { const d = g.d; flag(c, g.w * 0.9, d * 0.94, 0, 16, g.f.accent, t); lit(c, windowRects(3, d * 0.1, iw(g, 28) * 0.6, d * 0.34, 3, 10, 5, 1), t, 2); beacon(c, 8, d * 0.66, 7.6, t, '#d8463c', 1.4); },
  },

  // Precast defensive wall: connects to neighbouring pieces; ends, corners and junctions carry a guard post.
  defense_wall: {
    base(c, g) {
      const s = g.w;
      slab(c, 2, 2, s - 4, s - 4, '#6f6e68', 40);
      prism(c, 5, 7, s - 12, s - 16, 0, 11, M(CONCRETE));
      prism(c, 6, 9, s - 14, s - 20, 11, 12.5, M(CONCRETE_D), { noShadow: true });
      c.globalAlpha = 0.7; rect(c, 5 + 8 * K, s - 9 - 9.2, s - 12, 1, g.f.accent); c.globalAlpha = 1;
    },
    live(c, g, t, s) {
      const w = g.w, n = s.neighbors;
      if (n & 2) prism(c, w - 8, w * 0.3, 12, w * 0.4, 0, 9, M(CONCRETE), { noShadow: true });
      if (n & 8) prism(c, -4, w * 0.3, 10, w * 0.4, 0, 9, M(CONCRETE), { noShadow: true });
      if (n & 1) prism(c, w * 0.3, -4, w * 0.36, 12, 0, 9, M(CONCRETE), { noShadow: true });
      if (n & 4) prism(c, w * 0.3, w - 9, w * 0.36, 11, 0, 9, M(CONCRETE), { noShadow: true });
      const straight = n === 5 || n === 10;
      if (!straight) {                                                                                                             // guard post
        prism(c, w * 0.5 - 6, w * 0.5 - 6, 9, 9, 12, 19, M(CONCRETE_L), { noShadow: true });
        rect(c, w * 0.5 - 6 + 16 * K, w * 0.5 + 3 - 17.6, 9, 1.3, '#101214');
        prism(c, w * 0.5 - 7, w * 0.5 - 7, 11, 11, 19, 20.5, M(SLATE, 'slate'), { noShadow: true });
        beacon(c, w * 0.5 - 1, w * 0.5 - 1, 21, t, '#d99a3a', 0.4);
      }
    },
  },
};

// ───────────────────────── gun emplacements ─────────────────────────

function turretBase(c: Ctx, g: G, r: number, z: number) {
  const cx = g.w / 2 - 3, cy = g.d / 2 + 2;
  slab(c, 1, 1, g.w - 2, g.d - 2, '#72716b', 40);
  cyl(c, cx, cy, r + 5, 0, 4, CONCRETE);                                                                                          // concrete ring emplacement
  c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(cx + 4 * K, cy - 4, r + 2.4, (r + 2.4) * 0.5, 0, 0, Math.PI * 2); c.fill();   // pit
  cyl(c, cx, cy, r, 3, z - 1, g.f.armor, { noShadow: true });                                                                     // armoured drum
  c.globalAlpha = 0.75; rect(c, cx - r * 0.5 + 6 * K, cy - 6 + r * 0.42, r, 1, g.f.accent); c.globalAlpha = 1;                    // faction marking
  for (let i = 0; i < 5; i++) { const a = 0.5 + i * 0.5; prism(c, cx + Math.cos(a) * (r + 6.5) - 1.6, cy + Math.sin(a) * (r + 6.5) * 0.5 + 1, 3.2, 1.8, 0, 1.8, M('#7a7460', 'paint'), { noShadow: true }); } // sandbags
}

function turretHead(c: Ctx, g: G, t: number, s: LiveState, o: { r: number; z: number; len: number; twin: boolean; w: number; cxf?: number; cyf?: number }) {
  const cx = o.cxf ? g.w * o.cxf : g.w / 2 - 3, cy = o.cyf ? g.d * o.cyf : g.d / 2 + 2;
  const ang = s.aim ?? Math.sin(t * 0.3 + s.seed) * 0.5 + 0.9;                                                                     // tracks the real target, otherwise a slow watch sweep
  const px = cx + o.z * K, py = cy - o.z, ca = Math.cos(ang), sa = Math.sin(ang), recoil = s.recoil * 2.6;
  // gun house (rotates): angular armoured shell
  const hw = o.r * 0.72, hd = o.r * 0.5;
  const P = (lx: number, ly: number, lz = 0): [number, number] => [px + lx * ca - ly * sa + lz * K, py + (lx * sa + ly * ca) * 0.62 - lz];
  c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(px + 2, py + 1.6, hw + 1.5, hd + 0.5, 0, 0, Math.PI * 2); c.fill();
  const quad = (a: [number, number], b: [number, number], cc: [number, number], dd: [number, number], col: string) => { c.fillStyle = col; path(c, [a[0], a[1], b[0], b[1], cc[0], cc[1], dd[0], dd[1]]); c.fill(); c.strokeStyle = 'rgba(10,12,14,0.35)'; c.lineWidth = 0.4; c.stroke(); };
  const arm = g.f.armor, hgt = o.r * 0.42;
  quad(P(-hw, -hd), P(hw * 0.9, -hd * 0.8), P(hw * 0.9, hd * 0.8), P(-hw, hd), shade(arm, 0.62));                                   // skirt
  // barrels
  const offs = o.twin ? [-o.r * 0.22, o.r * 0.22] : [0];
  for (const off of offs) {
    const b0 = P(hw * 0.5 - recoil, off, hgt * 0.5), b1 = P(hw * 0.5 + o.len - recoil, off, hgt * 0.5);
    line(c, [b0[0] + 0.6, b0[1] + 1, b1[0] + 0.6, b1[1] + 1], 'rgba(0,0,0,0.3)', o.w);
    line(c, [b0[0], b0[1], b1[0], b1[1]], '#23272a', o.w); line(c, [b0[0], b0[1] - o.w * 0.25, b1[0], b1[1] - o.w * 0.25], 'rgba(150,158,162,0.5)', o.w * 0.3);
    const m0 = P(hw * 0.5 + o.len - 3 - recoil, off, hgt * 0.5); line(c, [m0[0], m0[1], b1[0], b1[1]], '#14171a', o.w + 0.9);       // muzzle brake
    if (s.recoil > 0.35) {
      const f = P(hw * 0.5 + o.len + 3, off, hgt * 0.5);
      c.globalAlpha = s.recoil; c.fillStyle = '#ffdca0'; c.beginPath(); c.ellipse(f[0], f[1], 3.4 * s.recoil + 1, 2 * s.recoil + 0.8, ang, 0, Math.PI * 2); c.fill();
      c.globalAlpha = s.recoil * 0.4; c.fillStyle = '#c9c9c4'; c.beginPath(); c.arc(f[0] + ca * 3, f[1] + sa * 2 - 1, 4, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
    }
  }
  const tg = c.createLinearGradient(px - hw, py - hgt, px + hw, py + hd); tg.addColorStop(0, shade(arm, 1.22)); tg.addColorStop(1, shade(arm, 0.86));
  c.fillStyle = tg; const a = P(-hw * 0.85, -hd * 0.8, hgt), b = P(hw * 0.6, -hd * 0.6, hgt), cc = P(hw * 0.6, hd * 0.6, hgt), dd = P(-hw * 0.85, hd * 0.8, hgt);
  path(c, [a[0], a[1], b[0], b[1], cc[0], cc[1], dd[0], dd[1]]); c.fill(); c.strokeStyle = 'rgba(10,12,14,0.4)'; c.lineWidth = 0.4; c.stroke();   // roof plate
  const hh = P(-hw * 0.3, 0, hgt); c.fillStyle = shade(arm, 0.7); c.beginPath(); c.ellipse(hh[0], hh[1], 1.8, 1.1, 0, 0, Math.PI * 2); c.fill();   // hatch
  const sg = P(hw * 0.3, -hd * 0.45, hgt); rect(c, sg[0] - 0.8, sg[1] - 1.4, 1.6, 1.4, s.aim !== null ? '#d8463c' : '#2a2f33');                    // sight: red only while engaging
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
const ruinSprites = new Map<string, HTMLCanvasElement>();
export const artCacheSize = () => sprites.size + holograms.size + ruinSprites.size;

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(w * SPR); cv.height = Math.ceil(h * SPR);
  return cv;
}
const geom = (type: BuildingType, w: number, d: number, fac: Faction): G => ({ w, d, f: FAC[fac], fac, type });
const typeSeed = (type: string) => { let h = 7; for (const ch of type) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };

/** Film grain over the finished sprite: breaks up flat fills so surfaces read as material, not vector art. */
function filmGrain(cv: HTMLCanvasElement, amount = 6) {
  const c = cv.getContext('2d')!; let img: ImageData;
  try { img = c.getImageData(0, 0, cv.width, cv.height); } catch { return; }
  const d = img.data; let s = 99991;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) continue;
    s = (s * 1664525 + 1013904223) >>> 0; const n = ((s >>> 8) / 16777216 - 0.5) * amount;
    d[i] = Math.max(0, Math.min(255, d[i] + n)); d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n)); d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n * 0.9));
  }
  c.putImageData(img, 0, 0);
}

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
  seedRng(typeSeed(type));
  DESIGNS[type].base(c, geom(type, w, d, fac));
  filmGrain(cv);
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
  c.fillStyle = valid ? 'rgba(60,200,150,0.42)' : 'rgba(215,70,70,0.48)';
  c.fillRect(0, 0, cv.width, cv.height);
  holograms.set(key, cv);
  return cv;
}

/** Draws the wreckage of a destroyed building: scorched, cracked foundation with wall stubs, rubble and bent steel. */
export function drawRuinDesign(r: Ctx, w: number, d: number, seed: number): void {
  seedRng(Math.floor(seed * 1e6) + w);
  slab(r, 0, 0, w, d, '#5f5d57', 20);
  r.save(); soft(r, 3); r.fillStyle = 'rgba(12,11,10,0.6)';
  for (let i = 0; i < 3; i++) { r.beginPath(); r.ellipse(w * (0.25 + rnd() * 0.5), d * (0.25 + rnd() * 0.5), w * (0.2 + rnd() * 0.15), d * (0.15 + rnd() * 0.12), rnd() * 3, 0, Math.PI * 2); r.fill(); } // scorch
  r.restore();
  r.strokeStyle = 'rgba(10,10,10,0.55)'; r.lineWidth = 0.7;
  for (let i = 0; i < 5; i++) { r.beginPath(); let px = rnd() * w, py = rnd() * d; r.moveTo(px, py); for (let k = 0; k < 4; k++) { px += (rnd() - 0.5) * w * 0.3; py += (rnd() - 0.5) * d * 0.3; r.lineTo(px, py); } r.stroke(); } // cracks
  for (let i = 0; i < Math.round((w * d) / 420); i++) {                                                                           // broken wall stubs and rubble
    const px = 3 + rnd() * (w - 14), py = 3 + rnd() * (d - 10);
    if (rnd() < 0.35) prism(r, px, py, 4 + rnd() * 10, 2 + rnd() * 3, 0, 2 + rnd() * 6, M(rnd() < 0.5 ? CONCRETE_D : '#57564f'));
    else { r.fillStyle = rnd() < 0.5 ? '#6a6962' : '#4c4b46'; r.beginPath(); r.ellipse(px, py, 1 + rnd() * 2.6, 0.8 + rnd() * 1.6, rnd() * 3, 0, Math.PI * 2); r.fill(); }
  }
  for (let i = 0; i < 4; i++) { const px = rnd() * w, py = rnd() * d; line(r, [px, py, px + (rnd() - 0.5) * 16, py - rnd() * 10, px + (rnd() - 0.5) * 22, py - rnd() * 4], rnd() < 0.5 ? RUST : '#2a2f33', 0.8); } // bent steel
}
export function drawRuin(c: Ctx, x: number, y: number, w: number, d: number, seed: number, alpha: number): void {
  const key = `${w}x${d}|${Math.floor(seed * 4)}`;
  let cv = ruinSprites.get(key);
  if (!cv) {
    cv = makeCanvas(w + MARGIN * 2, d + 20 + MARGIN * 2);
    const r = cv.getContext('2d')!; r.scale(SPR, SPR); r.translate(MARGIN, MARGIN + 20);
    drawRuinDesign(r, w, d, Math.floor(seed * 4) / 4 + 0.1);
    filmGrain(cv, 12);
    ruinSprites.set(key, cv);
  }
  c.save(); c.globalAlpha = alpha;
  c.drawImage(cv, x - MARGIN, y - MARGIN - 20, w + MARGIN * 2, d + 20 + MARGIN * 2);
  c.restore();
}

const hashSeed = (b: Building) => Math.abs(Math.sin(b.x * 12.9898 + b.y * 78.233) * 43758.5453) % 1;

/**
 * Draw one building. (x,y) is the top-left of its footprint in world px, (w,d) the footprint size.
 * Draws the operational facility with live parts (dimmed when damaged), or the staged construction sequence - all from the
 * building's real state.
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
  const hpRatio = b.maxHp > 0 ? Math.max(0, Math.min(1, b.hp / b.maxHp)) : 1;
  const state: LiveState = {
    progress: b.constructionProgress, level: b.level ?? 1, producing: (b.productionQueue?.length ?? 0) > 0, repairing: !!b.isRepairing,
    aim: o.aim ?? null, recoil: o.recoil ?? 0, hpRatio, seed: seed * 10, neighbors: o.neighbors ?? 0,
  };

  if (stage === 'operational') {
    c.drawImage(spr, ox, oy, cw, ch);
    litDim = hpRatio < 0.3 ? 0 : hpRatio < 0.6 ? 0.45 : 1;                 // damaged facilities lose lighting
    c.save(); c.translate(x, y);
    DESIGNS[b.type].live?.(c, g, t, state);
    if (state.level > 1) drawLevelMarks(c, g, state.level);
    c.restore();
    litDim = 1;
    return;
  }

  // ── construction: ground works, foundation pour, structural frame, progressive assembly, finishing ──
  c.save();
  c.fillStyle = 'rgba(78,66,48,0.9)'; c.beginPath(); c.roundRect(x + 1, y + 1, w - 2, d - 2, 3); c.fill();                  // excavated ground
  const pour = stage === 'foundation' ? b.constructionProgress / 0.2 : 1;
  c.fillStyle = '#84837c'; c.beginPath(); c.roundRect(x + 3, y + 3, (w - 6) * Math.min(1, 0.15 + pour * 0.85), d - 6, 2); c.fill(); // foundation pour
  if (stage === 'foundation') {
    c.strokeStyle = 'rgba(95,58,36,0.75)'; c.lineWidth = 0.6;                                                                 // rebar mat
    c.beginPath(); for (let i = 4; i < w - 3; i += 5) { c.moveTo(x + i, y + 3); c.lineTo(x + i, y + d - 3); } for (let i = 4; i < d - 3; i += 5) { c.moveTo(x + 3, y + i); c.lineTo(x + w - 3, y + i); } c.stroke();
    c.strokeStyle = 'rgba(194,160,51,0.75)'; c.lineWidth = 0.9; c.setLineDash([4, 3]); c.strokeRect(x + 0.5, y + 0.5, w - 1, d - 1); c.setLineDash([]); // site tape
  }
  if (stage !== 'foundation') {
    // structural steel frame of the whole volume, then the real design rising inside it
    const top = oy + MARGIN, bottom = y + d, frameA = stage === 'finishing' ? scaffold : 1;
    c.globalAlpha = 0.85 * frameA; c.strokeStyle = '#4a4f54'; c.lineWidth = 1;
    const bays = Math.max(2, Math.round(w / 26)), frameH = Math.min(H * 0.75, bottom - top);
    c.beginPath();
    for (let i = 0; i <= bays; i++) { const px = x + 3 + ((w - 6) * i) / bays; c.moveTo(px, bottom - 2); c.lineTo(px + frameH * K, bottom - 2 - frameH); }
    for (let k = 1; k <= 3; k++) { const z = (frameH * k) / 3; c.moveTo(x + 3 + z * K, bottom - 2 - z); c.lineTo(x + w - 3 + z * K, bottom - 2 - z); }
    c.stroke();
    c.strokeStyle = 'rgba(120,70,44,0.7)'; c.lineWidth = 0.5; c.beginPath();                                                    // bracing
    for (let i = 0; i < bays; i++) { const p0 = x + 3 + ((w - 6) * i) / bays, p1 = x + 3 + ((w - 6) * (i + 1)) / bays; c.moveTo(p0, bottom - 2); c.lineTo(p1 + frameH * K, bottom - 2 - frameH); }
    c.stroke(); c.globalAlpha = 1;
    const cut = oy + (1 - built) * ch;
    c.save(); c.beginPath(); c.rect(ox, cut, cw, ch - (cut - oy)); c.clip();
    c.drawImage(spr, ox, oy, cw, ch);
    c.restore();
    if (stage === 'assembly' && cut > y - H * 0.75 && cut < y + d) {                                                           // welding at the working level
      for (let i = 0; i < 3; i++) { const sx = x + 4 + ((t * 31 + i * 47 + seed * 90) % Math.max(8, w - 8)); const on = (t * 3 + i) % 1 < 0.5; if (on) { c.fillStyle = '#fff1c8'; c.fillRect(sx, cut - 1, 1.2, 1.2); c.globalAlpha = 0.18; c.fillStyle = '#cfe3ff'; c.beginPath(); c.arc(sx, cut, 2, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; } }
    }
  }
  // site crane: mast and jib with a trolley and hook (comes down during finishing)
  const cx = x + w - 5, ctop = y + d - Math.min(H + 12, 54);
  c.globalAlpha = stage === 'finishing' ? scaffold : 1;
  c.strokeStyle = '#b08d2a'; c.lineWidth = 1.3; c.beginPath(); c.moveTo(cx, y + d - 2); c.lineTo(cx, ctop); c.stroke();
  c.lineWidth = 1.1; c.beginPath(); c.moveTo(cx - w * 0.62, ctop); c.lineTo(cx + 7, ctop); c.moveTo(cx, ctop - 5); c.lineTo(cx - w * 0.3, ctop); c.moveTo(cx, ctop - 5); c.lineTo(cx + 7, ctop); c.stroke();
  c.fillStyle = '#5d5f5c'; c.fillRect(cx + 4, ctop, 4, 3);                                                                     // counterweight
  const hx = cx - w * (0.16 + 0.36 * (0.5 + 0.5 * Math.sin(t * 0.45 + seed * 6)));
  const hy = ctop + (y + d - ctop) * (0.35 + 0.3 * (0.5 + 0.5 * Math.sin(t * 0.7 + seed)));
  c.strokeStyle = 'rgba(200,205,208,0.7)'; c.lineWidth = 0.5; c.beginPath(); c.moveTo(hx, ctop); c.lineTo(hx, hy); c.stroke();
  c.fillStyle = '#6a6962'; c.fillRect(hx - 3, hy, 6, 2.4);
  c.globalAlpha = 1;
  // materials on site
  c.fillStyle = '#6a6962'; c.fillRect(x + 4, y + d - 6, 8, 3); c.fillStyle = '#7a4a30'; c.fillRect(x + 14, y + d - 5, 7, 1.2); c.fillRect(x + 14, y + d - 3.4, 7, 1.2);
  c.restore();
}

function drawLevelMarks(c: Ctx, g: G, level: number) {
  for (let i = 0; i < Math.min(4, level - 1); i++) { c.globalAlpha = 0.85; rect(c, 4 + i * 4, g.d - 4, 2.6, 1.4, '#c9b068'); c.globalAlpha = 1; }
}

/** Placement hologram. */
export function drawHologram(c: Ctx, type: BuildingType, x: number, y: number, w: number, d: number, valid: boolean, t: number): void {
  const H = ART_HEIGHT[type];
  c.save();
  c.globalAlpha = 0.66 + 0.08 * Math.sin(t * 4);
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
  seedRng(typeSeed(type));
  litDim = (s.hpRatio ?? 1) < 0.3 ? 0 : (s.hpRatio ?? 1) < 0.6 ? 0.45 : 1;
  DESIGNS[type].base(c, g);
  DESIGNS[type].live?.(c, g, t, { progress: 1, level: 1, producing: false, repairing: false, aim: null, recoil: 0, hpRatio: 1, seed: 1, neighbors: 0, ...s });
  litDim = 1;
}
