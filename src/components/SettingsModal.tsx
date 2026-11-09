/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  X,
  Sliders,
  Volume2,
  Gamepad2,
  Brain,
  Radio,
  Clock,
  Accessibility,
  Database,
  Check,
  RotateCcw,
  Download,
  Upload,
  AlertTriangle,
  Layers,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import { GameEngine } from '../game/engine';
import { DefensePolicy, GameSettings } from '../types/game';

interface SettingsModalProps {
  engine: GameEngine | null;
  isOpen: boolean;
  onClose: () => void;
  onSettingsChanged?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

type SettingsTab =
  | 'graphics'
  | 'overlays'
  | 'audio'
  | 'controls'
  | 'automation'
  | 'radar'
  | 'gameplay'
  | 'accessibility'
  | 'data';

export const SettingsModal: React.FC<SettingsModalProps> = ({
  engine,
  isOpen,
  onClose,
  onSettingsChanged,
  isFullscreen = false,
  onToggleFullscreen,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('graphics');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState<boolean>(false);
  const [, setTick] = useState(0);

  if (!isOpen) return null;

  const currentSettings: GameSettings = engine?.settings || {
    soundEnabled: true,
    musicEnabled: true,
    masterVolume: 0.8,
    sfxVolume: 0.85,
    musicVolume: 0.35,
    combatVolume: 0.8,
    uiVolume: 0.7,
    voiceAlerts: true,
    muteWhenBackgrounded: true,
    showHealthBars: 'damaged',
    gameSpeed: 1.0,
    fogOfWarEnabled: true,
    weatherEffects: true,
    combatEffects: true,
    smokeDensity: 'low',
    unitVisibility: 'enhanced',
    dayNightCycle: false,
    graphicsQuality: 'ultra',
    screenShake: 0.0,
    showDamageNumbers: true,
    cameraSensitivity: 1.0,
    zoomSensitivity: 1.0,
    tapToMove: true,
    multiSelection: true,
    edgeScrolling: true,
    touchFeedback: true,
    autoDefenseEnabled: true,
    defensePolicy: 'full_defense',
    emergencyReinforcements: true,
    autoRepair: true,
    retreatThreshold: 0.25,
    radarVisibility: true,
    radarSize: 'standard',
    alertSoundEnabled: true,
    showThreatOverlay: true,
    showDefenseZoneOverlay: true,
    uiScale: 'standard',
    largeTouchTargets: false,
    colorblindMode: false,
    reducedMotion: false,
    highContrast: false,
  };

  const notifyChange = (msg?: string) => {
    setTick(t => t + 1);
    if (onSettingsChanged) onSettingsChanged();
    try {
      localStorage.setItem('iron_dominion_settings', JSON.stringify(currentSettings));
      localStorage.setItem('iron_dominion_graphics_quality', currentSettings.graphicsQuality);
    } catch {
      //
    }
    if (msg) {
      setStatusMsg(msg);
      setTimeout(() => setStatusMsg(null), 2500);
    }
  };

  const handleExportSave = () => {
    try {
      const stored = localStorage.getItem('iron_dominion_save_slots') || '{}';
      const blob = new Blob([stored], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `iron_dominion_backup_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      notifyChange('Save data exported successfully!');
    } catch {
      notifyChange('Failed to export data.');
    }
  };

  const handleImportSave = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const text = ev.target?.result as string;
        JSON.parse(text); // validate JSON
        localStorage.setItem('iron_dominion_save_slots', text);
        notifyChange('Save data imported successfully!');
      } catch {
        notifyChange('Invalid save backup file.');
      }
    };
    reader.readAsText(file);
  };

  const handleResetSettings = () => {
    if (engine) {
      engine.settings.graphicsQuality = 'ultra';
      engine.settings.screenShake = 0.0;
      engine.settings.combatEffects = true;
      engine.settings.weatherEffects = true;
      engine.settings.smokeDensity = 'low';
      engine.settings.unitVisibility = 'enhanced';
      engine.settings.fogOfWarEnabled = true;
      engine.settings.showHealthBars = 'damaged';
      engine.settings.showDamageNumbers = true;
      engine.settings.cameraSensitivity = 1.0;
      engine.settings.zoomSensitivity = 1.0;
      engine.settings.tapToMove = true;
      engine.settings.edgeScrolling = true;
      engine.settings.autoDefenseEnabled = true;
      engine.settings.defensePolicy = 'full_defense';
      engine.settings.emergencyReinforcements = true;
      engine.settings.autoRepair = true;
      engine.settings.retreatThreshold = 0.25;
      engine.settings.radarVisibility = true;
      engine.settings.alertSoundEnabled = true;
      engine.settings.showThreatOverlay = true;
      engine.settings.showDefenseZoneOverlay = true;
      engine.settings.eyeComfortMode = false;
      engine.settings.overlays = {
        attackRange: false,
        radarCoverage: false,
        defenseZones: false,
        patrolRoutes: false,
        buildingFootprints: false,
        unitSelection: true,
        enemyDetection: false,
        resourceLocations: false,
        pathfindingDebug: false,
      };
    }
    localStorage.removeItem('iron_dominion_settings');
    setConfirmReset(false);
    notifyChange('Settings restored to factory military defaults.');
  };

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'graphics', label: 'Graphics', icon: <Sliders className="w-4 h-4" /> },
    { id: 'overlays', label: 'Overlays', icon: <Layers className="w-4 h-4" /> },
    { id: 'audio', label: 'Audio', icon: <Volume2 className="w-4 h-4" /> },
    { id: 'controls', label: 'Controls', icon: <Gamepad2 className="w-4 h-4" /> },
    { id: 'automation', label: 'AI & Defense', icon: <Brain className="w-4 h-4" /> },
    { id: 'radar', label: 'Radar Sensor', icon: <Radio className="w-4 h-4" /> },
    { id: 'gameplay', label: 'Gameplay', icon: <Clock className="w-4 h-4" /> },
    { id: 'accessibility', label: 'Accessibility', icon: <Accessibility className="w-4 h-4" /> },
    { id: 'data', label: 'Save & Data', icon: <Database className="w-4 h-4" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-3 sm:p-6 select-none animate-fadeIn">
      <div className="relative w-full max-w-3xl bg-[#101820] border border-[#1C2933] rounded-2xl shadow-2xl text-[#F4F7FA] overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1C2933] bg-[#1C2933]/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#173A32] border border-[#38B98A]/60 flex items-center justify-center text-[#38B98A] shadow-md">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-display font-bold tracking-wider text-[#F4F7FA] uppercase">
                Operations & Systems Configuration
              </h2>
              <p className="text-[10px] text-[#A9B8C5] font-mono">
                Graphics engine, sound stage, tactical radar, and defensive automation
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

        {/* Tab Strip */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-[#1C2933] bg-[#101820] overflow-x-auto shrink-0">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 rounded-lg font-mono text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 min-h-[38px] ${
                activeTab === tab.id
                  ? 'bg-[#173A32] text-[#38B98A] border border-[#38B98A]/60 shadow-sm'
                  : 'text-[#A9B8C5] hover:text-[#F4F7FA] hover:bg-[#1C2933]/60'
              }`}
            >
              {tab.icon}
              <span>{tab.label.toUpperCase()}</span>
            </button>
          ))}
        </div>

        {/* Status Notification Toast */}
        {statusMsg && (
          <div className="bg-[#173A32] border-b border-[#38B98A] px-4 py-1.5 text-xs font-mono text-[#38B98A] flex items-center gap-2">
            <Check className="w-3.5 h-3.5" />
            <span>{statusMsg}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4 text-xs font-mono">
          {/* TAB 1: GRAPHICS */}
          {activeTab === 'graphics' && (
            <div className="space-y-4">
              {/* IMMERSIVE FULL SCREEN DISPLAY CARD */}
              <div className="p-3.5 bg-gradient-to-r from-[#173A32]/60 to-[#16212c] border border-[#38B98A]/40 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isFullscreen ? (
                      <Minimize2 className="w-4 h-4 text-[#38B98A]" />
                    ) : (
                      <Maximize2 className="w-4 h-4 text-[#38B98A]" />
                    )}
                    <div>
                      <span className="text-[#F4F7FA] block font-bold text-xs uppercase">
                        Immersive Full-Screen Mode
                      </span>
                      <span className="text-[10px] text-[#A9B8C5]">
                        Maximizes battlefield display area and activates auto-fade on nonessential HUD
                      </span>
                    </div>
                  </div>
                  {onToggleFullscreen && (
                    <button
                      onClick={() => {
                        onToggleFullscreen();
                        notifyChange(
                          isFullscreen ? 'Exited Full-Screen Mode' : 'Entered Immersive Full-Screen'
                        );
                      }}
                      className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all ${
                        isFullscreen
                          ? 'bg-[#38B98A] text-[#101820] shadow-md'
                          : 'bg-[#1C2933] text-[#F4F7FA] hover:bg-[#253644] border border-[#38B98A]/50'
                      }`}
                    >
                      {isFullscreen ? (
                        <>
                          <Minimize2 className="w-3.5 h-3.5" />
                          <span>EXIT FULLSCREEN</span>
                        </>
                      ) : (
                        <>
                          <Maximize2 className="w-3.5 h-3.5" />
                          <span>GO FULLSCREEN</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-[#A9B8C5] leading-relaxed">
                  On mobile browsers and installed PWAs, Full Screen hides address bars and decorative headers. During gameplay, secondary controls automatically minimize after 6 seconds of inactivity and restore instantly on touch.
                </p>
              </div>

              <div className="p-3.5 bg-[#1C2933]/50 border border-[#1C2933] rounded-xl space-y-2.5">
                <span className="text-[#A9B8C5] block font-bold text-[11px]">GRAPHICS FIDELITY PRESET</span>
                <div className="grid grid-cols-5 gap-1.5">
                  {(['low', 'medium', 'high', 'ultra'] as const).map(preset => (
                    <button
                      key={preset}
                      onClick={() => {
                        currentSettings.graphicsQuality = preset;
                        notifyChange(`Graphics preset set to ${preset.toUpperCase()}`);
                      }}
                      className={`py-2 rounded-lg text-center uppercase font-bold text-[11px] transition-all ${
                        currentSettings.graphicsQuality === preset
                          ? 'bg-[#38B98A] text-[#101820] shadow-md'
                          : 'bg-[#1C2933] text-[#A9B8C5] hover:text-[#F4F7FA]'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      // Auto mode: evaluate device performance
                      const isMobile = window.innerWidth < 768;
                      const dpr = window.devicePixelRatio || 1;
                      const quality = isMobile && dpr > 2 ? 'medium' : 'high';
                      currentSettings.graphicsQuality = quality;
                      notifyChange(`AUTO: Device profile calibrated (${quality.toUpperCase()})`);
                    }}
                    className="py-2 rounded-lg text-center uppercase font-bold text-[11px] bg-[#173A32] text-[#38B98A] border border-[#38B98A]/40 hover:bg-[#38B98A]/20"
                  >
                    AUTO
                  </button>
                </div>
              </div>

              {/* Resolution Scale & FPS Target */}
              <div className="p-3.5 bg-[#1C2933]/50 border border-[#1C2933] rounded-xl space-y-3">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-[#F4F7FA] font-bold block">Resolution Scale</span>
                    <span className="text-[10px] text-[#A9B8C5]">Native canvas render scaling</span>
                  </div>
                  <div className="flex gap-1">
                    {[0.75, 1.0, 1.25].map(scale => (
                      <button
                        key={scale}
                        onClick={() => {
                          currentSettings.resolutionScale = scale;
                          notifyChange(`Resolution scale: ${scale}x`);
                        }}
                        className={`px-2.5 py-1 rounded text-[10px] font-bold ${
                          (currentSettings.resolutionScale ?? 1.0) === scale
                            ? 'bg-[#38B98A] text-[#101820]'
                            : 'bg-[#1C2933] text-[#A9B8C5]'
                        }`}
                      >
                        {scale}x
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-[#1C2933]">
                  <div>
                    <span className="text-[#F4F7FA] font-bold block">Target Frame Rate</span>
                    <span className="text-[10px] text-[#A9B8C5]">Battery saver vs maximum fluid motion</span>
                  </div>
                  <div className="flex gap-1">
                    {([30, 60, 0] as const).map(fps => (
                      <button
                        key={fps}
                        onClick={() => {
                          currentSettings.frameRateTarget = fps;
                          notifyChange(`Target FPS: ${fps === 0 ? 'UNCAPPED' : fps}`);
                        }}
                        className={`px-2.5 py-1 rounded text-[10px] font-bold ${
                          (currentSettings.frameRateTarget ?? 60) === fps
                            ? 'bg-[#38B98A] text-[#101820]'
                            : 'bg-[#1C2933] text-[#A9B8C5]'
                        }`}
                      >
                        {fps === 0 ? 'MAX' : `${fps} FPS`}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-[#1C2933]">
                  <div>
                    <span className="text-[#F4F7FA] font-bold block">Shadow Quality</span>
                    <span className="text-[10px] text-[#A9B8C5]">Structure & vehicle ground shadows</span>
                  </div>
                  <div className="flex gap-1">
                    {(['off', 'low', 'medium', 'high'] as const).map(sq => (
                      <button
                        key={sq}
                        onClick={() => {
                          currentSettings.shadowQuality = sq;
                          notifyChange();
                        }}
                        className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                          (currentSettings.shadowQuality ?? 'medium') === sq
                            ? 'bg-[#38B98A] text-[#101820]'
                            : 'bg-[#1C2933] text-[#A9B8C5]'
                        }`}
                      >
                        {sq}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-3.5 bg-[#1C2933]/50 border border-[#1C2933] rounded-xl space-y-3">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-[#F4F7FA] font-bold block">Screen Shake & Impact Force</span>
                    <span className="text-[10px] text-[#A9B8C5]">Controls camera tremor during artillery impacts</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={currentSettings.screenShake ?? 0.8}
                    onChange={e => {
                      currentSettings.screenShake = parseFloat(e.target.value);
                      notifyChange();
                    }}
                    className="w-32 accent-[#38B98A]"
                  />
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-[#1C2933]">
                  <div>
                    <span className="text-[#F4F7FA] font-bold block">Combat Explosions & Recoil Flash</span>
                    <span className="text-[10px] text-[#A9B8C5]">Shell detonations, tank recoil, tracer fire</span>
                  </div>
                  <button
                    onClick={() => {
                      currentSettings.combatEffects = !currentSettings.combatEffects;
                      notifyChange();
                    }}
                    className={`px-3 py-1 rounded-lg font-bold ${
                      currentSettings.combatEffects ? 'bg-[#38B98A] text-[#101820]' : 'bg-[#1C2933] text-[#A9B8C5]'
                    }`}
                  >
                    {currentSettings.combatEffects ? 'ACTIVE' : 'DISABLED'}
                  </button>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-[#1C2933]">
                  <div>
                    <span className="text-[#F4F7FA] font-bold block">Atmospheric Weather & Dust Storms</span>
                    <span className="text-[10px] text-[#A9B8C5]">Snowfall, rain ripples, and desert dust</span>
                  </div>
                  <button
                    onClick={() => {
                      currentSettings.weatherEffects = !currentSettings.weatherEffects;
                      notifyChange();
                    }}
                    className={`px-3 py-1 rounded-lg font-bold ${
                      currentSettings.weatherEffects ? 'bg-[#38B98A] text-[#101820]' : 'bg-[#1C2933] text-[#A9B8C5]'
                    }`}
                  >
                    {currentSettings.weatherEffects ? 'ACTIVE' : 'DISABLED'}
                  </button>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-[#1C2933]">
                  <div>
                    <span className="text-[#F4F7FA] font-bold block">Battlefield Smoke Density</span>
                    <span className="text-[10px] text-[#A9B8C5]">Volumetric smoke rising from burning wrecks</span>
                  </div>
                  <div className="flex gap-1.5">
                    {(['off', 'low', 'normal'] as const).map(d => (
                      <button
                        key={d}
                        onClick={() => {
                          currentSettings.smokeDensity = d;
                          notifyChange();
                        }}
                        className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase ${
                          currentSettings.smokeDensity === d ? 'bg-[#38B98A] text-[#101820]' : 'bg-[#1C2933] text-[#A9B8C5]'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-[#1C2933]">
                  <div>
                    <span className="text-[#F4F7FA] font-bold block flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      Eye Comfort Mode (Softened Palette)
                    </span>
                    <span className="text-[10px] text-[#A9B8C5]">
                      Matte slate-olive terrain, relaxed contrast, zero bright speckles
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      currentSettings.eyeComfortMode = !currentSettings.eyeComfortMode;
                      notifyChange(
                        currentSettings.eyeComfortMode ? 'Eye Comfort Mode Active' : 'Standard Contrast Restored'
                      );
                    }}
                    className={`px-3 py-1 rounded-lg font-bold min-h-[32px] ${
                      currentSettings.eyeComfortMode ? 'bg-emerald-500 text-[#101820]' : 'bg-[#1C2933] text-[#A9B8C5]'
                    }`}
                  >
                    {currentSettings.eyeComfortMode ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-[#1C2933]">
                  <div>
                    <span className="text-[#F4F7FA] font-bold block">Troop Tactical Silhouette</span>
                    <span className="text-[10px] text-[#A9B8C5]">Selection rim styling (standard = clean ground ellipse)</span>
                  </div>
                  <div className="flex gap-1.5">
                    {(['standard', 'enhanced'] as const).map(v => (
                      <button
                        key={v}
                        onClick={() => {
                          currentSettings.unitVisibility = v;
                          notifyChange();
                        }}
                        className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase min-h-[32px] ${
                          currentSettings.unitVisibility === v
                            ? 'bg-[#38B98A] text-[#101820]'
                            : 'bg-[#1C2933] text-[#A9B8C5]'
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: TACTICAL OVERLAYS (Priority 1: All OFF by default) */}
          {activeTab === 'overlays' && (
            <div className="space-y-4">
              <div className="p-3 bg-[#1C2933]/40 border border-[#1C2933] rounded-xl flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-[#F4F7FA] block">Battlefield Visual Clarity Suite</span>
                  <span className="text-[10px] text-[#A9B8C5]">
                    Toggle translucent tactical overlays. All circles & rings are OFF by default.
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (!currentSettings.overlays) {
                        currentSettings.overlays = {
                          attackRange: false,
                          radarCoverage: false,
                          defenseZones: false,
                          patrolRoutes: false,
                          buildingFootprints: false,
                          unitSelection: false,
                          enemyDetection: false,
                          resourceLocations: false,
                          pathfindingDebug: false,
                        };
                      } else {
                        Object.keys(currentSettings.overlays).forEach(k => {
                          (currentSettings.overlays as any)[k] = false;
                        });
                      }
                      notifyChange('All tactical overlays disabled');
                    }}
                    className="px-2.5 py-1 rounded bg-[#1C2933] hover:bg-[#173A32] text-[10px] text-slate-300 font-bold min-h-[32px]"
                  >
                    ALL OFF
                  </button>
                  <button
                    onClick={() => {
                      currentSettings.overlays = {
                        attackRange: false,
                        radarCoverage: false,
                        defenseZones: false,
                        patrolRoutes: false,
                        buildingFootprints: false,
                        unitSelection: true,
                        enemyDetection: false,
                        resourceLocations: false,
                        pathfindingDebug: false,
                      };
                      notifyChange('Overlays reset to clean defaults');
                    }}
                    className="px-2.5 py-1 rounded bg-[#173A32] text-[#38B98A] text-[10px] font-bold border border-[#38B98A]/40 min-h-[32px]"
                  >
                    DEFAULTS
                  </button>
                </div>
              </div>

              <div className="p-3.5 bg-[#1C2933]/50 border border-[#1C2933] rounded-xl space-y-2.5">
                {[
                  {
                    key: 'attackRange',
                    title: 'Attack Range',
                    desc: 'Preview firing range circle when unit or defense building is selected',
                  },
                  {
                    key: 'radarCoverage',
                    title: 'Radar Coverage',
                    desc: 'Sensor perimeter ring around Radar Station installation',
                  },
                  {
                    key: 'defenseZones',
                    title: 'Defense Zones',
                    desc: 'Subtle boundary outlines around base defense zones',
                  },
                  {
                    key: 'patrolRoutes',
                    title: 'Patrol Routes',
                    desc: 'Tactical vector lines connecting active patrol route waypoints',
                  },
                  {
                    key: 'buildingFootprints',
                    title: 'Building Footprints',
                    desc: 'Subtle structural tile grid outline beneath base facilities',
                  },
                  {
                    key: 'unitSelection',
                    title: 'Unit Selection',
                    desc: 'Single clean ground selection indicator under chosen units',
                  },
                  {
                    key: 'enemyDetection',
                    title: 'Enemy Detection',
                    desc: 'Tactical bracket corner markers on scouted hostile units',
                  },
                  {
                    key: 'resourceLocations',
                    title: 'Resource Locations',
                    desc: 'Titanium crystal deposit tags and extraction boundaries',
                  },
                  {
                    key: 'pathfindingDebug',
                    title: 'Pathfinding Debug',
                    desc: 'A* navigation corridor waypoints and steering directions',
                  },
                ].map(({ key, title, desc }, idx) => {
                  const overlays = currentSettings.overlays || {
                    attackRange: false,
                    radarCoverage: false,
                    defenseZones: false,
                    patrolRoutes: false,
                    buildingFootprints: false,
                    unitSelection: true,
                    enemyDetection: false,
                    resourceLocations: false,
                    pathfindingDebug: false,
                  };
                  const isChecked = (overlays as any)[key] ?? false;

                  return (
                    <div
                      key={key}
                      className={`flex justify-between items-center py-2 ${
                        idx > 0 ? 'border-t border-[#1C2933]' : ''
                      }`}
                    >
                      <div>
                        <span className="text-[#F4F7FA] font-bold block">{title}</span>
                        <span className="text-[10px] text-[#A9B8C5]">{desc}</span>
                      </div>
                      <button
                        onClick={() => {
                          if (!currentSettings.overlays) {
                            currentSettings.overlays = { ...overlays };
                          }
                          (currentSettings.overlays as any)[key] = !isChecked;
                          notifyChange();
                        }}
                        className={`px-3 py-1 rounded-lg font-bold min-h-[32px] min-w-[70px] ${
                          isChecked ? 'bg-[#38B98A] text-[#101820]' : 'bg-[#1C2933] text-[#A9B8C5]'
                        }`}
                      >
                        {isChecked ? 'ON' : 'OFF'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: AUDIO */}
          {activeTab === 'audio' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-[#1C2933]/50 border border-[#1C2933] rounded-xl space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[#F4F7FA] font-bold">Master Audio Volume</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={soundEngine.getMasterVolume()}
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      soundEngine.setMasterVolume(val);
                      currentSettings.masterVolume = val;
                      notifyChange();
                    }}
                    className="w-36 accent-[#38B98A]"
                  />
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-[#1C2933]">
                  <span className="text-[#F4F7FA] font-bold">Ambient Battlefield Soundtrack</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={soundEngine.getMusicVolume()}
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      soundEngine.setMusicVolume(val);
                      currentSettings.musicVolume = val;
                      notifyChange();
                    }}
                    className="w-36 accent-[#36C9E8]"
                  />
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-[#1C2933]">
                  <span className="text-[#F4F7FA] font-bold">Sound Effects & Artillery</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={soundEngine.getSfxVolume()}
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      soundEngine.setSfxVolume(val);
                      currentSettings.sfxVolume = val;
                      notifyChange();
                    }}
                    className="w-36 accent-[#F2B84B]"
                  />
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-[#1C2933]">
                  <div>
                    <span className="text-[#F4F7FA] font-bold block">Tactical Voice Alerts</span>
                    <span className="text-[10px] text-[#A9B8C5]">Audio radar sirens during Red/Orange threats</span>
                  </div>
                  <button
                    onClick={() => {
                      currentSettings.voiceAlerts = !currentSettings.voiceAlerts;
                      notifyChange();
                    }}
                    className={`px-3 py-1 rounded-lg font-bold ${
                      currentSettings.voiceAlerts !== false ? 'bg-[#38B98A] text-[#101820]' : 'bg-[#1C2933] text-[#A9B8C5]'
                    }`}
                  >
                    {currentSettings.voiceAlerts !== false ? 'ENABLED' : 'MUTED'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: CONTROLS & CAMERA */}
          {activeTab === 'controls' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-[#1C2933]/50 border border-[#1C2933] rounded-xl space-y-3">
                <span className="text-[#A9B8C5] block font-bold text-[11px]">MOBILE CAMERA CONFIGURATION</span>

                {/* Pan Sensitivity */}
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-[#F4F7FA] font-bold block">Camera Pan Speed</span>
                    <span className="text-[10px] text-[#A9B8C5]">Drag & keyboard pan responsiveness</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="2.5"
                    step="0.1"
                    value={currentSettings.cameraSensitivity ?? 1.0}
                    onChange={e => {
                      currentSettings.cameraSensitivity = parseFloat(e.target.value);
                      notifyChange();
                    }}
                    className="w-32 accent-[#38B98A]"
                  />
                </div>

                {/* Zoom Sensitivity */}
                <div className="flex justify-between items-center pt-2 border-t border-[#1C2933]">
                  <div>
                    <span className="text-[#F4F7FA] font-bold block">Pinch Zoom Sensitivity</span>
                    <span className="text-[10px] text-[#A9B8C5]">Two-finger pinch scale speed</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.1"
                    value={currentSettings.zoomSensitivity ?? 1.0}
                    onChange={e => {
                      currentSettings.zoomSensitivity = parseFloat(e.target.value);
                      notifyChange();
                    }}
                    className="w-32 accent-[#38B98A]"
                  />
                </div>

                {/* Smooth Movement */}
                <div className="flex justify-between items-center pt-2 border-t border-[#1C2933]">
                  <div>
                    <span className="text-[#F4F7FA] font-bold block">Smooth Camera Damping</span>
                    <span className="text-[10px] text-[#A9B8C5]">Inertial momentum for cinematic panning</span>
                  </div>
                  <button
                    onClick={() => {
                      currentSettings.smoothCamera = !(currentSettings.smoothCamera !== false);
                      notifyChange();
                    }}
                    className={`px-3 py-1 rounded-lg font-bold ${
                      currentSettings.smoothCamera !== false ? 'bg-[#38B98A] text-[#101820]' : 'bg-[#1C2933] text-[#A9B8C5]'
                    }`}
                  >
                    {currentSettings.smoothCamera !== false ? 'SMOOTH' : 'DIRECT'}
                  </button>
                </div>

                {/* Camera Bounds */}
                <div className="flex justify-between items-center pt-2 border-t border-[#1C2933]">
                  <div>
                    <span className="text-[#F4F7FA] font-bold block">Camera World Bounds</span>
                    <span className="text-[10px] text-[#A9B8C5]">Clamp camera strictly to map edges</span>
                  </div>
                  <div className="flex gap-1">
                    {(['strict', 'relaxed'] as const).map(b => (
                      <button
                        key={b}
                        onClick={() => {
                          currentSettings.cameraBounds = b;
                          notifyChange();
                        }}
                        className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase ${
                          (currentSettings.cameraBounds ?? 'strict') === b
                            ? 'bg-[#38B98A] text-[#101820]'
                            : 'bg-[#1C2933] text-[#A9B8C5]'
                        }`}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Auto Center on Start */}
                <div className="flex justify-between items-center pt-2 border-t border-[#1C2933]">
                  <div>
                    <span className="text-[#F4F7FA] font-bold block">Auto Center on HQ at Start</span>
                    <span className="text-[10px] text-[#A9B8C5]">Focus camera on base when mission begins</span>
                  </div>
                  <button
                    onClick={() => {
                      currentSettings.autoCenterOnStart = !(currentSettings.autoCenterOnStart !== false);
                      notifyChange();
                    }}
                    className={`px-3 py-1 rounded-lg font-bold ${
                      currentSettings.autoCenterOnStart !== false ? 'bg-[#38B98A] text-[#101820]' : 'bg-[#1C2933] text-[#A9B8C5]'
                    }`}
                  >
                    {currentSettings.autoCenterOnStart !== false ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>
              </div>

              {/* Mobile Touch & HUD Layout */}
              <div className="p-3.5 bg-[#1C2933]/50 border border-[#1C2933] rounded-xl space-y-3">
                <span className="text-[#A9B8C5] block font-bold text-[11px]">TOUCH & HUD LAYOUT</span>

                {/* Radar Position */}
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-[#F4F7FA] font-bold block">Tactical Radar Position</span>
                    <span className="text-[10px] text-[#A9B8C5]">Screen corner placement</span>
                  </div>
                  <div className="flex gap-1">
                    {(['top-right', 'top-left', 'bottom-right'] as const).map(pos => (
                      <button
                        key={pos}
                        onClick={() => {
                          currentSettings.radarPosition = pos;
                          notifyChange(`Radar moved to ${pos}`);
                        }}
                        className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                          (currentSettings.radarPosition ?? 'top-right') === pos
                            ? 'bg-[#38B98A] text-[#101820]'
                            : 'bg-[#1C2933] text-[#A9B8C5]'
                        }`}
                      >
                        {pos.replace('-', ' ')}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Double Tap Selection */}
                <div className="flex justify-between items-center pt-2 border-t border-[#1C2933]">
                  <div>
                    <span className="text-[#F4F7FA] font-bold block">Double-Tap Same-Type Select</span>
                    <span className="text-[10px] text-[#A9B8C5]">Double-tap unit to select all visible units of that type</span>
                  </div>
                  <button
                    onClick={() => {
                      currentSettings.doubleTapSelection = !(currentSettings.doubleTapSelection !== false);
                      notifyChange();
                    }}
                    className={`px-3 py-1 rounded-lg font-bold ${
                      currentSettings.doubleTapSelection !== false ? 'bg-[#38B98A] text-[#101820]' : 'bg-[#1C2933] text-[#A9B8C5]'
                    }`}
                  >
                    {currentSettings.doubleTapSelection !== false ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>

                {/* Tap-to-move */}
                <div className="flex justify-between items-center pt-2 border-t border-[#1C2933]">
                  <div>
                    <span className="text-[#F4F7FA] font-bold block">Direct Tap-to-Move Dispatch</span>
                    <span className="text-[10px] text-[#A9B8C5]">Tap on ground immediately orders selected troops</span>
                  </div>
                  <button
                    onClick={() => {
                      currentSettings.tapToMove = !(currentSettings.tapToMove !== false);
                      notifyChange();
                    }}
                    className={`px-3 py-1 rounded-lg font-bold ${
                      currentSettings.tapToMove !== false ? 'bg-[#38B98A] text-[#101820]' : 'bg-[#1C2933] text-[#A9B8C5]'
                    }`}
                  >
                    {currentSettings.tapToMove !== false ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: AUTOMATION & AI COMMANDER */}
          {activeTab === 'automation' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-[#1C2933]/50 border border-[#1C2933] rounded-xl space-y-3">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-[#F4F7FA] font-bold block">Automated Base Defense (System 1)</span>
                    <span className="text-[10px] text-[#A9B8C5]">Enables automated troop mobilization when threats detected</span>
                  </div>
                  <button
                    onClick={() => {
                      if (engine) engine.toggleAutoDefense();
                      else currentSettings.autoDefenseEnabled = !currentSettings.autoDefenseEnabled;
                      notifyChange();
                    }}
                    className={`px-3 py-1 rounded-lg font-bold ${
                      (engine?.tacticalIntelligence?.settings.autoDefenseEnabled ?? currentSettings.autoDefenseEnabled)
                        ? 'bg-[#38B98A] text-[#101820]'
                        : 'bg-[#1C2933] text-[#A9B8C5]'
                    }`}
                  >
                    {(engine?.tacticalIntelligence?.settings.autoDefenseEnabled ?? currentSettings.autoDefenseEnabled)
                      ? 'ENGAGED'
                      : 'OFFLINE'}
                  </button>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-[#1C2933]">
                  <div>
                    <span className="text-[#F4F7FA] font-bold block">Defensive Response Doctrine</span>
                    <span className="text-[10px] text-[#A9B8C5]">Degree of autonomous force deployment</span>
                  </div>
                  <div className="flex gap-1">
                    {(
                      [
                        { id: 'alert_only', label: 'Alert Only' },
                        { id: 'defensive_intercept', label: 'Intercept' },
                        { id: 'full_defense', label: 'Full Mobilize' },
                      ] as { id: DefensePolicy; label: string }[]
                    ).map(p => {
                      const activePolicy =
                        engine?.tacticalIntelligence?.settings.defensePolicy || currentSettings.defensePolicy || 'full_defense';
                      return (
                        <button
                          key={p.id}
                          onClick={() => {
                            if (engine) engine.setDefensePolicy(p.id);
                            currentSettings.defensePolicy = p.id;
                            notifyChange();
                          }}
                          className={`px-2.5 py-1 rounded text-[10px] font-bold ${
                            activePolicy === p.id ? 'bg-[#38B98A] text-[#101820]' : 'bg-[#1C2933] text-[#A9B8C5]'
                          }`}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-[#1C2933]">
                  <div>
                    <span className="text-[#F4F7FA] font-bold block">Autonomous Combat Field Repair</span>
                    <span className="text-[10px] text-[#A9B8C5]">Engineers and Medics auto-repair damaged structures</span>
                  </div>
                  <button
                    onClick={() => {
                      if (engine) {
                        engine.tacticalIntelligence.settings.autoRepairEnabled =
                          !engine.tacticalIntelligence.settings.autoRepairEnabled;
                      }
                      currentSettings.autoRepair = !(currentSettings.autoRepair !== false);
                      notifyChange();
                    }}
                    className={`px-3 py-1 rounded-lg font-bold ${
                      (engine?.tacticalIntelligence?.settings.autoRepairEnabled ?? currentSettings.autoRepair !== false)
                        ? 'bg-[#38B98A] text-[#101820]'
                        : 'bg-[#1C2933] text-[#A9B8C5]'
                    }`}
                  >
                    {(engine?.tacticalIntelligence?.settings.autoRepairEnabled ?? currentSettings.autoRepair !== false)
                      ? 'ACTIVE'
                      : 'OFF'}
                  </button>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-[#1C2933]">
                  <div>
                    <span className="text-[#F4F7FA] font-bold block">Emergency Reinforcements</span>
                    <span className="text-[10px] text-[#A9B8C5]">Queue counter-units automatically during Red alerts</span>
                  </div>
                  <button
                    onClick={() => {
                      if (engine) {
                        engine.tacticalIntelligence.settings.emergencyReinforcements =
                          !engine.tacticalIntelligence.settings.emergencyReinforcements;
                      }
                      currentSettings.emergencyReinforcements = !(currentSettings.emergencyReinforcements !== false);
                      notifyChange();
                    }}
                    className={`px-3 py-1 rounded-lg font-bold ${
                      (engine?.tacticalIntelligence?.settings.emergencyReinforcements ??
                      currentSettings.emergencyReinforcements !== false)
                        ? 'bg-[#38B98A] text-[#101820]'
                        : 'bg-[#1C2933] text-[#A9B8C5]'
                    }`}
                  >
                    {(engine?.tacticalIntelligence?.settings.emergencyReinforcements ??
                    currentSettings.emergencyReinforcements !== false)
                      ? 'ACTIVE'
                      : 'OFF'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: RADAR SENSOR */}
          {activeTab === 'radar' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-[#1C2933]/50 border border-[#1C2933] rounded-xl space-y-3">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-[#F4F7FA] font-bold block">Radar Sweep & Sensor Overlay</span>
                    <span className="text-[10px] text-[#A9B8C5]">Shows animated scanning beam & sensor range circle</span>
                  </div>
                  <button
                    onClick={() => {
                      if (engine) {
                        engine.tacticalIntelligence.settings.showRadarOverlay =
                          !engine.tacticalIntelligence.settings.showRadarOverlay;
                      }
                      currentSettings.showThreatOverlay = !(currentSettings.showThreatOverlay !== false);
                      notifyChange();
                    }}
                    className={`px-3 py-1 rounded-lg font-bold ${
                      (engine?.tacticalIntelligence?.settings.showRadarOverlay ?? currentSettings.showThreatOverlay !== false)
                        ? 'bg-[#38B98A] text-[#101820]'
                        : 'bg-[#1C2933] text-[#A9B8C5]'
                    }`}
                  >
                    {(engine?.tacticalIntelligence?.settings.showRadarOverlay ?? currentSettings.showThreatOverlay !== false)
                      ? 'VISIBLE'
                      : 'HIDDEN'}
                  </button>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-[#1C2933]">
                  <div>
                    <span className="text-[#F4F7FA] font-bold block">Defense Zone Boundary Rings</span>
                    <span className="text-[10px] text-[#A9B8C5]">Displays colored tactical defense sectors</span>
                  </div>
                  <button
                    onClick={() => {
                      if (engine) {
                        engine.tacticalIntelligence.settings.showDefenseZones =
                          !engine.tacticalIntelligence.settings.showDefenseZones;
                      }
                      currentSettings.showDefenseZoneOverlay = !(currentSettings.showDefenseZoneOverlay !== false);
                      notifyChange();
                    }}
                    className={`px-3 py-1 rounded-lg font-bold ${
                      (engine?.tacticalIntelligence?.settings.showDefenseZones ??
                      currentSettings.showDefenseZoneOverlay !== false)
                        ? 'bg-[#38B98A] text-[#101820]'
                        : 'bg-[#1C2933] text-[#A9B8C5]'
                    }`}
                  >
                    {(engine?.tacticalIntelligence?.settings.showDefenseZones ??
                    currentSettings.showDefenseZoneOverlay !== false)
                      ? 'VISIBLE'
                      : 'HIDDEN'}
                  </button>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-[#1C2933]">
                  <div>
                    <span className="text-[#F4F7FA] font-bold block">Enemy Threat Sirens</span>
                    <span className="text-[10px] text-[#A9B8C5]">Play audio warning upon alert escalation</span>
                  </div>
                  <button
                    onClick={() => {
                      if (engine) {
                        engine.tacticalIntelligence.settings.alertSoundEnabled =
                          !engine.tacticalIntelligence.settings.alertSoundEnabled;
                      }
                      currentSettings.alertSoundEnabled = !(currentSettings.alertSoundEnabled !== false);
                      notifyChange();
                    }}
                    className={`px-3 py-1 rounded-lg font-bold ${
                      (engine?.tacticalIntelligence?.settings.alertSoundEnabled ??
                      currentSettings.alertSoundEnabled !== false)
                        ? 'bg-[#38B98A] text-[#101820]'
                        : 'bg-[#1C2933] text-[#A9B8C5]'
                    }`}
                  >
                    {(engine?.tacticalIntelligence?.settings.alertSoundEnabled ??
                    currentSettings.alertSoundEnabled !== false)
                      ? 'ACTIVE'
                      : 'MUTED'}
                  </button>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-[#1C2933]">
                  <div>
                    <span className="text-[#F4F7FA] font-bold block">Miniature Radar Scale</span>
                    <span className="text-[10px] text-[#A9B8C5]">Upper-right battlefield overview size</span>
                  </div>
                  <div className="flex gap-1">
                    {(['compact', 'standard', 'large'] as const).map(size => (
                      <button
                        key={size}
                        onClick={() => {
                          if (engine) engine.settings.radarSize = size;
                          currentSettings.radarSize = size;
                          notifyChange(`Radar size set to ${size}`);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase transition-colors ${
                          (engine?.settings.radarSize || currentSettings.radarSize || 'standard') === size
                            ? 'bg-[#38B98A] text-[#101820]'
                            : 'bg-[#1C2933] text-[#A9B8C5] hover:text-[#F4F7FA]'
                        }`}
                      >
                        {size === 'compact' ? 'Compact' : size === 'standard' ? 'Standard' : 'Large'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: GAMEPLAY */}
          {activeTab === 'gameplay' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-[#1C2933]/50 border border-[#1C2933] rounded-xl space-y-3">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-[#F4F7FA] font-bold block">Unit Health Bars</span>
                    <span className="text-[10px] text-[#A9B8C5]">Visibility mode for troop status indicators</span>
                  </div>
                  <div className="flex gap-1.5">
                    {(['always', 'damaged', 'selected'] as const).map(m => (
                      <button
                        key={m}
                        onClick={() => {
                          currentSettings.showHealthBars = m;
                          notifyChange();
                        }}
                        className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase ${
                          currentSettings.showHealthBars === m ? 'bg-[#38B98A] text-[#101820]' : 'bg-[#1C2933] text-[#A9B8C5]'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-[#1C2933]">
                  <div>
                    <span className="text-[#F4F7FA] font-bold block">Floating Combat Numbers</span>
                    <span className="text-[10px] text-[#A9B8C5]">Damage and healing floating text indicators</span>
                  </div>
                  <button
                    onClick={() => {
                      currentSettings.showDamageNumbers = !currentSettings.showDamageNumbers;
                      notifyChange();
                    }}
                    className={`px-3 py-1 rounded-lg font-bold ${
                      currentSettings.showDamageNumbers ? 'bg-[#38B98A] text-[#101820]' : 'bg-[#1C2933] text-[#A9B8C5]'
                    }`}
                  >
                    {currentSettings.showDamageNumbers ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-[#1C2933]">
                  <div>
                    <span className="text-[#F4F7FA] font-bold block">Fog of War Line-of-Sight</span>
                    <span className="text-[10px] text-[#A9B8C5]">Unexplored shroud and dynamic unit vision</span>
                  </div>
                  <button
                    onClick={() => {
                      currentSettings.fogOfWarEnabled = !currentSettings.fogOfWarEnabled;
                      notifyChange();
                    }}
                    className={`px-3 py-1 rounded-lg font-bold ${
                      currentSettings.fogOfWarEnabled ? 'bg-[#38B98A] text-[#101820]' : 'bg-[#1C2933] text-[#A9B8C5]'
                    }`}
                  >
                    {currentSettings.fogOfWarEnabled ? 'ACTIVE' : 'REVEALED'}
                  </button>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-[#1C2933]">
                  <div>
                    <span className="text-[#F4F7FA] font-bold block">Medical Triage Support Ratio</span>
                    <span className="text-[10px] text-[#A9B8C5]">
                      Target proportion of Combat Medics to combat infantry
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-emerald-400 font-bold text-xs mr-1">
                      1 : {currentSettings.supportRatio || 7}
                    </span>
                    {[5, 7, 9].map(r => (
                      <button
                        key={r}
                        onClick={() => {
                          currentSettings.supportRatio = r;
                          notifyChange(`Support ratio set to 1 medic per ${r} infantry`);
                        }}
                        className={`px-2 py-1 rounded text-[10px] font-bold ${
                          (currentSettings.supportRatio || 7) === r
                            ? 'bg-[#38B98A] text-[#101820]'
                            : 'bg-[#1C2933] text-[#A9B8C5]'
                        }`}
                      >
                        1:{r}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-[#1C2933]">
                  <div>
                    <span className="text-[#F4F7FA] font-bold block">Autonomous Infantry Healing</span>
                    <span className="text-[10px] text-[#A9B8C5]">
                      Medics autonomously prioritize and triage wounded squadmates
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      currentSettings.autoHeal = !(currentSettings.autoHeal !== false);
                      notifyChange();
                    }}
                    className={`px-3 py-1 rounded-lg font-bold ${
                      currentSettings.autoHeal !== false ? 'bg-[#38B98A] text-[#101820]' : 'bg-[#1C2933] text-[#A9B8C5]'
                    }`}
                  >
                    {currentSettings.autoHeal !== false ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-[#1C2933]">
                  <div>
                    <span className="text-[#F4F7FA] font-bold block">Autonomous Vehicle & Base Repair</span>
                    <span className="text-[10px] text-[#A9B8C5]">
                      Engineers autonomously repair damaged tanks and structures
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      currentSettings.autoRepair = !(currentSettings.autoRepair !== false);
                      notifyChange();
                    }}
                    className={`px-3 py-1 rounded-lg font-bold ${
                      currentSettings.autoRepair !== false ? 'bg-[#38B98A] text-[#101820]' : 'bg-[#1C2933] text-[#A9B8C5]'
                    }`}
                  >
                    {currentSettings.autoRepair !== false ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: ACCESSIBILITY */}
          {activeTab === 'accessibility' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-[#1C2933]/50 border border-[#1C2933] rounded-xl space-y-3">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-[#F4F7FA] font-bold block">Colorblind-Friendly Indicators</span>
                    <span className="text-[10px] text-[#A9B8C5]">High-contrast symbols on health and radar blips</span>
                  </div>
                  <button
                    onClick={() => {
                      currentSettings.colorblindMode = !currentSettings.colorblindMode;
                      notifyChange();
                    }}
                    className={`px-3 py-1 rounded-lg font-bold ${
                      currentSettings.colorblindMode ? 'bg-[#38B98A] text-[#101820]' : 'bg-[#1C2933] text-[#A9B8C5]'
                    }`}
                  >
                    {currentSettings.colorblindMode ? 'ENABLED' : 'OFF'}
                  </button>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-[#1C2933]">
                  <div>
                    <span className="text-[#F4F7FA] font-bold block">Reduced Motion</span>
                    <span className="text-[10px] text-[#A9B8C5]">Reduces camera shakes and rapid flashing</span>
                  </div>
                  <button
                    onClick={() => {
                      currentSettings.reducedMotion = !currentSettings.reducedMotion;
                      if (currentSettings.reducedMotion) currentSettings.screenShake = 0.1;
                      notifyChange();
                    }}
                    className={`px-3 py-1 rounded-lg font-bold ${
                      currentSettings.reducedMotion ? 'bg-[#38B98A] text-[#101820]' : 'bg-[#1C2933] text-[#A9B8C5]'
                    }`}
                  >
                    {currentSettings.reducedMotion ? 'ACTIVE' : 'OFF'}
                  </button>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-[#1C2933]">
                  <div>
                    <span className="text-[#F4F7FA] font-bold block">Large Touch Targets</span>
                    <span className="text-[10px] text-[#A9B8C5]">Expands button tap areas for mobile and tablets</span>
                  </div>
                  <button
                    onClick={() => {
                      currentSettings.largeTouchTargets = !currentSettings.largeTouchTargets;
                      notifyChange();
                    }}
                    className={`px-3 py-1 rounded-lg font-bold ${
                      currentSettings.largeTouchTargets ? 'bg-[#38B98A] text-[#101820]' : 'bg-[#1C2933] text-[#A9B8C5]'
                    }`}
                  >
                    {currentSettings.largeTouchTargets ? 'LARGE' : 'STANDARD'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 8: SAVE & DATA */}
          {activeTab === 'data' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-[#1C2933]/50 border border-[#1C2933] rounded-xl space-y-3">
                <span className="text-[#A9B8C5] block font-bold text-[11px]">SAVE DATA BACKUP & RESTORE</span>
                <p className="text-[10px] text-[#A9B8C5]">
                  Export or import all saved campaigns, skirmishes, and sandbox checkpoints as a JSON backup file.
                </p>
                <div className="flex flex-wrap gap-2.5 pt-2">
                  <button
                    onClick={handleExportSave}
                    className="px-4 py-2 rounded-lg bg-[#173A32] hover:bg-[#38B98A]/25 border border-[#38B98A]/60 text-[#38B98A] font-bold flex items-center gap-2 transition-all shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>EXPORT SAVE BACKUP</span>
                  </button>

                  <label className="px-4 py-2 rounded-lg bg-[#1C2933] hover:bg-[#1C2933]/80 border border-[#1C2933] text-[#36C9E8] font-bold flex items-center gap-2 cursor-pointer transition-all shadow-sm">
                    <Upload className="w-3.5 h-3.5" />
                    <span>IMPORT BACKUP FILE</span>
                    <input type="file" accept=".json" onChange={handleImportSave} className="hidden" />
                  </label>
                </div>
              </div>

              <div className="p-3.5 bg-[#E45B63]/10 border border-[#E45B63]/30 rounded-xl space-y-2.5">
                <span className="text-[#E45B63] block font-bold text-[11px] flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  DANGER ZONE: FACTORY RESET
                </span>
                <p className="text-[10px] text-[#A9B8C5]">
                  Restore all graphics, audio, control, and automation settings to default military values.
                </p>
                {!confirmReset ? (
                  <button
                    onClick={() => setConfirmReset(true)}
                    className="px-4 py-2 rounded-lg bg-[#E45B63]/20 hover:bg-[#E45B63]/30 border border-[#E45B63]/50 text-[#E45B63] font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>RESET ALL SETTINGS TO DEFAULT</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={handleResetSettings}
                      className="px-4 py-2 rounded-lg bg-[#E45B63] text-white font-bold transition-colors shadow-lg"
                    >
                      CONFIRM FACTORY RESET
                    </button>
                    <button
                      onClick={() => setConfirmReset(false)}
                      className="px-3 py-2 rounded-lg bg-[#1C2933] text-[#A9B8C5] hover:text-[#F4F7FA]"
                    >
                      CANCEL
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#1C2933] bg-[#101820] flex justify-between items-center">
          <span className="text-[10px] text-[#A9B8C5] font-mono">Changes persist automatically across sessions.</span>
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-lg bg-[#38B98A] hover:bg-[#38B98A]/90 text-[#101820] font-display font-bold text-xs uppercase tracking-wider transition-colors shadow-lg"
          >
            CONFIRM & CLOSE
          </button>
        </div>
      </div>
    </div>
  );
};
