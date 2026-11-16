/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { UnitType } from '../../types/game';
import { FitParams, FitSprite, Material, Mesh, MeshBuilder, Vec3, projectPoint, renderFit } from './raster';
import { FactionId, MAT, burntMaterials, materialsFor } from './palette';
import { Clip, CLIP_FRAMES, SoldierSpec, buildSoldier } from './soldier';
import { VEHICLES, VehicleDef } from './vehicles';
import { AIRCRAFT, AircraftDef } from './aircraft';

/**
 * Unit model registry (V11): every unit type in the game has its own model.
 * `renderLayer` turns (unit type, faction, layer, facing, animation frame ...) into one sprite. It is pure, so tests and
 * Node scripts can render exactly what the game shows.
 */

export const INFANTRY: Record<string, SoldierSpec> = {
  rifleman: { headgear: 'helmet', armor: 1, pack: 'assault', weapon: 'rifle', stance: 'stand', extras: ['kneepads'] },
  heavy_gunner: { headgear: 'helmet_visor', armor: 2, pack: 'ammo', weapon: 'lmg', stance: 'hip', scale: 1.08, extras: ['kneepads'] },
  sniper: { headgear: 'ghillie', armor: 0, pack: 'none', weapon: 'sniper', stance: 'kneel', uniform: MAT.GHILLIE, extras: ['veil'] },
  medic: { headgear: 'helmet_medic', armor: 1, pack: 'medic', weapon: 'none', stance: 'stand', extras: ['medband'], tool: 'medkit' },
  engineer: { headgear: 'helmet_visor', armor: 1, pack: 'tools', weapon: 'smg', stance: 'stand', extras: ['kneepads'], tool: 'torch' },
  rocket_soldier: { headgear: 'helmet', armor: 1, pack: 'rockets', weapon: 'rpg', stance: 'shoulder' },
  scout: { headgear: 'boonie', armor: 0, pack: 'none', weapon: 'smg', stance: 'stand', scale: 0.96, extras: ['antenna'] },
  commando: { headgear: 'hood', armor: 1, pack: 'none', weapon: 'carbine_s', stance: 'stand', uniform: MAT.BLACK, kit: MAT.POUCH, extras: ['satchel', 'headset'] },
  grenadier: { headgear: 'helmet', armor: 1, pack: 'assault', weapon: 'mgl', stance: 'stand', extras: ['bandolier', 'kneepads'] },
  flamethrower: { headgear: 'helmet_visor', armor: 2, pack: 'tanks', weapon: 'flamer', stance: 'hip' },
  field_commander: { headgear: 'beret', armor: 0, pack: 'radio', weapon: 'pistol', stance: 'stand', extras: ['headset'] },
};

export type UnitKind = 'infantry' | 'vehicle' | 'aircraft';
export function unitKind(type: string): UnitKind { return INFANTRY[type] ? 'infantry' : AIRCRAFT[type] ? 'aircraft' : 'vehicle'; }
export const vehicleDef = (type: string): VehicleDef => VEHICLES[type] ?? VEHICLES.main_battle_tank;
export const aircraftDef = (type: string): AircraftDef => AIRCRAFT[type] ?? AIRCRAFT.recon_drone;
/** Readability scale for infantry: soldiers are drawn 1.3x life size against vehicles (usual RTS convention), so a
 *  rifleman stays legible at gameplay zoom on a phone. Walk cadence uses the same scale, so feet still match the ground. */
export const INFANTRY_SCALE = 1.3;
const scaledSpecs: Record<string, SoldierSpec> = {};
export const soldierSpec = (type: string): SoldierSpec => {
  const base = INFANTRY[type] ?? INFANTRY.rifleman;
  return (scaledSpecs[type] ??= { ...base, scale: (base.scale ?? 1) * INFANTRY_SCALE });
};
export const MODELLED_TYPES: string[] = [...Object.keys(INFANTRY), ...Object.keys(VEHICLES), ...Object.keys(AIRCRAFT)];
export { CLIP_FRAMES };
export type { Clip };

// ───────────────────────── meshes (small LRU: meshes are cheap to rebuild) ─────────────────────────

const meshes = new Map<string, Mesh>();
function mesh(key: string, make: (b: MeshBuilder) => void): Mesh {
  const hit = meshes.get(key);
  if (hit) { meshes.delete(key); meshes.set(key, hit); return hit; }
  const b = new MeshBuilder(); make(b);
  const m = b.build();
  meshes.set(key, m);
  if (meshes.size > 48) meshes.delete(meshes.keys().next().value as string);
  return m;
}

export interface TurretVariant { recoil?: number; elev?: number }
export const soldierMesh = (type: string, clip: Clip, frame: number): Mesh => mesh(`${type}|${clip}|${frame}`, b => buildSoldier(b, soldierSpec(type), clip, frame));
export const hullMesh = (type: string): Mesh => mesh(`${type}|hull`, b => vehicleDef(type).hull(b));
export function turretMesh(type: string, v: TurretVariant = {}): Mesh | null {
  const t = vehicleDef(type).turret;
  if (!t) return null;
  return mesh(`${type}|turret|${v.recoil ?? 0}|${v.elev ?? 0}`, b => t.build(b, { recoil: v.recoil ?? 0, elev: turretElevation(type, v.elev ?? 0) }));
}
/** Turret geometry positioned on the hull: it only casts shadow in the hull sprite (the turret itself is its own sprite). */
function mountedTurret(type: string): Mesh | null {
  const t = vehicleDef(type).turret;
  if (!t) return null;
  return mesh(`${type}|mounted`, b => { b.push().move(t.pivot[0], t.pivot[1], t.pivot[2]); t.build(b, { recoil: 0, elev: turretElevation(type, 0) }); b.pop(); });
}
/** Burnt-out vehicle: the hull with its turret knocked askew, as one mesh. */
function wreckMesh(type: string): Mesh {
  return mesh(`${type}|wreck`, b => {
    const def = vehicleDef(type), t = def.turret;
    def.hull(b);
    if (t) { b.push().move(t.pivot[0] - 1.5, t.pivot[1] + 2.2, t.pivot[2] - 0.3).rotZ(0.75).rotX(0.16); t.build(b, { recoil: 0, elev: -0.06 }); b.pop(); }
  });
}
export const airMesh = (type: string): Mesh => mesh(`${type}|air`, b => aircraftDef(type).body(b));

/** Elevation in radians for elevation level 0 (travel / idle) … 1 (firing position). */
export function turretElevation(type: string, level: number): number {
  const t = vehicleDef(type).turret;
  if (!t) return 0;
  const lo = t.elevIdle ?? 0, hi = t.elevFire ?? 0;
  return lo + (hi - lo) * Math.max(0, Math.min(1, level));
}
export const turretElevates = (type: string): boolean => { const t = vehicleDef(type).turret; return !!t && (t.elevFire ?? 0) !== (t.elevIdle ?? 0); };
export const turretPivot = (type: string): Vec3 | null => vehicleDef(type).turret?.pivot ?? null;

// ───────────────────────── sprites ─────────────────────────

export type Layer = 'body' | 'turret' | 'shadow' | 'wreck';
export interface LayerKey {
  type: UnitType | string; faction: FactionId; layer: Layer;
  dir: number; dirs: number;                // facing index out of `dirs`
  clip?: Clip; frame?: number;              // infantry
  tread?: number;                           // tracked vehicles: 0 / 1
  recoil?: number; elev?: number;           // turrets: recoil 0 / 1, elevation level 0 / 0.5 / 1
  roll?: number;                            // aircraft bank: -1 / 0 / 1
  flat?: boolean;                           // no cast shadow (shadow quality 'off')
}
export const BANK_ROLL = 0.42;              // radians of visual roll for a banked aircraft sprite
export function layerKeyString(k: LayerKey): string {
  return `${k.type}|${k.faction}|${k.layer}|${k.dir}/${k.dirs}|${k.clip ?? ''}${k.frame ?? ''}|${k.tread ?? 0},${k.recoil ?? 0},${k.elev ?? 0},${k.roll ?? 0}${k.flat ? 'f' : ''}`;
}
export interface Quality { texel: number; ss: number }

/** A rendered layer: the sprite plus the screen offsets (world px from the layer origin) of the model's named marks. */
export interface LayerSprite extends FitSprite { marks: Record<string, [number, number]> }
function shoot(m: Mesh, mats: Material[], o: FitParams): LayerSprite {
  const spr = renderFit(m, mats, o) as LayerSprite;
  spr.marks = {};
  for (const name of Object.keys(m.marks)) spr.marks[name] = projectPoint(m.marks[name], o.heading, o.roll ?? 0);
  return spr;
}

/** Render one sprite layer of a unit. Pure. */
export function renderLayer(k: LayerKey, q: Quality): LayerSprite {
  const heading = (k.dir / k.dirs) * Math.PI * 2, kind = unitKind(k.type);
  const mats = materialsFor(k.faction);
  const cast = k.flat ? 0 : 1;
  if (kind === 'infantry') {
    const clip = k.layer === 'wreck' ? 'die' : k.clip ?? 'idle', frame = k.layer === 'wreck' ? CLIP_FRAMES.die - 1 : k.frame ?? 0;
    return shoot(soldierMesh(k.type, clip, frame), mats, { heading, texel: q.texel, ss: q.ss, shadow: cast, ink: 0.6, gain: 1.08 });
  }
  if (kind === 'vehicle') {
    const def = vehicleDef(k.type);
    if (k.layer === 'turret') {
      const tm = turretMesh(k.type, { recoil: k.recoil, elev: k.elev });
      return shoot(tm ?? hullMesh(k.type), mats, { heading, texel: q.texel, ss: q.ss, shadow: 0 });
    }
    if (k.layer === 'wreck') return shoot(wreckMesh(k.type), burntMaterials(), { heading, texel: q.texel, ss: q.ss, shadow: cast, groundAO: 3 });
    return shoot(hullMesh(k.type), mats, { heading, texel: q.texel, ss: q.ss, shadow: cast, shadowMesh: mountedTurret(k.type) ?? undefined, groundAO: 3, treadPhase: def.tracked ? (k.tread ?? 0) * 0.5 : 0 });
  }
  const roll = -(k.roll ?? 0) * BANK_ROLL;
  if (k.layer === 'shadow') return shoot(airMesh(k.type), mats, { heading, roll, texel: Math.max(1, q.texel * 0.5), ss: 1, shadow: 2, pad: 3 });
  if (k.layer === 'wreck') return shoot(mesh(`${k.type}|crash`, b => { b.push().move(0, 0, 0.6).rotX(0.5).rotY(0.14); aircraftDef(k.type).body(b); b.pop(); }), burntMaterials(), { heading, texel: q.texel, ss: q.ss, shadow: cast });
  return shoot(airMesh(k.type), mats, { heading, roll, texel: q.texel, ss: q.ss, shadow: 0 });
}

// ───────────────────────── muzzles ─────────────────────────

const markCache = new Map<string, Vec3 | null>();
function cachedMark(key: string, find: () => Vec3 | undefined): Vec3 | null {
  let v = markCache.get(key);
  if (v === undefined) { v = find() ?? null; markCache.set(key, v); }
  return v;
}

/**
 * Where a unit's weapon muzzle is drawn, as a screen offset (world px) from the unit's ground position.
 * `hull` is the body heading and `aim` the firing direction (the turret's heading, or the body's for units without one).
 * Pure: the engine uses it to start shots and muzzle effects at the barrel the player sees. It never affects simulation.
 */
export function muzzleOffset(type: string, hull: number, aim: number, altitude = 0, which = 'muzzle'): [number, number] {
  const kind = unitKind(type);
  if (kind === 'infantry') {
    const m = cachedMark(`${type}|i`, () => soldierMesh(type, 'fire', 0).marks.muzzle);
    const p = m ? projectPoint(m, aim) : [Math.cos(aim) * 7, Math.sin(aim) * 7 - 6];
    return [p[0], p[1]];
  }
  if (kind === 'aircraft') {
    const m = cachedMark(`${type}|a|${which}`, () => airMesh(type).marks[which] ?? airMesh(type).marks.muzzle);
    const p = m ? projectPoint(m, hull) : [0, 0];
    return [p[0], p[1] - altitude];
  }
  const t = vehicleDef(type).turret;
  if (!t) {
    const m = cachedMark(`${type}|h`, () => hullMesh(type).marks.muzzle);
    const p = m ? projectPoint(m, hull) : [0, -6];
    return [p[0], p[1]];
  }
  const m = cachedMark(`${type}|t|${which}`, () => { const tm = turretMesh(type, { recoil: 0, elev: 1 }); return tm ? tm.marks[which] ?? tm.marks.muzzle : undefined; });
  const pv = projectPoint(t.pivot, hull);
  const pm = m ? projectPoint(m, aim) : [Math.cos(aim) * 14, Math.sin(aim) * 14];
  return [pv[0] + pm[0], pv[1] + pm[1]];
}

/** Approximate height (world px) of the middle of a unit's body above its ground position: where incoming fire is drawn to land. */
export function bodyHeight(type: string): number {
  const kind = unitKind(type);
  return kind === 'infantry' ? 6 : kind === 'vehicle' ? 5 : 3;
}
