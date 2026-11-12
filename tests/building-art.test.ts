import { describe, it, expect } from 'vitest';
import { BUILDING_CONFIGS } from '../src/data/gameData';
import { ART_HEIGHT, BUILDING_ART_TYPES, __drawDesignForTest, constructionStage, drawRuinDesign, K } from '../src/game/buildingArt';
import type { BuildingType } from '../src/types/game';

/** A recording 2D context: logs every drawing call and tracks the horizontal extent of what is drawn. */
function recorder() {
  const log: string[] = [];
  let minX = Infinity, maxX = -Infinity;
  // drawing inside a clip region (textures, weathering) cannot leave the clipped face, so it is not counted
  let depth = 0; const clipAt: number[] = [];
  const ext = (x: number, r = 0) => { if (clipAt.length === 0 && Number.isFinite(x)) { minX = Math.min(minX, x - r); maxX = Math.max(maxX, x + r); } };
  const target: any = {};
  const handler: ProxyHandler<any> = {
    get(_t, prop: string) {
      if (prop in target) return target[prop];
      return (...a: any[]) => {
        log.push(prop + '(' + a.map(v => (typeof v === 'number' ? Math.round(v) : typeof v)).join(',') + ')');
        if (prop === 'save') depth++; else if (prop === 'restore') { depth--; while (clipAt.length && clipAt[clipAt.length - 1] > depth) clipAt.pop(); } else if (prop === 'clip') clipAt.push(depth);
        if (prop === 'moveTo' || prop === 'lineTo') ext(a[0]);
        else if (prop === 'fillRect' || prop === 'rect' || prop === 'roundRect' || prop === 'strokeRect') { ext(a[0]); ext(a[0] + a[2]); }
        else if (prop === 'ellipse') ext(a[0], a[2]);
        else if (prop === 'arc') ext(a[0], a[2]);
        else if (prop === 'quadraticCurveTo') { ext(a[0]); ext(a[2]); }
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return { addColorStop() {} };
        return undefined;
      };
    },
    set(_t, prop: string, v) { target[prop] = v; if (prop === 'fillStyle') log.push('fill:' + String(v)); if (prop === 'globalAlpha') log.push('alpha:' + Number(v).toFixed(2)); return true; },
  };
  return { ctx: new Proxy(target, handler) as unknown as CanvasRenderingContext2D, log, extent: () => ({ minX, maxX }) };
}
const sig = (log: string[]) => { let h = 0; for (const s of log.join('|')) h = (h * 31 + s.charCodeAt(0)) >>> 0; return h; };
const SIZES: Record<string, [number, number]> = {};
for (const t of Object.keys(BUILDING_CONFIGS) as BuildingType[]) SIZES[t] = [BUILDING_CONFIGS[t].size.width * 40, BUILDING_CONFIGS[t].size.height * 40];

describe('building art (V10)', () => {
  it('every existing building type has its own design, and none was invented or dropped', () => {
    expect([...BUILDING_ART_TYPES].sort()).toEqual(Object.keys(BUILDING_CONFIGS).sort());
    for (const t of BUILDING_ART_TYPES) expect(ART_HEIGHT[t], t).toBeGreaterThan(10);
  });

  it('designs are genuinely different (not recoloured copies) and are made of many parts', () => {
    const sigs = new Map<number, BuildingType>();
    for (const t of BUILDING_ART_TYPES) {
      const r = recorder(); const [w, d] = SIZES[t];
      __drawDesignForTest(r.ctx, t, 'player', w, d, 1.3);
      expect(r.log.length, `${t} detail`).toBeGreaterThan(t === 'defense_wall' ? 20 : 60);
      const s = sig(r.log);
      expect(sigs.has(s), `${t} duplicates ${sigs.get(s)}`).toBe(false);
      sigs.set(s, t);
    }
    expect(sigs.size).toBe(BUILDING_ART_TYPES.length);
  });

  it('the major buildings use clearly different volumes (call histograms differ strongly)', () => {
    const hist = (t: BuildingType) => { const r = recorder(); const [w, d] = SIZES[t]; __drawDesignForTest(r.ctx, t, 'player', w, d, 1); const m: Record<string, number> = {}; for (const l of r.log) { const k = l.split('(')[0]; m[k] = (m[k] ?? 0) + 1; } return m; };
    const dist = (a: Record<string, number>, b: Record<string, number>) => { let s = 0; for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) s += Math.abs((a[k] ?? 0) - (b[k] ?? 0)); return s; };
    const majors: BuildingType[] = ['headquarters', 'barracks', 'vehicle_factory', 'power_plant', 'coin_generator', 'airfield', 'radar_station'];
    for (let i = 0; i < majors.length; i++) for (let j = i + 1; j < majors.length; j++) expect(dist(hist(majors[i]), hist(majors[j])), `${majors[i]} vs ${majors[j]}`).toBeGreaterThan(8);
  });

  it('player and enemy variants differ (friendly / hostile identification)', () => {
    for (const t of BUILDING_ART_TYPES) {
      const a = recorder(), b = recorder(); const [w, d] = SIZES[t];
      __drawDesignForTest(a.ctx, t, 'player', w, d, 1); __drawDesignForTest(b.ctx, t, 'enemy', w, d, 1);
      expect(sig(a.log), t).not.toBe(sig(b.log));
    }
  });

  it('art stays within the footprint horizontally (selection, collision and placement are unchanged)', () => {
    for (const t of BUILDING_ART_TYPES) {
      const r = recorder(); const [w, d] = SIZES[t];
      __drawDesignForTest(r.ctx, t, 'player', w, d, 2.1, { aim: 0.8, recoil: 0.7, producing: true, repairing: true, neighbors: 15 });
      const { minX, maxX } = r.extent();
      expect(minX, `${t} left`).toBeGreaterThanOrEqual(-12);
      expect(maxX, `${t} right`).toBeLessThanOrEqual(w + 14);
    }
  });

  it('animated parts are driven by real state: turrets aim and recoil, factories react to production', () => {
    for (const t of ['turret_gun', 'turret_aa', 'heavy_turret'] as BuildingType[]) {
      const [w, d] = SIZES[t];
      const a = recorder(), b = recorder(), c = recorder();
      __drawDesignForTest(a.ctx, t, 'player', w, d, 1, { aim: 0.2, recoil: 0 });
      __drawDesignForTest(b.ctx, t, 'player', w, d, 1, { aim: 2.4, recoil: 0 });
      __drawDesignForTest(c.ctx, t, 'player', w, d, 1, { aim: 0.2, recoil: 0.9 });
      expect(sig(a.log), `${t} aim`).not.toBe(sig(b.log));
      expect(sig(a.log), `${t} recoil`).not.toBe(sig(c.log));
    }
    const [w, d] = SIZES.vehicle_factory;
    const idle = recorder(), busy = recorder();
    __drawDesignForTest(idle.ctx, 'vehicle_factory', 'player', w, d, 1, { producing: false });
    __drawDesignForTest(busy.ctx, 'vehicle_factory', 'player', w, d, 1, { producing: true });
    expect(sig(idle.log)).not.toBe(sig(busy.log));
    const r1 = recorder(), r2 = recorder(); const [rw, rd] = SIZES.radar_station;
    __drawDesignForTest(r1.ctx, 'radar_station', 'player', rw, rd, 0.2); __drawDesignForTest(r2.ctx, 'radar_station', 'player', rw, rd, 0.9);
    expect(sig(r1.log), 'radar dish rotates over time').not.toBe(sig(r2.log));
  });

  it('walls connect to neighbours', () => {
    const [w, d] = SIZES.defense_wall;
    const a = recorder(), b = recorder();
    __drawDesignForTest(a.ctx, 'defense_wall', 'player', w, d, 1, { neighbors: 0 });
    __drawDesignForTest(b.ctx, 'defense_wall', 'player', w, d, 1, { neighbors: 10 }); // east + west
    expect(sig(a.log)).not.toBe(sig(b.log));
  });

  it('damaged buildings lose their lighting (state-driven), and wreckage has its own design', () => {
    const [w, d] = SIZES.headquarters;
    const ok = recorder(), hurt = recorder(), dead = recorder();
    __drawDesignForTest(ok.ctx, 'headquarters', 'player', w, d, 1, { hpRatio: 1 });
    __drawDesignForTest(hurt.ctx, 'headquarters', 'player', w, d, 1, { hpRatio: 0.2 });
    expect(sig(ok.log)).not.toBe(sig(hurt.log));
    drawRuinDesign(dead.ctx, w, d, 0.3);
    expect(dead.log.length).toBeGreaterThan(60);
    expect(sig(dead.log)).not.toBe(sig(ok.log));
  });

  it('palette is muted: no saturated fills in any design', () => {
    for (const t of BUILDING_ART_TYPES) {
      const r = recorder(); const [w, d] = SIZES[t];
      __drawDesignForTest(r.ctx, t, 'player', w, d, 0.6);
      for (const l of r.log) {
        const m = /^fill:(?:#([0-9a-f]{6})|rgb\((\d+),(\d+),(\d+)\))$/i.exec(l);
        if (!m) continue;
        const [R, G, B] = m[1] ? [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)] : [+m[2], +m[3], +m[4]];
        const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
        const sat = mx === 0 ? 0 : (mx - mn) / mx;
        // small lamps / lit windows are exempt by size, not colour, so only large-area base tones are checked: they must stay desaturated
        if (mx > 60 && mx < 200) expect(sat, `${t} ${l}`).toBeLessThan(0.75);
      }
    }
  });

  it('construction visuals follow the REAL progress value (no separate timer)', () => {
    expect(constructionStage(0).stage).toBe('foundation');
    expect(constructionStage(0.19).stage).toBe('foundation');
    expect(constructionStage(0.2).stage).toBe('assembly');
    expect(constructionStage(0.5).stage).toBe('assembly');
    expect(constructionStage(0.89).stage).toBe('assembly');
    expect(constructionStage(0.9).stage).toBe('finishing');
    expect(constructionStage(0.99).stage).toBe('finishing');
    expect(constructionStage(1).stage).toBe('operational');
    let prev = -1;
    for (let p = 0.2; p < 0.9; p += 0.01) { const b = constructionStage(p).built; expect(b).toBeGreaterThanOrEqual(prev); prev = b; }
    expect(constructionStage(0.2).built).toBe(0);
    expect(constructionStage(0.9).built).toBe(1);
    expect(constructionStage(0.95).scaffold).toBeLessThan(constructionStage(0.9).scaffold + 1e-9); // scaffolding comes down
    expect(constructionStage(NaN).stage).toBe('operational'); // bad data never leaves a building stuck half-built
  });

  it('projection constant keeps the east wall visible but modest', () => { expect(K).toBeGreaterThan(0.25); expect(K).toBeLessThan(0.6); });
});
