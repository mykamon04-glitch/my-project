import { describe, it, expect, vi, beforeEach } from 'vitest';

// Audio is a browser API; the simulation never needs it.
vi.mock('../src/audio/soundEngine', () => ({
  soundEngine: new Proxy({}, { get: () => () => {} }),
}));

import { GameEngine } from '../src/game/engine';
import { BUILDING_CONFIGS, UNIT_CONFIGS } from '../src/data/gameData';
import { formatCompact, formatSigned, formatHp, getHpPercent } from '../src/utils/format';

const run = (e: GameEngine, seconds: number) => {
  for (let i = 0; i < seconds * 10; i++) e.update(0.1);
};
const mk = () => new GameEngine('skirmish', 'normal');

/** Place + finish a building through the public API, as the UI does. */
function buildNow(e: GameEngine, type: Parameters<GameEngine['autoPlaceBuilding']>[0]) {
  e.economy.credits = Math.max(e.economy.credits, 50000);
  const b = e.autoPlaceBuilding(type);
  expect(b, `no valid site for ${type}`).toBeTruthy();
  run(e, BUILDING_CONFIGS[type].buildTime * 2 + 2);
  expect(b!.constructionProgress).toBeGreaterThanOrEqual(1);
  return b!;
}

describe('construction & economy', () => {
  it('deducts the cost exactly once and completes after build time', () => {
    const e = mk();
    e.economy.credits = 5000;
    const cost = BUILDING_CONFIGS.barracks.cost;
    const before = e.economy.credits;
    const b = e.autoPlaceBuilding('barracks')!;
    expect(b).toBeTruthy();
    expect(e.economy.credits).toBeCloseTo(before - cost, 0);
    expect(b.isUnderConstruction).toBe(true);
    run(e, BUILDING_CONFIGS.barracks.buildTime + 5);
    expect(b.constructionProgress).toBeGreaterThanOrEqual(1);
    expect(b.isUnderConstruction).toBe(false);
  });

  it('rejects placement on top of an existing building', () => {
    const e = mk();
    const hq = e.buildings.find(b => b.type === 'headquarters' && b.faction === 'player')!;
    const r = e.canPlaceBuilding('barracks', hq.x, hq.y, 'player');
    expect(r.valid).toBe(false);
  });
});

describe('recruitment flow', () => {
  let e: GameEngine;
  beforeEach(() => { e = mk(); });

  it('queue -> timer -> unit appears; credits deducted once; unit is controllable', () => {
    const barracks = buildNow(e, 'barracks');
    e.economy.credits = 5000;
    const n0 = e.units.filter(u => u.faction === 'player').length;
    const c0 = e.economy.credits;
    expect(e.queueUnitProduction(barracks.id, 'rifleman')).toBe(true);
    expect(e.economy.credits).toBeCloseTo(c0 - UNIT_CONFIGS.rifleman.cost, 0);
    run(e, UNIT_CONFIGS.rifleman.trainTime + 3);
    const mine = e.units.filter(u => u.faction === 'player');
    expect(mine.length).toBe(n0 + 1);
    expect(barracks.productionQueue.length).toBe(0);
    // controllable: a move order sets the unit in motion
    const u = mine[mine.length - 1];
    const x0 = u.x, y0 = u.y;
    e.issueMove([u.id], { x: u.x + 200, y: u.y + 40 });
    run(e, 3);
    expect(Math.hypot(u.x - x0, u.y - y0)).toBeGreaterThan(20);
  });

  it('cancel refunds the full cost', () => {
    const barracks = buildNow(e, 'barracks');
    e.economy.credits = 5000;
    e.queueUnitProduction(barracks.id, 'rifleman');
    const mid = e.economy.credits;
    expect(e.cancelUnitProduction(barracks.id, 0)).toBe(true);
    expect(e.economy.credits).toBeCloseTo(mid + UNIT_CONFIGS.rifleman.cost, 0);
  });

  it('refuses when credits are short and charges nothing', () => {
    const barracks = buildNow(e, 'barracks');
    e.economy.credits = 1;
    expect(e.queueUnitProduction(barracks.id, 'rifleman')).toBe(false);
    expect(e.economy.credits).toBe(1);
    expect(barracks.productionQueue.length).toBe(0);
  });

  it('PROBE: can queued units push population past the cap?', () => {
    const barracks = buildNow(e, 'barracks');
    e.economy.credits = 100000;
    run(e, 0.2);
    const room = e.economy.populationCap - e.economy.population;
    // Fill all but one slot with spawned units, then queue many more.
    const accepted: boolean[] = [];
    for (let i = 0; i < room + 6; i++) accepted.push(e.queueUnitProduction(barracks.id, 'rifleman'));
    const queued = accepted.filter(Boolean).length;
    // eslint-disable-next-line no-console
    console.log(`[probe] cap=${e.economy.populationCap} pop=${e.economy.population} room=${room} accepted=${queued}`);
    expect(queued).toBeLessThanOrEqual(room); // intended rule: never exceed the cap
  });

  it('PROBE: does the engine refuse a unit for the wrong facility?', () => {
    const hq = e.buildings.find(b => b.type === 'headquarters' && b.faction === 'player')!;
    e.economy.credits = 5000;
    const c0 = e.economy.credits;
    const ok = e.queueUnitProduction(hq.id, 'rifleman'); // HQ is not a barracks
    // eslint-disable-next-line no-console
    console.log(`[probe] wrong-facility queue accepted=${ok} credits ${c0}->${e.economy.credits} queueLen=${hq.productionQueue.length}`);
    expect(ok).toBe(false);
  });
});

describe('save / load', () => {
  it('round-trips credits, buildings and production queues', () => {
    const e = mk();
    const barracks = buildNow(e, 'barracks');
    e.economy.credits = 9000;
    e.queueUnitProduction(barracks.id, 'rifleman');
    e.queueUnitProduction(barracks.id, 'rifleman');
    run(e, 1);
    const save = e.exportSaveData('t', 'test', { x: 123, y: 456, zoom: 1.2 });
    const e2 = mk();
    expect(e2.importSaveData(save)).toBe(true);
    const b2 = e2.buildings.find(b => b.id === barracks.id)!;
    expect(b2).toBeTruthy();
    expect(b2.productionQueue.length).toBe(2);
    expect(b2.productionQueue[0].progress).toBeGreaterThan(0);
    expect(Math.round(e2.economy.credits)).toBe(Math.round(e.economy.credits));
    expect(e2.lastLoadedCamera).toMatchObject({ x: 123, y: 456 });
    run(e2, UNIT_CONFIGS.rifleman.trainTime * 2 + 3);
    expect(b2.productionQueue.length).toBe(0);
  });
});

describe('number formatting (presentation boundary)', () => {
  it('never exposes float artifacts, NaN or Infinity', () => {
    expect(formatHp(95.88789999999949, 120)).toBe('96/120 HP');
    expect(formatHp(NaN, 120)).toBe('0/120 HP');
    expect(formatHp(Infinity, undefined)).not.toMatch(/Infinity|NaN|undefined/);
    expect(getHpPercent(50, 0)).toBeGreaterThanOrEqual(0);
  });
  it('abbreviates compactly and keeps sign', () => {
    expect(formatCompact(3047)).toBe('3,047');
    expect(formatCompact(12400)).toBe('12.4K');
    expect(formatCompact(391950)).toBe('392K');
    expect(formatCompact(1_200_000)).toBe('1.2M');
    expect(formatCompact(NaN)).toBe('0');
    expect(formatSigned(-120)).toBe('-120');
    expect(formatSigned(50)).toBe('+50');
  });
});

describe('AI parity after the queue fixes', () => {
  it('enemy commander still builds and trains units on its own', () => {
    const e = mk();
    const enemyUnits0 = e.units.filter(u => u.faction === 'enemy').length;
    const enemyBuildings0 = e.buildings.filter(b => b.faction === 'enemy').length;
    run(e, 240);
    const enemyUnits = e.units.filter(u => u.faction === 'enemy').length;
    const enemyBuildings = e.buildings.filter(b => b.faction === 'enemy').length;
    // eslint-disable-next-line no-console
    console.log(`[parity] enemy units ${enemyUnits0}->${enemyUnits}, buildings ${enemyBuildings0}->${enemyBuildings}`);
    expect(enemyUnits + enemyBuildings).toBeGreaterThan(enemyUnits0 + enemyBuildings0);
  });

  it('player AI Troop Production (autoProduction) still produces units within the cap', () => {
    const e = mk();
    buildNow(e, 'barracks');
    e.economy.credits = 20000;
    e.autoProduction.enabled = true;
    const n0 = e.units.filter(u => u.faction === 'player').length;
    run(e, 120);
    const n = e.units.filter(u => u.faction === 'player').length;
    // eslint-disable-next-line no-console
    console.log(`[parity] player units ${n0}->${n} (cap ${e.economy.populationCap})`);
    expect(n).toBeGreaterThan(n0);
    expect(n).toBeLessThanOrEqual(e.economy.populationCap);
  });
});

describe('camera stability (no screen shake)', () => {
  it('engine never produces a shake offset with default settings, even for huge explosions', () => {
    const e = mk();
    expect(e.settings.screenShake).toBe(0);
    e.addScreenShake(1.5); // e.g. tactical nuke
    for (let i = 0; i < 20; i++) {
      e.update(0.05);
      expect(Math.abs(e.screenShakeOffset.x)).toBe(0); // (-0 is fine: zero magnitude)
      expect(Math.abs(e.screenShakeOffset.y)).toBe(0);
    }
  });
});

import { getRenderScale, frameIntervalMs, particleStride, shadowLevel, presetValues } from '../src/game/renderQuality';
describe('render quality helpers', () => {
  it('undefined settings keep original behaviour', () => {
    expect(getRenderScale(undefined)).toBe(1);          // node: no window -> DPR 1
    expect(frameIntervalMs(undefined)).toBe(0);         // uncapped
    expect(particleStride(undefined)).toBe(1);          // draw everything
    expect(shadowLevel(undefined)).toBe('medium');
  });
  it('applies the player settings', () => {
    expect(getRenderScale({ resolutionScale: 0.75 })).toBeCloseTo(0.75);
    expect(getRenderScale({ resolutionScale: 99 })).toBeLessThanOrEqual(2.5);
    expect(frameIntervalMs({ frameRateTarget: 30 })).toBeCloseTo(33.33, 1);
    expect(frameIntervalMs({ frameRateTarget: 0 })).toBe(0);
    expect(particleStride({ particleDensity: 'low' })).toBe(3);
    expect(particleStride({ particleDensity: 'high', reducedMotion: true })).toBe(3);
  });
  it('presets are monotonic in cost', () => {
    expect(presetValues('low').resolutionScale).toBeLessThan(presetValues('ultra').resolutionScale);
    expect(presetValues('low').shadowQuality).toBe('off');
  });
});

describe('placement rotation & rejection', () => {
  it('rotation is accepted and stored; footprint stays valid (all original footprints are square, so rotation is orientation-only)', () => {
    const e = mk();
    e.economy.credits = 100000;
    const sizes = Object.values(BUILDING_CONFIGS).map(c => c.size.width === c.size.height);
    expect(sizes.every(Boolean)).toBe(true); // documents the data fact this behaviour relies on
    const recs = e.getRecommendedBuildingPositions('barracks', 90);
    expect(recs.length).toBeGreaterThan(0);
    const b = e.placeBuilding('barracks', recs[0].gridX, recs[0].gridY, 'player', 90)!;
    expect(b).toBeTruthy();
    expect(b.rotation).toBe(90);
    expect(b.width).toBe(BUILDING_CONFIGS.barracks.size.width);
  });

  it('invalid placement is rejected and charges nothing', () => {
    const e = mk();
    e.economy.credits = 5000;
    const hq = e.buildings.find(b => b.type === 'headquarters' && b.faction === 'player')!;
    const before = e.economy.credits;
    const nb = e.buildings.length;
    expect(e.placeBuilding('barracks', hq.x, hq.y)).toBeNull();
    expect(e.economy.credits).toBe(before);
    expect(e.buildings.length).toBe(nb);
  });
});

import { applySmartMode, detectSmartMode } from '../src/game/smartRecruitment';
describe('Smart Recruitment drives real production', () => {
  function army(mode: Parameters<typeof applySmartMode>[1]) {
    const e = mk();
    for (const t of ['barracks', 'vehicle_factory'] as const) buildNow(e, t);
    e.units = e.units.filter(u => u.faction === 'player');
    e.economy.credits = 400000;
    e.autoProduction.enabled = true;
    e.autoProduction.targetArmySize = 70;
    e.autoProduction.reserveCredits = 0;
    e.autoProduction.maxQueueLength = 3;
    applySmartMode(e.autoProduction, mode);
    const keep = e.units.length;
    for (let i = 0; i < 20 * 400; i++) { e.economy.credits = Math.max(e.economy.credits, 100000); e.update(0.05); }
    const made = e.units.filter(u => u.faction === 'player').slice(keep);
    const inf = made.filter(u => UNIT_CONFIGS[u.type].category === 'infantry').length;
    const veh = made.filter(u => UNIT_CONFIGS[u.type].category === 'vehicle').length;
    return { e, inf, veh, total: made.length };
  }

  it('Armored and Infantry modes produce measurably different armies from the same facilities', () => {
    const a = army('armored'), i = army('infantry');
    // eslint-disable-next-line no-console
    console.log(`[smart] armored: ${a.inf} inf / ${a.veh} veh ; infantry: ${i.inf} inf / ${i.veh} veh`);
    expect(a.total).toBeGreaterThan(8);
    expect(i.total).toBeGreaterThan(8);
    expect(a.veh / a.total).toBeGreaterThan(i.veh / i.total + 0.15);   // armored leans vehicles
    expect(i.inf / i.total).toBeGreaterThan(a.inf / a.total + 0.15);   // infantry leans infantry
  });

  it('respects population cap, the army target and the budget', () => {
    const { e } = army('balanced');
    const mine = e.units.filter(u => u.faction === 'player').length;
    expect(mine).toBeLessThanOrEqual(e.economy.populationCap);
    expect(mine).toBeLessThanOrEqual(70 + 3);
  });

  it('preset detection round-trips', () => {
    const e = mk();
    for (const m of ['balanced', 'defensive', 'armored', 'infantry'] as const) {
      applySmartMode(e.autoProduction, m);
      expect(detectSmartMode(e.autoProduction)).toBe(m);
    }
    // a genuinely custom mix is detected as custom (identical numbers to a preset are, by value, that preset)
    applySmartMode(e.autoProduction, 'custom');
    e.autoProduction.customComposition = { infantryPct: 41, armorPct: 22, antiAirPct: 12, artilleryPct: 15, supportPct: 10 };
    expect(detectSmartMode(e.autoProduction)).toBe('custom');
  });
});
