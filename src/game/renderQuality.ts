/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GameSettings } from '../types/game';

/**
 * Render-quality helpers. Presentation only: nothing here touches simulation state.
 * Every helper treats an undefined setting as "original behaviour", so untouched
 * settings render exactly as before.
 */

type Q = Partial<Pick<GameSettings, 'resolutionScale' | 'frameRateTarget' | 'shadowQuality' | 'particleDensity' | 'reducedMotion'>>;

/**
 * Canvas backing-store scale = device pixel ratio (capped at 2, as before) x the player's resolution scale.
 * The renderer and the canvas-sizing code in App.tsx must both call this so they always agree.
 */
export function getRenderScale(s?: Q): number {
  const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
  const rs = Math.max(0.5, Math.min(1.5, s?.resolutionScale ?? 1));
  return Math.max(0.5, Math.min(2.5, dpr * rs));
}

/** Minimum milliseconds between rendered frames; 0 means uncapped (original behaviour). */
export function frameIntervalMs(s?: Q): number {
  const t = s?.frameRateTarget;
  return t && t > 0 ? 1000 / t : 0;
}

/** Draw every Nth particle: 1 = all. 'high'/undefined keep everything; reduced motion thins effects further. */
export function particleStride(s?: Q): number {
  const base = s?.particleDensity === 'low' ? 3 : s?.particleDensity === 'medium' ? 2 : 1;
  return s?.reducedMotion ? Math.max(base, 3) : base;
}

export type ShadowLevel = 'off' | 'low' | 'medium' | 'high';
export function shadowLevel(s?: Q): ShadowLevel {
  return s?.shadowQuality ?? 'medium';
}

/** Preset -> fine-tuning values. Labels in the UI: Performance / Balanced / High / Ultra. */
export const PRESET_LABELS: Record<'low' | 'medium' | 'high' | 'ultra', string> = {
  low: 'Performance',
  medium: 'Balanced',
  high: 'High',
  ultra: 'Ultra',
};

export function presetValues(p: 'low' | 'medium' | 'high' | 'ultra'): Required<Pick<GameSettings, 'resolutionScale' | 'shadowQuality' | 'particleDensity' | 'smokeDensity'>> {
  switch (p) {
    case 'low':
      return { resolutionScale: 0.75, shadowQuality: 'off', particleDensity: 'low', smokeDensity: 'off' };
    case 'medium':
      return { resolutionScale: 1, shadowQuality: 'low', particleDensity: 'medium', smokeDensity: 'low' };
    case 'high':
      return { resolutionScale: 1, shadowQuality: 'medium', particleDensity: 'high', smokeDensity: 'low' };
    case 'ultra':
    default:
      return { resolutionScale: 1, shadowQuality: 'high', particleDensity: 'high', smokeDensity: 'normal' };
  }
}

export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra';
const LADDER: QualityLevel[] = ['low', 'medium', 'high', 'ultra'];

/**
 * Adaptive "Auto" preset (V12). Fed the real frame intervals, it lowers the preset when the measured frame rate stays
 * under `low` fps for a 2.5 s window and raises it again (never above High) after 10 s of comfortable frame rate.
 * Pure: it only returns the level to switch to; the caller applies it with presetValues().
 */
export class AutoQuality {
  private acc = 0;
  private frames = 0;
  private goodFor = 0;
  constructor(public level: QualityLevel = 'high', private lowFps = 38, private highFps = 56, public cap = 60) {}
  sample(dtMs: number): QualityLevel | null {
    if (!(dtMs > 0) || dtMs > 1000) return null; // tab switches and stalls are not performance
    this.acc += dtMs; this.frames++;
    if (this.acc < 2500) return null;
    const fps = (this.frames * 1000) / this.acc;
    const windowMs = this.acc;
    this.acc = 0; this.frames = 0;
    const i = LADDER.indexOf(this.level);
    if (fps < this.lowFps && i > 0) { this.goodFor = 0; return (this.level = LADDER[i - 1]); }
    if (fps >= this.highFps) {
      this.goodFor += windowMs;
      if (this.goodFor >= 10000 && i < 2) { this.goodFor = 0; return (this.level = LADDER[i + 1]); }
    } else this.goodFor = 0;
    return null;
  }
}
