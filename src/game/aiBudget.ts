/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BUILDING_CONFIGS } from '../data/gameData';
import type { GameEngine } from './engine';
import { analyseBase } from './constructionStrategy';
import type { ConstructionTask } from '../types/game';

/**
 * Shared AI planning budget (V8.2).
 *
 * Construction, recruitment (Smart Recruitment / auto-production), defense and repair all spend the SAME credit pool
 * (`engine.economy.credits` stays the source of truth; nothing is duplicated). The budget only decides how much of it a
 * given priority tier may touch:
 *
 *   tier 1  imminent base loss (urgent defense)         may use everything, including the emergency reserve
 *   tier 2  essential infrastructure (power, repair)    leaves the emergency reserve alone
 *   tier 3  sustainable power / income                   also leaves money held for urgent defense
 *   tier 4  military capability                          also leaves a recruitment floor so queues are not starved
 *   tier 5  expansion (tech, air, radar)                 same as 4
 *
 * Emergency priorities therefore override normal allocations, and a lower tier can never starve a higher one.
 */

export interface PlanningBudget {
  credits: number;
  reserve: number;          // emergency reserve (player setting, and recruitment's own reserve when it is on)
  urgentHold: number;       // credits held for an urgent defense when the base is threatened and uncovered
  recruitFloor: number;     // credits left for unit production when the army is small and production is running
  committed: number;        // approved construction projects whose cost is already earmarked
  spendable: (tier: number) => number;
  notes: string[];          // human-readable reasons for the holds above (only real ones)
}

export function planningBudget(e: GameEngine, pending: ConstructionTask[]): PlanningBudget {
  const a = e.aiArchitect;
  const snap = analyseBase(e, pending);
  const reserve = Math.max(a.reserveCredits, e.autoProduction.enabled ? e.autoProduction.reserveCredits : 0);
  const notes: string[] = [];

  const sev = snap.threatLevel === 'RED' ? 4 : snap.threatLevel === 'ORANGE' ? 2 : snap.threatLevel === 'YELLOW' ? 1 : 0;
  const defensePending = (snap.counts.turret_gun?.building ?? 0) + (snap.counts.turret_gun?.planned ?? 0)
    + (snap.counts.turret_missile?.building ?? 0) + (snap.counts.turret_missile?.planned ?? 0);
  const urgentHold = sev >= 2 && snap.groundCoverage < 0.5 && defensePending === 0 ? BUILDING_CONFIGS.turret_gun.cost : 0;
  if (urgentHold) notes.push(`$${urgentHold} held for an urgent defense (threat ${snap.threatLevel}, ${Math.round(snap.groundCoverage * 100)}% covered)`);

  const recruiting = e.autoProduction.enabled && snap.pop < snap.popCap && snap.armyUnits < e.autoProduction.targetArmySize && (snap.total('barracks') + snap.total('vehicle_factory')) > 0;
  const recruitFloor = recruiting ? 300 : 0;
  if (recruitFloor) notes.push(`$${recruitFloor} left for recruitment (army ${snap.armyUnits}/${e.autoProduction.targetArmySize})`);
  if (reserve > 0) notes.push(`$${Math.round(reserve)} emergency reserve`);

  const committed = pending.filter(t => t.approved && !t.charged).reduce((n, t) => n + t.cost, 0);

  return {
    credits: e.economy.credits,
    reserve,
    urgentHold,
    recruitFloor,
    committed,
    notes,
    spendable: (tier: number) =>
      e.economy.credits - (tier <= 1 ? 0 : reserve) - (tier >= 3 ? urgentHold : 0) - (tier >= 4 ? recruitFloor : 0),
  };
}
