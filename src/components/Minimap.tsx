/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Locate,
  Shield,
  Crosshair,
  Map,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  Move,
  X,
  Compass,
} from 'lucide-react';
import { Camera } from '../game/renderer';
import { GameEngine } from '../game/engine';

interface MinimapProps {
  engine: GameEngine;
  camera: Camera;
  onMoveCamera: (worldX: number, worldY: number) => void;
  viewportWidth: number;
  viewportHeight: number;
}

export type RadarPosition = 'top-right' | 'top-left' | 'bottom-right';

export const Minimap: React.FC<MinimapProps> = ({
  engine,
  camera,
  onMoveCamera,
  viewportWidth,
  viewportHeight,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const expandedCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [isExpandedModal, setIsExpandedModal] = useState<boolean>(false);
  const [position, setPosition] = useState<RadarPosition>(
    engine.settings.radarPosition || 'top-right'
  );

  const mapW = engine.mapData.width * engine.mapData.tileSize;
  const mapH = engine.mapData.height * engine.mapData.tileSize;

  // Render loop for the radar canvas
  useEffect(() => {
    let animId: number;

    const renderToCanvas = (canvas: HTMLCanvasElement | null, isFull: boolean) => {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const cw = canvas.width;
      const ch = canvas.height;
      const scaleX = cw / mapW;
      const scaleY = ch / mapH;
      const ts = engine.mapData.tileSize;

      ctx.clearRect(0, 0, cw, ch);

      // 1. Base terrain background fill
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, cw, ch);

      // Simple terrain tiles
      const step = isFull ? 2 : 3;
      for (let y = 0; y < engine.mapData.height; y += step) {
        for (let x = 0; x < engine.mapData.width; x += step) {
          const tile = engine.mapData.tiles[y][x];
          let color = '#152520';
          if (tile === 3) color = '#0369a1'; // water
          else if (tile === 2) color = '#334155'; // road
          else if (tile === 4) color = '#1e293b'; // cliff
          else if (tile === 5) color = '#064e3b'; // forest
          ctx.fillStyle = color;
          ctx.fillRect(x * ts * scaleX, y * ts * scaleY, ts * step * scaleX, ts * step * scaleY);
        }
      }

      // 2. Resource nodes
      ctx.fillStyle = '#38bdf8';
      engine.mapData.resourceNodes.forEach(rn => {
        ctx.fillRect(rn.x * ts * scaleX - 1.5, rn.y * ts * scaleY - 1.5, 3, 3);
      });

      // 3. Buildings
      engine.buildings.forEach(b => {
        if (b.hp <= 0) return;
        const gx = Math.floor(b.pixelX / ts);
        const gy = Math.floor(b.pixelY / ts);
        const fogState = engine.fogGrid[gy * engine.mapData.width + gx];
        if (b.faction === 'enemy' && engine.settings.fogOfWarEnabled && fogState === 0) return;

        ctx.fillStyle = b.faction === 'player' ? '#38B98A' : '#f43f5e';
        const bw = Math.max(3, b.width * ts * scaleX);
        const bh = Math.max(3, b.height * ts * scaleY);
        ctx.fillRect(b.pixelX * scaleX - bw / 2, b.pixelY * scaleY - bh / 2, bw, bh);

        // HQ Marker
        if (b.type === 'headquarters') {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.strokeRect(b.pixelX * scaleX - bw / 2 - 1, b.pixelY * scaleY - bh / 2 - 1, bw + 2, bh + 2);
        }
      });

      // 4. Units
      engine.units.forEach(u => {
        if (u.hp <= 0) return;
        const gx = Math.floor(u.x / ts);
        const gy = Math.floor(u.y / ts);
        const fogState = engine.fogGrid[gy * engine.mapData.width + gx];
        if (u.faction === 'enemy' && engine.settings.fogOfWarEnabled && fogState !== 2) return;

        ctx.fillStyle = u.faction === 'player' ? '#38bdf8' : '#ef4444';
        ctx.beginPath();
        ctx.arc(u.x * scaleX, u.y * scaleY, isFull ? 2.5 : 1.6, 0, Math.PI * 2);
        ctx.fill();
      });

      // 5. Radar Sweep Line
      const sweepAngle = (engine.gameTime * 2.2) % (Math.PI * 2);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
      ctx.lineWidth = 1;
      const centerRx = cw / 2;
      const centerRy = ch / 2;
      ctx.beginPath();
      ctx.moveTo(centerRx, centerRy);
      ctx.lineTo(centerRx + Math.cos(sweepAngle) * (cw / 2), centerRy + Math.sin(sweepAngle) * (ch / 2));
      ctx.stroke();

      // 6. Camera Viewport Frustum Box
      const camHalfW = ((viewportWidth / 2) / camera.zoom) * scaleX;
      const camHalfH = ((viewportHeight / 2) / camera.zoom) * scaleY;
      const camCenterX = camera.x * scaleX;
      const camCenterY = camera.y * scaleY;

      ctx.strokeStyle = '#F4F7FA';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(camCenterX - camHalfW, camCenterY - camHalfH, camHalfW * 2, camHalfH * 2);
    };

    const loop = () => {
      if (!isMinimized) {
        renderToCanvas(canvasRef.current, false);
      }
      if (isExpandedModal) {
        renderToCanvas(expandedCanvasRef.current, true);
      }
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [engine, camera, mapW, mapH, viewportWidth, viewportHeight, isMinimized, isExpandedModal]);

  const handleMinimapClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const worldX = Math.max(0, Math.min(mapW, (clickX / canvas.width) * mapW));
    const worldY = Math.max(0, Math.min(mapH, (clickY / canvas.height) * mapH));
    onMoveCamera(worldX, worldY);
  };

  const cyclePosition = () => {
    const next: RadarPosition =
      position === 'top-right' ? 'top-left' : position === 'top-left' ? 'bottom-right' : 'top-right';
    setPosition(next);
    engine.settings.radarPosition = next;
  };

  const jumpToHQ = () => {
    const hq = engine.buildings.find(b => b.type === 'headquarters' && b.faction === 'player');
    if (hq) onMoveCamera(hq.pixelX, hq.pixelY);
    else onMoveCamera(engine.mapData.playerSpawn.x, engine.mapData.playerSpawn.y);
  };

  const jumpToArmy = () => {
    const playerUnits = engine.units.filter(u => u.faction === 'player' && u.hp > 0);
    if (playerUnits.length > 0) {
      const avgX = playerUnits.reduce((acc, u) => acc + u.x, 0) / playerUnits.length;
      const avgY = playerUnits.reduce((acc, u) => acc + u.y, 0) / playerUnits.length;
      onMoveCamera(avgX, avgY);
    }
  };

  // Position classes
  const posClass =
    position === 'top-right'
      ? 'top-14 right-2 sm:right-3'
      : position === 'top-left'
      ? 'top-14 left-2 sm:left-3'
      : 'bottom-48 right-2 sm:right-3';

  return (
    <>
      {/* 1. FLOATING MINIMAP WIDGET */}
      <div className={`fixed ${posClass} z-30 select-none transition-all`}>
        {isMinimized ? (
          /* Minimized tiny round radar button */
          <button
            onClick={() => setIsMinimized(false)}
            title="Expand Radar"
            className="w-10 h-10 rounded-full bg-[#101820]/95 border border-[#38B98A] text-[#38B98A] flex items-center justify-center shadow-xl backdrop-blur-md active:scale-95"
          >
            <Compass className="w-5 h-5 animate-spin-slow" />
          </button>
        ) : (
          /* Compact floating radar card */
          <div className="bg-[#0d141d]/95 backdrop-blur-md border border-[#1C2933] rounded-xl p-1.5 shadow-2xl flex flex-col items-center gap-1">
            {/* Header / Tools */}
            <div className="w-full flex items-center justify-between pb-1 border-b border-[#1C2933] text-[10px] font-mono text-[#A9B8C5]">
              <span className="font-display font-bold text-[#38B98A]">RADAR</span>

              <div className="flex items-center gap-1">
                {/* Expand to Full Tactical Map */}
                <button
                  onClick={() => setIsExpandedModal(true)}
                  title="Expand to Full Tactical Map"
                  className="p-0.5 hover:text-white"
                >
                  <Maximize2 className="w-3 h-3" />
                </button>
                {/* Corner Switcher */}
                <button
                  onClick={cyclePosition}
                  title="Change Screen Corner"
                  className="p-0.5 hover:text-white"
                >
                  <Move className="w-3 h-3" />
                </button>
                {/* Minimize */}
                <button
                  onClick={() => setIsMinimized(true)}
                  title="Minimize Radar"
                  className="p-0.5 hover:text-white"
                >
                  <ChevronUp className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Radar Canvas (96x96 compact) */}
            <canvas
              ref={canvasRef}
              width={96}
              height={96}
              onClick={handleMinimapClick}
              className="rounded-lg bg-[#090d16] border border-[#1C2933] cursor-crosshair shadow-inner"
            />

            {/* Quick Navigation Shortcuts */}
            <div className="w-full flex items-center justify-between gap-1 pt-0.5">
              <button
                onClick={jumpToHQ}
                title="Center on HQ"
                className="flex-1 py-0.5 bg-[#173A32] text-[#38B98A] text-[9px] font-mono font-bold rounded text-center hover:bg-[#38B98A]/20"
              >
                HQ
              </button>
              <button
                onClick={jumpToArmy}
                title="Center on Army"
                className="flex-1 py-0.5 bg-[#16212c] text-[#36C9E8] text-[9px] font-mono font-bold rounded text-center hover:bg-[#1C2933]"
              >
                ARMY
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2. EXPANDED TACTICAL MAP MODAL (Tap to navigate full map) */}
      {isExpandedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3">
          <div className="bg-[#101820] border border-[#38B98A] rounded-2xl max-w-lg w-full p-4 shadow-2xl flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-[#1C2933] pb-2">
              <div className="flex items-center gap-2">
                <Map className="w-5 h-5 text-[#38B98A]" />
                <span className="font-display font-bold text-sm text-[#F4F7FA] tracking-wider uppercase">
                  THEATER OF OPERATIONS · FULL TACTICAL MAP
                </span>
              </div>
              <button
                onClick={() => setIsExpandedModal(false)}
                className="p-1 text-gray-400 hover:text-white rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[#A9B8C5]">
              Tap anywhere on the tactical map to reposition your field commander camera:
            </p>

            {/* Expanded Canvas */}
            <div className="flex justify-center bg-[#090d16] p-2 rounded-xl border border-[#1C2933]">
              <canvas
                ref={expandedCanvasRef}
                width={300}
                height={300}
                onClick={e => {
                  handleMinimapClick(e);
                  setIsExpandedModal(false);
                }}
                className="rounded-lg cursor-crosshair shadow-2xl max-w-full"
              />
            </div>

            {/* Tactical Jump Buttons */}
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#1C2933]">
              <button
                onClick={() => {
                  jumpToHQ();
                  setIsExpandedModal(false);
                }}
                className="flex-1 py-2 rounded-lg bg-[#173A32] text-[#38B98A] font-mono font-bold text-xs hover:bg-[#38B98A]/20"
              >
                JUMP TO HQ
              </button>
              <button
                onClick={() => {
                  jumpToArmy();
                  setIsExpandedModal(false);
                }}
                className="flex-1 py-2 rounded-lg bg-[#16212c] text-[#36C9E8] font-mono font-bold text-xs hover:bg-sky-900/30"
              >
                JUMP TO ARMY
              </button>
              <button
                onClick={() => setIsExpandedModal(false)}
                className="py-2 px-4 rounded-lg bg-[#1C2933] text-gray-300 font-mono text-xs hover:bg-slate-800"
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
