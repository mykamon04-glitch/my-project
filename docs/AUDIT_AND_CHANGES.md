# Iron Dominion — Audit, Repairs and Upgrades (V5.1 → V6.0)

Baseline: the untouched Google AI Studio project is tag `baseline-aistudio-original`
(`git checkout baseline-aistudio-original` restores it exactly).

**Scope.** Several briefs asked for new systems (naval units, territory capture, new factions, a research tree, a rebuilt
art pipeline). The consistent, latest instruction is *preserve the original gameplay; repair and extend it*. New-game
systems were therefore **not** added. Gameplay code changed only where a defect was confirmed by a test (listed below).
Active renderer: the 2D canvas `TacticalRenderer` (3D `TacticalThreeRenderer` is an opt-in toggle); both read the same
`GameEngine` state.

## 1. Confirmed bugs (each reproduced before fixing) and fixes

| # | Area | Bug | Evidence | Fix |
|---|---|---|---|---|
| 1 | Recruitment | Population cap ignored queued units | probe: room 62, engine accepted 68 | queued units counted against the cap |
| 2 | Recruitment | Any building accepted any unit and charged for it | probe: Rifleman queued at HQ, $100 charged | refuse unless `requiredBuilding` matches |
| 3 | **Movement** | Units ordered onto a blocked tile (building/water) walked **into** it | probe: 8/8 units ended on blocked tiles | `pathfinding.ts`: ring search for nearest walkable goal; final waypoint no longer overwritten with the blocked pixel; formation slots snapped to walkable ground |
| 4 | **Defense** | After a threat ended, defenders stayed idle 150–180 px from home (stale `attack_move` never cancelled) | probe: 0/6 regrouped | return branch now cancels the stale order |
| 5 | **Radar / fog** | Threat list (warnings + Defense AI) used sensor range only, so fog-hidden enemies became threats the minimap did not show | probe: hidden enemy listed as threat | threats require fog visibility; a **powered** radar now reveals fog to its sensor radius so long-range warning still works |
| 6 | HUD | Resource chips in a scroller; Threat/TROOPS clipped; panels overlapped | screenshots | non-scrolling grid, compact numbers, shared `--hud-top` |
| 7 | AI tab | Placeholder (static text, no-op buttons); real engine AI API unused | source + runtime | `AiManagerCards` bound to `getAIModules/toggleAIModule` |
| 8 | Settings | Resolution scale, shadow quality, frame-rate target read by nothing | `grep` | wired; presets apply values; Particle Density added |
| 9 | Sheet | Declared snap states unused, no drag | source + test | drag handle, 3-state snap, never overlaps HUD/nav |
| 10 | Layout | Category/Settings tabs and building names clipped | screenshots | wrapping grids |
| 11 | Visual | Fog drawn as hard per-tile black rectangles (blocky edges) | screenshot comparison | 1px-per-tile alpha mask drawn with bilinear smoothing (same rules, soft edges, one `drawImage`) |

**Deliberate balance change (item 5):** a completed, powered Radar Station now reveals fog out to its 850 px sensor
radius (previously 700 px always). Unpowered radars are unchanged.

## 2. Added
- **Smart Recruitment** (AI tab): Balanced / Defensive / Armored / Infantry / Custom, credit-reserve budget, army-size target,
  custom percentages. Configures the engine's *existing* auto-production; it is real: from identical facilities Armored built
  3 infantry + 14 vehicles, Infantry built 24 infantry + 12 vehicles. Control is ON/OFF (the engine has no SUGGEST mode for production).
- Compact AI manager cards (live status, task, last action, real switches).
- Graphics presets Performance/Balanced/High/Ultra that set resolution scale, shadows, particles; FPS cap; particle density.

## 3. Checked and found fine
- Screen shake is off (default 0; renderers bypass the offset) — now tested.
- No float artifacts / NaN / Infinity / undefined in any panel (runtime scan, 3 viewports).
- Formations (line, column, wedge, spread, circle) are real destinations with distinct layouts and ≥25 px separation.
- Manual orders override auto-defense; selecting 203 units took 0.1 ms and dispatching a formation move ≤10 ms (Node timings).
- Building placement rejects overlap and charges nothing; all footprints are square so rotation is orientation-only.
- Enemy AI parity after all fixes: 3→18–19 units and 1→4 buildings in 240 sim-seconds.

## 4. Modified files
Gameplay (defect repairs only): `src/game/engine.ts` (queue guards; regroup; fog-gated threats; powered-radar fog reach, fog-slot
snapping), `src/game/pathfinding.ts` (blocked-goal handling). Render/UI: `renderer.ts` (shadows/particles/resolution/fog),
`renderQuality.ts`*, `smartRecruitment.ts`*, `App.tsx`, `index.css`, `utils/format.ts`, `MobileTopHUD.tsx`, `MobileBottomSheet.tsx`,
`AiManagerCards.tsx`*, `SmartRecruitmentCard.tsx`*, `MobileFloatingRadar.tsx`, `SettingsModal.tsx` (*new). Tests: `tests/*.test.ts`, `tests/e2e/*.cjs`.
Untouched: `ai.ts`, `combat.ts`, `mapGenerator.ts`, `data/`, `types/`.

## 5. Test results (all executed)
- `npm run lint` clean; `npm run build` ok; `npm test` **35/35** (engine, movement, defense/fog, smart recruitment, formatting).
- Browser (Chromium/Playwright): smoke 11/11 at 320×640, 360×740, 390×844, 844×390, 768×1024, 1280×720; sheet drag 12/12;
  placement/cancel 12/12; graphics settings 7/7; Smart Recruitment UI 30/30 at 3 sizes; number scan clean.

## 6. NOT done / not verified (honest list)
- **Art**: building, infantry, vehicle, aircraft, terrain and effect artwork is the original's; no atlases, no Three.js geometry
  or material upgrade, no new construction/destruction animation. Only the fog edge was improved.
- **Main menu / Settings redesign** (§13): not redesigned. Existing options untouched.
- **Combat refinements** (§6: cover, projectile collision, turret rotation, damage feedback): not audited or changed.
- **Enemy AI** (§10): unchanged; "avoid repeating the same attack route" and "react to player composition" not verified.
- **Touch controls** (§4): the original already has select-all/idle/same-type, control groups and long-press selection; I did not
  change or test them on real touch hardware. Camera side-effects of dragging panels were not tested on a device.
- **Placement recommendations** (§9): existing system not modified or audited beyond overlap rejection.
- **Decorative terrain blocking movement**: not audited (movement tests passed, but props were not individually checked).
- **Performance**: only Node timings (200 units: median 2.5 ms/tick) and headless-Chromium frame counting. No phone testing;
  **no 60 FPS, 2K or 4K claim**. Particle pooling, sprite batching and off-screen effect culling were not implemented.
- **Smart Recruitment** has no SUGGEST mode (engine limitation); `textureQuality`/`antiAliasing` remain unused types.
- Saves: no format change; queue round-trip tested; no real old saves available to test.

## 7. Run it
```
npm install --legacy-peer-deps      # original pins esbuild ^0.25 vs Vite 8's optional peer
npm run dev                         # or: npm run build && npx vite preview
npm run lint && npm test
node tests/e2e/smoke.cjs 390 844    # needs `playwright` + a running preview; see tests/e2e/README.md
```
