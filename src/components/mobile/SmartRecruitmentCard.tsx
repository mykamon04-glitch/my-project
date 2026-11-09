/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { GameEngine } from '../../game/engine';
import { SMART_MODES, SmartMode, applySmartMode, detectSmartMode } from '../../game/smartRecruitment';
import { AICommanderCustomComposition } from '../../types/game';
import { formatCompact } from '../../utils/format';

/**
 * Smart Recruitment: chooses an army doctrine for the engine's EXISTING auto-production.
 * Bound to engine.autoProduction (enabled, strategy, customComposition, reserveCredits, targetArmySize).
 * No production rules are changed; the engine still validates facilities, credits, power and population.
 */

const Stepper: React.FC<{ label: string; value: string; onMinus: () => void; onPlus: () => void; canMinus?: boolean; canPlus?: boolean }> = ({
  label, value, onMinus, onPlus, canMinus = true, canPlus = true,
}) => (
  <div className="flex items-center justify-between gap-2 min-h-[36px]">
    <span className="text-[11px] text-[#A7B7C7] min-w-0 truncate">{label}</span>
    <span className="flex items-center gap-1 shrink-0">
      <button aria-label={`${label} minus`} disabled={!canMinus} onClick={onMinus} className="w-8 h-8 rounded-lg bg-[#131F2D] border border-[#2a3b4f] text-[#F1F5F9] font-bold disabled:opacity-35 active:scale-95">−</button>
      <span className="w-14 text-center text-xs font-bold tabular-nums text-[#F1F5F9]">{value}</span>
      <button aria-label={`${label} plus`} disabled={!canPlus} onClick={onPlus} className="w-8 h-8 rounded-lg bg-[#131F2D] border border-[#2a3b4f] text-[#F1F5F9] font-bold disabled:opacity-35 active:scale-95">+</button>
    </span>
  </div>
);

const COMP_FIELDS: { key: keyof AICommanderCustomComposition; label: string }[] = [
  { key: 'infantryPct', label: 'Infantry %' },
  { key: 'armorPct', label: 'Armor %' },
  { key: 'antiAirPct', label: 'Anti-air %' },
  { key: 'artilleryPct', label: 'Artillery %' },
  { key: 'supportPct', label: 'Support %' },
];

export const SmartRecruitmentCard: React.FC<{ engine: GameEngine; onHaptic?: () => void }> = ({ engine, onHaptic }) => {
  const ap = engine.autoProduction;
  const [picked, setPicked] = useState<SmartMode | null>(() => detectSmartMode(ap));
  const [, setN] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setN(n => n + 1), 500);
    return () => window.clearInterval(t);
  }, []);
  const bump = () => setN(n => n + 1);

  const barracks = engine.buildings.some(b => b.faction === 'player' && b.type === 'barracks' && b.constructionProgress >= 1);
  const factory = engine.buildings.some(b => b.faction === 'player' && b.type === 'vehicle_factory' && b.constructionProgress >= 1);
  const noFacility = !barracks && !factory;
  const comp = ap.customComposition;
  const compTotal = comp ? comp.infantryPct + comp.armorPct + comp.antiAirPct + comp.artilleryPct + comp.supportPct : 0;

  return (
    <div className="rounded-xl border border-[#2a3b4f] bg-[#1B2B3C] p-2.5 space-y-2" data-testid="smart-recruitment">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-display font-bold text-xs text-[#F1F5F9]">Smart Recruitment</div>
          <div className="text-[10px] text-[#A7B7C7]">{ap.enabled ? 'AUTO — builds units for you' : 'OFF — you recruit manually'}</div>
        </div>
        <button
          role="switch"
          aria-checked={ap.enabled}
          aria-label={`Smart Recruitment ${ap.enabled ? 'on' : 'off'}`}
          onClick={() => { onHaptic?.(); engine.toggleAIModule('production'); bump(); }}
          className={`relative shrink-0 w-12 h-7 rounded-full border transition-colors ${ap.enabled ? 'bg-[#22C99A] border-[#22C99A]' : 'bg-[#131F2D] border-[#2a3b4f]'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-[#F1F5F9] shadow transition-transform ${ap.enabled ? 'translate-x-5' : ''}`} />
        </button>
      </div>

      <div className="grid grid-cols-3 min-[440px]:grid-cols-5 gap-1" role="radiogroup" aria-label="Army doctrine">
        {SMART_MODES.map(m => (
          <button
            key={m.id}
            role="radio"
            aria-checked={picked === m.id}
            onClick={() => { onHaptic?.(); applySmartMode(ap, m.id); setPicked(m.id); bump(); }}
            className={`h-9 rounded-lg text-[11px] font-bold truncate px-1 transition-colors ${
              picked === m.id ? 'bg-[#22C99A] text-[#0B121C]' : 'bg-[#131F2D] text-[#A7B7C7] border border-[#2a3b4f]'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-[#A7B7C7]">
        {picked ? SMART_MODES.find(m => m.id === picked)!.blurb : `Advanced strategy in use (${ap.strategy}). Pick a doctrine to replace it.`}
      </p>

      {picked === 'custom' && comp && (
        <div className="rounded-lg bg-[#131F2D]/70 p-2 space-y-0.5">
          {COMP_FIELDS.map(f => (
            <Stepper
              key={f.key}
              label={f.label}
              value={`${comp[f.key]}`}
              canMinus={comp[f.key] > 0}
              canPlus={comp[f.key] < 100}
              onMinus={() => { ap.customComposition = { ...comp, [f.key]: Math.max(0, comp[f.key] - 5) }; bump(); }}
              onPlus={() => { ap.customComposition = { ...comp, [f.key]: Math.min(100, comp[f.key] + 5) }; bump(); }}
            />
          ))}
          <div className="text-[10px] text-[#A7B7C7] text-right">Total {compTotal}% (used as relative weights)</div>
        </div>
      )}

      <div className="space-y-0.5">
        <Stepper
          label="Budget reserve"
          value={`$${formatCompact(ap.reserveCredits)}`}
          canMinus={ap.reserveCredits > 0}
          canPlus={ap.reserveCredits < 4000}
          onMinus={() => { ap.reserveCredits = Math.max(0, ap.reserveCredits - 250); bump(); }}
          onPlus={() => { ap.reserveCredits = Math.min(4000, ap.reserveCredits + 250); bump(); }}
        />
        <Stepper
          label="Army size target"
          value={`${ap.targetArmySize}`}
          canMinus={ap.targetArmySize > 10}
          canPlus={ap.targetArmySize < 80}
          onMinus={() => { ap.targetArmySize = Math.max(10, ap.targetArmySize - 5); bump(); }}
          onPlus={() => { ap.targetArmySize = Math.min(80, ap.targetArmySize + 5); bump(); }}
        />
      </div>

      {noFacility && (
        <p className="text-[11px] text-[#F0B84B]">No operational Barracks or Vehicle Factory — build one before units can be produced.</p>
      )}
      <p className="text-[11px] text-[#A7B7C7]">
        <span className="text-[#F1F5F9] font-semibold">Last decision: </span>{ap.lastDecisionReason ?? '—'}
      </p>
      {ap.scoutedThreatsSummary && <p className="text-[11px] text-[#A7B7C7]">{ap.scoutedThreatsSummary}</p>}
    </div>
  );
};
