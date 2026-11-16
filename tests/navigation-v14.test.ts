import { describe, it, expect } from 'vitest';
import { initialNav, navReducer, NavAction, NavState, shouldPause, topOverlay } from '../src/game/navigation';

const run = (...a: NavAction[]) => a.reduce<NavState>(navReducer, initialNav);

describe('V14 navigation', () => {
  it('Map Selection -> Back returns to the main menu', () => {
    const s = run({ type: 'go', screen: 'map_select' }, { type: 'back' });
    expect(s.screen).toBe('main_menu');
  });
  it('Main menu -> Map select -> Match setup -> Back -> Back walks the history', () => {
    let s = run({ type: 'go', screen: 'map_select' }, { type: 'go', screen: 'match_setup' });
    s = navReducer(s, { type: 'back' }); expect(s.screen).toBe('map_select');
    s = navReducer(s, { type: 'back' }); expect(s.screen).toBe('main_menu');
    s = navReducer(s, { type: 'back' }); expect(s.screen).toBe('main_menu'); // root: stays
  });
  it('starting a match replaces the history; Back in a match opens Pause, never leaves it', () => {
    let s = run({ type: 'go', screen: 'map_select' }, { type: 'go', screen: 'match_setup' }, { type: 'start_match' });
    expect(s).toEqual({ screen: 'gameplay', history: ['main_menu'], overlays: [] });
    s = navReducer(s, { type: 'back' });
    expect(topOverlay(s)).toEqual({ id: 'pause' });
    expect(shouldPause(s)).toBe(true);
    s = navReducer(s, { type: 'back' });                       // Resume
    expect(s.screen).toBe('gameplay');
    expect(shouldPause(s)).toBe(false);
  });
  it('Gameplay -> Settings -> Graphics -> Back returns to Settings, Back again to the match', () => {
    let s = run({ type: 'start_match' }, { type: 'open', overlay: { id: 'settings', category: null } }, { type: 'settings_category', category: 'graphics' });
    expect(topOverlay(s)).toEqual({ id: 'settings', category: 'graphics' });
    s = navReducer(s, { type: 'back' });
    expect(topOverlay(s)).toEqual({ id: 'settings', category: null });
    s = navReducer(s, { type: 'back' });
    expect(s.overlays).toEqual([]);
    expect(s.screen).toBe('gameplay');
  });
  it('Pause -> Settings -> Back returns to Pause (modal stack)', () => {
    const s = run({ type: 'start_match' }, { type: 'open', overlay: { id: 'pause' } }, { type: 'open', overlay: { id: 'settings', category: null } }, { type: 'back' });
    expect(topOverlay(s)).toEqual({ id: 'pause' });
  });
  it('Home from a match asks for confirmation; confirmed Home goes to the main menu', () => {
    let s = run({ type: 'start_match' }, { type: 'open', overlay: { id: 'settings', category: null } }, { type: 'home' });
    expect(topOverlay(s)).toEqual({ id: 'confirm', kind: 'leave_match' });
    expect(s.screen).toBe('gameplay');
    expect(navReducer(s, { type: 'home' })).toEqual(s);         // no duplicate confirm
    s = navReducer(s, { type: 'back' });                        // cancel
    expect(topOverlay(s)).toEqual({ id: 'settings', category: null });
    s = navReducer(s, { type: 'home', force: true });
    expect(s).toEqual(initialNav);
  });
  it('Home from Settings opened on the main menu returns immediately', () => {
    const s = run({ type: 'go', screen: 'map_select' }, { type: 'open', overlay: { id: 'settings', category: 'audio' } }, { type: 'home' });
    expect(s).toEqual(initialNav);
  });
  it('re-opening the top overlay does not stack duplicates', () => {
    const s = run({ type: 'open', overlay: { id: 'settings', category: null } }, { type: 'open', overlay: { id: 'settings', category: 'audio' } });
    expect(s.overlays).toEqual([{ id: 'settings', category: 'audio' }]);
  });
  it('every reachable state has an exit path back to the main menu', () => {
    const actions: NavAction[] = [
      { type: 'go', screen: 'map_select' }, { type: 'go', screen: 'match_setup' }, { type: 'start_match' },
      { type: 'open', overlay: { id: 'pause' } }, { type: 'open', overlay: { id: 'settings', category: null } },
      { type: 'settings_category', category: 'graphics' }, { type: 'open', overlay: { id: 'save_load', mode: 'save' } },
      { type: 'open', overlay: { id: 'help' } }, { type: 'back' }, { type: 'close' },
    ];
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
    for (let trial = 0; trial < 300; trial++) {
      let s = initialNav;
      for (let k = 0; k < 8; k++) s = navReducer(s, actions[Math.floor(rnd() * actions.length)]);
      // Back repeatedly, then Home (confirming if asked) must always reach the main menu
      for (let k = 0; k < 10; k++) if (s.overlays.length) s = navReducer(s, { type: 'back' });
      s = navReducer(s, { type: 'home' });
      if (s.screen === 'gameplay') s = navReducer(s, { type: 'home', force: true });
      expect(s).toEqual(initialNav);
    }
  });
});
