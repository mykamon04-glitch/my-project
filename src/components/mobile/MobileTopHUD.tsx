/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Coins,
  Zap,
  Users,
  AlertTriangle,
  Menu,
  Shield,
  X,
  Play,
  Pause,
  FastForward,
  Volume2,
  VolumeX,
  Sliders,
  Save,
  Crosshair,
  Layers,
  Eye,
  Maximize2,
  Minimize2,
  Hammer,
  HelpCircle,
  LogOut,
  Brain,
  Radio,
  Box,
  Compass,
  Wrench,
  Flame,
} from 'lucide-react';
import { GameEngine } from '../../game/engine';
import { BuildingType } from '../../types/game';
import { BUILDING_CONFIGS } from '../../data/gameData';
import { formatCompact, formatSigned } from '../../utils/format';

interface MobileTopHUDProps {
  engine: GameEngine;
  onOpenSettings: () => void;
  onOpenSaveLoad: () => void;
  onOpenAdvisor: () => void;
  onCenterHQ: () => void;
  onFitBase: () => void;
  onToggleFollow: () => void;
  isFollowing: boolean;
  onCycleZoom: () => void;
  currentZoom: number;
  onRotateCamera?: () => void;
  is3D: boolean;
  onToggle3D: () => void;
  isRadarVisible: boolean;
  onToggleRadar: () => void;
  onToggleMute: () => void;
  isMuted: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onStartBuildingPlacement?: (type: BuildingType) => void;
  onExitToMenu?: () => void;
  onRefresh?: () => void;
}


const CHIP_TONES = {
  ok: 'border-[#22C99A]/35 text-[#22C99A]',
  info: 'border-[#39B8F2]/35 text-[#39B8F2]',
  warn: 'border-[#F0B84B]/40 text-[#F0B84B]',
  danger: 'border-[#F06470]/70 bg-[#F06470]/15 text-[#F06470]',
} as const;

/** One resource chip: icon + value + sub-caption. min-w-0 lets it shrink instead of overflowing. */
const HudChip: React.FC<{ tone: keyof typeof CHIP_TONES; icon: React.ReactNode; value: React.ReactNode; sub: string; title: string; onClick: () => void }> = ({ tone, icon, value, sub, title, onClick }) => (
  <button
    onClick={onClick}
    title={title}
    className={`min-w-0 h-10 flex items-center justify-center min-[420px]:justify-start gap-1 px-1 min-[420px]:px-1.5 rounded-xl border bg-[#1B2B3C] active:scale-95 transition-all ${CHIP_TONES[tone]}`}
  >
    <span className="hidden min-[420px]:block">{icon}</span>
    <span className="min-w-0 flex flex-col text-center min-[420px]:text-left leading-none">
      <span className="truncate text-[12px] font-bold tabular-nums text-[#F1F5F9]">{value}</span>
      <span className="truncate text-[9px] mt-0.5 tabular-nums text-[#A7B7C7]">{sub}</span>
    </span>
  </button>
);

type DetailModalType = 'credits' | 'power' | 'pop' | 'alert' | 'menu' | 'sandbox' | null;

export const MobileTopHUD: React.FC<MobileTopHUDProps> = ({
  engine,
  onOpenSettings,
  onOpenSaveLoad,
  onOpenAdvisor,
  onCenterHQ,
  onFitBase,
  onToggleFollow,
  isFollowing,
  onCycleZoom,
  currentZoom,
  onRotateCamera,
  is3D,
  onToggle3D,
  isRadarVisible,
  onToggleRadar,
  onToggleMute,
  isMuted,
  isFullscreen,
  onToggleFullscreen,
  onStartBuildingPlacement,
  onExitToMenu,
  onRefresh,
}) => {
  const [activeModal, setActiveModal] = useState<DetailModalType>(null);

  const econ = engine.economy;
  const isPowerDeficit = econ.powerDemand > econ.powerSupply;
  const isPopCapped = econ.population >= econ.populationCap;

  // Threat level calculation
  const enemyUnits = engine.units.filter(u => u.faction === 'enemy' && u.hp > 0);
  const playerUnits = engine.units.filter(u => u.faction === 'player' && u.hp > 0);
  const hostileNearBase = enemyUnits.some(e => {
    const hq = engine.buildings.find(b => b.type === 'headquarters' && b.faction === 'player');
    if (!hq) return false;
    return Math.hypot(e.x - hq.pixelX, e.y - hq.pixelY) < 600;
  });

  const threatLevel = hostileNearBase
    ? 'CRITICAL'
    : enemyUnits.length > 15
    ? 'HIGH'
    : enemyUnits.length > 5
    ? 'ELEVATED'
    : 'NOMINAL';

  const threatColor =
    threatLevel === 'CRITICAL'
      ? 'text-rose-400 bg-rose-950/80 border-rose-500/60'
      : threatLevel === 'HIGH'
      ? 'text-amber-400 bg-amber-950/80 border-amber-500/60'
      : threatLevel === 'ELEVATED'
      ? 'text-yellow-400 bg-yellow-950/80 border-yellow-500/60'
      : 'text-emerald-400 bg-emerald-950/80 border-emerald-500/60';

  return (
    <>
      {/* 1. TOP HUD — compact grid: nothing scrolls, every chip shrinks (min-w-0) and abbreviates */}
      <header
        className="fixed top-0 inset-x-0 z-30 pointer-events-none select-none"
        style={{
          paddingTop: 'max(6px, env(safe-area-inset-top, 6px))',
          paddingLeft: 'max(8px, env(safe-area-inset-left, 8px))',
          paddingRight: 'max(8px, env(safe-area-inset-right, 8px))',
        }}
      >
        <div
          className="pointer-events-auto mx-auto w-full max-w-5xl grid items-center gap-1.5 sm:![grid-template-columns:auto_repeat(4,minmax(0,1fr))_auto] rounded-2xl border border-[#2a3b4f] bg-[#131F2D]/95 backdrop-blur-md p-1.5 shadow-xl"
          style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr)) auto' }}
        >
          {/* Brand */}
          <div className="hidden sm:flex items-center gap-2 pl-0.5">
            <div className="w-9 h-9 rounded-xl bg-[#1B2B3C] border border-[#22C99A]/40 flex items-center justify-center">
              <Shield className="w-4 h-4 text-[#22C99A]" />
            </div>
            <div className="hidden lg:flex flex-col pr-2">
              <span className="font-display font-bold text-xs tracking-wider text-[#F1F5F9] leading-none">IRON DOMINION</span>
              <span className="text-[9px] tracking-widest text-[#22C99A] uppercase mt-0.5">Real-time strategy</span>
            </div>
          </div>

          <HudChip
            tone="warn"
            title="Military Credits - tap for economy breakdown"
            onClick={() => setActiveModal(activeModal === 'credits' ? null : 'credits')}
            icon={<Coins className="w-4 h-4 shrink-0" />}
            value={`$${formatCompact(econ.credits)}`}
            sub={`${formatSigned(econ.incomeRate)}/m`}
          />
          <HudChip
            tone={isPowerDeficit ? 'danger' : 'info'}
            title="Power grid - tap for diagnostics"
            onClick={() => setActiveModal(activeModal === 'power' ? null : 'power')}
            icon={<Zap className="w-4 h-4 shrink-0" />}
            value={<>{formatSigned(econ.powerSupply - econ.powerDemand)}<span className="hidden min-[400px]:inline text-[9px] font-semibold opacity-70"> GW</span></>}
            sub={`${formatCompact(econ.powerSupply)}/${formatCompact(econ.powerDemand)}`}
          />
          <HudChip
            tone={isPopCapped ? 'warn' : 'ok'}
            title="Troop capacity"
            onClick={() => setActiveModal(activeModal === 'pop' ? null : 'pop')}
            icon={<Users className="w-4 h-4 shrink-0" />}
            value={`${econ.population}/${econ.populationCap}`}
            sub="Troops"
          />
          <HudChip
            tone={threatLevel === 'CRITICAL' || threatLevel === 'HIGH' ? 'danger' : threatLevel === 'ELEVATED' ? 'warn' : 'ok'}
            title="Threat early warning"
            onClick={() => setActiveModal(activeModal === 'alert' ? null : 'alert')}
            icon={<AlertTriangle className="w-4 h-4 shrink-0" />}
            value={String(enemyUnits.length)}
            sub={threatLevel.charAt(0) + threatLevel.slice(1).toLowerCase()}
          />

          <button
            onClick={onOpenSettings}
            className="w-10 h-10 rounded-xl bg-[#1B2B3C] hover:bg-[#223449] border border-[#2a3b4f] flex items-center justify-center active:scale-95 transition-all"
            title="Menu"
            aria-label="Menu"
          >
            <Menu className="w-[18px] h-[18px] text-[#F1F5F9]" />
          </button>
        </div>

        {/* TIER 2: camera quick controls (+ radar toggle moved here so the resource row never overflows) */}
        <div className="pointer-events-none flex flex-wrap items-center gap-1.5 pt-1.5 max-w-5xl mx-auto text-[11px] font-semibold">
          <div className="pointer-events-auto flex items-center gap-1 bg-[#131F2D]/90 backdrop-blur-md p-1 rounded-xl border border-[#2a3b4f] shadow-md">
            <button onClick={onCenterHQ} className="h-8 px-2 rounded-lg bg-[#1B2B3C] text-[#22C99A] flex items-center gap-1 active:scale-95 transition-transform" title="Center camera on Headquarters">
              <Crosshair className="w-3.5 h-3.5" /><span className="hidden min-[400px]:inline">HQ</span>
            </button>
            <button onClick={onFitBase} className="h-8 px-2 rounded-lg bg-[#1B2B3C] text-[#39B8F2] flex items-center gap-1 active:scale-95 transition-transform" title="Fit entire base on screen">
              <Layers className="w-3.5 h-3.5" /><span className="hidden min-[400px]:inline">FIT</span>
            </button>
            <button
              onClick={onToggleFollow}
              className={`h-8 px-2 rounded-lg flex items-center gap-1 active:scale-95 transition-all ${isFollowing ? 'bg-[#22C99A]/25 text-[#22C99A] ring-1 ring-[#22C99A]/60' : 'bg-[#1B2B3C] text-[#A7B7C7]'}`}
              title="Lock camera to follow selected units"
            >
              <Eye className="w-3.5 h-3.5" /><span className="hidden min-[400px]:inline">FOLLOW</span>
            </button>
            <button onClick={onCycleZoom} className="h-8 px-2 rounded-lg bg-[#1B2B3C] text-[#F1F5F9] tabular-nums active:scale-95" title="Cycle zoom">
              {Math.round((currentZoom || 1.0) * 100)}%
            </button>
            {is3D && onRotateCamera && (
              <button onClick={onRotateCamera} className="h-8 px-2 rounded-lg bg-[#1B2B3C] text-[#39B8F2] flex items-center gap-1 active:scale-95" title="Rotate view 45°">
                <Compass className="w-3.5 h-3.5" /><span className="hidden min-[400px]:inline">45°</span>
              </button>
            )}
            <button
              onClick={onToggleRadar}
              className={`h-8 px-2 rounded-lg flex items-center gap-1 active:scale-95 transition-all ${isRadarVisible ? 'bg-[#39B8F2]/20 text-[#39B8F2] ring-1 ring-[#39B8F2]/50' : 'bg-[#1B2B3C] text-[#A7B7C7]'}`}
              title="Toggle tactical radar"
              aria-pressed={isRadarVisible}
            >
              <Radio className="w-3.5 h-3.5" /><span className="hidden min-[400px]:inline">RADAR</span>
            </button>
          </div>

          {engine.mode === 'sandbox' && (
            <button
              onClick={() => setActiveModal('sandbox')}
              className="pointer-events-auto h-10 px-2.5 rounded-xl bg-[#F0B84B]/15 border border-[#F0B84B]/50 text-[#F0B84B] flex items-center gap-1 active:scale-95"
              title="Developer sandbox tools"
            >
              <Wrench className="w-3.5 h-3.5" /><span>DEV TOOLS</span>
            </button>
          )}
        </div>
      </header>

      {/* 2. CONTEXTUAL DETAIL POPOVERS / MODALS */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/65 backdrop-blur-sm pointer-events-auto">
          <div className="relative w-full max-w-sm bg-[#0e1620] border border-[#1f2e3d] rounded-2xl p-4 shadow-2xl text-xs font-mono text-[#f4f7fa] space-y-3 animate-fadeIn">
            {/* CLOSE BUTTON */}
            <button
              onClick={() => setActiveModal(null)}
              className="absolute top-3 right-3 p-1.5 rounded-lg bg-[#141d27] text-gray-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>

            {/* A. CREDITS DETAIL */}
            {activeModal === 'credits' && (
              <>
                <div className="flex items-center gap-2 border-b border-[#1f2e3d] pb-2 text-[#f2b84b] font-display font-bold text-sm uppercase">
                  <Coins className="w-4 h-4" />
                  <span>Treasury & Economy Intel</span>
                </div>
                <div className="space-y-1.5 bg-[#141d27] p-2.5 rounded-xl border border-[#1f2e3d]">
                  <div className="flex justify-between">
                    <span className="text-[#94a3b8]">Current Reserves:</span>
                    <span className="font-bold text-[#f2b84b]">${Math.floor(econ.credits).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#94a3b8]">Income Rate:</span>
                    <span className="font-bold text-[#38b98a]">+{econ.incomeRate} credits / min</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#94a3b8]">Army Net Worth:</span>
                    <span className="font-bold text-[#36c9e8]">${Math.floor(econ.armyStrength).toLocaleString()}</span>
                  </div>
                </div>
                <p className="text-[11px] text-[#94a3b8] leading-relaxed">
                  Refineries harvest Tiberium ore from blue crystalline deposits. Construct additional refineries to accelerate military funding.
                </p>
                {onStartBuildingPlacement && (
                  <button
                    onClick={() => {
                      setActiveModal(null);
                      onStartBuildingPlacement('coin_generator');
                    }}
                    className="w-full py-2 bg-[#173a32] hover:bg-[#38b98a] hover:text-[#101820] text-[#38b98a] font-bold rounded-lg border border-[#38b98a]/50 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Hammer className="w-3.5 h-3.5" />
                    <span>BUILD REFINERY (${BUILDING_CONFIGS['coin_generator']?.cost.toLocaleString() ?? '1,500'})</span>
                  </button>
                )}
              </>
            )}

            {/* B. POWER DETAIL */}
            {activeModal === 'power' && (() => {
              const diag = engine.getPowerDiagnostics();
              return (
                <>
                  <div className="flex items-center gap-2 border-b border-[#1f2e3d] pb-2 text-[#36c9e8] font-display font-bold text-sm uppercase">
                    <Zap className="w-4 h-4" />
                    <span>Fusion Grid Diagnostics</span>
                  </div>
                  <div className="space-y-1.5 bg-[#141d27] p-2.5 rounded-xl border border-[#1f2e3d]">
                    <div className="flex justify-between">
                      <span className="text-[#94a3b8]">Total Power Supply:</span>
                      <span className="font-bold text-[#36c9e8]">{diag.supply} GW</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#94a3b8]">Current Power Demand:</span>
                      <span className="font-bold text-[#f2b84b]">{diag.demand} GW</span>
                    </div>
                    <div className="flex justify-between border-t border-[#1f2e3d] pt-1">
                      <span className="text-[#94a3b8]">Net Energy Balance:</span>
                      <span
                        className={`font-bold ${
                          diag.isDeficit ? 'text-rose-400' : 'text-[#38b98a]'
                        }`}
                      >
                        {diag.balance > 0 ? '+' : ''}
                        {diag.balance} GW ({diag.isDeficit ? 'DEFICIT (-50% SPEED)' : 'BALANCED'})
                      </span>
                    </div>
                  </div>
                  {diag.isDeficit ? (
                    <div className="p-2 rounded-lg bg-rose-950/60 border border-rose-800/60 text-rose-300 text-[11px] leading-relaxed space-y-1">
                      <div>⚠️ <strong>Power Shortage:</strong> {diag.recommendation}</div>
                      <div className="text-[10px] text-rose-200/80">
                        Affected systems: Production queues train at half speed; radar coverage reduced.
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-[#94a3b8] leading-relaxed">
                      {diag.recommendation}
                    </p>
                  )}
                  {onStartBuildingPlacement && (
                    <button
                      onClick={() => {
                        setActiveModal(null);
                        onStartBuildingPlacement('power_plant');
                      }}
                      className="w-full py-2 bg-[#38b98a] hover:bg-[#4ade80] text-[#101820] font-bold rounded-lg flex items-center justify-center gap-1.5 shadow-md transition-colors"
                    >
                      <Hammer className="w-3.5 h-3.5" />
                      <span>BUILD FUSION REACTOR (${BUILDING_CONFIGS['power_plant']?.cost.toLocaleString() ?? '600'})</span>
                    </button>
                  )}
                </>
              );
            })()}

            {/* C. POPULATION DETAIL */}
            {activeModal === 'pop' && (
              <>
                <div className="flex items-center gap-2 border-b border-[#1f2e3d] pb-2 text-[#38b98a] font-display font-bold text-sm uppercase">
                  <Users className="w-4 h-4" />
                  <span>Personnel & Logistics Capacity</span>
                </div>
                <div className="space-y-1.5 bg-[#141d27] p-2.5 rounded-xl border border-[#1f2e3d]">
                  <div className="flex justify-between">
                    <span className="text-[#94a3b8]">Active Combat Units:</span>
                    <span className="font-bold text-[#f4f7fa]">{econ.population}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#94a3b8]">Maximum Cap:</span>
                    <span className="font-bold text-[#38b98a]">{econ.populationCap}</span>
                  </div>
                  <div className="w-full h-2 bg-[#0b1118] rounded-full overflow-hidden mt-1">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isPopCapped ? 'bg-amber-400' : 'bg-[#38b98a]'
                      }`}
                      style={{
                        width: `${Math.min(100, (econ.population / Math.max(1, econ.populationCap)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
                {isPopCapped ? (
                  <div className="p-2 rounded-lg bg-amber-950/60 border border-amber-800/60 text-amber-300 text-[11px] leading-relaxed">
                    ⚠️ <strong>Capacity Limit Reached:</strong> Recruit queues are paused. Construct a Logistics / Supply Depot to expand population headroom by +15.
                  </div>
                ) : (
                  <p className="text-[11px] text-[#94a3b8] leading-relaxed">
                    Headroom available for {econ.populationCap - econ.population} more combat units.
                  </p>
                )}
                {onStartBuildingPlacement && (
                  <button
                    onClick={() => {
                      setActiveModal(null);
                      onStartBuildingPlacement('supply_depot');
                    }}
                    className="w-full py-2 bg-[#173a32] hover:bg-[#38b98a] hover:text-[#101820] text-[#38b98a] font-bold rounded-lg border border-[#38b98a]/50 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Hammer className="w-3.5 h-3.5" />
                    <span>BUILD SUPPLY DEPOT (${BUILDING_CONFIGS['supply_depot']?.cost.toLocaleString() ?? '750'})</span>
                  </button>
                )}
              </>
            )}

            {/* D. THREAT ALERT DETAIL */}
            {activeModal === 'alert' && (
              <>
                <div className="flex items-center gap-2 border-b border-[#1f2e3d] pb-2 text-rose-400 font-display font-bold text-sm uppercase">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Defense Warning Network</span>
                </div>
                <div className="space-y-1.5 bg-[#141d27] p-2.5 rounded-xl border border-[#1f2e3d]">
                  <div className="flex justify-between">
                    <span className="text-[#94a3b8]">Sector Threat Level:</span>
                    <span className={`font-bold ${threatLevel === 'CRITICAL' ? 'text-rose-400' : 'text-[#38b98a]'}`}>
                      {threatLevel}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#94a3b8]">Hostile Units Detected:</span>
                    <span className="font-bold text-rose-400">{enemyUnits.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#94a3b8]">Friendly Combat Strength:</span>
                    <span className="font-bold text-[#38b98a]">{playerUnits.length}</span>
                  </div>
                </div>
                <p className="text-[11px] text-[#94a3b8] leading-relaxed">
                  {hostileNearBase
                    ? 'Hostile forces are approaching your primary base perimeter! Deploy defensive turrets and scramble combat squads.'
                    : 'Perimeter is secure. Maintain patrols and reinforce defense choke points.'}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setActiveModal(null);
                      onCenterHQ();
                    }}
                    className="flex-1 py-2 bg-[#141d27] hover:bg-[#173a32] text-[#38b98a] font-bold rounded-lg flex items-center justify-center gap-1"
                  >
                    <Crosshair className="w-3.5 h-3.5" />
                    <span>CENTER HQ</span>
                  </button>
                  {onStartBuildingPlacement && (
                    <button
                      onClick={() => {
                        setActiveModal(null);
                        onStartBuildingPlacement('heavy_turret');
                      }}
                      className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg flex items-center justify-center gap-1 shadow-md"
                    >
                      <Shield className="w-3.5 h-3.5" />
                      <span>BUILD TURRET</span>
                    </button>
                  )}
                </div>
              </>
            )}

            {/* E. COMMAND MENU */}
            {activeModal === 'menu' && (
              <>
                <div className="flex items-center gap-2 border-b border-[#1f2e3d] pb-2 text-[#38b98a] font-display font-bold text-sm uppercase">
                  <Menu className="w-4 h-4" />
                  <span>Field Operations Menu</span>
                </div>

                {/* GAME SPEED CONTROLS */}
                <div className="space-y-1">
                  <span className="text-[10px] text-[#94a3b8] font-bold uppercase">Simulation Speed:</span>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      onClick={() => {
                        engine.isPaused = !engine.isPaused;
                      }}
                      className={`py-1.5 rounded-lg font-bold flex items-center justify-center gap-1 ${
                        engine.isPaused ? 'bg-[#f2b84b] text-[#101820]' : 'bg-[#141d27] text-[#94a3b8]'
                      }`}
                    >
                      {engine.isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                      <span>{engine.isPaused ? 'RESUME' : 'PAUSE'}</span>
                    </button>
                    <button
                      onClick={() => {
                        engine.gameSpeed = 1.0;
                        engine.isPaused = false;
                      }}
                      className={`py-1.5 rounded-lg font-bold ${
                        engine.gameSpeed === 1.0 && !engine.isPaused
                          ? 'bg-[#173a32] text-[#38b98a] border border-[#38b98a]/50'
                          : 'bg-[#141d27] text-[#94a3b8]'
                      }`}
                    >
                      1.0x
                    </button>
                    <button
                      onClick={() => {
                        engine.gameSpeed = 2.0;
                        engine.isPaused = false;
                      }}
                      className={`py-1.5 rounded-lg font-bold flex items-center justify-center gap-1 ${
                        engine.gameSpeed === 2.0 && !engine.isPaused
                          ? 'bg-[#173a32] text-[#38b98a] border border-[#38b98a]/50'
                          : 'bg-[#141d27] text-[#94a3b8]'
                      }`}
                    >
                      <FastForward className="w-3 h-3" />
                      <span>2.0x</span>
                    </button>
                  </div>
                </div>

                {/* ACTIONS LIST */}
                <div className="space-y-1 pt-1 border-t border-[#1f2e3d]">
                  <button
                    onClick={() => {
                      setActiveModal(null);
                      onOpenAdvisor();
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-[#173a32] text-[#38b98a] font-bold border border-[#38b98a]/40"
                  >
                    <div className="flex items-center gap-2">
                      <Brain className="w-4 h-4" />
                      <span>AI COMMANDER</span>
                    </div>
                    <span className="text-[9px] bg-[#38b98a]/20 px-1.5 py-0.5 rounded">
                      {engine.autoProduction.enabled ? 'ACTIVE' : 'STANDBY'}
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      setActiveModal(null);
                      onOpenSaveLoad();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-[#141d27] text-[#94a3b8] hover:text-[#f4f7fa]"
                  >
                    <Save className="w-4 h-4 text-[#38b98a]" />
                    <span>SAVE & LOAD GAME</span>
                  </button>

                  <button
                    onClick={() => {
                      setActiveModal(null);
                      onOpenSettings();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-[#141d27] text-[#94a3b8] hover:text-[#f4f7fa]"
                  >
                    <Sliders className="w-4 h-4 text-[#36c9e8]" />
                    <span>GRAPHICS & CONTROLS SETTINGS</span>
                  </button>

                  <button
                    onClick={onToggleMute}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-[#141d27] text-[#94a3b8]"
                  >
                    <div className="flex items-center gap-2">
                      {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-[#38b98a]" />}
                      <span>AUDIO SOUNDTRACK</span>
                    </div>
                    <span className="text-[9px] font-bold">{isMuted ? 'MUTED' : 'ON'}</span>
                  </button>

                  <button
                    onClick={onToggleFullscreen}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-[#141d27] text-[#94a3b8]"
                  >
                    <div className="flex items-center gap-2">
                      {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                      <span>IMMERSIVE FULLSCREEN</span>
                    </div>
                    <span className="text-[9px] font-bold">{isFullscreen ? 'ENABLED' : 'OFF'}</span>
                  </button>

                  {onExitToMenu && (
                    <button
                      onClick={() => {
                        setActiveModal(null);
                        onExitToMenu();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-950/60 border border-rose-800/60 text-rose-400 font-bold mt-2"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>SURRENDER & EXIT TO MENU</span>
                    </button>
                  )}
                </div>
              </>
            )}

            {/* F. OPTIONAL DEVELOPER SANDBOX DRAWER (No permanently visible floating toolbar) */}
            {activeModal === 'sandbox' && (
              <>
                <div className="flex items-center gap-2 border-b border-[#1f2e3d] pb-2 text-amber-400 font-display font-bold text-sm uppercase">
                  <Wrench className="w-4 h-4" />
                  <span>Developer Sandbox Operations</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      engine.economy.credits += 10000;
                      if (onRefresh) onRefresh();
                    }}
                    className="py-2 px-2.5 rounded-xl bg-[#141d27] hover:bg-[#1a2634] text-amber-300 font-bold text-left border border-[#1f2e3d]"
                  >
                    +$10,000 Credits
                  </button>

                  <button
                    onClick={() => {
                      engine.settings.fogOfWarEnabled = !engine.settings.fogOfWarEnabled;
                      if (onRefresh) onRefresh();
                    }}
                    className="py-2 px-2.5 rounded-xl bg-[#141d27] hover:bg-[#1a2634] text-sky-400 font-bold text-left border border-[#1f2e3d]"
                  >
                    {engine.settings.fogOfWarEnabled ? 'Reveal Map (Fog Off)' : 'Engage Fog of War'}
                  </button>

                  <button
                    onClick={() => {
                      const hq = engine.buildings.find(b => b.type === 'headquarters' && b.faction === 'player');
                      const x = hq ? hq.pixelX : 500;
                      const y = hq ? hq.pixelY + 60 : 500;
                      engine.spawnUnit('main_battle_tank', 'player', { x, y });
                      if (onRefresh) onRefresh();
                    }}
                    className="py-2 px-2.5 rounded-xl bg-[#141d27] hover:bg-[#1a2634] text-emerald-400 font-bold text-left border border-[#1f2e3d]"
                  >
                    +Centurion MBT
                  </button>

                  <button
                    onClick={() => {
                      const hq = engine.buildings.find(b => b.type === 'headquarters' && b.faction === 'player');
                      const x = hq ? hq.pixelX : 500;
                      const y = hq ? hq.pixelY + 60 : 500;
                      engine.spawnUnit('heavy_tank', 'player', { x, y });
                      if (onRefresh) onRefresh();
                    }}
                    className="py-2 px-2.5 rounded-xl bg-[#141d27] hover:bg-[#1a2634] text-emerald-300 font-bold text-left border border-[#1f2e3d]"
                  >
                    +Mammoth Tank
                  </button>

                  <button
                    onClick={() => {
                      // Trigger tactical nuke strike
                      const hq = engine.buildings.find(b => b.type === 'headquarters' && b.faction === 'enemy');
                      if (hq) {
                        engine.launchTacticalNuke({ x: hq.pixelX, y: hq.pixelY });
                      }
                      setActiveModal(null);
                    }}
                    className="py-2 px-2.5 rounded-xl bg-rose-950/70 hover:bg-rose-900 text-rose-300 font-bold text-left border border-rose-500/40 col-span-2"
                  >
                    ☢️ Launch Strike Nuke on Enemy HQ
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};
