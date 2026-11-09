import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/audio/soundEngine', () => ({ soundEngine: new Proxy({}, { get: () => () => {} }) }));

import { GameEngine } from '../src/game/engine';
import { BUILDING_CONFIGS } from '../src/data/gameData';
import type { BuildingType, Unit } from '../src/types/game';

const run = (e: GameEngine, s: number) => { for (let i = 0; i < s * 20; i++) e.update(0.05); };
const mk = () => new GameEngine('skirmish', 'normal');
const hqOf = (e: GameEngine) => e.buildings.find(b => b.type === 'headquarters' && b.faction === 'player')!;

function buildNow(e: GameEngine, type: BuildingType) {
  e.economy.credits = Math.max(e.economy.credits, 50000);
  const b = e.autoPlaceBuilding(type)!;
  expect(b, `no site for ${type}`).toBeTruthy();
  run(e, BUILDING_CONFIGS[type].buildTime * 2 + 2);
  return b;
}
/** Quiet the enemy AI so only our test units matter. */
function isolate(e: GameEngine) {
  e.units = e.units.filter(u => u.faction === 'player');
  e.buildings = e.buildings.filter(b => b.faction === 'player' || b.type === 'headquarters');
}
function poweredRadarGame() {
  const e = mk();
  buildNow(e, 'power_plant');
  const radar = buildNow(e, 'radar_station');
  isolate(e);
  run(e, 1);
  expect(e.tacticalIntelligence.radarOperational).toBe(true);
  return { e, radar };
}
/** Walkable point at `dist` px from (cx,cy) that the player's fog currently hides. */
function hiddenSpot(e: GameEngine, cx: number, cy: number, dist: number) {
  const w = e.mapData.width, ts = e.mapData.tileSize;
  for (let a = 0; a < 360; a += 5) {
    const x = cx + Math.cos((a * Math.PI) / 180) * dist, y = cy + Math.sin((a * Math.PI) / 180) * dist;
    if (!e.pathGrid.isPixelWalkable(x, y)) continue;
    if (e.fogGrid[Math.floor(y / ts) * w + Math.floor(x / ts)] !== 2) return { x, y };
  }
  return null;
}

describe('radar information vs fog of war', () => {
  it('invariant: an enemy is never listed as a threat while fog hides it, at any distance', () => {
    const { e, radar } = poweredRadarGame();
    expect(e.settings.fogOfWarEnabled).toBe(true);
    const ts = e.mapData.tileSize, w = e.mapData.width;
    const placed: { id: string; radius: number }[] = [];
    for (const radius of [500, 650, 780, 840, 900, 1000]) {
      for (let a = 0; a < 360; a += 30) {
        const x = radar.pixelX + Math.cos((a * Math.PI) / 180) * radius, y = radar.pixelY + Math.sin((a * Math.PI) / 180) * radius;
        if (!e.pathGrid.isPixelWalkable(x, y)) continue;
        const u = e.spawnUnit('rifleman', 'enemy', { x, y });
        u.hp = 1e6; u.maxHp = 1e6;
        placed.push({ id: u.id, radius });
      }
    }
    expect(placed.length).toBeGreaterThan(10);
    run(e, 0.3);
    let leaks = 0, listedFar = 0, hiddenCount = 0;
    for (const p of placed) {
      const u = e.units.find(x => x.id === p.id);
      if (!u) continue;
      const visible = e.fogGrid[Math.floor(u.y / ts) * w + Math.floor(u.x / ts)] === 2;
      const listed = e.tacticalIntelligence.activeThreats.some(t => t.targetId === p.id);
      if (!visible) hiddenCount++;
      if (listed && !visible) leaks++;
      if (listed && p.radius >= 780) listedFar++;
    }
    // eslint-disable-next-line no-console
    console.log(`[fog] placed=${placed.length} fog-hidden=${hiddenCount} leaked-into-threat-list=${leaks} listed-beyond-780px=${listedFar}`);
    expect(hiddenCount).toBeGreaterThan(0);  // premise: fog really hides some of them
    expect(leaks).toBe(0);                   // rule: radar info must not reveal fog-hidden enemies
    expect(listedFar).toBeGreaterThan(0);    // the powered radar still gives long-range early warning
  });

  it('an enemy that IS visible (inside fog vision) is detected', () => {
    const { e, radar } = poweredRadarGame();
    const enemy = e.spawnUnit('rifleman', 'enemy', { x: radar.pixelX + 260, y: radar.pixelY });
    if (!e.pathGrid.isPixelWalkable(enemy.x, enemy.y)) { enemy.x = radar.pixelX - 260; }
    run(e, 2);
    expect(e.tacticalIntelligence.activeThreats.some(t => t.targetId === enemy.id)).toBe(true);
  });
});

describe('defense AI response chain', () => {
  function setup() {
    const { e, radar } = poweredRadarGame();
    const hq = hqOf(e);
    // a few defenders parked away from the intruder, with a recorded home
    const defenders: Unit[] = [];
    for (let i = 0; i < 6; i++) {
      const u = e.spawnUnit('rifleman', 'player', { x: hq.pixelX - 60 + i * 24, y: hq.pixelY + 120 });
      u.homePosition = { x: u.x, y: u.y };
      defenders.push(u);
    }
    e.tacticalIntelligence.settings.autoDefenseEnabled = true;
    e.tacticalIntelligence.settings.reserveArmyPct = 0;
    e.tacticalIntelligence.settings.defensePolicy = 'full_defense' as any;
    return { e, hq, defenders, radar };
  }

  it('assigns defenders toward a visible intruder, then regroups when the threat is gone', () => {
    const { e, hq, defenders } = setup();
    const intruder = e.spawnUnit('rifleman', 'enemy', { x: hq.pixelX + 300, y: hq.pixelY + 100 });
    if (!e.pathGrid.isPixelWalkable(intruder.x, intruder.y)) { intruder.x = hq.pixelX - 300; }
    intruder.hp = 100000; intruder.maxHp = 100000; // keep the threat alive for the response phase
    run(e, 4);
    const responding = defenders.filter(u => u.isDefendingZone || u.command === 'attack_move' || u.isAttacking);
    // eslint-disable-next-line no-console
    console.log(`[defense] responding defenders: ${responding.length}/6, threats: ${e.tacticalIntelligence.activeThreats.length}`);
    expect(e.tacticalIntelligence.activeThreats.length).toBeGreaterThan(0);
    expect(responding.length).toBeGreaterThan(0);

    // threat ends
    e.units = e.units.filter(u => u.id !== intruder.id);
    run(e, 40);
    const back = defenders.filter(u => u.homePosition && Math.hypot(u.x - u.homePosition.x, u.y - u.homePosition.y) < 80).length;
    // eslint-disable-next-line no-console
    console.log(`[defense] regrouped near home: ${back}/6`);
    expect(back).toBeGreaterThanOrEqual(4);
  });

  it('manual player orders override the automatic defense', () => {
    const { e, hq, defenders } = setup();
    const target = { x: hq.pixelX - 200, y: hq.pixelY + 220 };
    e.issueMove([defenders[0].id], target, 'spread');
    const mine = defenders[0];
    const intruder = e.spawnUnit('rifleman', 'enemy', { x: hq.pixelX + 300, y: hq.pixelY + 100 });
    if (!e.pathGrid.isPixelWalkable(intruder.x, intruder.y)) { intruder.x = hq.pixelX - 300; }
    intruder.hp = 100000; intruder.maxHp = 100000;
    run(e, 6);
    expect(mine.isDefendingZone).toBeFalsy();
    expect(Math.hypot(mine.x - mine.targetX!, mine.y - mine.targetY!) < 120 || mine.command === 'move').toBe(true);
  });
});
