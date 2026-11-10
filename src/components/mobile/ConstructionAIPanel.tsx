/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Check, ChevronDown, Hammer, Lock, Pause, Play, RefreshCw, ScrollText, X } from 'lucide-react';
import { BUILDING_CONFIGS } from '../../data/gameData';
import {
  MAX_SLOTS, activeTasks, approveAllTasks, approveTask, cancelTask, getConstructionMode, getLimit, getReservedCredits,
  explainDecision, getBudgetView, getPlan, getSlotViews, isLocked, lockBuilding, recalculatePlan, rejectTask, setConstructionLimit,
  setConstructionMode, setEmergencyReserve, setOption, setStrategy, setTypeLimit,
} from '../../game/constructionAI';
import { GameEngine } from '../../game/engine';
import { BUILDING_ROLES, STRATEGIES } from '../../game/constructionStrategy';
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

const OPTIONS: { key: 'avoidDuplicates' | 'allowPrerequisites' | 'prioritizeDefense'; label: string; hint: string }[] = [
  { key: 'avoidDuplicates', label: 'Avoid duplicate buildings', hint: 'Counts finished, building and planned structures; extra copies need real demand' },
  { key: 'allowPrerequisites', label: 'Allow prerequisite support buildings', hint: 'Lets the AI add power or required buildings on its own; otherwise it asks you' },
  { key: 'prioritizeDefense', label: 'Prioritize base defense', hint: 'Defenses rank higher, even in strategies that normally skip them' },
];
const DEFAULT_RESERVE = 400;
const LIMIT_TYPES = (Object.keys(BUILDING_ROLES) as (keyof typeof BUILDING_ROLES)[]).filter(t => t !== 'headquarters' && t !== 'defense_wall');
const LOG_TONE: Record<string, string> = {
  build: 'text-[#22C99A]', done: 'text-[#22C99A]', delay: 'text-[#F0B84B]', approval: 'text-[#F0B84B]', skip: 'text-[#A7B7C7]', idle: 'text-[#A7B7C7]', info: 'text-[#39B8F2]',
};
const fmtClock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

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
  const [showLog, setShowLog] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
  const [showExplain, setShowExplain] = useState(false);
  const [showLimits, setShowLimits] = useState(false);
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
  const strategy = a.strategy ?? 'balanced';
  const log = [...(a.decisionLog ?? [])].reverse();
  const slotNote = (t: NonNullable<ReturnType<typeof getSlotViews>[number]['task']>): string => {
    const nm = BUILDING_CONFIGS[t.type].name;
    if (!t.approved) return t.requiresApproval ? `Needs your approval: ${t.reason}.` : `Proposed: ${t.reason}.`;
    if (t.status === 'waiting_resources') return `Delaying ${nm}: Insufficient credits.`;
    return `${t.status === 'constructing' ? 'Building' : 'Starting'} ${nm}: ${t.reason}.`;
  };
  const recentProblems = (a.taskHistory ?? []).filter(t => t.status === 'failed' || t.status === 'cancelled').slice(0, 2);

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

          {/* strategy */}
          <div>
            <label htmlFor="construction-strategy" className="text-[11px] text-[#A7B7C7]">Strategy</label>
            <select
              id="construction-strategy"
              value={strategy}
              onChange={ev => { onHaptic?.(); setStrategy(engine, ev.target.value as typeof strategy); bump(); }}
              className="mt-1 w-full h-10 rounded-lg bg-[#131F2D] border border-[#2a3b4f] text-xs font-semibold text-[#F1F5F9] px-2"
            >
              {STRATEGIES.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
            <p className="mt-1 text-[10px] text-[#A7B7C7]" data-testid="strategy-blurb">{STRATEGIES.find(x => x.id === strategy)!.blurb}</p>
          </div>

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

          {/* status: active / planned / waiting / reservations */}
          {(() => {
            const bud = getBudgetView(engine);
            const planned = active.filter(t => t.status === 'planned' && t.approved).length;
            const waiting = active.filter(t => t.status === 'waiting_resources').length;
            const proposals = active.filter(t => !t.approved).length;
            return (
              <p className="text-[10px] text-[#A7B7C7] tabular-nums" data-testid="construction-status">
                <span className="text-[#F1F5F9] font-semibold">Active {active.filter(t => t.status === 'constructing').length}</span>
                {` · Planned ${planned} · Waiting ${waiting} · Proposed ${proposals}`}
                {bud.committed > 0 ? ` · $${formatCompact(bud.committed)} reserved` : ''}
                {bud.urgentHold > 0 ? ` · $${formatCompact(bud.urgentHold)} held for defense` : ''}
                {bud.recruitFloor > 0 ? ` · $${formatCompact(bud.recruitFloor)} for recruitment` : ''}
              </p>
            );
          })()}

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
                          aria-label={v.task.approved ? `Cancel ${v.name}` : `Reject ${v.name}`}
                          title={!v.task.approved ? 'Reject: not suggested again for 5 minutes' : v.task.status === 'constructing' ? 'Cancel (existing demolish refund: 50%)' : 'Cancel'}
                          onClick={() => { onHaptic?.(); if (v.task!.approved) cancelTask(engine, v.task!.id); else rejectTask(engine, v.task!.id); bump(); }}
                          className="w-8 h-8 rounded-lg bg-[#F06470]/15 border border-[#F06470]/50 text-[#F06470] flex items-center justify-center active:scale-95"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </span>
                    )}
                  </div>
                  {v.task && (
                    <>
                      <p className="mt-1 text-[10px] leading-snug text-[#A7B7C7]" data-testid={`slot-note-${v.slot}`}>{slotNote(v.task)}</p>
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
          <div className="grid grid-cols-3 gap-1">
            <button onClick={() => { onHaptic?.(); recalculatePlan(engine); bump(); }} className="h-9 rounded-lg bg-[#131F2D] border border-[#2a3b4f] text-[10px] font-bold text-[#F1F5F9] flex items-center justify-center gap-1 active:scale-95">
              <RefreshCw className="w-3.5 h-3.5" />Recalculate
            </button>
            <button onClick={() => setShowPlan(p => !p)} aria-expanded={showPlan} className="h-9 rounded-lg bg-[#131F2D] border border-[#2a3b4f] text-[10px] font-bold text-[#39B8F2] active:scale-95">
              Building priorities
            </button>
            <button onClick={() => setShowExplain(p => !p)} aria-expanded={showExplain} className="h-9 rounded-lg bg-[#131F2D] border border-[#2a3b4f] text-[10px] font-bold text-[#39B8F2] active:scale-95">
              Explain decision
            </button>
          </div>
          {showPlan && (() => {
            const plan = getPlan(engine);
            const wanted = plan.rejected.filter(r => r.need > 0).slice(0, 4);
            return (
              <ul className="rounded-lg bg-[#131F2D]/70 p-2 space-y-1" data-testid="construction-priorities">
                {plan.chosen.length === 0 && <li className="text-[10px] text-[#A7B7C7]">Nothing is needed right now. Credits are being saved.</li>}
                {plan.chosen.map((c, i) => (
                  <li key={c.type} className="text-[10px] leading-snug">
                    <span className="text-[#22C99A] font-bold tabular-nums">{i + 1}. {BUILDING_CONFIGS[c.type].name}</span>
                    <span className="text-[#A7B7C7]"> · priority {c.score} · tier {c.tier} — {c.reason}</span>
                  </li>
                ))}
                {wanted.map(r => (
                  <li key={r.type} className="text-[10px] leading-snug text-[#F0B84B]">Held: {BUILDING_CONFIGS[r.type].name} — {r.reason}</li>
                ))}
              </ul>
            );
          })()}
          {showExplain && (
            <ul className="rounded-lg bg-[#131F2D]/70 p-2 space-y-1" data-testid="construction-explain">
              {explainDecision(engine).map((l, i) => <li key={i} className="text-[10px] leading-snug text-[#F1F5F9]">{l}</li>)}
            </ul>
          )}
          <p className="text-[10px] text-[#A7B7C7]">
            <span className="text-[#F1F5F9] font-semibold">Last decision: </span>{a.lastDecisionReason ?? '—'}
          </p>

          {/* behaviour toggles */}
          <div className="space-y-1" aria-label="Construction behaviour">
            {OPTIONS.map(o => {
              const on = a[o.key] ?? (o.key !== 'prioritizeDefense');
              return (
                <button
                  key={o.key}
                  role="switch"
                  aria-checked={on}
                  title={o.hint}
                  onClick={() => { onHaptic?.(); setOption(engine, o.key, !on); bump(); }}
                  className="w-full min-h-[40px] flex items-center justify-between gap-2 rounded-lg bg-[#131F2D] border border-[#2a3b4f] px-2.5 text-left"
                >
                  <span className="text-[11px] text-[#F1F5F9]">{o.label}</span>
                  <span className={`shrink-0 w-9 h-5 rounded-full relative transition-colors ${on ? 'bg-[#22C99A]' : 'bg-[#2a3b4f]'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
                  </span>
                </button>
              );
            })}
            {(() => {
              const on = a.reserveCredits > 0;
              return (
                <button
                  role="switch"
                  aria-checked={on}
                  title={`Keeps $${DEFAULT_RESERVE} untouched so units and repairs stay possible`}
                  onClick={() => { onHaptic?.(); setEmergencyReserve(engine, on ? 0 : DEFAULT_RESERVE); bump(); }}
                  className="w-full min-h-[40px] flex items-center justify-between gap-2 rounded-lg bg-[#131F2D] border border-[#2a3b4f] px-2.5 text-left"
                >
                  <span className="text-[11px] text-[#F1F5F9]">Reserve emergency credits{on ? ` ($${formatCompact(a.reserveCredits)})` : ''}</span>
                  <span className={`shrink-0 w-9 h-5 rounded-full relative transition-colors ${on ? 'bg-[#22C99A]' : 'bg-[#2a3b4f]'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
                  </span>
                </button>
              );
            })()}
          </div>

          {/* player restrictions: maximum counts, exclusions and locks */}
          <button
            onClick={() => setShowLimits(p => !p)}
            aria-expanded={showLimits}
            className="w-full flex items-center justify-between text-[11px] font-semibold text-[#39B8F2] min-h-[32px]"
          >
            <span>Building limits &amp; locks</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${showLimits ? 'rotate-180' : ''}`} />
          </button>
          {showLimits && (
            <div className="max-h-60 overflow-y-auto rounded-lg bg-[#131F2D]/70 p-2 space-y-0.5" data-testid="construction-limits">
              <p className="text-[10px] text-[#A7B7C7] pb-1">Max 0 excludes a building. Locked structures are never cancelled or demolished by the AI.</p>
              {LIMIT_TYPES.map(t => {
                const lim = a.typeLimits?.[t];
                const mine = engine.buildings.filter(b => b.faction === 'player' && b.type === t);
                const locked = mine.length > 0 && mine.every(b => isLocked(engine, b.id));
                const nm = BUILDING_CONFIGS[t].name;
                return (
                  <div key={t} className="flex items-center justify-between gap-1.5 min-h-[34px]">
                    <span className="min-w-0 flex-1 text-[11px] text-[#F1F5F9] truncate">{nm}<span className="text-[#A7B7C7]"> ({mine.length})</span></span>
                    <button
                      aria-label={`${locked ? 'Unlock' : 'Lock'} existing ${nm}`}
                      aria-pressed={locked}
                      disabled={mine.length === 0}
                      onClick={() => { mine.forEach(b => lockBuilding(engine, b.id, !locked)); bump(); }}
                      className={`w-8 h-8 rounded-lg border flex items-center justify-center disabled:opacity-30 ${locked ? 'bg-[#F0B84B]/20 border-[#F0B84B] text-[#F0B84B]' : 'bg-[#1B2B3C] border-[#2a3b4f] text-[#A7B7C7]'}`}
                    ><Lock className="w-3.5 h-3.5" /></button>
                    <button aria-label={`${nm} max minus`} onClick={() => { setTypeLimit(engine, t, lim === undefined ? 0 : lim <= 0 ? undefined : lim - 1); bump(); }} className="w-8 h-8 rounded-lg bg-[#1B2B3C] border border-[#2a3b4f] text-[#F1F5F9] font-bold active:scale-95">−</button>
                    <span className="w-9 text-center text-[11px] font-bold tabular-nums text-[#F1F5F9]" aria-label={`${nm} maximum`}>{lim === undefined ? '∞' : lim}</span>
                    <button aria-label={`${nm} max plus`} onClick={() => { setTypeLimit(engine, t, lim === undefined ? undefined : lim + 1); bump(); }} className="w-8 h-8 rounded-lg bg-[#1B2B3C] border border-[#2a3b4f] text-[#F1F5F9] font-bold active:scale-95">+</button>
                  </div>
                );
              })}
            </div>
          )}

          {/* decision log */}
          <button
            onClick={() => setShowLog(p => !p)}
            aria-expanded={showLog}
            className="w-full flex items-center justify-between text-[11px] font-semibold text-[#39B8F2] min-h-[32px]"
          >
            <span className="flex items-center gap-1.5"><ScrollText className="w-3.5 h-3.5" />AI decision log ({log.length})</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${showLog ? 'rotate-180' : ''}`} />
          </button>
          {showLog && (
            <ul className="max-h-56 overflow-y-auto rounded-lg bg-[#131F2D]/70 p-2 space-y-1" data-testid="construction-log">
              {log.length === 0 && <li className="text-[10px] text-[#A7B7C7]">No decisions yet.</li>}
              {log.map((l, i) => (
                <li key={`${l.t}-${i}`} className="text-[10px] leading-snug">
                  <span className="text-[#A7B7C7] tabular-nums">{fmtClock(l.t)} </span>
                  <span className={LOG_TONE[l.kind] ?? 'text-[#A7B7C7]'}>{l.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
