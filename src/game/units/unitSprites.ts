/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LayerKey, LayerSprite, Quality, layerKeyString, renderLayer } from './models';

/**
 * Run-time sprite cache for unit art (V11).
 *
 * Unit sprites are rendered from the 3D models on demand, the first time a (type, faction, facing, frame) is needed, and
 * then reused by every unit that shows the same pose. Two limits keep this safe on phones:
 *   - a per-frame time budget for new sprites (a pose that is not ready yet is simply drawn one or two frames later);
 *   - a pixel budget: least-recently-used sprites are dropped when the cache is full.
 */

export type DetailLevel = 'low' | 'medium' | 'high' | 'ultra';

export interface DetailPreset {
  quality: Quality;
  bodyDirs: number;      // facings for vehicle hulls and aircraft
  turretDirs: number;    // facings for turrets
  maxPixels: number;     // cache budget (pixels; 4 bytes each)
  budgetMs: number;      // sprite generation time allowed per frame
}

export const DETAIL: Record<DetailLevel, DetailPreset> = {
  low:    { quality: { texel: 2, ss: 2 },   bodyDirs: 16, turretDirs: 16, maxPixels: 6e6,  budgetMs: 3 },
  medium: { quality: { texel: 2.5, ss: 2 }, bodyDirs: 24, turretDirs: 24, maxPixels: 10e6, budgetMs: 4 },
  high:   { quality: { texel: 3, ss: 2 },   bodyDirs: 32, turretDirs: 32, maxPixels: 16e6, budgetMs: 5 },
  ultra:  { quality: { texel: 4, ss: 2 },   bodyDirs: 32, turretDirs: 32, maxPixels: 26e6, budgetMs: 6 },
};

export interface SpriteEntry {
  img: CanvasImageSource;
  w: number; h: number;          // sprite pixels
  ox: number; oy: number;        // world-px offset of the sprite's top-left corner from the unit origin
  ww: number; wh: number;        // world-px size
  marks: Record<string, [number, number]>;
  used: number;
}

type ToImage = (spr: LayerSprite) => CanvasImageSource;

const domImage: ToImage = spr => {
  const c = document.createElement('canvas');
  c.width = spr.w; c.height = spr.h;
  const g = c.getContext('2d')!;
  const id = g.createImageData(spr.w, spr.h);
  id.data.set(spr.data);
  g.putImageData(id, 0, 0);
  return c;
};

export class UnitSpriteCache {
  private map = new Map<string, SpriteEntry>();
  private pixels = 0;
  private frame = 0;
  private spent = 0;
  private budget = 5;
  private level: DetailLevel = 'high';
  private now: () => number;
  /** statistics, for the debug overlay and tests */
  public stats = { generated: 0, deferred: 0, evicted: 0, genMs: 0 };

  constructor(private toImage: ToImage = domImage, now?: () => number) {
    this.now = now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  }

  get preset(): DetailPreset { return DETAIL[this.level]; }
  get detail(): DetailLevel { return this.level; }
  get size(): number { return this.map.size; }
  get pixelCount(): number { return this.pixels; }

  /** Switch detail level. Sprites of another level are useless, so the cache is emptied. */
  setDetail(level: DetailLevel) {
    if (level === this.level) return;
    this.level = level;
    this.clear();
  }

  clear() { this.map.clear(); this.pixels = 0; }

  /** Start a frame. `boost` lifts the generation budget (used while the cache is still cold, e.g. right after loading). */
  beginFrame(boost = 1) {
    this.frame++;
    this.spent = 0;
    this.budget = this.preset.budgetMs * boost;
  }

  /** Cached sprite or null; never generates. */
  peek(k: LayerKey): SpriteEntry | null {
    const e = this.map.get(layerKeyString(k));
    if (e) e.used = this.frame;
    return e ?? null;
  }

  /**
   * Sprite for a layer. Generates it if this frame's time budget allows (always when `must` is set);
   * otherwise returns null and the caller keeps showing what it showed before.
   */
  get(k: LayerKey, must = false): SpriteEntry | null {
    const key = layerKeyString(k);
    const hit = this.map.get(key);
    if (hit) { hit.used = this.frame; return hit; }
    if (!must && this.spent >= this.budget) { this.stats.deferred++; return null; }
    const t0 = this.now();
    const spr = renderLayer(k, this.preset.quality);
    const e: SpriteEntry = {
      img: this.toImage(spr), w: spr.w, h: spr.h,
      ox: -spr.ax, oy: -spr.ay, ww: spr.w / spr.texel, wh: spr.h / spr.texel, // anchors are already world px
      marks: spr.marks, used: this.frame,
    };
    const ms = this.now() - t0;
    this.spent += ms; this.stats.genMs += ms; this.stats.generated++;
    this.map.set(key, e);
    this.pixels += spr.w * spr.h;
    if (this.pixels > this.preset.maxPixels) this.evict();
    return e;
  }

  private evict() {
    const target = this.preset.maxPixels * 0.8;
    const entries = [...this.map.entries()].sort((a, b) => a[1].used - b[1].used);
    for (const [key, e] of entries) {
      if (this.pixels <= target || e.used === this.frame) break;
      this.map.delete(key);
      this.pixels -= e.w * e.h;
      this.stats.evicted++;
    }
  }
}
