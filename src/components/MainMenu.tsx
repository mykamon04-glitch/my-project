/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Shield,
  Swords,
  Flame,
  Sparkles,
  MapPin,
  ChevronRight,
  Play,
  Volume2,
  VolumeX,
  Upload,
  BookOpen,
  Award,
  BarChart2,
  Sliders,
  Info,
  X,
  Check,
  Zap,
  Radio,
  Crosshair,
  Cpu,
  Layers,
  Clock,
  Coins,
  Globe,
  Maximize2,
  Minimize2,
  HelpCircle,
  FolderOpen,
} from 'lucide-react';
import { CAMPAIGN_MISSIONS, MAP_PRESETS, UNIT_CONFIGS, BUILDING_CONFIGS } from '../data/gameData';
import { getCareerStats, getAchievements, CareerStats, Achievement } from '../data/careerStats';
import {
  AIDifficulty,
  GameMode,
  MapEnvironment,
  MapSize,
  MatchSetupConfig,
  SaveSlotData,
} from '../types/game';

interface MainMenuProps {
  onStartGame: (
    mode: GameMode,
    difficulty: AIDifficulty,
    mapId: string,
    campaignMissionId?: number,
    matchConfig?: Partial<MatchSetupConfig>
  ) => void;
  onLoadSavedGame: (data: SaveSlotData) => void;
  onToggleMute: () => void;
  isMuted: boolean;
  onOpenSettings?: () => void;
  onOpenSaveLoad?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

type MenuModalType = 'setup' | 'manual' | 'achievements' | 'stats' | 'credits' | null;

export const MainMenu: React.FC<MainMenuProps> = ({
  onStartGame,
  onLoadSavedGame,
  onToggleMute,
  isMuted,
  onOpenSettings,
  onOpenSaveLoad,
  isFullscreen = false,
  onToggleFullscreen,
}) => {
  // Modes & Selected Match Configuration
  const [selectedMode, setSelectedMode] = useState<GameMode>('skirmish');
  const [selectedDifficulty, setSelectedDifficulty] = useState<AIDifficulty>('normal');
  const [selectedMap, setSelectedMap] = useState<string>('verdant_frontier');
  const [selectedCampaignId, setSelectedCampaignId] = useState<number>(1);
  const [mapSize, setMapSize] = useState<MapSize>('medium');
  const [startingCredits, setStartingCredits] = useState<number>(3000);
  const [startingArmy, setStartingArmy] = useState<'minimal' | 'standard' | 'strike_force'>('standard');
  const [startingTech, setStartingTech] = useState<'basic' | 'advanced' | 'all'>('basic');
  const [fogOfWar, setFogOfWar] = useState<boolean>(true);
  const [victoryCondition, setVictoryCondition] = useState<'annihilation' | 'destroy_hq' | 'domination'>('annihilation');
  const [gameSpeed, setGameSpeed] = useState<number>(1.0);

  // Sub-Modals
  const [activeModal, setActiveModal] = useState<MenuModalType>(null);
  const [manualTab, setManualTab] = useState<'basics' | 'units' | 'radar' | 'hotkeys'>('basics');

  // Persistence
  const [latestSave, setLatestSave] = useState<SaveSlotData | null>(null);
  const [careerStats, setCareerStats] = useState<CareerStats>(getCareerStats());
  const [achievements, setAchievements] = useState<Achievement[]>(getAchievements());

  // Background Canvas
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Load saves and stats on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('iron_dominion_save_slots');
      if (stored) {
        const slots = JSON.parse(stored) as Record<string, SaveSlotData>;
        const list = Object.values(slots).sort((a, b) => b.timestamp - a.timestamp);
        if (list.length > 0) {
          setLatestSave(list[0]);
        }
      }
    } catch {
      //
    }
    setCareerStats(getCareerStats());
    setAchievements(getAchievements());
  }, []);

  // Cinematic 2.5D Military Tactical Grid Animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let angle = 0;
    const particles: { x: number; y: number; vx: number; vy: number; size: number; alpha: number }[] = [];

    for (let i = 0; i < 45; i++) {
      particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -0.2 - Math.random() * 0.3,
        size: 1 + Math.random() * 2,
        alpha: 0.2 + Math.random() * 0.5,
      });
    }

    const render = () => {
      if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }

      ctx.fillStyle = '#0a0f14';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const cx = canvas.width * 0.5;
      const cy = canvas.height * 0.52;

      // 1. Isometric Tactical Grid
      ctx.save();
      ctx.strokeStyle = 'rgba(56, 185, 138, 0.07)';
      ctx.lineWidth = 1;
      const step = 44;
      const range = 650;
      for (let x = -range; x <= range; x += step) {
        ctx.beginPath();
        ctx.moveTo(cx + x, cy - range * 0.5);
        ctx.lineTo(cx + x, cy + range * 0.5);
        ctx.stroke();
      }
      for (let y = -range * 0.5; y <= range * 0.5; y += step * 0.5) {
        ctx.beginPath();
        ctx.moveTo(cx - range, cy + y);
        ctx.lineTo(cx + range, cy + y);
        ctx.stroke();
      }
      ctx.restore();

      // 2. Concentric Radar Sensor Rings
      ctx.save();
      const ringRadii = [120, 240, 360, 480];
      ringRadii.forEach((r, idx) => {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = idx % 2 === 0 ? 'rgba(54, 201, 232, 0.12)' : 'rgba(56, 185, 138, 0.08)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 6]);
        ctx.stroke();
      });
      ctx.setLineDash([]);

      // 3. Rotating Radar Scanner Beam
      angle += 0.012;
      const gradient = ctx.createRadialGradient(cx, cy, 10, cx, cy, 480);
      gradient.addColorStop(0, 'rgba(56, 185, 138, 0.25)');
      gradient.addColorStop(1, 'rgba(56, 185, 138, 0.0)');

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, 480, angle, angle + 0.35);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      // Leading beam edge
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle + 0.35) * 480, cy + Math.sin(angle + 0.35) * 480);
      ctx.strokeStyle = 'rgba(56, 185, 138, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // 4. Floating Holographic Nodes (Outposts & Patrols)
      const nodes = [
        { x: cx - 180, y: cy - 90, label: 'SECTOR-ALPHA' },
        { x: cx + 220, y: cy + 110, label: 'RADAR-01 [OK]' },
        { x: cx - 110, y: cy + 190, label: 'REFINERY-HUB' },
        { x: cx + 160, y: cy - 170, label: 'AIR-BASE-ECHO' },
      ];
      nodes.forEach(n => {
        ctx.beginPath();
        ctx.arc(n.x, n.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#38b98a';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(n.x, n.y, 10 + Math.sin(angle * 3) * 3, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(56, 185, 138, 0.3)';
        ctx.stroke();

        ctx.fillStyle = 'rgba(169, 184, 197, 0.6)';
        ctx.font = '9px monospace';
        ctx.fillText(n.label, n.x + 8, n.y + 3);
      });
      ctx.restore();

      // 5. Atmospheric Floating Dust / Embers
      ctx.save();
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.y < 0) {
          p.y = canvas.height;
          p.x = Math.random() * canvas.width;
        }
        ctx.fillStyle = `rgba(56, 185, 138, ${p.alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();

      // 6. Subtle Vignette & Scanlines
      const gradVignette = ctx.createRadialGradient(
        cx,
        cy,
        Math.min(canvas.width, canvas.height) * 0.35,
        cx,
        cy,
        Math.max(canvas.width, canvas.height) * 0.75
      );
      gradVignette.addColorStop(0, 'rgba(10, 15, 20, 0)');
      gradVignette.addColorStop(1, 'rgba(5, 8, 12, 0.85)');
      ctx.fillStyle = gradVignette;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, []);

  const handleLaunch = () => {
    const config: Partial<MatchSetupConfig> = {
      mapId: selectedMap,
      mapSize,
      environment: (MAP_PRESETS[selectedMap]?.biome as MapEnvironment) || 'verdant',
      difficulty: selectedDifficulty,
      startingCredits,
      startingArmy,
      startingTech,
      fogOfWar,
      victoryCondition,
      gameSpeed,
    };
    onStartGame(selectedMode, selectedDifficulty, selectedMap, selectedCampaignId, config);
  };

  const currentMapData = MAP_PRESETS[selectedMap] || MAP_PRESETS.verdant_valley;

  return (
    <div className="relative w-full h-full flex flex-col justify-between p-2 sm:p-6 lg:p-8 select-none overflow-x-hidden overflow-y-auto text-slate-100 font-sans min-w-0">
      {/* 2.5D Animated Radar & Grid Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />

      {/* TOP HEADER & BRAND BAR - Fully responsive at 320px–480px */}
      <header className="relative z-10 flex items-center justify-between gap-2 w-full max-w-7xl mx-auto bg-slate-900/80 backdrop-blur-md border border-slate-800/80 rounded-2xl px-3 sm:px-6 py-2 sm:py-3 shadow-xl shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-8 h-8 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-emerald-500 via-teal-700 to-slate-900 border border-emerald-500/40 flex items-center justify-center font-display font-black text-emerald-300 text-sm sm:text-lg shadow-lg shrink-0">
            ID
          </div>
          <div className="min-w-0 truncate">
            <div className="flex items-center gap-1.5 truncate">
              <h1 className="text-sm sm:text-2xl font-display font-black tracking-wider text-slate-100 uppercase truncate">
                Iron Dominion
              </h1>
              <span className="hidden xs:inline-block px-1.5 py-0.2 rounded bg-emerald-500/20 border border-emerald-500/40 text-[9px] font-mono font-bold text-emerald-400">
                v8.0
              </span>
            </div>
            <p className="text-[9px] sm:text-xs text-slate-400 font-mono tracking-wider uppercase truncate">
              MOBILE WARFARE RTS
            </p>
          </div>
        </div>

        {/* Global Nav Actions */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <button
            onClick={() => setActiveModal('manual')}
            title="Field Manual & Intel"
            className="p-1.5 sm:px-3 sm:py-2 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700 transition-colors flex items-center gap-1 text-xs font-mono"
          >
            <BookOpen className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden md:inline">INTEL</span>
          </button>

          <button
            onClick={() => setActiveModal('achievements')}
            title="Medals & Milestones"
            className="p-1.5 sm:px-3 sm:py-2 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700 transition-colors flex items-center gap-1 text-xs font-mono"
          >
            <Award className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden md:inline">MEDALS</span>
          </button>

          <button
            onClick={() => setActiveModal('stats')}
            title="Career Dossier"
            className="p-1.5 sm:px-3 sm:py-2 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700 transition-colors flex items-center gap-1 text-xs font-mono"
          >
            <BarChart2 className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden md:inline">CAREER</span>
          </button>

          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              title="Tactical Settings Center"
              className="p-1.5 sm:px-3 sm:py-2 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700 transition-colors flex items-center gap-1 text-xs font-mono"
            >
              <Sliders className="w-3.5 h-3.5 text-teal-400" />
              <span className="hidden md:inline">SETTINGS</span>
            </button>
          )}

          <button
            onClick={onToggleMute}
            title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
            className="p-1.5 sm:p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700 transition-colors"
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
          </button>

          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              title={isFullscreen ? 'Exit Full Screen' : 'Enter Immersive Full Screen'}
              className={`p-1.5 sm:px-3 sm:py-2 rounded-lg border transition-colors flex items-center gap-1 text-xs font-mono font-bold ${
                isFullscreen
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30'
                  : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border-slate-700'
              }`}
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="hidden md:inline">EXIT</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="hidden md:inline">FULLSCREEN</span>
                </>
              )}
            </button>
          )}
        </div>
      </header>

      {/* CENTER HERO & THEATER SELECTION */}
      <main className="relative z-10 w-full max-w-7xl mx-auto my-auto py-4 flex flex-col lg:flex-row items-stretch gap-6 overflow-y-auto max-h-[76vh]">
        {/* Left Column: Quick Resume & Operations Deck */}
        <div className="w-full lg:w-5/12 flex flex-col gap-4">
          {/* Quick Resume Card */}
          {latestSave && (
            <div className="bg-gradient-to-r from-emerald-950/60 to-slate-900/80 border border-emerald-500/40 rounded-2xl p-4 sm:p-5 shadow-xl backdrop-blur-md">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono tracking-widest text-emerald-400 uppercase font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  ACTIVE CAMPAIGN CHECKPOINT
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  {new Date(latestSave.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className="text-base font-display font-black text-slate-100 uppercase">
                {latestSave.name}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                Mode: <span className="text-emerald-300 font-mono uppercase">{latestSave.mode}</span> · Info:{' '}
                <span className="text-slate-200 font-mono">{latestSave.summary}</span>
              </div>

              <div className="mt-3.5 flex items-center gap-2">
                <button
                  onClick={() => onLoadSavedGame(latestSave)}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-display font-black text-xs tracking-wider uppercase transition-all shadow-lg flex items-center justify-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  RESUME OPERATION
                </button>
                {onOpenSaveLoad && (
                  <button
                    onClick={onOpenSaveLoad}
                    title="Browse all saved checkpoints"
                    className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-mono"
                  >
                    <FolderOpen className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Operation Theater Modes */}
          <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl flex-1 flex flex-col justify-between">
            <div>
              <div className="text-xs font-mono font-bold text-slate-400 tracking-wider uppercase mb-3 flex items-center justify-between">
                <span>SELECT COMBAT DOCTRINE</span>
                <span className="text-[10px] text-emerald-400">MISSION READY</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Skirmish */}
                <button
                  onClick={() => setSelectedMode('skirmish')}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    selectedMode === 'skirmish'
                      ? 'bg-emerald-950/40 border-emerald-500 text-emerald-300 ring-1 ring-emerald-500/40 shadow-lg'
                      : 'bg-slate-950/40 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                  }`}
                >
                  <Swords className="w-5 h-5 text-emerald-400 mb-1.5" />
                  <div className="text-xs font-display font-bold uppercase text-slate-100">Skirmish Battle</div>
                  <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                    Dynamic tactical engagement against autonomous AI.
                  </div>
                </button>

                {/* Campaign */}
                <button
                  onClick={() => setSelectedMode('campaign')}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    selectedMode === 'campaign'
                      ? 'bg-sky-950/40 border-sky-500 text-sky-300 ring-1 ring-sky-500/40 shadow-lg'
                      : 'bg-slate-950/40 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                  }`}
                >
                  <Shield className="w-5 h-5 text-sky-400 mb-1.5" />
                  <div className="text-xs font-display font-bold uppercase text-slate-100">Story Campaign</div>
                  <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                    Scripted strategic missions and objectives.
                  </div>
                </button>

                {/* Base Defense */}
                <button
                  onClick={() => setSelectedMode('defense')}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    selectedMode === 'defense'
                      ? 'bg-amber-950/40 border-amber-500 text-amber-300 ring-1 ring-amber-500/40 shadow-lg'
                      : 'bg-slate-950/40 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                  }`}
                >
                  <Flame className="w-5 h-5 text-amber-400 mb-1.5" />
                  <div className="text-xs font-display font-bold uppercase text-slate-100">Fortress Defense</div>
                  <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                    Endless escalations of mechanized enemy waves.
                  </div>
                </button>

                {/* Sandbox */}
                <button
                  onClick={() => setSelectedMode('sandbox')}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    selectedMode === 'sandbox'
                      ? 'bg-teal-950/40 border-teal-500 text-teal-300 ring-1 ring-teal-500/40 shadow-lg'
                      : 'bg-slate-950/40 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                  }`}
                >
                  <Sparkles className="w-5 h-5 text-teal-400 mb-1.5" />
                  <div className="text-xs font-display font-bold uppercase text-slate-100">Testing Sandbox</div>
                  <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                    Infinite treasury, nukes, and unit experiment tools.
                  </div>
                </button>
              </div>
            </div>

            {/* Tactical Launch CTA */}
            <div className="mt-4 pt-4 border-t border-slate-800/80 flex items-center gap-2">
              <button
                onClick={() => setActiveModal('setup')}
                className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-500 to-emerald-500 hover:from-emerald-500 hover:to-teal-400 text-slate-950 font-display font-black text-xs sm:text-sm tracking-wider uppercase transition-all shadow-xl shadow-emerald-950/50 flex items-center justify-center gap-2"
              >
                <Sliders className="w-4 h-4" />
                <span>CONFIGURE & LAUNCH MATCH</span>
              </button>

              <button
                onClick={handleLaunch}
                title="Quick Deploy with default battle parameters"
                className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-mono font-bold flex items-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5 fill-current text-emerald-400" />
                <span>QUICK DEPLOY</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Interactive Battlefield & Mission Intel Card */}
        <div className="w-full lg:w-7/12 flex flex-col gap-4">
          <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl flex-1 flex flex-col justify-between">
            {selectedMode === 'skirmish' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                  <div>
                    <h2 className="text-sm font-display font-black text-slate-100 uppercase tracking-wide flex items-center gap-2">
                      <Globe className="w-4 h-4 text-emerald-400" />
                      THEATER OF OPERATIONS: {currentMapData.name}
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {currentMapData.description}
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-mono text-emerald-400 font-bold uppercase">
                    BIOME: {currentMapData.biome}
                  </span>
                </div>

                {/* Biome Select Grid (All 6 Environments) */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {Object.entries(MAP_PRESETS).map(([key, mapInfo]) => {
                    const isSelected = selectedMap === key;
                    const biomeColor =
                      mapInfo.biome === 'volcanic'
                        ? 'border-orange-500/50 bg-orange-950/20 text-orange-400'
                        : mapInfo.biome === 'urban'
                        ? 'border-slate-500/50 bg-slate-800/40 text-slate-300'
                        : mapInfo.biome === 'desert'
                        ? 'border-amber-500/50 bg-amber-950/20 text-amber-400'
                        : mapInfo.biome === 'snow'
                        ? 'border-sky-500/50 bg-sky-950/20 text-sky-400'
                        : mapInfo.biome === 'industrial'
                        ? 'border-rose-500/50 bg-rose-950/20 text-rose-400'
                        : 'border-emerald-500/50 bg-emerald-950/20 text-emerald-400';

                    return (
                      <button
                        key={key}
                        onClick={() => setSelectedMap(key)}
                        className={`p-2.5 rounded-xl border text-left transition-all ${
                          isSelected
                            ? `${biomeColor} ring-1 ring-current shadow-md`
                            : 'bg-slate-950/40 border-slate-800/80 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <div className="text-xs font-display font-bold truncate">{mapInfo.name}</div>
                        <div className="text-[10px] text-slate-500 capitalize">{mapInfo.biome} theater</div>
                      </button>
                    );
                  })}
                </div>

                {/* AI Difficulty Selector */}
                <div>
                  <label className="text-xs font-mono font-bold text-slate-400 block mb-2">
                    COMMANDER AI OPPONENT DIFFICULTY:
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['easy', 'normal', 'hard', 'expert'] as AIDifficulty[]).map(diff => (
                      <button
                        key={diff}
                        onClick={() => setSelectedDifficulty(diff)}
                        className={`py-2 rounded-xl border text-xs font-mono font-bold uppercase transition-all ${
                          selectedDifficulty === diff
                            ? 'bg-emerald-600 text-slate-950 border-emerald-500 shadow-sm'
                            : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {diff}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tactical Parameters Overview Bar */}
                <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs font-mono">
                  <div>
                    <span className="text-[10px] text-slate-500 block">SCALE</span>
                    <span className="text-slate-200 font-bold uppercase">{mapSize}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">TREASURY</span>
                    <span className="text-amber-400 font-bold">${startingCredits.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">FOG OF WAR</span>
                    <span className={fogOfWar ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                      {fogOfWar ? 'ACTIVE' : 'DISABLED'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">VICTORY</span>
                    <span className="text-sky-400 font-bold uppercase">{victoryCondition}</span>
                  </div>
                </div>
              </div>
            )}

            {selectedMode === 'campaign' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                  <h2 className="text-sm font-display font-black text-slate-100 uppercase tracking-wide flex items-center gap-2">
                    <Shield className="w-4 h-4 text-sky-400" />
                    CAMPAIGN THEATER OPERATIONS
                  </h2>
                  <span className="text-[10px] font-mono text-slate-400">SELECT SCRIPTED OPERATION</span>
                </div>

                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {CAMPAIGN_MISSIONS.map(mission => (
                    <button
                      key={mission.id}
                      onClick={() => setSelectedCampaignId(mission.id)}
                      className={`w-full p-3.5 rounded-xl border text-left transition-all flex items-center justify-between ${
                        selectedCampaignId === mission.id
                          ? 'bg-sky-950/40 border-sky-500 text-sky-300 shadow-md ring-1 ring-sky-500/30'
                          : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-display font-bold text-slate-100 uppercase">
                          OPERATION {mission.id}: {mission.title}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">
                          {mission.briefing}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedMode === 'defense' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                  <h2 className="text-sm font-display font-black text-amber-400 uppercase tracking-wide flex items-center gap-2">
                    <Flame className="w-4 h-4" />
                    FORTRESS DEFENSE PROTOCOL
                  </h2>
                  <span className="text-[10px] font-mono text-amber-400 font-bold uppercase">ENDLESS WAVES</span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  Hostile assault battalions, mechanized tank divisions, and gunship squadrons will breach your sector in
                  continuous escalations. Establish a layered perimeter defense with Vulcan cannons, SAM batteries,
                  and automated patrol interceptors.
                </p>

                <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                  <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                    <span className="text-[10px] text-slate-500 block">STARTING FUNDS</span>
                    <span className="text-amber-400 font-bold text-sm">$2,500</span>
                  </div>
                  <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                    <span className="text-[10px] text-slate-500 block">WAVE ESCALATION</span>
                    <span className="text-emerald-400 font-bold text-sm">Every 30 Seconds</span>
                  </div>
                </div>
              </div>
            )}

            {selectedMode === 'sandbox' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                  <h2 className="text-sm font-display font-black text-teal-400 uppercase tracking-wide flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    TESTING SANDBOX & PROVING GROUND
                  </h2>
                  <span className="text-[10px] font-mono text-teal-400 font-bold uppercase">ALL UNLOCKED</span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  Freeform tactical simulation lab. Instant unit spawning, unlimited financial treasury, tactical nuclear
                  target acquisition, and satellite reveal mode. Test armor penetrations, radar coverage, and combat balances.
                </p>

                <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl text-xs font-mono text-slate-400 space-y-1">
                  <div>· Unlimited Credits ($999,999)</div>
                  <div>· Instant Tech Tree & Silo Unlocked</div>
                  <div>· Floating Sandbox Control Deck HUD</div>
                </div>
              </div>
            )}

            {/* Quick Stats Banner */}
            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span>Career Victories: <strong className="text-emerald-400">{careerStats.matchesWon}</strong></span>
              <span>Hostiles Destroyed: <strong className="text-rose-400">{careerStats.enemiesNeutralized}</strong></span>
              <span>Medals Earned: <strong className="text-amber-400">{achievements.filter(a => a.unlocked).length}/{achievements.length}</strong></span>
            </div>
          </div>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="relative z-10 w-full max-w-7xl mx-auto flex items-center justify-between text-[11px] font-mono text-slate-500 py-1">
        <div>IRON DOMINION RTS · MODERN MILITARY WARFARE ENGINE</div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveModal('credits')}
            className="hover:text-slate-300 transition-colors"
          >
            CREDITS & LICENSES
          </button>
        </div>
      </footer>

      {/* ======================================================== */}
      {/* MODAL 1: ADVANCED NEW GAME SETUP & BATTLEFIELD CONFIG     */}
      {/* ======================================================== */}
      {activeModal === 'setup' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-5 sm:p-6 max-h-[92vh] overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-emerald-400" />
                <h2 className="text-base font-display font-black text-slate-100 uppercase tracking-wider">
                  TACTICAL MISSION SETUP & PARAMETERS
                </h2>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 my-4 flex-1">
              {/* Map Selection with Visual Badges */}
              <div>
                <label className="text-xs font-mono font-bold text-slate-300 block mb-2">
                  1. SELECT BATTLEFIELD ENVIRONMENT:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {Object.entries(MAP_PRESETS).map(([key, mapInfo]) => (
                    <button
                      key={key}
                      onClick={() => setSelectedMap(key)}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        selectedMap === key
                          ? 'bg-emerald-950/40 border-emerald-500 text-emerald-300 ring-1 ring-emerald-500/30'
                          : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <div className="text-xs font-display font-bold text-slate-200">{mapInfo.name}</div>
                      <div className="text-[10px] text-slate-500 capitalize">{mapInfo.biome}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Map Scale */}
              <div>
                <label className="text-xs font-mono font-bold text-slate-300 block mb-2">
                  2. MAP SCALE / GRID SIZE:
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: 'small', label: 'Small (48x48)', sub: 'Fast Blitz' },
                    { id: 'medium', label: 'Medium (64x64)', sub: 'Standard' },
                    { id: 'large', label: 'Large (80x80)', sub: 'Armored' },
                    { id: 'extra_large', label: 'X-Large (96x96)', sub: 'Full Scale' },
                  ].map(item => (
                    <button
                      key={item.id}
                      onClick={() => setMapSize(item.id as MapSize)}
                      className={`p-2 rounded-xl border text-center transition-all ${
                        mapSize === item.id
                          ? 'bg-emerald-600 text-slate-950 border-emerald-500 font-bold'
                          : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <div className="text-xs font-mono">{item.label}</div>
                      <div className="text-[9px] opacity-75">{item.sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Starting Credits */}
              <div>
                <label className="text-xs font-mono font-bold text-slate-300 block mb-2">
                  3. STARTING MILITARY CREDITS:
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[3000, 5000, 10000, 25000].map(amt => (
                    <button
                      key={amt}
                      onClick={() => setStartingCredits(amt)}
                      className={`py-2 rounded-xl border text-xs font-mono transition-all ${
                        startingCredits === amt
                          ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                          : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      ${amt.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Starting Force & Tech */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-mono font-bold text-slate-300 block mb-2">
                    4. INITIAL BARRACKS FORCE:
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: 'minimal', label: 'Minimal' },
                      { id: 'standard', label: 'Standard' },
                      { id: 'strike_force', label: 'Strike Force' },
                    ].map(f => (
                      <button
                        key={f.id}
                        onClick={() => setStartingArmy(f.id as any)}
                        className={`py-1.5 px-2 rounded-lg border text-center text-xs font-mono ${
                          startingArmy === f.id
                            ? 'bg-emerald-600 text-slate-950 border-emerald-500 font-bold'
                            : 'bg-slate-950/50 border-slate-800 text-slate-400'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-mono font-bold text-slate-300 block mb-2">
                    5. STARTING TECHNOLOGY TIER:
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: 'basic', label: 'Basic' },
                      { id: 'advanced', label: 'Advanced' },
                      { id: 'all', label: 'All Unlocked' },
                    ].map(t => (
                      <button
                        key={t.id}
                        onClick={() => setStartingTech(t.id as any)}
                        className={`py-1.5 px-2 rounded-lg border text-center text-xs font-mono ${
                          startingTech === t.id
                            ? 'bg-emerald-600 text-slate-950 border-emerald-500 font-bold'
                            : 'bg-slate-950/50 border-slate-800 text-slate-400'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Victory Conditions & Fog of War */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-mono font-bold text-slate-300 block mb-2">
                    6. VICTORY CONDITION:
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: 'annihilation', label: 'Annihilation' },
                      { id: 'destroy_hq', label: 'Destroy HQ' },
                      { id: 'domination', label: 'Domination' },
                    ].map(v => (
                      <button
                        key={v.id}
                        onClick={() => setVictoryCondition(v.id as any)}
                        className={`py-1.5 px-2 rounded-lg border text-center text-xs font-mono ${
                          victoryCondition === v.id
                            ? 'bg-sky-600 text-slate-950 border-sky-400 font-bold'
                            : 'bg-slate-950/50 border-slate-800 text-slate-400'
                        }`}
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-mono font-bold text-slate-300 block mb-2">
                    7. FOG OF WAR PROTOCOL:
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => setFogOfWar(true)}
                      className={`py-1.5 rounded-lg border text-center text-xs font-mono ${
                        fogOfWar
                          ? 'bg-emerald-600 text-slate-950 border-emerald-500 font-bold'
                          : 'bg-slate-950/50 border-slate-800 text-slate-400'
                      }`}
                    >
                      Sensor Fog (Realistic)
                    </button>
                    <button
                      onClick={() => setFogOfWar(false)}
                      className={`py-1.5 rounded-lg border text-center text-xs font-mono ${
                        !fogOfWar
                          ? 'bg-emerald-600 text-slate-950 border-emerald-500 font-bold'
                          : 'bg-slate-950/50 border-slate-800 text-slate-400'
                      }`}
                    >
                      Satellite Reveal (All)
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
              <button
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono"
              >
                BACK TO MENU
              </button>
              <button
                onClick={() => {
                  setActiveModal(null);
                  handleLaunch();
                }}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-slate-950 font-display font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg"
              >
                <Play className="w-4 h-4 fill-current" />
                DEPLOY TO BATTLEFIELD
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 2: FIELD MANUAL & COMBAT INTEL                     */}
      {/* ======================================================== */}
      {activeModal === 'manual' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-5 sm:p-6 max-h-[92vh] overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-sky-400" />
                <h2 className="text-base font-display font-black text-slate-100 uppercase tracking-wider">
                  TACTICAL FIELD MANUAL & COMBAT INTEL
                </h2>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 my-3 border-b border-slate-800 pb-2">
              {[
                { id: 'basics', label: 'Operations Basics' },
                { id: 'units', label: 'Unit Counter Matrix' },
                { id: 'radar', label: 'Intelligent Radar & Defense' },
                { id: 'hotkeys', label: 'Keyboard & Shortcuts' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setManualTab(tab.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                    manualTab === tab.id
                      ? 'bg-sky-500 text-slate-950 font-bold'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 text-xs text-slate-300 space-y-3 font-sans">
              {manualTab === 'basics' && (
                <div className="space-y-3">
                  <h3 className="font-display font-bold text-sky-400 text-sm">BASE BUILDING & ECONOMY</h3>
                  <p>
                    Iron Dominion operates on a dual-resource framework: <strong>Credits</strong> for construction and
                    recruitment, and <strong>Power Supply</strong> to keep radar sensors, defensive turrets, and automated
                    facilities functional.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[11px]">
                    <div className="p-2.5 bg-slate-950/60 border border-slate-800 rounded-lg">
                      <strong className="text-amber-400 block mb-0.5">Ore Refinery & Harvesters</strong>
                      Deploy Refineries adjacent to golden Tiberium / Ore fields. Harvesters automatically haul raw minerals to generate revenue.
                    </div>
                    <div className="p-2.5 bg-slate-950/60 border border-slate-800 rounded-lg">
                      <strong className="text-sky-400 block mb-0.5">Power Supply Deficit</strong>
                      If Power Demand exceeds Power Supply, radar range degrades to 50%, defensive turrets fire slower, and production pauses.
                    </div>
                  </div>
                </div>
              )}

              {manualTab === 'units' && (
                <div className="space-y-3">
                  <h3 className="font-display font-bold text-sky-400 text-sm">COMBAT ENGAGEMENT MATRIX</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[11px]">
                    <div className="p-2.5 bg-slate-950/60 border border-slate-800 rounded-lg">
                      <strong className="text-emerald-400 block">Main Battle Tank (MBT)</strong>
                      Heavy front-line armor with independent 360° rotating turret. Devastates light infantry and fortifications, vulnerable to Air Gunships.
                    </div>
                    <div className="p-2.5 bg-slate-950/60 border border-slate-800 rounded-lg">
                      <strong className="text-sky-400 block">Mobile AA Vehicle</strong>
                      High-frequency dual flak autocannons. Prioritizes hostile helicopters and stealth fighters before they breach inner perimeter.
                    </div>
                    <div className="p-2.5 bg-slate-950/60 border border-slate-800 rounded-lg">
                      <strong className="text-amber-400 block">Mobile Artillery</strong>
                      Extreme range ballistic shells. Shells static base defenses from safe standoff distance. Slow rate of fire.
                    </div>
                    <div className="p-2.5 bg-slate-950/60 border border-slate-800 rounded-lg">
                      <strong className="text-rose-400 block">Attack Helicopter</strong>
                      Rotary gunship firing guided rocket salvos. Ignores terrain barriers; flies directly over cliffs and water bodies.
                    </div>
                  </div>
                </div>
              )}

              {manualTab === 'radar' && (
                <div className="space-y-3">
                  <h3 className="font-display font-bold text-sky-400 text-sm">INTELLIGENT RADAR & DEFENSE</h3>
                  <p>
                    The Advanced Radar Station monitors an 850m radius. Detected hostiles are classified into four threat tiers:
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-center text-[10px]">
                    <div className="p-2 bg-emerald-950/40 border border-emerald-500/40 rounded-lg text-emerald-400">
                      <strong>GREEN</strong>
                      <div>Nominal status. Normal base production.</div>
                    </div>
                    <div className="p-2 bg-amber-950/40 border border-amber-500/40 rounded-lg text-amber-400">
                      <strong>YELLOW</strong>
                      <div>Scout detected. Defenders on alert.</div>
                    </div>
                    <div className="p-2 bg-orange-950/40 border border-orange-500/40 rounded-lg text-orange-400">
                      <strong>ORANGE</strong>
                      <div>Armed hostile approach. Local patrol intercept.</div>
                    </div>
                    <div className="p-2 bg-rose-950/40 border border-rose-500/40 rounded-lg text-rose-400">
                      <strong>RED</strong>
                      <div>Base under attack! Emergency mobilization.</div>
                    </div>
                  </div>
                </div>
              )}

              {manualTab === 'hotkeys' && (
                <div className="space-y-2 font-mono text-xs">
                  <h3 className="font-display font-bold text-sky-400 text-sm">TACTICAL SHORTCUTS</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 bg-slate-950/50 border border-slate-800 rounded flex justify-between">
                      <span className="text-slate-400">Spacebar</span>
                      <span className="text-slate-200">Focus HQ / Selected Unit</span>
                    </div>
                    <div className="p-2 bg-slate-950/50 border border-slate-800 rounded flex justify-between">
                      <span className="text-slate-400">H Key</span>
                      <span className="text-slate-200">Center on Command HQ</span>
                    </div>
                    <div className="p-2 bg-slate-950/50 border border-slate-800 rounded flex justify-between">
                      <span className="text-slate-400">W, A, S, D / Arrows</span>
                      <span className="text-slate-200">Pan Battlefield Camera</span>
                    </div>
                    <div className="p-2 bg-slate-950/50 border border-slate-800 rounded flex justify-between">
                      <span className="text-slate-400">Ctrl + 1-4</span>
                      <span className="text-slate-200">Assign Squad Control Group</span>
                    </div>
                    <div className="p-2 bg-slate-950/50 border border-slate-800 rounded flex justify-between">
                      <span className="text-slate-400">1-4</span>
                      <span className="text-slate-200">Select Squad Control Group</span>
                    </div>
                    <div className="p-2 bg-slate-950/50 border border-slate-800 rounded flex justify-between">
                      <span className="text-slate-400">Tab</span>
                      <span className="text-slate-200">Toggle Cinematic HUD View</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setActiveModal(null)}
                className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-slate-950 font-display font-bold text-xs uppercase"
              >
                CLOSE FIELD MANUAL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 3: MEDALS & ACHIEVEMENTS                           */}
      {/* ======================================================== */}
      {activeModal === 'achievements' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-5 sm:p-6 max-h-[92vh] overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-400" />
                <h2 className="text-base font-display font-black text-slate-100 uppercase tracking-wider">
                  COMMANDER COMBAT MEDALS & MILESTONES
                </h2>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 my-4 flex-1">
              {achievements.map(ach => (
                <div
                  key={ach.id}
                  className={`p-3 rounded-xl border flex items-start gap-3 transition-all ${
                    ach.unlocked
                      ? 'bg-amber-950/20 border-amber-500/50 text-slate-200'
                      : 'bg-slate-950/50 border-slate-800 text-slate-500 opacity-60'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      ach.unlocked ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-600'
                    }`}
                  >
                    <Award className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-display font-bold text-slate-100 flex items-center gap-1.5">
                      <span>{ach.title}</span>
                      {ach.unlocked && (
                        <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                      {ach.description}
                    </div>
                    {ach.unlocked && ach.unlockedAt && (
                      <div className="text-[9px] font-mono text-amber-400/80 mt-1">
                        Awarded: {new Date(ach.unlockedAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setActiveModal(null)}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs uppercase"
              >
                RETURN
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 4: CAREER DOSSIER & STATISTICS                     */}
      {/* ======================================================== */}
      {activeModal === 'stats' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-5 sm:p-6 max-h-[92vh] overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <BarChart2 className="w-5 h-5 text-emerald-400" />
                <h2 className="text-base font-display font-black text-slate-100 uppercase tracking-wider">
                  COMMANDER LIFETIME SERVICE RECORD
                </h2>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 my-4 flex-1 font-mono text-xs">
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                <span className="text-[10px] text-slate-500 block">TOTAL OPERATIONS</span>
                <span className="text-base font-bold text-slate-200">{careerStats.matchesPlayed}</span>
              </div>
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                <span className="text-[10px] text-slate-500 block">VICTORIES CLAIMED</span>
                <span className="text-base font-bold text-emerald-400">{careerStats.matchesWon}</span>
              </div>
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                <span className="text-[10px] text-slate-500 block">HOSTILES NEUTRALIZED</span>
                <span className="text-base font-bold text-rose-400">{careerStats.enemiesNeutralized}</span>
              </div>
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                <span className="text-[10px] text-slate-500 block">TROOPS & VEHICLES BUILT</span>
                <span className="text-base font-bold text-sky-400">{careerStats.unitsBuilt}</span>
              </div>
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                <span className="text-[10px] text-slate-500 block">TACTICAL RADAR INTERCEPTS</span>
                <span className="text-base font-bold text-teal-400">{careerStats.threatsIntercepted}</span>
              </div>
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                <span className="text-[10px] text-slate-500 block">TACTICAL NUCLEAR STRIKES</span>
                <span className="text-base font-bold text-amber-400">{careerStats.nukesLaunched}</span>
              </div>
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                <span className="text-[10px] text-slate-500 block">HIGHEST FORTRESS WAVE</span>
                <span className="text-base font-bold text-orange-400">Wave {careerStats.highestDefenseWave}</span>
              </div>
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                <span className="text-[10px] text-slate-500 block">WIN RATE RATIO</span>
                <span className="text-base font-bold text-slate-200">
                  {careerStats.matchesPlayed > 0
                    ? `${Math.round((careerStats.matchesWon / careerStats.matchesPlayed) * 100)}%`
                    : 'N/A'}
                </span>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setActiveModal(null)}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs uppercase"
              >
                RETURN
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 5: CREDITS & ARCHITECTURE                          */}
      {/* ======================================================== */}
      {activeModal === 'credits' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-5 sm:p-6 max-h-[92vh] overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Info className="w-5 h-5 text-teal-400" />
                <h2 className="text-base font-display font-black text-slate-100 uppercase tracking-wider">
                  IRON DOMINION RTS CREDITS
                </h2>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="my-4 space-y-3 text-xs text-slate-300 leading-relaxed font-sans">
              <div>
                <strong className="text-slate-100 font-display block">IRON DOMINION BASE WARFARE RTS</strong>
                <p className="text-slate-400">
                  Autonomous Tactical Military RTS Engine. Developed with high-performance 2.5D canvas rendering,
                  procedural sound synthesis, multi-threat radar sensors, and responsive desktop/mobile controls.
                </p>
              </div>

              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1 font-mono text-[11px]">
                <div>· Engineering: Senior RTS Gameplay & Engine Architects</div>
                <div>· Graphics: 2.5D Isometric Technical Renderers</div>
                <div>· Audio: Real-time Web Audio Procedural Synthesizer</div>
                <div>· AI Behaviors: Adaptive Threat & Autonomous Defense Pipelines</div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setActiveModal(null)}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs uppercase"
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
