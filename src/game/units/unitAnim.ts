/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Unit } from '../../types/game';
import { UNIT_CONFIGS } from '../../data/gameData';
import { CLIP_FRAMES, Clip, soldierSpec, turretElevates, unitKind } from './models';

/**
 * Unit animation state machine (V11).
 *
 * It never invents gameplay. Every state is derived from what the combat engine really did:
 *   - legs / tracks advance by the distance the unit actually travelled since the last frame (no time-based walking);
 *   - ATTACKING is the window right after the engine's own `lastAttackTime`; RELOADING is the engine's attack cooldown;
 *   - AIMING follows the engine's target (`isAttacking`); HEALING / REPAIRING follow real heal pulses (`healCooldown`);
 *   - TAKING_DAMAGE is a real drop of `hp`.
 * The module is pure (no DOM); the renderer keeps one `UnitAnim` record per visible unit.
 */

export type AnimState =
  | 'IDLE' | 'MOVING' | 'RUNNING' | 'TURNING' | 'AIMING' | 'ATTACKING' | 'RELOADING' | 'TAKING_DAMAGE' | 'HEALING' | 'REPAIRING';

export interface UnitAnim {
  state: AnimState;
  since: number;                 // game time at which `state` was entered
  clip: Clip; frame: number;     // infantry sprite
  dir: number;                   // body facing, index out of `dirs`
  dirs: number;
  tdir: number;                  // turret facing, index out of `tdirs`
  tdirs: number;
  tread: 0 | 1;                  // track-link frame
  recoil: 0 | 1;                 // gun in recoil
  elev: number;                  // gun elevation level 0 / 0.5 / 1
  roll: -1 | 0 | 1;              // aircraft bank
  speed: number;                 // measured ground speed, px/s (smoothed)
  // memory
  t: number; px: number; py: number; prot: number; php: number;
  gait: number;                  // gait cycles travelled
  treadDist: number;
  hitUntil: number; aimUntil: number; clipSince: number;
  elevNow: number;
  running: boolean;
  seed: number;                  // per-unit phase offset so squads do not move in lockstep
}

export interface AnimDirs { body: number; turret: number }

/** Distance covered by one full gait cycle (two steps), world px. */
export const WALK_CYCLE = 26;
export const RUN_CYCLE = 38;
/** Infantry jog above this measured speed (px/s) and drop back to a walk below RUN_EXIT. */
export const RUN_ENTER = 70;
export const RUN_EXIT = 58;
const MOVE_EPS = 9;              // px/s: slower than this is standing still
const TREAD_STEP = 2.4;          // px of travel per track-link frame
const HYST = 0.14;               // facing hysteresis, in sectors

function hash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

/** Quantise an angle to one of `dirs` facings, sticking to the previous facing near a sector boundary. */
export function quantDir(angle: number, dirs: number, prev?: number): number {
  const raw = (angle / (Math.PI * 2)) * dirs;
  if (prev !== undefined) {
    let d = raw - prev;
    d -= Math.round(d / dirs) * dirs;
    if (Math.abs(d) < 0.5 + HYST) return prev;
  }
  return ((Math.round(raw) % dirs) + dirs) % dirs;
}

function angDiff(a: number, b: number): number {
  let d = a - b;
  d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2;
  return d;
}

/** Seconds the weapon visibly fires after the engine's shot. */
export function fireWindow(attackSpeed: number): number { return Math.min(0.16, 0.45 / Math.max(0.1, attackSpeed)); }
/** True when the weapon's real cooldown is long enough to show a reload. */
export function showsReload(attackSpeed: number): boolean { return 1 / Math.max(0.1, attackSpeed) >= 1.0; }

function fresh(u: Unit, time: number, d: AnimDirs): UnitAnim {
  const kind = unitKind(u.type);
  const dirs = kind === 'infantry' ? 8 : d.body;
  return {
    state: 'IDLE', since: time, clip: 'idle', frame: 0,
    dir: quantDir(u.rotation, dirs), dirs,
    tdir: quantDir(u.turretRotation ?? u.rotation, d.turret), tdirs: d.turret,
    tread: 0, recoil: 0, elev: 0, roll: 0, speed: 0,
    t: time, px: u.x, py: u.y, prot: u.rotation, php: u.hp,
    gait: 0, treadDist: 0, hitUntil: -1, aimUntil: -1, clipSince: time, elevNow: 0, running: false,
    seed: hash(u.id),
  };
}

/**
 * Advance (or create) the animation record of a unit to game time `time`.
 * Call once per rendered frame for every unit that is drawn.
 */
export function advanceAnim(prev: UnitAnim | undefined, u: Unit, time: number, d: AnimDirs): UnitAnim {
  const cfg = UNIT_CONFIGS[u.type];
  const kind = unitKind(u.type);
  // a record that was not updated for a while (unit was off screen, game was loaded ...) starts over
  if (!prev || time < prev.t || time - prev.t > 0.6 || prev.dirs !== (kind === 'infantry' ? 8 : d.body) || prev.tdirs !== d.turret) {
    const a = fresh(u, time, d);
    if (prev) { a.gait = prev.gait; a.treadDist = prev.treadDist; }
    prev = a;
  }
  const a = prev;
  const dt = time - a.t;
  const moved = Math.hypot(u.x - a.px, u.y - a.py);
  const turned = Math.abs(angDiff(u.rotation, a.prot));
  if (dt > 0) {
    const sp = moved / dt;
    a.speed += (sp - a.speed) * Math.min(1, dt * 14);
  }
  const moving = a.speed > MOVE_EPS;
  const turnRate = dt > 0 ? turned / dt : 0;

  const armed = cfg.damage > 0;
  const sinceAtk = time - u.lastAttackTime;
  const cooldown = 1 / Math.max(0.1, cfg.attackSpeed);
  const fw = fireWindow(cfg.attackSpeed);
  const firing = armed && u.lastAttackTime > 0 && sinceAtk >= 0 && sinceAtk < fw;
  const engaged = armed && u.isAttacking && !!(u.targetUnitId || u.targetBuildingId);
  if (engaged || firing) a.aimUntil = time + 0.55;
  const aiming = armed && (engaged || time < a.aimUntil);
  const reloading = armed && engaged && !firing && showsReload(cfg.attackSpeed) && sinceAtk >= fw + 0.1 && sinceAtk < cooldown * 0.72;
  const working = !!u.healCooldown && time - u.healCooldown >= 0 && time - u.healCooldown < 1.15;

  // real damage taken since the last frame
  if (u.hp < a.php - Math.max(0.5, u.maxHp * 0.01)) a.hitUntil = time + 0.2;
  const hit = time < a.hitUntil;

  let state: AnimState;

  if (kind === 'infantry') {
    const spec = soldierSpec(u.type);
    if (a.running ? a.speed < RUN_EXIT : a.speed > RUN_ENTER) a.running = !a.running;
    if (moving) a.gait += moved / ((a.running ? RUN_CYCLE : WALK_CYCLE) * (spec.scale ?? 1));
    const gaitFrame = (clip: Clip) => Math.floor((a.gait - Math.floor(a.gait)) * CLIP_FRAMES[clip]) % CLIP_FRAMES[clip];

    let clip: Clip; let frame = 0;
    if (moving) {
      // the legs always follow the ground: a moving soldier walks, even while shooting
      if (firing || aiming) { clip = 'advance'; frame = gaitFrame('advance'); state = firing ? 'ATTACKING' : 'MOVING'; }
      else if (a.running) { clip = 'run'; frame = gaitFrame('run'); state = 'RUNNING'; }
      else { clip = 'walk'; frame = gaitFrame('walk'); state = 'MOVING'; }
    } else if (firing) {
      clip = 'fire'; frame = sinceAtk < fw * 0.5 ? 0 : 1; state = 'ATTACKING';
    } else if (hit) {
      clip = 'hit'; state = 'TAKING_DAMAGE';
    } else if (working && (cfg.canHeal || u.type === 'engineer' || u.type === 'medic')) {
      clip = 'work'; frame = Math.floor((time - (u.healCooldown ?? 0)) / 0.28) % 2;
      state = u.type === 'engineer' ? 'REPAIRING' : 'HEALING';
    } else if (reloading) {
      clip = 'reload'; frame = (sinceAtk - fw) / (cooldown * 0.72 - fw) < 0.5 ? 0 : 1; state = 'RELOADING';
    } else if (aiming) {
      clip = 'aim'; state = 'AIMING';
    } else {
      clip = 'idle'; frame = Math.floor(time * 0.8 + a.seed * 2) % 2;
      state = turnRate > 1.6 ? 'TURNING' : 'IDLE';
    }
    // a pose is held for a moment so that borderline conditions cannot make the sprite flicker
    const urgent = clip === 'fire' || clip === 'hit' || moving !== (a.clip === 'walk' || a.clip === 'run' || a.clip === 'advance');
    if (clip !== a.clip) {
      if (urgent || time - a.clipSince >= 0.14) { a.clip = clip; a.clipSince = time; a.frame = frame; }
      else if (a.clip === 'walk' || a.clip === 'run' || a.clip === 'advance') a.frame = gaitFrame(a.clip);
    } else a.frame = frame;
    // healers and engineers turn to their patient while they work
    const face = clip === 'work' && u.workAngle !== undefined ? u.workAngle : u.rotation;
    a.dir = quantDir(face, 8, a.dir);
  } else if (kind === 'vehicle') {
    a.treadDist += moved + turned * 9;
    a.tread = (Math.floor(a.treadDist / TREAD_STEP) % 2) as 0 | 1;
    a.dir = quantDir(u.rotation, a.dirs, a.dir);
    a.tdir = quantDir(u.turretRotation ?? u.rotation, a.tdirs, a.tdir);
    a.recoil = (u.recoilOffset ?? 0) > 2.6 && armed ? 1 : 0;
    if (turretElevates(u.type)) {
      const want = engaged || (u.lastAttackTime > 0 && sinceAtk < 1.4) ? 1 : 0;
      a.elevNow += Math.max(-dt * 2.2, Math.min(dt * 2.2, want - a.elevNow));
      a.elev = a.elevNow > 0.75 ? 1 : a.elevNow > 0.25 ? 0.5 : 0;
    } else a.elev = 0;
    if (firing) state = 'ATTACKING';
    else if (working && cfg.canHeal) state = 'HEALING';
    else if (reloading) state = 'RELOADING';
    else if (moving) state = 'MOVING';
    else if (aiming) state = 'AIMING';
    else if (turnRate > 0.5) state = 'TURNING';
    else state = 'IDLE';
  } else {
    a.dir = quantDir(u.rotation, a.dirs, a.dir);
    const bank = u.bankAngle ?? 0;
    if (a.roll === 0) { if (bank > 0.2) a.roll = 1; else if (bank < -0.2) a.roll = -1; }
    else if (Math.abs(bank) < 0.1 || Math.sign(bank) !== a.roll) a.roll = 0;
    if (firing) state = 'ATTACKING';
    else if (reloading) state = 'RELOADING';
    else if (moving) state = 'MOVING';
    else if (aiming) state = 'AIMING';
    else state = 'IDLE';
  }

  if (state !== a.state) { a.state = state; a.since = time; }
  a.t = time; a.px = u.x; a.py = u.y; a.prot = u.rotation; a.php = u.hp;
  return a;
}

/** Death sequence of a casualty record: which `die` frame to show `age` seconds after the unit fell. */
export const DIE_TIME = 0.5;
export function dieFrame(age: number): number {
  return Math.min(CLIP_FRAMES.die - 1, Math.floor((Math.max(0, age) / DIE_TIME) * CLIP_FRAMES.die));
}
