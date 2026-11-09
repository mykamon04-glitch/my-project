/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Users, Shield, Plane, AlertTriangle, Layers, Navigation, CheckSquare } from 'lucide-react';
import { GameEngine } from '../game/engine';

interface SquadBarProps {
  engine: GameEngine;
  onSelectAllArmy: () => void;
  onSelectInfantry: () => void;
  onSelectTanks: () => void;
  onSelectAirUnits: () => void;
  onSelectIdleUnits: () => void;
  onSelectDamagedUnits: () => void;
  onClearSelection: () => void;
  onSelectGroup: (groupIndex: number) => void;
  onAssignGroup: (groupIndex: number) => void;
  isTouchMultiSelect: boolean;
  onToggleTouchMultiSelect: () => void;
  activeInteractionMode?: 'NORMAL' | 'MOVE_TARGET' | 'ATTACK_TARGET' | 'BOX_SELECT';
  onToggleMoveMode?: () => void;
  hasSelection?: boolean;
}

export const SquadBar: React.FC<SquadBarProps> = ({
  engine,
  onSelectAllArmy,
  onSelectInfantry,
  onSelectTanks,
  onSelectAirUnits,
  onSelectIdleUnits,
  onSelectDamagedUnits,
  onClearSelection,
  onSelectGroup,
  onAssignGroup,
  isTouchMultiSelect,
  onToggleTouchMultiSelect,
  activeInteractionMode = 'NORMAL',
  onToggleMoveMode,
  hasSelection = false,
}) => {
  const groups = [1, 2, 3, 4, 5];
  const [isMinimized, setIsMinimized] = React.useState<boolean>(false);

  if (isMinimized) {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        className="fixed top-24 left-2 z-20 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0d141d]/95 backdrop-blur-md border border-[#1C2933] text-[#38B98A] text-xs font-mono font-bold shadow-lg"
      >
        <Users className="w-4 h-4" />
        <span>SQUADS</span>
      </button>
    );
  }

  return (
    <div className="fixed top-24 left-2 z-20 flex items-center gap-1.5 select-none bg-[#0d141d]/95 backdrop-blur-md p-1.5 rounded-lg border border-[#1C2933] shadow-xl text-xs overflow-x-auto max-w-[calc(100vw-110px)] sm:max-w-xl">
      <button
        onClick={() => setIsMinimized(true)}
        title="Minimize Squad Bar"
        className="p-1 rounded bg-[#16212c] text-[#A9B8C5] hover:text-white shrink-0"
      >
        ✕
      </button>
      {/* Touch Move Order Mode (Instant tap-to-move for touch/mobile devices) */}
      {hasSelection && onToggleMoveMode && (
        <button
          onClick={onToggleMoveMode}
          title="Move Mode: Tap anywhere on map to order selected troops"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono font-bold transition-all min-h-[40px] shrink-0 ${
            activeInteractionMode === 'MOVE_TARGET'
              ? 'bg-[#38B98A] text-[#101820] shadow-md animate-pulse'
              : 'bg-[#173A32] text-[#38B98A] border border-[#38B98A]/50 hover:bg-[#38B98A]/20'
          }`}
        >
          <Navigation className="w-4 h-4" />
          <span>{activeInteractionMode === 'MOVE_TARGET' ? 'ORDERING MOVE...' : 'MOVE ORDER'}</span>
        </button>
      )}

      {/* Multi-Select Toggle */}
      <button
        onClick={onToggleTouchMultiSelect}
        title="Toggle Multi-Select Mode (Tap multiple units to group)"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-mono font-bold transition-colors min-h-[40px] shrink-0 ${
          isTouchMultiSelect
            ? 'bg-[#F2B84B] text-[#101820] border border-[#F2B84B]'
            : 'bg-[#1C2933] hover:bg-[#173A32] text-[#A9B8C5] border border-[#1C2933]'
        }`}
      >
        <CheckSquare className="w-4 h-4" />
        <span className="hidden sm:inline">MULTI:</span>
        <span>{isTouchMultiSelect ? 'ON' : 'OFF'}</span>
      </button>

      <div className="h-5 w-px bg-[#1C2933] mx-0.5 shrink-0" />

      {/* Select All Military Troops */}
      <button
        onClick={onSelectAllArmy}
        title="Select Entire Army (All Friendly Units)"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[#173A32] hover:bg-[#38B98A]/25 border border-[#38B98A]/60 font-mono text-[#38B98A] font-bold transition-colors min-h-[40px] shrink-0 shadow-sm"
      >
        <Users className="w-4 h-4" />
        <span>ALL UNITS</span>
      </button>

      {/* Select All Infantry */}
      <button
        onClick={onSelectInfantry}
        title="Select All Infantry Soldiers"
        className="hidden sm:flex items-center gap-1 px-2 py-1.5 rounded bg-[#1C2933] hover:bg-[#173A32] border border-[#1C2933] font-mono text-[#A9B8C5] hover:text-[#F4F7FA] font-bold transition-colors min-h-[40px] shrink-0"
      >
        <span>INF</span>
      </button>

      {/* Select All Tanks */}
      <button
        onClick={onSelectTanks}
        title="Select All Armored Vehicles / Tanks"
        className="hidden sm:flex items-center gap-1 px-2 py-1.5 rounded bg-[#1C2933] hover:bg-[#173A32] border border-[#1C2933] font-mono text-[#36C9E8] font-bold transition-colors min-h-[40px] shrink-0"
      >
        <span>TANKS</span>
      </button>

      {/* Select Air Units */}
      <button
        onClick={onSelectAirUnits}
        title="Select Air Squadrons"
        className="hidden md:flex items-center gap-1 px-2 py-1.5 rounded bg-[#1C2933] hover:bg-[#173A32] border border-[#1C2933] font-mono text-[#36C9E8] font-bold transition-colors min-h-[40px] shrink-0"
      >
        <Plane className="w-3.5 h-3.5" />
        <span>AIR</span>
      </button>

      {/* Select Idle Troops */}
      <button
        onClick={onSelectIdleUnits}
        title="Select Idle Troops"
        className="flex items-center gap-1 px-2 py-1.5 rounded bg-[#1C2933] hover:bg-[#173A32] border border-[#1C2933] font-mono text-[#F2B84B] font-bold transition-colors min-h-[40px] shrink-0"
      >
        <Shield className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">IDLE</span>
      </button>

      {/* Select Damaged Troops */}
      <button
        onClick={onSelectDamagedUnits}
        title="Select Wounded / Damaged Troops"
        className="hidden lg:flex items-center gap-1 px-2 py-1.5 rounded bg-[#1C2933] hover:bg-[#173A32] border border-[#1C2933] font-mono text-[#E45B63] font-bold transition-colors min-h-[40px] shrink-0"
      >
        <AlertTriangle className="w-3.5 h-3.5" />
        <span>DAMAGED</span>
      </button>

      {/* Clear Selection */}
      {hasSelection && (
        <button
          onClick={onClearSelection}
          title="Deselect All Active Units / Structures"
          className="flex items-center gap-1 px-2 py-1.5 rounded bg-[#1C2933] hover:bg-rose-950/40 border border-[#1C2933] font-mono text-[#E45B63] font-bold transition-colors min-h-[40px] shrink-0"
        >
          <span>CLEAR</span>
        </button>
      )}

      <div className="h-5 w-px bg-[#1C2933] mx-0.5 shrink-0" />

      {/* Squad Groups 1-4 */}
      {groups.slice(0, 4).map(num => {
        const squadIds = engine.controlGroups[num] || [];
        const activeUnitsCount = squadIds.filter(id => engine.units.some(u => u.id === id && u.hp > 0)).length;
        const color = num === 1 ? '#38bdf8' : num === 2 ? '#f59e0b' : num === 3 ? '#a855f7' : '#34d399';

        let holdTimer: any = null;

        const startHold = () => {
          holdTimer = setTimeout(() => {
            if (hasSelection) {
              onAssignGroup(num);
            }
          }, 500);
        };

        const clearHold = () => {
          if (holdTimer) {
            clearTimeout(holdTimer);
            holdTimer = null;
          }
        };

        return (
          <div key={num} className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={() => onSelectGroup(num)}
              onMouseDown={startHold}
              onMouseUp={clearHold}
              onMouseLeave={clearHold}
              onTouchStart={startHold}
              onTouchEnd={clearHold}
              onTouchCancel={clearHold}
              onContextMenu={e => {
                e.preventDefault();
                onAssignGroup(num);
              }}
              title={`Squad ${num} (${activeUnitsCount} units) · Tap to select, Hold or Right-click to save`}
              className={`px-2 py-1.5 rounded text-xs font-mono font-bold transition-all flex items-center gap-1 min-h-[40px] ${
                activeUnitsCount > 0
                  ? 'bg-[#1C2933] hover:bg-[#173A32] text-[#F4F7FA] border'
                  : 'bg-[#101820]/70 text-[#A9B8C5]/60 border border-[#1C2933] hover:text-[#A9B8C5]'
              }`}
              style={{
                borderColor: activeUnitsCount > 0 ? `${color}88` : undefined,
              }}
            >
              <span style={{ color }}>S{num}</span>
              {activeUnitsCount > 0 && (
                <span className="text-[10px] font-semibold text-[#A9B8C5]">({activeUnitsCount})</span>
              )}
            </button>
            {hasSelection && (
              <button
                onClick={() => onAssignGroup(num)}
                title={`Save current selection to Squad ${num}`}
                className="w-5 h-10 rounded bg-[#1C2933]/70 hover:bg-[#173A32] text-[#38B98A] flex items-center justify-center text-[10px] font-bold border border-[#1C2933]"
              >
                +
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

