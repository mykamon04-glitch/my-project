import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/audio/soundEngine', () => ({ soundEngine: new Proxy({}, { get: () => () => {} }) }));

import { GameEngine } from '../src/game/engine';
import { UNIT_CONFIGS } from '../src/data/gameData';
import { MODELLED_TYPES, renderLayer, unitKind, muzzleOffset, LayerKey } from '../src/game/units/models';
import { advanceAnim, quantDir, WALK_CYCLE, UnitAnim } from '../src/game/units/unitAnim';
import { UnitSpriteCache } from '../src/game/units/unitSprites';
import { pickUnit } from '../src/game/unitPicking';
import type { Unit, UnitType } from '../src/types/game';

const Q = { texel: 1.5, ss: 1 };
const ALL = Object.keys(UNIT_CONFIGS) as UnitType[];
function hash(d: Uint8ClampedArray) { let h = 2166136261; for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 16777619); return h >>> 0; }
function opaque(d: Uint8ClampedArray) { let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 128) n++; return n; }
function diff(a: Uint8ClampedArray, b: Uint8ClampedArray) { if (a.length !== b.length) return Infinity; let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) + Math.abs(a[i + 3] - b[i + 3]) > 24) n++; return n; }
const key = (type: string, o: Partial<LayerKey> = {}): LayerKey => ({ type, faction: 'player', layer: 'body', dir: 3, dirs: 16, ...o });

function mkUnit(type: UnitType, o: Partial<Unit> = {}): Unit {
  const c = UNIT_CONFIGS[type];
  return { id: 'u-' + type, type, faction: 'player', x: 100, y: 100, rotation: 0, altitude: c.isAir ? 75 : 0, hp: c.maxHp, maxHp: c.maxHp, armor: 0, kills: 0, rank: 0,
    stance: 'aggressive', command: 'idle', lastAttackTime: 0, selected: false, path: [], speed: c.speed, isMoving: false, isAttacking: false, abilityCooldown: 0,
    turretRotation: unitKind(type) === 'vehicle' ? 0 : undefined, ...o } as Unit;
}
const D = { body: 16, turret: 16 };

describe('V11 unit models', () => {
  it('every unit type in the game has its own model, and each one renders a distinct, non-empty sprite', () => {
    const missing = ALL.filter(t => !MODELLED_TYPES.includes(t));
    expect(missing).toEqual([]);
    const seen = new Map<number, string>();
    for (const t of ALL) {
      const s = renderLayer(key(t), Q);
      expect(opaque(s.data), t).toBeGreaterThan(20);
      const h = hash(s.data);
      expect(seen.get(h), `${t} looks identical to ${seen.get(h)}`).toBeUndefined();
      seen.set(h, t);
    }
  });

  it('facings are real rotations of the model (different pixels per direction)', () => {
    for (const t of ['rifleman', 'main_battle_tank', 'attack_helicopter']) {
      const a = renderLayer(key(t, { dir: 0 }), Q), b = renderLayer(key(t, { dir: 4 }), Q);
      expect(diff(a.data, b.data)).toBeGreaterThan(10);
    }
  });

  it('turret traverse, recoil and elevation change the turret sprite', () => {
    const base = renderLayer(key('main_battle_tank', { layer: 'turret' }), Q);
    expect(diff(base.data, renderLayer(key('main_battle_tank', { layer: 'turret', dir: 8 }), Q).data)).toBeGreaterThan(10);
    expect(diff(base.data, renderLayer(key('main_battle_tank', { layer: 'turret', recoil: 1 }), Q).data)).toBeGreaterThan(3);
    const art = renderLayer(key('artillery', { layer: 'turret' }), Q);
    expect(diff(art.data, renderLayer(key('artillery', { layer: 'turret', elev: 1 }), Q).data)).toBeGreaterThan(10);
  });

  it('player and enemy versions of a unit differ (camouflage and team markings), with muted colours', () => {
    for (const t of ['rifleman', 'main_battle_tank']) {
      const p = renderLayer(key(t), Q), e = renderLayer(key(t, { faction: 'enemy' }), Q);
      expect(diff(p.data, e.data)).toBeGreaterThan(10);
      // restraint: almost no fully saturated pixels
      let loud = 0, n = 0;
      for (let i = 0; i < p.data.length; i += 4) {
        if (p.data[i + 3] < 200) continue; n++;
        const mx = Math.max(p.data[i], p.data[i + 1], p.data[i + 2]), mn = Math.min(p.data[i], p.data[i + 1], p.data[i + 2]);
        if (mx > 0 && (mx - mn) / mx > 0.75 && mx > 150) loud++;
      }
      expect(loud / n).toBeLessThan(0.04);
    }
  });

  it('infantry walk / fire / die clips are distinct poses', () => {
    const idle = renderLayer(key('rifleman', { dirs: 8, dir: 2, clip: 'idle', frame: 0 }), Q);
    for (const [clip, frame] of [['walk', 2], ['fire', 0], ['die', 3], ['reload', 0]] as const)
      expect(diff(idle.data, renderLayer(key('rifleman', { dirs: 8, dir: 2, clip, frame }), Q).data), clip).toBeGreaterThan(5);
  });

  it('muzzle offsets follow the model: tank muzzle points along the turret, aircraft muzzles are at altitude', () => {
    const east = muzzleOffset('main_battle_tank', 0, 0), west = muzzleOffset('main_battle_tank', 0, Math.PI);
    expect(east[0]).toBeGreaterThan(10); expect(west[0]).toBeLessThan(-10);
    expect(muzzleOffset('attack_helicopter', 0, 0, 55)[1]).toBeLessThan(-45);
    const r = muzzleOffset('rifleman', 0, 0); expect(r[0]).toBeGreaterThan(2); expect(r[1]).toBeLessThan(0);
  });
});

describe('V11 animation state machine (driven only by engine state)', () => {
  it('gait advances with distance travelled, never with time alone (no foot sliding)', () => {
    const u = mkUnit('rifleman');
    let a: UnitAnim | undefined;
    for (let i = 0; i <= 20; i++) a = advanceAnim(a, u, i * 0.05, D);
    expect(a!.gait).toBe(0);
    expect(a!.state).toBe('IDLE');
    for (let i = 21; i <= 60; i++) { u.x += 1.5; a = advanceAnim(a, u, i * 0.05, D); } // 30 px/s for 2 s = 60 px
    expect(a!.state).toBe('MOVING');
    expect(a!.clip).toBe('walk');
    expect(a!.gait * WALK_CYCLE * 1.3).toBeCloseTo(60, 0);
  });

  it('fast infantry runs, slow infantry walks', () => {
    const u = mkUnit('scout');
    let a: UnitAnim | undefined;
    for (let i = 0; i <= 30; i++) { u.x += 5; a = advanceAnim(a, u, i * 0.05, D); } // 100 px/s
    expect(a!.clip).toBe('run');
    expect(a!.state).toBe('RUNNING');
  });

  it('ATTACKING follows the engine shot, RELOADING the real cooldown of slow weapons, AIMING while engaged', () => {
    const u = mkUnit('sniper', { isAttacking: true, targetUnitId: 'x' });
    let a = advanceAnim(undefined, u, 10, D);
    expect(a.state).toBe('AIMING');
    u.lastAttackTime = 10.02;
    a = advanceAnim(a, u, 10.05, D);
    expect(a.state).toBe('ATTACKING');
    expect(a.clip).toBe('fire');
    a = advanceAnim(a, u, 10.5, D); // sniper cooldown 2 s
    expect(a.state).toBe('RELOADING');
  });

  it('unarmed units never show attack states', () => {
    const u = mkUnit('medic', { isAttacking: true, targetUnitId: 'x', lastAttackTime: 9.99 });
    const a = advanceAnim(undefined, u, 10, D);
    expect(['ATTACKING', 'AIMING', 'RELOADING']).not.toContain(a.state);
  });

  it('real damage triggers TAKING_DAMAGE; a real heal pulse triggers HEALING facing the patient', () => {
    const u = mkUnit('rifleman');
    let a = advanceAnim(undefined, u, 5, D);
    u.hp -= 20;
    a = advanceAnim(a, u, 5.05, D);
    expect(a.state).toBe('TAKING_DAMAGE');
    const m = mkUnit('medic', { healCooldown: 7, workAngle: Math.PI / 2 });
    let b = advanceAnim(undefined, m, 7, D);
    b = advanceAnim(b, m, 7.2, D);
    expect(b.state).toBe('HEALING');
    expect(b.dir).toBe(quantDir(Math.PI / 2, 8));
  });

  it('vehicle tracks advance only when the vehicle moves; recoil frame follows the engine recoil', () => {
    const u = mkUnit('main_battle_tank');
    let a = advanceAnim(undefined, u, 1, D);
    const t0 = a.treadDist;
    a = advanceAnim(a, u, 1.5, D);
    expect(a.treadDist).toBe(t0);
    u.x += 10; a = advanceAnim(a, u, 1.55, D);
    expect(a.treadDist).toBeGreaterThan(t0);
    u.recoilOffset = 6; a = advanceAnim(a, u, 1.6, D);
    expect(a.recoil).toBe(1);
  });

  it('facing quantisation has hysteresis (no flicker at a sector boundary)', () => {
    const step = (Math.PI * 2) / 16;
    const d = quantDir(step * 2.45, 16);
    expect(d).toBe(2);
    expect(quantDir(step * 2.55, 16, d)).toBe(2);
    expect(quantDir(step * 2.8, 16, d)).toBe(3);
  });
});

describe('V11 sprite cache', () => {
  it('respects the per-frame generation budget (deferred poses are generated on later frames)', () => {
    let t = 0;
    const c = new UnitSpriteCache(() => ({}) as CanvasImageSource, () => (t += 1)); // each generation costs 1 ms
    c.setDetail('low');                                                             // 3 ms per frame
    c.beginFrame();
    for (const d of [0, 1, 2]) expect(c.get(key('rifleman', { dirs: 8, dir: d }))).not.toBeNull();
    expect(c.get(key('rifleman', { dirs: 8, dir: 3 }))).toBeNull();               // budget spent: deferred
    expect(c.get(key('rifleman', { dirs: 8, dir: 3 }), true)).not.toBeNull();     // forced (unit never drawn yet)
    expect(c.get(key('rifleman', { dirs: 8, dir: 0 }))).not.toBeNull();           // cached: free
    expect(c.stats.deferred).toBe(1);
    c.beginFrame();
    expect(c.get(key('rifleman', { dirs: 8, dir: 4 }))).not.toBeNull();           // next frame: budget renewed
  });

  it('evicts least-recently-used sprites when the pixel budget is exceeded', () => {
    const c = new UnitSpriteCache(() => ({}) as CanvasImageSource, () => 0);
    c.setDetail('low');
    (c.preset as { maxPixels: number }).maxPixels;
    const saved = c.preset.maxPixels;
    (c.preset as { maxPixels: number }).maxPixels = 6000;
    try {
      for (let f = 0; f < 6; f++) { c.beginFrame(); c.get(key('rifleman', { dirs: 8, dir: f })); }
      expect(c.stats.evicted).toBeGreaterThan(0);
      expect(c.pixelCount).toBeLessThanOrEqual(6000 + 3000);
    } finally { (c.preset as { maxPixels: number }).maxPixels = saved; }
  });
});

describe('V11 picking', () => {
  it('an aircraft can be tapped where it is drawn (at altitude); the old ground-only test missed it', () => {
    const heli = mkUnit('attack_helicopter', { x: 400, y: 400, altitude: 75 });
    const tap = { x: 400, y: 400 - 75 };
    const oldPick = [heli].find(u => Math.hypot(u.x - tap.x, u.y - tap.y) <= 26);
    expect(oldPick).toBeUndefined();
    expect(pickUnit([heli], tap, 26)).toBe(heli);
  });

  it('the nearest unit wins when several are inside the tap radius', () => {
    const a = mkUnit('rifleman', { id: 'a', x: 100, y: 100 }), b = mkUnit('rifleman', { id: 'b', x: 112, y: 100 });
    expect(pickUnit([a, b], { x: 110, y: 94 }, 30)?.id).toBe('b');
    expect(pickUnit([a, b], { x: 110, y: 94 }, 30, 'enemy')).toBeUndefined();
  });
});

describe('V11 engine hooks (visual only, gameplay unchanged)', () => {
  function mk() {
    const e = new GameEngine('skirmish', 'normal');
    e.units = []; e.nextWaveTimer = 1e9; (e as any).ai.update = () => {};
    const hq = e.buildings.find(b => b.faction === 'player')!;
    return { e, x: hq.pixelX + 220, y: hq.pixelY + 220 };
  }

  it('unarmed units (damage 0) no longer acquire targets or fire zero-damage shots', () => {
    for (const t of ['medic', 'medical_apc', 'logistics_truck'] as UnitType[]) {
      const { e, x, y } = mk();
      const u = e.spawnUnit(t, 'player', { x, y })!;
      const en = e.spawnUnit('rifleman', 'enemy', { x: x + 100, y })!; en.command = 'hold'; (en as any).stance = 'hold_fire'; en.lastAttackTime = 1e9;
      for (let i = 0; i < 60; i++) e.update(0.05);
      expect(u.targetUnitId, t).toBeUndefined();
      expect(u.isAttacking).toBe(false);
      expect(e.projectiles.filter(p => p.faction === 'player').length).toBe(0);
    }
  });

  it('shots keep their simulated track and damage, and carry the visual muzzle offset', () => {
    const { e, x, y } = mk();
    const u = e.spawnUnit('main_battle_tank', 'player', { x, y })!;
    const en = e.spawnUnit('heavy_tank', 'enemy', { x: x + 150, y })!; en.command = 'hold'; (en as any).stance = 'hold_fire'; en.lastAttackTime = 1e9;
    let shot;
    for (let i = 0; i < 80 && !shot; i++) { e.update(0.05); shot = e.projectiles.find(p => p.faction === 'player'); }
    expect(shot).toBeDefined();
    expect(shot!.startX).toBeCloseTo(u.x, 0);
    expect(shot!.damage).toBe(UNIT_CONFIGS.main_battle_tank.damage);
    expect(Math.hypot(shot!.vox!, shot!.voy!)).toBeGreaterThan(8);
    expect(shot!.vez).toBeGreaterThan(0);
  });

  it('every fallen unit leaves a visual record with its faction (casualty, wreck or crash site)', () => {
    const { e, x, y } = mk();
    const s = e.spawnUnit('rifleman', 'enemy', { x, y })!, h = e.spawnUnit('hawk_helicopter', 'enemy', { x: x + 40, y })!;
    s.hp = 0; h.hp = 0;
    e.update(0.05);
    expect(e.wreckages.map(w => w.type).sort()).toEqual(['hawk_helicopter', 'rifleman']);
    expect(e.wreckages.every(w => w.faction === 'enemy')).toBe(true);
    expect(e.wreckages.find(w => w.type === 'hawk_helicopter')!.altitude).toBeGreaterThan(0);
  });
});
