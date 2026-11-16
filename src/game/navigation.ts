/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Central navigation (V14). One explicit state for every screen and overlay, replacing scattered booleans.
 *
 *   screens  : main_menu → map_select → match_setup → gameplay      (history stack, Back pops it)
 *   overlays : pause, settings (with an optional category page), save_load, help, confirm   (modal stack on top)
 *
 * Rules:
 *   - Back closes the top overlay first (a settings category page goes back to the category list), then pops a screen.
 *     It never leaves gameplay by itself: Back on a bare gameplay screen opens the pause menu.
 *   - Home returns to the main menu. From an active match it first asks for confirmation (a 'confirm' overlay).
 *   - Starting a match replaces the history (main_menu → gameplay), so Back from the match cannot step into setup screens
 *     of a game that is already running.
 *   - The match is paused while any overlay is open over gameplay.
 * The reducer is pure; App.tsx owns the engine and applies side effects (pause, cleanup) from the resulting state.
 */

export type ScreenId = 'main_menu' | 'map_select' | 'match_setup' | 'gameplay';
export type SettingsCategory = 'graphics' | 'audio' | 'controls' | 'gameplay' | 'ai' | 'accessibility' | 'data';
export type ConfirmKind = 'leave_match' | 'restart_match' | 'discard_settings' | 'reset_category';

export type Overlay =
  | { id: 'pause' }
  | { id: 'settings'; category: SettingsCategory | null }
  | { id: 'save_load'; mode: 'save' | 'load' }
  | { id: 'help' }
  | { id: 'career' }
  | { id: 'confirm'; kind: ConfirmKind };

export interface NavState {
  screen: ScreenId;
  history: ScreenId[];       // screens below the current one
  overlays: Overlay[];       // modal stack, top = last
}

export type NavAction =
  | { type: 'go'; screen: ScreenId }
  | { type: 'start_match' }
  | { type: 'open'; overlay: Overlay }
  | { type: 'close' }                                      // close the top overlay
  | { type: 'close_all' }
  | { type: 'settings_category'; category: SettingsCategory | null }
  | { type: 'back' }
  | { type: 'home'; force?: boolean };                      // force: confirmation already given / nothing to lose

export const initialNav: NavState = { screen: 'main_menu', history: [], overlays: [] };

export const topOverlay = (s: NavState): Overlay | undefined => s.overlays[s.overlays.length - 1];
export const inMatch = (s: NavState): boolean => s.screen === 'gameplay';
/** The simulation runs only on a bare gameplay screen. */
export const shouldPause = (s: NavState): boolean => s.screen === 'gameplay' && s.overlays.length > 0;

export function navReducer(s: NavState, a: NavAction): NavState {
  switch (a.type) {
    case 'go':
      if (a.screen === s.screen) return { ...s, overlays: [] };
      return { screen: a.screen, history: [...s.history, s.screen], overlays: [] };
    case 'start_match':
      return { screen: 'gameplay', history: ['main_menu'], overlays: [] };
    case 'open': {
      const top = topOverlay(s);
      if (top && top.id === a.overlay.id && a.overlay.id !== 'confirm') {
        // re-opening the overlay that is already on top just updates it (no duplicate stack entries)
        return { ...s, overlays: [...s.overlays.slice(0, -1), a.overlay] };
      }
      return { ...s, overlays: [...s.overlays, a.overlay] };
    }
    case 'close':
      return s.overlays.length ? { ...s, overlays: s.overlays.slice(0, -1) } : s;
    case 'close_all':
      return { ...s, overlays: [] };
    case 'settings_category': {
      const top = topOverlay(s);
      if (!top || top.id !== 'settings') return s;
      return { ...s, overlays: [...s.overlays.slice(0, -1), { id: 'settings', category: a.category }] };
    }
    case 'back': {
      const top = topOverlay(s);
      if (top) {
        if (top.id === 'settings' && top.category) return navReducer(s, { type: 'settings_category', category: null });
        return { ...s, overlays: s.overlays.slice(0, -1) };
      }
      if (s.screen === 'gameplay') return { ...s, overlays: [{ id: 'pause' }] };
      if (s.history.length) return { screen: s.history[s.history.length - 1], history: s.history.slice(0, -1), overlays: [] };
      return s; // main menu root: nothing behind it
    }
    case 'home':
      if (s.screen === 'gameplay' && !a.force) {
        const top = topOverlay(s);
        if (top?.id === 'confirm' && top.kind === 'leave_match') return s;
        return { ...s, overlays: [...s.overlays, { id: 'confirm', kind: 'leave_match' }] };
      }
      return { ...initialNav };
  }
}
