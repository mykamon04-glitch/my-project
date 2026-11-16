/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GameSettings, Unit, Wreckage } from '../../types/game';
import { UNIT_CONFIGS } from '../../data/gameData';
import { aircraftDef, turretPivot, unitKind, vehicleDef, LayerKey } from './models';
import { projectPoint } from './raster';
import { FactionId } from './palette';
import { DetailLevel, SpriteEntry, UnitSpriteCache } from './unitSprites';
import { UnitAnim, advanceAnim, dieFrame, quantDir } from './unitAnim';

/**
 * Draws V11 units on the 2D canvas: model sprites from the cache, posed by the animation state machine, plus the live
 * parts that are cheaper to draw every frame than to pre-render (rotor discs, muzzle flashes, selection rings, bars).
 */

const SQUAD_COLORS = ['#38bdf8', '#f59e0b', '#a855f7', '#34d399'];

interface Drawn { body: SpriteEntry | null; turret: SpriteEntry | null; shadow: SpriteEntry | null }

export class UnitArtRenderer {
  readonly cache = new UnitSpriteCache();
  private anims = new Map<string, UnitAnim>();
  private drawn = new Map<string, Drawn>();
  private seen = new Set<string>();
  private time = 0;
  private flat = false;
  private warm = 0;

  beginFrame(time: number, settings?: Partial<GameSettings>) {
    this.time = time;
    this.flat = settings?.shadowQuality === 'off';
    const q = (settings?.graphicsQuality ?? 'high') as DetailLevel;
    this.cache.setDetail(q);
    // generous budget for the first frames so units appear at once after loading
    this.cache.beginFrame(this.warm < 20 ? 6 : 1);
    this.warm++;
    this.seen.clear();
  }

  /** Forget animation records of units that are no longer drawn. */
  endFrame() {
    if (this.anims.size > this.seen.size + 64) {
      for (const id of this.anims.keys()) if (!this.seen.has(id)) { this.anims.delete(id); this.drawn.delete(id); }
    }
  }

  anim(u: Unit): UnitAnim {
    const p = this.cache.preset;
    const a = advanceAnim(this.anims.get(u.id), u, this.time, { body: p.bodyDirs, turret: p.turretDirs });
    this.anims.set(u.id, a);
    this.seen.add(u.id);
    return a;
  }

  private fetch(k: LayerKey, prev: SpriteEntry | null): SpriteEntry | null {
    return this.cache.get(k) ?? prev ?? this.cache.get(k, true);
  }

  private faction(u: { faction?: string }): FactionId { return u.faction === 'enemy' ? 'enemy' : 'player'; }

  private blit(ctx: CanvasRenderingContext2D, e: SpriteEntry, x: number, y: number) {
    ctx.drawImage(e.img, x + e.ox, y + e.oy, e.ww, e.wh);
  }

  /** Ground unit (infantry or vehicle) at its ground position. Returns the sprite's top (world y) for overlays. */
  drawGround(ctx: CanvasRenderingContext2D, u: Unit): number {
    const a = this.anim(u);
    const kind = unitKind(u.type);
    const f = this.faction(u);
    const d = this.drawn.get(u.id) ?? { body: null, turret: null, shadow: null };
    let top = u.y - 12;
    if (kind === 'infantry') {
      d.body = this.fetch({ type: u.type, faction: f, layer: 'body', dir: a.dir, dirs: a.dirs, clip: a.clip, frame: a.frame, flat: this.flat }, d.body);
      if (d.body) { this.blit(ctx, d.body, u.x, u.y); top = u.y + d.body.oy; }
      if ((u.muzzleFlash ?? 0) > 0 && d.body?.marks.muzzle) this.flash(ctx, u.x + d.body.marks.muzzle[0], u.y + d.body.marks.muzzle[1], u.muzzleFlash!, 0.6);
    } else {
      const def = vehicleDef(u.type);
      d.body = this.fetch({ type: u.type, faction: f, layer: 'body', dir: a.dir, dirs: a.dirs, tread: def.tracked ? a.tread : 0, flat: this.flat }, d.body);
      if (d.body) { this.blit(ctx, d.body, u.x, u.y); top = u.y + d.body.oy; }
      const pv = turretPivot(u.type);
      let muzzle: [number, number] | undefined = d.body?.marks.muzzle;
      let mx = u.x, my = u.y;
      if (pv && def.turret) {
        const hp = projectPoint(pv, (a.dir / a.dirs) * Math.PI * 2);
        d.turret = this.fetch({ type: u.type, faction: f, layer: 'turret', dir: a.tdir, dirs: a.tdirs, recoil: a.recoil, elev: a.elev }, d.turret);
        if (d.turret) {
          this.blit(ctx, d.turret, u.x + hp[0], u.y + hp[1]);
          top = Math.min(top, u.y + hp[1] + d.turret.oy);
          muzzle = d.turret.marks.muzzle; mx = u.x + hp[0]; my = u.y + hp[1];
        }
      }
      if ((u.muzzleFlash ?? 0) > 0 && muzzle) this.flash(ctx, mx + muzzle[0], my + muzzle[1], u.muzzleFlash!, 1.3);
    }
    this.drawn.set(u.id, d);
    return top;
  }

  /** Aircraft: ground shadow, airframe at altitude, live rotors. Returns the sprite's top (world y). */
  drawAir(ctx: CanvasRenderingContext2D, u: Unit): number {
    const a = this.anim(u);
    const f = this.faction(u);
    const def = aircraftDef(u.type);
    const d = this.drawn.get(u.id) ?? { body: null, turret: null, shadow: null };
    const alt = u.altitude || 55;
    const roll = def.banks ? a.roll : 0;
    const bob = def.hover ? Math.sin(this.time * 1.7 + a.seed * 6) * 0.8 : 0;
    if (!this.flat) {
      d.shadow = this.fetch({ type: u.type, faction: f, layer: 'shadow', dir: a.dir, dirs: a.dirs, roll }, d.shadow);
      if (d.shadow) {
        ctx.save(); ctx.globalAlpha = 0.3;
        this.blit(ctx, d.shadow, u.x + alt * 0.42, u.y + alt * 0.3);
        ctx.restore();
      }
    }
    const y = u.y - alt + bob;
    d.body = this.fetch({ type: u.type, faction: f, layer: 'body', dir: a.dir, dirs: a.dirs, roll }, d.body);
    let top = y - 12;
    if (d.body) {
      this.blit(ctx, d.body, u.x, y);
      top = y + d.body.oy;
      const heading = (a.dir / a.dirs) * Math.PI * 2;
      for (const r of def.rotors) {
        const m = d.body.marks[r.mark];
        if (m) this.rotor(ctx, u.x + m[0], y + m[1], r.r, r.blades, this.time * r.rate + a.seed * 9, r.plane, heading);
      }
      if ((u.muzzleFlash ?? 0) > 0 && d.body.marks.muzzle) this.flash(ctx, u.x + d.body.marks.muzzle[0], y + d.body.marks.muzzle[1], u.muzzleFlash!, 1);
    }
    this.drawn.set(u.id, d);
    return top;
  }

  private rotor(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, blades: number, ang: number, plane: 'flat' | 'side' | 'front', heading: number) {
    const ch = Math.cos(heading), sh = Math.sin(heading);
    const tip = (t: number): [number, number] => {
      const c = Math.cos(t) * r, s = Math.sin(t) * r;
      if (plane === 'flat') return [c, s];                       // horizontal disc: undistorted in this projection
      if (plane === 'side') return [c * ch, c * sh - s];          // plane of the fuselage (tail rotor)
      return [-c * sh, c * ch - s];                               // across the fuselage (pusher propeller)
    };
    ctx.save();
    // motion-blurred disc
    ctx.fillStyle = 'rgba(30,32,30,0.14)';
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) { const p = tip((i / 24) * Math.PI * 2); if (i) ctx.lineTo(x + p[0], y + p[1]); else ctx.moveTo(x + p[0], y + p[1]); }
    ctx.fill();
    // blades, slightly blurred
    ctx.strokeStyle = 'rgba(28,30,28,0.55)';
    ctx.lineWidth = Math.max(0.6, r * 0.07);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let k = 0; k < blades; k++) {
      const p = tip(ang + (k / blades) * Math.PI * 2);
      ctx.moveTo(x, y); ctx.lineTo(x + p[0], y + p[1]);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(40,42,40,0.9)';
    ctx.beginPath(); ctx.arc(x, y, Math.max(0.6, r * 0.06), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  private flash(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, size: number) {
    const k = Math.min(1, t / 0.08);
    const r = (2 + 4 * k) * size;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,244,214,${0.95 * k})`);
    g.addColorStop(0.35, `rgba(255,190,96,${0.7 * k})`);
    g.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }

  /** Ground selection ring and (enhanced visibility) a faint faction ring under the unit. */
  drawGroundMarker(ctx: CanvasRenderingContext2D, u: Unit, selected: boolean, enhanced: boolean) {
    const kind = unitKind(u.type);
    const air = kind === 'aircraft';
    const r = kind === 'infantry' ? 9 : air ? 14 : 18;
    const cx = u.x + (air ? 0 : 0), cy = u.y + (kind === 'infantry' ? 0.5 : air ? -(u.altitude || 55) + 2 : 1.5);
    if (enhanced && !selected) {
      ctx.strokeStyle = u.faction === 'player' ? 'rgba(64,170,136,0.55)' : 'rgba(200,84,76,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(cx, cy, r * 0.9, r * 0.9 * 0.62, 0, 0, Math.PI * 2); ctx.stroke();
    }
    if (selected) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.62, 0, 0, Math.PI * 2); ctx.stroke();
    }
  }

  /** Health bar, veterancy and squad badge above a unit, upright (never rotated with the unit). */
  /** Labels placed this frame (world rects), so health numbers never overlap each other. */
  private labels: number[] = [];
  beginOverlays() { this.labels.length = 0; }
  private free(x: number, y: number, w: number, h: number): boolean {
    const L = this.labels;
    for (let i = 0; i < L.length; i += 4) {
      if (x < L[i] + L[i + 2] && x + w > L[i] && y < L[i + 1] + L[i + 3] && y + h > L[i + 1]) return false;
    }
    L.push(x, y, w, h);
    return true;
  }

  /**
   * Adaptive health indicators (V12):
   *   healthy and unselected -> nothing; damaged -> a small bar; selected -> bar, and the whole-number value
   *   ("95/120") only when few units are selected (`detail`) and the label has room.
   */
  drawOverlay(ctx: CanvasRenderingContext2D, u: Unit, top: number, controlGroups?: Record<number, string[]>, detail = true) {
    const kind = unitKind(u.type);
    const isVehicle = kind !== 'infantry';
    let y = top - 3;
    const damaged = u.hp < u.maxHp - 0.5;
    if (damaged || (u.selected && detail)) {
      const safeMax = Math.max(1, Math.round(Number.isFinite(u.maxHp) ? u.maxHp : 100));
      const safeHp = Math.max(0, Math.min(safeMax, Math.round(Number.isFinite(u.hp) ? u.hp : 0)));
      const ratio = safeHp / safeMax;
      const w = isVehicle ? 22 : 14;
      ctx.fillStyle = 'rgba(10, 16, 24, 0.85)';
      ctx.fillRect(u.x - w / 2 - 0.75, y - 0.75, w + 1.5, 3.5);
      ctx.fillStyle = ratio > 0.5 ? '#3FBF8F' : ratio > 0.25 ? '#E8B44E' : '#E0605A';
      ctx.fillRect(u.x - w / 2, y, w * ratio, 2);
      if (u.selected && detail) {
        const text = `${safeHp}/${safeMax}`;
        const tw = text.length * 4.3 + 2;
        if (this.free(u.x - tw / 2, y - 9, tw, 7)) {
          ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center';
          ctx.fillStyle = 'rgba(10,16,24,0.7)'; ctx.fillRect(u.x - tw / 2, y - 9, tw, 7.5);
          ctx.fillStyle = '#F1F5F9'; ctx.fillText(text, u.x, y - 3);
          y -= 8;
        }
      }
      y -= 2;
    }
    if (u.rank > 0) {
      ctx.fillStyle = '#f59e0b'; ctx.font = '8px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(u.rank === 3 ? '⭐⭐⭐' : u.rank === 2 ? '⭐⭐' : '⭐', u.x, y);
      y -= 9;
    }
    if (controlGroups && u.faction === 'player') {
      for (let g = 1; g <= 4; g++) {
        if (controlGroups[g]?.includes(u.id)) {
          ctx.fillStyle = SQUAD_COLORS[g - 1];
          ctx.beginPath(); ctx.roundRect(u.x - 8, y - 7, 16, 9, 2); ctx.fill();
          ctx.fillStyle = '#0f172a'; ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center';
          ctx.fillText(`S${g}`, u.x, y);
          break;
        }
      }
    }
  }

  /** Casualty, burnt-out vehicle or crashed aircraft. */
  drawWreck(ctx: CanvasRenderingContext2D, w: Wreckage) {
    const kind = unitKind(w.type);
    const f = this.faction(w);
    const p = this.cache.preset;
    const age = w.life;
    const fade = Math.min(1, (w.maxLife - age) / 3);
    if (fade <= 0) return;
    if (kind === 'aircraft' && w.altitude && age < 0.6) {
      // falling: the airframe drops from its altitude to the ground
      const k = age / 0.6, alt = w.altitude * (1 - k * k);
      const e = this.cache.get({ type: w.type, faction: f, layer: 'body', dir: quantDir(w.rotation, p.bodyDirs), dirs: p.bodyDirs }, true);
      if (e) { ctx.save(); ctx.globalAlpha = 1 - k * 0.3; this.blit(ctx, e, w.x, w.y - alt); ctx.restore(); }
      return;
    }
    ctx.save();
    ctx.globalAlpha = fade;
    if (kind === 'infantry') {
      const e = this.cache.get({ type: w.type, faction: f, layer: 'body', dir: quantDir(w.rotation, 8), dirs: 8, clip: 'die', frame: dieFrame(age), flat: this.flat }, true);
      if (e) this.blit(ctx, e, w.x, w.y);
    } else {
      const e = this.cache.get({ type: w.type, faction: f, layer: 'wreck', dir: quantDir(w.rotation, p.bodyDirs), dirs: p.bodyDirs, flat: this.flat }, true);
      if (e) this.blit(ctx, e, w.x, w.y);
      // smouldering for the first part of the wreck's life
      const burn = Math.max(0, 1 - age / (w.maxLife * 0.6));
      if (burn > 0) {
        const fl = Math.sin(this.time * 9 + w.x) * 0.8;
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(w.x + fl, w.y - 5, 0, w.x + fl, w.y - 5, 5 * burn + 1);
        g.addColorStop(0, `rgba(255,170,70,${0.8 * burn})`); g.addColorStop(1, 'rgba(255,90,20,0)');
        ctx.fillStyle = g; ctx.fillRect(w.x - 8, w.y - 13, 16, 16);
      }
    }
    ctx.restore();
  }
}

/** Units with a weapon that the animation system should show aiming and firing. */
export const isArmed = (type: string): boolean => (UNIT_CONFIGS as Record<string, { damage: number }>)[type]?.damage > 0;
