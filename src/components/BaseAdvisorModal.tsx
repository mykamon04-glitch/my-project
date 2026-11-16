/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Brain,
  Shield,
  Zap,
  Activity,
  AlertTriangle,
  Info,
  X,
  Factory,
  ChevronRight,
  DollarSign,
  Users,
  Crosshair,
  Plane,
  Trash2,
  Radar,
  Sword,
  Sliders,
} from 'lucide-react';
import { BUILDING_CONFIGS, UNIT_CONFIGS } from '../data/gameData';
import { GameEngine } from '../game/engine';
import { AICommanderCustomComposition, BuildingType } from '../types/game';

interface BaseAdvisorModalProps {
  engine: GameEngine;
  isOpen: boolean;
  onClose: () => void;
  onStartBuildingPlacement: (type: BuildingType) => void;
}

export const BaseAdvisorModal: React.FC<BaseAdvisorModalProps> = ({
  engine,
  isOpen,
  onClose,
  onStartBuildingPlacement,
}) => {
  const [activeTab, setActiveTab] = useState<'autoprod' | 'advisor' | 'defense'>('autoprod');
  const [planningStyle, setPlanningStyle] = useState<'balanced' | 'defensive' | 'offensive'>(
    engine.basePlanningStyle
  );
  const [, setTick] = useState(0);

  if (!isOpen) return null;

  if (!engine.autoProduction.customComposition) {
    engine.autoProduction.customComposition = {
      infantryPct: 30,
      armorPct: 35,
      antiAirPct: 15,
      artilleryPct: 10,
      supportPct: 10,
    };
  }
  const customComp = engine.autoProduction.customComposition;

  const report = engine.getBaseIntelligenceReport(planningStyle);
  const autoProd = engine.autoProduction;

  const handleSelectStyle = (style: 'balanced' | 'defensive' | 'offensive') => {
    setPlanningStyle(style);
    engine.basePlanningStyle = style;
    setTick(t => t + 1);
  };

  const handleToggleAutoProd = () => {
    engine.autoProduction.enabled = !engine.autoProduction.enabled;
    setTick(t => t + 1);
  };

  const handleSetAutoStrategy = (
    strategy: 'balanced' | 'defensive' | 'offensive' | 'economy' | 'counter' | 'custom'
  ) => {
    engine.autoProduction.strategy = strategy;
    setTick(t => t + 1);
  };

  const handleSetReserve = (reserve: number) => {
    engine.autoProduction.reserveCredits = reserve;
    setTick(t => t + 1);
  };

  const handleSetArmySize = (size: number) => {
    engine.autoProduction.targetArmySize = size;
    setTick(t => t + 1);
  };

  const handleSliderChange = (
    key: keyof AICommanderCustomComposition,
    val: number
  ) => {
    if (!engine.autoProduction.customComposition) return;
    engine.autoProduction.customComposition[key] = val;
    setTick(t => t + 1);
  };

  // Calculate live player army distribution
  const playerUnits = engine.units.filter(u => u.faction === 'player');
  const infantryCount = playerUnits.filter(u => UNIT_CONFIGS[u.type].category === 'infantry').length;
  const lightVehicleCount = playerUnits.filter(u =>
    ['recon_buggy', 'light_tank', 'apc', 'aa_vehicle'].includes(u.type)
  ).length;
  const heavyArmorCount = playerUnits.filter(u =>
    ['main_battle_tank', 'heavy_tank', 'siege_tank'].includes(u.type)
  ).length;
  const artilleryCount = playerUnits.filter(u => u.type === 'artillery').length;
  const airCount = playerUnits.filter(u => UNIT_CONFIGS[u.type].isAir).length;
  const totalUnits = Math.max(1, playerUnits.length);

  // Active production queues across facilities
  const activeQueues: {
    buildingId: string;
    buildingName: string;
    queue: { unitType: string; progress: number }[];
  }[] = [];
  engine.buildings
    .filter(b => b.faction === 'player' && b.productionQueue.length > 0)
    .forEach(b => {
      activeQueues.push({
        buildingId: b.id,
        buildingName: BUILDING_CONFIGS[b.type].name,
        queue: b.productionQueue,
      });
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-3 sm:p-6 select-none animate-fadeIn">
      <div className="relative w-full max-w-3xl bg-[#101820] border border-[#1C2933] rounded-2xl shadow-2xl p-4 sm:p-6 text-[#F4F7FA] overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#1C2933]">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg transition-all ${
                autoProd.enabled
                  ? 'bg-[#173A32] border border-[#38B98A] text-[#38B98A] shadow-[0_0_14px_rgba(56,185,138,0.3)]'
                  : 'bg-[#1C2933] border border-[#1C2933] text-[#A9B8C5]'
              }`}
            >
              <Brain className={`w-5 h-5 ${autoProd.enabled ? 'animate-pulse' : ''}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-display font-bold tracking-wide uppercase text-[#F4F7FA]">
                  AI Commander Control Center
                </h2>
                <span
                  className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold border ${
                    autoProd.enabled
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {autoProd.enabled ? 'AUTONOMOUS ACTIVE' : 'MANUAL DISPATCH'}
                </span>
              </div>
              <p className="text-[11px] text-[#A9B8C5] font-mono">
                Intelligent troop production scheduler & tactical base architecture advisor
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-[#1C2933] hover:bg-[#173A32] text-[#A9B8C5] hover:text-[#F4F7FA] transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-2 pt-3 pb-2 border-b border-[#1C2933]">
          <button
            onClick={() => setActiveTab('autoprod')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-mono text-xs font-bold transition-all min-h-[42px] ${
              activeTab === 'autoprod'
                ? 'bg-[#173A32] text-[#38B98A] border border-[#38B98A]/50 shadow-md'
                : 'bg-[#1C2933]/60 text-[#A9B8C5] hover:text-[#F4F7FA]'
            }`}
          >
            <Brain className="w-4 h-4" />
            <span>AI PRODUCTION</span>
            {autoProd.enabled && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('defense')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-mono text-xs font-bold transition-all min-h-[42px] ${
              activeTab === 'defense'
                ? 'bg-[#173A32] text-[#38B98A] border border-[#38B98A]/50 shadow-md'
                : 'bg-[#1C2933]/60 text-[#A9B8C5] hover:text-[#F4F7FA]'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>RADAR & DEFENSE</span>
            {engine.tacticalIntelligence && (
              <span
                className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                  engine.tacticalIntelligence.threatLevel === 'RED'
                    ? 'bg-red-500 text-white animate-pulse'
                    : engine.tacticalIntelligence.threatLevel === 'ORANGE'
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-emerald-500/30 text-emerald-300'
                }`}
              >
                {engine.tacticalIntelligence.threatLevel}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('advisor')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-mono text-xs font-bold transition-all min-h-[42px] ${
              activeTab === 'advisor'
                ? 'bg-[#173A32] text-[#38B98A] border border-[#38B98A]/50 shadow-md'
                : 'bg-[#1C2933]/60 text-[#A9B8C5] hover:text-[#F4F7FA]'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>BASE ADVISOR</span>
          </button>
        </div>

        {/* Body Container */}
        <div className="flex-1 overflow-y-auto py-3 space-y-4 pr-1">
          {activeTab === 'autoprod' ? (
            /* --- AI TROOP PRODUCTION MODE --- */
            <div className="space-y-4">
              {/* Master Switch & Reason Banner */}
              <div className="bg-[#1C2933]/70 border border-[#1C2933] p-3.5 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-display font-bold uppercase text-[#F4F7FA]">
                      Autonomous Military Production Engine
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        autoProd.enabled
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
                          : 'bg-slate-700/40 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {autoProd.enabled ? 'ONLINE' : 'OFFLINE'}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#A9B8C5]">
                    {autoProd.lastDecisionReason ||
                      'Automates recruitment across Barracks, Factories, Helipads, and Airfields according to tactical doctrine.'}
                  </p>
                </div>
                <button
                  onClick={handleToggleAutoProd}
                  className={`px-4 py-2.5 rounded-xl font-mono font-bold text-xs transition-all active:scale-95 shrink-0 min-h-[42px] ${
                    autoProd.enabled
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/50'
                      : 'bg-[#1C2933] hover:bg-[#173A32] text-[#A9B8C5] border border-[#1C2933]'
                  }`}
                >
                  {autoProd.enabled ? 'DISENGAGE AI' : 'ACTIVATE AI COMMANDER'}
                </button>
              </div>

              {/* Strategic Presets */}
              <div>
                <span className="text-[10px] font-mono font-bold text-[#A9B8C5] block mb-2 uppercase tracking-wider">
                  Select Strategic Doctrine:
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(
                    [
                      {
                        id: 'balanced',
                        label: 'Balanced Combined-Arms',
                        desc: '35% Inf, 45% Armor, 20% Air',
                        icon: Sword,
                      },
                      {
                        id: 'counter',
                        label: 'Counter Scouted Enemy',
                        desc: 'Dynamically shifts to counter enemy threats',
                        icon: Radar,
                      },
                      {
                        id: 'defensive',
                        label: 'Air & Area Defense',
                        desc: 'Anti-Air Vehicles, SAMs, Heavy Gunners',
                        icon: Shield,
                      },
                      {
                        id: 'offensive',
                        label: 'Armored Spearhead',
                        desc: 'Heavy Tanks, Siege Guns, Attack Choppers',
                        icon: Crosshair,
                      },
                      {
                        id: 'economy',
                        label: 'Economic Defense',
                        desc: 'Low-cost scouting, riflemen, APCs',
                        icon: DollarSign,
                      },
                      {
                        id: 'custom',
                        label: 'Custom Doctrine',
                        desc: 'User-defined percentage sliders',
                        icon: Sliders,
                      },
                    ] as const
                  ).map(s => {
                    const Icon = s.icon;
                    const isSelected = autoProd.strategy === s.id;
                    return (
                      <button
                        key={s.id}
                        onClick={() => handleSetAutoStrategy(s.id)}
                        className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all min-h-[72px] ${
                          isSelected
                            ? 'bg-[#173A32] border-[#38B98A] text-[#F4F7FA] shadow-md shadow-emerald-950/30'
                            : 'bg-[#1C2933]/50 border-[#1C2933] text-[#A9B8C5] hover:text-[#F4F7FA]'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-[#38B98A]' : 'text-[#A9B8C5]'}`} />
                          <span
                            className={`text-xs font-mono font-bold truncate ${
                              isSelected ? 'text-[#38B98A]' : 'text-[#F4F7FA]'
                            }`}
                          >
                            {s.label}
                          </span>
                        </div>
                        <span className="text-[10px] text-[#A9B8C5] leading-tight">{s.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Doctrine Sliders (when custom is selected) */}
              {autoProd.strategy === 'custom' && (
                <div className="bg-[#1C2933]/60 border border-[#38B98A]/40 p-3.5 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-[#38B98A] uppercase">
                      Custom Composition Weights
                    </span>
                    <span className="text-[10px] font-mono text-[#A9B8C5]">
                      Total:{' '}
                      {customComp.infantryPct +
                        customComp.armorPct +
                        customComp.antiAirPct +
                        customComp.artilleryPct +
                        customComp.supportPct}
                      %
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div className="flex justify-between text-[11px] font-mono mb-1">
                        <span className="text-[#A9B8C5]">Infantry Squads</span>
                        <span className="text-[#38B98A] font-bold">
                          {customComp.infantryPct}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="70"
                        step="5"
                        value={customComp.infantryPct}
                        onChange={e => handleSliderChange('infantryPct', Number(e.target.value))}
                        className="w-full accent-[#38B98A]"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[11px] font-mono mb-1">
                        <span className="text-[#A9B8C5]">Armor & Battle Tanks</span>
                        <span className="text-[#38B98A] font-bold">
                          {customComp.armorPct}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="70"
                        step="5"
                        value={customComp.armorPct}
                        onChange={e => handleSliderChange('armorPct', Number(e.target.value))}
                        className="w-full accent-[#38B98A]"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[11px] font-mono mb-1">
                        <span className="text-[#A9B8C5]">Anti-Air Defense (SAMs)</span>
                        <span className="text-[#38B98A] font-bold">
                          {customComp.antiAirPct}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="50"
                        step="5"
                        value={customComp.antiAirPct}
                        onChange={e => handleSliderChange('antiAirPct', Number(e.target.value))}
                        className="w-full accent-[#38B98A]"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[11px] font-mono mb-1">
                        <span className="text-[#A9B8C5]">Artillery & Howitzers</span>
                        <span className="text-[#38B98A] font-bold">
                          {customComp.artilleryPct}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="40"
                        step="5"
                        value={customComp.artilleryPct}
                        onChange={e => handleSliderChange('artilleryPct', Number(e.target.value))}
                        className="w-full accent-[#38B98A]"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <div className="flex justify-between text-[11px] font-mono mb-1">
                        <span className="text-[#A9B8C5]">Air Support (Helicopters & Drones)</span>
                        <span className="text-[#38B98A] font-bold">
                          {customComp.supportPct}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="50"
                        step="5"
                        value={customComp.supportPct}
                        onChange={e => handleSliderChange('supportPct', Number(e.target.value))}
                        className="w-full accent-[#38B98A]"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Target vs Current Army Breakdown */}
              <div className="bg-[#1C2933]/50 border border-[#1C2933] p-3.5 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-[#A9B8C5] uppercase tracking-wider">
                    Current Force Distribution ({playerUnits.length} Units Active)
                  </span>
                  <span className="text-xs font-mono font-bold text-[#38B98A]">
                    CAP: {playerUnits.length} / {autoProd.targetArmySize}
                  </span>
                </div>

                {/* Segmented Distribution Bar */}
                <div className="w-full h-3 bg-[#101820] rounded-full overflow-hidden flex">
                  <div
                    title={`Infantry: ${infantryCount}`}
                    style={{ width: `${(infantryCount / totalUnits) * 100}%` }}
                    className="bg-emerald-500 h-full transition-all"
                  />
                  <div
                    title={`Light Vehicles: ${lightVehicleCount}`}
                    style={{ width: `${(lightVehicleCount / totalUnits) * 100}%` }}
                    className="bg-cyan-500 h-full transition-all"
                  />
                  <div
                    title={`Heavy Armor: ${heavyArmorCount}`}
                    style={{ width: `${(heavyArmorCount / totalUnits) * 100}%` }}
                    className="bg-amber-500 h-full transition-all"
                  />
                  <div
                    title={`Artillery: ${artilleryCount}`}
                    style={{ width: `${(artilleryCount / totalUnits) * 100}%` }}
                    className="bg-orange-500 h-full transition-all"
                  />
                  <div
                    title={`Aircraft: ${airCount}`}
                    style={{ width: `${(airCount / totalUnits) * 100}%` }}
                    className="bg-sky-400 h-full transition-all"
                  />
                </div>

                {/* Metrics Breakdown */}
                <div className="grid grid-cols-5 gap-1.5 text-center text-[10px] font-mono">
                  <div className="bg-[#101820] p-1.5 rounded border border-emerald-500/20">
                    <span className="text-emerald-400 font-bold block">{infantryCount}</span>
                    <span className="text-[#A9B8C5] text-[9px]">INF</span>
                  </div>
                  <div className="bg-[#101820] p-1.5 rounded border border-cyan-500/20">
                    <span className="text-cyan-400 font-bold block">{lightVehicleCount}</span>
                    <span className="text-[#A9B8C5] text-[9px]">LIGHT</span>
                  </div>
                  <div className="bg-[#101820] p-1.5 rounded border border-amber-500/20">
                    <span className="text-amber-400 font-bold block">{heavyArmorCount}</span>
                    <span className="text-[#A9B8C5] text-[9px]">ARMOR</span>
                  </div>
                  <div className="bg-[#101820] p-1.5 rounded border border-orange-500/20">
                    <span className="text-orange-400 font-bold block">{artilleryCount}</span>
                    <span className="text-[#A9B8C5] text-[9px]">ARTY</span>
                  </div>
                  <div className="bg-[#101820] p-1.5 rounded border border-sky-500/20">
                    <span className="text-sky-300 font-bold block">{airCount}</span>
                    <span className="text-[#A9B8C5] text-[9px]">AIR</span>
                  </div>
                </div>
              </div>

              {/* Resource Reserve & Target Cap Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Emergency Credit Reserve */}
                <div className="bg-[#1C2933]/50 border border-[#1C2933] p-3 rounded-xl flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-mono font-bold text-[#A9B8C5] uppercase flex items-center gap-1">
                      <DollarSign className="w-3.5 h-3.5 text-[#F2B84B]" />
                      Credit Reserve Threshold
                    </span>
                    <span className="text-xs font-mono font-bold text-[#F2B84B]">
                      ${autoProd.reserveCredits}
                    </span>
                  </div>
                  <p className="text-[10px] text-[#A9B8C5] mb-2 leading-tight">
                    AI never spends below this margin, saving funds for repairs and base expansion.
                  </p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[150, 300, 500, 800].map(amt => (
                      <button
                        key={amt}
                        onClick={() => handleSetReserve(amt)}
                        className={`py-1.5 rounded text-xs font-mono font-bold transition-all ${
                          autoProd.reserveCredits === amt
                            ? 'bg-[#F2B84B] text-[#101820]'
                            : 'bg-[#101820] text-[#A9B8C5] hover:text-[#F4F7FA]'
                        }`}
                      >
                        ${amt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Target Army Size Cap */}
                <div className="bg-[#1C2933]/50 border border-[#1C2933] p-3 rounded-xl flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-mono font-bold text-[#A9B8C5] uppercase flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-[#38B98A]" />
                      Target Army Size Cap
                    </span>
                    <span className="text-xs font-mono font-bold text-[#38B98A]">
                      {autoProd.targetArmySize} Units
                    </span>
                  </div>
                  <p className="text-[10px] text-[#A9B8C5] mb-2 leading-tight">
                    Maximum army size recruited before production automatically pauses.
                  </p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[20, 35, 50, 65].map(sz => (
                      <button
                        key={sz}
                        onClick={() => handleSetArmySize(sz)}
                        className={`py-1.5 rounded text-xs font-mono font-bold transition-all ${
                          autoProd.targetArmySize === sz
                            ? 'bg-[#38B98A] text-[#101820]'
                            : 'bg-[#101820] text-[#A9B8C5] hover:text-[#F4F7FA]'
                        }`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Active Production Queues with Cancellation */}
              {activeQueues.length > 0 && (
                <div className="bg-[#1C2933]/40 border border-[#1C2933] p-3 rounded-xl space-y-2">
                  <span className="text-[10px] font-mono font-bold text-[#A9B8C5] uppercase tracking-wider block">
                    Active Factory Production Queues:
                  </span>
                  <div className="space-y-2">
                    {activeQueues.map(aq => (
                      <div key={aq.buildingId} className="bg-[#101820] p-2 rounded-lg border border-[#1C2933]">
                        <div className="flex items-center justify-between text-xs font-mono text-[#F4F7FA] mb-1">
                          <span className="font-bold text-[#36C9E8]">{aq.buildingName}</span>
                          <span className="text-[10px] text-[#A9B8C5]">
                            {aq.queue.length} Unit{aq.queue.length > 1 ? 's' : ''} Queued
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                          {aq.queue.map((item, idx) => {
                            const uCfg = UNIT_CONFIGS[item.unitType as keyof typeof UNIT_CONFIGS];
                            return (
                              <div
                                key={idx}
                                className="flex items-center gap-1.5 bg-[#1C2933] px-2 py-1 rounded border border-[#1C2933] shrink-0 text-[10px] font-mono"
                              >
                                <span className="text-[#F4F7FA] font-medium">
                                  {uCfg ? uCfg.name : item.unitType}
                                </span>
                                {idx === 0 && (
                                  <span className="text-[#38B98A] font-bold">
                                    {Math.round(item.progress * 100)}%
                                  </span>
                                )}
                                <button
                                  onClick={() => {
                                    engine.cancelUnitProduction(aq.buildingId, idx);
                                    setTick(t => t + 1);
                                  }}
                                  title="Cancel and Refund Credits"
                                  className="text-[#E45B63] hover:text-white p-0.5 rounded hover:bg-[#E45B63]/40 ml-1"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : activeTab === 'advisor' ? (
            /* --- BASE ADVISOR & LAYOUT --- */
            <>
              {/* Top Metrics Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {/* Base Integrity */}
                <div className="bg-[#1C2933]/60 border border-[#1C2933] p-2.5 rounded-xl flex flex-col">
                  <span className="text-[10px] font-mono text-[#A9B8C5]">BASE INTEGRITY</span>
                  <span
                    className={`text-xl font-mono font-bold mt-1 ${
                      report.integrityScore >= 75
                        ? 'text-[#38B98A]'
                        : report.integrityScore >= 45
                        ? 'text-[#F2B84B]'
                        : 'text-[#E45B63]'
                    }`}
                  >
                    {report.integrityScore}%
                  </span>
                  <div className="w-full bg-[#101820] h-1.5 rounded-full mt-2 overflow-hidden">
                    <div
                      className={`h-full ${
                        report.integrityScore >= 75
                          ? 'bg-[#38B98A]'
                          : report.integrityScore >= 45
                          ? 'bg-[#F2B84B]'
                          : 'bg-[#E45B63]'
                      }`}
                      style={{ width: `${report.integrityScore}%` }}
                    />
                  </div>
                </div>

                {/* Power Grid */}
                <div className="bg-[#1C2933]/60 border border-[#1C2933] p-2.5 rounded-xl flex flex-col">
                  <span className="text-[10px] font-mono text-[#A9B8C5]">POWER MARGIN</span>
                  <span
                    className={`text-xl font-mono font-bold mt-1 ${
                      report.powerStatus === 'optimal'
                        ? 'text-emerald-400'
                        : report.powerStatus === 'stable'
                        ? 'text-amber-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {report.powerDelta >= 0 ? `+${report.powerDelta}` : report.powerDelta} PWR
                  </span>
                  <span className="text-[9px] font-mono text-[#A9B8C5] mt-1">
                    {report.powerStatus.toUpperCase()}
                  </span>
                </div>

                {/* Defense Coverage */}
                <div className="bg-[#1C2933]/60 border border-[#1C2933] p-2.5 rounded-xl flex flex-col">
                  <span className="text-[10px] font-mono text-[#A9B8C5]">DEFENSE GRID</span>
                  <span className="text-xl font-mono font-bold text-[#36C9E8] mt-1">
                    {report.defensiveCoverageScore}%
                  </span>
                  <span className="text-[9px] font-mono text-[#A9B8C5] mt-1">
                    PERIMETER TURRETS
                  </span>
                </div>

                {/* Radar Surveillance */}
                <div className="bg-[#1C2933]/60 border border-[#1C2933] p-2.5 rounded-xl flex flex-col">
                  <span className="text-[10px] font-mono text-[#A9B8C5]">RADAR SENSORS</span>
                  <span
                    className={`text-xl font-mono font-bold mt-1 ${
                      report.radarCoverageScore > 0 ? 'text-[#38B98A]' : 'text-rose-400'
                    }`}
                  >
                    {report.radarCoverageScore > 0 ? 'ONLINE' : 'OFFLINE'}
                  </span>
                  <span className="text-[9px] font-mono text-[#A9B8C5] mt-1">
                    SURVEILLANCE
                  </span>
                </div>
              </div>

              {/* Planning Style Selector */}
              <div>
                <span className="text-[10px] font-mono font-bold text-[#A9B8C5] block mb-2 uppercase tracking-wider">
                  Base Architecture Objective:
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {(['balanced', 'defensive', 'offensive'] as const).map(style => (
                    <button
                      key={style}
                      onClick={() => handleSelectStyle(style)}
                      className={`py-2 px-3 rounded-lg border font-mono text-xs font-bold transition-all min-h-[40px] ${
                        planningStyle === style
                          ? 'bg-[#173A32] border-[#38B98A] text-[#38B98A] shadow-md'
                          : 'bg-[#1C2933]/60 border-[#1C2933] text-[#A9B8C5] hover:text-[#F4F7FA]'
                      }`}
                    >
                      {style.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Strategic Layout Recommendations List */}
              <div className="space-y-2.5">
                <span className="text-[10px] font-mono font-bold text-[#A9B8C5] block uppercase tracking-wider">
                  Tactical Deployment Directives:
                </span>
                {report.recommendations.length === 0 ? (
                  <div className="p-4 bg-[#1C2933]/40 rounded-xl border border-[#1C2933] text-center text-xs font-mono text-[#38B98A]">
                    ✓ Base layout is operating at peak efficiency. No critical architectural vulnerabilities detected.
                  </div>
                ) : (
                  report.recommendations.map((rec, i) => {
                    const isCrit = rec.severity === 'critical';
                    const isWarn = rec.severity === 'warning';
                    const targetBuilding: BuildingType =
                      rec.type === 'power'
                        ? 'power_plant'
                        : rec.type === 'defense'
                        ? 'turret_gun'
                        : rec.type === 'radar'
                        ? 'radar_station'
                        : rec.type === 'production'
                        ? 'vehicle_factory'
                        : 'supply_depot';

                    return (
                      <div
                        key={i}
                        className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                          isCrit
                            ? 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                            : isWarn
                            ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                            : 'bg-sky-950/40 border-sky-500/40 text-sky-200'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          {isCrit ? (
                            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                          ) : isWarn ? (
                            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                          ) : (
                            <Info className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
                          )}
                          <div>
                            <span className="text-xs font-mono font-bold block">{rec.title}</span>
                            <span className="text-[11px] opacity-90 block mt-0.5">{rec.description}</span>
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            onClose();
                            onStartBuildingPlacement(targetBuilding);
                          }}
                          className={`px-3 py-1.5 rounded-lg font-mono font-bold text-xs shrink-0 flex items-center gap-1 transition-all active:scale-95 shadow-md min-h-[38px] ${
                            isCrit
                              ? 'bg-rose-600 hover:bg-rose-500 text-white'
                              : isWarn
                              ? 'bg-amber-600 hover:bg-amber-500 text-slate-950'
                              : 'bg-sky-600 hover:bg-sky-500 text-white'
                          }`}
                        >
                          <span>DEPLOY</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            /* --- RADAR & DEFENSE SYSTEM (System 1) --- */
            <div className="space-y-4">
              {/* Defense Grid Status & Threat Classification */}
              <div className="bg-[#1C2933]/70 border border-[#1C2933] p-4 rounded-xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#1C2933]">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-display font-bold uppercase text-[#F4F7FA]">
                      TACTICAL RADAR & AUTOMATIC BASE DEFENSE
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        engine.tacticalIntelligence.settings.autoDefenseEnabled
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {engine.tacticalIntelligence.settings.autoDefenseEnabled ? 'AUTO DEFENSE ACTIVE' : 'MANUAL ONLY'}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      engine.toggleAutoDefense();
                      setTick(t => t + 1);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all shadow-md ${
                      engine.tacticalIntelligence.settings.autoDefenseEnabled
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-slate-950'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                    }`}
                  >
                    {engine.tacticalIntelligence.settings.autoDefenseEnabled ? 'DISABLE AUTOMATION' : 'ENGAGE AUTOMATION'}
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                  <div className="bg-[#101820] p-2.5 rounded-lg border border-[#1C2933]">
                    <span className="text-[10px] text-[#A9B8C5] block">THREAT SEVERITY</span>
                    <span
                      className={`text-sm font-bold block mt-0.5 ${
                        engine.tacticalIntelligence.threatLevel === 'RED'
                          ? 'text-red-400 animate-pulse'
                          : engine.tacticalIntelligence.threatLevel === 'ORANGE'
                          ? 'text-amber-400'
                          : engine.tacticalIntelligence.threatLevel === 'YELLOW'
                          ? 'text-yellow-300'
                          : 'text-emerald-400'
                      }`}
                    >
                      {engine.tacticalIntelligence.threatLevel} ALERT
                    </span>
                  </div>

                  <div className="bg-[#101820] p-2.5 rounded-lg border border-[#1C2933]">
                    <span className="text-[10px] text-[#A9B8C5] block">RADAR SENSOR STATUS</span>
                    <span
                      className={`text-sm font-bold block mt-0.5 ${
                        engine.tacticalIntelligence.radarOperational ? 'text-[#36C9E8]' : 'text-amber-400'
                      }`}
                    >
                      {engine.tacticalIntelligence.radarOperational ? '850m ONLINE' : '420m BASELINE'}
                    </span>
                  </div>

                  <div className="bg-[#101820] p-2.5 rounded-lg border border-[#1C2933]">
                    <span className="text-[10px] text-[#A9B8C5] block">CONFIRMED TARGETS</span>
                    <span className="text-sm font-bold text-[#F4F7FA] block mt-0.5">
                      {engine.tacticalIntelligence.activeThreats.length} HOSTILES
                    </span>
                  </div>

                  <div className="bg-[#101820] p-2.5 rounded-lg border border-[#1C2933]">
                    <span className="text-[10px] text-[#A9B8C5] block">DEFENSE DOCTRINE</span>
                    <span className="text-sm font-bold text-[#38B98A] block mt-0.5 uppercase">
                      {engine.tacticalIntelligence.settings.defensePolicy.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Active Threats Radar Tracking Table */}
              <div className="bg-[#1C2933]/70 border border-[#1C2933] p-4 rounded-xl space-y-2.5">
                <span className="text-xs font-mono font-bold text-[#F4F7FA] block">
                  RADAR DETECTION & THREAT CLASSIFICATION (SYSTEM 1.1 - 1.2)
                </span>
                {engine.tacticalIntelligence.activeThreats.length === 0 ? (
                  <div className="p-4 bg-[#101820] rounded-lg border border-[#1C2933] text-center text-xs font-mono text-emerald-400">
                    ✓ All sectors clear. No hostile contacts detected within surveillance radius.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-[#101820] text-[#A9B8C5] border-b border-[#1C2933]">
                        <tr>
                          <th className="p-2">Target</th>
                          <th className="p-2">Class</th>
                          <th className="p-2">HQ Dist</th>
                          <th className="p-2">Trajectory</th>
                          <th className="p-2">Threat Score</th>
                          <th className="p-2">Sector</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1C2933]/60">
                        {engine.tacticalIntelligence.activeThreats.map(t => (
                          <tr key={t.id} className="hover:bg-[#101820]/50">
                            <td className="p-2 font-bold text-[#F4F7FA]">
                              {UNIT_CONFIGS[t.unitType]?.name || t.unitType}
                            </td>
                            <td className="p-2 text-[#36C9E8] uppercase">{t.category}</td>
                            <td className="p-2 text-[#F2B84B] font-mono-numbers">{Math.round(t.distanceToHQ)}m</td>
                            <td className="p-2">
                              {t.isApproaching ? (
                                <span className="text-red-400 font-bold">▲ Inbound</span>
                              ) : (
                                <span className="text-slate-400">Patrolling</span>
                              )}
                            </td>
                            <td className="p-2 font-bold text-amber-400 font-mono-numbers">{t.threatScore}</td>
                            <td className="p-2 text-[#38B98A]">
                              {t.threatenedZoneId
                                ? engine.tacticalIntelligence.defenseZones.find(z => z.id === t.threatenedZoneId)?.name || 'Perimeter'
                                : 'Outer Field'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Defense Zones (System 1.4) */}
              <div className="bg-[#1C2933]/70 border border-[#1C2933] p-4 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-[#F4F7FA]">
                    STRATEGIC DEFENSE ZONES (SYSTEM 1.4)
                  </span>
                  <span className="text-[10px] text-[#A9B8C5] font-mono">
                    {engine.tacticalIntelligence.defenseZones.length} Active Zones
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {engine.tacticalIntelligence.defenseZones.map(zone => (
                    <div
                      key={zone.id}
                      className={`p-3 rounded-lg border transition-all ${
                        zone.threatLevel === 'RED'
                          ? 'bg-red-500/10 border-red-500/50 text-red-200'
                          : zone.threatLevel === 'ORANGE'
                          ? 'bg-amber-500/10 border-amber-500/50 text-amber-200'
                          : 'bg-[#101820] border-[#1C2933] text-[#F4F7FA]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-display font-bold uppercase">{zone.name}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                            zone.threatLevel === 'RED'
                              ? 'bg-red-500 text-white'
                              : zone.threatLevel === 'ORANGE'
                              ? 'bg-amber-500 text-slate-950'
                              : 'bg-emerald-500/20 text-emerald-400'
                          }`}
                        >
                          {zone.threatLevel}
                        </span>
                      </div>
                      <div className="mt-1.5 text-[10px] text-[#A9B8C5] font-mono flex justify-between">
                        <span>Radius: {Math.round(zone.radius)}m</span>
                        <span>Assigned Troops: {zone.assignedUnitIds.length}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Defense Settings & Emergency Reinforcements (System 1.5) */}
              <div className="bg-[#1C2933]/70 border border-[#1C2933] p-4 rounded-xl space-y-3">
                <span className="text-xs font-mono font-bold text-[#F4F7FA] block">
                  DEFENSE INTELLIGENCE PARAMETERS (SYSTEM 1.5)
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {(
                    [
                      { id: 'alert_only', label: 'Alert Only', desc: 'Radar alerts only; no automatic troop orders' },
                      { id: 'defensive_intercept', label: 'Defensive Intercept', desc: 'Defenders engage only when zones are breached' },
                      { id: 'full_defense', label: 'Full Mobilization', desc: 'All eligible defenders sortie to intercept hostiles' },
                    ] as const
                  ).map(pol => (
                    <button
                      key={pol.id}
                      onClick={() => {
                        engine.setDefensePolicy(pol.id);
                        setTick(t => t + 1);
                      }}
                      className={`p-2.5 rounded-lg border text-left transition-all ${
                        engine.tacticalIntelligence.settings.defensePolicy === pol.id
                          ? 'bg-[#173A32] border-[#38B98A] text-[#38B98A]'
                          : 'bg-[#101820] border-[#1C2933] text-[#A9B8C5] hover:text-[#F4F7FA]'
                      }`}
                    >
                      <div className="text-xs font-bold">{pol.label}</div>
                      <div className="text-[10px] text-slate-400 mt-1 leading-tight">{pol.desc}</div>
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2 pt-2 border-t border-[#1C2933]">
                  <button
                    onClick={() => {
                      engine.triggerEmergencyReinforcements();
                      setTick(t => t + 1);
                    }}
                    className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-mono text-xs font-bold tracking-wide transition-all shadow-md"
                  >
                    TRIGGER EMERGENCY REINFORCEMENTS
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
