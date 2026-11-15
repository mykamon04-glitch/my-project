/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MeshBuilder, Vec3 } from './raster';
import { MAT } from './palette';

/**
 * Articulated infantry model (V11).
 *
 * A soldier is a small skeleton (pelvis, torso, head, two-bone arms solved with IK onto the weapon, two-bone legs driven
 * by hip / knee angles) dressed with equipment. Every infantry class uses the same skeleton with its own headgear, armour,
 * pack, weapon and firing stance, which is what gives each class a distinct silhouette. Poses are procedural key frames
 * (idle, walk, run, aim, fire, reload, hit, work, die) so a class needs no hand-authored animation data.
 *
 * Units: world px. Model frame: +x forward, +y the soldier's right, +z up; origin on the ground between the feet.
 */

export type Clip = 'idle' | 'walk' | 'run' | 'advance' | 'aim' | 'fire' | 'reload' | 'hit' | 'work' | 'die';
export const CLIP_FRAMES: Record<Clip, number> = { idle: 2, walk: 8, run: 8, advance: 8, aim: 1, fire: 2, reload: 2, hit: 1, work: 2, die: 4 };

export type Weapon = 'rifle' | 'lmg' | 'sniper' | 'smg' | 'carbine_s' | 'rpg' | 'mgl' | 'flamer' | 'pistol' | 'none';
export interface SoldierSpec {
  headgear: 'helmet' | 'helmet_nvg' | 'boonie' | 'beret' | 'ghillie' | 'hood' | 'helmet_visor' | 'helmet_medic';
  armor: 0 | 1 | 2;                         // chest rig / plate carrier / heavy armour with shoulder plates
  pack: 'none' | 'assault' | 'medic' | 'radio' | 'ammo' | 'tanks' | 'tools' | 'rockets';
  weapon: Weapon;
  uniform?: number;                         // MAT.* for fabric (default camouflage)
  kit?: number;                             // MAT.* for the vest
  stance: 'stand' | 'kneel' | 'hip' | 'shoulder';
  scale?: number;
  extras?: Array<'kneepads' | 'bandolier' | 'armband' | 'medband' | 'satchel' | 'headset' | 'antenna' | 'veil'>;
  tool?: 'torch' | 'medkit';                // what the hand holds while working
}

const TH = 2.55, SHN = 2.55, HIP = 0.72, FOOT = 0.45;

interface Pose {
  hz: number | null; hipL: number; kneeL: number; hipR: number; kneeR: number; spread: number; px: number;
  lean: number; twist: number; headPitch: number; headYaw: number;
  wG: Vec3 | null; wYaw: number; wPitch: number; wRoll: number;
  handL: Vec3 | null; handR: Vec3 | null;
  bodyPitch: number; bodyLift: number; kneel: boolean; lift: number;
}

const base = (): Pose => ({
  hz: null, hipL: 0.04, kneeL: 0.06, hipR: -0.04, kneeR: 0.06, spread: 0.12, px: 0,
  lean: 0.03, twist: 0, headPitch: 0, headYaw: 0,
  wG: null, wYaw: 0, wPitch: 0, wRoll: 0, handL: null, handR: null,
  bodyPitch: 0, bodyLift: 0, kneel: false, lift: 0,
});

/** How each weapon is carried when not aiming: grip position, yaw (towards the left), pitch (muzzle up). */
function carry(w: Weapon, run: boolean): { g: Vec3; yaw: number; pitch: number } {
  switch (w) {
    case 'rpg': return { g: [0.25, 1.15, 7.7], yaw: 0, pitch: 0.95 };                       // tube resting on the shoulder, muzzle up
    case 'lmg': return { g: [0.55, 1.2, 5.9], yaw: -0.12, pitch: run ? 0.05 : -0.1 };      // slung at the hip
    case 'flamer': return { g: [0.55, 1.15, 5.8], yaw: -0.1, pitch: -0.12 };
    case 'sniper': return { g: [0.45, 1.0, 6.7], yaw: -0.5, pitch: run ? 0.5 : -0.35 };
    case 'pistol': return { g: [0.55, 1.35, 5.2], yaw: 0, pitch: -1.2 };
    case 'mgl': return { g: [0.6, 1.05, 6.5], yaw: -0.35, pitch: run ? 0.3 : -0.3 };
    default: return run ? { g: [0.55, 0.95, 7.3], yaw: -0.55, pitch: 0.45 } : { g: [0.6, 1.0, 6.5], yaw: -0.42, pitch: -0.42 }; // port arms / low ready
  }
}

/** Firing position per stance. */
function aimed(spec: SoldierSpec): Pose {
  const p = base();
  const w = spec.weapon;
  if (spec.stance === 'kneel') {
    p.kneel = true; p.hz = 3.05; p.lean = 0.2; p.headPitch = 0.08;
    p.wG = [1.0, 1.0, 5.75]; p.wYaw = 0; p.wPitch = 0;
  } else if (spec.stance === 'hip') {
    p.hipL = 0.36; p.kneeL = 0.3; p.hipR = -0.34; p.kneeR = 0.22; p.spread = 0.32; p.lean = 0.2;
    p.wG = [0.75, 1.2, 6.0]; p.wPitch = 0.02;
  } else if (spec.stance === 'shoulder') {
    p.hipL = 0.3; p.kneeL = 0.26; p.hipR = -0.28; p.kneeR = 0.2; p.spread = 0.26; p.lean = 0.1;
    p.wG = [0.8, 1.15, 8.2]; p.wPitch = 0.04;                                             // launcher on the shoulder
  } else {
    p.hipL = 0.34; p.kneeL = 0.3; p.hipR = -0.3; p.kneeR = 0.2; p.spread = 0.2; p.lean = 0.14; p.headPitch = 0.1;
    p.wG = [0.95, 1.0, 8.5];
  }
  if (w === 'none' || w === 'pistol') { p.wG = w === 'pistol' ? [1.9, 0.5, 8.3] : null; p.lean = 0.08; }
  return p;
}

export function soldierPose(spec: SoldierSpec, clip: Clip, frame: number): Pose {
  const n = CLIP_FRAMES[clip], f = ((frame % n) + n) % n;
  const w = spec.weapon;
  const armed = w !== 'none';
  let p = base();
  const cw = carry(w, clip === 'run');
  if (armed) { p.wG = [cw.g[0], cw.g[1], cw.g[2]]; p.wYaw = cw.yaw; p.wPitch = cw.pitch; }

  switch (clip) {
    case 'idle': {
      const br = f === 1 ? 1 : 0;
      p.lean = 0.03 + br * 0.012; p.hipL = 0.07; p.hipR = -0.05; p.spread = 0.2;
      if (p.wG) p.wG[2] += br * 0.1;
      break;
    }
    case 'walk':
    case 'run': {
      const run = clip === 'run', ph = (f / n) * Math.PI * 2;
      const A = run ? 0.8 : 0.5, K = run ? 1.45 : 0.9;
      p.hipL = A * Math.sin(ph); p.hipR = A * Math.sin(ph + Math.PI);
      p.kneeL = 0.12 + K * Math.max(0, Math.cos(ph)) ** 1.2; p.kneeR = 0.12 + K * Math.max(0, Math.cos(ph + Math.PI)) ** 1.2;
      p.lean = run ? 0.24 : 0.08; p.twist = -(run ? 0.16 : 0.1) * Math.sin(ph); p.spread = 0.12;
      p.lift = run ? 0.35 * Math.abs(Math.sin(ph)) : 0;
      if (p.wG) p.wG[2] += 0.12 * Math.sin(ph * 2);
      if (!armed || w === 'pistol') {                                                   // free arms swing against the legs
        const sw = (run ? 1.5 : 1.0) * Math.sin(ph);
        p.handL = [sw * 1.1 + 0.2, -1.75, 5.3 + Math.abs(sw) * 0.5]; p.handR = [-sw * 1.1 + 0.2, 1.75, 5.3 + Math.abs(sw) * 0.5];
        if (w === 'pistol') p.wG = null;
      }
      break;
    }
    case 'advance': {                                                                   // walking fire: walking legs under an aimed weapon
      const ph = (f / n) * Math.PI * 2, kneeling = spec.stance === 'kneel';
      p = aimed(spec);
      p.kneel = false; p.hz = null;
      if (kneeling && p.wG) p.wG = [0.95, 1.0, 8.5];
      p.hipL = 0.42 * Math.sin(ph); p.hipR = 0.42 * Math.sin(ph + Math.PI);
      p.kneeL = 0.12 + 0.75 * Math.max(0, Math.cos(ph)) ** 1.2; p.kneeR = 0.12 + 0.75 * Math.max(0, Math.cos(ph + Math.PI)) ** 1.2;
      p.spread = 0.14; p.lean = Math.max(p.lean, 0.12);
      if (p.wG) p.wG[2] += 0.08 * Math.sin(ph * 2);
      break;
    }
    case 'aim': p = aimed(spec); break;
    case 'fire': {
      p = aimed(spec);
      const k = f === 0 ? 1 : 0.45;
      if (p.wG) { p.wG[0] -= 0.32 * k; p.wPitch += 0.07 * k; }
      p.lean -= 0.05 * k; p.headPitch -= 0.04 * k;
      break;
    }
    case 'reload': {
      p = aimed(spec);
      if (p.wG) { p.wG[0] -= 0.25; p.wG[2] -= 0.9; p.wPitch = spec.stance === 'shoulder' ? -0.25 : 0.55; p.wYaw = -0.2; }
      p.headPitch = 0.3; p.lean += 0.04 + f * 0.03;
      break;
    }
    case 'hit':
      p.lean = -0.24; p.headPitch = -0.3; p.hipL = 0.2; p.kneeL = 0.5; p.hipR = -0.3; p.kneeR = 0.42; p.spread = 0.3; p.twist = 0.25;
      if (p.wG) { p.wG[2] -= 0.5; p.wPitch = -0.7; }
      break;
    case 'work': {
      p.kneel = true; p.hz = 3.05; p.lean = 0.42 + f * 0.05; p.headPitch = 0.35;
      p.wG = null;
      p.handR = [2.75 + f * 0.25, 0.55, 2.3 - f * 0.25]; p.handL = [2.35 - f * 0.15, -0.55, 2.9 + f * 0.2];
      break;
    }
    case 'die': {
      const k = [0.18, 0.55, 0.9, 1][f];
      p.bodyPitch = -k * (Math.PI / 2); p.bodyLift = k * 1.05;
      p.lean = -0.25 * (1 - k); p.headPitch = -0.35 * (1 - k) - 0.1;
      p.hipL = 0.3 * (1 - k) + 0.12 * k; p.kneeL = 0.75 * (1 - k) + 0.1; p.hipR = -0.25 * (1 - k) - 0.1 * k; p.kneeR = 0.6 * (1 - k) + 0.25 * k; p.spread = 0.3 + 0.25 * k;
      p.wG = null;
      p.handL = [0.2 + 1.2 * k, -2.2 - 0.9 * k, 7.2 - 0.6 * k]; p.handR = [0.1 + 0.6 * k, 2.3 + 1.0 * k, 6.6 + 0.6 * k];
      break;
    }
  }
  return p;
}

// ───────────────────────── weapons (local frame: grip at the origin, barrel along +x) ─────────────────────────

/** Returns the support-hand point and the muzzle, both in the weapon frame. */
function buildWeapon(b: MeshBuilder, w: Weapon): { support: Vec3; muzzle: Vec3 } {
  const G = MAT.GUN;
  switch (w) {
    case 'rifle':
    case 'smg':
    case 'carbine_s': {
      const L = w === 'rifle' ? 4.2 : 3.3;
      b.use(G).box(0.85, 0, 0.36, 2.5, 0.36, 0.56);                                     // receiver
      b.use(G).box(-1.15, 0, 0.26, 1.5, 0.3, 0.5);                                      // stock
      b.use(MAT.POUCH).box(2.45, 0, 0.4, 1.45, 0.4, 0.44);                              // hand guard
      b.use(G).cyl([2.1, 0, 0.42], [L, 0, 0.42], 0.13, 0.13, 6);                        // barrel
      b.use(G).box(0.75, 0, -0.36, 0.42, 0.28, 0.85);                                   // magazine
      b.use(G).box(0.0, 0, -0.28, 0.3, 0.26, 0.55);                                     // pistol grip
      b.use(G).box(0.95, 0, 0.8, 0.85, 0.24, 0.26);                                     // optic
      if (w === 'carbine_s') { b.use(G).cyl([L - 0.2, 0, 0.42], [L + 1.15, 0, 0.42], 0.21, 0.21, 6); return { support: [2.4, 0, 0.05], muzzle: [L + 1.2, 0, 0.42] }; }
      return { support: [2.5, 0, 0.05], muzzle: [L + 0.1, 0, 0.42] };
    }
    case 'lmg': {
      b.use(G).box(1.0, 0, 0.4, 3.1, 0.48, 0.72);
      b.use(G).box(-1.2, 0, 0.3, 1.4, 0.36, 0.6);
      b.use(G).cyl([2.4, 0, 0.5], [5.3, 0, 0.5], 0.19, 0.19, 6);
      b.use(G).cyl([3.0, 0, 0.5], [4.2, 0, 0.5], 0.3, 0.3, 6);                          // heat shield
      b.use(MAT.POUCH).box(0.9, -0.08, -0.5, 1.0, 0.62, 0.85);                          // belt box
      b.use(MAT.BRASS).box(0.9, 0.3, 0.05, 0.7, 0.14, 0.2);                             // belt
      b.use(G).box(1.7, 0, 0.95, 0.9, 0.12, 0.2);                                       // carry handle
      b.use(G).cyl([4.4, 0.18, 0.3], [3.6, 0.3, -0.25], 0.07, 0.07, 4, 0); b.use(G).cyl([4.4, -0.18, 0.3], [3.6, -0.3, -0.25], 0.07, 0.07, 4, 0); // folded bipod
      return { support: [2.3, 0, -0.05], muzzle: [5.4, 0, 0.5] };
    }
    case 'sniper': {
      b.use(G).box(0.8, 0, 0.36, 2.4, 0.34, 0.5);
      b.use(MAT.POUCH).box(-1.25, 0, 0.3, 1.6, 0.3, 0.62);                              // adjustable stock
      b.use(G).cyl([1.9, 0, 0.42], [5.4, 0, 0.42], 0.12, 0.11, 6);
      b.use(G).cyl([5.0, 0, 0.42], [6.5, 0, 0.42], 0.2, 0.2, 6);                        // suppressor
      b.use(G).cyl([0.2, 0, 0.98], [2.0, 0, 0.98], 0.2, 0.24, 6);                       // scope
      b.use(MAT.GLASS).cyl([2.0, 0, 0.98], [2.06, 0, 0.98], 0.22, 0.22, 6);
      b.use(G).box(0.7, 0, -0.3, 0.4, 0.26, 0.6);
      b.use(G).cyl([3.4, 0.14, 0.3], [3.0, 0.42, -0.5], 0.07, 0.07, 4, 0); b.use(G).cyl([3.4, -0.14, 0.3], [3.0, -0.42, -0.5], 0.07, 0.07, 4, 0); // bipod
      return { support: [2.3, 0, 0.1], muzzle: [6.6, 0, 0.42] };
    }
    case 'rpg': {
      b.use(MAT.ARMOR2).cyl([-2.5, 0, 0.78], [2.5, 0, 0.78], 0.36, 0.36, 8);            // launch tube
      b.use(MAT.ARMOR2).cyl([-2.5, 0, 0.78], [-3.1, 0, 0.78], 0.36, 0.52, 8);           // venturi
      b.use(G).cyl([2.5, 0, 0.78], [2.75, 0, 0.78], 0.46, 0.46, 8);
      b.use(MAT.ARMOR).cyl([2.75, 0, 0.78], [3.75, 0, 0.78], 0.44, 0.12, 8);            // warhead
      b.use(G).box(0, 0, 0.1, 0.32, 0.26, 0.75);
      b.use(G).box(1.4, 0, 0.2, 0.3, 0.26, 0.6);
      b.use(G).box(0.6, -0.3, 1.2, 0.7, 0.22, 0.36);                                    // sight unit
      return { support: [1.4, 0, 0.05], muzzle: [3.8, 0, 0.78] };
    }
    case 'mgl': {
      b.use(G).box(0.6, 0, 0.32, 1.7, 0.4, 0.55);
      b.use(G).cyl([1.2, 0, 0.2], [2.1, 0, 0.2], 0.56, 0.56, 8);                        // revolving cylinder
      b.use(G).cyl([2.1, 0, 0.36], [3.0, 0, 0.36], 0.3, 0.3, 6);
      b.use(G).box(-1.0, 0, 0.3, 1.3, 0.3, 0.42);
      b.use(G).box(0.6, 0, 0.82, 0.6, 0.2, 0.24);
      return { support: [2.0, 0, -0.2], muzzle: [3.1, 0, 0.36] };
    }
    case 'flamer': {
      b.use(G).cyl([-0.4, 0, 0.3], [3.7, 0, 0.3], 0.2, 0.2, 6);                         // lance
      b.use(G).cyl([3.7, 0, 0.3], [4.15, 0, 0.3], 0.34, 0.3, 6);                        // nozzle shroud
      b.use(G).box(0, 0, -0.1, 0.3, 0.26, 0.6);
      b.use(G).box(1.9, 0, 0.0, 0.3, 0.26, 0.5);
      b.use(MAT.BRASS).cyl([3.2, 0, 0.62], [4.0, 0, 0.62], 0.08, 0.08, 4);              // pilot line
      return { support: [1.9, 0, -0.05], muzzle: [4.3, 0, 0.3] };
    }
    case 'pistol':
      b.use(G).box(0.35, 0, 0.3, 1.0, 0.26, 0.36); b.use(G).box(0, 0, -0.1, 0.3, 0.26, 0.5);
      return { support: [0.1, -0.2, 0], muzzle: [0.9, 0, 0.32] };
    default:
      return { support: [0, 0, 0], muzzle: [0, 0, 0] };
  }
}

// ───────────────────────── the body ─────────────────────────

function ik(S: Vec3, T: Vec3, l1: number, l2: number, pole: Vec3): Vec3 {
  let dx = T[0] - S[0], dy = T[1] - S[1], dz = T[2] - S[2];
  let d = Math.hypot(dx, dy, dz) || 1e-6;
  dx /= d; dy /= d; dz /= d;
  d = Math.min(d, l1 + l2 - 0.02);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const k = pole[0] * dx + pole[1] * dy + pole[2] * dz;
  let px = pole[0] - k * dx, py = pole[1] - k * dy, pz = pole[2] - k * dz;
  const pl = Math.hypot(px, py, pz) || 1; px /= pl; py /= pl; pz /= pl;
  return [S[0] + dx * a + px * h, S[1] + dy * a + py * h, S[2] + dz * a + pz * h];
}

export function buildSoldier(b: MeshBuilder, spec: SoldierSpec, clip: Clip, frame: number): void {
  const p = soldierPose(spec, clip, frame);
  const FAB = spec.uniform ?? MAT.CAMO, KIT = spec.kit ?? MAT.GEAR;
  const ex = (k: NonNullable<SoldierSpec['extras']>[number]) => !!spec.extras?.includes(k);
  const s = spec.scale ?? 1;
  b.push();                                                 // (size differences are applied by scaling coordinates with `s`)

  // ── legs: forward kinematics, then drop the pelvis so the lower foot stands on the ground ──
  const legJ = (side: number, hip: number, knee: number, hz: number) => {
    const y0 = side * HIP, sp = side * p.spread;
    const H: Vec3 = [p.px, y0, hz];
    const K: Vec3 = [H[0] + TH * Math.sin(hip), y0 + sp * 0.5, hz - TH * Math.cos(hip)];
    const sa = hip - knee;
    const A: Vec3 = [K[0] + SHN * Math.sin(sa), y0 + sp, K[2] - SHN * Math.cos(sa)];
    const fp = Math.max(-0.9, Math.min(0.35, sa));          // foot pitch follows the shin, limited
    const toeZ = A[2] + Math.sin(fp) * 1.1;
    return { H, K, A, fp, sole: Math.min(A[2], toeZ) - FOOT };
  };
  let hz = p.hz ?? 5.55;
  let L = legJ(-1, p.hipL, p.kneeL, hz), R = legJ(1, p.hipR, p.kneeR, hz);
  if (p.kneel) {
    L = legJ(-1, 1.35, 1.45, hz);                           // left foot planted forward
    R = legJ(1, -0.15, 1.6, hz);                            // right knee on the ground
  } else if (p.hz === null) {
    hz -= Math.min(L.sole, R.sole) - p.lift;
    L = legJ(-1, p.hipL, p.kneeL, hz); R = legJ(1, p.hipR, p.kneeR, hz);
  }

  // whole-body transform (falling backwards about the heels when dying)
  if (p.bodyPitch) { b.move(0, 0, p.bodyLift); b.rotY(p.bodyPitch); }

  const sc = (v: Vec3): Vec3 => [v[0] * s, v[1] * s, v[2] * s];
  const cyl = (a: Vec3, c: Vec3, r0: number, r1: number, seg = 6, caps = 3) => b.cyl(sc(a), sc(c), r0 * s, r1 * s, seg, caps);

  for (const [leg, side] of [[L, -1], [R, 1]] as const) {
    b.use(FAB); cyl(leg.H, leg.K, 0.7, 0.56);
    cyl(leg.K, leg.A, 0.52, 0.42);
    if (ex('kneepads')) { b.use(MAT.POUCH); b.ell(leg.K[0] * s + 0.25 * s, leg.K[1] * s, leg.K[2] * s, 0.45 * s, 0.5 * s, 0.5 * s, 6, 3); }
    b.push().move(leg.A[0] * s, leg.A[1] * s, leg.A[2] * s).rotY(-leg.fp);
    b.use(MAT.BOOT).box(0.42 * s, 0, -0.18 * s, 1.55 * s, 0.74 * s, 0.56 * s);
    b.pop();
    void side;
  }

  // ── torso frame ──
  const W: Vec3 = [p.px, 0, hz + 0.5];
  const cT = Math.cos(p.twist), sT = Math.sin(p.twist), cL = Math.cos(p.lean), sL = Math.sin(p.lean);
  const tor = (x: number, y: number, z: number): Vec3 => { const x1 = x * cL + z * sL, z1 = -x * sL + z * cL; return [W[0] + x1 * cT - y * sT, W[1] + x1 * sT + y * cT, W[2] + z1]; };
  b.push().move(W[0] * s, W[1] * s, W[2] * s).rotZ(p.twist).rotY(p.lean);
  const B = (cx: number, cy: number, cz: number, sx: number, sy: number, sz: number) => b.box(cx * s, cy * s, cz * s, sx * s, sy * s, sz * s);
  b.use(FAB); B(0, 0, -0.3, 1.75, 2.35, 1.5);                                            // hips
  b.use(MAT.POUCH); B(0, 0, 0.32, 1.85, 2.5, 0.34);                                      // belt
  b.use(FAB).loft(                                                                       // chest, widening to the shoulders
    [[-0.9, -1.2, 0.3], [0.9, -1.2, 0.3], [0.9, 1.2, 0.3], [-0.9, 1.2, 0.3]].map(q => sc(q as Vec3)),
    [[-0.95, -1.55, 3.05], [1.0, -1.55, 3.05], [1.0, 1.55, 3.05], [-0.95, 1.55, 3.05]].map(q => sc(q as Vec3)));
  if (spec.armor >= 1) {
    b.use(KIT); B(0.08, 0, 1.75, 2.35, 2.55, 2.1);                                       // plate carrier
    b.use(MAT.POUCH); B(1.32, 0, 1.15, 0.5, 2.0, 0.9);                                   // magazine pouches
    B(1.3, -0.75, 2.2, 0.36, 0.6, 0.5);                                                  // radio / admin pouch
  } else {
    b.use(KIT); B(0.75, 0, 1.3, 0.9, 2.3, 1.1);                                          // light chest rig
    B(0, 0, 2.3, 2.05, 0.5, 0.3);
  }
  if (spec.armor >= 2) {
    b.use(KIT); B(0.05, -1.75, 2.85, 1.3, 0.85, 0.75); B(0.05, 1.75, 2.85, 1.3, 0.85, 0.75);   // shoulder plates
    B(0.1, 0, 3.2, 1.6, 1.7, 0.5);                                                       // neck guard
    b.use(MAT.POUCH); B(0.2, 0, 0.05, 2.3, 2.7, 0.7);                                    // groin / belt armour
  }
  if (ex('bandolier')) { b.use(MAT.BRASS); for (let i = 0; i < 4; i++) B(1.35, -0.9 + i * 0.6, 2.35 - i * 0.28, 0.3, 0.36, 0.4); }
  b.use(MAT.TEAM); B(0.05, -1.98, 2.3, 0.8, 0.3, 0.5); B(0.05, 1.98, 2.3, 0.8, 0.3, 0.5);     // shoulder identification patches
  if (ex('medband')) { b.use(MAT.WHITE); B(0.05, -2.0, 1.5, 1.0, 0.36, 0.7); B(0.05, 2.0, 1.5, 1.0, 0.36, 0.7); b.use(MAT.RED); B(0.05, -2.06, 1.5, 0.4, 0.36, 0.4); B(0.05, 2.06, 1.5, 0.4, 0.36, 0.4); }
  if (ex('satchel')) { b.use(MAT.CANVAS); B(-0.3, -1.6, 0.0, 1.2, 0.6, 1.2); }

  // pack
  const back = -1.35;
  switch (spec.pack) {
    case 'assault': b.use(MAT.POUCH); B(back - 0.25, 0, 1.75, 1.0, 2.0, 2.2); b.use(KIT); B(back - 0.55, 0, 2.95, 0.7, 1.6, 0.5); break;
    case 'ammo': b.use(MAT.POUCH); B(back - 0.45, 0, 1.6, 1.45, 2.5, 2.7); b.use(MAT.BRASS); B(back - 0.2, 1.15, 2.4, 0.5, 0.3, 0.7); break;
    case 'medic': b.use(MAT.POUCH); B(back - 0.4, 0, 1.7, 1.35, 2.3, 2.6); b.use(MAT.WHITE); B(back - 1.1, 0, 1.9, 0.1, 1.3, 1.3); b.use(MAT.RED); B(back - 1.17, 0, 1.9, 0.1, 0.36, 1.0); B(back - 1.17, 0, 1.9, 0.1, 1.0, 0.36); break;
    case 'radio': b.use(MAT.POUCH); B(back - 0.35, 0, 1.8, 1.2, 2.0, 2.3); b.use(MAT.DARK); B(back - 0.3, 0, 3.1, 0.9, 1.5, 0.35); b.use(MAT.GUN); b.cyl(sc([back - 0.5, 0.75, 3.2]), sc([back - 1.1, 0.75, 8.6]), 0.09 * s, 0.07 * s, 4); break;
    case 'tanks': b.use(MAT.BURNT2); b.cyl(sc([back - 0.55, -0.62, 0.4]), sc([back - 0.55, -0.62, 3.3]), 0.58 * s, 0.58 * s, 8); b.use(MAT.STEEL); b.cyl(sc([back - 0.55, 0.62, 0.4]), sc([back - 0.55, 0.62, 3.3]), 0.58 * s, 0.58 * s, 8); b.use(MAT.GUN); B(back - 0.35, 0, 1.9, 0.5, 1.9, 0.4); break;
    case 'tools': b.use(MAT.POUCH); B(back - 0.3, 0, 1.6, 1.1, 2.1, 2.2); b.use(MAT.BURNT2); b.cyl(sc([back - 0.95, 0.5, 0.5]), sc([back - 0.95, 0.5, 3.4]), 0.36 * s, 0.36 * s, 6); b.use(MAT.CANVAS); b.cyl(sc([back - 0.3, -1.0, 3.0]), sc([back - 0.3, 1.0, 3.0]), 0.42 * s, 0.42 * s, 6); break;
    case 'rockets': b.use(MAT.POUCH); B(back - 0.3, 0, 1.7, 1.0, 2.1, 2.3); b.use(MAT.ARMOR); for (const y of [-0.55, 0.55]) { b.cyl(sc([back - 0.75, y, 1.2]), sc([back - 0.95, y, 4.3]), 0.3 * s, 0.3 * s, 6); b.cyl(sc([back - 0.95, y, 4.3]), sc([back - 1.02, y, 5.0]), 0.3 * s, 0.06 * s, 6); } break;
    default: break;
  }
  if (ex('antenna')) { b.use(MAT.GUN); b.cyl(sc([back + 0.2, 0.9, 2.8]), sc([back - 0.3, 0.9, 6.8]), 0.08 * s, 0.06 * s, 4); }

  // neck and head
  b.use(MAT.SKIN); b.cyl(sc([0.05, 0, 2.95]), sc([0.08, 0, 3.5]), 0.42 * s, 0.4 * s, 6, 0);
  b.push().move(0.1 * s, 0, 4.22 * s).rotZ(p.headYaw).rotY(p.headPitch);
  const hooded = spec.headgear === 'hood';
  b.use(hooded ? MAT.BLACK : MAT.SKIN).ell(0, 0, 0, 0.8 * s, 0.76 * s, 0.9 * s, 8, 5);
  if (hooded) { b.use(MAT.SKIN); B(0.66, 0, 0.12, 0.3, 0.9, 0.26); }                      // eyes through the balaclava
  switch (spec.headgear) {
    case 'boonie':
      b.use(FAB).cyl(sc([0, 0, 0.32]), sc([0, 0, 0.42]), 1.42 * s, 1.36 * s, 10);
      b.use(FAB).ell(0, 0, 0.36 * s, 0.86 * s, 0.82 * s, 0.62 * s, 8, 4, 0);
      break;
    case 'beret':
      b.use(MAT.TEAM).ell(-0.05 * s, 0.18 * s, 0.5 * s, 0.98 * s, 1.08 * s, 0.42 * s, 8, 4, -0.2);
      b.use(MAT.BRASS); B(0.75, -0.25, 0.52, 0.12, 0.3, 0.3);
      break;
    case 'ghillie':
      b.use(MAT.GHILLIE).ell(-0.1 * s, 0, 0.3 * s, 1.15 * s, 1.15 * s, 0.85 * s, 8, 4, -0.5);
      b.use(MAT.GHILLIE).ell(-0.7 * s, 0.5 * s, 0.1 * s, 0.7 * s, 0.7 * s, 0.6 * s, 6, 3);
      break;
    case 'hood':
      b.use(MAT.BLACK).ell(-0.05 * s, 0, 0.26 * s, 0.98 * s, 0.94 * s, 0.76 * s, 8, 4, -0.3);
      b.use(MAT.GUN); B(0.78, 0, 0.72, 0.5, 0.5, 0.36);                                   // night-vision mount, flipped up
      break;
    default: {
      b.use(MAT.HELMET).ell(-0.06 * s, 0, 0.24 * s, 1.0 * s, 0.97 * s, 0.8 * s, 10, 5, -0.28);
      if (spec.headgear === 'helmet_nvg') { b.use(MAT.GUN); B(0.82, 0, 0.66, 0.42, 0.46, 0.34); }
      if (spec.headgear === 'helmet_visor') { b.use(MAT.GLASS); B(0.84, 0, 0.3, 0.2, 1.1, 0.42); }
      if (spec.headgear === 'helmet_medic') { b.use(MAT.WHITE); B(-0.05, 0.95, 0.4, 0.7, 0.12, 0.6); B(-0.05, -0.95, 0.4, 0.7, 0.12, 0.6); b.use(MAT.RED); B(-0.05, 1.0, 0.4, 0.3, 0.12, 0.3); B(-0.05, -1.0, 0.4, 0.3, 0.12, 0.3); }
      b.use(MAT.TEAM).cyl(sc([-0.06, 0, -0.02]), sc([-0.06, 0, 0.2]), 1.03 * s, 1.03 * s, 10, 0);          // helmet band
      break;
    }
  }
  if (ex('headset')) { b.use(MAT.DARK); B(0, 0.8, 0, 0.5, 0.2, 0.55); B(0, -0.8, 0, 0.5, 0.2, 0.55); }
  if (ex('veil')) { b.use(MAT.GHILLIE).ell(-0.5 * s, 0, -0.9 * s, 1.3 * s, 1.7 * s, 0.9 * s, 8, 4); }
  b.mark('head', 0, 0, 0.9 * s);
  b.pop();
  b.pop();                                                                                // leave the torso frame

  // ── weapon and arms ──
  const SL = tor(0.05, -1.62, 2.85), SR = tor(0.05, 1.62, 2.85);
  let handR: Vec3 = p.handR ?? [SR[0] + 0.25, SR[1] + 0.15, SR[2] - 3.5];
  let handL: Vec3 = p.handL ?? [SL[0] + 0.25, SL[1] - 0.15, SL[2] - 3.5];
  if (p.wG && spec.weapon !== 'none') {
    const cy = Math.cos(p.wYaw), sy = Math.sin(p.wYaw), cp = Math.cos(p.wPitch), sp = Math.sin(p.wPitch);
    const wl = (x: number, y: number, z: number): Vec3 => { const x1 = x * cp - z * sp, z1 = x * sp + z * cp; return [p.wG![0] + x1 * cy - y * sy, p.wG![1] + x1 * sy + y * cy, p.wG![2] + z1]; };
    b.push().move(p.wG[0] * s, p.wG[1] * s, p.wG[2] * s).rotZ(p.wYaw).rotY(-p.wPitch);
    const info = buildWeapon(b, spec.weapon);
    b.mark('muzzle', info.muzzle[0], info.muzzle[1], info.muzzle[2]);
    b.pop();
    handR = wl(0, 0, 0);
    if (spec.weapon !== 'pistol') handL = wl(info.support[0], info.support[1] - 0.05, info.support[2]);
    if (spec.weapon === 'flamer') { b.use(MAT.DARK); const a = wl(-0.4, 0, 0.3), c = tor(-1.3, 0.6, 1.0); cyl(a, [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2 + 0.5, Math.min(a[2], c[2]) - 0.9], 0.13, 0.13, 4, 0); cyl([(a[0] + c[0]) / 2, (a[1] + c[1]) / 2 + 0.5, Math.min(a[2], c[2]) - 0.9], c, 0.13, 0.13, 4, 0); }
  } else if (spec.weapon !== 'none' && clip === 'die') {
    b.push().move(1.6 * s, 2.6 * s, 0.3).rotZ(0.9);                                        // dropped weapon lies beside the body
    buildWeapon(b, spec.weapon);
    b.pop();
  }
  if (clip === 'work' && spec.tool) {
    if (spec.tool === 'torch') { b.use(MAT.GUN); cyl(handR, [handR[0] + 1.3, handR[1], handR[2] - 0.5], 0.14, 0.1, 4); b.mark('tool', (handR[0] + 1.4) * s, handR[1] * s, (handR[2] - 0.55) * s); }
    else { b.use(MAT.WHITE); b.box((handR[0] + 0.5) * s, handR[1] * s, (handR[2] - 0.2) * s, 0.9 * s, 0.7 * s, 0.5 * s); b.mark('tool', (handR[0] + 0.9) * s, handR[1] * s, (handR[2] - 0.2) * s); }
  }
  for (const [S, Hd, side] of [[SL, handL, -1], [SR, handR, 1]] as const) {
    const E = ik(S, Hd, 2.0, 1.95, [-0.35, side * 0.55, -0.75]);
    b.use(FAB); cyl(S, E, 0.52, 0.44);
    cyl(E, Hd, 0.42, 0.36);
    b.use(MAT.BOOT).ell(Hd[0] * s, Hd[1] * s, Hd[2] * s, 0.38 * s, 0.36 * s, 0.38 * s, 6, 3);
  }
  b.pop();
}
