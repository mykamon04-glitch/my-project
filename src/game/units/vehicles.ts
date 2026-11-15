/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MeshBuilder, Vec3 } from './raster';
import { MAT } from './palette';

/**
 * Ground vehicle models (V11). Every vehicle type has its own hull and, where it has one in the game, its own separately
 * rendered turret / weapon mount (so the mount can traverse independently of the hull, exactly as the simulation does).
 *
 * Frames: hull - origin on the ground under the vehicle centre, +x forward, +y right, +z up (world px).
 *         turret - origin at the centre of the turret ring, on the hull roof.
 */

export interface TurretOpts { recoil?: number; elev?: number }
export interface VehicleDef {
  hull: (b: MeshBuilder) => void;
  turret?: { pivot: Vec3; build: (b: MeshBuilder, o: TurretOpts) => void; elevIdle?: number; elevFire?: number };
  tracked: boolean;
}

// ───────────────────────── shared helpers ─────────────────────────

interface Chassis { L: number; W: number; tw: number; th: number; hh: number; wheels: number; glacis: number; skirts?: boolean; rear?: number }

/** Both track units with running gear (road wheels, sprocket, idler) and optional armoured skirts. */
function tracks(b: MeshBuilder, c: Chassis): void {
  const e = c.th * 0.75, x0 = -c.L / 2, x1 = c.L / 2;
  for (const side of [-1, 1]) {
    const yo = side * (c.W / 2), yi = side * (c.W / 2 - c.tw);
    b.use(MAT.TRACK).prismY([[x0 + e, 0], [x1 - e, 0], [x1, c.th * 0.5], [x1 - e * 0.55, c.th], [x0 + e * 0.55, c.th], [x0, c.th * 0.5]], Math.min(yo, yi), Math.max(yo, yi));
    b.use(MAT.DARK).box(0, yo + side * 0.04, c.th * 0.5, c.L - 2 * e * 0.9, 0.08, c.th - 1.1);                       // shadowed well behind the wheels
    const r = (c.th - 0.8) / 2, zc = r + 0.28, span = c.L - 2 * e - r * 0.6;
    for (let i = 0; i < c.wheels; i++) {
      const x = -span / 2 + (span * i) / Math.max(1, c.wheels - 1);
      b.use(MAT.RUBBER).cyl([x, yo + side * 0.02, zc], [x, yo + side * 0.3, zc], r, r, 10);                       // tyre
      b.use(MAT.ARMOR2).cyl([x, yo + side * 0.3, zc], [x, yo + side * 0.38, zc], r * 0.74, r * 0.7, 10);              // dished wheel
      b.use(MAT.DARK).cyl([x, yo + side * 0.38, zc], [x, yo + side * 0.42, zc], r * 0.24, r * 0.24, 6);               // hub
    }
    b.use(MAT.STEEL).cyl([x0 + e * 0.62, yo + side * 0.02, c.th * 0.56], [x0 + e * 0.62, yo + side * 0.32, c.th * 0.56], c.th * 0.34, c.th * 0.34, 8);   // drive sprocket
    b.use(MAT.STEEL).cyl([x1 - e * 0.62, yo + side * 0.02, c.th * 0.56], [x1 - e * 0.62, yo + side * 0.32, c.th * 0.56], c.th * 0.32, c.th * 0.32, 8);   // idler
    b.use(MAT.ARMOR).box(-0.3, (yo + yi) / 2, c.th + 0.1, c.L - 5.6, c.tw + 0.2, 0.22);                              // fender (track ends stay visible)
    if (c.skirts) {
      const n = 5, len = c.L - 2 * e * 0.8, seg = len / n;
      for (let i = 0; i < n; i++) b.use(i % 2 ? MAT.ARMOR : MAT.ARMOR2).box(-len / 2 + seg * (i + 0.5), yo + side * 0.36, c.th * 0.78, seg - 0.16, 0.24, c.th * 0.52);
    }
  }
}

/** Lower and upper hull of a tracked vehicle: boat-shaped tub between the tracks and an armoured box with a sloped glacis. */
function trackedHull(b: MeshBuilder, c: Chassis, paint: number = MAT.ARMOR): void {
  const x0 = -c.L / 2, x1 = c.L / 2, inner = c.W / 2 - c.tw - 0.05, rear = c.rear ?? 0.5;
  b.use(MAT.ARMOR2).prismY([[x0 + 1.2, 0.9], [x1 - 2.4, 0.9], [x1 - 0.6, c.th - 0.2], [x0 + 0.5, c.th - 0.2]], -inner, inner);
  b.use(paint).prismY([[x0 + 0.3, c.th - 0.3], [x1 - 0.5, c.th - 0.3], [x1 - 0.5, c.th + 0.3], [x1 - c.glacis, c.hh], [x0 + 0.4 + rear, c.hh], [x0 + 0.3, c.hh - rear]], -c.W / 2 + 0.18, c.W / 2 - 0.18);
}

/** Road wheels of a wheeled vehicle: tyre + painted hub on each side for every axle position. */
function wheels(b: MeshBuilder, xs: number[], W: number, r: number, tw: number): void {
  for (const x of xs) for (const side of [-1, 1]) {
    const yo = side * (W / 2), yi = side * (W / 2 - tw);
    b.use(MAT.RUBBER).cyl([x, yi, r], [x, yo, r], r, r, 12);
    b.use(MAT.ARMOR2).cyl([x, yo, r], [x, yo + side * 0.12, r], r * 0.52, r * 0.46, 8);
    b.use(MAT.DARK).cyl([x, yo + side * 0.12, r], [x, yo + side * 0.16, r], r * 0.2, r * 0.2, 6);
  }
}

interface Gun { x: number; y?: number; z: number; len: number; r: number; evac?: number; brake?: number; sleeve?: boolean; mat?: number }
/** Gun barrel that elevates about its trunnion and slides back when it recoils. Records the muzzle position. */
function gun(b: MeshBuilder, g: Gun, o: TurretOpts, mark = 'muzzle'): void {
  const rc = (o.recoil ?? 0) * Math.min(1.8, g.len * 0.12), y = g.y ?? 0;
  b.push().move(g.x, y, g.z).rotY(-(o.elev ?? 0));
  b.use(g.mat ?? MAT.STEEL).cyl([-rc, 0, 0], [g.len - rc, 0, 0], g.r, g.r * 0.92, 8);
  if (g.sleeve) for (let i = 1; i < 4; i++) b.use(MAT.ARMOR2).cyl([g.len * (0.14 + i * 0.17) - rc, 0, 0], [g.len * (0.14 + i * 0.17) + 0.5 - rc, 0, 0], g.r * 1.18, g.r * 1.18, 8, 0);
  if (g.evac) b.use(MAT.ARMOR2).cyl([g.len * g.evac - rc, 0, 0], [g.len * g.evac + Math.max(1.6, g.len * 0.16) - rc, 0, 0], g.r * 1.6, g.r * 1.6, 8);
  if (g.brake) { b.use(MAT.DARK).cyl([g.len - g.brake - rc, 0, 0], [g.len - rc, 0, 0], g.r * 1.55, g.r * 1.55, 8); }
  b.use(MAT.DARK).cyl([g.len - rc, 0, 0], [g.len - rc + 0.05, 0, 0], g.r * 0.6, g.r * 0.6, 6);                      // bore
  if (mark) b.mark(mark, g.len - rc + 0.3, 0, 0);
  b.pop();
}

const hatch = (b: MeshBuilder, x: number, y: number, z: number, r: number) => { b.use(MAT.ARMOR2).cyl([x, y, z], [x, y, z + 0.18], r, r * 0.92, 8); };
const antenna = (b: MeshBuilder, x: number, y: number, z: number, h: number) => { b.use(MAT.GUN).cyl([x, y, z], [x - h * 0.06, y, z + h], 0.1, 0.07, 4, 0); };
const idPanel = (b: MeshBuilder, x: number, y: number, z: number, sx: number, sy: number) => { b.use(MAT.TEAM).box(x, y, z + 0.05, sx, sy, 0.1); };
const lamp = (b: MeshBuilder, x: number, y: number, z: number) => { b.use(MAT.LIGHT).box(x, y, z, 0.3, 0.55, 0.4); };
const grille = (b: MeshBuilder, x: number, y: number, z: number, sx: number, sy: number) => { b.use(MAT.DARK).box(x, y, z + 0.05, sx, sy, 0.1); };
/** Pintle machine gun on a roof. */
function mg(b: MeshBuilder, x: number, y: number, z: number, len = 3.2): void {
  b.use(MAT.GUN).cyl([x, y, z], [x, y, z + 0.7], 0.14, 0.14, 4, 0);
  b.use(MAT.GUN).box(x + 0.4, y, z + 0.8, 1.3, 0.34, 0.42);
  b.use(MAT.GUN).cyl([x + 1.0, y, z + 0.82], [x + len, y, z + 0.86], 0.12, 0.1, 5);
}

// ───────────────────────── tanks ─────────────────────────

const MBT: Chassis = { L: 26, W: 13.4, tw: 2.7, th: 3.5, hh: 5.3, wheels: 6, glacis: 6.2, skirts: true, rear: 0.6 };
function mbtHull(b: MeshBuilder): void {
  const c = MBT, x0 = -c.L / 2, x1 = c.L / 2;
  tracks(b, c); trackedHull(b, c);
  b.use(MAT.ARMOR2).box(x1 - c.glacis - 1.7, 0, c.hh + 0.07, 2.0, 2.3, 0.14);                                        // driver's hatch
  b.use(MAT.GLASS).box(x1 - c.glacis - 0.55, 0, c.hh + 0.24, 0.3, 1.3, 0.26);                                        // periscopes
  grille(b, x0 + 3.4, -2.6, c.hh, 4.4, 3.6); grille(b, x0 + 3.4, 2.6, c.hh, 4.4, 3.6);                               // engine deck louvres
  b.use(MAT.ARMOR2).box(x0 + 3.4, 0, c.hh + 0.1, 4.6, 1.2, 0.2);
  b.use(MAT.DARK).box(x0 + 0.22, -3.2, c.hh - 1.1, 0.2, 1.8, 0.7); b.use(MAT.DARK).box(x0 + 0.22, 3.2, c.hh - 1.1, 0.2, 1.8, 0.7);   // exhaust outlets
  b.use(MAT.DARK).cyl([1.5, 0, c.hh], [1.5, 0, c.hh + 0.14], 4.9, 4.9, 14);                                          // turret ring shadow
  b.use(MAT.ARMOR2).box(x0 + 6.0, -(c.W / 2 - 1.3), c.th + 0.72, 4.4, 1.7, 0.95); b.use(MAT.ARMOR2).box(x0 + 6.4, c.W / 2 - 1.3, c.th + 0.72, 5.2, 1.7, 0.95);   // fender stowage bins
  b.use(MAT.TRACK).box(x1 - 3.0, 0, c.th + 1.25, 0.3, 4.0, 1.0);                                                     // spare track links on the glacis
  lamp(b, x1 - 1.3, -4.0, c.th + 0.75); lamp(b, x1 - 1.3, 4.0, c.th + 0.75);
  b.use(MAT.GUN).cyl([x1 - 4.2, -5.4, c.th + 0.5], [x1 - 9.5, -5.4, c.th + 0.5], 0.12, 0.12, 4);                      // tow cable
  idPanel(b, x0 + 1.5, 0, c.hh, 1.5, 2.8);
  b.use(MAT.TEAM).box(x0 + 0.24, 0, c.hh - 1.15, 0.16, 2.2, 0.8);
}
function mbtTurret(b: MeshBuilder, o: TurretOpts): void {
  b.use(MAT.ARMOR).prismZ([[6.6, -1.5], [6.6, 1.5], [3.8, 4.6], [-4.4, 4.8], [-7.6, 3.7], [-7.6, -3.7], [-4.4, -4.8], [3.8, -4.6]], 0.15, 2.95, 0.86, -0.25);
  b.use(MAT.ARMOR2).box(-8.6, 0, 1.55, 2.0, 6.4, 1.5);                                                               // bustle stowage rack
  b.use(MAT.CANVAS).cyl([-8.6, -2.6, 2.55], [-8.6, 2.6, 2.55], 0.55, 0.55, 6);                                       // rolled tarpaulin
  b.use(MAT.ARMOR2).box(6.4, 0, 1.55, 1.3, 2.6, 1.8);                                                                // mantlet
  gun(b, { x: 6.8, z: 1.6, len: 14.2, r: 0.5, evac: 0.46, sleeve: true }, o);
  b.use(MAT.ARMOR2).cyl([-1.6, -2.1, 2.9], [-1.6, -2.1, 3.65], 1.2, 1.1, 10);                                        // commander's cupola
  b.use(MAT.GLASS).cyl([-1.6, -2.1, 3.2], [-1.6, -2.1, 3.45], 1.24, 1.24, 10, 0);
  mg(b, -0.9, -2.1, 3.65);
  hatch(b, -1.4, 2.1, 2.95, 1.05);                                                                                    // loader's hatch
  b.use(MAT.ARMOR2).box(3.0, -2.5, 3.2, 1.4, 1.0, 0.75); b.use(MAT.GLASS).box(3.72, -2.5, 3.25, 0.1, 0.8, 0.5);        // gunner's primary sight
  b.use(MAT.ARMOR2).cyl([1.6, 2.4, 2.9], [1.6, 2.4, 3.9], 0.5, 0.5, 6); b.use(MAT.GLASS).box(2.0, 2.4, 3.6, 0.1, 0.6, 0.4);   // independent thermal viewer
  for (const s of [-1, 1]) { b.use(MAT.GUN).box(3.9, s * 4.75, 1.7, 1.5, 0.5, 0.8); }                                 // smoke grenade dischargers
  antenna(b, -5.8, -3.2, 2.9, 6.5); antenna(b, -5.8, 3.2, 2.9, 5.2);
  idPanel(b, -4.8, 0, 2.95, 1.9, 2.6);
}

const LIGHT: Chassis = { L: 21, W: 11.4, tw: 2.3, th: 3.0, hh: 4.5, wheels: 5, glacis: 5.4, skirts: false, rear: 0.5 };
function lightHull(b: MeshBuilder): void {
  const c = LIGHT, x0 = -c.L / 2, x1 = c.L / 2;
  tracks(b, c); trackedHull(b, c);
  b.use(MAT.ARMOR2).box(x1 - c.glacis - 1.4, -1.6, c.hh + 0.07, 1.8, 2.0, 0.14);
  grille(b, x0 + 2.8, 0, c.hh, 3.6, 5.6);
  b.use(MAT.DARK).cyl([0.8, 0, c.hh], [0.8, 0, c.hh + 0.12], 3.9, 3.9, 12);
  b.use(MAT.STEEL).cyl([x0 + 0.6, 3.6, c.hh - 0.3], [x0 + 3.4, 3.6, c.hh + 0.2], 0.35, 0.35, 6);                      // exhaust pipe
  b.use(MAT.ARMOR2).box(x0 + 5.6, -(c.W / 2 - 1.1), c.th + 0.6, 3.4, 1.4, 0.8);
  b.use(MAT.WOOD).cyl([x0 + 6.0, c.W / 2 - 1.0, c.th + 0.45], [x0 + 10.5, c.W / 2 - 1.0, c.th + 0.45], 0.16, 0.16, 4);   // pioneer tools
  lamp(b, x1 - 1.2, -3.2, c.th + 0.7); lamp(b, x1 - 1.2, 3.2, c.th + 0.7);
  idPanel(b, x0 + 1.3, 0, c.hh, 1.2, 2.4);
}
function lightTurret(b: MeshBuilder, o: TurretOpts): void {
  b.use(MAT.ARMOR).prismZ([[4.4, -1.6], [4.4, 1.6], [1.6, 3.5], [-3.6, 3.5], [-4.8, 2.2], [-4.8, -2.2], [-3.6, -3.5], [1.6, -3.5]], 0.12, 2.45, 0.82, -0.2);
  b.use(MAT.ARMOR2).box(-5.4, 0, 1.3, 1.4, 4.2, 1.2);
  b.use(MAT.ARMOR2).box(4.3, 0, 1.3, 1.0, 1.9, 1.4);
  gun(b, { x: 4.6, z: 1.35, len: 10.6, r: 0.34, brake: 1.1 }, o);
  hatch(b, -1.2, -1.5, 2.45, 0.95); hatch(b, -1.2, 1.5, 2.45, 0.85);
  b.use(MAT.GLASS).box(2.2, -1.9, 2.75, 0.5, 0.7, 0.4);
  for (const s of [-1, 1]) b.use(MAT.GUN).box(2.4, s * 3.6, 1.5, 1.2, 0.4, 0.7);
  antenna(b, -4.0, 2.2, 2.4, 5.4);
  idPanel(b, -3.4, 0, 2.45, 1.3, 2.0);
}

const HEAVY: Chassis = { L: 30, W: 16.6, tw: 3.4, th: 4.0, hh: 6.0, wheels: 7, glacis: 6.6, skirts: true, rear: 0.7 };
/** Explosive reactive armour: rows of raised tiles. */
function era(b: MeshBuilder, x: number, y: number, z: number, nx: number, ny: number, dx: number, dy: number, nrm: 'z' | 'y' = 'z'): void {
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    b.use((i + j) % 2 ? MAT.ARMOR2 : MAT.ARMOR);
    if (nrm === 'z') b.box(x + i * dx, y + j * dy, z + 0.14, dx - 0.22, dy - 0.22, 0.28);
    else b.box(x + i * dx, y, z + j * dy, dx - 0.22, 0.3, dy - 0.2);
  }
}
function heavyHull(b: MeshBuilder): void {
  const c = HEAVY, x0 = -c.L / 2, x1 = c.L / 2;
  tracks(b, c); trackedHull(b, c);
  era(b, x1 - c.glacis - 4.6, -3.9, c.hh, 3, 4, 1.6, 2.6);
  for (const s of [-1, 1]) era(b, -8.4, s * (c.W / 2 + 0.5), c.th * 0.55, 6, 1, 2.9, 1.5, 'y');
  b.use(MAT.ARMOR2).box(x1 - c.glacis - 6.6, 0, c.hh + 0.07, 2.0, 2.4, 0.14);
  grille(b, x0 + 4.0, -3.2, c.hh, 5.4, 4.2); grille(b, x0 + 4.0, 3.2, c.hh, 5.4, 4.2);
  b.use(MAT.DARK).cyl([1.0, 0, c.hh], [1.0, 0, c.hh + 0.14], 6.3, 6.3, 16);
  for (const s of [-1, 1]) { b.use(MAT.STEEL).cyl([x0 + 0.5, s * 5.6, c.hh - 0.6], [x0 - 0.9, s * 5.6, c.hh - 0.4], 0.5, 0.5, 6); b.use(MAT.CANVAS).cyl([x0 + 0.9, s * 3.0, c.hh + 0.5], [x0 + 0.9, s * 0.4, c.hh + 0.5], 0.6, 0.6, 6); }
  b.use(MAT.BURNT2).cyl([x0 + 0.2, -1.6, c.hh + 0.9], [x0 + 0.2, 1.6, c.hh + 0.9], 0.85, 0.85, 8);                    // external fuel drum
  lamp(b, x1 - 1.4, -5.2, c.th + 0.8); lamp(b, x1 - 1.4, 5.2, c.th + 0.8);
  idPanel(b, x0 + 2.6, 0, c.hh, 1.6, 3.2);
}
function heavyTurret(b: MeshBuilder, o: TurretOpts): void {
  b.use(MAT.ARMOR).prismZ([[8.4, -2.6], [8.4, 2.6], [4.6, 6.0], [-5.6, 6.2], [-9.4, 4.8], [-9.4, -4.8], [-5.6, -6.2], [4.6, -6.0]], 0.15, 3.5, 0.88, -0.3);
  era(b, 2.6, -4.2, 3.5, 3, 2, 1.7, 2.2); era(b, 2.6, 2.0, 3.5, 3, 2, 1.7, 2.2);
  b.use(MAT.ARMOR2).box(-10.4, 0, 1.8, 2.2, 8.0, 1.8);
  b.use(MAT.CANVAS).box(-10.4, 0, 3.0, 1.8, 6.6, 0.7);
  b.use(MAT.ARMOR2).box(8.1, 0, 1.75, 1.5, 5.6, 2.0);
  gun(b, { x: 8.6, y: -1.55, z: 1.8, len: 15.2, r: 0.56, evac: 0.44, sleeve: true }, o, 'muzzle');
  gun(b, { x: 8.6, y: 1.55, z: 1.8, len: 15.2, r: 0.56, evac: 0.44, sleeve: true }, o, 'muzzle2');
  b.use(MAT.ARMOR2).cyl([-2.2, -2.8, 3.5], [-2.2, -2.8, 4.3], 1.35, 1.25, 10); b.use(MAT.GLASS).cyl([-2.2, -2.8, 3.8], [-2.2, -2.8, 4.05], 1.4, 1.4, 10, 0);
  mg(b, -1.4, -2.8, 4.3, 3.6);
  hatch(b, -2.0, 2.8, 3.5, 1.2);
  b.use(MAT.ARMOR2).box(4.6, 0, 3.9, 1.6, 1.4, 0.8); b.use(MAT.GLASS).box(5.42, 0, 3.95, 0.1, 1.1, 0.5);
  for (const s of [-1, 1]) { b.use(MAT.GUN).box(5.0, s * 6.2, 2.0, 1.8, 0.5, 0.9); }
  antenna(b, -7.4, -4.0, 3.5, 7.0); antenna(b, -7.4, 4.0, 3.5, 5.6);
  idPanel(b, -6.0, 0, 3.5, 2.0, 3.0);
}

const SIEGE: Chassis = { L: 28, W: 15.2, tw: 3.1, th: 3.8, hh: 5.7, wheels: 6, glacis: 5.0, skirts: true, rear: 0.6 };
function siegeHull(b: MeshBuilder): void {
  const c = SIEGE, x0 = -c.L / 2, x1 = c.L / 2;
  tracks(b, c); trackedHull(b, c);
  b.use(MAT.STEEL).prismY([[x1 + 0.6, 0.5], [x1 + 1.6, 0.4], [x1 + 2.0, 2.2], [x1 + 1.5, 4.0], [x1 + 0.9, 4.0]], -c.W / 2 + 0.3, c.W / 2 - 0.3);    // dozer blade
  for (const s of [-1, 1]) b.use(MAT.ARMOR2).box(x1 + 0.2, s * 3.6, 2.4, 1.6, 0.7, 0.7);
  grille(b, x0 + 3.6, 0, c.hh, 5.0, 8.6);
  b.use(MAT.DARK).cyl([0, 0, c.hh], [0, 0, c.hh + 0.14], 6.0, 6.0, 16);
  for (const s of [-1, 1]) b.use(MAT.ARMOR2).box(x0 + 7.0, s * (c.W / 2 - 1.4), c.th + 0.75, 5.0, 1.9, 1.0);
  b.use(MAT.DARK).box(x0 + 0.22, 0, c.hh - 1.2, 0.2, 4.0, 0.8);
  lamp(b, x1 - 1.2, -4.8, c.th + 0.8); lamp(b, x1 - 1.2, 4.8, c.th + 0.8);
  idPanel(b, x0 + 1.6, 0, c.hh, 1.5, 3.0);
}
function siegeTurret(b: MeshBuilder, o: TurretOpts): void {
  b.use(MAT.ARMOR).prismZ([[5.8, -4.3], [5.8, 4.3], [-6.6, 4.8], [-6.6, -4.8]], 0.15, 4.5, 0.9, -0.35);                // slab-sided casemate turret
  b.use(MAT.ARMOR2).box(5.9, 0, 2.3, 1.5, 4.4, 3.0);
  b.use(MAT.STEEL).cyl([6.2, 0, 2.3], [7.6, 0, 2.3], 1.7, 1.5, 10);                                                  // mantlet collar
  gun(b, { x: 7.0, z: 2.3, len: 9.2, r: 1.02, brake: 1.7 }, o);
  for (const s of [-1, 1]) { b.use(MAT.ARMOR2).box(2.6, s * 5.0, 3.9, 1.2, 1.4, 0.8); b.use(MAT.GLASS).box(3.25, s * 5.0, 3.9, 0.1, 1.0, 0.5); }   // range-finder ears
  b.use(MAT.ARMOR2).ell(-3.0, -2.0, 4.4, 1.3, 1.3, 0.6, 8, 3, 0);                                                    // ventilator dome
  hatch(b, -2.6, 2.2, 4.5, 1.15); hatch(b, 1.2, -2.4, 4.5, 0.9);
  b.use(MAT.STEEL).box(-6.2, 1.8, 5.0, 4.6, 0.4, 0.4); b.use(MAT.GUN).cyl([-8.3, 1.8, 5.0], [-8.3, 1.8, 3.2], 0.08, 0.08, 4, 0);   // ammunition davit
  antenna(b, -5.2, -3.6, 4.5, 6.0);
  idPanel(b, -4.6, -0.4, 4.5, 1.8, 2.6);
}

// ───────────────────────── fire support ─────────────────────────

const ARTY: Chassis = { L: 27, W: 13, tw: 2.6, th: 3.4, hh: 5.2, wheels: 6, glacis: 8.0, skirts: false, rear: 0.4 };
function artyHull(b: MeshBuilder): void {
  const c = ARTY, x0 = -c.L / 2, x1 = c.L / 2;
  tracks(b, c); trackedHull(b, c);
  grille(b, x1 - c.glacis - 3.4, 2.4, c.hh, 4.6, 3.6);                                                                // front-mounted power pack
  b.use(MAT.ARMOR2).box(x1 - c.glacis - 3.0, -2.6, c.hh + 0.07, 2.0, 2.2, 0.14);
  b.use(MAT.STEEL).cyl([x1 - 4.2, 4.6, c.th + 1.0], [x1 - 7.0, 4.6, c.hh + 0.5], 0.4, 0.4, 6);
  b.use(MAT.ARMOR2).box(x1 - 6.4, 0, c.th + 2.0, 0.5, 2.6, 0.4); for (const s of [-1, 1]) b.use(MAT.STEEL).cyl([x1 - 5.0, s * 1.2, c.th + 1.0], [x1 - 6.4, s * 0.9, c.th + 2.1], 0.14, 0.14, 4, 0);   // travel lock
  b.use(MAT.DARK).cyl([-4.5, 0, c.hh], [-4.5, 0, c.hh + 0.14], 5.6, 5.6, 14);
  for (const s of [-1, 1]) b.use(MAT.STEEL).box(x0 - 0.4, s * 4.2, 1.6, 1.0, 2.6, 2.2);                               // recoil spades
  lamp(b, x1 - 1.2, -4.2, c.th + 0.7); lamp(b, x1 - 1.2, 4.2, c.th + 0.7);
  idPanel(b, x1 - c.glacis - 6.8, 0, c.hh, 1.3, 2.6);
}
function artyTurret(b: MeshBuilder, o: TurretOpts): void {
  b.use(MAT.ARMOR).prismZ([[6.2, -4.5], [6.2, 4.5], [-7.4, 4.7], [-7.4, -4.7]], 0.15, 4.7, 0.92, -0.2);
  b.use(MAT.ARMOR2).box(6.2, 0, 2.4, 1.2, 3.6, 3.0);
  gun(b, { x: 6.2, z: 2.6, len: 20.5, r: 0.5, brake: 1.9, evac: 0.52, sleeve: false }, o);
  b.push().move(6.2, 0, 2.6).rotY(-(o.elev ?? 0)); for (const s of [-1, 1]) b.use(MAT.STEEL).cyl([0, s * 0.75, 0.85], [5.4, s * 0.75, 0.85], 0.3, 0.3, 6); b.pop();   // recuperators
  hatch(b, 1.0, -2.6, 4.7, 1.1); mg(b, 1.6, -2.6, 4.9, 3.0); hatch(b, -1.6, 2.6, 4.7, 1.0);
  b.use(MAT.ARMOR2).box(-7.5, 0, 2.2, 0.3, 6.0, 3.2);                                                                 // rear ammunition doors
  b.use(MAT.CANVAS).box(-3.6, 0, 4.95, 5.0, 6.0, 0.5);
  b.use(MAT.ARMOR2).box(3.4, 3.0, 5.0, 1.2, 1.0, 0.7); b.use(MAT.GLASS).box(4.05, 3.0, 5.05, 0.1, 0.8, 0.45);
  antenna(b, -6.4, -3.8, 4.7, 6.4);
  idPanel(b, -1.0, -0.2, 5.2, 1.6, 2.4);
}

const MLRS: Chassis = { L: 26, W: 12.6, tw: 2.5, th: 3.3, hh: 4.9, wheels: 6, glacis: 2.2, skirts: false, rear: 0.4 };
function mlrsHull(b: MeshBuilder): void {
  const c = MLRS, x0 = -c.L / 2, x1 = c.L / 2;
  tracks(b, c); trackedHull(b, c);
  b.use(MAT.ARMOR).prismY([[x1 - 0.4, c.hh - 0.2], [x1 - 0.8, 7.5], [x1 - 6.4, 7.7], [x1 - 6.9, c.hh - 0.2]], -c.W / 2 + 0.3, c.W / 2 - 0.3);   // armoured cab
  for (const s of [-1, 0, 1]) { b.use(MAT.GLASS).box(x1 - 0.52, s * 3.4, 6.6, 0.12, 2.6, 0.9); }                       // louvred windscreen
  for (const s of [-1, 1]) b.use(MAT.GLASS).box(x1 - 3.4, s * (c.W / 2 - 0.26), 6.6, 2.4, 0.12, 0.9);
  hatch(b, x1 - 3.6, 2.4, 7.7, 1.0);
  grille(b, x1 - 8.6, 0, c.hh, 2.4, 8.0);
  b.use(MAT.DARK).cyl([-4.0, 0, c.hh], [-4.0, 0, c.hh + 0.4], 4.6, 4.6, 14);                                          // launcher turntable
  lamp(b, x1 - 0.3, -4.6, c.th + 0.9); lamp(b, x1 - 0.3, 4.6, c.th + 0.9);
  idPanel(b, x1 - 3.6, -1.6, 7.7, 1.6, 2.2);
}
function mlrsTurret(b: MeshBuilder, o: TurretOpts): void {
  b.use(MAT.ARMOR2).box(-1.0, 0, 0.75, 9.0, 6.0, 0.9);                                                               // cradle
  b.push().move(-5.2, 0, 1.3).rotY(-(o.elev ?? 0));
  b.use(MAT.ARMOR).box(5.2, 0, 1.5, 11.4, 8.4, 3.0);                                                                  // launcher module
  b.use(MAT.ARMOR2).box(5.2, 0, 3.05, 11.0, 0.4, 0.2);
  for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) { b.use(MAT.DARK).cyl([10.9, -3.35 + i * 1.34, 0.8 + r * 1.4], [10.96, -3.35 + i * 1.34, 0.8 + r * 1.4], 0.5, 0.5, 8); }
  b.mark('muzzle', 11.3, 0, 1.5);
  idPanel(b, 1.2, 0, 3.25, 1.6, 3.0);
  b.pop();
}

const FLAK: Chassis = { L: 23, W: 12.4, tw: 2.5, th: 3.3, hh: 5.0, wheels: 6, glacis: 5.6, skirts: false, rear: 0.5 };
function flakHull(b: MeshBuilder): void {
  const c = FLAK, x0 = -c.L / 2, x1 = c.L / 2;
  tracks(b, c); trackedHull(b, c);
  b.use(MAT.ARMOR2).box(x1 - c.glacis - 1.5, -2.0, c.hh + 0.07, 1.9, 2.1, 0.14);
  grille(b, x0 + 3.0, 0, c.hh, 4.0, 7.0);
  b.use(MAT.DARK).cyl([0, 0, c.hh], [0, 0, c.hh + 0.14], 4.9, 4.9, 14);
  b.use(MAT.ARMOR2).box(x0 + 6.6, -(c.W / 2 - 1.2), c.th + 0.7, 4.0, 1.6, 0.9);
  lamp(b, x1 - 1.2, -3.8, c.th + 0.7); lamp(b, x1 - 1.2, 3.8, c.th + 0.7);
  idPanel(b, x0 + 1.3, 0, c.hh, 1.2, 2.6);
}
function flakTurret(b: MeshBuilder, o: TurretOpts): void {
  b.use(MAT.ARMOR).prismZ([[4.6, -3.2], [4.6, 3.2], [-4.9, 3.7], [-4.9, -3.7]], 0.15, 3.1, 0.86, -0.2);
  for (const s of [-1, 1]) {                                                                                           // twin cannon on each side: four barrels
    b.use(MAT.ARMOR2).box(0.6, s * 4.3, 1.9, 4.2, 1.2, 1.9);
    gun(b, { x: 1.4, y: s * 4.3, z: 1.45, len: 8.6, r: 0.2, mat: MAT.GUN }, o, s < 0 ? 'muzzle' : 'muzzle2');
    gun(b, { x: 1.4, y: s * 4.3, z: 2.35, len: 8.6, r: 0.2, mat: MAT.GUN }, o, '');
  }
  b.use(MAT.STEEL).cyl([-3.0, 0, 3.1], [-3.0, 0, 5.0], 0.4, 0.4, 6);                                                  // search radar mast
  b.mark('radar', -3.0, 0, 5.3);
  b.use(MAT.ARMOR2).ell(4.2, 0, 2.4, 0.5, 1.25, 1.25, 8, 4);                                                         // tracking radar
  hatch(b, 0.6, -1.6, 3.1, 0.95); hatch(b, 0.6, 1.6, 3.1, 0.95);
  antenna(b, -4.2, 3.0, 3.1, 5.0);
  idPanel(b, -1.2, 0, 3.1, 1.2, 1.8);
}

// 8x8 missile carrier
function samHull(b: MeshBuilder): void {
  const W = 11.6;
  wheels(b, [9.6, 4.6, -4.6, -9.6], W, 2.0, 1.7);
  b.use(MAT.ARMOR2).box(0, 0, 2.6, 25.0, W - 3.8, 1.5);                                                              // frame
  b.use(MAT.ARMOR).prismY([[13.2, 2.6], [13.0, 6.2], [11.4, 8.0], [6.6, 8.1], [6.4, 2.6]], -W / 2 + 0.3, W / 2 - 0.3);   // cab
  b.use(MAT.GLASS).prismY([[12.95, 6.25], [11.5, 7.85], [11.3, 7.75], [12.7, 6.2]], -W / 2 + 0.9, W / 2 - 0.9);
  for (const s of [-1, 1]) b.use(MAT.GLASS).box(9.4, s * (W / 2 - 0.26), 6.9, 2.6, 0.12, 1.2);
  b.use(MAT.ARMOR).box(-3.4, 0, 4.0, 19.0, W - 0.5, 1.5);                                                             // launcher deck
  b.use(MAT.ARMOR2).box(5.0, 0, 6.1, 1.8, W - 1.6, 2.8);                                                              // electronics shelter
  b.use(MAT.STEEL).cyl([5.0, 2.6, 7.5], [5.0, 2.6, 10.2], 0.3, 0.3, 6); b.mark('radar', 5.0, 2.6, 10.5);
  b.use(MAT.DARK).cyl([-4.5, 0, 4.75], [-4.5, 0, 5.05], 4.2, 4.2, 14);
  for (const s of [-1, 1]) { b.use(MAT.STEEL).box(1.0, s * (W / 2 - 0.5), 3.0, 1.2, 0.8, 1.6); b.use(MAT.BURNT2).cyl([-11.0, s * 3.0, 3.6], [-8.4, s * 3.0, 3.6], 0.8, 0.8, 8); }
  lamp(b, 13.25, -3.8, 3.4); lamp(b, 13.25, 3.8, 3.4);
  idPanel(b, 9.0, 0, 8.1, 1.6, 2.6);
}
function samTurret(b: MeshBuilder, o: TurretOpts): void {
  b.use(MAT.ARMOR2).box(-0.5, 0, 0.7, 6.4, 5.2, 1.0);
  b.push().move(-3.2, 0, 1.4).rotY(-(o.elev ?? 0));
  for (const sy of [-1, 1]) for (const sz of [0, 1]) {
    b.use(MAT.ARMOR).box(4.6, sy * 1.45, 0.9 + sz * 1.75, 10.4, 2.5, 1.5);                                            // missile canister
    b.use(MAT.ARMOR2).box(9.85, sy * 1.45, 0.9 + sz * 1.75, 0.16, 2.2, 1.25);                                         // frangible cover
    b.use(MAT.ARMOR2).box(1.6, sy * 1.45, 0.9 + sz * 1.75, 0.4, 2.62, 1.62); b.use(MAT.ARMOR2).box(6.6, sy * 1.45, 0.9 + sz * 1.75, 0.4, 2.62, 1.62);
  }
  b.mark('muzzle', 10.4, 0, 1.8);
  idPanel(b, 3.4, 0, 3.4, 1.6, 2.2);
  b.pop();
}

// ───────────────────────── infantry carriers and patrol vehicles ─────────────────────────

const IFV: Chassis = { L: 23.4, W: 12.2, tw: 2.5, th: 3.3, hh: 5.5, wheels: 6, glacis: 8.2, skirts: true, rear: 0.3 };
function ifvHull(b: MeshBuilder): void {
  const c = IFV, x0 = -c.L / 2, x1 = c.L / 2;
  tracks(b, c); trackedHull(b, c);
  b.use(MAT.ARMOR).box(x0 + 4.4, 0, c.hh + 0.35, 8.0, c.W - 1.6, 0.7);                                                // raised troop compartment roof
  for (const s of [-1, 1]) hatch(b, x0 + 3.4, s * 2.6, c.hh + 0.7, 1.15);
  b.use(MAT.ARMOR2).box(x0 + 0.24, 0, 3.4, 0.24, 5.0, 3.4);                                                           // rear ramp
  b.use(MAT.ARMOR2).box(x1 - c.glacis - 1.3, -2.8, c.hh + 0.07, 1.9, 2.0, 0.14);
  grille(b, x1 - c.glacis + 1.2, 2.6, c.hh - 0.9, 3.0, 3.2);
  b.use(MAT.TRACK).box(x1 - 4.6, -2.0, c.th + 1.5, 0.3, 3.0, 0.9);
  b.use(MAT.DARK).cyl([1.6, 0, c.hh], [1.6, 0, c.hh + 0.14], 3.5, 3.5, 12);
  lamp(b, x1 - 1.2, -3.9, c.th + 0.7); lamp(b, x1 - 1.2, 3.9, c.th + 0.7);
  idPanel(b, x0 + 6.6, 0, c.hh + 0.7, 1.4, 2.4);
}
function ifvTurret(b: MeshBuilder, o: TurretOpts): void {
  b.use(MAT.ARMOR).prismZ([[3.6, -2.2], [3.6, 2.2], [-3.2, 2.9], [-3.2, -2.9]], 0.12, 2.4, 0.84, -0.15);
  b.use(MAT.ARMOR2).box(3.5, 0, 1.3, 0.9, 1.6, 1.3);
  gun(b, { x: 3.8, z: 1.35, len: 9.4, r: 0.24, mat: MAT.GUN, brake: 0.9 }, o);
  b.push().move(3.8, 0, 1.35).rotY(-(o.elev ?? 0)); b.use(MAT.ARMOR2).cyl([0, 0, 0], [3.2, 0, 0], 0.42, 0.38, 8); b.pop();   // barrel shroud
  b.use(MAT.ARMOR2).box(0.4, -3.5, 1.9, 3.4, 1.2, 1.4); b.use(MAT.DARK).box(2.15, -3.5, 1.9, 0.1, 0.9, 1.0);          // anti-tank missile pod
  b.use(MAT.ARMOR2).box(0.6, 1.2, 2.75, 1.3, 1.1, 0.7); b.use(MAT.GLASS).box(1.3, 1.2, 2.8, 0.1, 0.9, 0.45);
  hatch(b, -1.4, -0.9, 2.4, 0.9);
  for (const s of [-1, 1]) b.use(MAT.GUN).box(2.0, s * 2.7, 1.4, 1.1, 0.4, 0.6);
  antenna(b, -2.6, 2.2, 2.4, 4.8);
  idPanel(b, -1.9, 1.0, 2.4, 1.0, 1.5);
}

/** 8x8 armoured hull shared by the APC and the medical variant. */
function apcBody(b: MeshBuilder, medical: boolean): void {
  const W = 11.2;
  wheels(b, [8.6, 3.2, -3.2, -8.6], W, 2.05, 1.75);
  b.use(MAT.ARMOR2).prismY([[-11.4, 1.5], [10.4, 1.5], [12.0, 3.6], [-11.9, 3.6]], -W / 2 + 1.95, W / 2 - 1.95);       // boat hull between the wheels
  b.use(MAT.ARMOR).prismY([[-12.0, 3.5], [12.2, 3.5], [12.0, 4.6], [8.4, 7.1], [-11.4, 7.3], [-12.0, 6.6]], -W / 2 + 0.25, W / 2 - 0.25);
  b.use(MAT.ARMOR2).box(-12.02, 0, 5.3, 0.2, 5.6, 3.0);                                                               // rear ramp
  b.use(MAT.ARMOR2).box(6.9, -2.6, 7.2, 1.9, 2.0, 0.14); b.use(MAT.GLASS).box(8.1, -2.6, 7.2, 0.3, 1.5, 0.3);         // driver
  grille(b, 6.4, 2.6, 7.12, 3.2, 3.0);
  b.use(MAT.STEEL).cyl([3.4, W / 2 - 0.2, 6.0], [-1.6, W / 2 - 0.2, 6.0], 0.42, 0.42, 6);                              // exhaust
  for (const s of [-1, 1]) { for (let i = 0; i < 3; i++) b.use(MAT.CANVAS).box(-3.0 - i * 2.8, s * (W / 2 - 0.05), 5.6, 2.2, 0.5, 1.5); }   // side stowage
  lamp(b, 12.1, -4.0, 4.3); lamp(b, 12.1, 4.0, 4.3);
  if (medical) {
    b.use(MAT.ARMOR).box(-4.6, 0, 7.9, 13.6, W - 1.2, 1.3);                                                           // raised treatment compartment
    b.use(MAT.WHITE).box(-4.6, 0, 8.6, 5.6, 5.6, 0.1); b.use(MAT.RED).box(-4.6, 0, 8.67, 4.2, 1.3, 0.1); b.use(MAT.RED).box(-4.6, 0, 8.67, 1.3, 4.2, 0.1);
    for (const s of [-1, 1]) { b.use(MAT.WHITE).box(-4.6, s * (W / 2 - 0.2), 6.6, 3.6, 0.12, 3.0); b.use(MAT.RED).box(-4.6, s * (W / 2 - 0.13), 6.6, 2.6, 0.12, 0.8); b.use(MAT.RED).box(-4.6, s * (W / 2 - 0.13), 6.6, 0.8, 0.12, 2.4); }
    b.use(MAT.LIGHT).box(3.0, 0, 7.5, 0.7, 2.6, 0.5);                                                                 // light bar
    antenna(b, -10.4, 3.6, 8.5, 5.0);
    idPanel(b, 4.6, 0, 7.2, 1.2, 2.2);
  } else {
    for (const s of [-1, 1]) hatch(b, -6.4, s * 2.6, 7.3, 1.15);
    b.use(MAT.DARK).cyl([1.8, 0, 7.15], [1.8, 0, 7.3], 2.3, 2.3, 10);
    antenna(b, -10.6, -3.8, 7.3, 5.6);
    idPanel(b, -9.4, 0, 7.3, 1.4, 2.6);
  }
}
function apcTurret(b: MeshBuilder, o: TurretOpts): void {
  b.use(MAT.ARMOR2).cyl([0, 0, 0.1], [0, 0, 0.8], 1.5, 1.3, 10);                                                     // remote weapon station pedestal
  b.use(MAT.ARMOR).box(0.2, 0, 1.5, 2.0, 1.5, 1.4);
  b.use(MAT.ARMOR2).box(0.0, -1.4, 1.5, 1.6, 1.2, 1.2);                                                               // ammunition box
  b.use(MAT.ARMOR2).box(0.3, 1.2, 1.9, 1.0, 0.8, 1.0); b.use(MAT.GLASS).box(0.84, 1.2, 1.95, 0.1, 0.6, 0.6);          // sight
  b.push().move(1.0, 0, 1.5).rotY(-(o.elev ?? 0));
  const rc = (o.recoil ?? 0) * 0.5;
  b.use(MAT.GUN).cyl([-rc, 0, 0], [5.9 - rc, 0, 0], 0.42, 0.4, 8);                                                    // rotary cannon barrel cluster
  b.use(MAT.STEEL).cyl([1.8 - rc, 0, 0], [2.3 - rc, 0, 0], 0.5, 0.5, 8, 0); b.use(MAT.STEEL).cyl([4.6 - rc, 0, 0], [5.0 - rc, 0, 0], 0.5, 0.5, 8, 0);
  b.mark('muzzle', 6.2 - rc, 0, 0);
  b.pop();
}

function carHull(b: MeshBuilder): void {
  const W = 10.0;
  wheels(b, [6.0, -6.0], W, 2.15, 1.9);
  b.use(MAT.ARMOR2).box(0, 0, 2.5, 17.0, W - 4.2, 1.4);                                                               // chassis
  b.use(MAT.ARMOR).prismY([[9.3, 2.6], [9.4, 4.6], [4.6, 5.3], [4.6, 2.6]], -W / 2 + 0.6, W / 2 - 0.6);                // bonnet
  grille(b, 9.42, 0, 3.6, 0.1, 3.0); b.use(MAT.DARK).box(9.42, 0, 3.7, 0.12, 3.2, 1.0);
  b.use(MAT.ARMOR).prismY([[4.9, 3.2], [4.7, 5.4], [3.1, 7.5], [-7.6, 7.5], [-8.9, 5.2], [-8.9, 3.2]], -W / 2 + 0.35, W / 2 - 0.35);   // armoured cabin
  b.use(MAT.GLASS).prismY([[4.72, 5.5], [3.2, 7.4], [3.0, 7.3], [4.5, 5.45]], -W / 2 + 1.0, W / 2 - 1.0);              // windscreen
  for (const s of [-1, 1]) { b.use(MAT.GLASS).box(1.2, s * (W / 2 - 0.3), 6.4, 2.4, 0.12, 1.3); b.use(MAT.GLASS).box(-2.4, s * (W / 2 - 0.3), 6.4, 2.2, 0.12, 1.3); b.use(MAT.ARMOR2).box(-6.2, s * (W / 2 - 0.3), 5.6, 2.4, 0.16, 2.6); }
  b.use(MAT.RUBBER).cyl([-9.0, 0, 5.4], [-9.7, 0, 5.4], 1.9, 1.9, 10);                                                // spare wheel
  b.use(MAT.DARK).cyl([-1.6, 0, 7.5], [-1.6, 0, 7.62], 2.3, 2.3, 10);
  b.use(MAT.CANVAS).box(-6.6, 0, 7.75, 2.6, 5.0, 0.5);
  lamp(b, 9.45, -3.4, 4.2); lamp(b, 9.45, 3.4, 4.2);
  antenna(b, -8.0, 3.6, 7.5, 5.4);
  idPanel(b, 6.8, 0, 5.0, 1.4, 2.6);
}
function carTurret(b: MeshBuilder, o: TurretOpts): void {
  b.use(MAT.ARMOR2).cyl([0, 0, 0.1], [0, 0, 0.5], 2.1, 2.0, 10);                                                     // ring
  b.use(MAT.ARMOR).prismY([[1.4, 0.5], [1.9, 2.3], [1.6, 2.3], [1.1, 0.5]], -1.5, 1.5);                                // gun shield
  for (const s of [-1, 1]) b.use(MAT.ARMOR).box(0.2, s * 1.6, 1.3, 2.2, 0.2, 1.6);
  b.push().move(1.2, 0, 1.5).rotY(-(o.elev ?? 0));
  const rc = (o.recoil ?? 0) * 0.4;
  b.use(MAT.GUN).box(0.2 - rc, 0, 0, 1.8, 0.5, 0.6); b.use(MAT.GUN).cyl([1.0 - rc, 0, 0.05], [5.2 - rc, 0, 0.05], 0.18, 0.15, 6);
  b.use(MAT.BRASS).box(0.0 - rc, 0.55, -0.1, 0.9, 0.5, 0.7);
  b.mark('muzzle', 5.5 - rc, 0, 0.05);
  b.pop();
}

function buggyHull(b: MeshBuilder): void {
  const W = 9.6;
  wheels(b, [5.2, -5.2], W, 2.1, 2.0);
  b.use(MAT.ARMOR2).box(0, 0, 2.3, 14.0, W - 4.6, 1.0);                                                               // floor pan
  b.use(MAT.ARMOR).prismY([[7.8, 2.2], [7.6, 3.4], [3.6, 4.2], [3.4, 2.2]], -2.3, 2.3);                                // nose
  b.use(MAT.DARK).box(1.2, -1.2, 3.4, 1.6, 1.5, 1.6); b.use(MAT.DARK).box(1.2, 1.2, 3.4, 1.6, 1.5, 1.6);               // seats
  b.use(MAT.STEEL).box(-5.0, 0, 3.6, 3.4, 3.4, 2.0);                                                                  // rear engine
  for (const s of [-1, 1]) b.use(MAT.STEEL).cyl([-6.4, s * 1.0, 4.4], [-8.2, s * 1.2, 5.0], 0.3, 0.3, 6);              // exhausts
  const tube = (a: Vec3, c: Vec3) => b.use(MAT.GUN).cyl(a, c, 0.2, 0.2, 5);
  for (const s of [-1, 1]) {                                                                                           // roll cage
    tube([3.4, s * 2.4, 2.8], [2.0, s * 2.4, 6.2]); tube([2.0, s * 2.4, 6.2], [-3.4, s * 2.4, 6.2]); tube([-3.4, s * 2.4, 6.2], [-6.6, s * 2.2, 3.4]);
    tube([3.6, s * 2.3, 2.8], [7.4, s * 2.0, 2.8]);
  }
  tube([2.0, -2.4, 6.2], [2.0, 2.4, 6.2]); tube([-3.4, -2.4, 6.2], [-3.4, 2.4, 6.2]);
  b.use(MAT.RUBBER).cyl([-7.4, 0, 3.0], [-8.2, 0, 3.0], 1.8, 1.8, 10);
  for (const s of [-1, 1]) b.use(MAT.CANVAS).box(-1.6, s * 2.9, 3.0, 3.6, 0.9, 1.2);
  lamp(b, 7.7, -1.5, 3.0); lamp(b, 7.7, 1.5, 3.0);
  idPanel(b, 5.6, 0, 3.75, 1.2, 2.0);
}
function buggyTurret(b: MeshBuilder, o: TurretOpts): void {
  b.use(MAT.GUN).cyl([0, 0, 0], [0, 0, 0.9], 0.3, 0.3, 6);
  b.use(MAT.ARMOR).box(0.9, 0, 1.2, 0.22, 2.6, 1.3);                                                                  // small shield
  b.push().move(0.4, 0, 1.2).rotY(-(o.elev ?? 0));
  const rc = (o.recoil ?? 0) * 0.4;
  for (const s of [-1, 1]) { b.use(MAT.GUN).box(0.3 - rc, s * 0.6, 0, 1.6, 0.45, 0.5); b.use(MAT.GUN).cyl([1.0 - rc, s * 0.6, 0], [5.4 - rc, s * 0.6, 0], 0.2, 0.17, 6); }
  b.mark('muzzle', 5.7 - rc, 0, 0);
  b.pop();
}

function truckHull(b: MeshBuilder): void {
  const W = 10.4;
  wheels(b, [9.2, -3.4, -8.6], W, 2.15, 1.9);
  b.use(MAT.ARMOR2).box(-0.4, 0, 2.8, 25.4, W - 4.2, 1.3);                                                            // ladder frame
  b.use(MAT.ARMOR).prismY([[13.3, 2.6], [13.4, 5.4], [12.4, 8.3], [7.6, 8.5], [7.4, 2.6]], -W / 2 + 0.3, W / 2 - 0.3); // cab
  b.use(MAT.GLASS).prismY([[13.38, 5.6], [12.48, 8.1], [12.3, 8.05], [13.15, 5.6]], -W / 2 + 0.8, W / 2 - 0.8);
  for (const s of [-1, 1]) b.use(MAT.GLASS).box(10.2, s * (W / 2 - 0.26), 7.0, 2.8, 0.12, 1.5);
  b.use(MAT.DARK).box(13.42, 0, 3.8, 0.12, 4.4, 1.4);
  b.use(MAT.ARMOR2).box(-3.4, 0, 4.0, 19.6, W - 0.3, 1.0);                                                            // cargo bed
  b.use(MAT.CANVAS).prismY([[-13.0, 4.5], [6.4, 4.5], [6.4, 8.6], [5.4, 9.5], [-12.0, 9.5], [-13.0, 8.6]], -W / 2 + 0.3, W / 2 - 0.3);   // canvas tilt
  for (let i = 0; i < 5; i++) b.use(MAT.ARMOR2).box(-11.4 + i * 4.1, 0, 9.56, 0.3, W - 1.6, 0.1);                      // hoops showing through
  b.use(MAT.RUBBER).cyl([6.9, -1.6, 6.4], [7.3, -1.6, 6.4], 1.9, 1.9, 10);                                            // spare wheel behind the cab
  for (const s of [-1, 1]) b.use(MAT.BURNT2).cyl([3.6, s * (W / 2 - 1.2), 2.9], [0.4, s * (W / 2 - 1.2), 2.9], 0.9, 0.9, 8);   // fuel tanks
  b.use(MAT.STEEL).cyl([7.0, 3.6, 5.0], [7.0, 3.6, 9.6], 0.3, 0.3, 6);                                                // exhaust stack
  lamp(b, 13.45, -3.6, 3.4); lamp(b, 13.45, 3.6, 3.4);
  idPanel(b, 10.2, 0, 8.5, 1.6, 2.6);
}

const ARV: Chassis = { L: 26, W: 13.2, tw: 2.7, th: 3.5, hh: 5.4, wheels: 6, glacis: 4.6, skirts: false, rear: 0.5 };
function arvHull(b: MeshBuilder): void {
  const c = ARV, x0 = -c.L / 2, x1 = c.L / 2;
  tracks(b, c); trackedHull(b, c);
  b.use(MAT.STEEL).prismY([[x1 + 0.5, 0.4], [x1 + 1.5, 0.3], [x1 + 1.9, 2.0], [x1 + 1.4, 3.7], [x1 + 0.8, 3.7]], -c.W / 2 + 0.3, c.W / 2 - 0.3);   // dozer blade
  for (const s of [-1, 1]) b.use(MAT.ARMOR2).box(x1 + 0.1, s * 3.4, 2.3, 1.6, 0.7, 0.7);
  b.use(MAT.ARMOR).prismZ([[8.0, -5.6], [8.0, -0.4], [0.0, -0.4], [0.0, -5.6]], c.hh, c.hh + 2.3, 0.9);                // crew superstructure (left)
  b.use(MAT.GLASS).box(7.9, -3.0, c.hh + 1.6, 0.12, 3.4, 0.6);
  hatch(b, 3.6, -3.0, c.hh + 2.3, 1.1); mg(b, 4.6, -3.0, c.hh + 2.5, 2.8);
  b.use(MAT.STEEL).cyl([-7.6, -3.2, c.hh + 1.2], [-7.6, 3.2, c.hh + 1.2], 1.3, 1.3, 10);                               // main winch drum
  b.use(MAT.GUN).cyl([-7.6, -2.6, c.hh + 1.2], [-7.6, 2.6, c.hh + 1.2], 1.36, 1.36, 10, 0);
  b.use(MAT.WOOD).box(-2.6, -3.6, c.hh + 0.7, 3.4, 2.4, 1.3);                                                          // spares crate
  grille(b, x0 + 2.6, 0, c.hh, 3.0, 7.0);
  b.use(MAT.DARK).cyl([2.6, 3.2, c.hh], [2.6, 3.2, c.hh + 0.3], 2.6, 2.6, 10);                                         // crane turntable
  lamp(b, x1 - 1.2, -4.2, c.th + 0.8); lamp(b, x1 - 1.2, 4.2, c.th + 0.8);
  b.use(MAT.LIGHT).box(1.0, -5.0, c.hh + 2.5, 0.6, 0.6, 0.4);
  idPanel(b, 6.0, -3.0, c.hh + 2.3, 1.4, 2.2);
}
function arvTurret(b: MeshBuilder, o: TurretOpts): void {
  b.use(MAT.ARMOR2).cyl([0, 0, 0.2], [0, 0, 1.6], 2.0, 1.7, 10);
  b.push().move(0, 0, 1.4).rotY(-(o.elev ?? 0.42));
  b.use(MAT.ARMOR).box(6.0, 0, 0.2, 13.0, 1.5, 1.3);                                                                  // boom
  b.use(MAT.ARMOR2).box(11.4, 0, 0.2, 2.6, 1.1, 0.95);                                                                // telescopic section
  b.use(MAT.STEEL).cyl([1.0, 0, -0.9], [5.4, 0, -0.3], 0.34, 0.34, 6);                                                // lift cylinder
  b.mark('hook', 12.6, 0, 0);
  b.pop();
  const e = o.elev ?? 0.42, hx = 12.6 * Math.cos(e), hz = 1.4 + 12.6 * Math.sin(e);
  b.use(MAT.GUN).cyl([hx, 0, hz], [hx, 0, hz - 3.4], 0.09, 0.09, 4, 0);                                               // hoist cable
  b.use(MAT.STEEL).box(hx, 0, hz - 3.7, 0.7, 0.5, 0.7);                                                               // hook block
  b.use(MAT.TEAM).box(3.0, 0, 1.4 + 3.0 * Math.sin(e) + 0.75 + 0.2, 1.6, 1.2, 0.1);
}

const UGV: Chassis = { L: 14.6, W: 9.2, tw: 2.2, th: 2.8, hh: 3.7, wheels: 4, glacis: 3.6, skirts: false, rear: 0.4 };
function ugvHull(b: MeshBuilder): void {
  const c = UGV, x0 = -c.L / 2;
  tracks(b, c); trackedHull(b, c);
  grille(b, x0 + 2.2, 0, c.hh, 2.6, 3.6);
  b.use(MAT.DARK).cyl([0.6, 0, c.hh], [0.6, 0, c.hh + 0.12], 1.9, 1.9, 10);
  b.use(MAT.GUN).cyl([-3.6, 1.6, c.hh], [-3.6, 1.6, c.hh + 3.2], 0.16, 0.16, 5);                                       // sensor mast
  b.use(MAT.ARMOR2).box(-3.6, 1.6, c.hh + 3.5, 0.9, 0.9, 0.7); b.use(MAT.GLASS).box(-3.12, 1.6, c.hh + 3.5, 0.1, 0.7, 0.5);
  b.use(MAT.GLASS).box(c.L / 2 - c.glacis + 0.4, 0, c.hh - 0.1, 0.5, 2.6, 0.4);                                        // driving cameras
  antenna(b, -5.6, -1.8, c.hh, 4.6); antenna(b, -5.6, 0.2, c.hh, 3.4);
  idPanel(b, x0 + 4.6, -0.6, c.hh, 1.2, 1.8);
}
function ugvTurret(b: MeshBuilder, o: TurretOpts): void {
  b.use(MAT.ARMOR2).cyl([0, 0, 0.1], [0, 0, 0.7], 1.3, 1.1, 8);
  b.use(MAT.ARMOR).box(0.1, 0, 1.4, 2.2, 1.6, 1.4);
  b.use(MAT.ARMOR2).box(-0.1, 1.3, 1.4, 1.5, 1.0, 1.1);
  b.use(MAT.GLASS).box(1.24, -0.4, 1.7, 0.1, 0.6, 0.5);
  gun(b, { x: 1.0, y: 0.2, z: 1.35, len: 6.0, r: 0.2, mat: MAT.GUN, brake: 0.7 }, o);
}

// ───────────────────────── registry ─────────────────────────

export const VEHICLES: Record<string, VehicleDef> = {
  main_battle_tank: { hull: mbtHull, turret: { pivot: [1.5, 0, MBT.hh], build: mbtTurret }, tracked: true },
  light_tank: { hull: lightHull, turret: { pivot: [0.8, 0, LIGHT.hh], build: lightTurret }, tracked: true },
  heavy_tank: { hull: heavyHull, turret: { pivot: [1.0, 0, HEAVY.hh], build: heavyTurret }, tracked: true },
  siege_tank: { hull: siegeHull, turret: { pivot: [0, 0, SIEGE.hh], build: siegeTurret }, tracked: true },
  artillery: { hull: artyHull, turret: { pivot: [-4.5, 0, ARTY.hh], build: artyTurret, elevIdle: 0.07, elevFire: 0.72 }, tracked: true },
  mlrs: { hull: mlrsHull, turret: { pivot: [-4.0, 0, MLRS.hh + 0.3], build: mlrsTurret, elevIdle: 0, elevFire: 0.5 }, tracked: true },
  aa_vehicle: { hull: flakHull, turret: { pivot: [0, 0, FLAK.hh], build: flakTurret, elevIdle: 0.18, elevFire: 0.7 }, tracked: true },
  mobile_sam: { hull: samHull, turret: { pivot: [-4.5, 0, 5.0], build: samTurret, elevIdle: 0.12, elevFire: 0.85 }, tracked: false },
  ifv: { hull: ifvHull, turret: { pivot: [1.6, 0, IFV.hh], build: ifvTurret }, tracked: true },
  apc: { hull: b => apcBody(b, false), turret: { pivot: [1.8, 0, 7.25], build: apcTurret }, tracked: false },
  medical_apc: { hull: b => apcBody(b, true), tracked: false },
  armored_car: { hull: carHull, turret: { pivot: [-1.6, 0, 7.55], build: carTurret }, tracked: false },
  recon_buggy: { hull: buggyHull, turret: { pivot: [-0.8, 0, 6.3], build: buggyTurret }, tracked: false },
  logistics_truck: { hull: truckHull, tracked: false },
  recovery_vehicle: { hull: arvHull, turret: { pivot: [2.6, 3.2, ARV.hh + 0.2], build: arvTurret, elevIdle: 0.42, elevFire: 0.42 }, tracked: true },
  ugv_robot_tank: { hull: ugvHull, turret: { pivot: [0.6, 0, UGV.hh], build: ugvTurret }, tracked: true },
};
