# Construction AI — five simultaneous projects (V6.2)

The Construction AI ("AI Base Architect") can now run up to **five independent construction projects at once**.
It is built on the game's real construction system: nothing is simulated, no progress bar is faked.

## How it works
- A **project** (`ConstructionTask`, `src/types/game.ts`) has: id, slot 1–5, building type, reserved site, status
  (`planned | waiting_resources | constructing | completed | failed | cancelled`), cost, a `charged` flag, the real
  `buildingId`, start/finish times and a bounded retry counter. Tasks live in `engine.aiArchitect.tasks`, so they are
  saved and loaded with the rest of the AI settings.
- **Choosing what to build** reuses the original doctrine decision tree (Balanced / Economy / Defensive / Offensive /
  Custom). It was moved unchanged into `engine.chooseArchitectBuilding(plannedTypes)`. Projects that are planned but not
  placed yet are counted as if they existed, so five plans never repeat the same building.
- **Sites** come from the engine's own `getRecommendedBuildingPositions` (which already validates terrain, overlap,
  range, blocked exits). It gained optional `limit`, `reserved` rectangles, `margin` and `ignoreFunds`; defaults keep the
  original behaviour. Each project reserves its site immediately, with a one-cell margin, so no two projects share space.
- **Starting** a project calls the existing `placeBuilding`, which validates again and deducts the cost exactly once.
  A project only starts when `credits − reserve − (cost of earlier waiting projects) ≥ cost`; otherwise it waits and makes
  no placement attempts. Credits can never go negative from construction.
- **Progress** is the real building's `constructionProgress`, advanced by the engine's normal update loop (including
  its existing half speed during a power deficit). `syncConstructionTasks` runs every frame and turns building state into
  task state: finished → `completed` (slot freed), destroyed → `failed`.
- **Modes** map onto the existing settings: OFF = Architect disabled, SUGGEST = existing `assisted` mode, AUTO = any
  doctrine. In SUGGEST the AI proposes up to five projects and starts none until approved. The original "AI ADVICE"
  banner still works and mirrors the first pending proposal. Manual building always works and takes priority: if a player
  builds on a reserved site, that project re-plans.
- **Loop protection**: a type with no valid site is put on a 30 s cooldown and the doctrine moves to its next priority;
  a project whose site keeps going invalid fails after 3 re-plans; a cancelled type is not restarted at once; a
  construction that does not finish within 4× its build time (+20 s) is marked failed; only one project may wait for
  credits at a time, so unaffordable projects do not pile up.

## Findings that shaped the design
- All buildings under construction **already progressed concurrently** in the engine. The real limits were the AI's own
  `maxConcurrentConstruction` (UI capped at 3) and one decision per call. No construction timer needed changing.
- `canPlaceBuilding` also fails for *insufficient funds*, so a naive site search cannot tell "no space" from "no money".
  The first version of this feature mislabelled unaffordable projects as "no site" and put them on cooldown. Caught by a
  test; fixed with the optional `ignoreFunds` flag (default `false`, so every existing caller is unchanged).
- The engine only runs the Architect in a short window every 2.5 game-seconds, so each cycle now plans and starts as many
  projects as free slots and credits allow (re-checking affordability after each).

## Interface (AI tab → "Construction AI — n/5 Active")
Mode (OFF/SUGGEST/AUTO), simultaneous limit 1–5, pause/resume, five slot cards (name, status, %, time left, cancel /
approve), "Approve all", reserved credits, last decision, recent failures, and collapsible Building priorities
(doctrine + custom weights, which are the existing settings). Cards wrap names instead of clipping them.

## Files
New: `src/game/constructionAI.ts`, `src/components/mobile/ConstructionAIPanel.tsx`, `tests/construction.test.ts`,
`tests/e2e/construction-ai.cjs`. Changed: `src/game/engine.ts` (tree extracted, hooks, defaults, `ignoreFunds`, candidate
options, save normalisation, limit 1–5, troop auto-production leaves credits reserved for approved projects),
`src/types/game.ts`, `src/components/mobile/MobileBottomSheet.tsx`.

## Tests (all executed)
`tests/construction.test.ts` (17) covers the 12 requested scenarios: five concurrent real projects; independent progress
equal to engine state; slot freed and refilled; insufficient credits (no attempts, no negative balance); no overlaps;
cancel one of five; OFF; SUGGEST needs approval; AUTO keeps managing; save/load of tasks and no double charge; manual
construction and re-planning; enemy AI, recruitment and combat still work. Plus bounded retries, limit clamping,
old-save compatibility and "one successful placement per project". Browser: `tests/e2e/construction-ai.cjs` (real UI at
390×844, 320×640, 844×390).

## Limits and decisions to know about
- Cancelling a **running** project uses the game's existing demolish rule (50% refund), not a full refund.
- The default limit is 5 for new games. A save made before V6.2 keeps the limit it had (the old default was 1).
- Lowering the limit never cancels running projects; they finish and no new ones start.
- Selection uses the original doctrine tree (power, population, existing buildings, doctrine, hostile aircraft). It was not
  replaced by a new evaluator, so factors such as "operational production facilities" and "enemy threat direction" are only
  as deep as the original logic. Site choice inherits the engine's own placement rules; no new road-preservation logic was added.
- Reserved credits are honoured by the troop auto-production module; manual recruitment and manual building are never blocked.
- The browser test used Sandbox mode (unlimited credits). Not tested on a physical Android device.

---

# V8.1 — Intelligent Construction AI (supersedes the "selection" notes above)

## Confirmed defects (reproduced before changing anything)
- The V6.2 planner walked the original doctrine ladder and, with the limit at 5 and plenty of credits, built whatever the
  ladder reached first again and again: **26–35 refineries and 7–10 reactors in 3–10 minutes** in a headless run.
  Duplicates were not counted against demand, and "fill every slot" was effectively a goal.
- Objective text showed the raw count: "Build Second Refinery (44/2)". It now shows `min(2, count)/2`; the real count is in the
  tooltip (`cappedProgress` in `src/utils/format.ts`). Objective completion logic is unchanged.

## How decisions are made (`src/game/constructionStrategy.ts`)
1. **Snapshot** of the real state: counts of finished + under construction + reserved sites + planned tasks, power
   (now and projected), income, queue pressure, population room, threats (ground/armour/air), turret coverage, mission needs.
2. **Mandatory gates** per building: your per-type limit, demand (need > 0), demand-based cap, cooldown, strategy focus,
   prerequisites (`requiredBuilding`), power safety.
3. **Weighted score** = need × role weight × (1 − 0.7·count/cap), + bonuses (mission objective, prioritise-defense).
   Below `MIN_SCORE` (25) nothing is built, so slots stay empty on purpose. Recomputed after every decision.
4. **Layout**: engine-validated candidate sites are re-ranked (spread, defensive side facing the threat, no site overlap with
   reserved ones). Walls are never built automatically.
Roles (multi-role allowed, existing building ids only): ECONOMY, POWER, ARMY_PRODUCTION, DEFENSE, TECHNOLOGY, LOGISTICS, SUPPORT.

## Strategies
Balanced Auto · Defense Only (asks approval for non-defense prerequisites such as a Barracks) · Army Production (power,
refineries and depots only as support) · Economy & Infrastructure · Adaptive Commander (re-prioritises from live conditions).
A power-blocked wish requests a reactor instead of deadlocking. Switching strategy cancels not-yet-started proposals only.

## Controls
AI tab → Construction AI: OFF/SUGGEST/AUTO, strategy, limit 1–5 (a maximum, never a target), pause, toggles (avoid duplicates,
allow prerequisite support buildings, prioritise base defense, reserve emergency credits), live slots with a one-line real
reason ("Building Power Generator: …", "Delaying X: Insufficient credits."), per-project cancel/approve, and an expandable
bounded (40) event-based decision log. Everything persists in the save; older saves get safe defaults.

## Tests
`tests/construction-ai-v81.test.ts` (30) + `tests/construction.test.ts` (17): roles, all five strategies, power shortage,
power-blocked reactor, attack → matched turrets, anti-air only with aircraft, duplicate prevention, empty slots, player limits
(also respected for prerequisites; mission-required buildings are never blocked), prioritise-defense, layout, safety/no negative
credits/single charge, OFF/SUGGEST, log explanations and bounds, save/load, strategy switch, objective cap.
Browser: `tests/e2e/construction-ai.cjs` (390×844, 320×640, 844×390). The test fixture stubs the skirmish enemy AI so
raids do not end the match mid-test.

## Remaining limitations
- Walls are not built automatically; the legacy doctrine ladder (`chooseArchitectBuilding`, doctrines, custom weights) still
  exists in the engine but the Construction AI no longer uses it, so the old "Building priorities" UI was removed.
- The default limit of 5 applies to new games; cancelling a running project refunds 50% (existing demolish rule).
- Scores are hand-tuned heuristics validated in simulations, not a learned model; not tested on a physical device.
- Tag `baseline-aistudio-original` could not be pushed to the remote (baseline is reachable by commit d456d60).
