/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MapProp } from '../../types/game';

/**
 * Environment props for V14 maps, drawn in the shared 3/4 projection (screen y = ground y - height) with the same
 * north-west sun and south-east shadows as buildings and units.
 *  - trees: cached shaded canopy sprites (several variants per environment), slight sway;
 *  - ruins: extruded, broken concrete city blocks (urban) — they are the impassable tiles of the street grid;
 *  - industrial blocks: fuel tanks and container stacks (desert / coastal facilities).
 * Every prop that blocks movement sits on an impassable tile; decoration never blocks a walkable tile.
 */

const treeCache = new Map<string, HTMLCanvasElement>();

function treeSprite(env: string, variant: number, size: number): HTMLCanvasElement {
  const r = Math.round(size);
  const key = `${env}|${variant % 4}|${r}`;
  let c = treeCache.get(key);
  if (c) return c;
  const pad = 4, W = r * 2 + pad * 2 + 10, H = r * 2 + pad * 2 + 14;
  c = document.createElement('canvas');
  c.width = W * 2; c.height = H * 2;
  const g = c.getContext('2d')!;
  g.scale(2, 2);
  const conifer = env === 'mountain' || (variant % 4 === 3 && env !== 'desert');
  const base = env === 'desert' ? [104, 104, 62] : env === 'mountain' ? [44, 66, 48] : env === 'coastal' ? [58, 84, 50] : [52, 78, 44];
  const cx = pad + r, cy = pad + r + 4;
  // cast shadow (south-east) on the ground
  g.fillStyle = 'rgba(12, 16, 10, 0.32)';
  g.beginPath(); g.ellipse(cx + r * 0.55, cy + r * 0.62, r * 0.95, r * 0.55, 0.25, 0, Math.PI * 2); g.fill();
  // trunk
  g.fillStyle = '#4a3b2c';
  g.fillRect(cx - 1, cy, 2, 5);
  if (conifer) {
    for (let k = 0; k < 3; k++) {
      const y = cy - k * r * 0.42, rr = r * (1 - k * 0.25);
      const grad = g.createLinearGradient(cx - rr, y - rr, cx + rr, y + rr * 0.3);
      grad.addColorStop(0, `rgb(${base[0] + 26},${base[1] + 28},${base[2] + 16})`);
      grad.addColorStop(1, `rgb(${base[0] - 18},${base[1] - 22},${base[2] - 14})`);
      g.fillStyle = grad;
      g.beginPath(); g.moveTo(cx, y - rr * 1.05); g.lineTo(cx + rr * 0.8, y + rr * 0.35); g.lineTo(cx - rr * 0.8, y + rr * 0.35); g.closePath(); g.fill();
    }
  } else {
    // broadleaf canopy: overlapping lobes, lit from the north-west
    const lobes = [[0, 0, 1], [-0.45, 0.12, 0.7], [0.45, 0.1, 0.72], [-0.15, -0.4, 0.68], [0.25, -0.35, 0.6], [0.05, 0.35, 0.7]];
    for (const [ox, oy, s] of lobes) {
      const x = cx + ox * r, y = cy - r * 0.35 + oy * r, rr = r * 0.62 * s + 1;
      const grad = g.createRadialGradient(x - rr * 0.35, y - rr * 0.4, rr * 0.1, x, y, rr);
      grad.addColorStop(0, `rgb(${base[0] + 34},${base[1] + 36},${base[2] + 22})`);
      grad.addColorStop(0.7, `rgb(${base[0]},${base[1]},${base[2]})`);
      grad.addColorStop(1, `rgb(${base[0] - 22},${base[1] - 26},${base[2] - 18})`);
      g.fillStyle = grad;
      g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
    }
  }
  treeCache.set(key, c);
  if (treeCache.size > 200) treeCache.delete(treeCache.keys().next().value as string);
  return c;
}

export function drawTree(ctx: CanvasRenderingContext2D, p: MapProp, env: string, time: number) {
  const spr = treeSprite(env, p.variant ?? 0, p.size);
  const sway = Math.sin(time * 1.3 + p.x * 0.05) * 0.6;
  const w = spr.width / 2, h = spr.height / 2, r = Math.round(p.size);
  ctx.drawImage(spr, p.x - (4 + r) + sway, p.y - (4 + r + 4), w, h);
}

/** Ruined city block: p.x,p.y = top-left world corner, p.size = width px, p.rotation = depth px. */
export function drawRuin(ctx: CanvasRenderingContext2D, p: MapProp) {
  const x = p.x + 2, y = p.y + 2, w = p.size - 4, d = p.rotation - 4;
  const v = p.variant ?? 0;
  const H = 18 + (v % 3) * 9;
  // ground shadow toward the south-east
  ctx.fillStyle = 'rgba(10, 12, 14, 0.32)';
  ctx.beginPath();
  ctx.moveTo(x + w, y); ctx.lineTo(x + w + H * 0.42, y + H * 0.3); ctx.lineTo(x + w + H * 0.42, y + d + H * 0.3); ctx.lineTo(x + H * 0.42, y + d + H * 0.3); ctx.lineTo(x, y + d); ctx.closePath(); ctx.fill();
  // rubble apron
  ctx.fillStyle = 'rgba(120, 112, 100, 0.55)';
  ctx.fillRect(x - 2, y + d - 2, w + 4, 5);
  // south facade (visible wall) with window openings and a broken top edge
  const top = y + d - H;
  const jag = (i: number) => (Math.sin(i * 1.7 + v * 3) > 0.35 ? 6 : Math.sin(i * 0.9 + v) > 0.6 ? 3 : 0);
  const fac = ctx.createLinearGradient(0, top, 0, y + d);
  fac.addColorStop(0, '#8d8a82'); fac.addColorStop(1, '#6b6862');
  ctx.fillStyle = fac;
  ctx.beginPath(); ctx.moveTo(x, y + d);
  for (let i = 0; i <= 8; i++) ctx.lineTo(x + (w * i) / 8, top + jag(i));
  ctx.lineTo(x + w, y + d); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(28, 30, 32, 0.85)';
  const cols = Math.max(2, Math.floor(w / 14)), rows = Math.max(1, Math.floor(H / 10));
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if ((r * 7 + c * 3 + v) % 5 === 0) continue;
    ctx.fillRect(x + 4 + c * (w - 8) / cols, top + 7 + r * 9, Math.max(3, (w - 8) / cols - 5), 4);
  }
  // roof slab (seen from above), cracked and partly collapsed
  ctx.fillStyle = '#9b978e';
  ctx.beginPath(); ctx.moveTo(x, y - H);
  for (let i = 0; i <= 8; i++) ctx.lineTo(x + (w * i) / 8, y - H + jag(i) * 0.3);
  ctx.lineTo(x + w, top + jag(8)); for (let i = 8; i >= 0; i--) ctx.lineTo(x + (w * i) / 8, top + jag(i)); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(40, 40, 40, 0.55)';
  ctx.beginPath(); ctx.ellipse(x + w * (0.3 + (v % 2) * 0.35), y - H + d * 0.45, w * 0.16, d * 0.14, 0.4, 0, Math.PI * 2); ctx.fill(); // collapsed section
  ctx.strokeStyle = 'rgba(50, 48, 46, 0.5)'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(x + w * 0.1, y - H + d * 0.2); ctx.lineTo(x + w * 0.45, y - H + d * 0.55); ctx.lineTo(x + w * 0.7, y - H + d * 0.4); ctx.stroke();
  // west wall edge (thin, lit)
  ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(x, top, 2, H);
}

/** Industrial facility block: fuel tank (variant 0), container stack (1), pipe rack (2). */
export function drawIndustrial(ctx: CanvasRenderingContext2D, p: MapProp) {
  const v = p.variant ?? 0, s = p.size;
  const x = p.x, y = p.y;
  ctx.fillStyle = 'rgba(10, 12, 14, 0.3)';
  ctx.beginPath(); ctx.ellipse(x + s * 0.45, y + s * 0.35, s * 0.95, s * 0.5, 0.2, 0, Math.PI * 2); ctx.fill();
  if (v === 0) {
    const r = s * 0.75, H = s * 1.1;
    const g = ctx.createLinearGradient(x - r, 0, x + r, 0);
    g.addColorStop(0, '#d4d0c4'); g.addColorStop(0.55, '#a9a598'); g.addColorStop(1, '#7c796f');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - H, r * 2, H);
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.45, 0, 0, Math.PI); ctx.fill();
    ctx.fillStyle = '#c9c5b8'; ctx.beginPath(); ctx.ellipse(x, y - H, r, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(60,58,52,0.5)'; ctx.lineWidth = 0.7;
    for (let k = 1; k < 3; k++) { ctx.beginPath(); ctx.ellipse(x, y - H + (H * k) / 3, r, r * 0.45, 0, 0, Math.PI); ctx.stroke(); }
  } else if (v === 1) {
    const cols = ['#7a5a46', '#566a72', '#7a7552', '#6d4e4a'];
    for (let k = 0; k < 3; k++) {
      const cw = s * 1.5, ch = s * 0.62, H = s * 0.55;
      const bx = x - cw / 2 + (k % 2) * 3, by = y - k * H;
      ctx.fillStyle = cols[(k + Math.round(p.x)) % 4];
      ctx.fillRect(bx, by - H, cw, H);                  // side
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(bx, by - H - ch * 0.5, cw, ch * 0.5); // top
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.6;
      for (let i = 1; i < 8; i++) { ctx.beginPath(); ctx.moveTo(bx + (cw * i) / 8, by - H); ctx.lineTo(bx + (cw * i) / 8, by); ctx.stroke(); }
    }
  } else {
    ctx.fillStyle = '#6f6b63';
    ctx.fillRect(x - s, y - s * 0.9, s * 2, 3);
    ctx.fillRect(x - s, y - s * 0.5, s * 2, 3);
    ctx.fillStyle = '#55524c';
    for (const ox of [-s, 0, s - 2]) ctx.fillRect(x + ox, y - s * 0.9, 2, s * 0.9);
    ctx.fillStyle = '#8c887e';
    ctx.beginPath(); ctx.arc(x - s * 0.5, y - s * 0.9, 2.5, 0, Math.PI * 2); ctx.arc(x + s * 0.5, y - s * 0.5, 2.5, 0, Math.PI * 2); ctx.fill();
  }
}

/** Props that stand above the ground and must be depth-sorted with units and buildings. */
export const isTallProp = (p: MapProp) => p.type === 'tree' || p.type === 'ruin' || p.type === 'barricade';
/** Ground line used for depth sorting (the south edge of a ruin block, the base of a tree). */
export const propDepthY = (p: MapProp) => (p.type === 'ruin' ? p.y + p.rotation : p.y);

const depositCache = new Map<number, HTMLCanvasElement>();
/** Titanium deposit: a rocky outcrop with shaded crystal facets (no text label); a faint pulse marks it as a resource. */
export function drawDeposit(ctx: CanvasRenderingContext2D, x: number, y: number, seed: number, time: number) {
  const v = Math.abs(seed) % 3;
  let c = depositCache.get(v);
  if (!c) {
    c = document.createElement('canvas');
    c.width = 112; c.height = 96;
    const g = c.getContext('2d')!;
    g.scale(2, 2);
    const cx = 28, cy = 30;
    g.fillStyle = 'rgba(14, 16, 14, 0.3)';
    g.beginPath(); g.ellipse(cx + 5, cy + 6, 22, 10, 0.15, 0, Math.PI * 2); g.fill();
    // rock bed
    const rocks = [[-10, 2, 9], [8, 3, 10], [-1, -3, 8], [14, -2, 6], [-15, -2, 6]];
    for (const [ox, oy, r] of rocks) {
      const gr = g.createLinearGradient(cx + ox - r, cy + oy - r, cx + ox + r, cy + oy + r);
      gr.addColorStop(0, '#8c877c'); gr.addColorStop(1, '#4f4c46');
      g.fillStyle = gr;
      g.beginPath(); g.ellipse(cx + ox, cy + oy, r, r * 0.62, 0.3, 0, Math.PI * 2); g.fill();
    }
    // crystal facets: muted cyan, lit face + shaded face
    const xs = [[-6, 15, -0.25], [2, 20, 0.12], [9, 13, 0.4], [-12, 10, -0.5], [14, 9, 0.6]].slice(0, 3 + v);
    for (const [ox, len, ang] of xs) {
      const bx = cx + ox, by = cy + 1, tx = bx + Math.sin(ang) * len, ty = by - Math.cos(ang) * len;
      const nx = Math.cos(ang) * 2.6, ny = Math.sin(ang) * 2.6;
      g.fillStyle = '#7fc9d3';
      g.beginPath(); g.moveTo(bx - nx, by - ny); g.lineTo(tx, ty); g.lineTo(bx, by); g.closePath(); g.fill();
      g.fillStyle = '#3f8f9e';
      g.beginPath(); g.moveTo(bx, by); g.lineTo(tx, ty); g.lineTo(bx + nx, by + ny); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(220, 245, 248, 0.5)'; g.lineWidth = 0.5;
      g.beginPath(); g.moveTo(bx - nx * 0.5, by - ny * 0.5); g.lineTo(tx, ty); g.stroke();
    }
    depositCache.set(v, c);
  }
  const pulse = 0.18 + Math.sin(time * 2.2 + seed) * 0.06;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = pulse;
  const gl = ctx.createRadialGradient(x, y - 4, 0, x, y - 4, 26);
  gl.addColorStop(0, 'rgba(110, 200, 215, 0.9)'); gl.addColorStop(1, 'rgba(110, 200, 215, 0)');
  ctx.fillStyle = gl; ctx.fillRect(x - 26, y - 30, 52, 52);
  ctx.restore();
  ctx.drawImage(c, x - 28, y - 30, 56, 48);
}
