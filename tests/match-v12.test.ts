import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/audio/soundEngine', () => ({ soundEngine: new Proxy({}, { get: () => () => {} }) }));

import { GameEngine } from '../src/game/engine';

const step = (e: GameEngine, sec: number) => { for (let i = 0; i < sec * 20; i++) e.update(0.05); };
const hq = (e: GameEngine, f: 'player' | 'enemy') => e.buildings.find(b => b.type === 'headquarters' && b.faction === f);
function mk(cond?: 'annihilation' | 'destroy_hq') {
  const e = new GameEngine('skirmish', 'normal', 'verdant_valley', undefined, cond ? { victoryCondition: cond } : undefined);
  (e as any).ai.update = () => {};
  e.nextWaveTimer = 1e9;
  return e;
}
const finish = (e: GameEngine) => step(e, GameEngine.END_SEQUENCE_SECONDS + 0.5);

describe('V12 match state machine', () => {
  it('starts PREPARING and becomes PLAYING on the first simulation step', () => {
    const e = mk();
    expect(e.matchPhase).toBe('preparing');
    e.update(0.05);
    expect(e.matchPhase).toBe('playing');
    expect(e.victoryCondition).toBe('destroy_hq'); // default skirmish rule
  });

  it('friendly troops destroy the enemy HQ through real combat -> VICTORY -> RESULTS, decided once', () => {
    const e = mk();
    const ehq = hq(e, 'enemy')!;
    e.units = e.units.filter(u => u.faction === 'player');
    const ids: string[] = [];
    for (let i = 0; i < 8; i++) ids.push(e.spawnUnit('heavy_tank', 'player', { x: ehq.pixelX - 200 + (i % 4) * 30, y: ehq.pixelY + 160 + Math.floor(i / 4) * 30 }).id);
    e.update(0.05);
    e.issueAttack(ids, undefined, ehq.id);
    const hp0 = ehq.hp;
    let t = 0;
    while (e.matchPhase === 'playing' && t < 240) { step(e, 1); t++; }
    expect(ehq.hp).toBeLessThan(hp0);
    expect(hq(e, 'enemy')).toBeUndefined();                 // removed by the engine's own building update
    expect(e.gameStatus).toBe('victory');
    expect(e.matchPhase).toBe('victory');                    // destruction sequence
    expect(e.matchEnd!.reason).toBe('ENEMY HEADQUARTERS DESTROYED');
    expect(e.consumeMatchOutcome()).toBeNull();              // not before the sequence ends
    finish(e);
    expect(e.matchPhase).toBe('results');
    expect(e.consumeMatchOutcome()?.outcome).toBe('victory');
    expect(e.consumeMatchOutcome()).toBeNull();              // exactly once
    expect(e.matchStats.damageDealt).toBeGreaterThan(hp0 * 0.5);
    expect(e.matchStats.enemyBuildingsDestroyed).toBeGreaterThanOrEqual(1);
    const t0 = e.gameTime; step(e, 2);
    expect(e.gameTime).toBe(t0);                             // simulation frozen on RESULTS
  });

  it('enemy recruitment, construction, orders and shots are cancelled when the enemy HQ falls', () => {
    const e = mk();
    const fac = e.buildings.find(b => b.faction === 'enemy' && b.type !== 'headquarters' && b.constructionProgress >= 1);
    if (fac) fac.productionQueue = [{ unitType: 'rifleman', progress: 0, totalTime: 10 }];
    const en = e.spawnUnit('rifleman', 'enemy', { x: 500, y: 500 }); en.path = [{ x: 900, y: 900 }]; en.command = 'attack_move';
    e.update(0.05);
    hq(e, 'enemy')!.hp = 0;
    e.update(0.05); e.update(0.05);
    expect(e.gameStatus).toBe('victory');
    if (fac) expect(fac.productionQueue.length).toBe(0);
    expect(en.path.length).toBe(0);
    expect(en.stance).toBe('hold_fire');
    expect(e.projectiles.some(p => p.faction === 'enemy')).toBe(false);
    const n = e.units.filter(u => u.faction === 'enemy').length;
    finish(e);
    expect(e.units.filter(u => u.faction === 'enemy').length).toBe(n); // nothing new was recruited
  });

  it('losing the player HQ -> DEFEAT even with troops alive', () => {
    const e = mk();
    e.update(0.05);
    expect(e.units.some(u => u.faction === 'player')).toBe(true);
    hq(e, 'player')!.hp = 0;
    e.update(0.05); e.update(0.05);
    expect(e.gameStatus).toBe('defeat');
    expect(e.matchEnd!.reason).toBe('YOUR HEADQUARTERS HAS FALLEN');
    finish(e);
    expect(e.consumeMatchOutcome()?.outcome).toBe('defeat');
  });

  it('both HQs destroyed in the same step: exactly one outcome (DEFEAT), never both', () => {
    const e = mk();
    e.update(0.05);
    hq(e, 'player')!.hp = 0; hq(e, 'enemy')!.hp = 0;
    e.update(0.05); e.update(0.05);
    expect(e.gameStatus).toBe('defeat');
    finish(e);
    expect(e.gameStatus).toBe('defeat');
    expect(e.consumeMatchOutcome()?.outcome).toBe('defeat');
    expect(e.consumeMatchOutcome()).toBeNull();
  });

  it('after the outcome the battlefield is read-only (commands, construction, recruitment refused)', () => {
    const e = mk();
    e.update(0.05);
    hq(e, 'enemy')!.hp = 0;
    e.update(0.05); e.update(0.05);
    const u = e.units.find(x => x.faction === 'player')!;
    e.issueMove([u.id], { x: u.x + 300, y: u.y });
    expect(u.path.length).toBe(0);
    expect(e.autoPlaceBuilding('power_plant')).toBeNull();
    const bar = e.buildings.find(b => b.faction === 'player' && b.type === 'barracks' && b.constructionProgress >= 1);
    if (bar) expect(e.queueUnitProduction(bar.id, 'rifleman')).toBe(false);
  });

  it('the configured annihilation rule still needs the enemy army gone as well', () => {
    const e = mk('annihilation');
    e.update(0.05);
    hq(e, 'enemy')!.hp = 0;
    e.spawnUnit('rifleman', 'enemy', { x: 300, y: 300 });
    step(e, 0.2);
    expect(e.gameStatus).toBe('playing');
    e.units.filter(u => u.faction === 'enemy').forEach(u => (u.hp = 0));
    step(e, 0.2);
    expect(e.gameStatus).toBe('victory');
  });

  it('restart (new engine) returns to a valid initial state', () => {
    const e = mk();
    e.update(0.05); hq(e, 'enemy')!.hp = 0; e.update(0.05); e.update(0.05); finish(e);
    const r = new GameEngine(e.mode, e.difficulty, e.mapData.id);
    expect(r.matchPhase).toBe('preparing');
    expect(r.matchEnd).toBeNull();
    expect(r.gameStatus).toBe('playing');
    expect(hq(r, 'enemy')).toBeDefined();
    expect(hq(r, 'player')).toBeDefined();
    expect(r.matchStats.enemyUnitsKilled).toBe(0);
  });

  it('save/load keeps the victory rule and statistics and resumes PLAYING', () => {
    const e = mk('annihilation');
    e.update(0.05);
    e.matchStats.enemyUnitsKilled = 7;
    const save = e.exportSaveData('t', 't');
    const f = mk();
    f.update(0.05); hq(f, 'player')!.hp = 0; f.update(0.05); f.update(0.05);   // a finished match loading a save
    expect(f.importSaveData(save)).toBe(true);
    expect(f.matchPhase).toBe('playing');
    expect(f.gameStatus).toBe('playing');
    expect(f.victoryCondition).toBe('annihilation');
    expect(f.matchStats.enemyUnitsKilled).toBe(7);
  });

  it('unit losses on both sides are counted', () => {
    const e = mk();
    e.update(0.05);
    e.spawnUnit('rifleman', 'enemy', { x: 300, y: 300 }).hp = 0;
    e.units.find(u => u.faction === 'player')!.hp = 0;
    e.update(0.05);
    expect(e.matchStats.enemyUnitsKilled).toBe(1);
    expect(e.matchStats.friendlyUnitsLost).toBe(1);
  });
});
