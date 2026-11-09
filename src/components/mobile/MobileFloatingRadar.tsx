/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Compass,
  Maximize2,
  Minimize2,
  Crosshair,
  AlertTriangle,
  Layers,
  X,
  Target,
  Shield,
  Radio,
} from 'lucide-react';
import { GameEngine } from '../../game/engine';
import { Camera } from '../../game/renderer';

interface MobileFloatingRadarProps {
  engine: GameEngine;
  camera: Camera;
  onMoveCamera: (worldX: number, worldY: number) => void;
  onCenterHQ: () => void;
  onCenterArmy: () => void;
  viewportWidth: number;
  viewportHeight: number;
}

export const MobileFloatingRadar: React.FC<MobileFloatingRadarProps> = ({
  engine,
  camera,
  onMoveCamera,
  onCenterHQ,
  onCenterArmy,
  viewportWidth,
  viewportHeight,
}) => {
  const [isFullRadarOpen, setIsFullRadarOpen] = useState<boolean>(false);
  const [showTacticalInfo, setShowTacticalInfo] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fullCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDraggingViewportRef = useRef<boolean>(false);
  const longPressTimerRef = useRef<number | null>(null);

  const mapW = engine.mapData.width * engine.mapData.tileSize;
  const mapH = engine.mapData.height * engine.mapData.tileSize;

  // Dynamic Micro Radar: customizable via settings (compact: 88px, standard: 104px, large: 128px)
  const radarSetting = engine.settings.radarSize || 'standard';
  const miniW = radarSetting === 'compact' ? 88 : radarSetting === 'large' ? 128 : 104;
  const miniH = radarSetting === 'compact' ? 62 : radarSetting === 'large' ? 90 : 72;

  // Full Tactical Radar modal canvas
  const fullW = 320;
  const fullH = 220;

  // Shared Radar drawing routine
  const drawRadarOnCanvas = useCallback(
    (canvas: HTMLCanvasElement, isDetailed: boolean) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const cw = canvas.width;
      const ch = canvas.height;
      const scaleX = cw / mapW;
      const scaleY = ch / mapH;
      const ts = engine.mapData.tileSize;

      ctx.clearRect(0, 0, cw, ch);

      // 1. Terrain base
      ctx.fillStyle = '#080d16';
      ctx.fillRect(0, 0, cw, ch);

      // Low-res terrain background features
      const tileStep = isDetailed ? 2 : 5;
      for (let y = 0; y < engine.mapData.height; y += tileStep) {
        for (let x = 0; x < engine.mapData.width; x += tileStep) {
          const tile = engine.mapData.tiles[y][x];
          if (tile === 3) {
            // Water
            ctx.fillStyle = '#0369a1';
            ctx.fillRect(x * ts * scaleX, y * ts * scaleY, ts * tileStep * scaleX, ts * tileStep * scaleY);
          } else if (tile === 4) {
            // Mountain / Cliff
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(x * ts * scaleX, y * ts * scaleY, ts * tileStep * scaleX, ts * tileStep * scaleY);
          }
        }
      }

      // Tactical grid
      ctx.strokeStyle = 'rgba(28, 41, 51, 0.45)';
      ctx.lineWidth = 0.5;
      const gridGap = isDetailed ? 28 : 24;
      for (let gx = 0; gx < cw; gx += gridGap) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, ch);
        ctx.stroke();
      }
      for (let gy = 0; gy < ch; gy += gridGap) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(cw, gy);
        ctx.stroke();
      }

      // 2. Resource nodes (Amber)
      ctx.fillStyle = '#F2B84B';
      engine.mapData.resourceNodes.forEach(rn => {
        const rx = rn.x * ts * scaleX;
        const ry = rn.y * ts * scaleY;
        ctx.fillRect(rx - 1, ry - 1, 2.5, 2.5);
      });

      // 3. Buildings (Friendly: Emerald, Enemy: Crimson)
      engine.buildings.forEach(b => {
        if (b.hp <= 0) return;
        const gx = Math.floor(b.pixelX / ts);
        const gy = Math.floor(b.pixelY / ts);
        const fogState = engine.fogGrid[gy * engine.mapData.width + gx];
        if (b.faction === 'enemy' && engine.settings.fogOfWarEnabled && fogState === 0) return;

        const bx = b.pixelX * scaleX;
        const by = b.pixelY * scaleY;
        const bw = Math.max(3, b.width * ts * scaleX);
        const bh = Math.max(3, b.height * ts * scaleY);

        if (b.faction === 'player') {
          ctx.fillStyle = '#38B98A';
          ctx.fillRect(bx - bw / 2, by - bh / 2, bw, bh);
          if (b.type === 'headquarters') {
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1.2;
            ctx.strokeRect(bx - bw / 2 - 1, by - bh / 2 - 1, bw + 2, bh + 2);
          }
        } else {
          ctx.fillStyle = '#E45B63';
          ctx.fillRect(bx - bw / 2, by - bh / 2, bw, bh);
          if (b.type === 'headquarters') {
            ctx.strokeStyle = '#FFA5A5';
            ctx.lineWidth = 1.2;
            ctx.strokeRect(bx - bw / 2 - 1, by - bh / 2 - 1, bw + 2, bh + 2);
          }
        }
      });

      // 4. Units (Differentiated: Friendly = Green/Cyan, Detected Enemy = Red)
      engine.units.forEach(u => {
        if (u.hp <= 0) return;
        const gx = Math.floor(u.x / ts);
        const gy = Math.floor(u.y / ts);
        const fogState = engine.fogGrid[gy * engine.mapData.width + gx];
        if (u.faction === 'enemy' && engine.settings.fogOfWarEnabled && fogState !== 2) return;

        const ux = u.x * scaleX;
        const uy = u.y * scaleY;
        const isPlayer = u.faction === 'player';
        ctx.fillStyle = isPlayer ? '#36C9E8' : '#E45B63';

        if (u.type === 'attack_helicopter' || u.type === 'stealth_fighter' || u.type === 'recon_drone') {
          // Aircraft: Triangle
          ctx.beginPath();
          ctx.moveTo(ux, uy - 2.5);
          ctx.lineTo(ux + 2.5, uy + 2);
          ctx.lineTo(ux - 2.5, uy + 2);
          ctx.closePath();
          ctx.fill();
        } else if (
          u.type === 'light_tank' ||
          u.type === 'main_battle_tank' ||
          u.type === 'heavy_tank' ||
          u.type === 'apc' ||
          u.type === 'medical_apc' ||
          u.type === 'artillery' ||
          u.type === 'aa_vehicle'
        ) {
          // Vehicle: Diamond
          ctx.beginPath();
          ctx.moveTo(ux, uy - 2);
          ctx.lineTo(ux + 2, uy);
          ctx.lineTo(ux, uy + 2);
          ctx.lineTo(ux - 2, uy);
          ctx.closePath();
          ctx.fill();
        } else {
          // Infantry: Small Dot
          ctx.beginPath();
          ctx.arc(ux, uy, isDetailed ? 2 : 1.3, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // 5. Enemy Attack Direction Arrow (Calculated from player HQ to nearest cluster of detected hostiles)
      const playerHQ = engine.buildings.find(b => b.type === 'headquarters' && b.faction === 'player');
      const detectedEnemies = engine.units.filter(u => {
        if (u.faction !== 'enemy' || u.hp <= 0) return false;
        if (!engine.settings.fogOfWarEnabled) return true;
        const gx = Math.floor(u.x / ts);
        const gy = Math.floor(u.y / ts);
        return engine.fogGrid[gy * engine.mapData.width + gx] === 2;
      });

      if (playerHQ && detectedEnemies.length > 0) {
        // Average hostile cluster centroid
        let avgX = 0;
        let avgY = 0;
        detectedEnemies.forEach(e => {
          avgX += e.x;
          avgY += e.y;
        });
        avgX /= detectedEnemies.length;
        avgY /= detectedEnemies.length;

        const hqX = playerHQ.pixelX * scaleX;
        const hqY = playerHQ.pixelY * scaleY;
        const angle = Math.atan2(avgY * scaleY - hqY, avgX * scaleX - hqX);

        // Draw threat directional chevron
        const arrowDist = 18;
        const ax = hqX + Math.cos(angle) * arrowDist;
        const ay = hqY + Math.sin(angle) * arrowDist;

        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(ax - Math.cos(angle - 0.5) * 5, ay - Math.sin(angle - 0.5) * 5);
        ctx.lineTo(ax, ay);
        ctx.lineTo(ax - Math.cos(angle + 0.5) * 5, ay - Math.sin(angle + 0.5) * 5);
        ctx.stroke();
      }

      // 6. Radar Sweep Line
      const sweepAngle = (engine.gameTime * 2.2) % (Math.PI * 2);
      ctx.strokeStyle = 'rgba(56, 185, 138, 0.4)';
      ctx.lineWidth = 1;
      const rx = cw / 2;
      const ry = ch / 2;
      const sweepRadius = Math.hypot(cw, ch) / 2;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx + Math.cos(sweepAngle) * sweepRadius, ry + Math.sin(sweepAngle) * sweepRadius);
      ctx.stroke();

      // 7. Authoritative Camera Viewport Rectangle (Thin white outline)
      const safeZoom = Math.max(0.3, camera.zoom || 1.0);
      const viewW = (viewportWidth / safeZoom) * scaleX;
      const viewH = (viewportHeight / safeZoom) * scaleY;
      const vx = camera.x * scaleX - viewW / 2;
      const vy = camera.y * scaleY - viewH / 2;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.fillRect(vx, vy, viewW, viewH);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(vx, vy, viewW, viewH);
    },
    [camera, mapW, mapH, viewportWidth, viewportHeight, engine]
  );

  // Animation Loop for permanent mini radar and full tactical radar
  useEffect(() => {
    let animId: number;
    const render = () => {
      if (canvasRef.current) {
        drawRadarOnCanvas(canvasRef.current, false);
      }
      if (isFullRadarOpen && fullCanvasRef.current) {
        drawRadarOnCanvas(fullCanvasRef.current, true);
      }
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [drawRadarOnCanvas, isFullRadarOpen]);

  // Pointer interactions: Single tap to move camera, long press to open tactical info
  const handlePointerInteraction = useCallback(
    (clientX: number, clientY: number, targetCanvas: HTMLCanvasElement) => {
      const rect = targetCanvas.getBoundingClientRect();
      const clickX = clientX - rect.left;
      const clickY = clientY - rect.top;
      const clampedX = Math.max(0, Math.min(rect.width, clickX));
      const clampedY = Math.max(0, Math.min(rect.height, clickY));

      const worldX = (clampedX / rect.width) * mapW;
      const worldY = (clampedY / rect.height) * mapH;
      onMoveCamera(worldX, worldY);
    },
    [mapW, mapH, onMoveCamera]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>, isModal: boolean = false) => {
    isDraggingViewportRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    // Setup long-press timer (500ms) for tactical popover
    if (!isModal) {
      if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = window.setTimeout(() => {
        setShowTacticalInfo(prev => !prev);
      }, 500);
    }

    const canvas = isModal ? fullCanvasRef.current : canvasRef.current;
    if (canvas) {
      handlePointerInteraction(e.clientX, e.clientY, canvas);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>, isModal: boolean = false) => {
    if (!isDraggingViewportRef.current) return;
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    const canvas = isModal ? fullCanvasRef.current : canvasRef.current;
    if (canvas) {
      handlePointerInteraction(e.clientX, e.clientY, canvas);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDraggingViewportRef.current = false;
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  };

  const detectedEnemyCount = engine.units.filter(u => {
    if (u.faction !== 'enemy' || u.hp <= 0) return false;
    if (!engine.settings.fogOfWarEnabled) return true;
    const gx = Math.floor(u.x / engine.mapData.tileSize);
    const gy = Math.floor(u.y / engine.mapData.tileSize);
    return engine.fogGrid[gy * engine.mapData.width + gx] === 2;
  }).length;

  return (
    <>
      {/* 1. PERMANENT LIVE MINI RADAR (Positioned neatly in upper-right) */}
      <div
        className="fixed top-[var(--hud-top)] right-2 z-25 pointer-events-auto select-none bg-[#0d141d]/95 backdrop-blur-md border border-[#1C2933] rounded-xl shadow-2xl p-1 flex flex-col gap-1 font-mono text-[9px] text-[#F4F7FA]"
        style={{ width: `${miniW + 8}px` }}
      >
        {/* Header Strip with Expand & HQ Center */}
        <div className="flex items-center justify-between px-0.5">
          <div className="flex items-center gap-1 text-[#38B98A] font-bold">
            <Radio className="w-2.5 h-2.5 text-[#38B98A]" />
            <span className="text-[8px] uppercase tracking-wider">RADAR</span>
          </div>

          <div className="flex items-center gap-0.5">
            <button
              onClick={onCenterHQ}
              title="Center on Headquarters"
              className="p-0.5 rounded bg-[#16212c] hover:bg-[#1C2933] text-[#38B98A] active:scale-95"
            >
              <Crosshair className="w-3 h-3" />
            </button>
            <button
              onClick={() => setIsFullRadarOpen(true)}
              title="Open Full Tactical Radar"
              className="p-0.5 rounded bg-[#16212c] hover:bg-[#1C2933] text-[#36C9E8] active:scale-95"
            >
              <Maximize2 className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Live Miniature Radar Canvas (96x68) */}
        <div className="relative rounded-lg overflow-hidden border border-[#1C2933] bg-[#080d16] cursor-crosshair">
          <canvas
            ref={canvasRef}
            width={miniW}
            height={miniH}
            style={{ width: `${miniW}px`, height: `${miniH}px` }}
            onPointerDown={e => handlePointerDown(e, false)}
            onPointerMove={e => handlePointerMove(e, false)}
            onPointerUp={handlePointerUp}
            className="touch-none block"
          />

          {detectedEnemyCount > 0 && (
            <div className="absolute top-0.5 right-0.5 px-1 py-0.2 rounded bg-rose-600/90 text-white text-[7px] font-bold">
              {detectedEnemyCount}
            </div>
          )}
        </div>
      </div>

      {/* 2. TACTICAL INFO POPOVER (Triggered by Long-Press on Mini Radar) */}
      {showTacticalInfo && (
        <div className="fixed top-[calc(var(--hud-top)+140px)] right-2 z-35 w-52 bg-[#0d141d]/95 backdrop-blur-md border border-[#1C2933] rounded-xl p-2.5 shadow-2xl font-mono text-[10px] text-[#F4F7FA] space-y-2 pointer-events-auto animate-fadeIn">
          <div className="flex items-center justify-between border-b border-[#1C2933] pb-1">
            <span className="font-bold text-[#38B98A] flex items-center gap-1">
              <Compass className="w-3 h-3" /> Tactical Intel
            </span>
            <button
              onClick={() => setShowTacticalInfo(false)}
              className="p-0.5 rounded hover:bg-[#1C2933] text-gray-400 hover:text-white"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-1 text-[#A9B8C5]">
            <div className="flex justify-between">
              <span>Friendly Forces:</span>
              <span className="font-bold text-[#36C9E8]">
                {engine.units.filter(u => u.faction === 'player' && u.hp > 0).length}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Detected Hostiles:</span>
              <span className="font-bold text-rose-400">{detectedEnemyCount}</span>
            </div>
            <div className="flex justify-between">
              <span>Active Structures:</span>
              <span className="font-bold text-[#38B98A]">
                {engine.buildings.filter(b => b.faction === 'player' && b.hp > 0).length}
              </span>
            </div>
          </div>
          <div className="flex gap-1 pt-1 border-t border-[#1C2933]">
            <button
              onClick={() => {
                onCenterArmy();
                setShowTacticalInfo(false);
              }}
              className="flex-1 py-1 rounded bg-[#16212c] hover:bg-[#173A32] text-[#36C9E8] font-bold text-[9px] text-center"
            >
              FIND ARMY
            </button>
            <button
              onClick={() => {
                onCenterHQ();
                setShowTacticalInfo(false);
              }}
              className="flex-1 py-1 rounded bg-[#16212c] hover:bg-[#173A32] text-[#38B98A] font-bold text-[9px] text-center"
            >
              BASE HQ
            </button>
          </div>
        </div>
      )}

      {/* 3. FULL EXPANDED TACTICAL RADAR MODAL (Triggered by Expand Button) */}
      {isFullRadarOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md pointer-events-auto">
          <div className="bg-[#0d141d] border border-[#1C2933] rounded-2xl p-3 shadow-2xl flex flex-col gap-2 max-w-sm w-full font-mono text-xs text-[#F4F7FA]">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-1 border-b border-[#1C2933]">
              <div className="flex items-center gap-1.5">
                <Compass className="w-4 h-4 text-[#38B98A]" />
                <span className="font-display font-bold text-sm tracking-wider uppercase text-[#38B98A]">
                  Full Strategic Radar
                </span>
              </div>
              <button
                onClick={() => setIsFullRadarOpen(false)}
                className="p-1 rounded-lg bg-[#16212c] hover:bg-[#1C2933] text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* High-Resolution Tactical Canvas */}
            <div className="relative rounded-xl overflow-hidden border border-[#1C2933] bg-[#080d16] flex justify-center cursor-crosshair">
              <canvas
                ref={fullCanvasRef}
                width={fullW}
                height={fullH}
                style={{ width: `${fullW}px`, height: `${fullH}px` }}
                onPointerDown={e => handlePointerDown(e, true)}
                onPointerMove={e => handlePointerMove(e, true)}
                onPointerUp={handlePointerUp}
                className="touch-none block"
              />
            </div>

            {/* Tactical Shortcuts & Legend */}
            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                onClick={() => {
                  onCenterHQ();
                  setIsFullRadarOpen(false);
                }}
                className="flex-1 py-1.5 rounded-lg bg-[#16212c] hover:bg-[#173A32] text-[#38B98A] font-bold text-xs flex items-center justify-center gap-1"
              >
                <Crosshair className="w-3.5 h-3.5" />
                <span>CENTER HQ</span>
              </button>
              <button
                onClick={() => {
                  onCenterArmy();
                  setIsFullRadarOpen(false);
                }}
                className="flex-1 py-1.5 rounded-lg bg-[#16212c] hover:bg-[#173A32] text-[#36C9E8] font-bold text-xs flex items-center justify-center gap-1"
              >
                <Shield className="w-3.5 h-3.5" />
                <span>CENTER ARMY</span>
              </button>
            </div>

            {/* Legend */}
            <div className="flex items-center justify-between px-1 text-[9px] text-[#A9B8C5] border-t border-[#1C2933]/60 pt-1">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#38B98A] inline-block" /> Base
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#36C9E8] inline-block" /> Army
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#E45B63] inline-block" /> Enemy
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#F2B84B] inline-block" /> Ore
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
