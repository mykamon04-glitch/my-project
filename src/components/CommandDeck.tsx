/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import {
  Shield,
  Zap,
  Sword,
  Crosshair,
  Radio,
  Wrench,
  Trash2,
  Radiation,
  Layers,
  ChevronDown,
  ChevronUp,
  Navigation,
  Hammer,
  Brain,
  HeartPulse,
  Sparkles,
  Check,
  Plus,
  Users,
  Eye,
  AlertOctagon,
  RotateCcw,
  Plane,
  Flame,
  Target,
  ArrowRight,
} from 'lucide-react';
import { BUILDING_CONFIGS, TECH_UPGRADES, UNIT_CONFIGS } from '../data/gameData';
import { GameEngine } from '../game/engine';
import {
  Building,
  BuildingPlacementRecommendation,
  BuildingType,
  SquadFormation,
  Unit,
  UnitType,
} from '../types/game';

interface CommandDeckProps {
  engine: GameEngine;
  selectedUnits: Unit[];
  selectedBuilding: Building | null;
  onStartBuildingPlacement: (type: BuildingType) => void;
  onQueueUnit: (buildingId: string, unitType: UnitType) => void;
  onCancelQueue: (buildingId: string, index: number) => void;
  onSelectSingleUnit: (unitId: string) => void;
  onIssueUnitCommandType: (
    command: 'move' | 'attack_move' | 'attack' | 'defend' | 'guard' | 'hold' | 'stop' | 'patrol' | 'retreat' | 'heal' | 'auto_heal' | 'repair' | 'follow'
  ) => void;
  onToggleRepair: (buildingId: string) => void;
  onDemolish: (buildingId: string) => void;
  onResearch: (techId: string) => void;
  onTriggerNukeTargeting: () => void;
  onSetFormation: (formation: SquadFormation) => void;
  onTriggerMoveTargeting?: () => void;
  activeInteractionMode?: 'NORMAL' | 'MOVE_TARGET' | 'ATTACK_TARGET' | 'BOX_SELECT';
  onOpenAdvisor?: () => void;
  onPreviewRecommendation?: (rec: BuildingPlacementRecommendation) => void;
}

export type DeckCategory = 'build' | 'defense' | 'infantry' | 'vehicles' | 'aircraft' | 'medical' | 'tech';

export const CommandDeck: React.FC<CommandDeckProps> = ({
  engine,
  selectedUnits,
  selectedBuilding,
  onStartBuildingPlacement,
  onQueueUnit,
  onCancelQueue,
  onSelectSingleUnit,
  onIssueUnitCommandType,
  onToggleRepair,
  onDemolish,
  onResearch,
  onTriggerNukeTargeting,
  onSetFormation,
  onTriggerMoveTargeting,
  activeInteractionMode = 'NORMAL',
  onOpenAdvisor,
  onPreviewRecommendation,
}) => {
  // 3-state mobile command deck: 'collapsed' | 'compact' | 'expanded'
  const [deckState, setDeckState] = useState<'collapsed' | 'compact' | 'expanded'>('compact');
  const [activeCategory, setActiveCategory] = useState<DeckCategory>('build');

  // Preview / Recommendation modal for Auto Place
  const [autoPlacePreview, setAutoPlacePreview] = useState<{
    type: BuildingType;
    recommendations: BuildingPlacementRecommendation[];
  } | null>(null);

  const hasSelection = selectedUnits.length > 0 || selectedBuilding !== null;

  // Facilities lookup
  const playerBarracks = engine.buildings.find(
    b => b.type === 'barracks' && b.faction === 'player' && b.constructionProgress >= 1.0
  );
  const playerHospital = engine.buildings.find(
    b => b.type === 'field_hospital' && b.faction === 'player' && b.constructionProgress >= 1.0
  );
  const playerFactory = engine.buildings.find(
    b => b.type === 'vehicle_factory' && b.faction === 'player' && b.constructionProgress >= 1.0
  );
  const playerHelipad = engine.buildings.find(
    b => b.type === 'helipad' && b.faction === 'player' && b.constructionProgress >= 1.0
  );
  const playerAirfield = engine.buildings.find(
    b => b.type === 'airfield' && b.faction === 'player' && b.constructionProgress >= 1.0
  );
  const playerTechLab = engine.buildings.find(
    b => b.type === 'research_lab' && b.faction === 'player' && b.constructionProgress >= 1.0
  );

  const hasNukeTech = engine.unlockedTechs.has('tactical_nuke') || engine.mode === 'sandbox';

  // Catalog rosters
  const baseBuildingsList: BuildingType[] = [
    'power_plant',
    'coin_generator',
    'supply_depot',
    'barracks',
    'vehicle_factory',
    'field_hospital',
    'helipad',
    'airfield',
    'research_lab',
    'radar_station',
    'repair_bay',
  ];

  const defenseBuildingsList: BuildingType[] = [
    'turret_gun',
    'turret_missile',
    'turret_aa',
    'heavy_turret',
    'defense_wall',
  ];

  const infantryList: UnitType[] = [
    'rifleman',
    'grenadier',
    'sniper',
    'rocket_soldier',
    'medic',
    'engineer',
    'field_commander',
    'commando',
    'scout',
    'heavy_gunner',
    'flamethrower',
  ];

  const vehicleList: UnitType[] = [
    'recon_buggy',
    'armored_car',
    'apc',
    'ifv',
    'artillery',
    'mlrs',
    'logistics_truck',
    'recovery_vehicle',
    'light_tank',
    'main_battle_tank',
    'heavy_tank',
    'siege_tank',
    'aa_vehicle',
    'mobile_sam',
    'medical_apc',
    'ugv_robot_tank',
  ];

  const aircraftList: UnitType[] = [
    'recon_drone',
    'combat_drone',
    'ucav_drone',
    'hawk_helicopter',
    'attack_helicopter',
    'titan_transport',
    'viper_fighter',
    'stealth_fighter',
    'raven_bomber',
  ];

  const formations: { id: SquadFormation; label: string }[] = [
    { id: 'spread', label: 'Spread' },
    { id: 'wedge', label: 'Wedge' },
    { id: 'line', label: 'Line' },
    { id: 'column', label: 'Col' },
    { id: 'circle', label: 'Ring' },
  ];

  // Determine production building for a unit
  const getProductionBuildingForUnit = (uType: UnitType): Building | undefined => {
    const cfg = UNIT_CONFIGS[uType];
    if (cfg.category === 'aircraft') {
      return uType === 'attack_helicopter' || uType === 'recon_drone' ? playerHelipad || playerAirfield : playerAirfield || playerHelipad;
    }
    if (cfg.category === 'vehicle') {
      return playerFactory;
    }
    if (uType === 'medic') {
      return playerHospital || playerBarracks;
    }
    return playerBarracks;
  };

  // Helper for Auto Place preview
  const handleOpenAutoPlacePreview = (type: BuildingType) => {
    const recs = engine.getRecommendedBuildingPositions(type);
    if (recs.length === 0) {
      // Direct placement attempt if no AI sites found
      engine.autoPlaceBuilding(type);
      return;
    }
    setAutoPlacePreview({ type, recommendations: recs });
  };

  const handleConfirmAutoPlace = (type: BuildingType, rec: BuildingPlacementRecommendation) => {
    engine.placeBuilding(type, rec.gridX, rec.gridY, 'player');
    setAutoPlacePreview(null);
  };

  // Check unit types in selection
  const hasMedic = selectedUnits.some(u => u.type === 'medic' || u.type === 'medical_apc');
  const hasEngineer = selectedUnits.some(u => u.type === 'engineer');

  // Touch swipe handling for collapse
  const touchStartY = useRef<number>(0);
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = e.changedTouches[0].clientY - touchStartY.current;
    if (diff > 50) {
      // Swiped down -> collapse
      if (deckState === 'expanded') setDeckState('compact');
      else if (deckState === 'compact') setDeckState('collapsed');
    } else if (diff < -50) {
      // Swiped up -> expand
      if (deckState === 'collapsed') setDeckState('compact');
      else if (deckState === 'compact') setDeckState('expanded');
    }
  };

  return (
    <>
      <footer
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className={`fixed bottom-0 left-0 right-0 z-20 select-none bg-[#0d141d]/95 backdrop-blur-md border-t border-[#1C2933] shadow-2xl transition-all duration-300 pb-safe ${
          deckState === 'collapsed'
            ? 'h-11 sm:h-12'
            : deckState === 'compact'
            ? 'h-40 sm:h-44'
            : 'h-[58vh] max-h-[460px]'
        }`}
      >
        {/* TOP STATUS / CONTROL HEADER */}
        <div className="h-8 sm:h-9 border-b border-[#1C2933] px-2.5 sm:px-3 flex items-center justify-between bg-[#141e2a]/80 text-xs">
          <div className="flex items-center gap-2 overflow-hidden">
            {hasSelection ? (
              <div className="flex items-center gap-1.5 truncate">
                <span className="w-2 h-2 rounded-full bg-[#38B98A] animate-pulse shrink-0" />
                {selectedUnits.length > 0 ? (
                  <span className="text-[11px] font-mono font-bold text-[#38B98A] truncate">
                    {selectedUnits.length} SQUAD TROOPS SELECTED
                  </span>
                ) : selectedBuilding ? (
                  <span className="text-[11px] font-mono font-bold text-[#36C9E8] truncate">
                    {BUILDING_CONFIGS[selectedBuilding.type].name} ({Math.round((selectedBuilding.hp / selectedBuilding.maxHp) * 100)}% HP)
                  </span>
                ) : null}
              </div>
            ) : (
              <div className="flex items-center gap-1 sm:gap-2">
                <span className="font-display font-bold text-[11px] tracking-wider text-[#F4F7FA] uppercase flex items-center gap-1">
                  <Hammer className="w-3.5 h-3.5 text-[#38B98A]" />
                  COMMAND
                </span>
                <span className="text-[9px] text-[#A9B8C5] font-mono hidden xs:inline">
                  {deckState.toUpperCase()}
                </span>
              </div>
            )}
          </div>

          {/* Quick Deck State Toggle Buttons */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Category tabs when in compact / expanded mode */}
            {deckState !== 'collapsed' && !hasSelection && (
              <div className="flex items-center gap-0.5 sm:gap-1 mr-1">
                {(['build', 'defense', 'infantry', 'vehicles', 'aircraft', 'tech'] as DeckCategory[]).map(cat => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`px-1.5 sm:px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase transition-colors ${
                      activeCategory === cat
                        ? 'bg-[#173A32] text-[#38B98A] border border-[#38B98A]/50'
                        : 'text-[#A9B8C5] hover:text-[#F4F7FA]'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}

            {/* Toggle State Chevron */}
            <button
              onClick={() => {
                if (deckState === 'collapsed') setDeckState('compact');
                else if (deckState === 'compact') setDeckState('expanded');
                else setDeckState('compact');
              }}
              title={deckState === 'collapsed' ? 'Open Deck' : deckState === 'compact' ? 'Expand Deck' : 'Compact Deck'}
              className="p-1 rounded bg-[#1C2933] hover:bg-[#173A32] text-[#A9B8C5] hover:text-white transition-colors"
            >
              {deckState === 'expanded' ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronUp className="w-4 h-4" />
              )}
            </button>

            {/* Direct Collapse to 1-line toolbar */}
            {deckState !== 'collapsed' && (
              <button
                onClick={() => setDeckState('collapsed')}
                title="Minimize Deck"
                className="px-1.5 py-0.5 rounded bg-[#1C2933] hover:bg-slate-800 text-[10px] font-mono text-[#A9B8C5]"
              >
                MIN
              </button>
            )}
          </div>
        </div>

        {/* 1. COLLAPSED STATE (Bottom Toolbar) */}
        {deckState === 'collapsed' && (
          <div className="h-full px-2 flex items-center justify-around gap-1 text-[11px] font-mono font-bold">
            <button
              onClick={() => {
                setActiveCategory('build');
                setDeckState('compact');
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#16212c] text-[#F2B84B] hover:bg-[#1C2933]"
            >
              <Hammer className="w-3.5 h-3.5" />
              <span>BUILD</span>
            </button>
            <button
              onClick={() => {
                setActiveCategory('defense');
                setDeckState('compact');
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#16212c] text-[#38B98A] hover:bg-[#1C2933]"
            >
              <Shield className="w-3.5 h-3.5" />
              <span>DEFENSE</span>
            </button>
            <button
              onClick={() => {
                setActiveCategory('infantry');
                setDeckState('compact');
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#16212c] text-[#36C9E8] hover:bg-[#1C2933]"
            >
              <Users className="w-3.5 h-3.5" />
              <span>ARMY</span>
            </button>
            {onOpenAdvisor && (
              <button
                onClick={onOpenAdvisor}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#173A32] text-[#38B98A] border border-[#38B98A]/40"
              >
                <Brain className="w-3.5 h-3.5" />
                <span>AI</span>
              </button>
            )}
            <button
              onClick={() => setDeckState('compact')}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#1C2933] text-[#F4F7FA] hover:bg-slate-700"
            >
              <ChevronUp className="w-3.5 h-3.5" />
              <span>MORE</span>
            </button>
          </div>
        )}

        {/* 2. COMPACT & EXPANDED CONTENT AREA */}
        {deckState !== 'collapsed' && (
          <div className="h-[calc(100%-32px)] sm:h-[calc(100%-36px)] overflow-y-auto px-2 py-1.5 flex flex-col gap-1.5">
            {/* A. CONTEXTUAL SELECTION CONTROLS (If units or buildings are selected) */}
            {hasSelection ? (
              <div className="flex flex-col gap-1.5 h-full">
                {/* A1. UNIT COMMANDS */}
                {selectedUnits.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                    {/* Move Command */}
                    <button
                      onClick={() => onIssueUnitCommandType('move')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all shadow-sm ${
                        activeInteractionMode === 'MOVE_TARGET'
                          ? 'bg-[#38B98A] text-[#101820] animate-pulse'
                          : 'bg-[#173A32] text-[#38B98A] border border-[#38B98A]/50'
                      }`}
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      <span>MOVE</span>
                    </button>

                    {/* Attack / Attack-Move Command */}
                    <button
                      onClick={() => onIssueUnitCommandType('attack_move')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all shadow-sm ${
                        activeInteractionMode === 'ATTACK_TARGET'
                          ? 'bg-rose-500 text-white animate-pulse'
                          : 'bg-rose-950/60 text-rose-300 border border-rose-600/50'
                      }`}
                    >
                      <Crosshair className="w-3.5 h-3.5" />
                      <span>ATTACK</span>
                    </button>

                    {/* Defend / Guard Command */}
                    <button
                      onClick={() => onIssueUnitCommandType('defend')}
                      className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 bg-[#1C2933] text-[#36C9E8] border border-[#1C2933] hover:bg-[#173A32]"
                    >
                      <Shield className="w-3.5 h-3.5" />
                      <span>DEFEND</span>
                    </button>

                    {/* Patrol Command */}
                    <button
                      onClick={() => onIssueUnitCommandType('patrol')}
                      className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 bg-[#1C2933] text-[#F2B84B] border border-[#1C2933] hover:bg-[#173A32]"
                    >
                      <Radio className="w-3.5 h-3.5" />
                      <span>PATROL</span>
                    </button>

                    {/* Retreat Command */}
                    <button
                      onClick={() => onIssueUnitCommandType('retreat')}
                      className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 bg-amber-950/60 text-amber-300 border border-amber-600/40"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>RETREAT</span>
                    </button>

                    {/* Medics specific: Heal */}
                    {hasMedic && (
                      <button
                        onClick={() => onIssueUnitCommandType('auto_heal')}
                        className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 bg-emerald-950/80 text-emerald-300 border border-emerald-500/50"
                      >
                        <HeartPulse className="w-3.5 h-3.5 text-emerald-400" />
                        <span>AUTO HEAL</span>
                      </button>
                    )}

                    {/* Engineers specific: Auto Repair */}
                    {hasEngineer && (
                      <button
                        onClick={() => onIssueUnitCommandType('repair')}
                        className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 bg-sky-950/80 text-sky-300 border border-sky-500/50"
                      >
                        <Wrench className="w-3.5 h-3.5 text-sky-400" />
                        <span>AUTO REPAIR</span>
                      </button>
                    )}

                    {/* Squad Formation Selector */}
                    <div className="flex items-center gap-1 ml-auto">
                      <span className="text-[10px] font-mono text-[#A9B8C5] hidden sm:inline">FORM:</span>
                      {formations.map(f => (
                        <button
                          key={f.id}
                          onClick={() => onSetFormation(f.id)}
                          className={`px-1.5 py-1 rounded text-[10px] font-mono font-bold ${
                            engine.currentFormation === f.id
                              ? 'bg-[#38B98A] text-[#101820]'
                              : 'bg-[#1C2933] text-[#A9B8C5] hover:text-white'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* A2. BUILDING ACTIONS (If a player structure is selected) */}
                {selectedBuilding && selectedBuilding.faction === 'player' && (
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Production Units if building can produce */}
                    {BUILDING_CONFIGS[selectedBuilding.type].canProduce && (
                      <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                        {BUILDING_CONFIGS[selectedBuilding.type].canProduce?.map(itemType => {
                          const uCfg = UNIT_CONFIGS[itemType as UnitType];
                          if (!uCfg) return null;
                          const canAfford = engine.economy.credits >= uCfg.cost;
                          return (
                            <button
                              key={itemType}
                              onClick={() => onQueueUnit(selectedBuilding.id, itemType as UnitType)}
                              disabled={!canAfford}
                              className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono flex items-center gap-1.5 shrink-0 ${
                                canAfford
                                  ? 'bg-[#16212c] border-[#38B98A]/50 text-[#F4F7FA] hover:bg-[#173A32]'
                                  : 'bg-[#101820] border-[#1C2933] text-gray-500 opacity-60'
                              }`}
                            >
                              <span className="font-bold text-[#38B98A]">{uCfg.name}</span>
                              <span className="text-[#F2B84B] font-mono text-[10px]">${uCfg.cost}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Repair Button */}
                    <button
                      onClick={() => onToggleRepair(selectedBuilding.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 ${
                        selectedBuilding.isRepairing
                          ? 'bg-sky-500 text-white animate-pulse'
                          : 'bg-[#1C2933] text-sky-300 border border-sky-500/40'
                      }`}
                    >
                      <Wrench className="w-3.5 h-3.5" />
                      <span>{selectedBuilding.isRepairing ? 'REPAIRING...' : 'REPAIR'}</span>
                    </button>

                    {/* Demolish Button */}
                    <button
                      onClick={() => onDemolish(selectedBuilding.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 bg-rose-950/60 text-rose-300 border border-rose-800/40"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>DEMOLISH</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* B. CATALOG OF BUILDINGS & UNITS (Clean horizontal card strip) */
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
                {/* BUILDINGS CATEGORY */}
                {activeCategory === 'build' &&
                  baseBuildingsList.map(bType => {
                    const cfg = BUILDING_CONFIGS[bType];
                    const canAfford = engine.economy.credits >= cfg.cost;
                    return (
                      <div
                        key={bType}
                        className="min-w-[170px] sm:min-w-[190px] p-2 rounded-xl bg-[#141e2a] border border-[#1C2933] flex flex-col justify-between shrink-0 shadow-md"
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div>
                            <span className="font-display font-bold text-xs text-[#F4F7FA] block leading-tight truncate max-w-[130px]">
                              {cfg.name}
                            </span>
                            <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#A9B8C5] mt-0.5">
                              <span className="text-[#F2B84B] font-bold">${cfg.cost}</span>
                              {cfg.powerProduced > 0 && (
                                <span className="text-emerald-400">+{cfg.powerProduced}pwr</span>
                              )}
                              {cfg.powerConsumed > 0 && (
                                <span className="text-amber-400">-{cfg.powerConsumed}pwr</span>
                              )}
                              <span>{cfg.buildTime}s</span>
                            </div>
                          </div>
                          <span className="text-lg">🏗️</span>
                        </div>

                        <div className="flex items-center gap-1.5 mt-2">
                          <button
                            onClick={() => onStartBuildingPlacement(bType)}
                            disabled={!canAfford}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center justify-center gap-1 ${
                              canAfford
                                ? 'bg-[#38B98A] text-[#101820] hover:bg-[#4ade80]'
                                : 'bg-[#1C2933] text-gray-500 cursor-not-allowed'
                            }`}
                          >
                            <span>BUILD</span>
                          </button>
                          <button
                            onClick={() => handleOpenAutoPlacePreview(bType)}
                            title="Intelligent Auto Placement"
                            className="p-1.5 rounded-lg bg-[#173A32] text-[#38B98A] border border-[#38B98A]/50 hover:bg-[#38B98A]/20"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                {/* DEFENSE CATEGORY */}
                {activeCategory === 'defense' &&
                  defenseBuildingsList.map(bType => {
                    const cfg = BUILDING_CONFIGS[bType];
                    const canAfford = engine.economy.credits >= cfg.cost;
                    return (
                      <div
                        key={bType}
                        className="min-w-[170px] sm:min-w-[190px] p-2 rounded-xl bg-[#141e2a] border border-[#1C2933] flex flex-col justify-between shrink-0 shadow-md"
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div>
                            <span className="font-display font-bold text-xs text-[#F4F7FA] block leading-tight truncate max-w-[130px]">
                              {cfg.name}
                            </span>
                            <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#A9B8C5] mt-0.5">
                              <span className="text-[#F2B84B] font-bold">${cfg.cost}</span>
                              {cfg.powerConsumed > 0 && (
                                <span className="text-amber-400">-{cfg.powerConsumed}pwr</span>
                              )}
                              <span>{cfg.buildTime}s</span>
                            </div>
                          </div>
                          <span className="text-lg">🛡️</span>
                        </div>

                        <div className="flex items-center gap-1.5 mt-2">
                          <button
                            onClick={() => onStartBuildingPlacement(bType)}
                            disabled={!canAfford}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center justify-center gap-1 ${
                              canAfford
                                ? 'bg-[#38B98A] text-[#101820] hover:bg-[#4ade80]'
                                : 'bg-[#1C2933] text-gray-500 cursor-not-allowed'
                            }`}
                          >
                            <span>BUILD</span>
                          </button>
                          <button
                            onClick={() => handleOpenAutoPlacePreview(bType)}
                            title="Auto Place at Strategic Defense Chokepoint"
                            className="p-1.5 rounded-lg bg-[#173A32] text-[#38B98A] border border-[#38B98A]/50 hover:bg-[#38B98A]/20"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                {/* INFANTRY CATEGORY */}
                {activeCategory === 'infantry' &&
                  infantryList.map(uType => {
                    const cfg = UNIT_CONFIGS[uType];
                    const facility = getProductionBuildingForUnit(uType);
                    const canAfford = engine.economy.credits >= cfg.cost;
                    const canTrain = !!facility && canAfford;
                    return (
                      <div
                        key={uType}
                        className="min-w-[160px] sm:min-w-[180px] p-2 rounded-xl bg-[#141e2a] border border-[#1C2933] flex flex-col justify-between shrink-0 shadow-md"
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div>
                            <span className="font-display font-bold text-xs text-[#F4F7FA] block leading-tight truncate max-w-[120px]">
                              {cfg.name}
                            </span>
                            <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#A9B8C5] mt-0.5">
                              <span className="text-[#F2B84B] font-bold">${cfg.cost}</span>
                              <span>{cfg.trainTime}s</span>
                              <span className="text-[#38B98A] uppercase text-[9px]">{cfg.category}</span>
                            </div>
                          </div>
                          <span className="text-lg">🪖</span>
                        </div>

                        {!facility ? (
                          <div className="text-[10px] font-mono text-rose-400 mt-2">
                            Needs {cfg.requiredBuilding || 'Barracks'}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 mt-2">
                            <button
                              onClick={() => onQueueUnit(facility.id, uType)}
                              disabled={!canAfford}
                              className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center justify-center gap-1 ${
                                canAfford
                                  ? 'bg-[#38B98A] text-[#101820] hover:bg-[#4ade80]'
                                  : 'bg-[#1C2933] text-gray-500 cursor-not-allowed'
                              }`}
                            >
                              <span>TRAIN</span>
                            </button>
                            <button
                              onClick={() => {
                                for (let i = 0; i < 5; i++) onQueueUnit(facility.id, uType);
                              }}
                              disabled={engine.economy.credits < cfg.cost * 5}
                              title="Queue 5 Units"
                              className="px-2 py-1.5 rounded-lg bg-[#173A32] text-[#38B98A] border border-[#38B98A]/50 text-xs font-mono font-bold hover:bg-[#38B98A]/20"
                            >
                              +5
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}

                {/* VEHICLES CATEGORY */}
                {activeCategory === 'vehicles' &&
                  vehicleList.map(uType => {
                    const cfg = UNIT_CONFIGS[uType];
                    const facility = playerFactory;
                    const canAfford = engine.economy.credits >= cfg.cost;
                    return (
                      <div
                        key={uType}
                        className="min-w-[170px] sm:min-w-[190px] p-2 rounded-xl bg-[#141e2a] border border-[#1C2933] flex flex-col justify-between shrink-0 shadow-md"
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div>
                            <span className="font-display font-bold text-xs text-[#F4F7FA] block leading-tight truncate max-w-[125px]">
                              {cfg.name}
                            </span>
                            <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#A9B8C5] mt-0.5">
                              <span className="text-[#F2B84B] font-bold">${cfg.cost}</span>
                              <span>{cfg.trainTime}s</span>
                              <span className="text-[#36C9E8] uppercase text-[9px]">Armor</span>
                            </div>
                          </div>
                          <span className="text-lg">🛡️</span>
                        </div>

                        {!facility ? (
                          <div className="text-[10px] font-mono text-rose-400 mt-2">
                            Needs Vehicle Factory
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 mt-2">
                            <button
                              onClick={() => onQueueUnit(facility.id, uType)}
                              disabled={!canAfford}
                              className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center justify-center gap-1 ${
                                canAfford
                                  ? 'bg-[#36C9E8] text-[#101820] hover:bg-sky-400'
                                  : 'bg-[#1C2933] text-gray-500 cursor-not-allowed'
                              }`}
                            >
                              <span>BUILD</span>
                            </button>
                            <button
                              onClick={() => {
                                for (let i = 0; i < 3; i++) onQueueUnit(facility.id, uType);
                              }}
                              disabled={engine.economy.credits < cfg.cost * 3}
                              title="Queue 3 Tanks"
                              className="px-2 py-1.5 rounded-lg bg-[#16212c] text-[#36C9E8] border border-[#36C9E8]/50 text-xs font-mono font-bold"
                            >
                              +3
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}

                {/* AIRCRAFT CATEGORY */}
                {activeCategory === 'aircraft' &&
                  aircraftList.map(uType => {
                    const cfg = UNIT_CONFIGS[uType];
                    const facility = getProductionBuildingForUnit(uType);
                    const canAfford = engine.economy.credits >= cfg.cost;
                    return (
                      <div
                        key={uType}
                        className="min-w-[170px] sm:min-w-[190px] p-2 rounded-xl bg-[#141e2a] border border-[#1C2933] flex flex-col justify-between shrink-0 shadow-md"
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div>
                            <span className="font-display font-bold text-xs text-[#F4F7FA] block leading-tight truncate max-w-[125px]">
                              {cfg.name}
                            </span>
                            <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#A9B8C5] mt-0.5">
                              <span className="text-[#F2B84B] font-bold">${cfg.cost}</span>
                              <span>{cfg.trainTime}s</span>
                              <span className="text-[#36C9E8] uppercase text-[9px]">Air</span>
                            </div>
                          </div>
                          <span className="text-lg">✈️</span>
                        </div>

                        {!facility ? (
                          <div className="text-[10px] font-mono text-rose-400 mt-2">
                            Needs Helipad/Airfield
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 mt-2">
                            <button
                              onClick={() => onQueueUnit(facility.id, uType)}
                              disabled={!canAfford}
                              className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center justify-center gap-1 ${
                                canAfford
                                  ? 'bg-[#36C9E8] text-[#101820] hover:bg-sky-400'
                                  : 'bg-[#1C2933] text-gray-500 cursor-not-allowed'
                              }`}
                            >
                              <span>DEPLOY</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}

                {/* TECH & UPGRADES CATEGORY */}
                {activeCategory === 'tech' && (
                  <div className="flex items-center gap-2">
                    {/* Tactical Nuke */}
                    {hasNukeTech && (
                      <button
                        onClick={onTriggerNukeTargeting}
                        className="p-2.5 rounded-xl bg-red-950/80 border border-red-500 text-red-300 font-mono text-xs flex items-center gap-2 shrink-0 animate-pulse"
                      >
                        <Radiation className="w-5 h-5 text-red-400" />
                        <div className="text-left">
                          <span className="font-bold block">TACTICAL NUKE</span>
                          <span className="text-[10px] text-red-200">READY TO LAUNCH</span>
                        </div>
                      </button>
                    )}

                    {TECH_UPGRADES.map(tech => {
                      const isUnlocked = engine.unlockedTechs.has(tech.id);
                      const isResearching = engine.researchInProgress?.techId === tech.id;
                      const canAfford = engine.economy.credits >= tech.cost;
                      return (
                        <div
                          key={tech.id}
                          className="min-w-[170px] p-2 rounded-xl bg-[#141e2a] border border-[#1C2933] flex flex-col justify-between shrink-0"
                        >
                          <div>
                            <span className="font-display font-bold text-xs text-[#F4F7FA] block leading-tight">
                              {tech.name}
                            </span>
                            <span className="text-[10px] font-mono text-[#F2B84B]">${tech.cost}</span>
                          </div>
                          {isUnlocked ? (
                            <span className="text-[10px] font-mono text-emerald-400 font-bold mt-2">
                              ✓ RESEARCHED
                            </span>
                          ) : isResearching ? (
                            <span className="text-[10px] font-mono text-amber-400 font-bold mt-2 animate-pulse">
                              RESEARCHING...
                            </span>
                          ) : (
                            <button
                              onClick={() => onResearch(tech.id)}
                              disabled={!canAfford || !playerTechLab}
                              className={`mt-2 py-1 px-2 rounded text-xs font-mono font-bold ${
                                canAfford && playerTechLab
                                  ? 'bg-[#38B98A] text-[#101820]'
                                  : 'bg-[#1C2933] text-gray-500'
                              }`}
                            >
                              RESEARCH
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </footer>

      {/* AUTO PLACE SITE SELECTION MODAL (Phase 4 & 7: Shows 3 sites with preview & confirm without jumping camera) */}
      {autoPlacePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#101820] border border-[#38B98A] rounded-xl max-w-md w-full p-4 shadow-2xl space-y-3">
            <div className="flex items-center justify-between border-b border-[#1C2933] pb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#38B98A]" />
                <span className="font-display font-bold text-sm text-[#F4F7FA]">
                  AUTO PLACE: {BUILDING_CONFIGS[autoPlacePreview.type].name}
                </span>
              </div>
              <button
                onClick={() => setAutoPlacePreview(null)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-[#A9B8C5]">
              AI evaluated defensive coverage, road clearances, and power proximity. Choose a site or preview it on the battlefield:
            </p>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {autoPlacePreview.recommendations.map((rec, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-lg bg-[#16212c] border border-[#1C2933] flex items-center justify-between gap-2"
                >
                  <div className="text-xs">
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-[#173A32] text-[#38B98A]">
                        #{idx + 1} {rec.label} ({rec.score}%)
                      </span>
                      <span className="font-bold text-[#F4F7FA]">{rec.reason}</span>
                    </div>
                    <div className="text-[10px] text-[#A9B8C5] mt-0.5">{rec.advantage}</div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {onPreviewRecommendation && (
                      <button
                        onClick={() => onPreviewRecommendation(rec)}
                        title="View Site Location"
                        className="px-2 py-1 rounded bg-[#1C2933] text-[#36C9E8] font-mono text-xs hover:bg-[#173A32]"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => handleConfirmAutoPlace(autoPlacePreview.type, rec)}
                      className="px-3 py-1.5 rounded bg-[#38B98A] text-[#101820] font-mono font-bold text-xs hover:bg-[#4ade80]"
                    >
                      DEPLOY
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-[#1C2933]">
              <button
                onClick={() => {
                  const type = autoPlacePreview.type;
                  setAutoPlacePreview(null);
                  onStartBuildingPlacement(type);
                }}
                className="px-3 py-1.5 rounded bg-[#1C2933] text-gray-300 font-mono text-xs hover:text-white"
              >
                MANUAL PLACEMENT
              </button>
              <button
                onClick={() => setAutoPlacePreview(null)}
                className="px-3 py-1.5 rounded bg-slate-800 text-gray-400 font-mono text-xs hover:text-white"
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
