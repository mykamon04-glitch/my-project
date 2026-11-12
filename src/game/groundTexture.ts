/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Natural ground layer for the temperate biome.
 *
 * The original drew each 40px tile with one flat HSL colour rounded to whole percentages, which shows up as
 * stair-stepped squares. This builds a smooth, deterministic colour field (large patches + medium variation +
 * fine grain, muted so units stay readable) once per map, and the renderer draws it as one scaled image.
 * Purely visual: it never touches tiles, collision or pathfinding.
 */

// ── deterministic value noise ───────────────────────────────────────────────
function hash(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 2147483647)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const smooth = (t: number) => t * t * (3 - 2 * t);

export function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed), c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
  const u = smooth(xf), v = smooth(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x: number, y: number, seed: number, octaves = 3): number {
  let sum = 0, amp = 0.5, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, y * freq, seed + i * 17) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return sum / norm;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/**
 * Ground colour at a world position (in pixels). Muted forest greens that drift toward olive and dry-earth tones
 * in patches; lightness stays in a narrow, dark band so tanks, infantry and buildings keep their contrast.
 */
export function groundColorAt(wx: number, wy: number, seed = 1337): [number, number, number] {
  const big = fbm(wx / 900, wy / 900, seed, 3);          // continent-scale patches
  const mid = fbm(wx / 260, wy / 260, seed + 101, 3);    // meadows / clearings
  const fine = fbm(wx / 70, wy / 70, seed + 211, 2);     // grain
  const dry = Math.max(0, Math.min(1, (mid - 0.58) / 0.2)); // dry, olive/earth patches
  const damp = Math.max(0, Math.min(1, (0.42 - mid) / 0.2)); // darker, damper hollows

  // V10.1: muted olive grassland drifting to dry earth, slightly lighter and less saturated than before so the terrain reads as
  // real ground under daylight rather than a dark green backdrop.
  const hue = 96 + (big - 0.5) * 26 - dry * 50 + damp * 10;
  const sat = 19 + (big - 0.5) * 6 - dry * 3 + damp * 3;
  const light = 19.5 + (big - 0.5) * 5.0 + (mid - 0.5) * 5.0 + (fine - 0.5) * 2.8 + dry * 3.2 - damp * 2.4;
  return hslToRgb(hue, sat, light);
}

// ── chunked cache ───────────────────────────────────────────────────────────
/** Chunk edge in tiles. 12 x 40px = 480px, so every 40px tile lies wholly inside one chunk. */
export const GROUND_CHUNK_TILES = 12;
const TEXEL_PX = 10; // 4 texels per 40px tile; bilinear scaling smooths the rest

/**
 * One ground chunk: `size` x `size` world pixels starting at (wx0, wy0), rendered once from the colour function.
 * Colour is sampled on a coarse texel grid with a one-texel margin on every side, so bilinear scaling uses the true
 * neighbouring values at the chunk border and adjacent chunks join without a seam. Chunks are computed straight
 * from the noise function, so the ground extends seamlessly in any direction (including beyond the map edge).
 */
export function buildGroundChunk(wx0: number, wy0: number, size: number, seed = 1337): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const n = Math.round(size / TEXEL_PX) + 2;
  const src = document.createElement('canvas');
  src.width = n;
  src.height = n;
  const sctx = src.getContext('2d');
  if (!sctx) return null;
  const img = sctx.createImageData(n, n);
  const d = img.data;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const [r, g, b] = groundColorAt(wx0 - TEXEL_PX + (i + 0.5) * TEXEL_PX, wy0 - TEXEL_PX + (j + 0.5) * TEXEL_PX, seed);
      const o = (j * n + i) * 4;
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
  }
  sctx.putImageData(img, 0, 0);

  const out = document.createElement('canvas');
  out.width = size;
  out.height = size;
  const octx = out.getContext('2d');
  if (!octx) return null;
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(src, 1, 1, size / TEXEL_PX, size / TEXEL_PX, 0, 0, size, size);
  // micro-texture: fine grain plus sparse grass tufts / pebbles, so the ground is not a smooth gradient (once per chunk)
  try {
    const im = octx.getImageData(0, 0, size, size), px = im.data;
    let h = (Math.imul(wx0 | 0, 73856093) ^ Math.imul(wy0 | 0, 19349663) ^ seed) >>> 0;
    for (let i = 0; i < px.length; i += 4) {
      h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
      const r = (h >>> 8) / 16777216;
      let n = (r - 0.5) * 9;
      if (r > 0.985) n = -14; else if (r < 0.012) n = 12;       // tuft shadow / dry stalk or pebble
      px[i] = Math.max(0, Math.min(255, px[i] + n)); px[i + 1] = Math.max(0, Math.min(255, px[i + 1] + n)); px[i + 2] = Math.max(0, Math.min(255, px[i + 2] + n * 0.8));
    }
    octx.putImageData(im, 0, 0);
  } catch { /* texture stays smooth */ }
  return out;
}
