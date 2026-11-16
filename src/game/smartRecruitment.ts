/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AICommanderCustomComposition, AutoProductionSettings } from '../types/game';

/**
 * Smart Recruitment presets.
 *
 * These only configure the engine's EXISTING auto-production (strategy + custom composition percentages);
 * costs, queue rules, population and power rules are untouched. The engine decides what to build from
 * the real unit stats, the budget (reserveCredits) and the target army size.
 */
export type SmartMode = 'balanced' | 'defensive' | 'armored' | 'infantry' | 'custom';

export const SMART_MODES: { id: SmartMode; label: string; blurb: string }[] = [
  { id: 'balanced', label: 'Balanced', blurb: 'Mixed forces; adapts to scouted enemies.' },
  { id: 'defensive', label: 'Defensive', blurb: 'Defensive composition, favours holding the base.' },
  { id: 'armored', label: 'Armored', blurb: 'Tank-heavy with artillery support.' },
  { id: 'infantry', label: 'Infantry', blurb: 'Mass infantry with medics and anti-armor.' },
  { id: 'custom', label: 'Custom', blurb: 'You set the unit-class percentages.' },
];

export const ARMORED_COMPOSITION: AICommanderCustomComposition = { infantryPct: 15, armorPct: 55, antiAirPct: 10, artilleryPct: 15, supportPct: 5 };
export const INFANTRY_COMPOSITION: AICommanderCustomComposition = { infantryPct: 65, armorPct: 10, antiAirPct: 10, artilleryPct: 5, supportPct: 10 };

const sameComp = (a?: AICommanderCustomComposition, b?: AICommanderCustomComposition) =>
  !!a && !!b && a.infantryPct === b.infantryPct && a.armorPct === b.armorPct && a.antiAirPct === b.antiAirPct && a.artilleryPct === b.artilleryPct && a.supportPct === b.supportPct;

/** Which smart mode the engine's current auto-production settings correspond to (null = another advanced strategy). */
export function detectSmartMode(ap: Pick<AutoProductionSettings, 'strategy' | 'customComposition'>): SmartMode | null {
  if (ap.strategy === 'balanced') return 'balanced';
  if (ap.strategy === 'defensive') return 'defensive';
  if (ap.strategy === 'custom') {
    if (sameComp(ap.customComposition, ARMORED_COMPOSITION)) return 'armored';
    if (sameComp(ap.customComposition, INFANTRY_COMPOSITION)) return 'infantry';
    return 'custom';
  }
  return null;
}

/** Apply a smart mode to the engine's auto-production settings (mutates, as the engine settings object is shared). */
export function applySmartMode(ap: AutoProductionSettings, mode: SmartMode): void {
  switch (mode) {
    case 'balanced':
      ap.strategy = 'balanced';
      break;
    case 'defensive':
      ap.strategy = 'defensive';
      break;
    case 'armored':
      ap.strategy = 'custom';
      ap.customComposition = { ...ARMORED_COMPOSITION };
      break;
    case 'infantry':
      ap.strategy = 'custom';
      ap.customComposition = { ...INFANTRY_COMPOSITION };
      break;
    case 'custom':
      ap.strategy = 'custom';
      ap.customComposition = ap.customComposition ? { ...ap.customComposition } : { infantryPct: 30, armorPct: 35, antiAirPct: 15, artilleryPct: 10, supportPct: 10 };
      break;
  }
}

// ── composition validation ──────────────────────────────────────────────────

const COMP_KEYS = ['infantryPct', 'armorPct', 'antiAirPct', 'artilleryPct', 'supportPct'] as const;
export const DEFAULT_COMPOSITION: AICommanderCustomComposition = { infantryPct: 30, armorPct: 35, antiAirPct: 15, artilleryPct: 10, supportPct: 10 };

export const compositionTotal = (c: AICommanderCustomComposition): number => COMP_KEYS.reduce((n, k) => n + (Number.isFinite(c[k]) ? c[k] : 0), 0);

/** Clamp a typed value to a whole number from 0 to 100 (NaN and negatives become 0). */
export const clampShare = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : 0);

/**
 * Rescale shares so they total exactly 100 while keeping their ratios (largest-remainder rounding).
 * The engine already treats the five numbers as proportions of one army, so this changes nothing about what
 * gets built; it only makes the numbers read as true percentages. An all-zero input returns the default mix.
 */
export function normalizeComposition(c: AICommanderCustomComposition): AICommanderCustomComposition {
  const raw = COMP_KEYS.map(k => Math.max(0, Number.isFinite(c[k]) ? c[k] : 0));
  const total = raw.reduce((a, b) => a + b, 0);
  if (total <= 0) return { ...DEFAULT_COMPOSITION };
  const exact = raw.map(v => (v / total) * 100);
  const floors = exact.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = exact.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  for (const o of order) {
    if (left <= 0) break;
    floors[o.i] += 1;
    left -= 1;
  }
  const out = { ...DEFAULT_COMPOSITION };
  COMP_KEYS.forEach((k, i) => { out[k] = floors[i]; });
  return out;
}
