/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Eye, Home, RotateCcw, Play } from 'lucide-react';
import { GameEngine } from '../game/engine';

interface Props {
  engine: GameEngine;
  outcome: 'victory' | 'defeat';
  onPlayAgain: () => void;
  onMainMenu: () => void;
  onViewBattlefield: () => void;
  onNextOperation?: () => void;
}

const fmtTime = (s: number) => `${Math.floor(s / 60)}m ${String(Math.floor(s % 60)).padStart(2, '0')}s`;
const int = (n: number) => Math.round(n).toLocaleString();

/** V12 results screen: outcome, the reason decided by the engine, and the match statistics it tracked. */
export const MatchResults: React.FC<Props> = ({ engine, outcome, onPlayAgain, onMainMenu, onViewBattlefield, onNextOperation }) => {
  const win = outcome === 'victory';
  const st = engine.matchStats;
  const reason = engine.matchEnd?.reason ?? (win ? 'ENEMY HEADQUARTERS DESTROYED' : 'YOUR HEADQUARTERS HAS FALLEN');
  const objectives = engine.currentMission?.objectives;
  const rows: [string, string][] = [
    ['Match duration', fmtTime(st.duration || engine.gameTime)],
    ['Enemy units eliminated', int(st.enemyUnitsKilled)],
    ['Friendly units lost', int(st.friendlyUnitsLost)],
    ['Enemy structures destroyed', int(st.enemyBuildingsDestroyed)],
    ['Buildings constructed', int(st.buildingsConstructed)],
    ['Resources collected', `$${int(st.creditsEarned)}`],
    ['Damage dealt', int(st.damageDealt)],
    ['Damage taken', int(st.damageTaken)],
  ];
  const accent = win ? '#3FBF8F' : '#E06A5F';
  return (
    <div className="text-left" data-testid="match-results" data-outcome={outcome}>
      <div className="text-center">
        <div className="text-[11px] font-mono tracking-[0.3em] text-slate-400">MATCH {win ? 'WON' : 'LOST'}</div>
        <h2 className="mt-1 text-4xl font-display font-bold tracking-[0.12em]" style={{ color: accent }}>
          {win ? 'VICTORY' : 'DEFEAT'}
        </h2>
        <div className="mt-1 text-xs font-display font-semibold tracking-[0.16em] text-slate-200">{reason}</div>
      </div>

      <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/60 divide-y divide-slate-800/80">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between px-3 py-1.5 text-xs">
            <span className="text-slate-400">{k}</span>
            <span className="font-mono-numbers font-semibold text-slate-100">{v}</span>
          </div>
        ))}
      </div>

      {objectives && objectives.length > 0 && (
        <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
          <div className="text-[10px] font-mono tracking-widest text-slate-400 mb-1">MISSION SUMMARY</div>
          {objectives.map(o => (
            <div key={o.id} className="flex items-center gap-2 text-xs">
              <span className={o.completed ? 'text-emerald-400' : 'text-slate-500'}>{o.completed ? '✓' : '○'}</span>
              <span className={o.completed ? 'text-slate-200' : 'text-slate-500'}>{o.text}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 sm:grid-cols-[1fr_1.35fr_1fr] gap-2 whitespace-nowrap">
        {onNextOperation ? (
          <button onClick={onNextOperation} className="h-10 rounded-lg text-slate-950 text-xs font-display font-bold tracking-wide flex items-center justify-center gap-1.5" style={{ background: accent }}>
            <Play className="w-3.5 h-3.5 fill-current" /> NEXT OPERATION
          </button>
        ) : (
          <button onClick={onPlayAgain} data-testid="play-again" className="h-10 rounded-lg text-slate-950 text-xs font-display font-bold tracking-wide flex items-center justify-center gap-1.5" style={{ background: accent }}>
            <RotateCcw className="w-3.5 h-3.5" /> PLAY AGAIN
          </button>
        )}
        <button onClick={onMainMenu} data-testid="main-menu" className="h-10 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-display font-semibold flex items-center justify-center gap-1.5">
          <Home className="w-3.5 h-3.5" /> RETURN TO MAIN MENU
        </button>
        <button onClick={onViewBattlefield} data-testid="view-battlefield" className="h-10 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-display font-semibold flex items-center justify-center gap-1.5">
          <Eye className="w-3.5 h-3.5" /> VIEW BATTLEFIELD
        </button>
      </div>
    </div>
  );
};
