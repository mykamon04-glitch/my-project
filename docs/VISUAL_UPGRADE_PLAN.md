# Iron Dominion — Visual Upgrade (V5.0): plan, status, findings

## Ground rules
Gameplay is frozen. `src/game/**`, `src/data/**`, `src/types/**` are byte-identical to the baseline
(`git diff baseline-aistudio-original -- src/game src/data src/types` is empty). Restore the untouched original with
`git checkout baseline-aistudio-original`.

## Architecture (as found)
React 19 + Tailwind 4 + Vite 8. `GameEngine` (src/game/engine.ts) owns all state; `TacticalRenderer` (canvas 2D,
top-down, procedural drawing) and `TacticalThreeRenderer` (optional 3D) read it. UI components receive the engine
instance and call its methods, so UI can be replaced without touching rules.

| UI | Engine surface it uses |
|---|---|
| MobileTopHUD | `engine.economy`, units/buildings (threat) |
| MobileBottomSheet | `onStartBuildingPlacement`, `onQueueUnit`, `onCancelQueue`, `onIssueUnitCommandType`, `onSetFormation`, `onToggleRepair`, `onDemolish`, `onResearch` (App.tsx handlers) |
| AiManagerCards (new) | `engine.getAIModules()`, `engine.toggleAIModule(id)` |

## Done and verified (Playwright, 6 viewports 320–1280 px + landscape)
- Top HUD: non-scrolling grid, abbreviating chips (`formatCompact`), signed power, safe-area padding, no overflow.
- Floating panels (objectives, radar, AI banner) hang below HUD via `--hud-top`; objectives can't run under the radar.
- Bottom sheet: drag handle, live resize, snap collapsed/half/expanded, flick bias, tap toggle, never overlaps HUD/nav, orientation-safe.
- Nav: BUILD | ARMY | DEFENSE | AI | MORE.
- Build categories wrap (no clipped "TECHNOLOG"); building names wrap instead of truncating.
- AI tab: compact expandable cards bound to real engine state.
- Typography: UI font everywhere, military display face only on headings; design tokens in `index.css`.

## Findings worth knowing
- **The original AI tab was a placeholder**: static status strings, "ON" buttons that only vibrated, a hard-coded log.
  The engine already implements 7 AI modules (`getAIModules`/`toggleAIModule`) that no component used. Cards now show
  truthful state (Architect and Troop Production are OFF by default in the engine).
- `engine.getAIModules()` exposes limit *display* values but there is no setter, so no limit steppers were added.
- Graphics presets (Low/Medium/High/Ultra/Auto), resolution scale, FPS cap and shadow quality already exist in Settings.

## Not done yet (honest list)
- Rule 2 art overhaul: terrain is still per-tile procedural fills (blocky); building/unit sprites unchanged.
- Rule 9 VFX pass (muzzle flash/explosion/smoke polish).
- Rule 7 selection-panel restyle and Rule 8 radar frame/marker restyle (functional, unchanged apart from fonts/offsets).
- Rule 4 thumbnails: build cards still use the original small SVG icons; DEFENSE cards lack health/range bars beyond the existing range text.
- MORE panel (Settings modal) tab strip still clips on 390 px ("CC…"); not yet reflowed.
- Save compatibility: untouched (no save-format changes were made).
