// Minimal PNG writer for Node scripts (RGBA8). Used only by art-iteration scripts, never by the game.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc(buf: Uint8Array): number { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
  dv.setUint32(0, data.length); for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8); dv.setUint32(8 + data.length, crc(out.subarray(4, 8 + data.length)));
  return out;
}
export function writePng(path: string, w: number, h: number, rgba: Uint8ClampedArray | Uint8Array): void {
  const raw = new Uint8Array((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1); }
  const ihdr = new Uint8Array(13), dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w); dv.setUint32(4, h); ihdr[8] = 8; ihdr[9] = 6;
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array(0))];
  const total = parts.reduce((n, p) => n + p.length, 0), out = new Uint8Array(total);
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  writeFileSync(path, out);
}

/** Simple RGBA canvas for contact sheets. */
export class Sheet {
  data: Uint8ClampedArray;
  constructor(public w: number, public h: number, bg: [number, number, number] = [58, 64, 44]) {
    this.data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) { this.data[i * 4] = bg[0]; this.data[i * 4 + 1] = bg[1]; this.data[i * 4 + 2] = bg[2]; this.data[i * 4 + 3] = 255; }
  }
  /** Alpha-blend a sprite, optionally magnified by an integer factor (nearest neighbour). */
  blit(src: { w: number; h: number; data: Uint8ClampedArray }, x0: number, y0: number, mag = 1): void {
    for (let y = 0; y < src.h * mag; y++) for (let x = 0; x < src.w * mag; x++) {
      const dx = x0 + x, dy = y0 + y;
      if (dx < 0 || dy < 0 || dx >= this.w || dy >= this.h) continue;
      const si = (Math.floor(y / mag) * src.w + Math.floor(x / mag)) * 4, di = (dy * this.w + dx) * 4, a = src.data[si + 3] / 255;
      this.data[di] = src.data[si] * a + this.data[di] * (1 - a); this.data[di + 1] = src.data[si + 1] * a + this.data[di + 1] * (1 - a); this.data[di + 2] = src.data[si + 2] * a + this.data[di + 2] * (1 - a);
    }
  }
  save(path: string): void { writePng(path, this.w, this.h, this.data); }
}
