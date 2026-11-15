/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Faction, Unit, Vector2 } from '../types/game';
import { UNIT_CONFIGS } from '../data/gameData';

/**
 * Unit picking (V11). Units are drawn standing up (and aircraft at their altitude), so a tap must be tested against the
 * point where the unit is seen, not only its ground position, and the nearest candidate must win when several are close.
 */

/** Where the middle of a unit is drawn, in world coordinates. */
export function unitAimPoint(u: Unit): Vector2 {
  const cfg = UNIT_CONFIGS[u.type];
  if (cfg.isAir) return { x: u.x, y: u.y - (u.altitude || 55) };
  return { x: u.x, y: u.y - (cfg.category === 'infantry' ? 8 : 5) };
}

/** Distance from a world point to a unit: the closer of its drawn body and its ground position. */
export function pickDistance(u: Unit, world: Vector2): number {
  const a = unitAimPoint(u);
  return Math.min(Math.hypot(a.x - world.x, a.y - world.y), Math.hypot(u.x - world.x, u.y - world.y));
}

/** Nearest living unit (optionally of one faction) within `radius` of the world point. */
export function pickUnit(units: readonly Unit[], world: Vector2, radius: number, faction?: Faction): Unit | undefined {
  let best: Unit | undefined, bestD = radius;
  for (const u of units) {
    if (u.hp <= 0 || (faction && u.faction !== faction)) continue;
    const d = pickDistance(u, world);
    if (d <= bestD) { bestD = d; best = u; }
  }
  return best;
}
