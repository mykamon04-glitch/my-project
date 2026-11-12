/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Crosshair,
  Layers,
  Eye,
  Sliders,
  ChevronDown,
  Check,
} from 'lucide-react';

interface MobileCameraClusterProps {
  onCenterHQ: () => void;
  onFitBase: () => void;
  onToggleFollow: () => void;
  isFollowing: boolean;
  hasSelection: boolean;
  currentZoom: number;
  onSetZoomPreset: (zoom: number) => void;
  onOpenSettings?: () => void;
}

export const MobileCameraCluster: React.FC<MobileCameraClusterProps> = ({
  onCenterHQ,
  onFitBase,
  onToggleFollow,
  isFollowing,
  hasSelection,
  currentZoom,
  onSetZoomPreset,
  onOpenSettings,
}) => {
  const [showPresets, setShowPresets] = useState<boolean>(false);

  return (
    <div className="fixed top-12 left-2 z-20 flex items-center gap-1 p-1 bg-[#0d141d]/90 backdrop-blur-md rounded-xl border border-[#1C2933] shadow-lg pointer-events-auto select-none">
      {/* 1. HQ SHORTCUT */}
      <button
        onClick={onCenterHQ}
        title="Center Headquarters"
        className="px-2.5 py-1.5 rounded-lg bg-[#16212c] hover:bg-[#173A32] text-[#38B98A] text-[10px] font-mono font-bold flex items-center gap-1 active:scale-95 transition-all shadow-sm"
      >
        <Crosshair className="w-3.5 h-3.5" />
        <span>HQ</span>
      </button>

      {/* 2. FIT BASE SHORTCUT */}
      <button
        onClick={onFitBase}
        title="Fit Entire Friendly Base in Viewport"
        className="px-2.5 py-1.5 rounded-lg bg-[#16212c] hover:bg-[#173A32] text-[#36C9E8] text-[10px] font-mono font-bold flex items-center gap-1 active:scale-95 transition-all shadow-sm"
      >
        <Layers className="w-3.5 h-3.5" />
        <span>FIT</span>
      </button>

      {/* 3. FOLLOW SELECTED UNITS SHORTCUT */}
      <button
        onClick={onToggleFollow}
        title={hasSelection ? 'Follow Selected Troops' : 'Select units to follow'}
        className={`px-2.5 py-1.5 rounded-lg text-[10px] font-mono font-bold flex items-center gap-1 active:scale-95 transition-all shadow-sm ${
          isFollowing
            ? 'bg-[#173A32] border border-[#38B98A] text-[#38B98A] ring-1 ring-[#38B98A]/50 animate-pulse'
            : hasSelection
            ? 'bg-[#16212c] hover:bg-[#173A32] text-[#A9B8C5] hover:text-[#38B98A]'
            : 'bg-[#121922] text-[#64748b] opacity-60'
        }`}
      >
        <Eye className="w-3.5 h-3.5" />
        <span>FOLLOW</span>
      </button>

      {/* SECONDARY CONTROLS MENU TRIGGER */}
      <div className="relative border-l border-[#1C2933] pl-1 ml-0.5">
        <button
          onClick={() => setShowPresets(prev => !prev)}
          title="Camera Zoom Levels & Options"
          className="p-1.5 rounded-lg bg-[#16212c] hover:bg-[#1C2933] text-[#A9B8C5] hover:text-[#F4F7FA] active:scale-95 flex items-center"
        >
          <Sliders className="w-3.5 h-3.5" />
        </button>

        {showPresets && (
          <div className="absolute top-full left-0 mt-1.5 bg-[#101820] border border-[#1C2933] rounded-xl p-2 shadow-2xl min-w-[150px] flex flex-col gap-1 z-30 font-mono text-[10px]">
            <span className="text-[9px] uppercase tracking-wider text-[#A9B8C5] px-1 font-bold">
              Zoom Presets
            </span>
            <button
              onClick={() => {
                onSetZoomPreset(1.6);
                setShowPresets(false);
              }}
              className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-[#16212c] text-[#F4F7FA]"
            >
              <span>Close (1.6x)</span>
              {Math.abs(currentZoom - 1.6) < 0.15 && <Check className="w-3 h-3 text-[#38B98A]" />}
            </button>
            <button
              onClick={() => {
                onSetZoomPreset(1.1);
                setShowPresets(false);
              }}
              className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-[#16212c] text-[#F4F7FA]"
            >
              <span>Normal (1.1x)</span>
              {Math.abs(currentZoom - 1.1) < 0.15 && <Check className="w-3 h-3 text-[#38B98A]" />}
            </button>
            <button
              onClick={() => {
                onSetZoomPreset(0.85);
                setShowPresets(false);
              }}
              className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-[#16212c] text-[#F4F7FA]"
            >
              <span>Tactical (0.85x)</span>
              {Math.abs(currentZoom - 0.85) < 0.15 && <Check className="w-3 h-3 text-[#38B98A]" />}
            </button>
            <button
              onClick={() => {
                onSetZoomPreset(0.5);
                setShowPresets(false);
              }}
              className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-[#16212c] text-[#F4F7FA]"
            >
              <span>Strategic (0.5x)</span>
              {Math.abs(currentZoom - 0.5) < 0.15 && <Check className="w-3 h-3 text-[#38B98A]" />}
            </button>

            {onOpenSettings && (
              <div className="border-t border-[#1C2933] pt-1 mt-0.5">
                <button
                  onClick={() => {
                    setShowPresets(false);
                    onOpenSettings();
                  }}
                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-[#16212c] text-[#36C9E8] font-bold"
                >
                  Camera Settings...
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

