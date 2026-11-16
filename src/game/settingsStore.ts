/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GameSettings } from '../types/game';
import type { SettingsCategory } from './navigation';

/**
 * Persistent player settings (V14).
 * Before V14 the Settings screen wrote `iron_dominion_settings` but nothing ever read it back, and settings changed on
 * the main menu went into a throw-away object. Now there is one stored settings object: the main menu edits it, every
 * new match starts from it, and Apply writes it to storage.
 */

const KEY = 'iron_dominion_settings';

export const DEFAULT_SETTINGS: GameSettings = {
  soundEnabled: true, musicEnabled: true, masterVolume: 0.8, sfxVolume: 0.85, musicVolume: 0.35,
  combatVolume: 0.8, uiVolume: 0.7, voiceAlerts: true, muteWhenBackgrounded: true,
  showHealthBars: 'damaged', gameSpeed: 1.0, fogOfWarEnabled: true, weatherEffects: true, combatEffects: true,
  smokeDensity: 'low', unitVisibility: 'standard', dayNightCycle: false, graphicsQuality: 'ultra', autoQuality: false,
  screenShake: 0.0, showDamageNumbers: true,
  cameraSensitivity: 1.0, zoomSensitivity: 1.0, tapToMove: true, multiSelection: true, edgeScrolling: true, touchFeedback: true,
  autoDefenseEnabled: true, defensePolicy: 'full_defense', emergencyReinforcements: true, autoRepair: true, autoHeal: true,
  supportRatio: 7, retreatThreshold: 0.25,
  radarVisibility: true, radarSize: 'compact', alertSoundEnabled: true, showThreatOverlay: true, showDefenseZoneOverlay: true,
  overlays: {
    attackRange: false, radarCoverage: false, defenseZones: false, patrolRoutes: false, buildingFootprints: false,
    unitSelection: true, enemyDetection: false, resourceLocations: false, pathfindingDebug: false,
  },
  eyeComfortMode: false, uiScale: 'standard', largeTouchTargets: false, colorblindMode: false, reducedMotion: false,
  highContrast: false,
};

/** Which settings each Settings category owns (used by "Reset to default" for that category). */
export const CATEGORY_KEYS: Record<SettingsCategory, (keyof GameSettings)[]> = {
  graphics: ['graphicsQuality', 'autoQuality', 'resolutionScale', 'shadowQuality', 'particleDensity', 'smokeDensity', 'frameRateTarget',
    'weatherEffects', 'combatEffects', 'dayNightCycle', 'unitVisibility', 'screenShake', 'overlays'],
  audio: ['soundEnabled', 'musicEnabled', 'masterVolume', 'sfxVolume', 'musicVolume', 'combatVolume', 'uiVolume', 'voiceAlerts',
    'muteWhenBackgrounded', 'alertSoundEnabled'],
  controls: ['cameraSensitivity', 'zoomSensitivity', 'tapToMove', 'multiSelection', 'edgeScrolling', 'touchFeedback', 'pinchZoom',
    'doubleTapSelection', 'touchTargetSize'],
  gameplay: ['gameSpeed', 'showHealthBars', 'showDamageNumbers', 'radarVisibility', 'radarSize', 'radarPosition', 'showThreatOverlay',
    'showDefenseZoneOverlay'],
  ai: ['autoDefenseEnabled', 'defensePolicy', 'emergencyReinforcements', 'autoRepair', 'autoHeal', 'supportRatio', 'retreatThreshold'],
  accessibility: ['eyeComfortMode', 'reducedFlashing', 'uiScale', 'largeTouchTargets', 'colorblindMode', 'reducedMotion',
    'highContrast', 'textSize'],
  data: [],
};

/** Settings that belong to a match, not to the player (never restored from storage over a match's own setup). */
const MATCH_KEYS: (keyof GameSettings)[] = ['gameSpeed', 'fogOfWarEnabled'];

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

function readStorage(): Partial<GameSettings> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const q = localStorage.getItem('iron_dominion_graphics_quality');
      return q === 'low' || q === 'medium' || q === 'high' || q === 'ultra' ? { graphicsQuality: q } : {};
    }
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

/** Only keep stored values whose type matches the default (protects against corrupted or outdated storage). */
function sanitize(v: Partial<GameSettings>): Partial<GameSettings> {
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v)) {
    const d = (DEFAULT_SETTINGS as unknown as Record<string, unknown>)[k];
    if (val === null || val === undefined) continue;
    if (d === undefined || typeof d === typeof val) out[k] = val;
  }
  return out as Partial<GameSettings>;
}

let player: GameSettings | null = null;

/** The player's settings (defaults + what was applied before). The same object is returned every time. */
export function playerSettings(): GameSettings {
  if (!player) {
    const s = sanitize(readStorage());
    player = { ...clone(DEFAULT_SETTINGS), ...s, overlays: { ...DEFAULT_SETTINGS.overlays, ...(s.overlays ?? {}) } };
  }
  return player;
}

/** Player settings to start a match with; the match keeps its own speed and fog-of-war setup. */
export function settingsForMatch(matchValues: Partial<GameSettings>): GameSettings {
  const s = clone(playerSettings());
  for (const k of MATCH_KEYS) delete (s as Partial<GameSettings>)[k];
  return { ...clone(DEFAULT_SETTINGS), ...s, ...matchValues };
}

/** Persist settings (the Apply action). Updates the stored player settings too. */
export function saveSettings(s: GameSettings): boolean {
  const p = playerSettings();
  for (const k of Object.keys(s) as (keyof GameSettings)[]) {
    if (MATCH_KEYS.includes(k)) continue;
    (p as unknown as Record<string, unknown>)[k] = clone(s[k]);
  }
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(KEY, JSON.stringify(p));
    localStorage.setItem('iron_dominion_graphics_quality', p.graphicsQuality);
    return true;
  } catch {
    return false;
  }
}

/** Restore one category's defaults into `s` (in place). */
export function resetCategory(s: GameSettings, category: SettingsCategory) {
  for (const k of CATEGORY_KEYS[category]) {
    const d = (DEFAULT_SETTINGS as unknown as Record<string, unknown>)[k];
    if (d === undefined) delete (s as unknown as Record<string, unknown>)[k];
    else (s as unknown as Record<string, unknown>)[k] = clone(d);
  }
}

export const snapshotSettings = (s: GameSettings): GameSettings => clone(s);
export const sameSettings = (a: GameSettings, b: GameSettings): boolean => JSON.stringify(a) === JSON.stringify(b);
export function restoreSettings(target: GameSettings, snap: GameSettings) {
  for (const k of Object.keys(target)) delete (target as unknown as Record<string, unknown>)[k];
  Object.assign(target, clone(snap));
}

/** Test hook: forget the cached player settings (storage is read again on next access). */
export function __resetPlayerSettingsForTest() { player = null; }
