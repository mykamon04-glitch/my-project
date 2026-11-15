# IRON DOMINION V11: Military Unit Overhaul

V11 replaces the old unit drawings with 3D models of every unit, animated from the real combat engine. Gameplay rules,
balance, the unit catalog (36 types) and save data are unchanged.

## How the units are made

Each unit is a real 3D model built in code (boxes, lofted hulls, cylinders, ellipsoids), so it can be lit and shown from any
facing. The art can be rebuilt from the source at any quality and needs no external art files.

| Module | Role |
| --- | --- |
| `src/game/units/raster.ts` | Software rasteriser that renders a model to a sprite: z-buffer, sun and fill lighting, procedural materials (camouflage, worn paint, metal, glass, rubber, track links), edge darkening, cast ground shadow. Pure TypeScript, no DOM. |
| `src/game/units/palette.ts` | Muted military materials. The player has olive and woodland camouflage; the enemy has tan and desert camouflage. Small painted team markings complete the identification. |
| `src/game/units/soldier.ts` | Articulated soldier: leg forward kinematics with ground contact, two-bone arm IK onto the weapon, 10 weapon types, headgear, armour, packs and kit. Clips: idle, walk, run, advance (walking fire), aim, fire, reload, hit, work (heal / repair), die. |
| `src/game/units/vehicles.ts` | 16 vehicle models: tracked and wheeled hulls, separate turrets with pivot, recoil and gun elevation (artillery, MLRS, AA and SAM raise their launchers to fire). |
| `src/game/units/aircraft.ts` | 9 aircraft: gunship, utility and tandem-rotor helicopters, three jets, two multicopter drones and a UCAV, with rotor and propeller mount points. |
| `src/game/units/models.ts` | Unit registry and `renderLayer()` (type, faction, layer, facing, frame → sprite with named marks such as `muzzle`). Also `muzzleOffset()`, used by the engine to start shots at the barrel the player sees. |
| `src/game/units/unitAnim.ts` | Animation state machine. |
| `src/game/units/unitSprites.ts` | Run-time sprite cache with a per-frame generation budget and an LRU pixel budget. |
| `src/game/units/unitRenderer.ts` | Draws units on the canvas: hull and turret composition, aircraft at altitude with ground shadow, live rotors, muzzle flashes, selection rings, health / rank / squad overlays, casualties and wrecks. |
| `src/game/unitPicking.ts` | Tap and box selection against the point where a unit is drawn (aircraft at altitude), choosing the nearest unit. |

Buildings and units share one projection: an orthographic 3/4 view from the south with straight verticals
(`screen y = ground y - height`). Building art `K` is therefore 0. Buildings and ground units are painted back to front,
so a unit north of a building is hidden behind it.

## Animation is driven by the engine

The animation code never invents gameplay. Every state comes from what the simulation did:

| State | Source |
| --- | --- |
| MOVING / RUNNING | Distance travelled since the last frame. The gait phase advances by distance (walk cycle 26 px, run 38 px, scaled with the soldier), so feet do not slide. Tracks also advance by distance. |
| TURNING | Real change of `rotation`. |
| AIMING | The engine's target (`isAttacking` with a target id). |
| ATTACKING | A short window after the engine's own `lastAttackTime`. Muzzle flash and recoil come from `muzzleFlash` / `recoilOffset`. |
| RELOADING | Shown during the real attack cooldown, for weapons slower than one shot per second. |
| TAKING_DAMAGE | A real drop of `hp`. |
| HEALING / REPAIRING | Real heal and repair pulses (`healCooldown`). The medic or engineer faces the patient or job (`workAngle`). |
| DYING / DESTROYED | Every fallen unit leaves a visual record: soldiers fall and stay down, vehicles become burnt-out wrecks with the turret knocked askew, aircraft drop and crash. Records fade out after 25 s. |

Turrets turn independently of the hull (`turretRotation`). Helicopter and drone rotors spin live, fixed-wing aircraft
bank in turns (`bankAngle`), and hovering aircraft bob slightly.

## Quality presets

| Preset | Sprite resolution | Facings (hull / turret, infantry always 8) | Cache budget | Generation per frame |
| --- | --- | --- | --- | --- |
| Performance | 2 texels / px | 16 / 16 | 6 Mpx | 3 ms |
| Balanced | 2.5 | 24 / 24 | 10 Mpx | 4 ms |
| High | 3 | 32 / 32 | 16 Mpx | 5 ms |
| Ultra | 4 | 32 / 32 | 26 Mpx | 6 ms |

Sprites are created on demand and shared by every unit in the same pose. A pose that is not ready yet keeps the
unit's previous sprite for a frame or two. Shadow quality "off" renders units without cast shadows.

## Defects fixed (confirmed by test before the fix)

- Unarmed units (medic, medical APC, logistics truck: damage 0) locked onto enemies and fired zero-damage shots with
  muzzle flashes. They now never acquire targets. Healing and repair are unchanged.
- Aircraft could not be selected by tapping where they are drawn (75 px above their ground point). Picking now tests the
  drawn position and selects the nearest unit; box selection includes it as well.
- Aircraft health bars were drawn inside the rotated, banked frame. Overlays are now always upright.
- Six aircraft types shared one quadcopter drawing and eight vehicle types shared one tank drawing. Every type now has its
  own model.
- Infantry walked on a timer (foot sliding). The gait now follows distance.
- Infantry deaths used the vehicle explosion with a shockwave ring. They now raise a small dust puff.

Shots are still simulated along the same ground track with the same damage. Only how they are drawn changed: they start
at the visible muzzle and meet the target at its height (aircraft at altitude).

## Measurements (headless Chromium, 390x844 @2x, 60-unit battle, 6 s)

| Build | CPU | fps | p95 frame |
| --- | --- | --- | --- |
| Before (V10.1) | 1x | 45.1 | 33.4 ms |
| V11, High | 1x | 46.4 | 33.4 ms |
| Before (V10.1) | 4x throttled | 9.6 | 116.7 ms |
| V11, High | 4x throttled | 9.8 | 116.7 ms |
| V11, Performance / Balanced / Ultra | 1x | 58.8 / 59.8 / 44.3 | 16.8 / 16.7 / 33.4 ms |

These numbers compare builds on the same machine. They are not a forecast for a particular phone.

## Limitations

- The models are procedural, low-polygon and pre-rendered. They are consistent and readable military models, not
  hand-painted AAA character art.
- Infantry is drawn at 1.3x scale next to vehicles so it stays legible at gameplay zoom.
- The engine has no take-off or landing; aircraft always fly at their fixed altitude. Crashes are visual only.
- Units turn in place along their movement heading (the engine has no strafing), so there is no side-step animation.
- The recovery vehicle has `canRepair` in its data, but only the engineer repairs in the engine, so the recovery vehicle
  shows no repair state. This is the existing gameplay, not changed in V11.
- The optional Three.js renderer (`threeRenderer.ts`) is unchanged.

Screenshots: `docs/shots/v11_before_*.png` and `docs/shots/v11_after_*.png` (overview, infantry, vehicles, aircraft, enemy,
mobile, combat), all captured from the running game.
