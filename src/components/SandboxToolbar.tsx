/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { PlusCircle, Skull, Zap, Radiation, Eye } from 'lucide-react';
import { GameEngine } from '../game/engine';

interface SandboxToolbarProps {
  engine: GameEngine;
  onRefresh: () => void;
  cameraPos: { x: number; y: number };
}

export const SandboxToolbar: React.FC<SandboxToolbarProps> = ({
  engine,
  onRefresh,
  cameraPos,
}) => {
  const addFunds = () => {
    engine.economy.credits += 10000;
    onRefresh();
  };

  const spawnTank = (type: 'main_battle_tank' | 'heavy_tank' | 'artillery') => {
    engine.spawnUnit(type, 'player', {
      x: cameraPos.x + (Math.random() - 0.5) * 50,
      y: cameraPos.y + (Math.random() - 0.5) * 50,
    });
    onRefresh();
  };

  const spawnEnemySquad = () => {
    const types = ['rifleman', 'heavy_gunner', 'light_tank', 'rocket_soldier'] as const;
    for (let i = 0; i < 5; i++) {
      const t = types[Math.floor(Math.random() * types.length)];
      engine.spawnUnit(t, 'enemy', {
        x: cameraPos.x + 180 + (Math.random() - 0.5) * 60,
        y: cameraPos.y + (Math.random() - 0.5) * 60,
      });
    }
    onRefresh();
  };

  const toggleFog = () => {
    engine.settings.fogOfWarEnabled = !engine.settings.fogOfWarEnabled;
    onRefresh();
  };

  return (
    <div className="absolute top-16 right-4 z-20 flex items-center gap-1.5 select-none bg-slate-950/90 backdrop-blur-md p-1 rounded-lg border border-amber-500/40 shadow-lg text-xs font-mono">
      <span className="text-amber-400 font-bold px-2 flex items-center gap-1">
        <Zap className="w-3.5 h-3.5" /> SANDBOX:
      </span>
      <button
        onClick={addFunds}
        className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-800 transition-colors"
      >
        +$10,000
      </button>
      <button
        onClick={() => spawnTank('main_battle_tank')}
        className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-sky-400 border border-slate-800 transition-colors"
      >
        +Centurion Tank
      </button>
      <button
        onClick={() => spawnTank('heavy_tank')}
        className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-emerald-400 border border-slate-800 transition-colors"
      >
        +Mammoth Tank
      </button>
      <button
        onClick={spawnEnemySquad}
        className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-rose-400 border border-slate-800 transition-colors"
      >
        +Hostile Wave
      </button>
      <button
        onClick={toggleFog}
        className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors flex items-center gap-1"
      >
        <Eye className="w-3 h-3" />
        {engine.settings.fogOfWarEnabled ? 'Reveal Map' : 'Fog On'}
      </button>
    </div>
  );
};
