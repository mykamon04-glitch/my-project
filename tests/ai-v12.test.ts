import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/audio/soundEngine', () => ({ soundEngine: new Proxy({}, { get: () => () => {} }) }));

import { GameEngine } from '../src/game/engine';

const step = (e: GameEngine, s: number) => { for (let i = 0; i < s * 20; i++) e.update(0.05); };
function setup() {
  const e = new GameEngine('skirmish', 'normal'); e.nextWaveTimer = 1e9;
  const hq = e.buildings.find(b => b.faction === 'enemy' && b.type === 'headquarters')!;
  e.units = e.units.filter(u => u.faction === 'player');
  return { e, hq };
}

describe('V12 enemy AI base defence', () => {
  it('reacts to its HQ being shelled from outside the threat radius and moves on the attacker', () => {
    const { e, hq } = setup();
    const def = [0, 1, 2, 3].map(i => e.spawnUnit('rifleman', 'enemy', { x: hq.pixelX + 60 + i * 20, y: hq.pixelY + 80 }));
    const art = e.spawnUnit('artillery', 'player', { x: hq.pixelX - 500, y: hq.pixelY + 60 });
    art.targetBuildingId = hq.id; art.command = 'attack';
    const before = def.map(u => Math.hypot(u.x - art.x, u.y - art.y));
    step(e, 12);
    expect(hq.hp).toBeLessThan(hq.maxHp);
    const after = def.filter(u => u.hp > 0).map(u => Math.hypot(u.x - art.x, u.y - art.y));
    expect(Math.max(...after)).toBeLessThan(Math.min(...before) - 200);
  });

  it('defends a raided refinery with part of the army, leaving the rest', () => {
    const { e, hq } = setup();
    let ref = null as ReturnType<GameEngine['placeBuilding']>;
    for (const [dx, dy] of [[-8, 4], [-8, -4], [6, 6], [-10, 8], [4, -8]]) { ref = e.placeBuilding('coin_generator', hq.x + dx, hq.y + dy, 'enemy'); if (ref) break; }
    expect(ref).not.toBeNull();
    ref!.constructionProgress = 1; ref!.isUnderConstruction = false;
    const army = [0, 1, 2, 3, 4, 5].map(i => e.spawnUnit('rifleman', 'enemy', { x: hq.pixelX - 120 + i * 18, y: hq.pixelY + 120 }));
    const raider = e.spawnUnit('light_tank', 'player', { x: ref!.pixelX + 260, y: ref!.pixelY + 260 });
    raider.targetBuildingId = ref!.id; raider.command = 'attack';
    step(e, 8);
    expect(ref!.hp).toBeLessThan(ref!.maxHp);
    const responding = army.filter(u => u.hp > 0 && Math.hypot(u.x - raider.x, u.y - raider.y) < Math.hypot(hq.pixelX - raider.x, hq.pixelY - raider.y) - 100);
    expect(responding.length).toBeGreaterThan(0);
  });
});
