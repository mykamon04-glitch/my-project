# Iron Dominion — Audit, Repairs and Visual Upgrade (V5.1)

Baseline: the untouched Google AI Studio project is tag `baseline-aistudio-original`
(`git checkout baseline-aistudio-original` restores it exactly).

**Scope decision.** The brief supplied alongside this one (V3.0/V4.0) asks for new gameplay (naval units, territory
capture, new factions, new research tree). V5.1 states the opposite: *preserve gameplay, not a new game*. V5.1 is the latest
and most specific, so V3/V4 feature work was **not** done. Gameplay files were changed in exactly one place (see Bug 1–2).

## 1. Confirmed bugs (each has evidence) and fixes

| # | Bug | Evidence | Fix |
|---|---|---|---|
| 1 | Population cap bypass: queued units were not counted, so a batch could overshoot the cap | Test `PROBE`: room for 62, engine accepted 68 | `engine.queueUnitProduction` counts queued units against the cap |
| 2 | Engine accepted any unit at any building (Rifleman queued at the HQ, $100 charged) | Test `PROBE`: accepted=true, credits 5000→4900 | Engine refuses when `config.requiredBuilding !== building.type` |
| 3 | Top HUD overflowed on phones: chips lived in an `overflow-x-auto` row; Threat chip and "TROOPS" were clipped/pushed off-screen | Screenshots at 390 px (baseline) | Non-scrolling grid, shrinking chips, `formatCompact`, labels collapse <420 px |
| 4 | Mission panel, radar and AI banner overlapped the camera-tools row (hard-coded `top-14/16`) | Screenshots | Shared `--hud-top` CSS variable; panel width capped so it never runs under the radar |
| 5 | **AI tab was a placeholder**: static status text, "ON" buttons that only vibrated, hard-coded log. The real engine API (`getAIModules`, `toggleAIModule`) was used by no component | Source read + runtime switch test | New `AiManagerCards` bound to the real API |
| 6 | **Graphics settings did nothing**: `resolutionScale`, `shadowQuality`, `frameRateTarget` were read by nothing; presets only set a label | `grep` across `src` (types + Settings UI only) | Wired into renderer/App loop; presets apply real values; Particle Density control added; labels Performance/Balanced/High/Ultra |
| 7 | Bottom sheet declared snap states but only ever used collapsed/half; fixed `50vh`; no drag | Source + drag test | Drag handle, live resize, snap collapsed/half/expanded, flick bias, never overlaps HUD or nav |
| 8 | Build category tabs clipped ("TECHNOLOG"); long building names truncated; Settings tab strip clipped | Screenshots | Wrapping grids; names wrap; Settings tabs wrap |

## 2. Checked and found NOT to be bugs
- **Screen shake**: already off (`screenShake` default `0`; both renderers bypass `screenShakeOffset`). Now covered by a test.
- **Number formatting**: runtime scan of every panel on 3 viewports found no float artifacts / NaN / Infinity / undefined.
  `formatHp` already existed (95.88/120 → `96/120 HP`).
- **Rotation**: every building footprint in the data is square (1×1, 2×2, 3×3), so rotation is orientation-only by design.
- Original `npm run lint` and `npm run build` were already clean.

## 3. Modified files
Gameplay: `src/game/engine.ts` (the two guards in `queueUnitProduction`; nothing else).
Render/UI: `src/game/renderer.ts`, `src/game/renderQuality.ts` (new), `src/App.tsx`, `src/index.css`, `src/utils/format.ts`,
`src/components/mobile/MobileTopHUD.tsx`, `MobileBottomSheet.tsx`, `AiManagerCards.tsx` (new), `MobileFloatingRadar.tsx`,
`src/components/SettingsModal.tsx`. Tests: `tests/engine.test.ts`, `tests/e2e/*.cjs`, `vitest.config.ts`.
Untouched: `ai.ts`, `combat.ts`, `pathfinding.ts`, `mapGenerator.ts`, `data/`, `types/`.

## 4. Test results (all actually run)
- `npm run lint` clean · `npm run build` ok · `npm test`: 18/18 (recruitment, construction, economy, save/load of queues,
  AI parity, formatting, shake, render-quality helpers).
- Browser (Chromium, Playwright): smoke 11/11 at 320×640, 360×740, 390×844, 844×390, 768×1024, 1280×720; sheet drag 12/12;
  placement controls/rotate/cancel at 360×740 and 844×390; graphics settings 6/6 (960 px canvas under Performance,
  30.0 fps under the 30 FPS target, fewer shadow draws); number scan clean.
- AI parity: enemy went 3→19 units and 1→4 buildings in 240 sim-seconds; player auto-production trained units within the cap.

## 5. Remaining limitations (not done / not verified)
- **Art overhaul (§9) not done**: terrain is still per-tile procedural fills, sprites/buildings/vehicles are unchanged, no new
  construction/destruction animations or VFX pass. Selection-panel and radar restyle not done (functional, only fonts/offsets changed).
- Build-card thumbnails are still the original small SVG icons.
- `textureQuality` / `antiAliasing` exist only as types (no UI, no effect). `shadowQuality` 'medium' and 'high' render identically.
- No real-device testing. The FPS cap and canvas scale were measured in headless Chromium only; **no FPS, 2K or 4K claim is made.**
- UI recruit buttons still test `population >= cap` without queued units; the engine now refuses correctly, but a card can look
  enabled for one tap before refusing.
- Dragging a panel was not tested for camera side effects with real touch hardware (panels are DOM siblings of the canvas).
- No save-format change; round-trip tested, but old real-world saves were not available to test.

## 6. Run it
```
npm install --legacy-peer-deps      # original pins esbuild ^0.25 vs Vite 8's optional peer
npm run dev                         # or: npm run build && npx vite preview
npm run lint && npm test            # type-check + unit tests
node tests/e2e/smoke.cjs 390 844    # browser checks; needs `playwright` and a running preview (see tests/e2e/README.md)
```
