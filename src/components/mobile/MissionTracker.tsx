/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Target } from 'lucide-react';
import { GameEngine } from '../../game/engine';
import { getObjectives } from '../../game/objectives';

/**
 * Objective indicator (V13). Collapsed: "OBJECTIVES 1/3". Expanded: each objective with its live status
 * ("2/5", "Active", "Complete"). Progress comes from real game state (src/game/objectives.ts); an objective shows
 * Complete only when its measured progress reaches the target. A completed objective raises a brief, non-blocking
 * notice; the panel collapses by itself a few seconds after it was opened or after a completion.
 */
export const MissionTracker: React.FC<{ engine: GameEngine }> = ({ engine }) => {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const objectives = getObjectives(engine);
  const done = objectives.filter(o => o.completed);
  const prev = useRef<Set<string>>(new Set(done.map(o => o.id)));
  const doneKey = done.map(o => o.id).join(',');

  useEffect(() => {
    const now = new Set(done.map(o => o.id));
    const fresh = done.find(o => !prev.current.has(o.id));
    prev.current = now;
    if (!fresh) return;
    setNotice(fresh.text);
    const t = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneKey]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => setOpen(false), 8000); // collapse after a short look
    return () => window.clearTimeout(t);
  }, [open, doneKey]);

  if (objectives.length === 0) return null;
  const all = done.length === objectives.length;
  return (
    <div className="pointer-events-auto relative select-none max-w-[min(280px,calc(100vw-150px))]" data-testid="mission-tracker">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className={`nx-panel h-8 pl-2 pr-1.5 !rounded-lg flex items-center gap-1.5 text-[11px] font-semibold tracking-wide transition-colors duration-150 ${all ? 'text-nx-accent' : 'text-nx-text'}`}
        title="Objectives"
      >
        <Target className="w-3.5 h-3.5 text-nx-accent" />
        <span data-testid="mission-count">OBJECTIVES {done.length}/{objectives.length}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-nx-text2 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul className="nx-panel nx-drop mt-1 p-1.5 text-[12px]" data-testid="objective-list">
          {objectives.map(o => (
            <li key={o.id} className="flex items-center gap-2 px-1.5 py-1.5" data-testid="objective" data-done={o.completed ? '1' : '0'}>
              {o.completed
                ? <Check className="w-3.5 h-3.5 shrink-0 text-nx-accent" aria-label="Complete" />
                : <span className="w-3.5 h-3.5 shrink-0 rounded-full border border-nx-text2/60" aria-hidden />}
              <span className={`min-w-0 flex-1 leading-tight ${o.completed ? 'text-nx-text2' : 'text-nx-text'}`}>{o.text}</span>
              <span className={`shrink-0 text-[11px] nx-num ${o.completed ? 'text-nx-accent' : 'text-nx-text2'}`}>
                {o.completed ? 'Complete' : o.target > 1 ? `${o.progress}/${o.target}` : 'Active'}
              </span>
            </li>
          ))}
        </ul>
      )}
      {notice && (
        <div role="status" className="nx-panel nx-drop fixed left-1/2 z-40 -translate-x-1/2 px-3 py-2 text-[12px] text-nx-text flex items-center gap-2"
          style={{ top: 'calc(var(--hud-top) + 6px)' }} data-testid="objective-notice">
          <Check className="w-4 h-4 text-nx-accent" /> Objective complete · {notice}
        </div>
      )}
    </div>
  );
};
