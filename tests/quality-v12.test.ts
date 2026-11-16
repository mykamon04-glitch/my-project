import { describe, it, expect } from 'vitest';
import { AutoQuality } from '../src/game/renderQuality';

const feed = (a: AutoQuality, fps: number, seconds: number) => {
  const out: string[] = [];
  for (let t = 0; t < seconds * fps; t++) { const r = a.sample(1000 / fps); if (r) out.push(r); }
  return out;
};

describe('V12 Auto graphics preset', () => {
  it('steps down while the measured frame rate stays low, one level per window, never below Performance', () => {
    const a = new AutoQuality('ultra');
    expect(feed(a, 25, 12)).toEqual(['high', 'medium', 'low']);
    expect(a.level).toBe('low');
  });
  it('steps back up only after sustained headroom, and never above High', () => {
    const a = new AutoQuality('low');
    expect(feed(a, 60, 9)).toEqual([]);
    expect(feed(a, 60, 25)).toEqual(['medium', 'high']);
    expect(feed(a, 60, 30)).toEqual([]);
  });
  it('ignores stalls (tab switches) and respects a frame-rate cap', () => {
    const a = new AutoQuality('high', 30 * 0.63, 30 * 0.93, 30);
    expect(a.sample(5000)).toBeNull();
    expect(feed(a, 30, 20)).toEqual([]); // 30 fps is "full speed" under a 30 fps cap
  });
});
