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
      {/* 1. AAA MILITARY STRATEGY TOP HUD (Matching Reference Design) */}
      <header className="fixed top-0 left-0 right-0 z-30 pt-safe pointer-events-auto select-none px-2 py-1.5 max-w-full overflow-hidden">
        <div className="flex items-center justify-between gap-1.5 w-full max-w-6xl mx-auto bg-[#101820]/95 backdrop-blur-md border border-[#1B2730] px-2.5 py-1.5 rounded-2xl shadow-2xl">
          {/* LEFT: BRAND INSIGNIA & TITLE */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-xl bg-[#1B2730] border border-[#2FB68A]/40 flex items-center justify-center shadow-inner">
              <Shield className="w-4 h-4 text-[#2FB68A]" />
            </div>
            <div className="hidden sm:flex flex-col">
              <span className="font-display font-bold text-xs tracking-wider text-[#F1F5F7] leading-none">
                IRON DOMINION
              </span>
              <span className="text-[8px] font-mono tracking-widest text-[#2FB68A] uppercase">
                REAL-TIME STRATEGY
              </span>
            </div>
          </div>

          {/* CENTER: RESOURCE STATUS METERS */}
          <div className="flex items-center gap-1 sm:gap-2 font-mono text-xs overflow-x-auto no-scrollbar">
            {/* CREDITS CHIP */}
            <button
              onClick={() => setActiveModal(activeModal === 'credits' ? null : 'credits')}
              className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-[#1B2730] hover:bg-[#22323e] border border-[#E5A93D]/30 text-[#E5A93D] active:scale-95 transition-all shrink-0 min-h-[36px]"
              title="Military Credits - Tap for economy breakdown"
            >
              <Coins className="w-3.5 h-3.5 text-[#E5A93D]" />
              <div className="flex flex-col text-left leading-none">
                <span className="font-bold tabular-nums text-xs">${Math.floor(econ.credits).toLocaleString()}</span>
                <span className="text-[9px] text-[#A8B6C2] tabular-nums leading-none">+{econ.incomeRate}/m</span>
              </div>
            </button>

            {/* POWER CHIP */}
            <button
              onClick={() => setActiveModal(activeModal === 'power' ? null : 'power')}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-xl border active:scale-95 transition-all shrink-0 min-h-[36px] ${
                isPowerDeficit
                  ? 'bg-[#D94F59]/20 border-[#D94F59] text-[#D94F59]'
                  : 'bg-[#1B2730] hover:bg-[#22323e] border-[#4B91B5]/30 text-[#4B91B5]'
              }`}
              title="Power Grid - Tap for diagnostics"
            >
              <Zap className="w-3.5 h-3.5" />
              <div className="flex flex-col text-left leading-none">
                <span className="font-bold tabular-nums text-xs">
                  {econ.powerSupply - econ.powerDemand > 0 ? '+' : ''}
                  {econ.powerSupply - econ.powerDemand} GW
                </span>
                <span className="text-[9px] text-[#A8B6C2] tabular-nums leading-none">
                  {econ.powerSupply}/{econ.powerDemand}
                </span>
              </div>
            </button>

            {/* POPULATION CHIP */}
            <button
              onClick={() => setActiveModal(activeModal === 'pop' ? null : 'pop')}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-xl border active:scale-95 transition-all shrink-0 min-h-[36px] ${
                isPopCapped
                  ? 'bg-[#E5A93D]/20 border-[#E5A93D] text-[#E5A93D]'
                  : 'bg-[#1B2730] hover:bg-[#22323e] border-[#2FB68A]/30 text-[#2FB68A]'
              }`}
              title="Troop Personnel Capacity"
            >
              <Users className="w-3.5 h-3.5" />
              <div className="flex flex-col text-left leading-none">
                <span className="font-bold tabular-nums text-xs">{econ.population}/{econ.populationCap}</span>
                <span className="text-[9px] text-[#A8B6C2] leading-none">TROOPS</span>
              </div>
            </button>

            {/* THREAT ALERT CHIP */}
            <button
              onClick={() => setActiveModal(activeModal === 'alert' ? null : 'alert')}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-xl border active:scale-95 transition-all text-xs font-bold shrink-0 min-h-[36px] ${
                threatLevel === 'CRITICAL' || threatLevel === 'HIGH'
                  ? 'bg-[#D94F59]/20 border-[#D94F59] text-[#D94F59]'
                  : 'bg-[#1B2730] border-[#E5A93D]/40 text-[#E5A93D]'
              }`}
              title="Threat Early Warning"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span className="tabular-nums">Threat {enemyUnits.length > 0 ? enemyUnits.length : '0'}</span>
            </button>
          </div>

          {/* RIGHT: MENU HAMBURGER & RADAR */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onToggleRadar}
              className={`w-9 h-9 rounded-xl border flex items-center justify-center active:scale-95 transition-all ${
                isRadarVisible
                  ? 'bg-[#4B91B5]/20 border-[#4B91B5] text-[#4B91B5]'
                  : 'bg-[#1B2730] border-[#1B2730] text-[#A8B6C2]'
              }`}
              title="Toggle Minimap Radar"
            >
              <Radio className="w-4 h-4" />
            </button>

            <button
              onClick={onOpenSettings}
              className="w-9 h-9 rounded-xl bg-[#1B2730] hover:bg-[#22323e] border border-[#2c3e50] flex items-center justify-center text-[#F1F5F7] active:scale-95 transition-all"
              title="Main Menu"
            >
              <Menu className="w-4 h-4 text-[#2FB68A]" />
            </button>
          </div>
        </div>

        {/* TIER 2: FLOATING CAMERA QUICK CONTROLS */}
        <div className="flex items-center gap-1.5 pt-1.5 max-w-6xl mx-auto text-[10px] font-mono">
          <div className="flex items-center gap-1 bg-[#101820]/90 backdrop-blur-md px-2 py-1 rounded-xl border border-[#1B2730] shadow-md">
              {/* HQ */}
              <button
                onClick={onCenterHQ}
                className="px-2 py-0.5 rounded bg-[#141d27] hover:bg-[#1a2634] text-[#38b98a] font-bold flex items-center gap-1 active:scale-95 transition-transform"
                title="Center camera on primary Headquarters"
              >
                <Crosshair className="w-3 h-3" />
                <span>HQ</span>
              </button>

              {/* FIT BASE */}
              <button
                onClick={onFitBase}
                className="px-2 py-0.5 rounded bg-[#141d27] hover:bg-[#1a2634] text-[#36c9e8] font-bold flex items-center gap-1 active:scale-95 transition-transform"
                title="Fit entire friendly base within screen"
              >
                <Layers className="w-3 h-3" />
                <span>FIT</span>
              </button>

              {/* FOLLOW TROOPS */}
              <button
                onClick={onToggleFollow}
                className={`px-2 py-0.5 rounded font-bold flex items-center gap-1 active:scale-95 transition-all ${
                  isFollowing
                    ? 'bg-[#38b98a]/25 text-[#38b98a] border border-[#38b98a]/60'
                    : 'bg-[#141d27] hover:bg-[#1a2634] text-[#94a3b8]'
                }`}
                title="Lock camera to follow selected units"
              >
                <Eye className="w-3 h-3" />
                <span>FOLLOW</span>
              </button>

              {/* ZOOM CYCLE */}
              <button
                onClick={onCycleZoom}
                className="px-1.5 py-0.5 rounded bg-[#141d27] hover:bg-[#1a2634] text-[#f4f7fa] font-bold active:scale-95"
                title="Cycle Tactical Zoom Levels"
              >
                <span>{Math.round((currentZoom || 1.0) * 100)}%</span>
              </button>

              {/* 3D CAMERA ORBIT (45 DEGREE STEP) */}
              {is3D && onRotateCamera && (
                <button
                  onClick={onRotateCamera}
                  className="px-1.5 py-0.5 rounded bg-[#141d27] hover:bg-[#1a2634] text-[#36c9e8] font-bold flex items-center gap-1 active:scale-95"
                  title="Rotate 3D Tactical Battlefield View 45°"
                >
                  <Compass className="w-3 h-3" />
                  <span className="hidden xs:inline">45°</span>
                </button>
              )}
            </div>

            {/* SANDBOX / DEV TOOLS DRAWER TRIGGER (Only in Sandbox mode) */}
            {engine.mode === 'sandbox' && (
              <button
                onClick={() => setActiveModal('sandbox')}
                className="px-2 py-0.5 rounded-lg bg-amber-950/80 border border-amber-500/50 text-amber-300 font-bold flex items-center gap-1 shadow-md active:scale-95 shrink-0"
                title="Developer Sandbox Tools"
              >
                <Wrench className="w-3 h-3 text-amber-400" />
                <span>DEV TOOLS</span>
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
