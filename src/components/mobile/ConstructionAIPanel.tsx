/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Check, ChevronDown, Hammer, Pause, Play, X } from 'lucide-react';
import { BUILDING_CONFIGS } from '../../data/gameData';
import {
  MAX_SLOTS, activeTasks, approveAllTasks, approveTask, cancelTask, getConstructionMode, getLimit, getReservedCredits,
  getSlotViews, setConstructionLimit, setConstructionMode,
} from '../../game/constructionAI';
import { GameEngine } from '../../game/engine';
import { AIArchitectMode } from '../../types/game';
import { formatCompact } from '../../utils/format';

/**
 * Construction AI control panel + live dashboard.
 * Presentation + controls only: every number comes from the engine (building construction progress, credits,
 * task state) and every control calls the same functions the tests exercise.
 */

const MODES: { id: 'off' | 'suggest' | 'auto'; label: string; hint: string }[] = [
  { id: 'off', label: 'OFF', hint: 'No automatic construction' },
  { id: 'suggest', label: 'SUGGEST', hint: 'AI proposes projects; you approve each one' },
  { id: 'auto', label: 'AUTO', hint: 'AI plans and builds on its own' },
];

const DOCTRINES: { id: AIArchitectMode; label: string }[] = [
  { id: 'balanced', label: 'Balanced' },
  { id: 'economy', label: 'Economy' },
  { id: 'defensive', label: 'Defense' },
  { id: 'offensive', label: 'Offense' },
  { id: 'custom', label: 'Custom' },
];

const WEIGHTS: { key: 'powerPriority' | 'economyPriority' | 'defensePriority' | 'militaryPriority' | 'supportPriority'; label: string }[] = [
  { key: 'powerPriority', label: 'Power' },
  { key: 'economyPriority', label: 'Economy' },
  { key: 'defensePriority', label: 'Defense' },
  { key: 'militaryPriority', label: 'Military' },
  { key: 'supportPriority', label: 'Support' },
];

const fmtEta = (s: number | null) => {
  if (s === null) return '—';
  const t = Math.ceil(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

const STATUS_TONE: Record<string, string> = {
  Constructing: 'text-[#22C99A]',
  Planned: 'text-[#39B8F2]',
  'Awaiting approval': 'text-[#F0B84B]',
  'Waiting for resources': 'text-[#F0B84B]',
  Free: 'text-[#A7B7C7]',
};

export const ConstructionAIPanel: React.FC<{ engine: GameEngine; onHaptic?: () => void }> = ({ engine, onHaptic }) => {
  const [, setN] = useState(0);
  const [open, setOpen] = useState(true);
  const [showPriorities, setShowPriorities] = useState(false);
  useEffect(() => {
    const t = window.setInterval(() => setN(n => n + 1), 400);
    return () => window.clearInterval(t);
  }, []);
  const bump = () => setN(n => n + 1);

  const a = engine.aiArchitect;
  const mode = getConstructionMode(engine);
  const limit = getLimit(engine);
  const active = activeTasks(engine);
  const slots = getSlotViews(engine);
  const reserved = getReservedCredits(engine);
  const unapproved = active.filter(t => !t.approved).length;
  const doctrine: AIArchitectMode = a.mode === 'assisted' || a.mode === 'manual' ? a.lastAutoDoctrine ?? 'balanced' : a.mode;
  const recentProblems = (a.taskHistory ?? []).filter(t => t.status === 'failed' || t.status === 'cancelled').slice(0, 2);

  const pickDoctrine = (d: AIArchitectMode) => {
    onHaptic?.();
    if (mode === 'suggest') a.lastAutoDoctrine = d; // stay in SUGGEST; the doctrine applies to the proposals
    else engine.setAIArchitectMode(d);
    bump();
  };

  return (
    <div className="rounded-xl border border-[#2a3b4f] bg-[#1B2B3C] overflow-hidden" data-testid="construction-ai">
      {/* header */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 p-2.5 text-left"
      >
        <Hammer className="w-4 h-4 text-[#22C99A] shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block font-display font-bold text-xs text-[#F1F5F9]">
            Construction AI — <span data-testid="construction-count">{active.length}/{limit}</span> Active
          </span>
          <span className="block text-[10px] text-[#A7B7C7] truncate">
            {mode === 'off' ? 'Off' : a.isPaused ? 'Paused' : mode === 'suggest' ? 'Suggest' : 'Auto'}
            {reserved > 0 ? ` · $${formatCompact(reserved)} reserved` : ''}
            {active.length > limit ? ' · over limit: running builds finish, no new ones' : ''}
          </span>
        </span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-[#A7B7C7] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-2.5 pb-2.5 space-y-2">
          {/* mode */}
          <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Construction AI mode">
            {MODES.map(m => (
              <button
                key={m.id}
                role="radio"
                aria-checked={mode === m.id}
                title={m.hint}
                onClick={() => { onHaptic?.(); setConstructionMode(engine, m.id); bump(); }}
                className={`h-9 rounded-lg text-[11px] font-bold transition-colors ${
                  mode === m.id ? 'bg-[#22C99A] text-[#0B121C]' : 'bg-[#131F2D] text-[#A7B7C7] border border-[#2a3b4f]'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-[#A7B7C7]">{MODES.find(m => m.id === mode)!.hint}</p>

          {/* simultaneous limit + pause */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#A7B7C7] shrink-0">Simultaneous</span>
            <div className="grid grid-cols-5 gap-1 flex-1" role="radiogroup" aria-label="Simultaneous construction limit">
              {Array.from({ length: MAX_SLOTS }, (_, i) => i + 1).map(n => (
                <button
                  key={n}
                  role="radio"
                  aria-checked={limit === n}
                  aria-label={`${n} ${n === 1 ? 'building' : 'buildings'}`}
                  onClick={() => { onHaptic?.(); setConstructionLimit(engine, n); bump(); }}
                  className={`h-9 rounded-lg text-xs font-bold tabular-nums transition-colors ${
                    limit === n ? 'bg-[#39B8F2] text-[#0B121C]' : 'bg-[#131F2D] text-[#A7B7C7] border border-[#2a3b4f]'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <button
              onClick={() => { onHaptic?.(); engine.toggleAIArchitectPause(); bump(); }}
              aria-label={a.isPaused ? 'Resume Construction AI' : 'Pause Construction AI'}
              aria-pressed={a.isPaused}
              className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center border ${
                a.isPaused ? 'bg-[#F0B84B]/20 border-[#F0B84B] text-[#F0B84B]' : 'bg-[#131F2D] border-[#2a3b4f] text-[#F1F5F9]'
              }`}
            >
              {a.isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </button>
          </div>

          {/* five live slot cards */}
          <div className="space-y-1.5" aria-label="Construction slots">
            {slots.map(v => {
              const pct = Math.floor(v.progress * 100);
              const beyond = v.slot > limit && !v.task;
              return (
                <div
                  key={v.slot}
                  data-testid={`slot-card-${v.slot}`}
                  className={`rounded-lg border p-2 ${v.task ? 'bg-[#131F2D] border-[#2a3b4f]' : 'bg-[#131F2D]/50 border-[#2a3b4f]/60'} ${beyond ? 'opacity-45' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] font-bold text-[#A7B7C7] tabular-nums shrink-0 mt-0.5">Slot {v.slot}</span>
                    <span className="min-w-0 flex-1 text-xs font-semibold leading-tight text-[#F1F5F9] break-words" data-testid={`slot-name-${v.slot}`}>
                      {v.task ? v.name : beyond ? 'Locked by limit' : 'Free'}
                    </span>
                    {v.task && (
                      <span className="shrink-0 flex items-center gap-1">
                        {!v.task.approved && (
                          <button
                            aria-label={`Approve ${v.name}`}
                            onClick={() => { onHaptic?.(); approveTask(engine, v.task!.id); bump(); }}
                            className="w-8 h-8 rounded-lg bg-[#22C99A]/20 border border-[#22C99A]/60 text-[#22C99A] flex items-center justify-center active:scale-95"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          aria-label={`Cancel ${v.name}`}
                          title={v.task.status === 'constructing' ? 'Cancel (existing demolish refund: 50%)' : 'Cancel'}
                          onClick={() => { onHaptic?.(); cancelTask(engine, v.task!.id); bump(); }}
                          className="w-8 h-8 rounded-lg bg-[#F06470]/15 border border-[#F06470]/50 text-[#F06470] flex items-center justify-center active:scale-95"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </span>
                    )}
                  </div>
                  {v.task && (
                    <>
                      <div className="mt-1.5 h-1.5 rounded-full bg-[#0B121C] overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                        <div className="h-full bg-[#22C99A] transition-[width] duration-300" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2 text-[10px] tabular-nums">
                        <span className={STATUS_TONE[v.statusLabel] ?? 'text-[#A7B7C7]'} data-testid={`slot-status-${v.slot}`}>{v.statusLabel}</span>
                        <span className="text-[#A7B7C7]">
                          <span data-testid={`slot-pct-${v.slot}`}>{pct}%</span>
                          {v.etaSeconds !== null ? ` · ${fmtEta(v.etaSeconds)} left` : ` · $${formatCompact(BUILDING_CONFIGS[v.task.type].cost)}`}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {unapproved > 1 && (
            <button
              onClick={() => { onHaptic?.(); approveAllTasks(engine); bump(); }}
              className="w-full h-9 rounded-lg bg-[#22C99A]/20 border border-[#22C99A]/60 text-[#22C99A] text-[11px] font-bold active:scale-[0.99]"
            >
              Approve all {unapproved} proposals
            </button>
          )}

          {recentProblems.map(t => (
            <p key={t.id} className="text-[10px] text-[#F0B84B]">
              {BUILDING_CONFIGS[t.type].name} {t.status}{t.note ? ` — ${t.note}` : ''}
            </p>
          ))}
          <p className="text-[10px] text-[#A7B7C7]">
            <span className="text-[#F1F5F9] font-semibold">Last decision: </span>{a.lastDecisionReason ?? '—'}
          </p>

          {/* priorities */}
          <button
            onClick={() => setShowPriorities(p => !p)}
            aria-expanded={showPriorities}
            className="w-full flex items-center justify-between text-[11px] font-semibold text-[#39B8F2] min-h-[32px]"
          >
            <span>Building priorities</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${showPriorities ? 'rotate-180' : ''}`} />
          </button>
          {showPriorities && (
            <div className="space-y-2">
              <div className="grid grid-cols-3 min-[440px]:grid-cols-5 gap-1" role="radiogroup" aria-label="Building doctrine">
                {DOCTRINES.map(d => (
                  <button
                    key={d.id}
                    role="radio"
                    aria-checked={doctrine === d.id}
                    onClick={() => pickDoctrine(d.id)}
                    className={`h-9 rounded-lg text-[11px] font-bold px-1 truncate ${
                      doctrine === d.id ? 'bg-[#22C99A] text-[#0B121C]' : 'bg-[#131F2D] text-[#A7B7C7] border border-[#2a3b4f]'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              {doctrine === 'custom' && a.customWeights && (
                <div className="rounded-lg bg-[#131F2D]/70 p-2 space-y-0.5">
                  {WEIGHTS.map(w => (
                    <div key={w.key} className="flex items-center justify-between gap-2 min-h-[34px]">
                      <span className="text-[11px] text-[#A7B7C7]">{w.label}</span>
                      <span className="flex items-center gap-1">
                        <button aria-label={`${w.label} priority minus`} onClick={() => { a.customWeights![w.key] = Math.max(0, a.customWeights![w.key] - 5); bump(); }} className="w-8 h-8 rounded-lg bg-[#1B2B3C] border border-[#2a3b4f] text-[#F1F5F9] font-bold active:scale-95">−</button>
                        <span className="w-10 text-center text-xs font-bold tabular-nums text-[#F1F5F9]">{a.customWeights![w.key]}</span>
                        <button aria-label={`${w.label} priority plus`} onClick={() => { a.customWeights![w.key] = Math.min(100, a.customWeights![w.key] + 5); bump(); }} className="w-8 h-8 rounded-lg bg-[#1B2B3C] border border-[#2a3b4f] text-[#F1F5F9] font-bold active:scale-95">+</button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
