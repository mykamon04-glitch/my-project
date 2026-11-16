/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MapData } from '../../types/game';
import { TerrainSampler, bakeTerrain } from './terrain';

/**
 * In-game terrain layer for V14 maps.
 *  - overview: the whole map (plus an apron beyond the edges) baked once at 8 px per texel, drawn first, so the ground is
 *    never missing and the edges never show black;
 *  - detail chunks (160 world px) baked lazily at 2-4 px per texel (by quality), within a per-frame time budget,
 *    visible chunks first; least-recently-used chunks are dropped beyond a memory cap.
 */
const CHUNK = 160;
const APRON = 480;          // world px of terrain drawn beyond the map edges
const OVERVIEW_TEXEL = 8;

export class TerrainLayer {
  private map: MapData | null = null;
  private sampler: TerrainSampler | null = null;
  private overview: HTMLCanvasElement | null = null;
  private chunks = new Map<number, HTMLCanvasElement>();
  private texel = 2;
  stats = { baked: 0, ms: 0 };

  private key = (cx: number, cy: number) => ((cx + 2048) << 12) | (cy + 2048);

  private setup(map: MapData, texel: number) {
    if (this.map === map && this.texel === texel) return;
    if (this.map !== map) {
      this.map = map;
      this.sampler = new TerrainSampler(map);
      this.overview = null;
    }
    this.texel = texel;
    this.chunks.clear();
  }

  private canvasFrom(data: Uint8ClampedArray, w: number, h: number): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d')!;
    const im = g.createImageData(w, h);
    im.data.set(data);
    g.putImageData(im, 0, 0);
    return c;
  }

  private buildOverview() {
    const m = this.map!, W = m.width * m.tileSize + APRON * 2, H = m.height * m.tileSize + APRON * 2;
    const w = Math.ceil(W / OVERVIEW_TEXEL), h = Math.ceil(H / OVERVIEW_TEXEL);
    this.overview = this.canvasFrom(bakeTerrain(this.sampler!, -APRON, -APRON, W, H, OVERVIEW_TEXEL), w, h);
  }

  /**
   * Draw the terrain for the visible world rectangle. `budgetMs` limits detail baking this frame.
   * Returns true when every visible chunk was drawn at full detail.
   */
  draw(ctx: CanvasRenderingContext2D, map: MapData, view: { x0: number; y0: number; x1: number; y1: number }, quality: string, budgetMs = 5): boolean {
    const texel = quality === 'low' ? 4 : quality === 'medium' ? 3 : 2;
    this.setup(map, texel);
    if (!this.overview) this.buildOverview();
    const ov = this.overview!;
    // overview, only the visible part
    const ox0 = Math.max(-APRON, view.x0), oy0 = Math.max(-APRON, view.y0);
    const ox1 = Math.min(map.width * map.tileSize + APRON, view.x1), oy1 = Math.min(map.height * map.tileSize + APRON, view.y1);
    if (ox1 > ox0 && oy1 > oy0) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(ov, (ox0 + APRON) / OVERVIEW_TEXEL, (oy0 + APRON) / OVERVIEW_TEXEL, (ox1 - ox0) / OVERVIEW_TEXEL, (oy1 - oy0) / OVERVIEW_TEXEL, ox0, oy0, ox1 - ox0, oy1 - oy0);
    }
    // detail chunks (visible ones, nearest the view centre first)
    const cx0 = Math.floor(Math.max(-APRON, view.x0) / CHUNK), cx1 = Math.floor((Math.min(map.width * map.tileSize + APRON, view.x1) - 1) / CHUNK);
    const cy0 = Math.floor(Math.max(-APRON, view.y0) / CHUNK), cy1 = Math.floor((Math.min(map.height * map.tileSize + APRON, view.y1) - 1) / CHUNK);
    const mx = (cx0 + cx1) / 2, my = (cy0 + cy1) / 2;
    const order: [number, number][] = [];
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) order.push([cx, cy]);
    order.sort((a, b) => Math.hypot(a[0] - mx, a[1] - my) - Math.hypot(b[0] - mx, b[1] - my));
    const t0 = performance.now();
    let complete = true;
    const n = CHUNK / texel;
    for (const [cx, cy] of order) {
      const k = this.key(cx, cy);
      let c = this.chunks.get(k);
      if (!c) {
        if (performance.now() - t0 > budgetMs) { complete = false; continue; }
        const s = performance.now();
        c = this.canvasFrom(bakeTerrain(this.sampler!, cx * CHUNK, cy * CHUNK, CHUNK, CHUNK, texel), n, n);
        this.stats.baked++; this.stats.ms += performance.now() - s;
        this.chunks.set(k, c);
      } else { this.chunks.delete(k); this.chunks.set(k, c); }
      // +0.5 px overlap hides seams at fractional zoom
      ctx.drawImage(c, cx * CHUNK, cy * CHUNK, CHUNK + 0.5, CHUNK + 0.5);
    }
    const cap = Math.max(420, order.length + 40);
    while (this.chunks.size > cap) this.chunks.delete(this.chunks.keys().next().value as number);
    return complete;
  }
}
