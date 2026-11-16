/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GameEngine } from './engine';

/**
 * Mission objectives (V12), computed from live game data every time they are read. Nothing here is stored or faked:
 * an objective is complete only when the measured progress reaches its target.
 */
export interface Objective {
  id: string;
  text: string;
  progress: number;   // whole number, capped at target
  target: number;
  completed: boolean;
}

export function getObjectives(engine: GameEngine): Objective[] {
  const mission = engine.currentMission;
  if (mission) {
    return mission.objectives.map(o => ({ id: o.id, text: o.text, progress: o.completed ? 1 : 0, target: 1, completed: !!o.completed }));
  }
  const ts = engine.mapData.tileSize;
  const own = engine.buildings.filter(b => b.faction === 'player' && b.hp > 0);
  const nodes = engine.mapData.resourceNodes;
  const secured = nodes.filter(n => own.some(b => Math.hypot(b.pixelX - n.x * ts, b.pixelY - n.y * ts) < 350)).length;
  const depositTarget = Math.max(1, nodes.length); // every deposit on the map (same target the old panel showed)
  const refineries = own.filter(b => b.type === 'coin_generator' && b.constructionProgress >= 1).length;
  const list: Objective[] = [
    mk('secure_deposits', 'Secure titanium deposits', secured, depositTarget),
    mk('second_refinery', 'Build a second refinery', refineries, 2),
  ];
  if (engine.mode === 'skirmish' || engine.mode === 'custom') {
    const enemyHQ = engine.buildings.some(b => b.type === 'headquarters' && b.faction === 'enemy');
    const won = engine.matchEnd?.outcome === 'victory';
    list.push(mk('destroy_enemy_hq', 'Destroy the enemy headquarters', enemyHQ && !won ? 0 : 1, 1));
  } else if (engine.mode === 'defense') {
    list.push(mk('survive_waves', 'Hold the base against the assault waves', Math.max(0, engine.defenseWave - 1), 10));
  }
  return list;
}

function mk(id: string, text: string, value: number, target: number): Objective {
  const progress = Math.max(0, Math.min(target, Math.floor(value)));
  return { id, text, progress, target, completed: progress >= target };
}
