/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useMemo, useCallback } from 'react';
import {
  Hammer,
  Users,
  Shield,
  Brain,
  Zap,
  Clock,
  Crosshair,
  Sword,
  Navigation,
  Sparkles,
  HeartPulse,
  Wrench,
  Trash2,
  Check,
  Plus,
  Play,
  Pause,
  FastForward,
  Layers,
  Activity,
  Coins,
  X,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  Sliders,
  Save,
  HelpCircle,
  LogOut,
  Target,
  ArrowUpRight,
  ShieldAlert,
  AlertTriangle,
  Menu as MenuIcon,
  Flame,
  Radio,
  Eye,
  MoreHorizontal,
  ChevronRight,
} from 'lucide-react';
import { BUILDING_CONFIGS, UNIT_CONFIGS } from '../../data/gameData';
import { GameEngine } from '../../game/engine';
import {
  Building,
  BuildingPlacementRecommendation,
  BuildingType,
  SquadFormation,
  Unit,
  UnitType,
} from '../../types/game';
import { formatHp, getHpColor, getUnitStatusText } from '../../utils/format';
import { AiManagerCards } from './AiManagerCards';
import { SmartRecruitmentCard } from './SmartRecruitmentCard';
import { ConstructionAIPanel } from './ConstructionAIPanel';

export type MobileTab = 'build' | 'army' | 'defense' | 'ai' | 'menu';
export type SheetSnapState = 'collapsed' | 'half' | 'expanded';
export type BuildCategory = 'economy' | 'power' | 'military' | 'defense' | 'technology' | 'infrastructure';
export type ArmySection = 'units' | 'recruitment';

interface MobileBottomSheetProps {
  engine: GameEngine;
  selectedUnits: Unit[];
  selectedBuilding: Building | null;
  onStartBuildingPlacement: (type: BuildingType) => void;
  onCancelPlacement?: () => void;
  onQueueUnit: (buildingId: string, unitType: UnitType) => void;
  onCancelQueue: (buildingId: string, index: number) => void;
  onSelectSingleUnit: (unitId: string) => void;
  onFilterSelectionToType?: (type: string) => void;
  onIssueUnitCommandType: (
    command:
      | 'move'
      | 'attack_move'
      | 'attack'
      | 'defend'
      | 'guard'
      | 'hold'
      | 'stop'
      | 'patrol'
      | 'retreat'
      | 'heal'
      | 'auto_heal'
      | 'repair'
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
  onSelectAllArmy?: () => void;
  onSelectInfantry?: () => void;
  onSelectTanks?: () => void;
  onSelectAirUnits?: () => void;
  onSelectSupportUnits?: () => void;
  onSelectIdleUnits?: () => void;
  onSelectCombatUnits?: () => void;
  onClearSelection?: () => void;
  onSelectDamagedUnits?: () => void;
  onSelectSquad?: (squadNum: number) => void;
  onSaveSquad?: (squadNum: number) => void;
  controlGroups?: Record<number, string[]>;
  onOpenSettings?: () => void;
  onOpenSaveLoad?: () => void;
  onToggleFullscreen?: () => void;
  isFullscreen?: boolean;
  onToggleMute?: () => void;
  isMuted?: boolean;
  onExitToMenu?: () => void;
  onCenterHQ?: () => void;
  onFitBase?: () => void;
  onToggleFollow?: () => void;
  isFollowing?: boolean;
  onSetRallyPointMode?: () => void;
}

// Crisp 2.5D Isometric SVG Thumbnails for Buildings (Matching Asset Reference Sheet 71b481fb)
const renderBuildingThumbnail = (type: BuildingType) => {
  switch (type) {
    case 'power_plant':
      return (
        <svg viewBox="0 0 48 48" className="w-10 h-10">
          <polygon points="24,6 42,16 42,32 24,42 6,32 6,16" fill="#101820" stroke="#4B91B5" strokeWidth="2" />
          <circle cx="24" cy="24" r="8" fill="#4B91B5" fillOpacity="0.3" stroke="#2FB68A" strokeWidth="1.5" />
          <line x1="24" y1="12" x2="24" y2="36" stroke="#2FB68A" strokeWidth="2" />
          <line x1="12" y1="18" x2="36" y2="30" stroke="#2FB68A" strokeWidth="2" />
          <circle cx="24" cy="24" r="3" fill="#F1F5F7" />
        </svg>
      );
    case 'coin_generator':
      return (
        <svg viewBox="0 0 48 48" className="w-10 h-10">
          <polygon points="10,18 24,10 38,18 38,36 10,36" fill="#1B2730" stroke="#E5A93D" strokeWidth="2" />
          <polygon points="18,12 28,12 34,22 12,22" fill="#2c3e50" />
          <polygon points="16,28 20,20 28,20 32,28" fill="#4B91B5" fillOpacity="0.8" />
          <rect x="20" y="24" width="8" height="12" fill="#101820" stroke="#E5A93D" strokeWidth="1" />
        </svg>
      );
    case 'barracks':
      return (
        <svg viewBox="0 0 48 48" className="w-10 h-10">
          <polygon points="6,20 24,10 42,20 42,38 6,38" fill="#101820" stroke="#2FB68A" strokeWidth="2" />
          <polygon points="16,38 24,28 32,38" fill="#2FB68A" fillOpacity="0.3" />
          <rect x="20" y="30" width="8" height="8" fill="#101820" stroke="#2FB68A" strokeWidth="1" />
          <line x1="32" y1="8" x2="32" y2="18" stroke="#F1F5F7" strokeWidth="2" />
          <polygon points="32,8 38,11 32,14" fill="#2FB68A" />
        </svg>
      );
    case 'vehicle_factory':
      return (
        <svg viewBox="0 0 48 48" className="w-10 h-10">
          <rect x="6" y="14" width="36" height="24" rx="4" fill="#1B2730" stroke="#4B91B5" strokeWidth="2" />
          <rect x="14" y="22" width="20" height="16" fill="#101820" stroke="#E5A93D" strokeWidth="1.5" strokeDasharray="3,2" />
          <line x1="8" y1="18" x2="40" y2="18" stroke="#E5A93D" strokeWidth="2" strokeDasharray="4,3" />
          <rect x="18" y="8" width="12" height="6" fill="#2c3e50" stroke="#4B91B5" strokeWidth="1" />
        </svg>
      );
    case 'radar_station':
      return (
        <svg viewBox="0 0 48 48" className="w-10 h-10">
          <polygon points="16,38 32,38 28,24 20,24" fill="#1B2730" stroke="#2FB68A" strokeWidth="1.5" />
          <ellipse cx="24" cy="18" rx="14" ry="7" fill="#101820" stroke="#2FB68A" strokeWidth="2" />
          <line x1="24" y1="18" x2="34" y2="10" stroke="#2FB68A" strokeWidth="2" />
          <circle cx="34" cy="10" r="3" fill="#D94F59" />
        </svg>
      );
    case 'airfield':
    case 'helipad':
      return (
        <svg viewBox="0 0 48 48" className="w-10 h-10">
          <rect x="6" y="12" width="36" height="26" rx="4" fill="#101820" stroke="#4B91B5" strokeWidth="2" />
          <circle cx="24" cy="25" r="9" fill="none" stroke="#E5A93D" strokeWidth="1.5" strokeDasharray="4,2" />
          <text x="24" y="29" fill="#E5A93D" fontSize="12" fontFamily="sans-serif" fontWeight="bold" textAnchor="middle">H</text>
        </svg>
      );
    case 'supply_depot':
      return (
        <svg viewBox="0 0 48 48" className="w-10 h-10">
          <rect x="8" y="18" width="16" height="18" rx="2" fill="#1B2730" stroke="#2FB68A" strokeWidth="1.5" />
          <rect x="24" y="12" width="16" height="24" rx="2" fill="#2c3e50" stroke="#2FB68A" strokeWidth="1.5" />
          <line x1="10" y1="22" x2="22" y2="32" stroke="#101820" strokeWidth="1.5" />
          <line x1="26" y1="16" x2="38" y2="28" stroke="#101820" strokeWidth="1.5" />
        </svg>
      );
    case 'research_lab':
      return (
        <svg viewBox="0 0 48 48" className="w-10 h-10">
          <rect x="8" y="20" width="32" height="18" rx="3" fill="#101820" stroke="#4B91B5" strokeWidth="2" />
          <path d="M 14 20 Q 24 8 34 20 Z" fill="#4B91B5" fillOpacity="0.5" stroke="#4B91B5" strokeWidth="1.5" />
          <circle cx="24" cy="16" r="3" fill="#2FB68A" />
        </svg>
      );
    case 'turret_gun':
    case 'heavy_turret':
      return (
        <svg viewBox="0 0 48 48" className="w-10 h-10">
          <polygon points="12,36 36,36 32,24 16,24" fill="#1B2730" stroke="#A8B6C2" strokeWidth="2" />
          <circle cx="24" cy="22" r="8" fill="#101820" stroke="#D94F59" strokeWidth="2" />
          <line x1="22" y1="22" x2="22" y2="8" stroke="#A8B6C2" strokeWidth="3" />
          <line x1="26" y1="22" x2="26" y2="8" stroke="#A8B6C2" strokeWidth="3" />
        </svg>
      );
    case 'turret_missile':
    case 'turret_aa':
      return (
        <svg viewBox="0 0 48 48" className="w-10 h-10">
          <rect x="14" y="26" width="20" height="12" rx="2" fill="#1B2730" stroke="#A8B6C2" strokeWidth="2" />
          <polygon points="18,10 22,24 14,24" fill="#D94F59" stroke="#101820" strokeWidth="1" />
          <polygon points="30,10 34,24 26,24" fill="#D94F59" stroke="#101820" strokeWidth="1" />
          <circle cx="24" cy="26" r="4" fill="#2c3e50" />
        </svg>
      );
    case 'defense_wall':
      return (
        <svg viewBox="0 0 48 48" className="w-10 h-10">
          <rect x="4" y="18" width="40" height="16" rx="2" fill="#2c3e50" stroke="#A8B6C2" strokeWidth="2" />
          <rect x="8" y="14" width="8" height="6" fill="#1B2730" stroke="#A8B6C2" strokeWidth="1" />
          <rect x="20" y="14" width="8" height="6" fill="#1B2730" stroke="#A8B6C2" strokeWidth="1" />
          <rect x="32" y="14" width="8" height="6" fill="#1B2730" stroke="#A8B6C2" strokeWidth="1" />
          <line x1="6" y1="26" x2="42" y2="26" stroke="#E5A93D" strokeWidth="1.5" strokeDasharray="3,3" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 48 48" className="w-10 h-10">
          <polygon points="10,20 24,12 38,20 38,36 10,36" fill="#1B2730" stroke="#2FB68A" strokeWidth="2" />
        </svg>
      );
  }
};

// SVG Thumbnails for Units
const renderUnitThumbnail = (type: UnitType) => {
  const isInfantry = ['rifleman', 'heavy_gunner', 'sniper', 'medic', 'engineer', 'rocket_soldier', 'commando', 'scout', 'flamethrower', 'grenadier'].includes(type);
  const isTank = ['light_tank', 'main_battle_tank', 'heavy_tank', 'siege_tank'].includes(type);
  const isAir = ['chopper', 'attack_chopper', 'fighter', 'bomber', 'drone'].includes(type);

  if (isInfantry) {
    return (
      <svg viewBox="0 0 32 32" className="w-6 h-6">
        <circle cx="16" cy="10" r="4" fill="#F1F5F7" />
        <rect x="12" y="15" width="8" height="10" rx="2" fill="#2FB68A" />
        <line x1="16" y1="17" x2="24" y2="17" stroke="#101820" strokeWidth="2" />
      </svg>
    );
  } else if (isTank) {
    return (
      <svg viewBox="0 0 32 32" className="w-6 h-6">
        <rect x="4" y="12" width="24" height="12" rx="3" fill="#1B2730" stroke="#2FB68A" strokeWidth="1.5" />
        <circle cx="16" cy="18" r="4.5" fill="#2FB68A" />
        <line x1="16" y1="18" x2="28" y2="18" stroke="#F1F5F7" strokeWidth="2" />
      </svg>
    );
  } else if (isAir) {
    return (
      <svg viewBox="0 0 32 32" className="w-6 h-6">
        <polygon points="16,6 26,24 16,20 6,24" fill="#4B91B5" stroke="#F1F5F7" strokeWidth="1" />
        <line x1="6" y1="12" x2="26" y2="12" stroke="#2FB68A" strokeWidth="1.5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 32 32" className="w-6 h-6">
      <rect x="6" y="10" width="20" height="14" rx="2" fill="#1B2730" stroke="#E5A93D" strokeWidth="1.5" />
      <circle cx="10" cy="25" r="2.5" fill="#F1F5F7" />
      <circle cx="22" cy="25" r="2.5" fill="#F1F5F7" />
    </svg>
  );
};

export const MobileBottomSheet: React.FC<MobileBottomSheetProps> = ({
  engine,
  selectedUnits,
  selectedBuilding,
  onStartBuildingPlacement,
  onCancelPlacement,
  onQueueUnit,
  onCancelQueue,
  onSelectSingleUnit,
  onFilterSelectionToType,
  onIssueUnitCommandType,
  onToggleRepair,
  onDemolish,
  onResearch,
  onTriggerNukeTargeting,
  onSetFormation,
  activeInteractionMode = 'NORMAL',
  onOpenAdvisor,
  onPreviewRecommendation,
  onSelectAllArmy,
  onSelectInfantry,
  onSelectTanks,
  onSelectAirUnits,
  onSelectSupportUnits,
  onSelectIdleUnits,
  onSelectCombatUnits,
  onClearSelection,
  onSelectDamagedUnits,
  onSelectSquad,
  onSaveSquad,
  controlGroups = {},
  onOpenSettings,
  onOpenSaveLoad,
  onToggleFullscreen,
  isFullscreen = false,
  onToggleMute,
  isMuted = false,
  onExitToMenu,
  onCenterHQ,
  onFitBase,
  onToggleFollow,
  isFollowing = false,
}) => {
  // Navigation State
  const [activeTab, setActiveTab] = useState<MobileTab>('build');
  const [sheetSnap, setSheetSnap] = useState<SheetSnapState>('collapsed');

  // --- Draggable sheet (Rule 6): live height while dragging, snap to collapsed / half / expanded ---
  const [vh, setVh] = useState<number>(typeof window !== 'undefined' ? window.innerHeight : 800);
  const [dragH, setDragH] = useState<number | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ y0: number; h0: number; t0: number; moved: boolean } | null>(null);
  React.useEffect(() => {
    const onResize = () => setVh(window.innerHeight);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);
  // The expanded sheet must stop below the top HUD and above the nav bar.
  const hudBottom = typeof document !== 'undefined' ? document.querySelector('header')?.getBoundingClientRect().bottom ?? 110 : 110;
  const NAV_H = 76;
  const fullPx = Math.max(160, Math.round(vh - hudBottom - NAV_H - 8));
  const halfPx = Math.min(fullPx, Math.max(170, Math.round(vh * 0.44)));

  const onHandleDown = (e: React.PointerEvent) => {
    const h0 = sheetRef.current?.getBoundingClientRect().height ?? halfPx;
    dragRef.current = { y0: e.clientY, h0, t0: performance.now(), moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onHandleMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dy = d.y0 - e.clientY;
    if (Math.abs(dy) > 4) d.moved = true;
    if (d.moved) setDragH(Math.max(60, Math.min(fullPx, d.h0 + dy)));
  };
  const onHandleUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (!d.moved) {
      // simple tap on the grabber: toggle between half and expanded
      setSheetSnap(prev => (prev === 'expanded' ? 'half' : 'expanded'));
      setDragH(null);
      return;
    }
    const dy = d.y0 - e.clientY;
    const velocity = dy / Math.max(1, performance.now() - d.t0); // px/ms, + = up
    const h = Math.max(0, Math.min(fullPx, d.h0 + dy)) + velocity * 120; // flick bias
    let next: SheetSnapState;
    if (h < 110) next = 'collapsed';
    else next = Math.abs(h - halfPx) <= Math.abs(h - fullPx) ? 'half' : 'expanded';
    setSheetSnap(next);
    setDragH(null);
  };


  // Subcategory filters
  const [buildCategory, setBuildCategory] = useState<BuildCategory>('economy');
  const [armySection, setArmySection] = useState<ArmySection>('units');
  const [showSecondaryUnitActions, setShowSecondaryUnitActions] = useState<boolean>(false);
  const [showAIActivityLog, setShowAIActivityLog] = useState<boolean>(false);

  // Haptic feedback trigger
  const triggerHaptic = useCallback(() => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(10);
      } catch {
        //
      }
    }
  }, []);

  // Safe tab switching
  const handleTabClick = (tab: MobileTab, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    triggerHaptic();

    if (tab === 'menu') {
      if (onOpenSettings) onOpenSettings();
      return;
    }

    if ((activeTab === 'build' || activeTab === 'defense') && tab !== activeTab) {
      if (onCancelPlacement) onCancelPlacement();
    }

    if (activeTab === tab) {
      // Toggle collapsed and half
      setSheetSnap(prev => (prev === 'collapsed' ? 'half' : 'collapsed'));
    } else {
      setActiveTab(tab);
      setSheetSnap('half');
    }
  };

  // Grouped unit types in current selection
  const selectedTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    selectedUnits.forEach(u => {
      counts[u.type] = (counts[u.type] || 0) + 1;
    });
    return Object.entries(counts);
  }, [selectedUnits]);

  // Categorized building catalog
  const allBuildingKeys = Object.keys(BUILDING_CONFIGS) as BuildingType[];
  const categorizedBuildings = useMemo(() => {
    return allBuildingKeys.filter(type => {
      if (type === 'headquarters') return false;
      const cfg = BUILDING_CONFIGS[type];

      if (activeTab === 'defense') {
        return ['turret_gun', 'turret_missile', 'turret_aa', 'heavy_turret', 'defense_wall', 'repair_bay'].includes(type);
      }

      switch (buildCategory) {
        case 'economy':
          return ['coin_generator', 'supply_depot'].includes(type);
        case 'power':
          return ['power_plant'].includes(type);
        case 'military':
          return ['barracks', 'vehicle_factory', 'airfield', 'helipad'].includes(type);
        case 'defense':
          return ['turret_gun', 'turret_missile', 'turret_aa', 'heavy_turret', 'defense_wall'].includes(type);
        case 'technology':
          return ['research_lab', 'radar_station'].includes(type);
        case 'infrastructure':
          return ['supply_depot', 'field_hospital', 'repair_bay'].includes(type);
        default:
          return true;
      }
    });
  }, [allBuildingKeys, buildCategory, activeTab]);

  // Player military production buildings
  const barracks = useMemo(() => engine.buildings.find(b => b.type === 'barracks' && b.faction === 'player' && b.hp > 0 && b.constructionProgress >= 1), [engine.buildings]);
  const vehicleFactory = useMemo(() => engine.buildings.find(b => b.type === 'vehicle_factory' && b.faction === 'player' && b.hp > 0 && b.constructionProgress >= 1), [engine.buildings]);
  const airfield = useMemo(() => engine.buildings.find(b => (b.type === 'airfield' || b.type === 'helipad') && b.faction === 'player' && b.hp > 0 && b.constructionProgress >= 1), [engine.buildings]);

  // Unit recruitment handler
  const handleRecruitUnit = (unitType: UnitType, count: number = 1) => {
    triggerHaptic();
    const config = UNIT_CONFIGS[unitType];

    let targetBuilding: Building | undefined;
    if (config.requiredBuilding === 'barracks') targetBuilding = barracks;
    else if (config.requiredBuilding === 'vehicle_factory') targetBuilding = vehicleFactory;
    else if (config.requiredBuilding === 'airfield' || config.requiredBuilding === 'helipad') targetBuilding = airfield;
    else targetBuilding = barracks;

    if (!targetBuilding) {
      // Missing facility! Trigger placement shortcut
      if (config.requiredBuilding) {
        onStartBuildingPlacement(config.requiredBuilding as BuildingType);
        setSheetSnap('collapsed');
      }
      return;
    }

    for (let i = 0; i < count; i++) {
      if (engine.economy.credits < config.cost || engine.economy.population >= engine.economy.populationCap) break;
      onQueueUnit(targetBuilding.id, unitType);
    }
  };

  // Recruit-able unit list
  const allUnitTypes = Object.keys(UNIT_CONFIGS) as UnitType[];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 pointer-events-auto select-none">
      {/* 1. SELECTED UNITS COMMAND DOCK (Matching Reference Screenshot c7b881fb) */}
      {selectedUnits.length > 0 && (
        <div className="mx-auto w-[min(calc(100vw-12px),580px)] mb-1 bg-[#101820]/95 backdrop-blur-md border border-[#2FB68A]/60 rounded-2xl p-2 shadow-2xl animate-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-[#1B2730] text-xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-2 h-2 rounded-full bg-[#2FB68A] animate-pulse" />
              <span className="font-display font-bold text-xs tracking-wider text-[#F1F5F7] uppercase truncate">
                SELECTED: {selectedUnits.length} UNITS
              </span>
            </div>

            {/* Quick Formation / Squad shortcuts */}
            <div className="flex items-center gap-1 shrink-0 text-[10px]">
              <button
                onClick={() => onSetFormation('wedge')}
                className="px-2 py-0.5 rounded-lg bg-[#1B2730] hover:bg-[#22323e] text-[#4B91B5] font-bold"
              >
                WEDGE
              </button>
              <button
                onClick={() => onSetFormation('line')}
                className="px-2 py-0.5 rounded-lg bg-[#1B2730] hover:bg-[#22323e] text-[#4B91B5] font-bold"
              >
                LINE
              </button>
            </div>
          </div>

          {/* One-tap selection filters (existing unit categories only) */}
          <div className="flex items-center gap-1 pt-1.5 overflow-x-auto no-scrollbar" role="group" aria-label="Selection filters" data-testid="selection-filters">
            {([
              ['All', onSelectAllArmy], ['Idle', onSelectIdleUnits], ['Combat', onSelectCombatUnits],
              ['Infantry', onSelectInfantry], ['Vehicles', onSelectTanks], ['Aircraft', onSelectAirUnits], ['Clear', onClearSelection],
            ] as [string, (() => void) | undefined][]).filter(([, fn]) => fn).map(([label, fn]) => (
              <button
                key={label}
                onClick={() => { triggerHaptic(); fn!(); }}
                className={`shrink-0 px-2.5 h-8 rounded-lg text-[10px] font-bold border active:scale-95 ${
                  label === 'Clear' ? 'bg-[#F06470]/15 border-[#F06470]/50 text-[#F06470]' : 'bg-[#1B2730] border-[#2c3e50] text-[#F1F5F7]'
                }`}
              >
                {label === 'All' ? 'Select All' : label === 'Clear' ? 'Clear Selection' : label}
              </button>
            ))}
          </div>

          {/* Unit Breakdown Chips Row & Primary Actions */}
          <div className="flex items-center justify-between gap-1.5 pt-1.5 overflow-x-auto no-scrollbar">
            {/* Filter Chips by Type */}
            <div className="flex items-center gap-1 min-w-0 overflow-x-auto no-scrollbar">
              {selectedTypeCounts.map(([type, count]) => {
                const cfg = UNIT_CONFIGS[type as UnitType];
                return (
                  <button
                    key={type}
                    onClick={() => {
                      triggerHaptic();
                      if (onFilterSelectionToType) onFilterSelectionToType(type);
                    }}
                    className="flex items-center gap-1 px-2 py-1 rounded-xl bg-[#1B2730] hover:bg-[#22323e] border border-[#2c3e50] text-[#F1F5F7] active:scale-95 transition-all shrink-0 min-h-[38px]"
                    title={`Select all ${cfg?.name || type}`}
                  >
                    {renderUnitThumbnail(type as UnitType)}
                    <span className="font-bold text-xs font-mono-numbers">x{count}</span>
                  </button>
                );
              })}
            </div>

            {/* 3 Large Action Buttons: MOVE | ATTACK | DEFEND */}
            <div className="flex items-center gap-1 shrink-0">
              {/* MOVE */}
              <button
                onClick={() => {
                  triggerHaptic();
                  onIssueUnitCommandType('move');
                }}
                className={`flex items-center justify-center gap-1 h-9 px-3 rounded-xl font-display font-bold text-xs tracking-wider transition-all min-h-[38px] ${
                  activeInteractionMode === 'MOVE_TARGET'
                    ? 'bg-[#2FB68A] text-[#101820] shadow-md shadow-[#2FB68A]/30'
                    : 'bg-[#1B2730] hover:bg-[#22323e] text-[#2FB68A] border border-[#2FB68A]/40'
                }`}
              >
                <Navigation className="w-3.5 h-3.5" />
                <span>MOVE</span>
              </button>

              {/* ATTACK */}
              <button
                onClick={() => {
                  triggerHaptic();
                  onIssueUnitCommandType('attack');
                }}
                className={`flex items-center justify-center gap-1 h-9 px-3 rounded-xl font-display font-bold text-xs tracking-wider transition-all min-h-[38px] ${
                  activeInteractionMode === 'ATTACK_TARGET'
                    ? 'bg-[#D94F59] text-white shadow-md shadow-[#D94F59]/30'
                    : 'bg-[#1B2730] hover:bg-[#22323e] text-[#D94F59] border border-[#D94F59]/40'
                }`}
              >
                <Sword className="w-3.5 h-3.5" />
                <span>ATTACK</span>
              </button>

              {/* DEFEND */}
              <button
                onClick={() => {
                  triggerHaptic();
                  onIssueUnitCommandType('defend');
                }}
                className="flex items-center justify-center gap-1 h-9 px-2.5 rounded-xl bg-[#1B2730] hover:bg-[#22323e] text-[#4B91B5] border border-[#4B91B5]/40 font-display font-bold text-xs tracking-wider transition-all min-h-[38px]"
              >
                <Shield className="w-3.5 h-3.5" />
                <span>DEFEND</span>
              </button>

              {/* MORE COMMANDS POPUP */}
              <div className="relative">
                <button
                  onClick={() => setShowSecondaryUnitActions(p => !p)}
                  className="w-9 h-9 rounded-xl bg-[#1B2730] hover:bg-[#22323e] text-[#A8B6C2] border border-[#2c3e50] flex items-center justify-center"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>

                {showSecondaryUnitActions && (
                  <div className="absolute bottom-11 right-0 w-36 bg-[#101820] border border-[#2c3e50] rounded-xl p-1.5 shadow-2xl flex flex-col gap-1 z-50 text-[11px] font-bold">
                    <button
                      onClick={() => {
                        onIssueUnitCommandType('stop');
                        setShowSecondaryUnitActions(false);
                      }}
                      className="px-2 py-1.5 rounded-lg text-left text-[#A8B6C2] hover:bg-[#1B2730] hover:text-white"
                    >
                      STOP
                    </button>
                    <button
                      onClick={() => {
                        onIssueUnitCommandType('hold');
                        setShowSecondaryUnitActions(false);
                      }}
                      className="px-2 py-1.5 rounded-lg text-left text-[#A8B6C2] hover:bg-[#1B2730] hover:text-white"
                    >
                      HOLD POSITION
                    </button>
                    <button
                      onClick={() => {
                        onIssueUnitCommandType('retreat');
                        setShowSecondaryUnitActions(false);
                      }}
                      className="px-2 py-1.5 rounded-lg text-left text-[#E5A93D] hover:bg-[#1B2730]"
                    >
                      RETREAT TO BASE
                    </button>
                    <button
                      onClick={() => {
                        onIssueUnitCommandType('patrol');
                        setShowSecondaryUnitActions(false);
                      }}
                      className="px-2 py-1.5 rounded-lg text-left text-[#4B91B5] hover:bg-[#1B2730]"
                    >
                      PATROL
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. SLIDE-UP DRAWER FOR BUILD / ARMY / DEFENSE / AI */}
      {sheetSnap !== 'collapsed' && (
        <div
          ref={sheetRef}
          data-testid="bottom-sheet"
          data-snap={sheetSnap}
          style={
            dragH != null
              ? { height: dragH }
              : sheetSnap === 'expanded'
              ? { height: fullPx, transition: 'height 220ms cubic-bezier(.2,.8,.2,1)' }
              : { maxHeight: halfPx, transition: 'max-height 220ms cubic-bezier(.2,.8,.2,1)' }
          }
          className="mx-auto w-[min(calc(100vw-8px),640px)] mb-1 bg-[#131F2D]/95 backdrop-blur-md border border-[#2a3b4f] rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-200 flex flex-col"
        >
          {/* Drag handle: drag to resize, release to snap; tap toggles half/expanded */}
          <div
            role="separator"
            aria-label="Drag to resize panel"
            onPointerDown={onHandleDown}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onPointerCancel={onHandleUp}
            className="h-6 shrink-0 flex items-center justify-center cursor-grab touch-none bg-[#16212c]"
          >
            <span className="w-10 h-1.5 rounded-full bg-[#3a4d63]" />
          </div>
          {/* Drawer Top Header Bar */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#1B2730] bg-[#16212c]">
            <div className="flex items-center gap-2">
              {activeTab === 'build' && <Hammer className="w-4 h-4 text-[#2FB68A]" />}
              {activeTab === 'army' && <Users className="w-4 h-4 text-[#2FB68A]" />}
              {activeTab === 'defense' && <Shield className="w-4 h-4 text-[#2FB68A]" />}
              {activeTab === 'ai' && <Brain className="w-4 h-4 text-[#2FB68A]" />}
              <span className="font-display font-bold text-sm tracking-wide uppercase text-[#F1F5F7]">
                {activeTab === 'build' ? 'CONSTRUCTION CATALOG' : activeTab === 'army' ? 'MILITARY FORCES' : activeTab === 'defense' ? 'DEFENSIVE STRUCTURES' : 'TACTICAL AI COMMAND'}
              </span>
            </div>

            <button
              onClick={() => setSheetSnap('collapsed')}
              className="p-1 rounded-lg text-[#A8B6C2] hover:text-[#F1F5F7] hover:bg-[#1B2730]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Drawer Scrollable Content Body */}
          <div className="p-2.5 overflow-y-auto space-y-2 flex-1">
            {/* --- TAB A: BUILD SYSTEM --- */}
            {activeTab === 'build' && (
              <div className="space-y-2">
                {/* Categories Tab Strip */}
                <div className="grid grid-cols-3 min-[520px]:grid-cols-6 gap-1 text-[10px] font-bold">
                  {(
                    [
                      { id: 'economy', label: 'ECONOMY' },
                      { id: 'power', label: 'POWER' },
                      { id: 'military', label: 'MILITARY' },
                      { id: 'defense', label: 'DEFENSE' },
                      { id: 'technology', label: 'TECH' },
                      { id: 'infrastructure', label: 'INFRA' },
                    ] as { id: BuildCategory; label: string }[]
                  ).map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => {
                        triggerHaptic();
                        setBuildCategory(cat.id);
                      }}
                      title={cat.id}
                      className={`px-1 h-9 rounded-xl uppercase truncate transition-all ${
                        buildCategory === cat.id
                          ? 'bg-[#2FB68A] text-[#101820] font-bold shadow-md shadow-[#2FB68A]/20'
                          : 'bg-[#1B2730] text-[#A8B6C2] hover:text-white'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                {/* Building Cards Horizontal List / Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {categorizedBuildings.map(type => {
                    const cfg = BUILDING_CONFIGS[type];
                    const canAfford = engine.economy.credits >= cfg.cost;
                    const powerDelta = (cfg.powerProduced || 0) - (cfg.powerConsumed || 0);

                    return (
                      <div
                        key={type}
                        className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-all ${
                          canAfford
                            ? 'bg-[#1B2730] border-[#2c3e50] hover:border-[#2FB68A]/60'
                            : 'bg-[#101820] border-[#1B2730] opacity-60'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-12 h-12 rounded-xl bg-[#101820] border border-[#2c3e50] flex items-center justify-center shrink-0">
                            {renderBuildingThumbnail(type)}
                          </div>
                          <div className="min-w-0">
                            <span className="font-display font-bold text-xs text-[#F1F5F7] block leading-tight break-words">
                              {cfg.name}
                            </span>
                            <div className="flex items-center gap-2 text-[10px] mt-0.5">
                              <span className="text-[#E5A93D] font-bold">${cfg.cost}</span>
                              <span
                                className={`font-bold ${
                                  powerDelta >= 0 ? 'text-[#2FB68A]' : 'text-[#E5A93D]'
                                }`}
                              >
                                {powerDelta >= 0 ? `+${powerDelta}` : `${powerDelta}`} GW
                              </span>
                              <span className="text-[#A8B6C2]">{cfg.buildTime}s</span>
                            </div>
                          </div>
                        </div>

                        {/* Direct Deploy Action */}
                        <button
                          onClick={() => {
                            triggerHaptic();
                            onStartBuildingPlacement(type);
                            setSheetSnap('collapsed');
                          }}
                          disabled={!canAfford}
                          className={`px-3 py-2 rounded-xl font-display font-bold text-xs uppercase flex items-center gap-1 shrink-0 transition-transform active:scale-95 ${
                            canAfford
                              ? 'bg-[#2FB68A] text-[#101820] hover:bg-[#38c999] shadow-md shadow-[#2FB68A]/25'
                              : 'bg-[#101820] text-[#A8B6C2]/40 border border-[#2c3e50]/40 cursor-not-allowed'
                          }`}
                        >
                          <Hammer className="w-3.5 h-3.5" />
                          <span>DEPLOY</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* --- TAB B: ARMY & RECRUITMENT --- */}
            {activeTab === 'army' && (
              <div className="space-y-2.5">
                {/* 2 Clear Sections: Units & Squads vs Recruitment */}
                <div className="flex items-center gap-1 p-1 bg-[#101820] rounded-xl border border-[#1B2730] text-xs font-bold">
                  <button
                    onClick={() => {
                      triggerHaptic();
                      setArmySection('units');
                    }}
                    className={`flex-1 py-1.5 rounded-lg transition-all text-center ${
                      armySection === 'units'
                        ? 'bg-[#2FB68A] text-[#101820] shadow-sm'
                        : 'text-[#A8B6C2] hover:text-white'
                    }`}
                  >
                    UNITS & SQUADS
                  </button>
                  <button
                    onClick={() => {
                      triggerHaptic();
                      setArmySection('recruitment');
                    }}
                    className={`flex-1 py-1.5 rounded-lg transition-all text-center ${
                      armySection === 'recruitment'
                        ? 'bg-[#2FB68A] text-[#101820] shadow-sm'
                        : 'text-[#A8B6C2] hover:text-white'
                    }`}
                  >
                    RECRUITMENT
                  </button>
                </div>

                {armySection === 'units' ? (
                  <div className="space-y-2">
                    {/* Quick Selection Filter Bar */}
                    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar text-[10px] font-bold">
                      <button
                        onClick={onSelectAllArmy}
                        className="px-2.5 py-1 rounded-lg bg-[#1B2730] hover:bg-[#22323e] text-[#F1F5F7] shrink-0"
                      >
                        ALL ({engine.units.filter(u => u.faction === 'player' && u.hp > 0).length})
                      </button>
                      <button
                        onClick={onSelectInfantry}
                        className="px-2.5 py-1 rounded-lg bg-[#1B2730] hover:bg-[#22323e] text-[#2FB68A] shrink-0"
                      >
                        INFANTRY
                      </button>
                      <button
                        onClick={onSelectTanks}
                        className="px-2.5 py-1 rounded-lg bg-[#1B2730] hover:bg-[#22323e] text-[#E5A93D] shrink-0"
                      >
                        ARMOR
                      </button>
                      <button
                        onClick={onSelectAirUnits}
                        className="px-2.5 py-1 rounded-lg bg-[#1B2730] hover:bg-[#22323e] text-[#4B91B5] shrink-0"
                      >
                        AIR
                      </button>
                    </div>

                    {/* Squad Assignment Strip */}
                    <div className="grid grid-cols-3 gap-1.5 p-2 bg-[#1B2730] rounded-xl border border-[#2c3e50] text-[11px]">
                      {[1, 2, 3].map(sq => (
                        <div key={sq} className="flex flex-col gap-1">
                          <button
                            onClick={() => onSelectSquad && onSelectSquad(sq)}
                            className="py-1 px-2 rounded-lg bg-[#101820] hover:bg-[#16212c] text-[#2FB68A] font-bold text-center"
                          >
                            SQUAD {sq} ({(controlGroups[sq] || []).length})
                          </button>
                          {selectedUnits.length > 0 && onSaveSquad && (
                            <button
                              onClick={() => onSaveSquad(sq)}
                              className="py-0.5 rounded bg-[#2FB68A]/20 hover:bg-[#2FB68A] hover:text-[#101820] text-[#2FB68A] text-[9px] font-bold text-center"
                            >
                              BIND ({selectedUnits.length})
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Active Troops List */}
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {engine.units
                        .filter(u => u.faction === 'player' && u.hp > 0)
                        .map(u => {
                          const cfg = UNIT_CONFIGS[u.type];
                          return (
                            <div
                              key={u.id}
                              onClick={() => onSelectSingleUnit(u.id)}
                              className={`p-2 rounded-xl border flex items-center justify-between text-xs cursor-pointer transition-colors ${
                                u.selected
                                  ? 'bg-[#2FB68A]/15 border-[#2FB68A]'
                                  : 'bg-[#1B2730] border-[#2c3e50] hover:bg-[#22323e]'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                {renderUnitThumbnail(u.type)}
                                <div className="flex flex-col">
                                  <span className="font-bold text-[#F1F5F7]">{cfg.name}</span>
                                  <span className="text-[10px] text-[#A8B6C2]">
                                    {getUnitStatusText(u.command, u.isMoving, !!u.targetUnitId || !!u.targetBuildingId)}
                                  </span>
                                </div>
                              </div>
                              <span
                                className="font-bold font-mono-numbers text-xs"
                                style={{ color: getHpColor(u.hp, u.maxHp) }}
                              >
                                {formatHp(u.hp, u.maxHp)}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                ) : (
                  /* Recruitment Catalog */
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {allUnitTypes.map(unitType => {
                      const cfg = UNIT_CONFIGS[unitType];
                      const canAfford = engine.economy.credits >= cfg.cost;
                      const hasPop = engine.economy.population < engine.economy.populationCap;

                      // Check facility status
                      let hasFacility = false;
                      let facilityName = 'Barracks';
                      if (cfg.requiredBuilding === 'barracks') {
                        hasFacility = !!barracks;
                        facilityName = 'Barracks';
                      } else if (cfg.requiredBuilding === 'vehicle_factory') {
                        hasFacility = !!vehicleFactory;
                        facilityName = 'War Factory';
                      } else if (cfg.requiredBuilding === 'airfield' || cfg.requiredBuilding === 'helipad') {
                        hasFacility = !!airfield;
                        facilityName = 'Airfield';
                      } else {
                        hasFacility = !!barracks;
                      }

                      // Current deployed count
                      const currentCount = engine.units.filter(u => u.type === unitType && u.faction === 'player' && u.hp > 0).length;

                      return (
                        <div
                          key={unitType}
                          className="p-2.5 rounded-xl border bg-[#1B2730] border-[#2c3e50] flex flex-col justify-between gap-1.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              {renderUnitThumbnail(unitType)}
                              <div>
                                <span className="font-display font-bold text-xs text-[#F1F5F7] block leading-tight">
                                  {cfg.name}
                                </span>
                                <div className="flex items-center gap-1.5 text-[10px] mt-0.5">
                                  <span className="text-[#E5A93D] font-bold">${cfg.cost}</span>
                                  <span className="text-[#A8B6C2]">{cfg.trainTime}s</span>
                                  <span className="text-[#2FB68A]">HP {cfg.maxHp}</span>
                                </div>
                              </div>
                            </div>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#101820] text-[#A8B6C2]">
                              x{currentCount}
                            </span>
                          </div>

                          {/* Action Buttons or Facility Missing Shortcut */}
                          {!hasFacility ? (
                            <button
                              onClick={() => {
                                triggerHaptic();
                                if (cfg.requiredBuilding) {
                                  onStartBuildingPlacement(cfg.requiredBuilding as BuildingType);
                                  setSheetSnap('collapsed');
                                }
                              }}
                              className="w-full py-1.5 rounded-lg bg-[#E5A93D]/20 hover:bg-[#E5A93D]/30 border border-[#E5A93D]/50 text-[#E5A93D] text-[10px] font-bold flex items-center justify-center gap-1"
                            >
                              <Hammer className="w-3 h-3" />
                              <span>BUILD {facilityName.toUpperCase()}</span>
                            </button>
                          ) : (
                            <div className="flex items-center gap-1 pt-1 border-t border-[#2c3e50]">
                              <button
                                onClick={() => handleRecruitUnit(unitType, 1)}
                                disabled={!canAfford || !hasPop}
                                className={`flex-1 py-1 rounded-lg font-bold text-[11px] ${
                                  canAfford && hasPop
                                    ? 'bg-[#2FB68A] text-[#101820] hover:bg-[#38c999] active:scale-95'
                                    : 'bg-[#101820] text-[#A8B6C2]/40 cursor-not-allowed'
                                }`}
                              >
                                +1
                              </button>
                              <button
                                onClick={() => handleRecruitUnit(unitType, 5)}
                                disabled={!canAfford || !hasPop}
                                className={`flex-1 py-1 rounded-lg font-bold text-[11px] ${
                                  canAfford && hasPop
                                    ? 'bg-[#101820] text-[#2FB68A] border border-[#2FB68A]/40 hover:bg-[#22323e] active:scale-95'
                                    : 'bg-[#101820] text-[#A8B6C2]/40 border border-[#2c3e50]/40 cursor-not-allowed'
                                }`}
                              >
                                +5
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* --- TAB C: DEFENSE --- */}
            {activeTab === 'defense' && (
              <div className="space-y-2">
                <p className="text-[11px] text-[#A8B6C2]">
                  Fortified defensive turrets, missile batteries, and perimeter barricades.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {categorizedBuildings.map(type => {
                    const cfg = BUILDING_CONFIGS[type];
                    const canAfford = engine.economy.credits >= cfg.cost;
                    return (
                      <div
                        key={type}
                        className="p-2.5 rounded-xl border bg-[#1B2730] border-[#2c3e50] flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {renderBuildingThumbnail(type)}
                          <div className="min-w-0">
                            <span className="font-display font-bold text-xs text-[#F1F5F7] block leading-tight break-words">
                              {cfg.name}
                            </span>
                            <div className="flex items-center gap-1.5 text-[10px] mt-0.5">
                              <span className="text-[#E5A93D] font-bold">${cfg.cost}</span>
                              <span className="text-[#A8B6C2]">Range {cfg.range || 240}</span>
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            triggerHaptic();
                            onStartBuildingPlacement(type);
                            setSheetSnap('collapsed');
                          }}
                          disabled={!canAfford}
                          className={`px-3 py-1.5 rounded-xl font-display font-bold text-xs ${
                            canAfford
                              ? 'bg-[#2FB68A] text-[#101820] hover:bg-[#38c999] active:scale-95'
                              : 'bg-[#101820] text-[#A8B6C2]/40 cursor-not-allowed'
                          }`}
                        >
                          DEPLOY
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* --- TAB D: AI MANAGERS (wired to engine.getAIModules / toggleAIModule) --- */}
            {activeTab === 'ai' && (
              <div className="space-y-2">
                <ConstructionAIPanel engine={engine} onHaptic={triggerHaptic} />
                <SmartRecruitmentCard engine={engine} onHaptic={triggerHaptic} />
                <AiManagerCards engine={engine} onHaptic={triggerHaptic} onOpenAdvisor={onOpenAdvisor} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. PERMANENT 5-BUTTON MOBILE RTS DOCK (BUILD | ARMY | DEFENSE | AI | MENU) */}
      <nav
        aria-label="Tactical Command Bar"
        className="bg-[#101820]/95 backdrop-blur-md border-t border-[#1B2730] pb-safe px-2 py-1.5"
      >
        <div className="max-w-xl mx-auto grid grid-cols-5 gap-1">
          {/* BUILD */}
          <button
            onClick={e => handleTabClick('build', e)}
            className={`flex flex-col items-center justify-center gap-1 h-12 rounded-xl transition-all min-h-[48px] ${
              activeTab === 'build' && sheetSnap !== 'collapsed'
                ? 'bg-[#2FB68A]/20 text-[#2FB68A] border border-[#2FB68A]/60 shadow-lg shadow-[#2FB68A]/15'
                : 'text-[#A8B6C2] hover:text-[#F1F5F7] active:bg-[#1B2730]'
            }`}
          >
            <Hammer className="w-4 h-4 stroke-[2.2]" />
            <span className="text-[10px] font-display font-bold tracking-wider">BUILD</span>
          </button>

          {/* ARMY */}
          <button
            onClick={e => handleTabClick('army', e)}
            className={`flex flex-col items-center justify-center gap-1 h-12 rounded-xl transition-all min-h-[48px] ${
              activeTab === 'army' && sheetSnap !== 'collapsed'
                ? 'bg-[#2FB68A]/20 text-[#2FB68A] border border-[#2FB68A]/60 shadow-lg shadow-[#2FB68A]/15'
                : 'text-[#A8B6C2] hover:text-[#F1F5F7] active:bg-[#1B2730]'
            }`}
          >
            <Users className="w-4 h-4 stroke-[2.2]" />
            <span className="text-[10px] font-display font-bold tracking-wider">ARMY</span>
          </button>

          {/* DEFENSE */}
          <button
            onClick={e => handleTabClick('defense', e)}
            className={`flex flex-col items-center justify-center gap-1 h-12 rounded-xl transition-all min-h-[48px] ${
              activeTab === 'defense' && sheetSnap !== 'collapsed'
                ? 'bg-[#2FB68A]/20 text-[#2FB68A] border border-[#2FB68A]/60 shadow-lg shadow-[#2FB68A]/15'
                : 'text-[#A8B6C2] hover:text-[#F1F5F7] active:bg-[#1B2730]'
            }`}
          >
            <Shield className="w-4 h-4 stroke-[2.2]" />
            <span className="text-[10px] font-display font-bold tracking-wider">DEFENSE</span>
          </button>

          {/* AI */}
          <button
            onClick={e => handleTabClick('ai', e)}
            className={`flex flex-col items-center justify-center gap-1 h-12 rounded-xl transition-all min-h-[48px] ${
              activeTab === 'ai' && sheetSnap !== 'collapsed'
                ? 'bg-[#2FB68A]/20 text-[#2FB68A] border border-[#2FB68A]/60 shadow-lg shadow-[#2FB68A]/15'
                : 'text-[#A8B6C2] hover:text-[#F1F5F7] active:bg-[#1B2730]'
            }`}
          >
            <Brain className="w-4 h-4 stroke-[2.2]" />
            <span className="text-[10px] font-display font-bold tracking-wider">AI</span>
          </button>

          {/* MENU */}
          <button
            onClick={e => handleTabClick('menu', e)}
            className="flex flex-col items-center justify-center gap-1 h-12 rounded-xl transition-all min-h-[48px] text-[#A8B6C2] hover:text-[#F1F5F7] active:bg-[#1B2730]"
          >
            <MenuIcon className="w-4 h-4 stroke-[2.2]" />
            <span className="text-[10px] font-display font-bold tracking-wider">MORE</span>
          </button>
        </div>
      </nav>
    </div>
  );
};
