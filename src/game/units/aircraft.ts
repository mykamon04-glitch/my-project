/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MeshBuilder, Vec3 } from './raster';
import { MAT } from './palette';

/**
 * Aircraft models (V11): three helicopters, three fixed-wing aircraft and three unmanned types, each with its own airframe.
 * Frame: origin under the centre of the airframe at belly level, +x forward, +y right, +z up (world px).
 * Rotors and propellers are not baked into the sprite: their hubs are recorded as marks and the renderer draws the
 * spinning discs live, so they keep turning smoothly at any frame rate.
 */

export interface RotorDef { mark: string; r: number; blades: number; rate: number; plane: 'flat' | 'side' | 'front' }
export interface AircraftDef { body: (b: MeshBuilder) => void; rotors: RotorDef[]; banks: boolean; hover: boolean }

/** Fuselage: loft through cross-sections [x, half width, z bottom, z top]. Each section is an octagon. */
function fuselage(b: MeshBuilder, sections: number[][], mat: number): void {
  const ring = (s: number[]): Vec3[] => {
    const zc = (s[2] + s[3]) / 2, hz = (s[3] - s[2]) / 2, out: Vec3[] = [];
    for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4 + Math.PI / 8; out.push([s[0], Math.cos(a) * s[1] * 1.08, zc + Math.sin(a) * hz * 1.08]); }
    return out;
  };
  b.use(mat);
  for (let i = 0; i < sections.length - 1; i++) b.loft(ring(sections[i]), ring(sections[i + 1]));
}
/** A pair of mirrored flat surfaces (wings, tailplanes) from the right-hand plan outline. */
function wings(b: MeshBuilder, right: number[][], z0: number, z1: number, mat: number): void {
  b.use(mat).prismZ(right, z0, z1);
  b.use(mat).prismZ(right.map(p => [p[0], -p[1]]), z0, z1);
}
const wheel = (b: MeshBuilder, x: number, y: number, r = 0.55) => { b.use(MAT.GUN).cyl([x, y * 0.82, r + 0.9], [x, y, r], 0.12, 0.12, 4, 0); b.use(MAT.RUBBER).cyl([x, y - 0.22, r], [x, y + 0.22, r], r, r, 8); };

// ───────────────────────── helicopters ─────────────────────────

function gunship(b: MeshBuilder): void {
  fuselage(b, [[10.0, 0.5, 1.2, 2.2], [8.6, 1.1, 0.8, 2.9], [6.6, 1.3, 0.7, 3.4], [2.0, 1.45, 0.6, 3.6], [-2.0, 1.5, 0.8, 3.8], [-5.0, 1.1, 1.6, 3.6], [-13.8, 0.45, 2.9, 3.7]], MAT.AIR);
  b.use(MAT.GLASS).prismY([[8.5, 2.9], [6.5, 4.35], [2.4, 4.95], [1.6, 3.5]], -1.15, 1.15);                              // tandem canopy
  b.use(MAT.AIR2).box(5.0, 0, 4.2, 0.34, 2.36, 1.5);                                                                   // canopy frame between the seats
  for (const s of [-1, 1]) {
    b.use(MAT.AIR2).cyl([1.4, s * 2.1, 3.5], [-4.4, s * 2.1, 3.7], 0.95, 0.85, 8);                                     // engine nacelle
    b.use(MAT.DARK).cyl([1.4, s * 2.1, 3.5], [1.5, s * 2.1, 3.5], 0.7, 0.7, 8); b.use(MAT.DARK).cyl([-4.4, s * 2.3, 3.7], [-5.2, s * 2.7, 3.8], 0.6, 0.55, 6);
    b.use(MAT.AIR2).cyl([2.2, s * 4.6, 1.6], [-1.6, s * 4.6, 1.6], 0.72, 0.72, 8); b.use(MAT.DARK).cyl([2.2, s * 4.6, 1.6], [2.3, s * 4.6, 1.6], 0.6, 0.6, 8);   // rocket pod
    b.use(MAT.GUN).box(0.4, s * 2.9, 1.5, 3.0, 1.0, 0.7);                                                              // missile rack
    wheel(b, 4.2, s * 2.5);
  }
  wings(b, [[1.6, 0.6], [1.6, 5.3], [-1.0, 5.3], [-1.0, 0.6]], 2.2, 2.6, MAT.AIR);                                     // stub wings
  b.use(MAT.AIR).box(-0.6, 0, 4.4, 5.0, 2.0, 1.2);                                                                     // rotor fairing
  b.use(MAT.GUN).cyl([0, 0, 5.0], [0, 0, 6.3], 0.4, 0.4, 6); b.use(MAT.GUN).cyl([0, 0, 6.2], [0, 0, 6.5], 0.95, 0.95, 8);
  b.mark('rotor', 0, 0, 6.55);
  b.use(MAT.DARK).ell(9.9, 0, 1.3, 0.9, 0.9, 0.8, 8, 4);                                                               // sensor turret
  b.use(MAT.DARK).box(7.0, 0, 0.5, 1.4, 0.9, 0.7); b.use(MAT.GUN).cyl([7.4, 0, 0.3], [10.4, 0, 0.1], 0.16, 0.14, 5);   // chin gun
  b.mark('muzzle', 10.6, 0, 0.1);
  b.use(MAT.AIR).prismY([[-12.2, 3.4], [-13.9, 3.4], [-15.4, 7.6], [-14.2, 7.6]], -0.23, 0.23);                         // fin
  b.use(MAT.AIR2).box(-13.4, 0, 3.3, 1.7, 5.4, 0.22);                                                                  // stabilator
  b.mark('tailrotor', -14.8, 0.5, 6.2);
  b.use(MAT.RUBBER).cyl([-12.4, -0.2, 2.2], [-12.4, 0.2, 2.2], 0.4, 0.4, 6);
  b.use(MAT.TEAM).cyl([-8.8, 0, 3.22], [-9.9, 0, 3.26], 0.9, 0.84, 8, 0);                                              // identification band
}

function utilityHeli(b: MeshBuilder): void {
  fuselage(b, [[10.4, 0.6, 1.4, 2.6], [8.6, 1.5, 0.9, 3.6], [6.2, 2.1, 0.7, 4.6], [-3.0, 2.2, 0.7, 4.8], [-6.0, 1.3, 1.8, 4.4], [-15.2, 0.45, 3.4, 4.2]], MAT.AIR);
  b.use(MAT.GLASS).prismY([[9.0, 2.6], [6.5, 4.55], [6.2, 4.4], [8.6, 2.5]], -1.8, 1.8);                                // windscreen
  for (const s of [-1, 1]) {
    b.use(MAT.GLASS).box(7.3, s * 2.05, 3.6, 1.6, 0.14, 1.0);
    b.use(MAT.AIR2).box(1.4, s * 2.42, 2.7, 5.2, 0.14, 2.7);                                                            // sliding cabin door
    b.use(MAT.GLASS).box(2.8, s * 2.5, 3.4, 1.3, 0.12, 0.9); b.use(MAT.GLASS).box(0.2, s * 2.5, 3.4, 1.3, 0.12, 0.9);
    b.use(MAT.GUN).cyl([4.8, s * 2.4, 2.9], [6.6, s * 3.7, 2.7], 0.16, 0.14, 5);                                        // door gun
    b.use(MAT.AIR2).cyl([1.0, s * 1.3, 5.2], [-4.6, s * 1.3, 5.2], 1.0, 0.95, 8);                                       // engines
    b.use(MAT.DARK).cyl([1.0, s * 1.3, 5.2], [1.1, s * 1.3, 5.2], 0.75, 0.75, 8); b.use(MAT.DARK).cyl([-4.6, s * 1.3, 5.2], [-5.4, s * 1.7, 5.3], 0.7, 0.6, 6);
    wheel(b, 5.0, s * 2.7, 0.6);
  }
  b.mark('muzzle', 6.8, 3.8, 2.7);
  b.use(MAT.AIR).box(-1.6, 0, 5.6, 4.0, 1.8, 0.8);
  b.use(MAT.GUN).cyl([0, 0, 5.6], [0, 0, 6.9], 0.42, 0.42, 6); b.use(MAT.GUN).cyl([0, 0, 6.8], [0, 0, 7.1], 1.0, 1.0, 8);
  b.mark('rotor', 0, 0, 7.15);
  b.use(MAT.AIR).prismY([[-13.4, 3.8], [-15.2, 3.8], [-16.8, 8.6], [-15.5, 8.6]], -0.25, 0.25);
  b.use(MAT.AIR2).box(-14.6, 0, 4.0, 2.2, 7.0, 0.25);
  b.mark('tailrotor', -16.4, 0.55, 7.4);
  b.use(MAT.RUBBER).cyl([-10.6, -0.22, 2.0], [-10.6, 0.22, 2.0], 0.45, 0.45, 6);
  b.use(MAT.TEAM).cyl([-9.4, 0, 3.4], [-10.6, 0, 3.5], 0.95, 0.88, 8, 0);
}

function heavyLift(b: MeshBuilder): void {
  fuselage(b, [[15.6, 1.2, 1.6, 4.2], [13.6, 2.4, 0.9, 5.6], [10.0, 2.9, 0.6, 6.4], [-10.0, 2.9, 0.6, 6.4], [-14.0, 2.6, 2.0, 6.6], [-16.2, 1.6, 3.6, 6.4]], MAT.AIR);
  b.use(MAT.GLASS).prismY([[15.0, 3.0], [13.1, 5.55], [12.8, 5.4], [14.6, 2.9]], -2.1, 2.1);
  for (const s of [-1, 1]) {
    b.use(MAT.GLASS).box(13.0, s * 2.62, 4.2, 1.5, 0.14, 1.2);
    b.use(MAT.AIR2).box(0, s * 3.25, 1.9, 17.0, 1.2, 2.2);                                                             // fuel sponson
    for (let i = 0; i < 5; i++) b.use(MAT.GLASS).ell(7.0 - i * 3.4, s * 3.16, 4.6, 0.5, 0.1, 0.5, 6, 3);                // cabin windows
    b.use(MAT.AIR2).cyl([-9.0, s * 3.5, 6.0], [-13.4, s * 3.5, 6.0], 1.0, 0.95, 8);                                    // engines
    b.use(MAT.DARK).cyl([-9.0, s * 3.5, 6.0], [-8.9, s * 3.5, 6.0], 0.75, 0.75, 8); b.use(MAT.DARK).cyl([-13.4, s * 3.5, 6.0], [-13.5, s * 3.5, 6.0], 0.7, 0.7, 8);
    wheel(b, 8.0, s * 3.3, 0.62); wheel(b, -8.0, s * 3.3, 0.62);
  }
  b.use(MAT.GUN).cyl([6.4, 3.0, 3.4], [8.0, 4.6, 3.2], 0.16, 0.14, 5);
  b.mark('muzzle', 8.2, 4.7, 3.2);
  b.use(MAT.AIR).box(10.0, 0, 7.2, 4.6, 2.2, 1.7);                                                                    // forward pylon
  b.use(MAT.AIR).prismY([[-8.4, 6.4], [-9.6, 9.4], [-13.4, 9.4], [-14.6, 6.4]], -1.2, 1.2);                             // aft pylon
  b.use(MAT.GUN).cyl([10.0, 0, 8.0], [10.0, 0, 8.3], 0.95, 0.95, 8); b.use(MAT.GUN).cyl([-11.4, 0, 9.4], [-11.4, 0, 9.7], 0.95, 0.95, 8);
  b.mark('rotor', 10.0, 0, 8.35); b.mark('rotor2', -11.4, 0, 9.75);
  b.use(MAT.AIR2).box(-16.1, 0, 4.4, 0.2, 2.6, 2.6);                                                                   // rear ramp
  b.use(MAT.TEAM).box(0, 0, 6.5, 2.2, 4.6, 0.12);
}

// ───────────────────────── fixed wing ─────────────────────────

function stealthFighter(b: MeshBuilder): void {
  fuselage(b, [[12.5, 0.2, 1.45, 1.85], [9.5, 0.9, 1.0, 2.5], [6.0, 1.6, 0.8, 3.2], [1.0, 2.6, 0.7, 3.2], [-6.0, 2.8, 0.8, 3.0], [-11.0, 2.4, 1.1, 2.6]], MAT.AIR);
  b.use(MAT.GLASS).ell(6.4, 0, 3.15, 2.7, 0.95, 0.85, 10, 4, -0.2);
  wings(b, [[3.0, 2.2], [-4.0, 8.6], [-7.6, 8.6], [-8.6, 2.2]], 1.9, 2.2, MAT.AIR);
  wings(b, [[-7.8, 2.4], [-10.6, 5.6], [-12.8, 5.6], [-12.4, 2.4]], 1.8, 2.0, MAT.AIR2);
  for (const s of [-1, 1]) {
    b.push().move(-8.4, s * 2.2, 2.7).rotX(-s * 0.45);
    b.use(MAT.AIR).prismY([[1.8, 0], [-2.8, 0], [-3.8, 3.7], [-1.6, 3.7]], -0.15, 0.15);                                // canted fin
    b.use(MAT.TEAM).prismY([[-1.75, 3.05], [-3.62, 3.05], [-3.8, 3.72], [-1.6, 3.72]], -0.18, 0.18);
    b.pop();
    b.use(MAT.DARK).box(3.3, s * 2.3, 1.7, 0.3, 1.3, 1.2);                                                             // intake
    b.use(MAT.DARK).cyl([-11.0, s * 1.2, 1.9], [-12.3, s * 1.2, 1.9], 0.9, 0.8, 8);                                    // nozzle
    b.use(MAT.AIR2).box(-4.6, s * 5.6, 2.22, 1.3, 1.3, 0.06);
  }
  b.mark('exhaust', -12.5, 0, 1.9); b.mark('muzzle', 2.0, 0, 0.8);
}

function lightFighter(b: MeshBuilder): void {
  fuselage(b, [[11.5, 0.2, 1.5, 1.9], [8.5, 0.8, 1.1, 2.6], [5.0, 1.3, 0.8, 3.3], [0, 1.5, 0.6, 3.2], [-6.0, 1.4, 0.9, 3.0], [-10.5, 1.1, 1.2, 2.8]], MAT.AIR);
  b.use(MAT.GLASS).ell(5.6, 0, 3.25, 2.5, 0.9, 0.95, 10, 4, -0.2);                                                     // bubble canopy
  b.use(MAT.AIR2).box(1.5, 0, 0.6, 6.0, 1.7, 0.8); b.use(MAT.DARK).box(4.55, 0, 0.6, 0.2, 1.5, 0.7);                    // ventral intake
  wings(b, [[4.5, 1.3], [-2.2, 7.4], [-4.8, 7.4], [-5.6, 1.3]], 1.9, 2.15, MAT.AIR);
  wings(b, [[-7.6, 1.3], [-9.8, 4.6], [-11.6, 4.6], [-11.0, 1.3]], 1.9, 2.1, MAT.AIR2);
  b.use(MAT.AIR).prismY([[-4.6, 3.0], [-9.4, 3.0], [-11.4, 7.8], [-9.6, 7.8]], -0.18, 0.18);                            // single fin
  b.use(MAT.TEAM).prismY([[-9.3, 7.0], [-11.05, 7.0], [-11.4, 7.82], [-9.6, 7.82]], -0.21, 0.21);
  for (const s of [-1, 1]) { b.use(MAT.WHITE).cyl([0.2, s * 7.5, 2.0], [-4.6, s * 7.5, 2.0], 0.24, 0.24, 6); b.use(MAT.DARK).cyl([0.2, s * 7.5, 2.0], [0.9, s * 7.5, 2.0], 0.24, 0.05, 6); b.use(MAT.AIR2).box(-2.6, s * 4.6, 2.17, 1.2, 1.2, 0.06); }
  b.use(MAT.DARK).cyl([-10.5, 0, 2.0], [-12.0, 0, 2.0], 0.98, 0.85, 8);
  b.mark('exhaust', -12.2, 0, 2.0); b.mark('muzzle', 6.0, 1.2, 1.6);
}

function flyingWing(b: MeshBuilder): void {
  fuselage(b, [[8.0, 0.4, 1.3, 1.8], [5.0, 2.4, 0.9, 3.0], [0, 3.2, 0.8, 3.2], [-5.0, 2.6, 1.0, 2.6], [-8.0, 1.6, 1.3, 2.0]], MAT.AIR2);
  wings(b, [[7.5, 0.5], [0.6, 10.0], [-7.2, 10.0], [-3.8, 5.0]], 1.55, 2.15, MAT.AIR2);                                 // inner panels
  wings(b, [[7.5, 0.5], [-3.8, 5.0], [-7.6, 0.5]], 1.55, 2.15, MAT.AIR2);
  wings(b, [[0.6, 10.0], [-7.4, 21.0], [-10.4, 21.0], [-7.2, 10.0]], 1.65, 2.0, MAT.AIR2);                              // outer panels
  b.use(MAT.GLASS).ell(4.6, 0, 2.95, 1.7, 1.5, 0.5, 10, 3, 0);
  for (const s of [-1, 1]) {
    b.use(MAT.DARK).box(1.4, s * 3.6, 2.6, 2.2, 1.7, 0.9);                                                             // buried intakes
    b.use(MAT.DARK).box(-5.4, s * 3.4, 2.2, 2.0, 1.8, 0.12);                                                           // exhaust troughs
    b.use(MAT.TEAM).box(-7.6, s * 18.0, 2.03, 1.6, 1.6, 0.06);
  }
  b.mark('exhaust', -6.6, 0, 2.2); b.mark('muzzle', 0, 0, 0.8);
}

// ───────────────────────── unmanned ─────────────────────────

function multicopter(b: MeshBuilder, arms: number, reach: number, armed: boolean): void {
  const hex: number[][] = [];
  for (let k = 0; k < 6; k++) hex.push([Math.cos((k * Math.PI) / 3) * (armed ? 2.5 : 1.9), Math.sin((k * Math.PI) / 3) * (armed ? 2.2 : 1.6)]);
  b.use(MAT.AIR2).prismZ(hex, 1.3, armed ? 2.7 : 2.4, 0.82);                                                           // body
  b.use(MAT.DARK).box(0, 0, (armed ? 2.7 : 2.4) + 0.08, 1.6, 1.2, 0.16);                                               // battery hatch
  for (let k = 0; k < arms; k++) {
    const a = ((k + 0.5) * Math.PI * 2) / arms, x = Math.cos(a) * reach, y = Math.sin(a) * reach;
    b.use(MAT.GUN).cyl([Math.cos(a) * 1.2, Math.sin(a) * 1.2, 1.9], [x, y, 2.0], 0.24, 0.2, 5);                         // arm
    b.use(MAT.DARK).cyl([x, y, 1.6], [x, y, 2.6], 0.5, 0.45, 6);                                                        // motor
    b.mark('r' + k, x, y, 2.7);
  }
  b.use(MAT.DARK).ell(armed ? 2.4 : 1.8, 0, 1.0, 0.75, 0.75, 0.7, 8, 4); b.use(MAT.GLASS).ell(armed ? 2.95 : 2.35, 0, 1.0, 0.3, 0.42, 0.42, 6, 3);   // sensor ball
  for (const s of [-1, 1]) {
    b.use(MAT.GUN).cyl([1.2, s * 1.4, 1.3], [1.6, s * 1.9, 0.1], 0.12, 0.12, 4, 0); b.use(MAT.GUN).cyl([-1.2, s * 1.4, 1.3], [-1.6, s * 1.9, 0.1], 0.12, 0.12, 4, 0);
    b.use(MAT.GUN).cyl([2.0, s * 1.9, 0.1], [-2.0, s * 1.9, 0.1], 0.12, 0.12, 4);                                       // skids
    if (armed) { b.use(MAT.AIR).box(0.3, s * 2.5, 0.9, 3.2, 1.0, 0.8); for (const dz of [-0.2, 0.2]) b.use(MAT.DARK).cyl([1.9, s * 2.5 + dz, 0.9], [1.95, s * 2.5 + dz, 0.9], 0.2, 0.2, 6); }
  }
  b.use(MAT.GUN).cyl([-1.2, 0, 2.4], [-1.5, 0, 4.6], 0.08, 0.06, 4, 0);
  b.use(MAT.TEAM).box(-0.9, 0, (armed ? 2.7 : 2.4) + 0.1, 0.8, 1.6, 0.1);
  b.mark('muzzle', armed ? 2.2 : 2.4, 0, 0.9);
}

function strikeDrone(b: MeshBuilder): void {
  fuselage(b, [[8.2, 0.5, 1.2, 2.0], [6.4, 1.05, 0.9, 2.9], [3.0, 0.8, 0.9, 2.3], [-5.0, 0.75, 1.0, 2.2], [-7.6, 0.5, 1.2, 2.0]], MAT.AIR);
  wings(b, [[1.6, 0.6], [0.4, 14.0], [-0.9, 14.0], [-1.6, 0.6]], 1.7, 1.95, MAT.AIR);                                   // long straight wing
  for (const s of [-1, 1]) {
    b.push().move(-6.6, s * 0.5, 1.9).rotX(-s * 0.9);
    b.use(MAT.AIR).prismY([[1.2, 0], [-1.2, 0], [-1.9, 3.5], [-0.6, 3.5]], -0.13, 0.13);                                // V-tail
    b.pop();
    b.use(MAT.WHITE).cyl([1.0, s * 4.6, 1.3], [-1.8, s * 4.6, 1.3], 0.24, 0.24, 6); b.use(MAT.DARK).cyl([1.0, s * 4.6, 1.3], [1.6, s * 4.6, 1.3], 0.24, 0.05, 6);
    b.use(MAT.GUN).box(-0.2, s * 4.6, 1.6, 1.2, 0.3, 0.3);
    b.use(MAT.TEAM).box(-0.2, s * 11.0, 1.97, 1.2, 1.4, 0.06);
  }
  b.use(MAT.AIR).prismY([[-5.4, 1.0], [-7.2, 1.0], [-7.6, -0.4], [-6.4, -0.4]], -0.12, 0.12);                           // ventral fin
  b.use(MAT.DARK).ell(5.6, 0, 0.7, 0.8, 0.8, 0.7, 8, 4);                                                               // sensor ball
  b.use(MAT.DARK).cyl([-7.6, 0, 1.6], [-8.2, 0, 1.6], 0.35, 0.3, 6);
  b.mark('prop', -8.3, 0, 1.6); b.mark('muzzle', 1.8, 4.6, 1.3);
}

export const AIRCRAFT: Record<string, AircraftDef> = {
  attack_helicopter: { body: gunship, rotors: [{ mark: 'rotor', r: 13.5, blades: 4, rate: 26, plane: 'flat' }, { mark: 'tailrotor', r: 2.5, blades: 4, rate: 60, plane: 'side' }], banks: false, hover: true },
  hawk_helicopter: { body: utilityHeli, rotors: [{ mark: 'rotor', r: 14.5, blades: 4, rate: 24, plane: 'flat' }, { mark: 'tailrotor', r: 2.7, blades: 4, rate: 58, plane: 'side' }], banks: false, hover: true },
  titan_transport: { body: heavyLift, rotors: [{ mark: 'rotor', r: 12.5, blades: 3, rate: 21, plane: 'flat' }, { mark: 'rotor2', r: 12.5, blades: 3, rate: -21, plane: 'flat' }], banks: false, hover: true },
  stealth_fighter: { body: stealthFighter, rotors: [], banks: true, hover: false },
  viper_fighter: { body: lightFighter, rotors: [], banks: true, hover: false },
  raven_bomber: { body: flyingWing, rotors: [], banks: true, hover: false },
  recon_drone: { body: b => multicopter(b, 4, 4.8, false), rotors: [0, 1, 2, 3].map(k => ({ mark: 'r' + k, r: 2.7, blades: 2, rate: k % 2 ? 70 : -70, plane: 'flat' as const })), banks: false, hover: true },
  combat_drone: { body: b => multicopter(b, 6, 6.0, true), rotors: [0, 1, 2, 3, 4, 5].map(k => ({ mark: 'r' + k, r: 2.6, blades: 2, rate: k % 2 ? 66 : -66, plane: 'flat' as const })), banks: false, hover: true },
  ucav_drone: { body: strikeDrone, rotors: [{ mark: 'prop', r: 1.7, blades: 3, rate: 80, plane: 'front' }], banks: true, hover: false },
};
