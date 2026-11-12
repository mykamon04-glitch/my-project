/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Coins,
  Zap,
  Users,
  Play,
  Pause,
  FastForward,
  Volume2,
  VolumeX,
  Settings as SettingsIcon,
  CloudRain,
  Sun,
  Moon,
  Wind,
  Snowflake,
  Maximize2,
  Minimize2,
  Eye,
  EyeOff,
  Save,
  Swords,
  MoreVertical,
  X,
  Bot,
  Map,
  Brain,
  Crosshair,
  Shield,
  AlertTriangle,
  Hammer,
} from 'lucide-react';
import { GameEngine } from '../game/engine';
import { BuildingType } from '../types/game';

interface TopBarProps {
  engine: GameEngine;
  onOpenSettings: () => void;
  onOpenSaveLoad: () => void;
  onOpenAdvisor?: () => void;
  onToggleMute: () => void;
  isMuted: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  isCinematicMode: boolean;
  onToggleCinematic: () => void;
  activeInteractionMode?: 'NORMAL' | 'MOVE_TARGET' | 'ATTACK_TARGET' | 'BOX_SELECT';
  onCancelInteractionMode?: () => void;
  showRadar?: boolean;
  onToggleRadar?: () => void;
  onCenterHQ?: () => void;
  onStartBuildingPlacement?: (type: BuildingType) => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  engine,
  onOpenSettings,
  onOpenSaveLoad,
  onOpenAdvisor,
  onToggleMute,
  isMuted,
  isFullscreen,
  onToggleFullscreen,
  isCinematicMode,
  onToggleCinematic,
  activeInteractionMode = 'NORMAL',
  onCancelInteractionMode,
  showRadar = true,
  onToggleRadar,
  onCenterHQ,
  onStartBuildingPlacement,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showPowerAlertModal, setShowPowerAlertModal] = useState(false);

  const isPowerDeficit = engine.economy.powerSupply < engine.economy.powerDemand;
  const minutes = Math.floor(engine.gameTime / 60);
  const seconds = Math.floor(engine.gameTime % 60);
  const timeFormatted = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  const renderWeatherIcon = () => {
    if (engine.dayNightPhase > 0.4) return <Moon className="w-3.5 h-3.5 text-indigo-400" />;
    if (engine.weather === 'rain') return <CloudRain className="w-3.5 h-3.5 text-[#36C9E8]" />;
    if (engine.weather === 'snow') return <Snowflake className="w-3.5 h-3.5 text-sky-200" />;
    if (engine.weather === 'dust_storm') return <Wind className="w-3.5 h-3.5 text-[#F2B84B]" />;
    return <Sun className="w-3.5 h-3.5 text-[#F2B84B]" />;
  };

  const threatColor =
    engine.tacticalIntelligence.threatLevel === 'RED'
      ? 'text-red-400 bg-red-950/80 border-red-500/80 animate-pulse'
      : engine.tacticalIntelligence.threatLevel === 'ORANGE'
      ? 'text-orange-400 bg-orange-950/80 border-orange-500/80'
      : engine.tacticalIntelligence.threatLevel === 'YELLOW'
      ? 'text-yellow-400 bg-yellow-950/80 border-yellow-500/80'
      : 'text-emerald-400 bg-emerald-950/60 border-emerald-500/50';

  return (
    <>
      <header className="absolute top-0 left-0 right-0 h-12 sm:h-14 bg-[#0d141d]/95 backdrop-blur-md border-b border-[#1C2933] z-30 flex items-center justify-between px-2 sm:px-4 select-none pt-safe">
        {/* Zone 1: Badge & Mission mode */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded bg-[#173A32] border border-[#38B98A]/50 flex items-center justify-center font-display font-bold text-[#38B98A] text-xs sm:text-sm shadow-md">
            ID
          </div>
          <div className="hidden min-[380px]:block leading-tight">
            <span className="text-[11px] sm:text-xs font-display font-bold tracking-wider text-[#F4F7FA] uppercase whitespace-nowrap block">
              {engine.mode === 'campaign' && engine.currentMission
                ? engine.currentMission.title
                : engine.mode === 'defense'
                ? `Wave ${engine.defenseWave}`
                : engine.mode === 'sandbox'
                ? 'Sandbox'
                : 'Iron Dominion'}
            </span>
            <span className="text-[9px] text-[#A9B8C5] font-mono leading-none hidden sm:block">
              {engine.mode.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Zone 2: Primary HUD Readouts (Credits, Power, Population, Threat) */}
        <div className="flex items-center gap-1 sm:gap-2 shrink">
          {/* Credits */}
          <div
            title={`Credits: $${Math.floor(engine.economy.credits).toLocaleString()} (+${engine.economy.incomeRate}/m)`}
            className="flex items-center gap-1 bg-[#16212c]/90 border border-[#1C2933] px-2 py-0.5 sm:py-1 rounded-md min-h-[32px] sm:min-h-[36px]"
          >
            <Coins className="w-3.5 h-3.5 text-[#F2B84B] shrink-0" />
            <div className="flex flex-col">
              <span className="text-xs sm:text-sm font-mono-numbers font-bold text-[#F2B84B] leading-none">
                ${Math.floor(engine.economy.credits).toLocaleString()}
              </span>
              <span className="text-[8px] text-[#A9B8C5] font-mono leading-none hidden sm:inline">
                +{engine.economy.incomeRate}/m
              </span>
            </div>
          </div>

          {/* Power Grid (Click opens warning or status) */}
          <button
            onClick={() => isPowerDeficit && setShowPowerAlertModal(true)}
            title={
              isPowerDeficit
                ? 'CRITICAL POWER DEFICIT! Tap for emergency options.'
                : `Power Supply: ${engine.economy.powerSupply} / Demand: ${engine.economy.powerDemand}`
            }
            className={`flex items-center gap-1 px-2 py-0.5 sm:py-1 rounded-md min-h-[32px] sm:min-h-[36px] border transition-all ${
              isPowerDeficit
                ? 'bg-rose-950/90 border-rose-500 text-rose-300 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.4)] cursor-pointer'
                : 'bg-[#16212c]/90 border-[#1C2933] text-[#36C9E8]'
            }`}
          >
            <Zap className="w-3.5 h-3.5 shrink-0" />
            <div className="flex flex-col text-left">
              <span className="text-xs sm:text-sm font-mono-numbers font-bold leading-none">
                {engine.economy.powerSupply}/{engine.economy.powerDemand}
              </span>
              <span className={`text-[8px] font-mono leading-none ${isPowerDeficit ? 'text-rose-400 font-bold' : 'text-[#A9B8C5]'} hidden sm:inline`}>
                {isPowerDeficit ? 'DEFICIT' : 'PWR OK'}
              </span>
            </div>
          </button>

          {/* Population */}
          <div
            title={`Population: ${engine.economy.population} / ${engine.economy.populationCap}`}
            className="flex items-center gap-1 bg-[#16212c]/90 border border-[#1C2933] px-2 py-0.5 sm:py-1 rounded-md min-h-[32px] sm:min-h-[36px] text-[#F4F7FA]"
          >
            <Users className="w-3.5 h-3.5 text-[#38B98A] shrink-0" />
            <span className="text-xs sm:text-sm font-mono-numbers font-bold leading-none">
              {engine.economy.population}/{engine.economy.populationCap}
            </span>
          </div>

          {/* Tactical Threat Alert Badge */}
          {engine.tacticalIntelligence && (
            <button
              onClick={onOpenAdvisor}
              title={`Tactical Defense: ${engine.tacticalIntelligence.threatLevel}. Tap to open AI Advisor.`}
              className={`flex items-center gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md min-h-[32px] sm:min-h-[36px] border text-[10px] sm:text-xs font-mono font-bold transition-all ${threatColor}`}
            >
              <Shield className="w-3 h-3 shrink-0" />
              <span>{engine.tacticalIntelligence.threatLevel}</span>
            </button>
          )}
        </div>

        {/* Zone 3: Essential Actions + Expandable Tactical Drawer */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Pause / Play */}
          <button
            onClick={() => (engine.isPaused = !engine.isPaused)}
            title={engine.isPaused ? 'Resume Game' : 'Pause Game'}
            className={`p-1.5 sm:p-2 rounded-md border min-w-[32px] min-h-[32px] sm:min-w-[36px] sm:min-h-[36px] flex items-center justify-center transition-colors ${
              engine.isPaused
                ? 'bg-[#F2B84B] text-[#101820] border-[#F2B84B]'
                : 'bg-[#16212c] border-[#1C2933] text-[#A9B8C5] hover:text-[#F4F7FA]'
            }`}
          >
            {engine.isPaused ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5" />}
          </button>

          {/* Settings Modal Toggle */}
          <button
            onClick={onOpenSettings}
            title="Mobile Settings"
            className="p-1.5 sm:p-2 rounded-md bg-[#16212c] border border-[#1C2933] text-[#A9B8C5] hover:text-[#F4F7FA] transition-colors min-w-[32px] min-h-[32px] sm:min-w-[36px] sm:min-h-[36px] flex items-center justify-center"
          >
            <SettingsIcon className="w-3.5 h-3.5" />
          </button>

          {/* Expandable Tactical Drawer Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            title="Tactical Overview & Controls"
            className={`p-1.5 sm:p-2 rounded-md border transition-colors min-w-[32px] min-h-[32px] sm:min-w-[36px] sm:min-h-[36px] flex items-center justify-center ${
              mobileMenuOpen
                ? 'bg-[#38B98A] text-[#101820] border-[#38B98A]'
                : 'bg-[#16212c] border-[#1C2933] text-[#F4F7FA] hover:border-[#38B98A]'
            }`}
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <MoreVertical className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* ACTIVE INTERACTION ORDER BANNER */}
      {activeInteractionMode !== 'NORMAL' && (
        <div className="absolute top-12 sm:top-14 left-0 right-0 z-20 bg-[#173A32]/95 border-b border-[#38B98A] py-1 px-3 sm:px-4 flex items-center justify-between text-[11px] sm:text-xs font-mono shadow-lg">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#38B98A] animate-ping" />
            <span className="font-bold text-[#F4F7FA] truncate">
              {activeInteractionMode === 'MOVE_TARGET'
                ? 'TAP ANYWHERE ON BATTLEFIELD TO MOVE TROOPS'
                : activeInteractionMode === 'ATTACK_TARGET'
                ? 'TAP ENEMY UNIT OR BUILDING TO ATTACK'
                : 'BOX SELECTION MODE ACTIVE'}
            </span>
          </div>
          {onCancelInteractionMode && (
            <button
              onClick={onCancelInteractionMode}
              className="px-2 py-0.5 rounded bg-[#101820] border border-[#38B98A] text-[#38B98A] hover:text-white font-bold text-[10px] shrink-0"
            >
              CANCEL
            </button>
          )}
        </div>
      )}

      {/* POWER DEFICIT EXPLANATION MODAL (Phase 2 Requirement) */}
      {showPowerAlertModal && isPowerDeficit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-[#101820] border border-rose-500 rounded-xl max-w-sm w-full p-4 shadow-2xl space-y-3">
            <div className="flex items-center justify-between border-b border-rose-500/40 pb-2">
              <div className="flex items-center gap-2 text-rose-400 font-display font-bold text-sm tracking-wide">
                <AlertTriangle className="w-5 h-5 text-rose-500 animate-bounce" />
                <span>POWER SHORTAGE DETECTED</span>
              </div>
              <button
                onClick={() => setShowPowerAlertModal(false)}
                className="p-1 text-gray-400 hover:text-white rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-rose-950/40 border border-rose-900/60 p-2.5 rounded-lg text-xs font-mono space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-400">Available Power:</span>
                <span className="font-bold text-rose-300">{engine.economy.powerSupply} GW</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Required Demand:</span>
                <span className="font-bold text-rose-300">{engine.economy.powerDemand} GW</span>
              </div>
              <div className="flex justify-between border-t border-rose-800/40 pt-1">
                <span className="text-rose-400 font-bold">Deficit:</span>
                <span className="font-bold text-rose-400">
                  -{engine.economy.powerDemand - engine.economy.powerSupply} GW
                </span>
              </div>
            </div>

            <div className="text-xs text-slate-300 space-y-1">
              <p className="font-bold text-amber-300">Recommended action:</p>
              <p className="text-[11px] leading-relaxed text-slate-400">
                Build additional reactors (Power Plant) or temporarily disable nonessential power-consuming structures. Construction speeds and defenses operate at reduced efficiency during deficits.
              </p>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => {
                  setShowPowerAlertModal(false);
                  if (onStartBuildingPlacement) onStartBuildingPlacement('power_plant');
                }}
                className="flex-1 py-2 px-3 bg-[#38B98A] hover:bg-[#4ade80] text-[#101820] font-mono font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 shadow-md"
              >
                <Hammer className="w-4 h-4" />
                <span>BUILD POWER PLANT</span>
              </button>
              <button
                onClick={() => setShowPowerAlertModal(false)}
                className="py-2 px-3 bg-[#1C2933] text-gray-300 font-mono text-xs rounded-lg hover:bg-slate-800"
              >
                DISMISS
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EXPANDABLE TACTICAL DRAWER (Clean Mobile Dropdown) */}
      {mobileMenuOpen && (
        <div className="fixed top-12 sm:top-14 right-2 z-40 bg-[#101820]/95 backdrop-blur-lg border border-[#1C2933] rounded-xl shadow-2xl p-3 w-64 max-h-[85vh] overflow-y-auto space-y-3 animate-fadeIn">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#1C2933] pb-1.5">
            <span className="text-xs font-display font-bold text-[#F4F7FA] tracking-wider uppercase flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#38B98A]" />
              TACTICAL OVERVIEW
            </span>
            <div className="flex items-center gap-1 text-[11px] font-mono text-[#A9B8C5]">
              {renderWeatherIcon()}
              <span>{timeFormatted}</span>
            </div>
          </div>

          {/* Economy Breakdown */}
          <div className="bg-[#16212c] p-2 rounded-lg border border-[#1C2933] text-[11px] font-mono space-y-1">
            <div className="flex justify-between items-center text-[#A9B8C5]">
              <span>Income Rate:</span>
              <span className="font-bold text-[#F2B84B]">+{engine.economy.incomeRate} / min</span>
            </div>
            <div className="flex justify-between items-center text-[#A9B8C5]">
              <span>Force Strength:</span>
              <span className="font-bold text-[#36C9E8]">
                ${(engine.economy.armyStrength / 1000).toFixed(1)}k
              </span>
            </div>
          </div>

          {/* Game Speed Controls */}
          <div className="space-y-1">
            <span className="text-[10px] font-mono text-[#A9B8C5] uppercase font-bold">GAME SPEED:</span>
            <div className="grid grid-cols-3 gap-1">
              <button
                onClick={() => {
                  engine.isPaused = !engine.isPaused;
                }}
                className={`py-1.5 text-xs font-mono font-bold rounded flex items-center justify-center gap-1 ${
                  engine.isPaused ? 'bg-[#F2B84B] text-[#101820]' : 'bg-[#1C2933] text-[#A9B8C5]'
                }`}
              >
                {engine.isPaused ? 'RESUME' : 'PAUSE'}
              </button>
              <button
                onClick={() => {
                  engine.gameSpeed = 1.0;
                  engine.isPaused = false;
                }}
                className={`py-1.5 text-xs font-mono font-bold rounded ${
                  engine.gameSpeed === 1.0 && !engine.isPaused
                    ? 'bg-[#173A32] text-[#38B98A] border border-[#38B98A]/50'
                    : 'bg-[#1C2933] text-[#A9B8C5]'
                }`}
              >
                1.0x
              </button>
              <button
                onClick={() => {
                  engine.gameSpeed = 2.0;
                  engine.isPaused = false;
                }}
                className={`py-1.5 text-xs font-mono font-bold rounded flex items-center justify-center gap-1 ${
                  engine.gameSpeed === 2.0 && !engine.isPaused
                    ? 'bg-[#173A32] text-[#38B98A] border border-[#38B98A]/50'
                    : 'bg-[#1C2933] text-[#A9B8C5]'
                }`}
              >
                <FastForward className="w-3 h-3" />
                2.0x
              </button>
            </div>
          </div>

          {/* Quick Actions List */}
          <div className="space-y-1.5 pt-1 border-t border-[#1C2933]">
            {/* AI Advisor / Commander */}
            {onOpenAdvisor && (
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenAdvisor();
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-[#173A32] border border-[#38B98A]/50 text-left text-xs font-mono text-[#38B98A] font-bold"
              >
                <div className="flex items-center gap-2">
                  <Brain className="w-4 h-4" />
                  <span>AI COMMANDER</span>
                </div>
                <span className="text-[10px] bg-[#38B98A]/20 px-1.5 py-0.5 rounded">
                  {engine.autoProduction.enabled ? 'ACTIVE' : 'STANDBY'}
                </span>
              </button>
            )}

            {/* Tactical Radar Toggle */}
            {onToggleRadar && (
              <button
                onClick={onToggleRadar}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-[#1C2933] text-left text-xs font-mono text-[#36C9E8]"
              >
                <div className="flex items-center gap-2">
                  <Map className="w-4 h-4" />
                  <span>TACTICAL RADAR</span>
                </div>
                <span className="text-[10px] font-bold">{showRadar ? 'ON' : 'OFF'}</span>
              </button>
            )}

            {/* Center on Base HQ */}
            {onCenterHQ && (
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onCenterHQ();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1C2933] text-left text-xs font-mono text-[#38B98A] font-semibold"
              >
                <Crosshair className="w-4 h-4" />
                <span>CENTER BASE HQ</span>
              </button>
            )}

            {/* Save / Load */}
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenSaveLoad();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1C2933] text-left text-xs font-mono text-[#A9B8C5] hover:text-[#F4F7FA]"
            >
              <Save className="w-4 h-4 text-[#38B98A]" />
              <span>SAVE / LOAD GAME</span>
            </button>

            {/* Fullscreen */}
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onToggleFullscreen();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1C2933] text-left text-xs font-mono text-[#A9B8C5] hover:text-[#F4F7FA]"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4 text-[#36C9E8]" /> : <Maximize2 className="w-4 h-4" />}
              <span>{isFullscreen ? 'EXIT FULLSCREEN' : 'FULLSCREEN'}</span>
            </button>

            {/* Audio Toggle */}
            <button
              onClick={onToggleMute}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-[#1C2933] text-left text-xs font-mono text-[#A9B8C5] hover:text-[#F4F7FA]"
            >
              <div className="flex items-center gap-2">
                {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
                <span>AUDIO SOUND</span>
              </div>
              <span className="text-[10px] font-bold">{isMuted ? 'MUTED' : 'ON'}</span>
            </button>

            {/* Cinematic View */}
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onToggleCinematic();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1C2933] text-left text-xs font-mono text-[#F2B84B]"
            >
              <EyeOff className="w-4 h-4" />
              <span>CINEMATIC VIEW</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
};
