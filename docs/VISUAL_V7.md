# Visual & UI pass (V7/V8) — audit, changes, measurements

Scope note: two very large briefs (V7.0 "Legendary Graphics" and V8.0 "Apex Edition") arrived together. Much of what they list
was already done in earlier rounds (AI managers, five-slot Construction AI, Smart Recruitment, selection, formations, defense,
presets, mobile HUD/sheets). This round audited each visual claim against the running game, fixed what the evidence supported,
and measured the cost. **A full rebuild of every building, unit and effect was not done** (see "Not done").

## Audit (evidence first)
| Claim in the brief | Finding |
|---|---|
| Battlefield not edge-to-edge, outer borders, margins | **False for this build.** The game canvas is exactly the viewport (x=0, y=0, full width and height) at 360×740, 390×844, 844×390, 768×1024 and 1280×720; root margin and padding are 0. Nothing to fix. |
| Duplicate camera buttons | **Confirmed**: "Center on Headquarters" existed 3 times, "Fit to Screen" twice (top camera row, a floating cluster in `App.tsx`, the radar header). |
| Flat, repetitive terrain | **Confirmed, and the cause identified**: the base ground colour was rounded to whole HSL percentages per 40px tile, producing stair-stepped squares; the brown "depression" ellipses were a fixed colour, giving a repeating dot pattern. |
| Square, flat buildings / oversized shadows | **Confirmed**: the roof was a plain rounded rectangle and the shadow one hard, large, offset rectangle. Buildings already had extruded walls and type-specific details. |
| Custom composition must total 100% | The engine divides each share by the total (relative weights), so any total worked; there was no validation or feedback. |

## Changes
- **Duplicate controls removed.** HQ / Fit now live once, in the top camera row. The radar header keeps only its expand control (now a 28px touch target, was 12px). The "Selection" focus button remains because it has no equivalent.
- **Natural ground (High/Ultra).** `groundTexture.ts`: a deterministic noise colour field (large patches, meadows, fine grain; muted, dark, low-saturation so units stay readable), rendered into cached 12-tile chunks and blitted each frame. Chunks are computed straight from the noise, so the ground extends seamlessly past the map edge. Collision, tiles and pathfinding are untouched. The decorative brown dots are rarer, softer and irregular.
- **Buildings (all types, footprints unchanged).** Soft two-layer shadows (cached), a contact shadow at the wall base, wall and roof shading, bevel, seams, rivets and per-building weathering (cached sprite). Skipped on the Performance preset. Type-specific details are drawn on top as before.
- **Smart Recruitment composition.** Compact numeric inputs (0–100, clamped), live total with "unallocated / over" feedback, and a **Normalize to 100%** action (largest-remainder rounding, ratios preserved). The engine's behaviour is unchanged because it already treats the numbers as proportions.

## Measured performance (honest)
Method: the same populated Sandbox base (five AI constructions), 6× CPU throttle, headless Chromium (software rendering), counting
`requestAnimationFrame` callbacks over 4 s. This is a **relative** benchmark, not a phone measurement.

| Build / preset | FPS |
|---|---|
| V6.2, default settings (baseline) | 8.7 – 9.7 |
| V7, first implementation (uncached, Ultra) | 6.4 – 6.8 (about 30% **slower**) |
| V7 High / Ultra after caching (smooth ground) | 7.1 – 8.0 |
| V7 Balanced | 11.2 |
| V7 Performance | 18.4 |

What happened: profiling with temporary switches showed the smooth-ground blit cost about 2.6 fps and the new shadows about 0.7; the
material layer cost almost nothing. Caching (chunks, shadow and material sprites) recovered about half of the loss. The rest is the
price of a resampled bitmap on a CPU rasteriser, so the smooth ground is a **High/Ultra feature**; Balanced and Performance keep the
original flat fill. On a GPU-accelerated device the gap is expected to be smaller, but that was not measured. **No 60 FPS, 2K or 4K claim is made.**

## Tests
`tests/visual-logic.test.ts`: normalization (total exactly 100, ratios kept, invalid input), ground colour field (deterministic, gentle
gradient, muted, not tile-periodic). Browser: updated Smart Recruitment suite (39 checks) covers the numeric inputs, the over-100% flag,
Normalize and clamping. A pixel scan of a ground-only region found no chunk-seam signature.

## Not done (V7/V8 items I did not implement)
- Redesign of each building's silhouette and of unit art (infantry, tanks, artillery, aircraft, drones): units are unchanged; buildings got
  a shared material pass, not new models. No sprite atlases, no new construction/destruction animations, no new track/rotor/turret animation work.
- Roads, water, cliffs, vegetation and resource deposits are the original drawings; only the temperate base ground changed. Other biomes unchanged.
- Combat effects (muzzle flash, trails, explosions, smoke) were not reworked. Audio was not touched.
- Radar was not redesigned beyond removing the duplicate and enlarging the expand control; bottom-nav icons and the main menu were not redesigned.
- Not audited: memory leaks, pause/resume edge cases, notification wording. Not tested on a physical device.
