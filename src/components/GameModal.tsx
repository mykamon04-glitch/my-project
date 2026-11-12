/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import {
  Trophy,
  Skull,
  X,
  Volume2,
  Keyboard,
  Shield,
  Play,
  RotateCcw,
  Sliders,
  CheckCircle2,
  Tv,
  Eye,
  Activity,
} from 'lucide-react';
import { CAMPAIGN_MISSIONS } from '../data/gameData';
import { GameEngine } from '../game/engine';
import { AIDifficulty, GameMode } from '../types/game';

interface GameModalProps {
  engine: GameEngine;
  modalType: 'victory' | 'defeat' | 'briefing' | 'settings' | null;
  onClose: () => void;
  onStartNewGame: (mode: GameMode, difficulty: AIDifficulty, mapId: string, campaignId?: number) => void;
  onRestartCurrent: () => void;
}

export const GameModal: React.FC<GameModalProps> = ({
  engine,
  modalType,
  onClose,
  onStartNewGame,
  onRestartCurrent,
}) => {
  const [, setForceUpdate] = useState(0);

  useEffect(() => {
    if (modalType === 'victory') {
      try {
        confetti({
          particleCount: 90,
          spread: 75,
          origin: { y: 0.6 },
          colors: ['#22c55e', '#38bdf8', '#f59e0b'],
        });
      } catch {
        // Fallback
      }
    }
  }, [modalType]);

  if (!modalType) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 select-none">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6 text-slate-100 overflow-hidden">
        {modalType === 'settings' && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* --- VICTORY SCREEN --- */}
        {modalType === 'victory' && (
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-emerald-500/10 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Trophy className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-display font-bold text-emerald-400 tracking-wide uppercase">
              Sector Secured — Victory!
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Hostile forces have been thoroughly routed and all key objectives secured.
            </p>

            <div className="mt-4 p-3 bg-slate-950/60 border border-slate-800 rounded-lg grid grid-cols-2 gap-3 text-xs font-mono-numbers text-left">
              <div>
                <span className="text-slate-400 block text-[10px]">COMBAT TIME</span>
                <span className="text-slate-200 font-bold">
                  {Math.floor(engine.gameTime / 60)}m {Math.floor(engine.gameTime % 60)}s
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">CREDITS ACCRUED</span>
                <span className="text-amber-400 font-bold">
                  ${Math.floor(engine.economy.credits).toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">SURVIVING TROOPS</span>
                <span className="text-emerald-400 font-bold">
                  {engine.units.filter(u => u.faction === 'player').length}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">TECHS RESEARCHED</span>
                <span className="text-sky-400 font-bold">{engine.unlockedTechs.size}</span>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                onClick={onRestartCurrent}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-display font-semibold transition-colors flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" /> REPLAY MATCH
              </button>
              {engine.mode === 'campaign' && engine.currentMission && engine.currentMission.id < 3 ? (
                <button
                  onClick={() =>
                    onStartNewGame('campaign', engine.difficulty, 'river_delta', engine.currentMission!.id + 1)
                  }
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-display font-bold tracking-wide transition-colors flex items-center gap-1.5"
                >
                  NEXT OPERATION <Play className="w-3.5 h-3.5 fill-current" />
                </button>
              ) : (
                <button
                  onClick={onClose}
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-display font-bold tracking-wide transition-colors"
                >
                  RETURN TO BASE
                </button>
              )}
            </div>
          </div>
        )}

        {/* --- DEFEAT SCREEN --- */}
        {modalType === 'defeat' && (
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-rose-500/10 border border-rose-500/40 flex items-center justify-center text-rose-400">
              <Skull className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-display font-bold text-rose-400 tracking-wide uppercase">
              Command Base Fallen
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Your Command Center was demolished or your forces were overwhelmed by enemy fire.
            </p>

            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                onClick={onRestartCurrent}
                className="px-5 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-display font-bold tracking-wide transition-colors flex items-center gap-1.5 shadow-lg"
              >
                <RotateCcw className="w-4 h-4" /> RETRY MISSION
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-display font-semibold transition-colors"
              >
                CONTINUE EXPLORING
              </button>
            </div>
          </div>
        )}

        {/* --- MISSION BRIEFING SCREEN --- */}
        {modalType === 'briefing' && engine.currentMission && (
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-emerald-400">
              <Shield className="w-4 h-4" />
              <span>OPERATION: {engine.currentMission.codenamed}</span>
            </div>
            <h2 className="text-xl font-display font-bold text-slate-100 mt-1 uppercase">
              {engine.currentMission.title}
            </h2>
            <div className="mt-3 p-3 bg-slate-950/60 border border-slate-800 rounded-lg text-xs text-slate-300 leading-relaxed">
              {engine.currentMission.briefing}
            </div>

            <div className="mt-4">
              <span className="text-xs font-display font-bold text-slate-200 block mb-2">
                MISSION OBJECTIVES:
              </span>
              <div className="space-y-1.5">
                {engine.currentMission.objectives.map(obj => (
                  <div key={obj.id} className="flex items-start gap-2 text-xs text-slate-300">
                    <CheckCircle2
                      className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                        obj.completed ? 'text-emerald-400' : 'text-slate-600'
                      }`}
                    />
                    <span className={obj.completed ? 'line-through text-slate-500' : ''}>{obj.text}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={onClose}
                className="px-6 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-display font-bold text-xs tracking-wide transition-colors flex items-center gap-1.5"
              >
                DEPLOY COMMAND CENTER <Play className="w-3.5 h-3.5 fill-current" />
              </button>
            </div>
          </div>
        )}

        {/* --- ADVANCED SETTINGS & GRAPHICS SCREEN --- */}
        {modalType === 'settings' && (
          <div>
            <div className="flex items-center gap-2 text-sm font-display font-bold text-slate-200 mb-3">
              <Sliders className="w-4 h-4 text-emerald-400" />
              TACTICAL OPERATIONS & GRAPHICS CONFIGURATION
            </div>

            <div className="space-y-3 text-xs font-mono max-h-80 overflow-y-auto pr-1">
              {/* Graphics Presets */}
              <div className="p-2.5 bg-slate-950/60 border border-slate-800 rounded-lg">
                <span className="text-slate-400 block mb-1.5 text-[11px] font-bold">GRAPHICS PRESET:</span>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['low', 'medium', 'high', 'ultra'] as const).map(preset => (
                    <button
                      key={preset}
                      onClick={() => {
                        engine.settings.graphicsQuality = preset;
                        localStorage.setItem('iron_dominion_graphics_quality', preset);
                        setForceUpdate(n => n + 1);
                      }}
                      className={`py-1 rounded text-center uppercase font-bold transition-colors ${
                        engine.settings.graphicsQuality === preset
                          ? 'bg-emerald-600 text-slate-950'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggles */}
              <div className="p-2.5 bg-slate-950/60 border border-slate-800 rounded-lg space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-300">Screen Shake Effects:</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={engine.settings.screenShake}
                    onChange={e => {
                      engine.settings.screenShake = parseFloat(e.target.value);
                      setForceUpdate(n => n + 1);
                    }}
                    className="w-28 accent-emerald-500"
                  />
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-slate-300">Combat Explosions & Tracers:</span>
                  <button
                    onClick={() => {
                      engine.settings.combatEffects = !engine.settings.combatEffects;
                      setForceUpdate(n => n + 1);
                    }}
                    className={`px-2 py-0.5 rounded font-bold ${
                      engine.settings.combatEffects ? 'bg-emerald-600 text-slate-950' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {engine.settings.combatEffects ? 'ON' : 'OFF'}
                  </button>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-slate-300">Weather & Dust Effects:</span>
                  <button
                    onClick={() => {
                      engine.settings.weatherEffects = !engine.settings.weatherEffects;
                      setForceUpdate(n => n + 1);
                    }}
                    className={`px-2 py-0.5 rounded font-bold ${
                      engine.settings.weatherEffects ? 'bg-emerald-600 text-slate-950' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {engine.settings.weatherEffects ? 'ON' : 'OFF'}
                  </button>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-slate-300">Battlefield Smoke Density:</span>
                  <div className="flex gap-1">
                    {(['off', 'low', 'normal'] as const).map(d => (
                      <button
                        key={d}
                        onClick={() => {
                          engine.settings.smokeDensity = d;
                          setForceUpdate(n => n + 1);
                        }}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          engine.settings.smokeDensity === d ? 'bg-emerald-600 text-slate-950' : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-slate-300">Troop Tactical Visibility:</span>
                  <div className="flex gap-1">
                    {(['standard', 'enhanced'] as const).map(v => (
                      <button
                        key={v}
                        onClick={() => {
                          engine.settings.unitVisibility = v;
                          setForceUpdate(n => n + 1);
                        }}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          engine.settings.unitVisibility === v ? 'bg-emerald-600 text-slate-950' : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-slate-300">Fog of War Line-of-Sight:</span>
                  <button
                    onClick={() => {
                      engine.settings.fogOfWarEnabled = !engine.settings.fogOfWarEnabled;
                      setForceUpdate(n => n + 1);
                    }}
                    className={`px-2 py-0.5 rounded font-bold ${
                      engine.settings.fogOfWarEnabled ? 'bg-emerald-600 text-slate-950' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {engine.settings.fogOfWarEnabled ? 'ACTIVE' : 'REVEALED'}
                  </button>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-slate-300">Floating Damage Indicators:</span>
                  <button
                    onClick={() => {
                      engine.settings.showDamageNumbers = !engine.settings.showDamageNumbers;
                      setForceUpdate(n => n + 1);
                    }}
                    className={`px-2 py-0.5 rounded font-bold ${
                      engine.settings.showDamageNumbers ? 'bg-emerald-600 text-slate-950' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {engine.settings.showDamageNumbers ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>
              </div>

              {/* Keybindings Guide */}
              <div className="p-2.5 bg-slate-950/60 border border-slate-800 rounded-lg text-slate-300 space-y-1 text-[11px]">
                <div className="font-bold text-emerald-400 mb-1">KEYBOARD SHORTCUTS:</div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Left Click & Drag:</span>
                  <span>Select Squad Box</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Right Click:</span>
                  <span>Move / Attack Target</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Tab:</span>
                  <span className="text-amber-400">Cinematic Immersive HUD</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">A / H / S / P:</span>
                  <span className="text-sky-400">Attack-Move / Hold / Stop / Patrol</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">1 - 5 / Ctrl+1-5:</span>
                  <span className="text-amber-400">Squad Control Groups</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Space / H:</span>
                  <span>Snap to Army / Base HQ</span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-between items-center pt-3 border-t border-slate-800">
              <button
                onClick={onRestartCurrent}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-300 transition-colors flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" /> RESTART MATCH
              </button>
              <button
                onClick={onClose}
                className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-display font-bold text-xs transition-colors"
              >
                SAVE & CLOSE
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
