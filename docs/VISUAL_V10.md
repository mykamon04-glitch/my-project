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

---

# V10.1 — Modern military realism (material pipeline)

## Why V10 still read as a cartoon
Flat single-colour faces, a dark outline around every shape, bright saturated accents and lit rings, light uniform pads, and
exaggerated proportions (tall leaning towers, oversized dishes and flags). Geometry, materials, lighting and proportions all
needed replacing, so `src/game/buildingArt.ts` was rewritten.

## What the new system does
- **Materials** (`concrete`, `corrugated`, `slate`, `armor`, `galv`, `paint`): every face gets a lighting gradient (walls darken
  towards the ground), a surface texture (form-work lift lines and panel joints, corrugation, roof seams, bolt rows), weathering
  (rain and rust streaks, dust at wall bases, roof stains) and hairline edges with a lit top edge. No outlines.
- **Light**: one sun from the north-west; each volume casts a soft shadow onto the slab or the roof below it.
- **Ground**: weathered concrete slabs with expansion joints, oil/dust stains, tyre marks, worn paint and a dusty feathered rim.
- **Film grain** over each finished sprite. All of this runs once per (type, faction, size) into a cached sprite.
- **Palette**: neutral concrete, desaturated olive/tan armour, gunmetal, dark slate roofs, restrained industrial yellow, warm
  white lighting. Faction identity is a thin painted band and a small flag. A test rejects saturated base tones.
- **Redesigns**: HQ (podium, set-back command block, armoured wing, blast portal, ops room, roof HVAC, lattice comms mast,
  checkpoint with barriers and boom gate); Barracks (two low blocks with shallow slate roofs, doors, ridge vents, store, assembly
  square); War Factory (portal-frame hall with columns, two roll-up vehicle bays, ridge ventilator, extract fans, exhaust stacks,
  office lean-to, marked apron); Power Plant (turbine hall with louvres, exhaust stacks, fin-fan coolers, pipe rack, transformer
  yard with bus gantry and fence); Refinery (process building, silos, tank with ladder, pipe rack, inclined conveyor, loading
  bay); Airfield (barrel-vault hangars, apron, runway markings, tower); plus depot, lab, radar (lattice tower with rotating
  open-frame antenna), repair bay, hospital, SAM battery, gun/AA emplacements with a rotating angular gun house, casemate bunker
  and precast walls with guard posts.
- **States from real game state**: construction (excavation → rebar and pour → steel frame with the real design rising inside it
  → finishing), operational (fans, exhaust haze, lamps that follow the production queue, radar rotation), damaged (soft scorch,
  hairline cracks, smoke, and lighting that dims below 60% HP and goes out below 30%), destroyed (scorched cracked foundation with
  wall stubs, rubble and bent steel that smoulders, then fades after ~4 minutes or when the site is rebuilt).
- **Environment**: service roads are weathered concrete with joints and tyre wear; terrain is a muted olive grassland drifting
  to dry earth with a fine grain/tuft micro-texture.

Screenshots from the running game are in `docs/shots/` (`v10_before_*`, `v10_1_after_*`, construction, damage and ruins).

## Verification
- Unit tests 128/128 (building-art: 11, including muted-palette, damage-dimming and wreckage checks). Browser suites all pass.
- Headless Chromium, 19 buildings, 390x844 @2x: 36.0-38.7 fps unthrottled (V10: 38.1-40.2; pre-V10: 39.8-40.0) and 4.8 fps at
  6x CPU throttle (V10 5.3-5.4, pre-V10 5.5-5.9). So roughly 5-10% slower than before the overhaul on this software-rendered
  setup; relative numbers only.

## Limitations (honest)
- This is procedural 2D canvas art. It is far closer to a realistic military RTS than V10, but it is not photorealistic and does
  not match pre-rendered 3D reference art; that would need licensed or commissioned sprite/model assets, which are not in the
  project.
- Units (tanks, infantry, aircraft) and terrain props keep their earlier style and now look more stylised than the buildings.
- Wreckage is visual memory in the renderer: it is not saved, and a building that dies off-screen before ever being drawn leaves
  none. Demolishing a completed building also leaves wreckage.
- Soft shadows use canvas `filter: blur`; browsers without it get hard-edged shadows.
- Same top-down oblique projection as before; not tested on a physical device.
