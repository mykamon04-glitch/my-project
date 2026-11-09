/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Check,
  X,
  RotateCw,
  Sparkles,
  Zap,
  Coins,
} from 'lucide-react';
import { BUILDING_CONFIGS } from '../data/gameData';
import { BuildingPlacementRecommendation, BuildingType } from '../types/game';

export interface PlacementState {
  type: BuildingType;
  gridX: number;
  gridY: number;
  rotation: 0 | 90 | 180 | 270;
  isValid: boolean;
  reason?: string;
  recommendations?: BuildingPlacementRecommendation[];
}

interface ConstructionControlBarProps {
  placement: PlacementState;
  onNudge: (dx: number, dy: number) => void;
  onRotate: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  onSelectRecommendation?: (rec: BuildingPlacementRecommendation) => void;
}

export const ConstructionControlBar: React.FC<ConstructionControlBarProps> = ({
  placement,
  onRotate,
  onConfirm,
  onCancel,
  onSelectRecommendation,
}) => {
  const config = BUILDING_CONFIGS[placement.type];

  // AI Suggest cycling logic
  const handleAISuggest = () => {
    if (!placement.recommendations || placement.recommendations.length === 0 || !onSelectRecommendation) {
      return;
    }
    const currentIdx = placement.recommendations.findIndex(
      r => r.gridX === placement.gridX && r.gridY === placement.gridY
    );
    const nextIdx = (currentIdx + 1) % placement.recommendations.length;
    onSelectRecommendation(placement.recommendations[nextIdx]);
  };

  return (
    <div className="fixed bottom-24 sm:bottom-28 left-1/2 -translate-x-1/2 z-40 select-none w-[min(calc(100vw-24px),460px)] pointer-events-auto">
      {/* Sleek military placement bar matching reference design */}
      <div className="bg-[#101820]/95 backdrop-blur-md border border-[#2c3e50]/80 p-2 sm:p-2.5 rounded-2xl shadow-2xl flex flex-col gap-2 font-mono text-[#F1F5F7]">
        {/* Building Info & Validity Banner */}
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-display font-bold text-sm text-[#F1F5F7] truncate tracking-wide">
              {config.name}
            </span>
            <span className="flex items-center gap-1 text-[#E5A93D] font-bold text-xs shrink-0">
              <Coins className="w-3.5 h-3.5 text-[#E5A93D]" />
              ${config.cost.toLocaleString()}
            </span>
            {config.powerProduced > 0 && (
              <span className="flex items-center gap-0.5 text-[#2FB68A] font-bold text-xs shrink-0">
                <Zap className="w-3 h-3" />+{config.powerProduced} GW
              </span>
            )}
            {config.powerConsumed > 0 && (
              <span className="flex items-center gap-0.5 text-[#E5A93D] font-bold text-xs shrink-0">
                <Zap className="w-3 h-3" />-{config.powerConsumed} GW
              </span>
            )}
          </div>
          <span
            className={`text-[11px] font-bold shrink-0 px-2 py-0.5 rounded-md ${
              placement.isValid
                ? 'text-[#2FB68A] bg-[#2FB68A]/15 border border-[#2FB68A]/40'
                : 'text-[#D94F59] bg-[#D94F59]/15 border border-[#D94F59]/40'
            }`}
          >
            {placement.isValid ? '✓ Valid Site' : placement.reason || '✕ Blocked'}
          </span>
        </div>

        {/* 3 Primary Action Buttons: CONFIRM, ROTATE, CANCEL */}
        <div className="grid grid-cols-3 gap-2 pt-1 border-t border-[#1B2730]">
          {/* CONFIRM BUTTON */}
          <button
            onClick={onConfirm}
            disabled={!placement.isValid}
            title={placement.isValid ? 'Confirm and build' : placement.reason || 'Blocked site'}
            className={`flex items-center justify-center gap-1.5 h-11 px-3 rounded-xl font-display font-bold text-xs tracking-wider transition-all min-h-[44px] ${
              placement.isValid
                ? 'bg-[#2FB68A] text-[#101820] hover:bg-[#38c999] shadow-lg shadow-[#2FB68A]/25 active:scale-95 cursor-pointer'
                : 'bg-[#1B2730] text-[#A8B6C2]/40 border border-[#2c3e50]/40 cursor-not-allowed opacity-50'
            }`}
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span>CONFIRM</span>
          </button>

          {/* ROTATE BUTTON */}
          <button
            onClick={onRotate}
            title="Rotate building 90 degrees"
            className="flex items-center justify-center gap-1.5 h-11 px-3 rounded-xl bg-[#1B2730] hover:bg-[#22323e] text-[#4B91B5] border border-[#4B91B5]/40 font-display font-bold text-xs tracking-wider active:scale-95 transition-all min-h-[44px]"
          >
            <RotateCw className="w-4 h-4 stroke-[2.5]" />
            <span>ROTATE ({placement.rotation}°)</span>
          </button>

          {/* CANCEL BUTTON */}
          <button
            onClick={onCancel}
            title="Cancel building construction"
            className="flex items-center justify-center gap-1.5 h-11 px-3 rounded-xl bg-[#1B2730] hover:bg-[#D94F59]/20 text-[#D94F59] border border-[#D94F59]/40 font-display font-bold text-xs tracking-wider active:scale-95 transition-all min-h-[44px]"
          >
            <X className="w-4 h-4 stroke-[2.5]" />
            <span>CANCEL</span>
          </button>
        </div>
      </div>
    </div>
  );
};
