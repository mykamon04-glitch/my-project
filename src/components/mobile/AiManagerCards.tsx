/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { ChevronDown, Settings2 } from 'lucide-react';
import { GameEngine } from '../../game/engine';
import { AIModuleInfo } from '../../types/game';

/**
 * Compact, expandable AI manager cards.
 *
 * Presentation only: every value shown comes from the engine's existing `getAIModules()` and the
 * on/off switch calls the existing `toggleAIModule()`. No AI decision logic is touched here.
 */

const STATUS_STYLE: Record<AIModuleInfo['status'], string> = {
  ACTIVE: 'text-[#22C99A] bg-[#22C99A]/15 border-[#22C99A]/40',
  ONLINE: 'text-[#39B8F2] bg-[#39B8F2]/15 border-[#39B8F2]/40',
  STANDBY: 'text-[#F0B84B] bg-[#F0B84B]/12 border-[#F0B84B]/35',
  PAUSED: 'text-[#F0B84B] bg-[#F0B84B]/12 border-[#F0B84B]/35',
  OFFLINE: 'text-[#A7B7C7] bg-[#1B2B3C] border-[#2a3b4f]',
};

interface Props {
  engine: GameEngine;
  onHaptic?: () => void;
  onOpenAdvisor?: () => void;
}

export const AiManagerCards: React.FC<Props> = ({ engine, onHaptic, onOpenAdvisor }) => {
  const [open, setOpen] = useState<string | null>(null);
  const [, setN] = useState(0);

  // Engine state changes continuously; refresh the card text twice a second while the panel is mounted.
  useEffect(() => {
    const t = window.setInterval(() => setN(n => n + 1), 500);
    return () => window.clearInterval(t);
  }, []);

  const modules = engine.getAIModules();

  return (
    <div className="space-y-1.5">
      {modules.map(m => {
        const expanded = open === m.id;
        return (
          <div key={m.id} className="rounded-xl border border-[#2a3b4f] bg-[#1B2B3C] overflow-hidden">
            <div className="flex items-center gap-2 p-2">
              <button
                onClick={() => setOpen(expanded ? null : m.id)}
                aria-expanded={expanded}
                className="flex-1 min-w-0 flex items-center gap-2 text-left"
              >
                <ChevronDown className={`w-4 h-4 shrink-0 text-[#A7B7C7] transition-transform ${expanded ? 'rotate-180' : ''}`} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="font-display font-bold text-xs text-[#F1F5F9] truncate">{m.name}</span>
                    <span className={`shrink-0 px-1.5 py-px rounded-md border text-[9px] font-bold tracking-wide ${STATUS_STYLE[m.status]}`}>
                      {m.status}
                    </span>
                  </span>
                  <span className="block truncate text-[11px] text-[#A7B7C7] mt-0.5">{m.lastAction}</span>
                </span>
              </button>

              {/* Real on/off switch → engine.toggleAIModule */}
              <button
                role="switch"
                aria-checked={m.enabled}
                aria-label={`${m.name} ${m.enabled ? 'on' : 'off'}`}
                onClick={() => {
                  onHaptic?.();
                  engine.toggleAIModule(m.id);
                  setN(n => n + 1);
                }}
                className={`relative shrink-0 w-12 h-7 rounded-full border transition-colors ${
                  m.enabled ? 'bg-[#22C99A] border-[#22C99A]' : 'bg-[#131F2D] border-[#2a3b4f]'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-[#F1F5F9] shadow transition-transform ${
                    m.enabled ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </div>

            {expanded && (
              <div className="px-3 pb-2.5 pt-0.5 text-[11px] leading-snug space-y-1 border-t border-[#2a3b4f]/70">
                <Row k="Task" v={m.objective} />
                <Row k="Last action" v={m.lastAction} />
                <Row k="Reasoning" v={m.reason} />
                {m.resourceLimit && <Row k="Limit" v={m.resourceLimit} />}
                {m.id === 'architect' && onOpenAdvisor && (
                  <button
                    onClick={onOpenAdvisor}
                    className="mt-1 inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-[#131F2D] border border-[#39B8F2]/40 text-[#39B8F2] font-semibold"
                  >
                    <Settings2 className="w-3.5 h-3.5" /> Doctrine & mode settings
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const Row: React.FC<{ k: string; v: string }> = ({ k, v }) => (
  <p className="text-[#A7B7C7]">
    <span className="text-[#F1F5F9] font-semibold">{k}: </span>
    {v}
  </p>
);
