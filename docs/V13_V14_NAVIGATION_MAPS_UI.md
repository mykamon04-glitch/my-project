# IRON DOMINION V13 + V14: Navigation, Battlefields and Interface

This release combines the V13 interface brief (premium tactical minimalism, battlefield-first) with the V14 brief
(world evolution and a complete navigation system). The engine, combat, economy, construction, AI, victory system
and saves keep working; older saves still load.

## Audit findings (each confirmed before it was fixed)

| Finding | Evidence |
| --- | --- |
| Screens and modals were scattered booleans (`inMainMenu`, `isSettingsOpen`, `isSaveLoadOpen`, MainMenu's own `activeModal`). There was no back stack, no pause menu and no Home path from Settings. | Code audit of `App.tsx` and `MainMenu.tsx`; Settings had only ✕ and "Confirm & Close". |
| The match kept running while Settings or Save/Load was open. | Nothing set `engine.isPaused` for overlays. |
| Settings were written to `iron_dominion_settings` but never read back, and Settings opened from the main menu edited a throw-away object. | No reader of the key existed. |
| Loading a save always rebuilt the default map. | `loadSavedGame` created `new GameEngine(mode, 'normal')`, and `importSaveData` never restored the map. |
| Maps were not reproducible. | All seven generators used `Math.random`; a probe built every map twice and none matched. |
| Small maps placed resource deposits outside the map. | Verdant Frontier (small): 4 of 5 deposits out of bounds; River Delta (small): 2 of 4. |
| A "central" deposit on even-sized maps was one tile closer to one side. | The new symmetry test caught it; it is now a mirrored pair. |

## Navigation (V14 Phase B)

`src/game/navigation.ts` is a pure reducer over explicit state:

- **Screens:** `main_menu → map_select → match_setup → gameplay`, with a history stack.
- **Overlays:** a modal stack with `pause`, `settings` (with an optional category page), `save_load`, `help`, `career`
  and `confirm`.

| Action | Behaviour |
| --- | --- |
| Back (button, Esc, Android system back, browser back) | Closes the top overlay. On a settings category page it returns to the category list. In a match it first cancels placement or a command mode, then clears the selection, then opens Pause; it never leaves the game by itself. On menus it pops the history. |
| Home | Returns to the main menu. From an active match it first asks: **Save and exit** (quick-save slot), **Exit without saving** or **Cancel**. |
| Resume | Returns to the same engine instance; units, buildings, resources, AI, camera and selection are untouched. |
| Pause | The simulation is paused whenever any overlay is open over the match, and resumes when the last one closes. |
| Start match | Replaces the history (main menu → gameplay). Restart keeps the map, seed and setup. |

Android back and browser back use a history guard entry (`popstate`) that feeds the same Back logic; this is tested in
the browser. In the Capacitor app, the WebView's default back behaviour goes back in history while it can, which should
trigger the same handler, but this has not been verified on a physical device.

**Pause menu:** Resume, Save, Load, Settings, Controls, game speed, sound, fullscreen, base advisor, developer tools
(sandbox or `?debug=1`), Restart (confirmed), Main menu (confirmed).

**Settings:** a Back / Settings / Home header and seven categories (Graphics, Audio, Controls, Gameplay, AI,
Accessibility, Save & Load).
- Changes preview live.
- **Apply** stores them; this is the first time they persist across sessions.
- **Reset to default** resets the current category, after confirmation.
- **Resume game** appears when Settings was opened from a match.
- Leaving with unapplied changes asks **Apply and continue / Discard changes / Cancel**; nothing is dropped silently.

**Main menu:** Continue (newest save), New game, Map selection, Load game, Settings, Controls, Career and Quick Deploy
(sandbox). The backdrop is a real generated battlefield.

**Save / Load:** available from the main menu and from Pause, with three slots, a quick save, the autosave and
confirmed deletion. Saves store the map identity (id, seed, generation options) and the match setup.

## Battlefields (V14 Phases C–E)

`src/game/maps/generator.ts` contains a seeded generator (mulberry32 + value noise; no `Math.random`). It takes these
parameters: environment, size, seed, resource density, vegetation, obstacle density, road network and starting layout.

- **Fair layouts:** terrain, routes and deposits are point-symmetric about the map centre.
- **Five environments** (`src/game/maps/catalog.ts`):
  - **Verdant Warzone** (temperate): forest belts, rocky outcrops, dirt roads, three approach routes.
  - **Desert Frontline:** ridgelines broken by narrow passes, a dry riverbed, abandoned industrial blocks, open armour routes.
  - **Urban Conflict Zone:** a street grid of varied block sizes, ruined blocks, rubble lots, concrete hardstanding, many routes.
  - **Mountain Stronghold:** ridges and cliffs crossed by passes, forested valleys, snow on high ground.
  - **Coastal Operations:** sea on two flanks, a river between the bases crossed by road bridges, coastal facilities.
- **Validation and repair:** every map checks that both HQ sites are clear, that the bases are connected by ground
  (shortest route length), that every deposit is reachable, and that there are at least 200 buildable tiles around each
  HQ. If a check fails, the repair pass carves mirrored corridors. Decoration never blocks a walkable tile.
- **Legacy ids:** older map ids (saves, campaign missions) resolve to the closest V14 battlefield.
- **Strategic terrain** (authoritative, in damage resolution): infantry in forest take 20% less damage, and infantry in
  urban rubble 15% less. Vehicles and aircraft get no cover. `calculateDamage` already returns whole numbers, so damage
  outside cover is unchanged.

**Terrain rendering** (`terrain.ts`, `terrainLayer.ts`, `propArt.ts`):

- **Materials:** grass, soil, sand, gravel, asphalt and concrete (with joints and stains), rock, forest floor and water.
- **Borders:** organic contours from domain-warped bilinear material weights, so there are no square tiles.
- **Relief:** hill-shading from the elevation field (north-west sun, matching buildings and units), ambient occlusion at
  cliffs and forests, and alpine tint on high ground.
- **Water:** depth-graded colour, shallows, a foam line and a wet-sand shore.
- **Roads:** worn dirt roads with gravel; asphalt with cracks and patches.
- **Baking:**
  - an overview baked once (8 px per texel), including an apron beyond the map edges, so there are no black corners;
  - 160 px detail chunks baked lazily within a 5 ms per-frame budget (14 ms during the first frames);
  - visible chunks first, an LRU memory cap, and texel size set by the quality preset.
- **Props:**
  - shaded tree sprites (broadleaf and conifer);
  - extruded ruined city blocks and industrial blocks (fuel tanks, containers);
  - mineral outcrops instead of glowing crystals with text labels;
  - abandoned vehicles drawn with the V11 burnt-out wreck models.

  Tall props are depth-sorted together with units and buildings.

**Map selection and match setup** (`components/screens`):
- Map previews are generated from the actual map (same seed and options) by the terrain compositor.
- Match setup offers mode (Skirmish, Defense, Campaign, Sandbox), difficulty, size, seed (type a number, randomise or
  use the official seed), resources, obstacles, vegetation, starting positions, roads, fog, victory rule, credits,
  starting army and speed.
- A live validation line shows the route length and reachable deposits.

## Interface (V13)

- **Design tokens** (`index.css`): the brief's colours plus motion durations (210 ms panels, 120 ms presses), all
  respecting `prefers-reduced-motion` and the in-game Reduced motion setting. Shared components: `nx-panel`, `nx-btn`
  (primary, quiet, danger and disabled states), `nx-title`, `nx-label` and `nx-screen`.
- **Font:** the decorative display face is retired; headings use the interface font.
- **Command strip:** one integrated bar for credits, power, troops, threat and the menu, separated by hairlines rather
  than a card per value. It is neutral by default, with a green income label, amber for low power or a full army, and
  red for an attack. Tapping a value shows details; tapping troops selects all of them.
- **Objectives:** shown as `OBJECTIVES n/m`. Each objective shows its live status ("2/5", "Active" or "Complete"). A
  brief, non-blocking notice appears when one completes, and the panel collapses on its own.
- **Command bar:**
  - shows `N UNITS SELECTED` with MOVE | ATTACK | DEFEND | MORE;
  - ATTACK is disabled, not merely styled, when the whole selection is unarmed;
  - MORE adds Heal for medics and Repair for engineers;
  - a command button is highlighted only while its target mode is actually armed.
- **Touch:**
  - tap to select; one-finger drag on empty ground pans; pinch zooms;
  - long-press on a friendly unit opens contextual options (select all of its type, focus, hold, stop, heal, repair);
  - long-press on empty ground starts a drag-box selection;
  - command buttons then tap the destination, enemy or position.
- **Bottom navigation:** one cohesive bar with an accent indicator on the active tab and sentence-case labels. The
  Build sheet uses the same tokens.

## Verification

- Unit tests: **182 passed** in 14 files. New suites: `navigation-v14` (9, including a randomised check that every
  reachable state has an exit to the main menu) and `maps-v14` (9: reproducibility, validity across 5 environments × 4
  sizes × 4 seeds, symmetry, non-blocking decoration, a start on every map, pathfinding to the enemy base, construction,
  save/load map identity, legacy ids, preview coordinates, terrain cover).
- Browser (e2e): the new `navigation.cjs` covers the brief's mandatory navigation tests on 390×844, 1280×800 and
  844×390 (102 checks). Existing suites were updated for the new labels and Settings flow.
- `tsc --noEmit` is clean and `vite build` succeeds.

## Performance (measured, headless Chromium, 390×844 @2x, 60-unit battle, High preset, same machine)

| Build | CPU | fps | p95 frame |
| --- | --- | --- | --- |
| V12 | 1× | 52.9 / 51.4 (two runs) | 33.4 ms |
| V13/V14 | 1× | 48.9 / 44.2 (two runs) | 33.4 ms |
| V12 | 4× throttled | 8.0 | 150 ms |
| V13/V14 | 4× throttled | 8.1 | 167 ms |

The terrain pass originally painted the overview under every detail chunk. Profiling showed 79% of frame time in
native canvas rasterisation, so each chunk is now drawn once: detail if baked, otherwise the overview. After that
change V13/V14 is on par with V12 when CPU-bound (4×). Unthrottled it is about 8% lower: the V14 maps draw full terrain
detail and dense forests, where V12 drew a plain field. The Performance and Balanced presets use coarser terrain texels.
These numbers compare builds; they do not predict any particular phone.

Screenshots (`docs/shots/v14_*`, all from the running game):
- before/after comparisons of the main menu, HUD, in-game menu and terrain;
- every menu screen on a phone;
- map selection, match setup and settings on desktop;
- each of the five battlefields in play, plus a sheet of map previews.

## Known limitations

- Terrain detail is baked progressively; for about a second after the camera jumps to an unseen area, the
  lower-resolution overview shows there.
- Units cannot climb cliffs (cliffs are impassable). High ground is a visual and layout feature; only forest and urban
  rubble cover change combat numbers.
- There is no naval combat. Coastal water is impassable and the river is crossed by bridges.
- Because of the history guard, the back gesture never closes the app (it navigates inside the game instead); close
  the app with the system app switcher. On-device Android back was not tested; only browser back was.
- The optional Three.js 3D mode does not use the new terrain compositor.
