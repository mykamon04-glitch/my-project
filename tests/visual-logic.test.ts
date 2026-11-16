import { describe, it, expect } from 'vitest';
import { clampShare, compositionTotal, normalizeComposition, DEFAULT_COMPOSITION } from '../src/game/smartRecruitment';
import { fbm, groundColorAt } from '../src/game/groundTexture';

describe('Smart Recruitment composition validation', () => {
  it('normalizeComposition totals exactly 100 and keeps the ratios', () => {
    const cases = [
      { infantryPct: 30, armorPct: 35, antiAirPct: 15, artilleryPct: 10, supportPct: 10 }, // already 100
      { infantryPct: 60, armorPct: 60, antiAirPct: 0, artilleryPct: 0, supportPct: 0 },     // over
      { infantryPct: 10, armorPct: 10, antiAirPct: 10, artilleryPct: 5, supportPct: 5 },     // under
      { infantryPct: 33, armorPct: 33, antiAirPct: 33, artilleryPct: 0, supportPct: 0 },     // rounding case
      { infantryPct: 1, armorPct: 1, antiAirPct: 1, artilleryPct: 1, supportPct: 1 },
    ];
    for (const c of cases) {
      const n = normalizeComposition(c);
      expect(compositionTotal(n)).toBe(100);
      for (const v of Object.values(n)) expect(Number.isInteger(v) && v >= 0).toBe(true);
      const t = compositionTotal(c);
      // each share stays within 1 point of its exact proportion
      expect(Math.abs(n.infantryPct - (c.infantryPct / t) * 100)).toBeLessThanOrEqual(1);
      expect(Math.abs(n.armorPct - (c.armorPct / t) * 100)).toBeLessThanOrEqual(1);
    }
    expect(normalizeComposition({ infantryPct: 60, armorPct: 60, antiAirPct: 0, artilleryPct: 0, supportPct: 0 })).toMatchObject({ infantryPct: 50, armorPct: 50 });
  });

  it('handles empty and invalid input safely', () => {
    expect(normalizeComposition({ infantryPct: 0, armorPct: 0, antiAirPct: 0, artilleryPct: 0, supportPct: 0 })).toEqual(DEFAULT_COMPOSITION);
    const weird = normalizeComposition({ infantryPct: NaN, armorPct: -20, antiAirPct: 40, artilleryPct: 40, supportPct: 0 });
    expect(compositionTotal(weird)).toBe(100);
    expect(weird.armorPct).toBe(0);
    expect(clampShare(NaN)).toBe(0);
    expect(clampShare(-5)).toBe(0);
    expect(clampShare(250)).toBe(100);
    expect(clampShare(12.6)).toBe(13);
  });
});

describe('natural ground colour field', () => {
  const lum = (c: [number, number, number]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

  it('is deterministic', () => {
    expect(groundColorAt(1234, 987)).toEqual(groundColorAt(1234, 987));
    expect(fbm(3.3, 4.4, 1)).toBe(fbm(3.3, 4.4, 1));
  });

  it('is smooth: a gentle gradient, never a step (no stair-stepped squares)', () => {
    // Texels are 10 world-px apart and the renderer scales them with bilinear smoothing, so the visible change
    // per world pixel is (texel difference / 10). Under 0.5 levels per pixel can never read as a banding edge,
    // whereas the original's per-tile rounding changed 2-5 levels within a single pixel at every tile border.
    let worst = 0;
    for (let y = 0; y < 3000; y += 10) for (let x = 0; x < 3000; x += 10) {
      const a = groundColorAt(x, y), b = groundColorAt(x + 10, y), c = groundColorAt(x, y + 10);
      worst = Math.max(worst, Math.abs(lum(a) - lum(b)), Math.abs(lum(a) - lum(c)));
    }
    expect(worst / 10).toBeLessThan(0.5);
  });

  it('is naturally varied but muted so units keep contrast', () => {
    const ls: number[] = [];
    let maxChannel = 0;
    for (let y = 0; y < 4000; y += 40) for (let x = 0; x < 4000; x += 40) {
      const c = groundColorAt(x, y);
      ls.push(lum(c));
      maxChannel = Math.max(maxChannel, ...c);
    }
    const mean = ls.reduce((a, b) => a + b, 0) / ls.length;
    const sd = Math.sqrt(ls.reduce((a, b) => a + (b - mean) ** 2, 0) / ls.length);
    expect(sd).toBeGreaterThan(1.2);   // real variation, not one flat colour
    expect(mean).toBeLessThan(60);     // dark, muted ground (not bright / saturated)
    expect(maxChannel).toBeLessThan(110);
  });

  it('does not repeat on a tile grid', () => {
    // colours one tile (40px) apart are not systematically equal -> no visible tiling period
    let same = 0, n = 0;
    for (let y = 0; y < 2000; y += 40) for (let x = 0; x < 2000; x += 40) {
      n++;
      const a = groundColorAt(x, y), b = groundColorAt(x + 400, y + 400);
      if (a[0] === b[0] && a[1] === b[1] && a[2] === b[2]) same++;
    }
    expect(same / n).toBeLessThan(0.05);
  });
});
