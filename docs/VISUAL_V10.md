# V10 — Base architecture & 2.5D visual overhaul

## What changed
- **`src/game/buildingArt.ts` (new)**: every one of the 17 existing building types has its own 2.5D design made of real
  volumes (roof + south wall + darker east wall, light from the north-west), cylinders, domes, gabled/sawtooth/arched roofs,
  pipes, ramps, windows, crates, fences and machinery. Headquarters (multi-tier hall, command tower, antennas, dish, glowing
  display), Barracks (two gabled dorm blocks, entry ramp, equipment store, training yard), War Factory (assembly hall with
  sawtooth roof, hazard-striped bay door, vehicle-exit marking, gantry crane, smokestacks), Power Plant (cooling towers, pipes,
  finned transformers, animated energy indicators), Refinery (silos, tanks, conveyor with moving ore, flare stack), Airfield
  (arched hangars, runway markings and lights, control tower, windsock), Helipad, Research Lab (dome, glass atrium, cooling
  fans), Storage Depot (containers, warehouse, fence), Radar Station (rotating dish), Repair Bay (gantry + robotic arm),
  Field Hospital (red-cross roof, tent), turrets, missile battery, AA flak and bastion bunker, and modular walls that connect
  to neighbours and gain watchtowers at corners and ends.
- **Rendering**: static geometry is drawn once per (type, faction, size) into a 2x cached sprite; only animated parts are drawn
  per frame (dish rotation, turret barrels, lights, smoke, crane, flags, conveyor). Player/enemy variants differ in accent
  colour and flags. Level ≥ 2 adds rank chevrons.
- **Real-state animation**: turrets rotate towards `targetUnitId` and recoil with muzzle flash from `lastAttackTime`; factories
  react to a non-empty production queue; repair bay reacts to `isRepairing`.
- **Construction** is a pure function of the real `constructionProgress` (`constructionStage`): 0-20% ground preparation,
  hazard-taped footprint and concrete pour with rebar; 20-90% the real design rises from the ground with scaffolding, welding
  line, tower crane with moving hook and a work vehicle; 90-100% scaffolding comes down; at 100% the building is operational
  and its lights switch on. There is no second timer. Up to five projects animate independently because each building has its
  own progress.
- **Placement hologram** uses the real design tinted green (valid) or red (blocked).
- **Base integration**: asphalt spine south of each HQ with feeder roads to production/industrial buildings (visual only; never
  read by pathfinding or placement), concrete aprons under every building.
- Footprint, selection, collision, pathfinding, costs, build times, save format and all gameplay are unchanged. Art stays
  inside the footprint horizontally (tested).

## Tests and measurements
- `tests/building-art.test.ts` (9): every building has a design and none was added/removed; designs are different and
  detailed; major buildings differ strongly; player/enemy variants differ; art stays inside the footprint; turret aim/recoil,
  production and radar animation depend on real state; wall connections; construction stages follow progress.
- All unit tests (126) and the browser suites (smoke, placement-cancel, sheet-drag, graphics-settings, select-troops,
  construction-ai, smart-recruitment) pass.
- Performance (headless Chromium, software rendering, 19 buildings, 390x844 @2x): ~40 fps for both the previous and the new
  renderer unthrottled (39.8/40.0 vs 38.1/40.2); at 6x CPU throttling 5.5/5.9 (old) vs 5.3/5.4 (new), i.e. roughly 5% slower
  under heavy throttling, within run-to-run noise. These are relative numbers on a headless machine, not a device claim.

## Audit notes (not rewritten)
Ground units already had rotating tank turrets, recoil, muzzle flashes, tread animation and an infantry leg-swing; combat
effects, health bars (rounded integers), select-all, mission-objective cap, AI construction control and save/load were fixed in
earlier phases and are unchanged. Camera shake stays disabled.

## Limitations
- The view remains the game's top-down oblique 2.5D projection (roof/south/east faces), not a rotated isometric diamond grid:
  converting would change picking, fog, pathfinding and placement. Buildings therefore read as isometric-style volumes inside
  the existing square grid.
- Infantry and aircraft art were not redrawn in this pass; terrain was only extended with roads and aprons.
- Not tested on a physical device.
