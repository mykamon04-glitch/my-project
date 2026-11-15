/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Software 3D renderer for unit sprites (V11).
 *
 * Units are real 3D models (articulated soldiers, vehicles with separate turrets, aircraft) built from boxes, lofted convex
 * solids, cylinders and ellipsoids. This module rasterises such a model into a small RGBA sprite using the SAME camera as
 * the buildings: an orthographic "three-quarter" view from the south (screen x = X, screen y = Y - Z), so a unit shows its
 * top and its south-facing sides, verticals stay vertical and the footprint on the ground is not foreshortened (which is
 * what the simulation, selection and pathfinding assume).
 *
 * Pipeline: z-buffer rasterisation (super-sampled) -> deferred shading (two lights + ambient, per-material procedural
 * colour: camouflage, weathered paint, track links, glass, metal) -> part/silhouette edge definition -> projected ground
 * shadow (sun from the north-west, same direction as building shadows) -> box-filter down-sampling.
 *
 * Everything here is pure typed-array maths (no DOM), so it runs in tests and in Node scripts as well as in the browser.
 */

export type Vec3 = [number, number, number];

export const M_MATTE = 0, M_CAMO = 1, M_METAL = 2, M_GLASS = 3, M_RUBBER = 4, M_SKIN = 5, M_GLOW = 6, M_TRACK = 7;

export interface Material {
  kind: number;
  c: [number, number, number];        // base colour (0-255)
  pal?: [number, number, number][];   // camouflage: additional colours
  spec?: number;                      // specular strength (metal / glass)
  dust?: number;                      // 0..1: dust picked up near the ground
  freq?: number;                      // pattern frequency (1 / px)
  wear?: number;                      // tonal variation amplitude (weathering)
}

export interface Mesh {
  v: Float32Array;                    // 3 vertices per triangle, 9 floats per vertex: position, normal, texture-space position
  tm: Uint16Array;                    // material index per triangle
  tp: Uint16Array;                    // part id per triangle (edge definition)
  n: number;                          // triangle count
  marks: Record<string, Vec3>;        // named attachment points (muzzle, turret ring, rotor hub ...)
  r: number;                          // largest horizontal distance from the origin
  zMin: number;
  zMax: number;
}

// ───────────────────────── mesh builder ─────────────────────────

const IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

export class MeshBuilder {
  private v: number[] = [];
  private tm: number[] = [];
  private tp: number[] = [];
  private m: number[] = IDENT.slice();
  private stack: number[][] = [];
  private part = 0;
  private lo = 0;
  mat = 0;
  marks: Record<string, Vec3> = {};

  push(): this { this.stack.push(this.m); this.m = this.m.slice(); return this; }
  pop(): this { this.m = this.stack.pop() ?? IDENT.slice(); return this; }
  use(mat: number): this { this.mat = mat; return this; }

  private mul(b: number[]): void {
    const a = this.m, r = new Array<number>(12);
    for (let i = 0; i < 3; i++) {
      const a0 = a[i * 4], a1 = a[i * 4 + 1], a2 = a[i * 4 + 2];
      r[i * 4] = a0 * b[0] + a1 * b[4] + a2 * b[8];
      r[i * 4 + 1] = a0 * b[1] + a1 * b[5] + a2 * b[9];
      r[i * 4 + 2] = a0 * b[2] + a1 * b[6] + a2 * b[10];
      r[i * 4 + 3] = a0 * b[3] + a1 * b[7] + a2 * b[11] + a[i * 4 + 3];
    }
    this.m = r;
  }
  move(x: number, y: number, z: number): this { this.mul([1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z]); return this; }
  /** Rotation about x: +a lifts +y towards +z. */
  rotX(a: number): this { const c = Math.cos(a), s = Math.sin(a); this.mul([1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0]); return this; }
  /** Rotation about y: +a tips +z towards +x (leaning forward). */
  rotY(a: number): this { const c = Math.cos(a), s = Math.sin(a); this.mul([c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0]); return this; }
  /** Rotation about z: +a turns +x towards +y (clockwise on screen, like a heading). */
  rotZ(a: number): this { const c = Math.cos(a), s = Math.sin(a); this.mul([c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0]); return this; }

  /** Model-space position of a local point under the current transform. */
  pt(x: number, y: number, z: number): Vec3 {
    const m = this.m;
    return [m[0] * x + m[1] * y + m[2] * z + m[3], m[4] * x + m[5] * y + m[6] * z + m[7], m[8] * x + m[9] * y + m[10] * z + m[11]];
  }
  private dir(x: number, y: number, z: number): Vec3 {
    const m = this.m;
    return [m[0] * x + m[1] * y + m[2] * z, m[4] * x + m[5] * y + m[6] * z, m[8] * x + m[9] * y + m[10] * z];
  }
  mark(name: string, x: number, y: number, z: number): this { this.marks[name] = this.pt(x, y, z); return this; }

  private begin(): void { this.part++; this.lo = (this.part * 7.31) % 97; }

  /** Triangle in local coordinates. `hint` (local) points outwards; optional per-vertex normals give smooth shading. */
  private tri(a: Vec3, b: Vec3, c: Vec3, hint: Vec3, na?: Vec3, nb?: Vec3, nc?: Vec3): void {
    let A = this.pt(a[0], a[1], a[2]), B = this.pt(b[0], b[1], b[2]), C = this.pt(c[0], c[1], c[2]);
    let la = a, lb = b, lc = c;
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    let gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
    const gl = Math.sqrt(gx * gx + gy * gy + gz * gz);
    if (gl < 1e-9) return;
    const h = this.dir(hint[0], hint[1], hint[2]);
    if (gx * h[0] + gy * h[1] + gz * h[2] < 0) { const t = B; B = C; C = t; const tl = lb; lb = lc; lc = tl; const tn = nb; nb = nc; nc = tn; gx = -gx; gy = -gy; gz = -gz; }
    const fx = gx / gl, fy = gy / gl, fz = gz / gl;
    const N = (n?: Vec3): Vec3 => { if (!n) return [fx, fy, fz]; const d = this.dir(n[0], n[1], n[2]); const l = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]) || 1; return [d[0] / l, d[1] / l, d[2] / l]; };
    const NA = N(na), NB = N(nb), NC = N(nc), lo = this.lo;
    this.v.push(A[0], A[1], A[2], NA[0], NA[1], NA[2], la[0] + lo, la[1] + lo * 0.37, la[2] + lo * 0.71,
      B[0], B[1], B[2], NB[0], NB[1], NB[2], lb[0] + lo, lb[1] + lo * 0.37, lb[2] + lo * 0.71,
      C[0], C[1], C[2], NC[0], NC[1], NC[2], lc[0] + lo, lc[1] + lo * 0.37, lc[2] + lo * 0.71);
    this.tm.push(this.mat); this.tp.push(this.part);
  }
  private quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, hint: Vec3, na?: Vec3, nb?: Vec3, nc?: Vec3, nd?: Vec3): void {
    this.tri(a, b, c, hint, na, nb, nc); this.tri(a, c, d, hint, na, nc, nd);
  }

  /** Axis-aligned box (in the current local frame) centred at (cx,cy,cz). */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): this {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    return this.loft([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]);
  }

  /** Convex solid between two planar polygons with the same vertex count (caps included). */
  loft(pa: Vec3[], pb: Vec3[]): this {
    this.begin();
    const n = pa.length;
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < n; i++) { cx += pa[i][0] + pb[i][0]; cy += pa[i][1] + pb[i][1]; cz += pa[i][2] + pb[i][2]; }
    cx /= 2 * n; cy /= 2 * n; cz /= 2 * n;
    const cen = (p: Vec3[]): Vec3 => { let x = 0, y = 0, z = 0; for (const q of p) { x += q[0]; y += q[1]; z += q[2]; } return [x / p.length - cx, y / p.length - cy, z / p.length - cz]; };
    const ha = cen(pa), hb = cen(pb);
    for (let i = 1; i < n - 1; i++) { this.tri(pa[0], pa[i], pa[i + 1], ha); this.tri(pb[0], pb[i], pb[i + 1], hb); }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const hx = (pa[i][0] + pa[j][0] + pb[i][0] + pb[j][0]) / 4 - cx, hy = (pa[i][1] + pa[j][1] + pb[i][1] + pb[j][1]) / 4 - cy, hz = (pa[i][2] + pa[j][2] + pb[i][2] + pb[j][2]) / 4 - cz;
      this.quad(pa[i], pa[j], pb[j], pb[i], [hx, hy, hz]);
    }
    return this;
  }

  /** Side profile (x,z) extruded across the width from y0 to y1. The profile must be convex. */
  prismY(profile: number[][], y0: number, y1: number): this {
    return this.loft(profile.map(p => [p[0], y0, p[1]] as Vec3), profile.map(p => [p[0], y1, p[1]] as Vec3));
  }

  /** Plan outline (x,y) extruded from z0 to z1; the top can be scaled about the centroid and shifted (sloped sides). */
  prismZ(outline: number[][], z0: number, z1: number, topScale = 1, dx = 0, dy = 0): this {
    let cx = 0, cy = 0;
    for (const p of outline) { cx += p[0]; cy += p[1]; }
    cx /= outline.length; cy /= outline.length;
    return this.loft(outline.map(p => [p[0], p[1], z0] as Vec3), outline.map(p => [cx + (p[0] - cx) * topScale + dx, cy + (p[1] - cy) * topScale + dy, z1] as Vec3));
  }

  /** Cylinder / cone frustum between two points, smooth shaded. caps: bit 1 = at a, bit 2 = at b. */
  cyl(a: Vec3, b: Vec3, r0: number, r1 = r0, seg = 8, caps = 3): this {
    this.begin();
    let ax = b[0] - a[0], ay = b[1] - a[1], az = b[2] - a[2];
    const al = Math.hypot(ax, ay, az) || 1; ax /= al; ay /= al; az /= al;
    let ux: number, uy: number, uz: number;
    if (Math.abs(az) < 0.9) { ux = ay; uy = -ax; uz = 0; } else { ux = 0; uy = az; uz = -ay; }
    const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
    const vx = ay * uz - az * uy, vy = az * ux - ax * uz, vz = ax * uy - ay * ux;
    const ra: Vec3[] = [], rb: Vec3[] = [], nn: Vec3[] = [];
    for (let i = 0; i < seg; i++) {
      const t = (i / seg) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
      const dx = ux * c + vx * s, dy = uy * c + vy * s, dz = uz * c + vz * s;
      nn.push([dx, dy, dz]);
      ra.push([a[0] + dx * r0, a[1] + dy * r0, a[2] + dz * r0]);
      rb.push([b[0] + dx * r1, b[1] + dy * r1, b[2] + dz * r1]);
    }
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      this.quad(ra[i], ra[j], rb[j], rb[i], [nn[i][0] + nn[j][0], nn[i][1] + nn[j][1], nn[i][2] + nn[j][2]], nn[i], nn[j], nn[j], nn[i]);
    }
    if (caps & 1 && r0 > 0.01) for (let i = 1; i < seg - 1; i++) this.tri(ra[0], ra[i], ra[i + 1], [-ax, -ay, -az]);
    if (caps & 2 && r1 > 0.01) for (let i = 1; i < seg - 1; i++) this.tri(rb[0], rb[i], rb[i + 1], [ax, ay, az]);
    return this;
  }

  /** Ellipsoid, smooth shaded. `from` (-1..1) cuts away the part below that fraction of the vertical radius (domes). */
  ell(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, seg = 10, rings = 6, from = -1): this {
    this.begin();
    const t0 = Math.asin(Math.max(-1, Math.min(1, from)));
    const P: Vec3[][] = [], NN: Vec3[][] = [];
    for (let r = 0; r <= rings; r++) {
      const th = t0 + ((Math.PI / 2 - t0) * r) / rings, ct = Math.cos(th), st = Math.sin(th);
      const row: Vec3[] = [], nrow: Vec3[] = [];
      for (let i = 0; i < seg; i++) {
        const ph = (i / seg) * Math.PI * 2, x = ct * Math.cos(ph), y = ct * Math.sin(ph);
        row.push([cx + rx * x, cy + ry * y, cz + rz * st]);
        nrow.push([x / rx, y / ry, st / rz]);
      }
      P.push(row); NN.push(nrow);
    }
    for (let r = 0; r < rings; r++) for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      const h: Vec3 = [P[r][i][0] + P[r + 1][j][0] - 2 * cx, P[r][i][1] + P[r + 1][j][1] - 2 * cy, P[r][i][2] + P[r + 1][j][2] - 2 * cz];
      this.quad(P[r][i], P[r][j], P[r + 1][j], P[r + 1][i], h, NN[r][i], NN[r][j], NN[r + 1][j], NN[r + 1][i]);
    }
    if (from > -1) for (let i = 1; i < seg - 1; i++) this.tri(P[0][0], P[0][i], P[0][i + 1], [0, 0, -1]);
    return this;
  }

  build(): Mesh {
    const v = new Float32Array(this.v);
    let r = 0, zMin = Infinity, zMax = -Infinity;
    for (let i = 0; i < v.length; i += 9) { const d = Math.hypot(v[i], v[i + 1]); if (d > r) r = d; if (v[i + 2] < zMin) zMin = v[i + 2]; if (v[i + 2] > zMax) zMax = v[i + 2]; }
    if (!Number.isFinite(zMin)) { zMin = 0; zMax = 0; }
    return { v, tm: new Uint16Array(this.tm), tp: new Uint16Array(this.tp), n: this.tm.length, marks: this.marks, r, zMin, zMax };
  }
}

// ───────────────────────── rendering ─────────────────────────

export const SHADOW_DX = 0.42, SHADOW_DY = 0.3;      // ground shadow offset per unit of height (same as building shadows)
const SHADOW_ALPHA = 0.36;

const nrm = (x: number, y: number, z: number): Vec3 => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
const L1 = nrm(-0.42, -0.3, 0.86);                   // sun: north-west, high
const L2 = nrm(-0.18, 0.62, 0.76);                   // sky / fill from the viewer's side
const VIEW = nrm(0, 1, 1);
const H1 = nrm(L1[0] + VIEW[0], L1[1] + VIEW[1], L1[2] + VIEW[2]);
const H2 = nrm(L2[0] + VIEW[0], L2[1] + VIEW[1], L2[2] + VIEW[2]);
const AMB = 0.42, K1 = 0.46, K2 = 0.44;
const DUST: Vec3 = [124, 112, 88];

function hash3(x: number, y: number, z: number): number {
  let h = (Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
// Value-noise lattice: a 32^3 table of random values (trilinear look-ups are much cheaper than hashing 8 corners per call).
const NS_BITS = 5, NS_N = 1 << NS_BITS, NS_MASK = NS_N - 1;
const NOISE = (() => { const t = new Float32Array(NS_N * NS_N * NS_N); let h = 0x9e3779b9; for (let i = 0; i < t.length; i++) { h = Math.imul(h ^ (h >>> 15), 2246822519) + 0x7f4a7c15 | 0; h ^= h >>> 13; t[i] = (h >>> 0) / 4294967296; } return t; })();
/** Smooth 3D value noise in [0,1] (periodic every 32 units, which is far larger than any unit). */
export function vnoise(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let xf = x - xi, yf = y - yi, zf = z - zi;
  xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf); zf = zf * zf * (3 - 2 * zf);
  const x0 = xi & NS_MASK, x1 = (xi + 1) & NS_MASK, y0 = (yi & NS_MASK) << NS_BITS, y1 = ((yi + 1) & NS_MASK) << NS_BITS, z0 = (zi & NS_MASK) << (2 * NS_BITS), z1 = ((zi + 1) & NS_MASK) << (2 * NS_BITS);
  const a = NOISE[z0 + y0 + x0], b = NOISE[z0 + y0 + x1], c = NOISE[z0 + y1 + x0], d = NOISE[z0 + y1 + x1];
  const e = NOISE[z1 + y0 + x0], f = NOISE[z1 + y0 + x1], g = NOISE[z1 + y1 + x0], h = NOISE[z1 + y1 + x1];
  const ab = a + (b - a) * xf, cd = c + (d - c) * xf, ef = e + (f - e) * xf, gh = g + (h - g) * xf;
  const lo = ab + (cd - ab) * yf, hi = ef + (gh - ef) * yf;
  return lo + (hi - lo) * zf;
}

export interface RenderParams {
  heading: number;          // radians; 0 = facing +X (east), positive turns clockwise on screen
  roll?: number;            // rotation about the model's long axis, applied before the heading (aircraft banking)
  wpx: number; hpx: number; // sprite size in world px
  ax: number; ay: number;   // position of the model origin inside the sprite (world px from the top-left corner)
  texel: number;            // texels per world px
  ss: number;               // super-sampling per texel (1-3)
  shadow: 0 | 1 | 2;        // 0 none, 1 baked under the body, 2 shadow only (aircraft: flat plan silhouette)
  shadowMesh?: Mesh;        // additional geometry that only casts shadow (e.g. the turret, for the hull sprite)
  groundAO?: number;        // surfaces below this height are darkened towards the ground (vehicles)
  treadPhase?: number;      // 0..1 offset of the track-link pattern
  ink?: number;             // edge definition strength 0..1 (default 1)
  gain?: number;            // exposure multiplier (small figures are lit a little brighter so they read on dark ground)
}
export interface Sprite { w: number; h: number; data: Uint8ClampedArray }

let ZB = new Float32Array(0), B0 = new Float32Array(0), B1 = new Float32Array(0);
let TI = new Int32Array(0), SC = new Uint8ClampedArray(0), SH = new Uint8Array(0), TV = new Float32Array(0), SA = new Float32Array(0), SB = new Float32Array(0);

/** Row span [lo, hi] (in sample centres) where a*x + b >= 0 holds for three linear functions; returns false when empty. */
const SPAN = new Float64Array(2);
function span(a0: number, b0: number, a1: number, b1: number, a2: number, b2: number, lo: number, hi: number): boolean {
  const E = -1e-7;
  if (a0 > 1e-12) { const t = (E - b0) / a0; if (t > lo) lo = t; } else if (a0 < -1e-12) { const t = (E - b0) / a0; if (t < hi) hi = t; } else if (b0 < E) return false;
  if (a1 > 1e-12) { const t = (E - b1) / a1; if (t > lo) lo = t; } else if (a1 < -1e-12) { const t = (E - b1) / a1; if (t < hi) hi = t; } else if (b1 < E) return false;
  if (a2 > 1e-12) { const t = (E - b2) / a2; if (t > lo) lo = t; } else if (a2 < -1e-12) { const t = (E - b2) / a2; if (t < hi) hi = t; } else if (b2 < E) return false;
  SPAN[0] = lo; SPAN[1] = hi;
  return hi >= lo;
}

function fillTri(mask: Uint8Array, W: number, H: number, x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): void {
  const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (area === 0) return;
  const inv = 1 / area;
  const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
  const bx0 = Math.min(x0, x1, x2) - 0.5, bx1 = Math.max(x0, x1, x2) + 0.5;
  const a0 = (y1 - y2) * inv, a1 = (y2 - y0) * inv, a2 = -(a0 + a1);
  for (let y = minY; y <= maxY; y++) {
    const py = y + 0.5;
    const b0 = (x1 * (y2 - py) - x2 * (y1 - py)) * inv, b1 = (x2 * (y0 - py) - x0 * (y2 - py)) * inv;
    if (!span(a0, b0, a1, b1, a2, 1 - b0 - b1, bx0, bx1)) continue;
    const xs = Math.max(0, Math.ceil(SPAN[0] - 0.5)), xe = Math.min(W - 1, Math.floor(SPAN[1] - 0.5));
    if (xe >= xs) mask.fill(1, y * W + xs, y * W + xe + 1);
  }
}

/** Rasterise a mesh into an RGBA sprite (non-premultiplied alpha). */
export function renderMesh(mesh: Mesh, mats: Material[], p: RenderParams): Sprite {
  const ss = Math.max(1, Math.round(p.ss)), S = p.texel * ss;
  const W = Math.max(1, Math.ceil(p.wpx * p.texel)), H = Math.max(1, Math.ceil(p.hpx * p.texel));
  const Ws = W * ss, Hs = H * ss, NS = Ws * Hs;
  if (ZB.length < NS) { ZB = new Float32Array(NS); B0 = new Float32Array(NS); B1 = new Float32Array(NS); TI = new Int32Array(NS); SC = new Uint8ClampedArray(NS * 3); SH = new Uint8Array(NS); }
  const shadowCount = p.shadowMesh ? p.shadowMesh.n : 0;
  if (TV.length < mesh.n * 18) TV = new Float32Array(mesh.n * 18);
  ZB.fill(-1e9, 0, NS); TI.fill(-1, 0, NS);
  const ch = Math.cos(p.heading), sh = Math.sin(p.heading), cr = Math.cos(p.roll ?? 0), sr = Math.sin(p.roll ?? 0);
  const ox = p.ax * S, oy = p.ay * S;
  const v = mesh.v, nv = mesh.n * 3;

  // 1. transform (roll, then heading)
  for (let k = 0; k < nv; k++) {
    const i = k * 9, o = k * 6;
    const x = v[i], y = v[i + 1] * cr - v[i + 2] * sr, z = v[i + 1] * sr + v[i + 2] * cr;
    const nx = v[i + 3], ny = v[i + 4] * cr - v[i + 5] * sr, nz = v[i + 4] * sr + v[i + 5] * cr;
    TV[o] = x * ch - y * sh; TV[o + 1] = x * sh + y * ch; TV[o + 2] = z;
    TV[o + 3] = nx * ch - ny * sh; TV[o + 4] = nx * sh + ny * ch; TV[o + 5] = nz;
  }

  // 2. z-buffer rasterisation (visible triangle + barycentrics per sample)
  if (p.shadow !== 2) {
    for (let t = 0; t < mesh.n; t++) {
      const a = t * 18, b = a + 6, c = a + 12;
      const X0 = TV[a], Y0 = TV[a + 1], Z0 = TV[a + 2], X1 = TV[b], Y1 = TV[b + 1], Z1 = TV[b + 2], X2 = TV[c], Y2 = TV[c + 1], Z2 = TV[c + 2];
      // back-face culling against the view direction (0,1,1)
      const ux = X1 - X0, uy = Y1 - Y0, uz = Z1 - Z0, vx = X2 - X0, vy = Y2 - Y0, vz = Z2 - Z0;
      const gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
      if (gy + gz <= 1e-9) continue;
      const x0 = X0 * S + ox, y0 = (Y0 - Z0) * S + oy, x1 = X1 * S + ox, y1 = (Y1 - Z1) * S + oy, x2 = X2 * S + ox, y2 = (Y2 - Z2) * S + oy;
      const d0 = Y0 + Z0, d1 = Y1 + Z1, d2 = Y2 + Z2;
      const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
      if (area === 0) continue;
      const inv = 1 / area;
      const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxY = Math.min(Hs - 1, Math.ceil(Math.max(y0, y1, y2)));
      const bx0 = Math.min(x0, x1, x2) - 0.5, bx1 = Math.max(x0, x1, x2) + 0.5;
      const a0 = (y1 - y2) * inv, a1 = (y2 - y0) * inv, a2 = -(a0 + a1);
      const dd = a0 * d0 + a1 * d1 + a2 * d2;                              // depth step per sample along x
      for (let y = minY; y <= maxY; y++) {
        const py = y + 0.5;
        const b0 = (x1 * (y2 - py) - x2 * (y1 - py)) * inv, b1 = (x2 * (y0 - py) - x0 * (y2 - py)) * inv, b2 = 1 - b0 - b1;
        if (!span(a0, b0, a1, b1, a2, b2, bx0, bx1)) continue;
        const xs = Math.max(0, Math.ceil(SPAN[0] - 0.5)), xe = Math.min(Ws - 1, Math.floor(SPAN[1] - 0.5));
        if (xe < xs) continue;
        const px0 = xs + 0.5;
        let w0 = a0 * px0 + b0, w1 = a1 * px0 + b1, d = w0 * d0 + w1 * d1 + (1 - w0 - w1) * d2, i = y * Ws + xs;
        for (let x = xs; x <= xe; x++, i++, w0 += a0, w1 += a1, d += dd) {
          if (d > ZB[i]) { ZB[i] = d; TI[i] = t; B0[i] = w0; B1[i] = w1; }
        }
      }
    }

    // 3. deferred shading
    const aoH = p.groundAO ?? 0, tread = p.treadPhase ?? 0, gain = p.gain ?? 1;
    // Shading is memoised per texel: the samples of one texel that fall on the same triangle share one evaluation
    // (the difference would be sub-texel and is averaged away by the down-sampling anyway).
    let mt = -1, mr = 0, mg = 0, mb = 0;
    for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
      mt = -1;
      for (let sy = 0; sy < ss; sy++) {
      const y = ty * ss + sy, ypz = (y + 0.5 - oy) / S;                // Y - Z of this sample row
      for (let sx = 0; sx < ss; sx++) {
        const i = y * Ws + tx * ss + sx, t = TI[i];
        if (t < 0) continue;
        if (t === mt) { const o = i * 3; SC[o] = mr; SC[o + 1] = mg; SC[o + 2] = mb; continue; }
        const w0 = B0[i], w1 = B1[i], w2 = 1 - w0 - w1, a = t * 18, b = a + 6, c = a + 12;
        let nx = w0 * TV[a + 3] + w1 * TV[b + 3] + w2 * TV[c + 3], ny = w0 * TV[a + 4] + w1 * TV[b + 4] + w2 * TV[c + 4], nz = w0 * TV[a + 5] + w1 * TV[b + 5] + w2 * TV[c + 5];
        const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; nx /= nl; ny /= nl; nz /= nl;
        const va = t * 27, vb = va + 9, vc = va + 18;
        const lx = w0 * v[va + 6] + w1 * v[vb + 6] + w2 * v[vc + 6], ly = w0 * v[va + 7] + w1 * v[vb + 7] + w2 * v[vc + 7], lz = w0 * v[va + 8] + w1 * v[vb + 8] + w2 * v[vc + 8];
        const m = mats[mesh.tm[t]] ?? mats[0];
        const Z = (ZB[i] - ypz) / 2;                                    // height above the ground
        let r = m.c[0], g = m.c[1], bl = m.c[2];
        const d1 = Math.max(0, nx * L1[0] + ny * L1[1] + nz * L1[2]), d2 = Math.max(0, nx * L2[0] + ny * L2[1] + nz * L2[2]);
        let I = AMB + K1 * d1 + K2 * d2, spec = 0;
        switch (m.kind) {
          case M_CAMO: {
            const f = m.freq ?? 0.9, pal = m.pal!;
            const n1 = vnoise(lx * f, ly * f, lz * f), n2 = vnoise(lx * f * 2.1 + 31.7, ly * f * 2.1 + 11.3, lz * f * 2.1 + 5.9);
            const k = n1 > 0.6 ? 0 : n2 > 0.62 ? 1 : n1 < 0.32 ? 2 : -1;
            if (k >= 0 && pal[k]) { r = pal[k][0]; g = pal[k][1]; bl = pal[k][2]; }
            const gr = 0.94 + 0.12 * hash3((lx * 9) | 0, (ly * 9) | 0, (lz * 9) | 0);
            I *= gr;
            break;
          }
          case M_MATTE: {
            const w = m.wear ?? 0.1;
            I *= 1 - w + 2 * w * vnoise(lx * 0.45, ly * 0.45, lz * 0.45);
            I *= 0.97 + 0.06 * hash3((lx * 7) | 0, (ly * 7) | 0, (lz * 7) | 0);
            break;
          }
          case M_METAL:
            spec = (m.spec ?? 0.35) * (Math.pow(Math.max(0, nx * H1[0] + ny * H1[1] + nz * H1[2]), 22) + 0.7 * Math.pow(Math.max(0, nx * H2[0] + ny * H2[1] + nz * H2[2]), 22));
            I *= 0.95 + 0.1 * vnoise(lx * 0.8, ly * 0.8, lz * 0.8);
            break;
          case M_GLASS: {
            const sky = Math.max(0, nz) * 0.5 + Math.max(0, ny) * 0.2;
            r += (150 - r) * sky * 0.45; g += (172 - g) * sky * 0.45; bl += (188 - bl) * sky * 0.45;
            spec = (m.spec ?? 0.8) * (Math.pow(Math.max(0, nx * H1[0] + ny * H1[1] + nz * H1[2]), 30) + Math.pow(Math.max(0, nx * H2[0] + ny * H2[1] + nz * H2[2]), 30));
            I = 0.55 + 0.45 * I;
            break;
          }
          case M_RUBBER:
            I = 0.55 + 0.45 * I;
            break;
          case M_TRACK: {
            const f = m.freq ?? 0.5, q = (lx * f + tread) % 1;
            if ((q < 0 ? q + 1 : q) < 0.5) { r *= 0.62; g *= 0.62; bl *= 0.62; }
            I = 0.6 + 0.4 * I;
            break;
          }
          case M_GLOW:
            I = 1.15;
            break;
          default:
            break;
        }
        if (aoH > 0 && Z < aoH) I *= 0.7 + 0.3 * Math.max(0, Z) / aoH;
        const du = m.dust ?? 0;
        if (du > 0) {
          let k = 0;
          if (Z < 4.5) k = du * (1 - Math.max(0, Z) / 4.5) * (0.55 + 0.45 * vnoise(lx * 0.6 + 3.1, ly * 0.6, lz * 0.6));
          if (nz > 0.5) k += du * 0.18 * nz * vnoise(lx * 0.35 + 9.4, ly * 0.35, lz * 0.35);
          if (k > 0) { r += (DUST[0] - r) * k; g += (DUST[1] - g) * k; bl += (DUST[2] - bl) * k; }
        }
        const s255 = spec * 255, o = i * 3;
        I *= gain;
        mt = t; mr = Math.min(255, r * I + s255); mg = Math.min(255, g * I + s255); mb = Math.min(255, bl * I + s255);
        SC[o] = mr; SC[o + 1] = mg; SC[o + 2] = mb;
      }
      }
    }

    // 4. edge definition: darken the far side of part boundaries and the outer silhouette (thin, never a black outline)
    const ink = p.ink ?? 1;
    if (ink > 0) {
      const kIn = 1 - 0.24 * ink, kOut = 1 - 0.34 * ink, tp = mesh.tp;
      for (let y = 0; y < Hs; y++) for (let x = 0; x < Ws; x++) {
        const i = y * Ws + x, t = TI[i];
        if (t < 0) continue;
        let k = 1;
        const pt = tp[t], zi = ZB[i];
        for (let q = 0; q < 4; q++) {
          const j = q === 0 ? (x + 1 < Ws ? i + 1 : -1) : q === 1 ? (y + 1 < Hs ? i + Ws : -1) : q === 2 ? (x > 0 ? i - 1 : -1) : (y > 0 ? i - Ws : -1);
          if (j < 0 || TI[j] < 0) { if (kOut < k) k = kOut; continue; }
          if (tp[TI[j]] !== pt && ZB[j] - zi > 0.3 && kIn < k) k = kIn;
        }
        if (k < 1) { const o = i * 3; SC[o] *= k; SC[o + 1] *= k; SC[o + 2] *= k; }
      }
    }
  }

  // 5. ground shadow mask
  const wantShadow = p.shadow !== 0;
  if (wantShadow) {
    SH.fill(0, 0, NS);
    const flat = p.shadow === 2;
    const cast = (tv: Float32Array, n: number) => {
      for (let t = 0; t < n; t++) {
        const a = t * 18, b = a + 6, c = a + 12;
        // only faces turned towards the sun can outline the shadow of a closed solid
        const ux = tv[b] - tv[a], uy = tv[b + 1] - tv[a + 1], uz = tv[b + 2] - tv[a + 2], wx = tv[c] - tv[a], wy = tv[c + 1] - tv[a + 1], wz = tv[c + 2] - tv[a + 2];
        if (-(uy * wz - uz * wy) * SHADOW_DX - (uz * wx - ux * wz) * SHADOW_DY + (ux * wy - uy * wx) <= 0) continue;
        const z0 = flat ? 0 : Math.max(0, tv[a + 2]), z1 = flat ? 0 : Math.max(0, tv[b + 2]), z2 = flat ? 0 : Math.max(0, tv[c + 2]);
        fillTri(SH, Ws, Hs, (tv[a] + SHADOW_DX * z0) * S + ox, (tv[a + 1] + SHADOW_DY * z0) * S + oy, (tv[b] + SHADOW_DX * z1) * S + ox, (tv[b + 1] + SHADOW_DY * z1) * S + oy, (tv[c] + SHADOW_DX * z2) * S + ox, (tv[c + 1] + SHADOW_DY * z2) * S + oy);
      }
    };
    cast(TV, mesh.n);
    if (p.shadowMesh && shadowCount) {
      const sv = p.shadowMesh.v, tmp = new Float32Array(shadowCount * 18);
      for (let k = 0; k < shadowCount * 3; k++) { const i = k * 9, o = k * 6; tmp[o] = sv[i] * ch - sv[i + 1] * sh; tmp[o + 1] = sv[i] * sh + sv[i + 1] * ch; tmp[o + 2] = sv[i + 2]; }
      cast(tmp, shadowCount);
    }
  }

  // 6. down-sample (box filter), soften the shadow, composite body over shadow
  const NT = W * H;
  if (SA.length < NT) { SA = new Float32Array(NT); SB = new Float32Array(NT); }
  const out = new Uint8ClampedArray(NT * 4), inv = 1 / (ss * ss);
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    let r = 0, g = 0, b = 0, n = 0, s = 0;
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const i = (ty * ss + sy) * Ws + tx * ss + sx;
      if (p.shadow !== 2 && TI[i] >= 0) { const o = i * 3; r += SC[o]; g += SC[o + 1]; b += SC[o + 2]; n++; } else if (wantShadow && SH[i]) s++;
    }
    const ti = ty * W + tx, o = ti * 4;
    if (n) { out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; }
    out[o + 3] = n * inv * 255;
    SA[ti] = s * inv;
  }
  if (wantShadow) {
    const passes = p.shadow === 2 ? 2 : 1;
    for (let k = 0; k < passes; k++) {
      for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
        let acc = 0, cnt = 0;
        for (let dy = -1; dy <= 1; dy++) { const yy = ty + dy; if (yy < 0 || yy >= H) continue; for (let dx = -1; dx <= 1; dx++) { const xx = tx + dx; if (xx < 0 || xx >= W) continue; acc += SA[yy * W + xx]; cnt++; } }
        SB[ty * W + tx] = acc / cnt;
      }
      SA.set(SB.subarray(0, NT));
    }
    for (let i = 0; i < NT; i++) {
      const o = i * 4, ab = out[o + 3] / 255, as = SA[i] * SHADOW_ALPHA * (1 - ab), A = ab + as;
      if (A <= 0) continue;
      const k = ab / A;                                               // shadow colour is near-black, so only the weights change
      out[o] = out[o] * k + 8 * (1 - k); out[o + 1] = out[o + 1] * k + 9 * (1 - k); out[o + 2] = out[o + 2] * k + 10 * (1 - k);
      out[o + 3] = A * 255;
    }
  }
  return { w: W, h: H, data: out };
}

export interface FitSprite extends Sprite { ax: number; ay: number; texel: number }
export type FitParams = Omit<RenderParams, 'wpx' | 'hpx' | 'ax' | 'ay'> & { pad?: number };

/**
 * Render a mesh into a sprite that is cropped to what is actually drawn for this heading (body and shadow), and report
 * where the model origin lies inside it (ax, ay in world px). Tight sprites keep the cache small.
 */
export function renderFit(mesh: Mesh, mats: Material[], o: FitParams): FitSprite {
  const ch = Math.cos(o.heading), sh = Math.sin(o.heading), cr = Math.cos(o.roll ?? 0), sr = Math.sin(o.roll ?? 0);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const scan = (m: Mesh, body: boolean) => {
    const v = m.v;
    for (let i = 0; i < m.n * 27; i += 9) {
      const yy = v[i + 1] * cr - v[i + 2] * sr, z = v[i + 1] * sr + v[i + 2] * cr;
      const X = v[i] * ch - yy * sh, Y = v[i] * sh + yy * ch;
      if (body && o.shadow !== 2) { if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y - z < y0) y0 = Y - z; if (Y - z > y1) y1 = Y - z; }
      if (o.shadow) {
        const zz = o.shadow === 2 ? 0 : Math.max(0, z), sx = X + SHADOW_DX * zz, sy = Y + SHADOW_DY * zz;
        if (sx < x0) x0 = sx; if (sx > x1) x1 = sx; if (sy < y0) y0 = sy; if (sy > y1) y1 = sy;
      }
    }
  };
  scan(mesh, true);
  if (o.shadowMesh && o.shadow) scan(o.shadowMesh, false);
  if (!Number.isFinite(x0)) { x0 = x1 = y0 = y1 = 0; }
  const pad = o.pad ?? 1.5, t = o.texel;
  const ax = Math.ceil((-x0 + pad) * t) / t, ay = Math.ceil((-y0 + pad) * t) / t;
  const spr = renderMesh(mesh, mats, { ...o, wpx: ax + x1 + pad, hpx: ay + y1 + pad, ax, ay });
  return { w: spr.w, h: spr.h, data: spr.data, ax, ay, texel: t };
}

/** Screen offset (world px, relative to the model origin) of a model-space point for a given heading / roll. */
export function projectPoint(pt: Vec3, heading: number, roll = 0): [number, number] {
  const cr = Math.cos(roll), sr = Math.sin(roll), ch = Math.cos(heading), sh = Math.sin(heading);
  const y = pt[1] * cr - pt[2] * sr, z = pt[1] * sr + pt[2] * cr;
  return [pt[0] * ch - y * sh, pt[0] * sh + y * ch - z];
}
