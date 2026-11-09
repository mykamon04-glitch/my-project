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
