/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Target } from 'lucide-react';
import { GameEngine } from '../../game/engine';
import { getObjectives } from '../../game/objectives';

/**
 * Compact mission tracker (V12). Collapsed it is a single chip, "MISSION 1/3"; tapping expands the list.
 * Completed objectives fold into one line, and the tracker collapses on its own a few seconds after an objective completes.
 */
export const MissionTracker: React.FC<{ engine: GameEngine }> = ({ engine }) => {
  const [open, setOpen] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [flash, setFlash] = useState(false);
  const objectives = getObjectives(engine);
  const done = objectives.filter(o => o.completed);
  const pending = objectives.filter(o => !o.completed);
  const prevDone = useRef(done.length);
  useEffect(() => {
    if (done.length > prevDone.current) {
      setFlash(true);
      const t1 = window.setTimeout(() => setFlash(false), 1600);
      const t2 = window.setTimeout(() => setOpen(false), 4000);   // auto-collapse after a completion
      prevDone.current = done.length;
      return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
    }
    prevDone.current = done.length;
  }, [done.length]);
  if (objectives.length === 0) return null;
  const all = done.length === objectives.length;
  return (
    <div className="pointer-events-auto select-none max-w-[min(260px,calc(100vw-150px))]" data-testid="mission-tracker">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className={`h-7 pl-2 pr-1.5 rounded-lg border flex items-center gap-1.5 text-[10.5px] font-display font-bold tracking-wider transition-colors ${
          flash ? 'bg-[#22C99A]/25 border-[#22C99A]/70' : 'bg-[#101820]/88 border-[#2a3b4f]'
        } ${all ? 'text-[#22C99A]' : 'text-[#E6EDF3]'}`}
        title="Mission objectives"
      >
        <Target className="w-3.5 h-3.5 text-[#22C99A]" />
        <span data-testid="mission-count">MISSION {done.length}/{objectives.length}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-[#A8B6C2] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-1 rounded-xl border border-[#1f2e3d] bg-[#0E1620]/94 backdrop-blur-md p-2 shadow-xl text-[11px] space-y-1.5">
          {pending.map(o => (
            <div key={o.id} className="flex items-start gap-1.5" data-testid="objective" data-done="0">
              <span className="w-3.5 h-3.5 mt-[1px] rounded-sm border border-[#A8B6C2]/60 shrink-0" />
              <span className="text-[#D5DEE6] leading-tight">
                {o.text}{o.target > 1 && <span className="text-[#8EA0B0] tabular-nums"> ({o.progress}/{o.target})</span>}
              </span>
            </div>
          ))}
          {done.length > 0 && (
            <button onClick={() => setShowDone(s => !s)} className="w-full flex items-center gap-1.5 text-[#22C99A] text-left">
              <Check className="w-3.5 h-3.5 shrink-0" />
              <span>{done.length} completed</span>
              <ChevronDown className={`w-3 h-3 ml-auto transition-transform ${showDone ? 'rotate-180' : ''}`} />
            </button>
          )}
          {showDone && done.map(o => (
            <div key={o.id} className="flex items-start gap-1.5 pl-0.5" data-testid="objective" data-done="1">
              <Check className="w-3.5 h-3.5 text-[#22C99A] shrink-0" />
              <span className="text-[#8EA0B0] leading-tight line-through decoration-[#8EA0B0]/50">
                {o.text}{o.target > 1 && <span className="tabular-nums"> ({o.progress}/{o.target})</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
