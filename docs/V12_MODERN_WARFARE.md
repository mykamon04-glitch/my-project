# IRON DOMINION V12: Modern Warfare Edition

V12 adds a complete headquarters victory/defeat system and redesigns the mobile interface to free the battlefield. It
also cleans up battlefield clutter, polishes terrain and combat effects, routes every command through the engine, makes
the enemy AI defend its base, and adds an adaptive Auto graphics preset. The economy, construction, recruitment, AI
commander, combat rules and save format all keep working; saves gain two optional fields.

## Phase A: audit findings (each confirmed before it was fixed)

| Finding | Evidence |
| --- | --- |
| Destroying the enemy HQ did not win a default skirmish | The default rule was "annihilation" (HQ **and** every enemy unit). A probe destroyed the enemy HQ with 3 enemy units alive and the status stayed `playing`. |
| Losing your HQ did not lose | Defeat required the HQ **and** every friendly unit. A probe destroyed the player HQ with 3 units alive and the status stayed `playing`. |
| The outcome modal re-opened (and re-recorded career progress) whenever it was closed | The App compared `gameStatus` with the open modal on every frame. |
| "Secure Titanium Deposits (2/5)" always showed a completed checkmark | The icon was unconditional in `App.tsx`. |
| The enemy HQ shelled from long range never triggered the defence | The threat radius is 450 px; artillery range is 530 px. In a probe the HQ lost 693 HP in 12 s while its 4 defenders did not move. |
| Desktop shortcuts A/S changed unit state directly | They bypassed engine commands (and would bypass a read-only battlefield). |

## Phase B: match state machine and victory/defeat

`PREPARING → PLAYING → VICTORY / DEFEAT → RESULTS`, in `GameEngine` (`matchPhase`, `matchEnd`, `matchStats`).

- **Authoritative.** The outcome is decided in `checkMatchEndConditions()`, and only after the engine's building update
  has processed the HQ's destruction (removed the entity and recorded where it fell). Nothing visual can trigger it.
- **Rules per mode.**

  | Mode | Victory | Defeat |
  | --- | --- | --- |
  | Skirmish / custom (default `destroy_hq`) | Enemy HQ destroyed | Player HQ destroyed |
  | Skirmish / custom, when configured `annihilation` / `domination` | Enemy HQ and enemy army gone | Player HQ and army gone |
  | Campaign | All mission objectives complete | Player HQ destroyed |
  | Defense | (survival mode) | Player HQ destroyed |
  | Sandbox | none | Original rule |

- **Exactly once.** `endMatch()` runs a single time. If both HQs fall in the same simulation step, the result is
  **DEFEAT** (one outcome, never both). `consumeMatchOutcome()` hands the result to the UI once.
- **Destruction sequence (3 s).** When the outcome is decided, the losing side's production queues, construction,
  orders and in-flight shots are cancelled and its units hold fire. Secondary detonations play at the fallen HQ while
  units, shots and effects settle. No economy, AI, production or construction runs during the sequence. The simulation
  then freezes for RESULTS.
- **Results screen** (`src/components/MatchResults.tsx`): VICTORY / ENEMY HEADQUARTERS DESTROYED or DEFEAT / YOUR
  HEADQUARTERS HAS FALLEN. It shows match duration, enemy units eliminated, friendly units lost, enemy structures
  destroyed, buildings constructed, resources collected, damage dealt and damage taken, plus the mission summary in
  campaigns. Buttons: PLAY AGAIN, RETURN TO MAIN MENU, VIEW BATTLEFIELD.
- **Read-only battlefield.** After the outcome, every engine command refuses to act (move, attack, build, recruit,
  research, rally, repair, demolish, nuke). The guard sits in the engine, so no UI path can get around it. A banner
  re-opens the results.
- **Save / load** keeps the victory rule and statistics. Loading always resumes PLAYING.

## Phase C: mobile interface

- **Top HUD**: one slim bar showing credits and income, power used/available, troops (tap selects all troops), and
  threat level with the hostile count, plus the menu. Below it, on a transparent line, sit the compact mission tracker
  and the camera tools (HQ, fit, follow, zoom, radar).
- **Mission tracker** (`MissionTracker.tsx`, `src/game/objectives.ts`): collapsed to `MISSION n/m`. Objectives are
  computed from live data: an objective is complete only when the measured progress reaches its target. Completed
  objectives fold into one line, and the tracker collapses itself after a completion.
- **Developer tools** left the battlefield HUD. They are in the menu, for sandbox matches or `?debug=1`.
- **Selection dock**: `N UNITS SELECTED` with MOVE | ATTACK | DEFEND | MORE. MORE expands, in place:
  - filters: Select All, Idle, Combat, Infantry, Vehicles, Aircraft;
  - orders: Stop, Patrol, Hold Position, Retreat;
  - formation, and per-type chips.

  An ✕ clears the selection. MOVE, ATTACK, DEFEND and PATROL work as "tap the command, then tap the target", and a hint
  says what to tap.
- **Radar**: compact by default and expandable. Both HQs are highlighted, and the enemy HQ location stays marked under
  fog because it is the objective. All aircraft types are drawn as aircraft. Tapping the radar moves the camera
  (unchanged).
- **Bottom navigation**: slimmer (44 px touch targets), with the same five tabs.

## Phases D/E: battlefield, controls, AI, performance

- **Health indicators**:
  - healthy, unselected units show nothing;
  - damaged units show a small bar;
  - selected units show whole-number values ("95/120") only when 3 or fewer units are selected and the label does not
    overlap another.

  Damage numbers are merged per unit (one label, running total), smaller and outlined.
- **Terrain**: soft bare-earth patches replace the hard dark ovals that read as holes, natural boulders replace the
  slate-blue boxes, and foliage colours are muted.
- **Combat**:
  - directional muzzle-flash cones;
  - explosions with a fireball, a thin expanding ring, debris and rising smoke, drawn additively and fading (no
    screen-filling discs, no screen flash, camera shake still off);
  - red brackets mark what the selected units are attacking;
  - medic heal effects are soft glows.
- **Desktop**: right-click is contextual (unchanged). Keyboard: M / A / D / P then click; S stop; G hold position;
  Ctrl+1-5 / 1-5 control groups; H headquarters. All of these go through engine commands.
- **Enemy AI**: any structure losing HP triggers a response aimed at the units actually attacking it. The HQ commits the
  whole army; an outlying structure gets the nearest half of the army. The original near-HQ rule is kept.
- **Auto graphics preset** (`AutoQuality`): measures real frame intervals, steps down after a 2.5 s window under the
  threshold, and back up (never above High) after 10 s of headroom. Thresholds follow the frame-rate cap.
- **Performance**: soft effects use cached glow sprites instead of a new gradient per particle or tile.

## Verification

- Unit tests: **164 passed** (12 files). New suites: `tests/match-v12.test.ts` (11), `tests/ai-v12.test.ts` (2),
  `tests/quality-v12.test.ts` (3). The match tests include an HQ destroyed by real tank fire, defeat with troops alive,
  simultaneous HQ loss, a single outcome, the read-only battlefield, restart, save/load and objectives.
- Browser (e2e) suites: **9 suites, 207 checks, 0 failures**, including the new `tests/e2e/match-end.cjs` (victory on
  desktop and defeat on a phone, run end to end) and `select-troops.cjs` updated for the new dock.
- `tsc --noEmit` clean; `vite build` succeeds.
- Performance: headless Chromium, 390×844 @2x, 60-unit battle, 6 s, same machine, V11 build vs V12 build.

  | CPU | V11 fps | V12 fps |
  | --- | --- | --- |
  | 1× (unthrottled) | 45.0 | 47.2 / 52.0 |
  | 4× throttled, run 1 | 8.4 | 8.4 |
  | 4× throttled, run 2 | 9.3 | 9.6 |

  The V12 builds are on par with V11 within run-to-run noise. These figures compare builds; they do not predict any
  particular phone.

Screenshots (`docs/shots/`): `v12_compare_hud.png`, `v12_compare_selection.png`, `v12_compare_combat.png`
(V11 left, V12 right), `v12_mobile_selected.png`, `v12_mobile_more_expanded.png`, `v12_desktop_combat.png`,
`v12_hq_destruction_sequence.png`, `v12_victory_desktop.png`, `v12_defeat_mobile.png`, `v12_readonly_battlefield.png`.
All were captured from the running game.

## Limitations

- Buildings and units use the V10.1 / V11 art (procedural, pre-rendered 3D models). V12 polished terrain and effects
  but did not redraw buildings or units again.
- Rule choice: a tie (both HQs destroyed in the same step) is a defeat.
- Defense mode has no victory condition. It is a survival mode, as before.
- The optional Three.js 3D mode is unchanged; the match system works in both modes because it lives in the engine.
- Long-press contextual commands and two-finger box selection were not added on touch. Touch uses tap-to-select, the
  command buttons, drag-to-pan and pinch-to-zoom.
