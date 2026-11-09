/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BUILDING_CONFIGS, UNIT_CONFIGS } from '../data/gameData';
import {
  Building,
  BuildingPlacementRecommendation,
  BuildingType,
  FloatingText,
  GameSettings,
  MapData,
  Particle,
  Projectile,
  TacticalPing,
  TreadMark,
  Unit,
  Vector2,
  TacticalIntelligence,
  DetectedThreat,
  DefenseZone,
  WeatherType,
  Wreckage,
} from '../types/game';

export interface Camera {
  x: number;
  y: number;
  zoom: number;
  rotation?: number;
}

export class TacticalRenderer {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private animFrameTime: number = 0;
  private viewMinX: number = -9999;
  private viewMaxX: number = 9999;
  private viewMinY: number = -9999;
  private viewMaxY: number = 9999;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Failed to get 2D context');
    this.ctx = context;
  }

  public render(
    currentTime: number,
    camera: Camera,
    mapData: MapData,
    fogGrid: Uint8Array,
    buildings: Building[],
    units: Unit[],
    projectiles: Projectile[],
    particles: Particle[],
    wreckages: Wreckage[],
    treadMarks: TreadMark[],
    floatingTexts: FloatingText[],
    pings: TacticalPing[],
    selectionBox: { start: Vector2; current: Vector2 } | null,
    placementPreview: {
      type: BuildingType;
      gridX: number;
      gridY: number;
      rotation?: number;
      isValid: boolean;
      reason?: string;
      recommendations?: BuildingPlacementRecommendation[];
    } | null,
    weather: WeatherType,
    dayNightPhase: number,
    screenShakeOffset: Vector2 = { x: 0, y: 0 },
    settings?: Partial<GameSettings>,
    controlGroups?: Record<number, string[]>,
    tacticalIntelligence?: TacticalIntelligence
  ) {
    this.animFrameTime = currentTime;
    const ctx = this.ctx;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = this.canvas.width / dpr;
    const cssH = this.canvas.height / dpr;

    // Mobile Frustum Culling bounds with generous margin (120px) to prevent pop-in
    const safeZoom = Math.max(0.2, camera.zoom || 1.0);
    const halfW = (cssW / 2) / safeZoom;
    const halfH = (cssH / 2) / safeZoom;
    const margin = 120;
    this.viewMinX = camera.x - halfW - margin;
    this.viewMaxX = camera.x + halfW + margin;
    this.viewMinY = camera.y - halfH - margin;
    this.viewMaxY = camera.y + halfH + margin;

    ctx.save();
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    // High-DPI scaling for crisp 2K/4K Retina rendering
    ctx.scale(dpr, dpr);

    // PRIORITY 1: Stable camera transform during all combat - camera shake bypassed
    ctx.translate(cssW / 2, cssH / 2);
    ctx.scale(safeZoom, safeZoom);
    ctx.translate(-camera.x, -camera.y);

    // 1. Render Layered Terrain Tiles & Natural Perimeter Apron
    this.renderTerrain(mapData, camera, cssW, cssH, settings);

    // 1b. Render Tactical Defense Zones Overlay (OFF by default, clean subtle lines)
    if (tacticalIntelligence && (settings?.overlays?.defenseZones ?? false)) {
      this.renderDefenseZones(tacticalIntelligence);
    }

    // 2. Render Caterpillar Tread Marks
    this.renderTreadMarks(treadMarks);

    // 3. Render Environmental Props (Rocks, Trees, Sandbags, Wrecks)
    this.renderProps(mapData);

    // 4. Render Resource Deposits (Titanium Crystals)
    this.renderResourceNodes(mapData);

    // 5. Render Vehicle Wreckage
    this.renderWreckages(wreckages);

    // 6. Render Buildings (Sorted by Y for isometric depth)
    this.renderBuildings(buildings, settings);

    // 7. Render Ground Units (Infantry & Vehicles)
    const groundUnits = units.filter(u => !UNIT_CONFIGS[u.type].isAir);
    this.renderUnits(groundUnits, settings?.unitVisibility, controlGroups, settings);

    // 8. Render Flying Aircraft (with ground shadow beneath them)
    const airUnits = units.filter(u => UNIT_CONFIGS[u.type].isAir);
    this.renderAircraft(airUnits, settings?.unitVisibility, controlGroups, settings);

    // 8b. Render Tactical Detected Threat Tracking Locks (OFF by default)
    if (tacticalIntelligence && (settings?.overlays?.enemyDetection ?? false)) {
      this.renderDetectedThreats(tacticalIntelligence);
    }

    // 9. Render Projectiles (Tracers, Cannon Shells, Missiles, Bombs)
    this.renderProjectiles(projectiles);

    // 10. Render Particles & Combat Explosions
    if (settings?.combatEffects !== false) {
      this.renderParticles(particles, settings?.smokeDensity);
    }

    // 11. Render Tactical Pings
    this.renderPings(pings);

    // 12. Render Fog of War
    if (settings?.fogOfWarEnabled !== false) {
      this.renderFogOfWar(mapData, fogGrid, camera, cssW, cssH);
    }

    // 12b. Render Radar Sensor Coverage (Only when radar building is selected or option is enabled)
    const isRadarSelected = buildings.some(b => b.type === 'radar_station' && b.faction === 'player' && b.selected);
    if (tacticalIntelligence && ((settings?.overlays?.radarCoverage ?? false) || isRadarSelected)) {
      this.renderRadarSweep(tacticalIntelligence, buildings);
    }

    // 13. Building Placement Ghost
    if (placementPreview) {
      this.renderPlacementPreview(placementPreview, mapData);
    }

    // 14. Day/Night Lighting & Weather overlay
    if (settings?.weatherEffects !== false) {
      this.renderWeatherAndLighting(mapData, weather, dayNightPhase, units);
    }

    // 15. Floating Text Indicators
    this.renderFloatingText(floatingTexts);

    ctx.restore();

    // 16. Screen-Space Selection Drag Box
    if (selectionBox) {
      this.renderSelectionBox(selectionBox, camera, cssW, cssH);
    }

    // 17. Ultra Graphics Atmospheric Depth & Cinematic Vignette
    if (!settings?.eyeComfortMode && (!settings?.graphicsQuality || settings.graphicsQuality === 'ultra' || settings.graphicsQuality === 'high')) {
      this.renderUltraAtmosphere(cssW, cssH);
    }
  }

  private renderTerrain(
    mapData: MapData,
    camera: Camera,
    screenW: number,
    screenH: number,
    settings?: Partial<GameSettings>
  ) {
    const ctx = this.ctx;
    const ts = mapData.tileSize;
    const biome = mapData.biome || 'temperate';

    // Viewport bounds culling across entire visible camera view
    const halfW = screenW / 2 / camera.zoom;
    const halfH = screenH / 2 / camera.zoom;
    const minX = Math.floor((camera.x - halfW) / ts) - 1;
    const maxX = Math.ceil((camera.x + halfW) / ts) + 1;
    const minY = Math.floor((camera.y - halfH) / ts) - 1;
    const maxY = Math.ceil((camera.y + halfH) / ts) + 1;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x * ts;
        const py = y * ts;

        // Deterministic pseudo-noise for natural variation
        const hash = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        const noise = hash - Math.floor(hash);

        // Continuous spatial harmonics for seamless macro-terrain flow (No checkerboarding or square textures)
        const wx = x * 0.14;
        const wy = y * 0.14;
        const contour = Math.sin(wx * 1.3 + wy * 0.8) * Math.cos(wx * 0.7 - wy * 1.1) + Math.sin(wx * 2.5 - wy * 1.7) * 0.3;

        // Derive organic spatial offsets for details to prevent repeating grid patterns
        const offsetX1 = 6 + Math.floor((noise * 47) % 22);
        const offsetY1 = 6 + Math.floor((noise * 79) % 22);
        const offsetX2 = 6 + Math.floor((noise * 97) % 24);
        const offsetY2 = 6 + Math.floor((noise * 31) % 24);

        // Unified primary base ground fill (Identical for in-bounds base and out-of-bounds apron: ZERO SEAMS)
        // Overlapping by 0.6px completely eliminates subpixel canvas tile seam artifacts
        if (biome === 'snow') {
          const snowLight = 92 + Math.round(contour * 3.5);
          ctx.fillStyle = `hsl(212, 18%, ${snowLight}%)`;
          ctx.fillRect(px, py, ts + 0.6, ts + 0.6);

          // Soft snow wind drifts (curved smooth strokes)
          if (noise > 0.55) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(px + offsetX1, py + offsetY1);
            ctx.quadraticCurveTo(px + ts / 2, py + 8, px + ts - 4, py + 14);
            ctx.stroke();
          }
        } else if (biome === 'desert') {
          const sandLight = 26 + Math.round(contour * 4);
          ctx.fillStyle = `hsl(36, 42%, ${sandLight}%)`;
          ctx.fillRect(px, py, ts + 0.6, ts + 0.6);

          if (noise > 0.45) {
            ctx.strokeStyle = 'rgba(217, 119, 6, 0.2)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(px + offsetX1, py + offsetY1);
            ctx.quadraticCurveTo(px + ts / 2, py + 16, px + ts - 4, py + 11);
            ctx.stroke();
          }
        } else if (biome === 'urban') {
          const urbanLight = 18 + Math.round(contour * 2.5);
          ctx.fillStyle = `hsl(35, 6%, ${urbanLight}%)`;
          ctx.fillRect(px, py, ts + 0.6, ts + 0.6);

          if (noise > 0.5) {
            ctx.fillStyle = 'rgba(40, 40, 40, 0.35)';
            ctx.beginPath();
            ctx.arc(px + offsetX1, py + offsetY1, 2, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (biome === 'volcanic') {
          // Dark obsidian rock with glowing geothermal heat veins
          const rockLight = 12 + Math.round(contour * 2.5);
          ctx.fillStyle = `hsl(15, 12%, ${rockLight}%)`;
          ctx.fillRect(px, py, ts + 0.6, ts + 0.6);

          if (noise > 0.62) {
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.45)';
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(px + offsetX1, py + offsetY1);
            ctx.lineTo(px + ts / 2, py + ts / 2);
            ctx.lineTo(px + ts - offsetX2, py + ts - offsetY2);
            ctx.stroke();

            ctx.strokeStyle = 'rgba(251, 146, 60, 0.7)';
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        } else if (biome === 'industrial') {
          // Reinforced ferro-concrete industrial ground with expansion joints
          const concLight = 16 + Math.round(contour * 2);
          ctx.fillStyle = `hsl(215, 8%, ${concLight}%)`;
          ctx.fillRect(px, py, ts + 0.6, ts + 0.6);

          ctx.strokeStyle = 'rgba(15, 23, 42, 0.4)';
          ctx.lineWidth = 0.8;
          ctx.strokeRect(px + 0.5, py + 0.5, ts, ts);

          if (noise > 0.75) {
            ctx.fillStyle = 'rgba(30, 41, 59, 0.6)';
            ctx.fillRect(px + 6, py + 6, ts - 12, ts - 12);
          }
        } else {
          // Continuous military tactical green field (flows seamlessly across tiles)
          const eyeComfort = settings?.eyeComfortMode ?? false;
          let baseColor: string;
          if (eyeComfort) {
            // Softened low-contrast warm olive slate for reduced eye fatigue
            const hue = 140 + Math.round(contour * 2);
            const sat = 18 + Math.round(contour * 2);
            const light = 18 + Math.round(contour * 2);
            baseColor = `hsl(${hue}, ${sat}%, ${light}%)`;
          } else {
            const hue = 145 + Math.round(contour * 3);
            const sat = 28 + Math.round(contour * 3);
            const light = 16 + Math.round(contour * 2.5);
            baseColor = `hsl(${hue}, ${sat}%, ${light}%)`;
          }
          ctx.fillStyle = baseColor;
          ctx.fillRect(px, py, ts + 0.6, ts + 0.6);

          // Occasional organic soil depressions (natural variation, non-repetitive)
          if (noise > 0.91) {
            const depX = px + offsetX2;
            const depY = py + offsetY2;
            const depR = 5 + noise * 4;
            ctx.fillStyle = 'rgba(15, 25, 18, 0.35)';
            ctx.beginPath();
            ctx.ellipse(depX + 1, depY + 1.2, depR + 1, (depR + 1) * 0.6, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = eyeComfort ? '#221c17' : '#261e14';
            ctx.beginPath();
            ctx.ellipse(depX, depY, depR, depR * 0.6, 0, 0, Math.PI * 2);
            ctx.fill();
          }

          // Subtle organic moss patch (sparse, low-contrast, no high-frequency repeating blades)
          if (!eyeComfort && noise > 0.88) {
            ctx.fillStyle = 'rgba(38, 78, 52, 0.4)';
            ctx.beginPath();
            ctx.ellipse(px + offsetX1, py + offsetY1, 4.5, 3, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Out-of-bounds terrain apron: seamlessly extends the natural battlefield without black voids or borders
        const isOutOfBounds = x < 0 || x >= mapData.width || y < 0 || y >= mapData.height;
        if (isOutOfBounds) {
          continue;
        }

        const tile = mapData.tiles[y][x];
        if (tile === 0) continue; // Base ground already drawn seamlessly above!

        switch (tile) {
          case 1: { // Arid Dirt / Sand / Natural Loam with organic edge blending
            const nNorth = y > 0 && mapData.tiles[y - 1]?.[x] === 1;
            const nSouth = y < mapData.height - 1 && mapData.tiles[y + 1]?.[x] === 1;
            const nWest = x > 0 && mapData.tiles[y]?.[x - 1] === 1;
            const nEast = x < mapData.width - 1 && mapData.tiles[y]?.[x + 1] === 1;

            if (biome === 'desert') {
              const sandLight = 26 + Math.round(contour * 4);
              ctx.fillStyle = `hsl(36, 42%, ${sandLight}%)`;
              ctx.fillRect(px, py, ts, ts);

              // Soft dune wind wave
              if (noise > 0.45) {
                ctx.strokeStyle = 'rgba(217, 119, 6, 0.2)';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(px + 4, py + 12);
                ctx.quadraticCurveTo(px + ts / 2, py + 16, px + ts - 4, py + 11);
                ctx.stroke();
              }
            } else {
              // Natural rich loam with smooth rounded corners avoiding harsh 40x40 square cuts
              const dirtLight = 19 + Math.round(contour * 3);
              ctx.fillStyle = `hsl(30, 24%, ${dirtLight}%)`;
              const rTL = !nNorth && !nWest ? 8 : 0;
              const rTR = !nNorth && !nEast ? 8 : 0;
              const rBR = !nSouth && !nEast ? 8 : 0;
              const rBL = !nSouth && !nWest ? 8 : 0;

              ctx.beginPath();
              ctx.roundRect(px, py, ts, ts, [rTL, rTR, rBR, rBL]);
              ctx.fill();

              // Smooth rounded pebbles
              if (noise > 0.5) {
                ctx.fillStyle = '#4a4033';
                ctx.beginPath();
                ctx.arc(px + 12 + noise * 12, py + 10 + noise * 14, 1.8, 0, Math.PI * 2);
                ctx.fill();
              }
            }
            break;
          }

          case 2: { // Paved Military Highway & Stone Bridge
            const nNorth = y > 0 && mapData.tiles[y - 1]?.[x] === 2;
            const nSouth = y < mapData.height - 1 && mapData.tiles[y + 1]?.[x] === 2;
            const nWest = x > 0 && mapData.tiles[y]?.[x - 1] === 2;
            const nEast = x < mapData.width - 1 && mapData.tiles[y]?.[x + 1] === 2;

            // Weathered military grade macadam / asphalt base
            const roadLight = 14 + Math.floor(noise * 3);
            ctx.fillStyle = `hsl(220, 8%, ${roadLight}%)`;
            ctx.fillRect(px, py, ts, ts);

            // Natural gravel/dirt shoulder blending where road meets wild terrain
            ctx.fillStyle = biome === 'desert' ? '#785633' : biome === 'snow' ? '#64748b' : '#3d382e';
            if (!nNorth) ctx.fillRect(px, py, ts, 2.5);
            if (!nSouth) ctx.fillRect(px, py + ts - 2.5, ts, 2.5);
            if (!nWest) ctx.fillRect(px, py, 2.5, ts);
            if (!nEast) ctx.fillRect(px + ts - 2.5, py, 2.5, ts);

            // Subtle vehicle tire wear marks
            const isVerticalOnly = (nNorth || nSouth) && !nWest && !nEast;
            const isHorizontalOnly = (nWest || nEast) && !nNorth && !nSouth;
            const isIntersection = (nNorth || nSouth) && (nWest || nEast);

            ctx.fillStyle = 'rgba(10, 12, 16, 0.4)';
            if (isVerticalOnly) {
              ctx.fillRect(px + 7, py, 4, ts);
              ctx.fillRect(px + ts - 11, py, 4, ts);
            } else if (isHorizontalOnly) {
              ctx.fillRect(px, py + 7, ts, 4);
              ctx.fillRect(px, py + ts - 11, ts, 4);
            }

            // Directional tactical center striping (faded military yellow)
            ctx.fillStyle = '#eab308';
            if (isVerticalOnly) {
              if (y % 2 === 0) {
                ctx.fillRect(px + ts / 2 - 1, py + 4, 2, ts - 8);
              }
            } else if (isHorizontalOnly) {
              if (x % 2 === 0) {
                ctx.fillRect(px + 4, py + ts / 2 - 1, ts - 8, 2);
              }
            } else if (isIntersection) {
              ctx.fillStyle = 'rgba(234, 179, 8, 0.5)';
              ctx.fillRect(px + ts / 2 - 2, py + ts / 2 - 2, 4, 4);
            }
            break;
          }

          case 3: // Water / River / Canal
            if (biome === 'snow') {
              // Frozen ice sheet with cracks
              ctx.fillStyle = '#0284c7';
              ctx.fillRect(px, py, ts, ts);
              ctx.fillStyle = '#38bdf8';
              ctx.fillRect(px + 2, py + 6, ts - 4, 3);
              // Translucent ice fracture
              if (noise > 0.6) {
                ctx.strokeStyle = '#e0f2fe';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(px + 4, py + 4);
                ctx.lineTo(px + 22, py + 26);
                ctx.stroke();
              }
            } else {
              // Realistic deep river water with gradient & animated caustics
              const waterGrad = ctx.createLinearGradient(px, py, px, py + ts);
              waterGrad.addColorStop(0, '#091e33');
              waterGrad.addColorStop(1, '#0e2a47');
              ctx.fillStyle = waterGrad;
              ctx.fillRect(px, py, ts, ts);

              // Animated wave ripples
              const wavePhase = this.animFrameTime * 2.2 + (x * 0.4 + y * 0.6);
              const waveY = Math.sin(wavePhase) * 3;
              ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
              ctx.fillRect(px + 6, py + 14 + waveY, ts - 12, 2.5);

              // Shoreline white-water foam
              const foamPhase = Math.sin(this.animFrameTime * 3 + x) * 2;
              ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
              ctx.fillRect(px + 2, py + 2 + foamPhase, 12, 1.5);
            }
            break;

          case 4: { // Natural Rocky Ridge / Mesa Plateau (No metal / steel stripes)
            const nNorth = y > 0 && mapData.tiles[y - 1]?.[x] === 4;
            const nSouth = y < mapData.height - 1 && mapData.tiles[y + 1]?.[x] === 4;
            const nWest = x > 0 && mapData.tiles[y]?.[x - 1] === 4;
            const nEast = x < mapData.width - 1 && mapData.tiles[y]?.[x + 1] === 4;

            // Biome-specific natural geology palette
            let baseColor: string;
            let highlightColor: string;
            let shadowColor: string;
            let crackColor: string;

            if (biome === 'desert') {
              // Warm Ochre Sandstone Mesa
              const light = 27 + Math.floor(noise * 6);
              baseColor = `hsl(28, 40%, ${light}%)`;
              highlightColor = `hsl(32, 48%, ${light + 14}%)`;
              shadowColor = `hsl(22, 42%, ${Math.max(10, light - 12)}%)`;
              crackColor = 'rgba(74, 30, 8, 0.45)';
            } else if (biome === 'snow') {
              // Glacial Frost Crag / Frozen Granite
              const light = 32 + Math.floor(noise * 6);
              baseColor = `hsl(215, 14%, ${light}%)`;
              highlightColor = 'rgba(241, 245, 249, 0.8)'; // Snow dusting
              shadowColor = `hsl(220, 20%, ${Math.max(12, light - 14)}%)`;
              crackColor = 'rgba(15, 23, 42, 0.5)';
            } else if (biome === 'urban') {
              // Weathered Masonry & Concrete Rubble
              const light = 24 + Math.floor(noise * 5);
              baseColor = `hsl(35, 6%, ${light}%)`;
              highlightColor = `hsl(35, 8%, ${light + 12}%)`;
              shadowColor = `hsl(35, 8%, ${Math.max(10, light - 10)}%)`;
              crackColor = 'rgba(20, 20, 20, 0.5)';
            } else {
              // Temperate Weathered Granite & Lichen Bluffs
              const light = 22 + Math.floor(noise * 5);
              baseColor = `hsl(100, 8%, ${light}%)`;
              highlightColor = `hsl(95, 16%, ${light + 10}%)`;
              shadowColor = `hsl(100, 10%, ${Math.max(8, light - 11)}%)`;
              crackColor = 'rgba(18, 28, 18, 0.45)';
            }

            // Fill solid organic rock body
            ctx.fillStyle = baseColor;
            ctx.fillRect(px, py, ts, ts);

            // Natural 3D beveled ridges along perimeter
            if (!nNorth) {
              ctx.fillStyle = highlightColor;
              ctx.beginPath();
              ctx.moveTo(px, py);
              ctx.lineTo(px + ts, py);
              ctx.lineTo(px + ts - 3, py + 5);
              ctx.lineTo(px + 3, py + 5);
              ctx.closePath();
              ctx.fill();
            }
            if (!nWest) {
              ctx.fillStyle = highlightColor;
              ctx.beginPath();
              ctx.moveTo(px, py);
              ctx.lineTo(px, py + ts);
              ctx.lineTo(px + 4, py + ts - 3);
              ctx.lineTo(px + 4, py + 3);
              ctx.closePath();
              ctx.fill();
            }

            // Escarpment shadow along south & east
            if (!nSouth) {
              ctx.fillStyle = shadowColor;
              ctx.beginPath();
              ctx.moveTo(px, py + ts - 6);
              ctx.lineTo(px + ts, py + ts - 6);
              ctx.lineTo(px + ts, py + ts);
              ctx.lineTo(px, py + ts);
              ctx.closePath();
              ctx.fill();

              // Drop shadow onto lower elevation
              ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
              ctx.fillRect(px, py + ts - 2, ts, 5);
            }
            if (!nEast) {
              ctx.fillStyle = shadowColor;
              ctx.beginPath();
              ctx.moveTo(px + ts - 5, py);
              ctx.lineTo(px + ts, py);
              ctx.lineTo(px + ts, py + ts);
              ctx.lineTo(px + ts - 5, py + ts);
              ctx.closePath();
              ctx.fill();
            }

            // Natural organic fissures & boulder contours (no horizontal metal bars)
            ctx.strokeStyle = crackColor;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            if (noise > 0.4) {
              const cx = px + 10 + noise * 16;
              const cy = py + 12 + noise * 12;
              ctx.arc(cx, cy, 5 + noise * 4, 0.3, Math.PI * 1.4);
            }
            if (noise > 0.65) {
              const fx = px + 8 + noise * 10;
              const fy = py + 22;
              ctx.moveTo(fx, fy);
              ctx.lineTo(fx + 6, fy + 4);
              ctx.lineTo(fx + 12, fy + 2);
            }
            ctx.stroke();

            // Biome surface details (moss/sand flecks)
            if (biome === 'temperate' && noise > 0.5) {
              ctx.fillStyle = 'rgba(77, 107, 66, 0.6)';
              ctx.beginPath();
              ctx.arc(px + 14, py + 16, 2.5, 0, Math.PI * 2);
              ctx.arc(px + 24, py + 20, 2, 0, Math.PI * 2);
              ctx.fill();
            } else if (biome === 'desert' && noise > 0.5) {
              ctx.fillStyle = 'rgba(217, 119, 6, 0.4)';
              ctx.beginPath();
              ctx.arc(px + 16, py + 14, 2, 0, Math.PI * 2);
              ctx.fill();
            }
            break;
          }

          case 5: // Forest / Dense Jungle Canopy
            ctx.fillStyle = biome === 'snow' ? '#334155' : '#0c2214';
            ctx.fillRect(px, py, ts, ts);

            // Dense tree canopies
            ctx.fillStyle = biome === 'snow' ? '#475569' : '#143820';
            ctx.beginPath();
            ctx.arc(px + 12, py + 12, 9, 0, Math.PI * 2);
            ctx.arc(px + 26, py + 22, 11, 0, Math.PI * 2);
            ctx.fill();

            // Foliage highlight
            ctx.fillStyle = biome === 'snow' ? '#f1f5f9' : '#1f5431';
            ctx.beginPath();
            ctx.arc(px + 10, py + 10, 4, 0, Math.PI * 2);
            ctx.arc(px + 24, py + 20, 5, 0, Math.PI * 2);
            ctx.fill();
            break;
        }

      }
    }
  }

  private renderTreadMarks(treadMarks: TreadMark[]) {
    const ctx = this.ctx;
    treadMarks.forEach(tm => {
      const alpha = Math.max(0, 1 - tm.life / tm.maxLife) * 0.15;
      if (alpha <= 0.01) return;
      ctx.save();
      ctx.translate(tm.x, tm.y);
      ctx.rotate(tm.rotation);
      ctx.fillStyle = `rgba(110, 95, 75, ${alpha})`;
      ctx.fillRect(-7, -5, 14, 2);
      ctx.fillRect(-7, 3, 14, 2);
      ctx.restore();
    });
  }

  private renderProps(mapData: MapData) {
    const ctx = this.ctx;
    const biome = mapData.biome || 'temperate';

    mapData.props.forEach(p => {
      if (p.x < this.viewMinX || p.x > this.viewMaxX || p.y < this.viewMinY || p.y > this.viewMaxY) return;
      ctx.save();
      ctx.translate(p.x, p.y);

      switch (p.type) {
        case 'tree': {
          // Tree drop shadow
          ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
          ctx.beginPath();
          ctx.ellipse(4, 8, p.size * 0.8, p.size * 0.45, 0, 0, Math.PI * 2);
          ctx.fill();

          // Organic sway in wind
          const sway = Math.sin(this.animFrameTime * 1.8 + p.x) * 2.5;

          // Canopy layers
          ctx.fillStyle = biome === 'snow' ? '#334155' : '#164223';
          ctx.beginPath();
          ctx.arc(sway, 0, p.size, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = biome === 'snow' ? '#94a3b8' : '#226335';
          ctx.beginPath();
          ctx.arc(sway - 3, -3, p.size * 0.7, 0, Math.PI * 2);
          ctx.fill();

          if (biome === 'snow') {
            // Snow crown
            ctx.fillStyle = '#f8fafc';
            ctx.beginPath();
            ctx.arc(sway - 2, -5, p.size * 0.4, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        }

        case 'rock': {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
          ctx.beginPath();
          ctx.ellipse(2, 4, p.size * 0.9, p.size * 0.5, 0, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#334155';
          ctx.beginPath();
          ctx.roundRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.8, 3);
          ctx.fill();

          ctx.fillStyle = '#64748b';
          ctx.fillRect(-p.size / 2 + 2, -p.size / 2 + 2, p.size * 0.5, p.size * 0.3);
          break;
        }

        case 'sandbags': {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
          ctx.fillRect(-p.size / 2 + 2, 4, p.size, 6);

          ctx.fillStyle = '#78716c';
          ctx.beginPath();
          ctx.roundRect(-p.size / 2, -6, p.size, 12, 2);
          ctx.fill();

          ctx.strokeStyle = '#44403c';
          ctx.lineWidth = 1;
          for (let i = -p.size / 2 + 6; i < p.size / 2; i += 8) {
            ctx.beginPath();
            ctx.moveTo(i, -6);
            ctx.lineTo(i, 6);
            ctx.stroke();
          }
          break;
        }

        case 'wreck': {
          ctx.rotate(p.rotation);
          ctx.fillStyle = '#1c1917';
          ctx.fillRect(-12, -7, 24, 14);
          ctx.fillStyle = '#ea580c';
          ctx.beginPath();
          ctx.arc(0, 0, 3, 0, Math.PI * 2);
          ctx.fill();
          break;
        }

        case 'bush': {
          // Directional soft ground drop-shadow (cast toward south-east)
          ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
          ctx.beginPath();
          ctx.ellipse(p.size * 0.25, p.size * 0.35, p.size * 0.8, p.size * 0.44, 0, 0, Math.PI * 2);
          ctx.fill();

          // Biome-aware rich palette
          const darkTone = biome === 'snow' ? '#1e293b' : biome === 'desert' ? '#5a4224' : '#14381e';
          const midTone = biome === 'snow' ? '#334155' : biome === 'desert' ? '#785633' : '#1f592f';
          const lightTone = biome === 'snow' ? '#64748b' : biome === 'desert' ? '#9c7344' : '#308044';
          const highlightTone = biome === 'snow' ? '#cbd5e1' : biome === 'desert' ? '#c2975f' : '#4ade80';

          const r = p.size * 0.55;
          const varOffset = ((p.variant || 0) * 0.15);

          // Deep base foliage lobe
          ctx.fillStyle = darkTone;
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fill();

          // Midtone volumetric foliage dome
          ctx.fillStyle = midTone;
          ctx.beginPath();
          ctx.arc(-r * 0.2, -r * 0.25, r * 0.82, 0, Math.PI * 2);
          ctx.arc(r * 0.25, -r * 0.15, r * 0.72, 0, Math.PI * 2);
          ctx.arc(0, r * 0.1, r * 0.78, 0, Math.PI * 2);
          ctx.fill();

          // Top-lit leaf highlight layer (North-West directional sun)
          ctx.fillStyle = lightTone;
          ctx.beginPath();
          ctx.arc(-r * 0.3, -r * 0.35, r * 0.58 + varOffset, 0, Math.PI * 2);
          ctx.arc(r * 0.1, -r * 0.4, r * 0.48, 0, Math.PI * 2);
          ctx.fill();

          // Crisp top leaf flecks
          ctx.fillStyle = highlightTone;
          ctx.beginPath();
          ctx.arc(-r * 0.35, -r * 0.42, r * 0.28, 0, Math.PI * 2);
          ctx.arc(r * 0.05, -r * 0.48, r * 0.22, 0, Math.PI * 2);
          ctx.fill();
          break;
        }

        case 'bush_cluster': {
          // Combined soft ground shadow for the cluster
          ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
          ctx.beginPath();
          ctx.ellipse(3, 5, p.size * 0.95, p.size * 0.52, 0, 0, Math.PI * 2);
          ctx.fill();

          const darkTone = biome === 'snow' ? '#1e293b' : biome === 'desert' ? '#5a4224' : '#14381e';
          const midTone = biome === 'snow' ? '#334155' : biome === 'desert' ? '#785633' : '#1f592f';
          const lightTone = biome === 'snow' ? '#64748b' : biome === 'desert' ? '#9c7344' : '#308044';
          const highlightTone = biome === 'snow' ? '#cbd5e1' : biome === 'desert' ? '#c2975f' : '#4ade80';

          // Sub-bushes in isometric cluster
          const subBushes = [
            { ox: -p.size * 0.32, oy: -p.size * 0.12, r: p.size * 0.38 },
            { ox: p.size * 0.28, oy: -p.size * 0.18, r: p.size * 0.34 },
            { ox: -p.size * 0.05, oy: p.size * 0.18, r: p.size * 0.42 },
            { ox: p.size * 0.22, oy: p.size * 0.12, r: p.size * 0.32 },
          ];

          subBushes.forEach(sb => {
            // Shadow base
            ctx.fillStyle = darkTone;
            ctx.beginPath();
            ctx.arc(sb.ox, sb.oy, sb.r, 0, Math.PI * 2);
            ctx.fill();

            // Midtone body
            ctx.fillStyle = midTone;
            ctx.beginPath();
            ctx.arc(sb.ox - sb.r * 0.15, sb.oy - sb.r * 0.2, sb.r * 0.85, 0, Math.PI * 2);
            ctx.fill();

            // Top highlight
            ctx.fillStyle = lightTone;
            ctx.beginPath();
            ctx.arc(sb.ox - sb.r * 0.25, sb.oy - sb.r * 0.3, sb.r * 0.58, 0, Math.PI * 2);
            ctx.fill();

            // Specular leaf tip
            ctx.fillStyle = highlightTone;
            ctx.beginPath();
            ctx.arc(sb.ox - sb.r * 0.3, sb.oy - sb.r * 0.35, sb.r * 0.26, 0, Math.PI * 2);
            ctx.fill();
          });
          break;
        }

        case 'wild_grass': {
          const sway = Math.sin(this.animFrameTime * 2.5 + p.x) * 2;
          const grassColor = biome === 'snow' ? '#64748b' : biome === 'desert' ? '#9c7344' : '#22c55e';
          const shadowGrass = biome === 'snow' ? '#1e293b' : biome === 'desert' ? '#5a4224' : '#14381e';

          ctx.lineWidth = 1.4;
          // Blade 1
          ctx.strokeStyle = shadowGrass;
          ctx.beginPath();
          ctx.moveTo(-4, 4);
          ctx.quadraticCurveTo(-6, -6, -9 + sway * 0.5, -p.size);
          ctx.stroke();

          // Blade 2 (center tall)
          ctx.strokeStyle = grassColor;
          ctx.beginPath();
          ctx.moveTo(0, 4);
          ctx.quadraticCurveTo(2, -8, 1 + sway, -p.size * 1.2);
          ctx.stroke();

          // Blade 3
          ctx.beginPath();
          ctx.moveTo(4, 4);
          ctx.quadraticCurveTo(6, -5, 8 + sway * 0.7, -p.size * 0.9);
          ctx.stroke();
          break;
        }
      }

      ctx.restore();
    });
  }

  private renderResourceNodes(mapData: MapData) {
    const ctx = this.ctx;
    const ts = mapData.tileSize;

    mapData.resourceNodes.forEach(node => {
      const px = node.x * ts + ts / 2;
      const py = node.y * ts + ts / 2;
      const pulse = 0.85 + Math.sin(this.animFrameTime * 3 + node.x) * 0.15;

      ctx.save();
      ctx.translate(px, py);

      // Glowing aura
      const grad = ctx.createRadialGradient(0, 0, 4, 0, 0, 30 * pulse);
      grad.addColorStop(0, 'rgba(6, 182, 212, 0.5)');
      grad.addColorStop(1, 'rgba(6, 182, 212, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, 30 * pulse, 0, Math.PI * 2);
      ctx.fill();

      // Sharp crystal clusters
      const crystals = [
        { angle: -0.4, length: 19, color: '#22d3ee' },
        { angle: 0.3, length: 23, color: '#06b6d4' },
        { angle: 1.2, length: 17, color: '#38bdf8' },
        { angle: 2.3, length: 21, color: '#0284c7' },
        { angle: -1.8, length: 16, color: '#67e8f9' },
      ];

      crystals.forEach(c => {
        ctx.save();
        ctx.rotate(c.angle);
        ctx.fillStyle = c.color;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-4, -c.length * 0.4);
        ctx.lineTo(0, -c.length);
        ctx.lineTo(4, -c.length * 0.4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      });

      ctx.fillStyle = '#67e8f9';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`TITANIUM`, 0, 24);

      ctx.restore();
    });
  }

  private renderWreckages(wreckages: Wreckage[]) {
    const ctx = this.ctx;
    wreckages.forEach(w => {
      ctx.save();
      ctx.translate(w.x, w.y);
      ctx.rotate(w.rotation);

      ctx.fillStyle = 'rgba(10, 10, 15, 0.6)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 18, 14, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#1c1917';
      ctx.fillRect(-12, -8, 24, 16);

      const flicker = Math.sin(this.animFrameTime * 8 + w.x) * 2;
      ctx.fillStyle = '#ea580c';
      ctx.beginPath();
      ctx.arc(flicker, -2, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    });
  }

  public getBuildingElevation(type: BuildingType): number {
    switch (type) {
      case 'headquarters':
        return 34;
      case 'vehicle_factory':
      case 'airfield':
        return 28;
      case 'power_plant':
      case 'barracks':
      case 'field_hospital':
      case 'coin_generator':
      case 'supply_depot':
      case 'research_lab':
      case 'radar_station':
      case 'repair_bay':
      case 'heavy_turret':
      case 'helipad':
      case 'turret_missile':
        return 22;
      case 'turret_gun':
      case 'turret_aa':
      case 'defense_wall':
      default:
        return 14;
    }
  }

  private renderBuildings(buildings: Building[], settings?: Partial<GameSettings>) {
    const ctx = this.ctx;
    const sorted = [...buildings].sort((a, b) => a.pixelY - b.pixelY);

    sorted.forEach(b => {
      if (b.hp <= 0) return;
      const isPlayer = b.faction === 'player';
      const accentColor = isPlayer ? '#38B98A' : '#E45B63';
      const baseBodyColor = isPlayer ? '#141d28' : '#281414';
      const roofColor = isPlayer ? '#1e293b' : '#3d1d1d';

      const w = b.width * 40;
      const h = b.height * 40;
      const elev = this.getBuildingElevation(b.type);

      // Frustum culling for mobile GPU performance
      if (
        b.pixelX + w < this.viewMinX ||
        b.pixelX - w > this.viewMaxX ||
        b.pixelY + h < this.viewMinY ||
        b.pixelY - h - elev > this.viewMaxY
      ) {
        return;
      }

      const x = b.pixelX - w / 2;
      const y = b.pixelY - h / 2;
      const roofY = y - elev;

      ctx.save();

      // 1. Directional Soft Ground Shadow (cast toward south-east)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.roundRect(x + 6, y + 8, w + elev * 0.45, h + elev * 0.35, 6);
      ctx.fill();

      // 2. Integrated Architectural Foundation Footing (flush beneath walls, no artificial platform)
      ctx.fillStyle = isPlayer ? '#16202c' : '#261616';
      ctx.beginPath();
      ctx.roundRect(x + 2, y + 2, w - 4, h - 4, 3);
      ctx.fill();

      // 3. 2.5D Vertical Front Wall Facet (Extruded height between ground and elevated roof)
      if (elev > 0) {
        ctx.fillStyle = baseBodyColor;
        ctx.fillRect(x + 2, y + h - elev, w - 4, elev);

        // Front wall shadow & border
        ctx.strokeStyle = '#090e14';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 2, y + h - elev, w - 4, elev);

        // Vertical armored reinforcement ribs on the front face
        const ribStep = Math.max(16, Math.floor(w / 4));
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.lineWidth = 1;
        for (let rx = x + ribStep; rx < x + w - 6; rx += ribStep) {
          ctx.beginPath();
          ctx.moveTo(rx, y + h - elev);
          ctx.lineTo(rx, y + h);
          ctx.stroke();
        }
      }

      // 4. Armored Elevated Structure Roof Deck (Layer 2)
      ctx.fillStyle = roofColor;
      ctx.beginPath();
      ctx.roundRect(x + 2, roofY + 2, w - 4, h - 4, 3);
      ctx.fill();

      // Top edge highlight (directional sunlight from north-west)
      ctx.strokeStyle = isPlayer ? '#475569' : '#572727';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Roof panel seams
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 4, roofY + h / 2);
      ctx.lineTo(x + w - 4, roofY + h / 2);
      ctx.stroke();

      // 5. Building-Specific Architecture (Elevated on the Roof Deck)
      this.renderBuildingDetails(b, x, roofY, w, h, isPlayer, accentColor);

      // 6. Damage States (scorched armor, fracture cracks, rising smoke & fire embers)
      if (b.hp < b.maxHp * 0.6) {
        const cx = b.pixelX;
        const cy = roofY + h / 2;

        // Hull scorch marks
        ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
        ctx.beginPath();
        ctx.arc(cx - w * 0.2, cy - h * 0.15, w * 0.2, 0, Math.PI * 2);
        ctx.arc(cx + w * 0.15, cy + h * 0.15, w * 0.16, 0, Math.PI * 2);
        ctx.fill();

        // Structural stress fractures
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx - w * 0.25, cy);
        ctx.lineTo(cx - w * 0.1, cy - h * 0.18);
        ctx.lineTo(cx + w * 0.05, cy - h * 0.08);
        ctx.stroke();

        // Rising smoke plume when heavily damaged (< 40% HP)
        if (b.hp < b.maxHp * 0.4) {
          const smokeAlpha = 0.45 + Math.sin(this.animFrameTime * 4) * 0.15;
          ctx.fillStyle = `rgba(30, 41, 59, ${smokeAlpha})`;
          const puffY = (this.animFrameTime * 15) % 18;
          ctx.beginPath();
          ctx.arc(cx - 8, cy - h * 0.3 - puffY, 7 + puffY * 0.4, 0, Math.PI * 2);
          ctx.fill();

          // Fire flame flickers when critical (< 25% HP)
          if (b.hp < b.maxHp * 0.25) {
            const flicker = Math.sin(this.animFrameTime * 18) * 3;
            ctx.fillStyle = '#f97316';
            ctx.beginPath();
            ctx.arc(cx - 8 + flicker * 0.5, cy - h * 0.2, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#facc15';
            ctx.beginPath();
            ctx.arc(cx - 8, cy - h * 0.22, 2.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // 7. Construction scaffolding if building
      if (b.constructionProgress < 1) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
        ctx.fillRect(x, roofY, w, h + elev);

        ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, roofY);
        ctx.lineTo(x + w, y + h);
        ctx.moveTo(x + w, roofY);
        ctx.lineTo(x, y + h);
        ctx.moveTo(x + w * 0.33, roofY);
        ctx.lineTo(x + w * 0.33, y + h);
        ctx.moveTo(x + w * 0.66, roofY);
        ctx.lineTo(x + w * 0.66, y + h);
        ctx.stroke();

        // Yellow Crane at top corner
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(x + w - 16, roofY - 8, 16, 4);
        ctx.fillRect(x + w - 10, roofY - 14, 4, 10);
        const hookY = roofY + (h * 0.75) * (1 - b.constructionProgress);
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + w - 14, roofY - 4);
        ctx.lineTo(x + w - 14, hookY);
        ctx.stroke();
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(x + w - 16, hookY, 4, 4);

        // Progress bar
        const barW = Math.min(w - 12, 90);
        const barX = b.pixelX - barW / 2;
        const barY = roofY + h / 2 - 5;
        ctx.fillStyle = 'rgba(16, 24, 32, 0.95)';
        ctx.fillRect(barX - 1, barY - 1, barW + 2, 10);
        ctx.fillStyle = '#38B98A';
        ctx.fillRect(barX, barY, barW * b.constructionProgress, 8);

        ctx.fillStyle = '#F4F7FA';
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(b.constructionProgress * 100)}%`, b.pixelX, barY + 7);
      }

      // 8. Selection bracket (wrapping 2.5D structure)
      if (b.selected) {
        ctx.strokeStyle = '#36C9E8';
        ctx.lineWidth = 2;
        const pad = 5;
        const corner = 10;
        const topY = roofY - pad;
        const botY = y + h + pad;
        ctx.beginPath();
        ctx.moveTo(x - pad, topY + corner);
        ctx.lineTo(x - pad, topY);
        ctx.lineTo(x - pad + corner, topY);
        ctx.moveTo(x + w + pad - corner, topY);
        ctx.lineTo(x + w + pad, topY);
        ctx.lineTo(x + w + pad, topY + corner);
        ctx.moveTo(x - pad, botY - corner);
        ctx.lineTo(x - pad, botY);
        ctx.lineTo(x - pad + corner, botY);
        ctx.moveTo(x + w + pad - corner, botY);
        ctx.lineTo(x + w + pad, botY);
        ctx.lineTo(x + w + pad, botY - corner);
        ctx.stroke();
      }

      // 9. Health bar & indicators
      if (b.selected || b.hp < b.maxHp) {
        const safeMax = Math.max(1, Math.round(Number.isFinite(b.maxHp) ? b.maxHp : 100));
        const safeHp = Math.max(0, Math.min(safeMax, Math.round(Number.isFinite(b.hp) ? b.hp : 0)));
        const hpRatio = safeHp / safeMax;
        const barW = Math.min(w, 80);
        const barX = b.pixelX - barW / 2;
        const barY = roofY - 14;

        ctx.fillStyle = 'rgba(16, 24, 32, 0.95)';
        ctx.fillRect(barX - 1, barY - 1, barW + 2, 7);

        ctx.fillStyle = hpRatio > 0.5 ? '#38B98A' : hpRatio > 0.25 ? '#F2B84B' : '#E45B63';
        ctx.fillRect(barX, barY, barW * hpRatio, 5);

        if (b.selected) {
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 8px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(`${safeHp}/${safeMax} HP`, b.pixelX, barY - 3);
        }

        if (b.isRepairing) {
          ctx.fillStyle = '#36C9E8';
          ctx.font = 'bold 9px monospace';
          ctx.fillText('🔧 REPAIR', barX + barW + 4, barY + 5);
        }
      }

      // 10. Tactical Rally Point Visualization
      if (b.selected && isPlayer && b.rallyPoint) {
        const rpx = b.rallyPoint.x;
        const rpy = b.rallyPoint.y;
        const exitX = b.pixelX;
        const exitY = b.pixelY + h / 2;

        ctx.save();
        ctx.strokeStyle = '#38B98A';
        ctx.lineWidth = 1.5;
        const dashOffset = (this.animFrameTime * 18) % 16;
        ctx.lineDashOffset = -dashOffset;
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.moveTo(exitX, exitY);
        ctx.lineTo(rpx, rpy);
        ctx.stroke();
        ctx.setLineDash([]);

        const pulse = Math.sin(this.animFrameTime * 5) * 3;
        ctx.strokeStyle = 'rgba(56, 185, 138, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(rpx, rpy, 15 + pulse, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = '#38B98A';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(rpx, rpy, 8, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = '#f1f5f9';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(rpx, rpy);
        ctx.lineTo(rpx, rpy - 24);
        ctx.stroke();

        const wave = Math.sin(this.animFrameTime * 7) * 2.5;
        ctx.fillStyle = '#38B98A';
        ctx.beginPath();
        ctx.moveTo(rpx, rpy - 24);
        ctx.lineTo(rpx + 14 + wave, rpy - 18);
        ctx.lineTo(rpx, rpy - 12);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = 'rgba(12, 20, 28, 0.92)';
        ctx.beginPath();
        ctx.roundRect(rpx - 34, rpy + 8, 68, 16, 3);
        ctx.fill();
        ctx.strokeStyle = '#38B98A';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = '#38B98A';
        ctx.font = 'bold 8px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('RALLY POINT', rpx, rpy + 19);
        ctx.restore();
      }

      // 11. Subtle Optional Overlays: Building Footprint & Attack Range (OFF by default)
      if (settings?.overlays?.buildingFootprints) {
        ctx.save();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(x, y, w, h);
        ctx.restore();
      }

      const bCfg = BUILDING_CONFIGS[b.type];
      if (b.selected && (settings?.overlays?.attackRange ?? false) && bCfg?.range) {
        ctx.save();
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.45)';
        ctx.fillStyle = 'rgba(239, 68, 68, 0.04)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.arc(b.pixelX, b.pixelY, bCfg.range, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore();
    });
  }

  private renderBuildingDetails(
    b: Building,
    x: number,
    y: number,
    w: number,
    h: number,
    isPlayer: boolean,
    accentColor: string
  ) {
    const ctx = this.ctx;
    const cx = x + w / 2;
    const cy = y + h / 2;

    switch (b.type) {
      case 'headquarters': {
        // Multi-tier Fortified Citadel Base (Tier 1 Chamfered Octagonal Plinth)
        const octRadius = Math.min(w, h) * 0.38;
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const angle = (i * Math.PI) / 4 + Math.PI / 8;
          const hx = cx + Math.cos(angle) * octRadius;
          const hy = cy + Math.sin(angle) * octRadius;
          if (i === 0) ctx.moveTo(hx, hy);
          else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Tier 2 Raised Command Deck Platform
        const tier2W = w * 0.48;
        const tier2H = h * 0.44;
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.roundRect(cx - tier2W / 2, cy - tier2H / 2, tier2W, tier2H, 5);
        ctx.fill();
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Armored Penthouse Superstructure with Tactical C4I Glass Slits
        const penthouseW = w * 0.3;
        const penthouseH = h * 0.28;
        ctx.fillStyle = '#0d1520';
        ctx.beginPath();
        ctx.roundRect(cx - penthouseW / 2, cy - penthouseH / 2, penthouseW, penthouseH, 4);
        ctx.fill();
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Glowing Blue Tactical Observation Glass Slits
        const glassW = penthouseW * 0.75;
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(cx - glassW / 2, cy - penthouseH * 0.35, glassW, 3);
        ctx.fillRect(cx - glassW / 2, cy - penthouseH * 0.1, glassW, 3);

        // Satellite Communications Dome
        const domeR = Math.min(w, h) * 0.07;
        ctx.fillStyle = '#e2e8f0';
        ctx.beginPath();
        ctx.arc(cx + w * 0.15, cy - h * 0.12, domeR, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 1;
        ctx.stroke();

        // 360-degree Rotating Tactical Radar Dish
        const radarAngle = this.animFrameTime * 2.5;
        const dishW = Math.min(w, h) * 0.16;
        const dishH = Math.min(w, h) * 0.07;
        ctx.save();
        ctx.translate(cx, cy + h * 0.04);
        ctx.rotate(radarAngle);
        ctx.fillStyle = '#f8fafc';
        ctx.beginPath();
        ctx.ellipse(0, 0, dishW, dishH, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = accentColor;
        ctx.fillRect(dishW * 0.5, -2, dishW * 0.4, 4);
        ctx.restore();

        // Twin Rooftop Lattice Communications Masts with Blinking Aviation Beacons
        const beaconPulse = Math.sin(this.animFrameTime * 6) > 0 ? 1 : 0.2;
        ctx.fillStyle = `rgba(239, 68, 68, ${beaconPulse})`;
        // West Antenna Mast
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx - w * 0.2, cy - h * 0.12);
        ctx.lineTo(cx - w * 0.2, cy - h * 0.28);
        ctx.moveTo(cx - w * 0.24, cy - h * 0.22);
        ctx.lineTo(cx - w * 0.16, cy - h * 0.22);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx - w * 0.2, cy - h * 0.28, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // East Antenna Mast
        ctx.beginPath();
        ctx.moveTo(cx + w * 0.2, cy + h * 0.12);
        ctx.lineTo(cx + w * 0.2, cy + h * 0.26);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx + w * 0.2, cy + h * 0.26, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Reinforced Blast Doors with High-Contrast Caution Chevrons
        const doorW = w * 0.28;
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(cx - doorW / 2, y + h - 10, doorW, 8);
        ctx.fillStyle = '#eab308';
        for (let i = -doorW / 2 + 2; i < doorW / 2 - 2; i += 6) {
          ctx.fillRect(cx + i, y + h - 10, 3, 8);
        }
        break;
      }

      case 'airfield': {
        // Heavy Paved Asphalt Runway Strip
        const rwW = w - 16;
        const rwH = h * 0.42;
        ctx.fillStyle = '#141820';
        ctx.fillRect(cx - rwW / 2, cy - rwH / 2, rwW, rwH);

        // Centerline dashed runway line
        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(cx - rwW / 2 + 6, cy);
        ctx.lineTo(cx + rwW / 2 - 6, cy);
        ctx.stroke();
        ctx.setLineDash([]);

        // Piano Key Threshold Stripes
        ctx.fillStyle = '#ffffff';
        for (let i = -rwH / 2 + 3; i <= rwH / 2 - 3; i += 5) {
          ctx.fillRect(cx - rwW / 2 + 2, cy + i, 4, 3);
          ctx.fillRect(cx + rwW / 2 - 6, cy + i, 4, 3);
        }

        // Green Threshold Approach Lights
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(cx - rwW / 2, cy - rwH / 2, 2, rwH);
        ctx.fillRect(cx + rwW / 2 - 2, cy - rwH / 2, 2, rwH);

        // Air Traffic Control Tower
        ctx.fillStyle = '#334155';
        ctx.fillRect(cx - w * 0.35, y + 4, 14, 14);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(cx - w * 0.35 + 2, y + 6, 10, 10);
        break;
      }

      case 'helipad': {
        // Octagonal Concrete Landing Deck
        const padR = Math.min(w, h) * 0.35;
        ctx.fillStyle = '#1a202c';
        ctx.beginPath();
        ctx.arc(cx, cy, padR, 0, Math.PI * 2);
        ctx.fill();

        // Perimeter Aviation Guide Ring
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Bold Tactical 'H' Insignia
        ctx.fillStyle = '#f59e0b';
        ctx.font = `bold ${Math.round(padR * 0.85)}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('H', cx, cy);

        // 4 Corner Strobe Approach Beacons
        const strobe = Math.sin(this.animFrameTime * 5) > 0 ? '#38bdf8' : '#0284c7';
        ctx.fillStyle = strobe;
        const beaconOffset = padR * 0.72;
        ctx.beginPath();
        ctx.arc(cx - beaconOffset, cy - beaconOffset, 2.5, 0, Math.PI * 2);
        ctx.arc(cx + beaconOffset, cy - beaconOffset, 2.5, 0, Math.PI * 2);
        ctx.arc(cx - beaconOffset, cy + beaconOffset, 2.5, 0, Math.PI * 2);
        ctx.arc(cx + beaconOffset, cy + beaconOffset, 2.5, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'supply_depot': {
        // Multi-color Freight Shipping Containers arranged neatly within footprint
        const contW = w * 0.36;
        const contH = h * 0.22;
        const containers = [
          { dx: -w * 0.24, dy: -h * 0.22, color: '#0369a1' },
          { dx: w * 0.04, dy: -h * 0.22, color: '#b45309' },
          { dx: -w * 0.2, dy: h * 0.04, color: '#15803d' },
          { dx: w * 0.08, dy: h * 0.04, color: '#b91c1c' },
        ];

        containers.forEach(c => {
          ctx.fillStyle = c.color;
          ctx.fillRect(cx + c.dx, cy + c.dy, contW, contH);
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 1;
          ctx.strokeRect(cx + c.dx, cy + c.dy, contW, contH);
        });

        // Communication antenna pole
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy - h * 0.22);
        ctx.lineTo(cx, cy - h * 0.38);
        ctx.stroke();
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(cx, cy - h * 0.38, 2, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'heavy_turret': {
        // Armored Turret Base Turntable
        const baseR = Math.min(w, h) * 0.28;
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(cx, cy, baseR, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Dual 203mm Rifled Heavy Barrels
        const angle = b.targetUnitId ? this.animFrameTime * 2 : 0;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);

        ctx.fillStyle = '#475569';
        const barrelLen = baseR * 1.5;
        // Left Cannon
        ctx.fillRect(4, -8, barrelLen, 5);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(4 + barrelLen, -9, 4, 7); // Muzzle brake

        // Right Cannon
        ctx.fillStyle = '#475569';
        ctx.fillRect(4, 3, barrelLen, 5);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(4 + barrelLen, 2, 4, 7); // Muzzle brake

        // Turret Armor Mantlet
        ctx.fillStyle = '#334155';
        ctx.beginPath();
        ctx.arc(0, 0, baseR * 0.72, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }

      case 'power_plant': {
        // Twin Hyperbolic Cooling Towers
        const towerR = Math.min(w, h) * 0.2;
        const towerOffset = w * 0.22;
        ctx.fillStyle = '#334155';
        ctx.beginPath();
        ctx.arc(cx - towerOffset, cy, towerR, 0, Math.PI * 2);
        ctx.arc(cx + towerOffset, cy, towerR, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.arc(cx - towerOffset, cy, towerR * 0.65, 0, Math.PI * 2);
        ctx.arc(cx + towerOffset, cy, towerR * 0.65, 0, Math.PI * 2);
        ctx.fill();

        // Glowing Plasma Fusion Reactor Core
        const corePulse = 0.7 + Math.sin(this.animFrameTime * 5) * 0.3;
        const glowR = Math.min(w, h) * 0.24;
        const glowGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, glowR);
        glowGrad.addColorStop(0, `rgba(54, 201, 232, ${corePulse})`);
        glowGrad.addColorStop(1, 'rgba(54, 201, 232, 0)');
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
        ctx.fill();

        // 4 Containment Pylon Posts with Animated Plasma Lightning Arcs
        const pylonDist = Math.min(w, h) * 0.26;
        const pylonAngles = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
        ctx.fillStyle = '#475569';
        pylonAngles.forEach(pa => {
          const px = cx + Math.cos(pa) * pylonDist;
          const py = cy + Math.sin(pa) * pylonDist;
          ctx.beginPath();
          ctx.arc(px, py, 3, 0, Math.PI * 2);
          ctx.fill();

          if (Math.sin(this.animFrameTime * 12 + pa) > 0.4) {
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(px, py);
            const midX = (px + cx) / 2 + Math.sin(this.animFrameTime * 20) * 3;
            const midY = (py + cy) / 2 + Math.cos(this.animFrameTime * 20) * 3;
            ctx.lineTo(midX, midY);
            ctx.lineTo(cx, cy);
            ctx.stroke();
          }
        });

        // Containment Ring
        ctx.strokeStyle = '#36C9E8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.min(w, h) * 0.12, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }

      case 'coin_generator': {
        // Heavy Industrial Titanium Refining Mill Body
        const millW = w * 0.68;
        const millH = h * 0.44;
        ctx.fillStyle = '#334155';
        ctx.fillRect(cx - millW / 2, cy - millH / 2, millW, millH);

        // Twin Pressurized Ore Storage Silos (North side)
        const silorR = Math.min(w, h) * 0.13;
        [-silorR * 1.5, silorR * 1.5].forEach(sx => {
          ctx.fillStyle = '#475569';
          ctx.beginPath();
          ctx.arc(cx + sx, cy - millH * 0.35, silorR, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#64748b';
          ctx.lineWidth = 1;
          ctx.stroke();
          // Silo dome cap highlight
          ctx.fillStyle = '#94a3b8';
          ctx.beginPath();
          ctx.arc(cx + sx - 1, cy - millH * 0.35 - 1, silorR * 0.4, 0, Math.PI * 2);
          ctx.fill();
        });

        // Connecting Conduit Pipes
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - silorR * 1.5, cy - millH * 0.35);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx + silorR * 1.5, cy - millH * 0.35);
        ctx.stroke();

        // Rotating Ore Crusher Drum
        const drumAngle = this.animFrameTime * 4;
        const drumR = Math.min(w, h) * 0.16;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(drumAngle);
        ctx.fillStyle = '#475569';
        ctx.beginPath();
        ctx.arc(0, 0, drumR, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(-2, -drumR, 4, drumR * 2);
        ctx.fillRect(-drumR, -2, drumR * 2, 4);
        ctx.restore();

        // Titanium Crystal Collector Hopper
        ctx.fillStyle = '#06b6d4';
        ctx.fillRect(cx + millW / 2 - 10, cy - h * 0.12, 10, h * 0.24);
        ctx.fillStyle = '#22d3ee';
        ctx.fillRect(cx + millW / 2 - 8, cy - h * 0.08, 6, h * 0.16);
        break;
      }

      case 'barracks': {
        // Concrete Staging Pad & Blast Berm Foundation
        const barrW = w * 0.76;
        const barrH = h * 0.52;
        ctx.fillStyle = '#1c2430';
        ctx.beginPath();
        ctx.roundRect(cx - barrW / 2, cy - barrH / 2, barrW, barrH, 6);
        ctx.fill();
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Quonset Corrugated Steel Hangar Vault
        const vaultW = barrW * 0.88;
        const vaultH = barrH * 0.82;
        ctx.fillStyle = '#2d3a4a';
        ctx.beginPath();
        ctx.roundRect(cx - vaultW / 2, cy - vaultH / 2, vaultW, vaultH, 8);
        ctx.fill();

        // Structural Heavy Steel Arch Corrugation Ribs
        ctx.strokeStyle = '#182230';
        ctx.lineWidth = 2;
        const ribStep = vaultW / 6;
        for (let i = -vaultW / 2 + ribStep; i < vaultW / 2; i += ribStep) {
          ctx.beginPath();
          ctx.moveTo(cx + i, cy - vaultH / 2);
          ctx.lineTo(cx + i, cy + vaultH / 2);
          ctx.stroke();
        }

        // Fortified Sandbag Perimeter Wall / Revetments
        ctx.fillStyle = '#78716c';
        ctx.beginPath();
        ctx.roundRect(cx - vaultW / 2, cy + vaultH / 2 - 2, vaultW, 6, 2);
        ctx.fill();

        // Reinforced Steel Airlock Double Doors
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(cx - 9, cy + vaultH / 2 - 6, 18, 9);
        ctx.strokeStyle = '#38B98A';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, cy + vaultH / 2 - 6);
        ctx.lineTo(cx, cy + vaultH / 2 + 3);
        ctx.stroke();
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(cx - 7, cy + vaultH / 2 - 4, 3, 2);
        ctx.fillRect(cx + 4, cy + vaultH / 2 - 4, 3, 2);

        // Security Floodlights
        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(cx - vaultW / 2 + 4, cy - vaultH / 2 + 3, 2, 0, Math.PI * 2);
        ctx.arc(cx + vaultW / 2 - 4, cy - vaultH / 2 + 3, 2, 0, Math.PI * 2);
        ctx.fill();

        // Faction Tactical Emblem
        ctx.fillStyle = accentColor;
        ctx.beginPath();
        ctx.arc(cx, cy - 2, 4, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'vehicle_factory': {
        // Reinforced Heavy Assembly Hangar Body
        const vFactW = w * 0.78;
        const vFactH = h * 0.58;
        ctx.fillStyle = '#151e28';
        ctx.fillRect(cx - vFactW / 2, cy - vFactH / 2, vFactW, vFactH);
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 2;
        ctx.strokeRect(cx - vFactW / 2, cy - vFactH / 2, vFactW, vFactH);

        // Saw-tooth Pitched Industrial Roof Panels with Skylights
        ctx.fillStyle = '#222f3e';
        const sawW = vFactW / 4;
        for (let i = -vFactW / 2 + 4; i < vFactW / 2 - 4; i += sawW) {
          ctx.beginPath();
          ctx.moveTo(cx + i, cy - vFactH / 2);
          ctx.lineTo(cx + i + sawW * 0.7, cy - vFactH / 2);
          ctx.lineTo(cx + i + sawW, cy - vFactH * 0.2);
          ctx.lineTo(cx + i, cy - vFactH * 0.2);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = 'rgba(56, 189, 248, 0.4)';
          ctx.fillRect(cx + i + 2, cy - vFactH / 2 + 2, sawW * 0.5, 3);
          ctx.fillStyle = '#222f3e';
        }

        // Overhead Heavy Yellow Crane Gantry Track
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - vFactW / 2 + 4, cy - vFactH * 0.2);
        ctx.lineTo(cx + vFactW / 2 - 4, cy - vFactH * 0.2);
        ctx.moveTo(cx - vFactW / 2 + 4, cy + vFactH * 0.2);
        ctx.lineTo(cx + vFactW / 2 - 4, cy + vFactH * 0.2);
        ctx.stroke();

        // Motorized Roll-Up Armored Vehicle Bay Entrance Door
        const rollDoorW = vFactW * 0.6;
        ctx.fillStyle = '#0a0e14';
        ctx.fillRect(cx - rollDoorW / 2, cy + vFactH / 2 - 12, rollDoorW, 14);
        ctx.fillStyle = '#f59e0b';
        for (let i = -rollDoorW / 2 + 3; i < rollDoorW / 2 - 3; i += 7) {
          ctx.fillRect(cx + i, cy + vFactH / 2 - 10, 4, 10);
        }

        // Dual Spinning Exhaust Ventilation Fans
        const fanAngle = this.animFrameTime * 9;
        const fanOffset = vFactW * 0.25;
        [-fanOffset, fanOffset].forEach(offset => {
          ctx.save();
          ctx.translate(cx + offset, cy);
          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.arc(0, 0, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.rotate(fanAngle * (offset > 0 ? -1 : 1));
          ctx.fillStyle = '#94a3b8';
          ctx.fillRect(-7, -1.5, 14, 3);
          ctx.fillRect(-1.5, -7, 3, 14);
          ctx.restore();
        });
        break;
      }

      case 'research_lab': {
        // High-Tech Research Geodesic Dome
        const domeR = Math.min(w, h) * 0.3;
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(cx, cy, domeR, 0, Math.PI * 2);
        ctx.fill();

        // Pulsing Quantum Sensor Emitter
        const labGlow = 0.6 + Math.sin(this.animFrameTime * 4) * 0.4;
        ctx.fillStyle = `rgba(56, 189, 248, ${labGlow})`;
        ctx.beginPath();
        ctx.arc(cx, cy, domeR * 0.6, 0, Math.PI * 2);
        ctx.fill();

        // Rotating Sensor Array
        const arrayAngle = this.animFrameTime * 1.8;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(arrayAngle);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-domeR * 0.8, 0);
        ctx.lineTo(domeR * 0.8, 0);
        ctx.moveTo(0, -domeR * 0.8);
        ctx.lineTo(0, domeR * 0.8);
        ctx.stroke();
        ctx.restore();
        break;
      }

      case 'turret_gun': {
        const tR = Math.min(w, h) * 0.32;
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(cx, cy, tR, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const angle = b.targetUnitId ? this.animFrameTime * 2 : 0;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.fillStyle = '#64748b';
        ctx.fillRect(4, -4, tR * 1.4, 3.5);
        ctx.fillRect(4, 1, tR * 1.4, 3.5);
        ctx.fillStyle = '#334155';
        ctx.beginPath();
        ctx.arc(0, 0, tR * 0.65, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }

      case 'turret_missile': {
        const mR = Math.min(w, h) * 0.28;
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(cx, cy, mR, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const angle = b.targetUnitId ? this.animFrameTime * 2 : 0;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        // Quad Missile Canister
        ctx.fillStyle = '#334155';
        ctx.fillRect(2, -8, mR * 1.3, 16);
        ctx.fillStyle = '#f87171';
        ctx.fillRect(mR * 1.3, -6, 3, 3);
        ctx.fillRect(mR * 1.3, 3, 3, 3);
        ctx.restore();
        break;
      }

      case 'turret_aa': {
        const aaR = Math.min(w, h) * 0.3;
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(cx, cy, aaR, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const angle = this.animFrameTime * 2;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(4, -6, aaR * 1.5, 2.5);
        ctx.fillRect(4, -2, aaR * 1.5, 2.5);
        ctx.fillRect(4, 2, aaR * 1.5, 2.5);
        ctx.fillRect(4, 6, aaR * 1.5, 2.5);
        ctx.restore();
        break;
      }

      case 'radar_station': {
        // Octagonal Hardened Base Pad
        const rR = Math.min(w, h) * 0.32;
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const angle = (i * Math.PI) / 4;
          const px = cx + Math.cos(angle) * rR;
          const py = cy + Math.sin(angle) * rR;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Equipment Shelter Cabin
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.roundRect(cx - 14, cy + 6, 28, 14, 3);
        ctx.fill();
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Status LEDs
        const ledBlink = Math.sin(this.animFrameTime * 4) > 0;
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(cx - 10, cy + 10, 2.5, 2.5);
        ctx.fillStyle = ledBlink ? '#38bdf8' : '#0284c7';
        ctx.fillRect(cx - 5, cy + 10, 2.5, 2.5);
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(cx, cy + 10, 2.5, 2.5);

        // Steel Lattice Pylon
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - 16, cy + 6);
        ctx.lineTo(cx, cy - 14);
        ctx.lineTo(cx + 16, cy + 6);
        ctx.stroke();

        // Rotating Parabolic Dish
        const dishAngle = this.animFrameTime * 2.2;
        ctx.save();
        ctx.translate(cx, cy - 14);
        ctx.rotate(dishAngle);
        ctx.fillStyle = '#cbd5e1';
        ctx.beginPath();
        ctx.ellipse(0, 0, rR * 0.9, rR * 0.38, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Feed Horn Boom
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(rR * 0.6, -2.5, 7, 5);
        ctx.restore();

        // Flashing Strobe Beacon (subtle)
        const apexPulse = Math.sin(this.animFrameTime * 6) > 0 ? 0.8 : 0.2;
        ctx.fillStyle = `rgba(239, 68, 68, ${apexPulse})`;
        ctx.beginPath();
        ctx.arc(cx, cy - 24, 2, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'field_hospital': {
        // Reinforced Concrete Service Pad
        const hospW = w * 0.78;
        const hospH = h * 0.6;
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.roundRect(cx - hospW / 2, cy - hospH / 2, hospW, hospH, 4);
        ctx.fill();
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Main Clinical Trauma Center (Clean military slate & medical white)
        const mainW = hospW * 0.85;
        const mainH = hospH * 0.75;
        ctx.fillStyle = isPlayer ? '#243242' : '#3d2424';
        ctx.beginPath();
        ctx.roundRect(cx - mainW / 2, cy - mainH / 2, mainW, mainH, 3);
        ctx.fill();
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Prominent Roof Red Medical Cross Emblem (Illuminated)
        const crossSize = Math.min(w, h) * 0.24;
        const crossThick = crossSize * 0.35;
        ctx.fillStyle = '#ef4444';
        // Vertical bar
        ctx.fillRect(cx - crossThick / 2, cy - crossSize / 2 - 2, crossThick, crossSize);
        // Horizontal bar
        ctx.fillRect(cx - crossSize / 2, cy - crossThick / 2 - 2, crossSize, crossThick);
        // Clean white outline around cross
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - crossThick / 2, cy - crossSize / 2 - 2, crossThick, crossSize);
        ctx.strokeRect(cx - crossSize / 2, cy - crossThick / 2 - 2, crossSize, crossThick);

        // Ambulance Loading Bay Ramp at South Entrance
        const rampW = mainW * 0.45;
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(cx - rampW / 2, cy + mainH / 2 - 6, rampW, 8);
        ctx.fillStyle = '#eab308'; // Amber guide markers
        ctx.fillRect(cx - rampW / 2 + 2, cy + mainH / 2 - 4, 3, 4);
        ctx.fillRect(cx + rampW / 2 - 5, cy + mainH / 2 - 4, 3, 4);

        // Medical Gas / Oxygen Cryo Tanks on West Flank
        const tankR = 4.5;
        [-10, 0].forEach(dy => {
          ctx.fillStyle = '#94a3b8';
          ctx.beginPath();
          ctx.arc(cx - mainW / 2 + 6, cy + dy, tankR, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#38bdf8'; // Blue oxygen label
          ctx.fillRect(cx - mainW / 2 + 4, cy + dy - 2, 4, 4);
        });

        // Soft Green Medical Status Beacon
        const medGlow = 0.5 + Math.sin(this.animFrameTime * 4) * 0.3;
        ctx.fillStyle = `rgba(34, 197, 94, ${medGlow})`;
        ctx.beginPath();
        ctx.arc(cx + mainW / 2 - 8, cy - mainH / 2 + 8, 3, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'repair_bay': {
        // Reinforced Concrete Service Pad
        const repW = w * 0.72;
        const repH = h * 0.52;
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(cx - repW / 2, cy - repH / 2, repW, repH);

        // Yellow and Black Hazard Chevrons on Approach Ramps
        ctx.fillStyle = '#f59e0b';
        for (let i = -repW / 2 + 2; i < repW / 2 - 2; i += 8) {
          ctx.fillRect(cx + i, cy + repH / 2 - 4, 4, 4);
          ctx.fillRect(cx + i, cy - repH / 2, 4, 4);
        }

        // Central Hydraulic Lift Bed with Green Cross
        const liftW = repW * 0.65;
        const liftH = repH * 0.6;
        ctx.fillStyle = '#334155';
        ctx.beginPath();
        ctx.roundRect(cx - liftW / 2, cy - liftH / 2, liftW, liftH, 3);
        ctx.fill();
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = '#22c55e';
        ctx.fillRect(cx - 3, cy - 8, 6, 16);
        ctx.fillRect(cx - 8, cy - 3, 16, 6);

        // Dual Robotic Welding Arms with animated sparks
        const armWave = Math.sin(this.animFrameTime * 8);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(cx - liftW / 2 - 4, cy);
        ctx.lineTo(cx - liftW / 4, cy + armWave * 4);
        ctx.lineTo(cx - 6, cy + armWave * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx + liftW / 2 + 4, cy);
        ctx.lineTo(cx + liftW / 4, cy - armWave * 4);
        ctx.lineTo(cx + 6, cy - armWave * 2);
        ctx.stroke();

        if (Math.sin(this.animFrameTime * 14) > 0.2) {
          ctx.fillStyle = '#38bdf8';
          ctx.beginPath();
          ctx.arc(cx - 5 + armWave * 2, cy + armWave * 2, 3, 0, Math.PI * 2);
          ctx.arc(cx + 5 - armWave * 2, cy - armWave * 2, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(cx - 5 + armWave * 2, cy + armWave * 2, 1.5, 0, Math.PI * 2);
          ctx.arc(cx + 5 - armWave * 2, cy - armWave * 2, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }

      case 'defense_wall': {
        // Reinforced Interlocking Concrete Bastions
        ctx.fillStyle = '#334155';
        ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
        ctx.fillStyle = '#475569';
        ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
        break;
      }
    }
  }

  private renderUnits(
    units: Unit[],
    visibilityMode: 'standard' | 'enhanced' = 'standard',
    controlGroups?: Record<number, string[]>,
    settings?: Partial<GameSettings>
  ) {
    const ctx = this.ctx;
    // Temporary clean waypoint paths for selected player units (No permanent dark lines)
    ctx.save();
    units.forEach(u => {
      if (!u.selected || u.faction !== 'player' || u.hp <= 0) return;
      if (u.path && u.path.length > 0 && u.isMoving) {
        ctx.strokeStyle = 'rgba(56, 185, 138, 0.65)';
        ctx.lineWidth = 1.4;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(u.x, u.y);
        for (let i = 0; i < u.path.length; i++) {
          ctx.lineTo(u.path[i].x, u.path[i].y);
        }
        ctx.stroke();

        const end = u.path[u.path.length - 1];
        ctx.setLineDash([]);
        ctx.fillStyle = '#38B98A';
        ctx.beginPath();
        ctx.arc(end.x, end.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.restore();

    units.forEach(u => {
      if (u.hp <= 0) return;
      if (u.x < this.viewMinX || u.x > this.viewMaxX || u.y < this.viewMinY || u.y > this.viewMaxY) return;
      const isPlayer = u.faction === 'player';
      const isVehicle = UNIT_CONFIGS[u.type].category === 'vehicle';
      const factionColor = isPlayer ? '#22c55e' : '#ef4444';

      ctx.save();
      ctx.translate(u.x, u.y);

      // 1. Single Clean Selection Indicator (No rotating pips, clean ground bracket/ellipse)
      if (u.selected && settings?.overlays?.unitSelection !== false) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        const selR = isVehicle ? 18 : 10;
        ctx.beginPath();
        ctx.ellipse(0, isVehicle ? 2 : 1, selR, selR * 0.65, 0, 0, Math.PI * 2);
        ctx.stroke();

        // Optional attack range preview when attackRange overlay is enabled
        if (settings?.overlays?.attackRange) {
          const cfg = UNIT_CONFIGS[u.type];
          if (cfg.range > 0) {
            ctx.save();
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.28)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.arc(0, 0, cfg.range, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
        }
      }

      // 2. Unit Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      if (isVehicle) {
        ctx.ellipse(0, 3, 16, 11, 0, 0, Math.PI * 2);
      } else {
        ctx.ellipse(0, 2, 7, 4, 0, 0, Math.PI * 2);
      }
      ctx.fill();

      // 3. Render Body
      if (isVehicle) {
        this.renderVehicle(u, factionColor);
      } else {
        this.renderInfantry(u, factionColor);
      }

      // 4. Health Bar & Rank (Safe Whole Integers)
      if (u.selected || u.hp < u.maxHp) {
        const safeMax = Math.max(1, Math.round(Number.isFinite(u.maxHp) ? u.maxHp : 100));
        const safeHp = Math.max(0, Math.min(safeMax, Math.round(Number.isFinite(u.hp) ? u.hp : 0)));
        const hpRatio = safeHp / safeMax;
        const barW = isVehicle ? 28 : 18;
        const barY = isVehicle ? -22 : -17;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.fillRect(-barW / 2 - 1, barY - 1, barW + 2, 5);

        ctx.fillStyle = hpRatio > 0.5 ? '#38B98A' : hpRatio > 0.25 ? '#F2B84B' : '#E45B63';
        ctx.fillRect(-barW / 2, barY, barW * hpRatio, 3);

        if (u.selected) {
          ctx.font = 'bold 7px monospace';
          ctx.fillStyle = '#FFFFFF';
          ctx.textAlign = 'center';
          ctx.fillText(`${safeHp}/${safeMax}`, 0, barY - 3);
        }
      }

      // Veterancy Stars
      if (u.rank > 0) {
        ctx.fillStyle = '#f59e0b';
        ctx.font = '8px sans-serif';
        ctx.textAlign = 'center';
        const stars = u.rank === 3 ? '⭐⭐⭐' : u.rank === 2 ? '⭐⭐' : '⭐';
        ctx.fillText(stars, 0, isVehicle ? -25 : -20);
      }

      // 5. Squad Control Group Badge (Squad 1-4)
      if (controlGroups && isPlayer) {
        for (let g = 1; g <= 4; g++) {
          if (controlGroups[g]?.includes(u.id)) {
            const badgeY = isVehicle ? -29 : -23;
            ctx.fillStyle = g === 1 ? '#38bdf8' : g === 2 ? '#f59e0b' : g === 3 ? '#a855f7' : '#34d399';
            ctx.beginPath();
            ctx.roundRect(-8, badgeY - 7, 16, 9, 2);
            ctx.fill();
            ctx.fillStyle = '#0f172a';
            ctx.font = 'bold 7px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`S${g}`, 0, badgeY);
            break;
          }
        }
      }

      ctx.restore();
    });
  }

  private renderAircraft(
    airUnits: Unit[],
    visibilityMode: 'standard' | 'enhanced' = 'standard',
    controlGroups?: Record<number, string[]>,
    settings?: Partial<GameSettings>
  ) {
    const ctx = this.ctx;

    airUnits.forEach(u => {
      if (u.hp <= 0) return;
      if (u.x < this.viewMinX || u.x > this.viewMaxX || u.y < this.viewMinY || u.y > this.viewMaxY) return;
      const isPlayer = u.faction === 'player';
      const factionColor = isPlayer ? '#22c55e' : '#ef4444';
      const altitude = u.altitude || 55;

      ctx.save();

      // 1. Ground Drop Shadow (placed on ground directly beneath aircraft)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.beginPath();
      ctx.ellipse(u.x, u.y, 14, 9, 0, 0, Math.PI * 2);
      ctx.fill();

      // 2. High Flight Layer Position
      ctx.translate(u.x, u.y - altitude);

      // Clean single selection ring (NO unselected rim circle)
      if (u.selected && settings?.overlays?.unitSelection !== false) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(0, 0, 18, 12, 0, 0, Math.PI * 2);
        ctx.stroke();

        if (settings?.overlays?.attackRange) {
          const cfg = UNIT_CONFIGS[u.type];
          if (cfg.range > 0) {
            ctx.save();
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.28)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.arc(0, 0, cfg.range, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
        }
      }

      ctx.rotate(u.rotation);

      // Aerodynamic Banking Roll on high-speed turns
      if (u.bankAngle && Math.abs(u.bankAngle) > 0.01) {
        ctx.scale(1, Math.cos(u.bankAngle));
      }

      if (u.type === 'stealth_fighter') {
        // Delta wing supersonic jet
        ctx.fillStyle = u.faction === 'player' ? '#334155' : '#451a1a';
        ctx.beginPath();
        ctx.moveTo(16, 0); // Nose
        ctx.lineTo(-14, -14); // Left wing
        ctx.lineTo(-8, 0);
        ctx.lineTo(-14, 14); // Right wing
        ctx.closePath();
        ctx.fill();

        // Cockpit canopy
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.ellipse(2, 0, 6, 2.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Afterburner exhaust glow
        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.arc(-11, 0, 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (u.type === 'attack_helicopter') {
        // Helicopter Fuselage
        ctx.fillStyle = u.faction === 'player' ? '#334155' : '#451a1a';
        ctx.beginPath();
        ctx.roundRect(-10, -5, 20, 10, 3);
        ctx.fill();

        // Tail boom
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(-18, -1.5, 9, 3);

        // Faction color
        ctx.fillStyle = factionColor;
        ctx.fillRect(-6, -4, 4, 8);

        // Cockpit
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(6, 0, 4, 0, Math.PI * 2);
        ctx.fill();

        // Spinning Main Rotor Blades
        const rotorAngle = u.rotorAngle !== undefined ? u.rotorAngle : this.animFrameTime * 25;
        ctx.save();
        ctx.rotate(rotorAngle);
        ctx.strokeStyle = 'rgba(226, 232, 240, 0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-22, 0);
        ctx.lineTo(22, 0);
        ctx.moveTo(0, -22);
        ctx.lineTo(0, 22);
        ctx.stroke();
        ctx.restore();
      } else {
        // Recon Drone (quadcopter UAV)
        ctx.fillStyle = '#475569';
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 1.5;
        // 4 motor arms
        ctx.beginPath();
        ctx.moveTo(-10, -10);
        ctx.lineTo(10, 10);
        ctx.moveTo(-10, 10);
        ctx.lineTo(10, -10);
        ctx.stroke();

        // Rotor discs
        ctx.fillStyle = 'rgba(56, 189, 248, 0.4)';
        ctx.beginPath();
        ctx.arc(-10, -10, 4, 0, Math.PI * 2);
        ctx.arc(10, 10, 4, 0, Math.PI * 2);
        ctx.arc(-10, 10, 4, 0, Math.PI * 2);
        ctx.arc(10, -10, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Health bar (Safe Whole Integers)
      if (u.selected || u.hp < u.maxHp) {
        const safeMax = Math.max(1, Math.round(Number.isFinite(u.maxHp) ? u.maxHp : 100));
        const safeHp = Math.max(0, Math.min(safeMax, Math.round(Number.isFinite(u.hp) ? u.hp : 0)));
        const hpRatio = safeHp / safeMax;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.fillRect(-15, -22, 30, 5);
        ctx.fillStyle = hpRatio > 0.5 ? '#38B98A' : hpRatio > 0.25 ? '#F2B84B' : '#E45B63';
        ctx.fillRect(-14, -21, 28 * hpRatio, 3);

        if (u.selected) {
          ctx.font = 'bold 7px monospace';
          ctx.fillStyle = '#FFFFFF';
          ctx.textAlign = 'center';
          ctx.fillText(`${safeHp}/${safeMax}`, 0, -25);
        }
      }

      // Squad Control Group Badge
      if (controlGroups && isPlayer) {
        for (let g = 1; g <= 4; g++) {
          if (controlGroups[g]?.includes(u.id)) {
            const badgeY = -27;
            ctx.fillStyle = g === 1 ? '#38bdf8' : g === 2 ? '#f59e0b' : g === 3 ? '#a855f7' : '#34d399';
            ctx.beginPath();
            ctx.roundRect(-8, badgeY - 7, 16, 9, 2);
            ctx.fill();
            ctx.fillStyle = '#0f172a';
            ctx.font = 'bold 7px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`S${g}`, 0, badgeY);
            break;
          }
        }
      }

      ctx.restore();
    });
  }

  private renderInfantry(u: Unit, factionColor: string) {
    const ctx = this.ctx;
    ctx.rotate(u.rotation);

    const legOffset = u.isMoving ? Math.sin(this.animFrameTime * 14) * 3 : 0;

    // Tactical boots & legs
    ctx.fillStyle = '#111827';
    ctx.fillRect(-3, -3 + legOffset, 2.5, 6);
    ctx.fillRect(1, -3 - legOffset, 2.5, 6);

    // Torso / Body armor vest
    ctx.fillStyle = u.faction === 'player' ? '#173A32' : '#3B1D1D';
    ctx.beginPath();
    ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
    ctx.fill();

    // Faction identifier shoulder flash
    ctx.fillStyle = factionColor;
    ctx.fillRect(-4, -5, 8, 2);

    // Unit-specific gear and silhouettes
    switch (u.type) {
      case 'heavy_gunner': {
        // Heavy Powered Exoskeleton Shoulder Guards
        ctx.fillStyle = '#475569';
        ctx.fillRect(-6, -4, 3, 8);
        ctx.fillRect(3, -4, 3, 8);
        // Heavy Ammo Drum Backpack
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.arc(-4, 0, 4, 0, Math.PI * 2);
        ctx.fill();
        // Heavy Rotary Machine Gun
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(2, -2.5, 12, 5);
        ctx.fillStyle = '#eab308';
        ctx.fillRect(3, 1, 6, 2); // Ammo belt
        break;
      }

      case 'sniper': {
        // Camo Ghillie Cape draped over shoulders
        ctx.fillStyle = u.faction === 'player' ? '#2d4a3e' : '#4a2d2d';
        ctx.beginPath();
        ctx.ellipse(-3, 0, 5, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        // Precision Long Rifle with Scope
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(2, -1.5, 14, 2.5);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(5, -3, 4, 2); // Optic scope glint
        break;
      }

      case 'medic': {
        // White Field Medical Satchel with Red Cross
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(-3, -6, 6, 4);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(-1.5, -5.5, 3, 1);
        ctx.fillRect(-0.5, -6.5, 1, 3);
        // Biotic Nanite Injector with Soft Green Pulse
        ctx.fillStyle = '#10b981';
        ctx.fillRect(2, -1.5, 7, 2.5);
        ctx.fillStyle = '#34d399';
        ctx.beginPath();
        ctx.arc(9, -0.25, 2, 0, Math.PI * 2);
        ctx.fill();
        // White Medical Helmet with Red Cross
        ctx.fillStyle = '#f8fafc';
        ctx.beginPath();
        ctx.arc(0, 0, 3.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(-1.2, -0.4, 2.4, 0.8);
        ctx.fillRect(-0.4, -1.2, 0.8, 2.4);
        return;
      }

      case 'engineer': {
        // High-Visibility Safety Vest & Tool Belt
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(-4, -5, 8, 3);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(-5, -3, 3, 6);
        // Arc Welding Torch with Blue Tip
        ctx.fillStyle = '#475569';
        ctx.fillRect(2, -1.5, 8, 2);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(9, -2, 2.5, 3);
        // Yellow Hardhat with Protective Visor
        ctx.fillStyle = '#eab308';
        ctx.beginPath();
        ctx.arc(0, 0, 3.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(1, -2, 2, 4); // Visor
        return;
      }

      case 'rocket_soldier': {
        // Heavy Shoulder-Mounted RPG Launcher
        ctx.fillStyle = '#475569';
        ctx.fillRect(-2, -5, 16, 4.5);
        // Visible Conical Rocket Warhead
        ctx.fillStyle = '#16a34a';
        ctx.beginPath();
        ctx.moveTo(14, -5);
        ctx.lineTo(18, -2.75);
        ctx.lineTo(14, -0.5);
        ctx.closePath();
        ctx.fill();
        break;
      }

      case 'flamethrower': {
        // Dual Fuel Propellant Tanks Backpack
        ctx.fillStyle = '#ea580c';
        ctx.fillRect(-5, -6, 4, 12);
        ctx.fillStyle = '#c2410c';
        ctx.fillRect(-4, -5, 2, 10);
        // Flame Projector Lance
        ctx.fillStyle = '#334155';
        ctx.fillRect(2, -1.5, 10, 3);
        // Pilot Flame
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(12, 0, 2, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'commando': {
        // Red Beret
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, Math.PI * 2);
        ctx.fill();
        // Dual-Wield Carbines
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(2, -3.5, 8, 2);
        ctx.fillRect(2, 1.5, 8, 2);
        return; // Already rendered head
      }

      case 'scout': {
        // Radio Communication Antenna
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-3, 0);
        ctx.lineTo(-8, -4);
        ctx.stroke();
        // Binocular & Light SMG
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(2, -1, 7, 2);
        break;
      }

      default: {
        // Standard Infantry Combat Rifle
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(2, -1.5, 9, 2.5);
        break;
      }
    }

    // Tactical Helmet
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  private renderVehicle(u: Unit, factionColor: string) {
    const ctx = this.ctx;
    ctx.save();
    ctx.rotate(u.rotation);

    if (u.type === 'medical_apc') {
      // 6-wheel Armored Medical Evacuation APC
      ctx.fillStyle = '#1c1917';
      const wheelPositions = [-10, 0, 10];
      wheelPositions.forEach(wx => {
        ctx.fillRect(wx - 4, -13, 8, 4.5); // Top wheels
        ctx.fillRect(wx - 4, 8.5, 8, 4.5); // Bottom wheels
        // Hubcap rim
        ctx.fillStyle = '#64748b';
        ctx.fillRect(wx - 1, -12, 2, 2.5);
        ctx.fillRect(wx - 1, 9.5, 2, 2.5);
        ctx.fillStyle = '#1c1917';
      });

      // Armored APC Body (clean medical slate-cream/olive)
      ctx.fillStyle = u.faction === 'player' ? '#2e3d36' : '#3d2525';
      ctx.beginPath();
      ctx.roundRect(-14, -9, 28, 18, 4);
      ctx.fill();
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      // Rear medical clamshell access doors
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(-14, -6, 3, 12);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-14, 0);
      ctx.lineTo(-11, 0);
      ctx.stroke();

      // Faction marker
      ctx.fillStyle = factionColor;
      ctx.fillRect(-8, -8, 3, 16);

      // White cross square on roof
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(-2, -5, 10, 10);
      // Bright red cross
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(1.5, -4, 3, 8);
      ctx.fillRect(-1, -1.5, 8, 3);
    } else if (u.type === 'recon_buggy') {
      // Off-road Dune Buggy with 4 Big Wheels
      ctx.fillStyle = '#1c1917';
      ctx.fillRect(-12, -12, 7, 5); // Front left
      ctx.fillRect(5, -12, 7, 5); // Front right
      ctx.fillRect(-12, 7, 7, 5); // Rear left
      ctx.fillRect(5, 7, 7, 5); // Rear right

      // Tubular Roll-Cage Chassis
      ctx.fillStyle = u.faction === 'player' ? '#173A32' : '#3B1D1D';
      ctx.beginPath();
      ctx.roundRect(-10, -7, 20, 14, 3);
      ctx.fill();
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Faction Stripe
      ctx.fillStyle = factionColor;
      ctx.fillRect(-6, -4, 4, 8);
    } else {
      // Heavy Caterpillar Tank Treads
      const treadLength = u.type === 'heavy_tank' || u.type === 'siege_tank' ? 32 : 26;
      const treadWidth = u.type === 'heavy_tank' ? 6 : 5;
      const trackOffset = u.type === 'heavy_tank' ? 12 : 10;

      ctx.fillStyle = '#111827';
      ctx.fillRect(-treadLength / 2, -trackOffset - treadWidth / 2, treadLength, treadWidth);
      ctx.fillRect(-treadLength / 2, trackOffset - treadWidth / 2, treadLength, treadWidth);

      // Sprocket wheel link details
      ctx.fillStyle = '#475569';
      for (let i = -treadLength / 2 + 3; i <= treadLength / 2 - 3; i += 4) {
        ctx.fillRect(i, -trackOffset - treadWidth / 2, 2, treadWidth);
        ctx.fillRect(i, trackOffset - treadWidth / 2, 2, treadWidth);
      }

      // Sloped Glacis Armored Chassis
      ctx.fillStyle = u.faction === 'player' ? '#1e293b' : '#3b1d1d';
      const bodyW = treadLength - 4;
      const bodyH = trackOffset * 2 - 2;
      ctx.beginPath();
      ctx.roundRect(-bodyW / 2, -bodyH / 2, bodyW, bodyH, 3);
      ctx.fill();

      // Armored side skirt plates
      ctx.fillStyle = u.faction === 'player' ? '#334155' : '#572727';
      ctx.fillRect(-bodyW / 2 + 2, -bodyH / 2 + 1, bodyW - 4, 3);
      ctx.fillRect(-bodyW / 2 + 2, bodyH / 2 - 4, bodyW - 4, 3);

      // Faction identification panel
      ctx.fillStyle = factionColor;
      ctx.fillRect(-bodyW / 2 + 3, -4, 4, 8);
    }

    ctx.restore();

    // Independent Turret / Roof Equipment Traverse
    const turretAngle = u.turretRotation !== undefined ? u.turretRotation : u.rotation;
    const recoil = u.recoilOffset || 0;
    ctx.save();
    ctx.rotate(turretAngle);

    if (u.type === 'medical_apc') {
      // Medical Triage Sensor Mast & Searchlight (No weapons)
      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Forward steerable triage searchlight
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(3, -2, 4, 4);

      // Flashing Medical Emergency Beacon
      const beaconOn = Math.sin(this.animFrameTime * 9) > 0;
      ctx.fillStyle = beaconOn ? '#10b981' : '#047857';
      ctx.beginPath();
      ctx.arc(-2, 0, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    ctx.fillStyle = '#475569';
    if (u.type === 'heavy_tank') {
      // Twin Heavy Cannons with Recoil
      ctx.fillRect(6 - recoil, -5, 20, 3.5);
      ctx.fillRect(6 - recoil, 1.5, 20, 3.5);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(25 - recoil, -6, 3, 5); // Muzzle brake
      ctx.fillRect(25 - recoil, 0.5, 3, 5);
    } else if (u.type === 'artillery') {
      // Long-Range Self-Propelled Howitzer Barrel
      ctx.fillRect(4 - recoil, -3, 26, 6);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(28 - recoil, -4, 4, 8); // Heavy muzzle brake
    } else if (u.type === 'siege_tank') {
      // Heavy Siege Cannon
      ctx.fillRect(5 - recoil, -4, 22, 8);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(25 - recoil, -5, 4, 10);
    } else if (u.type === 'mobile_sam') {
      // SAM Launcher Box with 4 Missile Pods
      ctx.fillStyle = '#334155';
      ctx.fillRect(-6, -7, 18, 14);
      ctx.fillStyle = '#f87171';
      ctx.fillRect(11, -5, 3, 3);
      ctx.fillRect(11, 2, 3, 3);
      ctx.fillRect(6, -5, 3, 3);
      ctx.fillRect(6, 2, 3, 3);
    } else if (u.type === 'recon_buggy') {
      // Pintle-mounted 50 cal MG
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(3, -1.5, 12, 3);
    } else if (u.type === 'light_tank') {
      ctx.fillRect(5 - recoil, -2, 14, 3.5);
    } else {
      // Main Battle Tank 120mm Smoothbore with Bore Evacuator
      ctx.fillRect(6 - recoil, -2.5, 18, 5);
      ctx.fillStyle = '#334155';
      ctx.fillRect(13 - recoil, -3.5, 5, 7); // Bore evacuator
    }

    // Cast Steel Armored Turret Dome
    ctx.fillStyle = u.faction === 'player' ? '#334155' : '#451a1a';
    ctx.beginPath();
    ctx.arc(0, 0, u.type === 'heavy_tank' ? 9 : 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Commander's Cupola Hatch
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(-2, -2, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Synchronized Gun Muzzle Flash Burst
    if (u.muzzleFlash && u.muzzleFlash > 0) {
      const flashAlpha = Math.min(1, u.muzzleFlash * 7);
      const barrelLen =
        u.type === 'artillery' ? 32 : u.type === 'heavy_tank' ? 28 : u.type === 'siege_tank' ? 29 : 24;
      ctx.save();
      ctx.fillStyle = `rgba(254, 240, 138, ${flashAlpha})`;
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(barrelLen, 0, 4 + u.muzzleFlash * 14, 0, Math.PI * 2);
      ctx.fill();

      // Sharp spark rays
      ctx.strokeStyle = `rgba(255, 255, 255, ${flashAlpha * 0.9})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(barrelLen - 2, 0);
      ctx.lineTo(barrelLen + 10, 0);
      ctx.moveTo(barrelLen, -6);
      ctx.lineTo(barrelLen, 6);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  private renderProjectiles(projectiles: Projectile[]) {
    const ctx = this.ctx;
    projectiles.forEach(p => {
      ctx.save();

      if (p.type === 'artillery' || p.type === 'grenade' || p.type === 'bomb') {
        const currentX = p.startX + (p.targetX - p.startX) * p.progress;
        const currentY = p.startY + (p.targetY - p.startY) * p.progress;
        const arcY = -Math.sin(p.progress * Math.PI) * (p.arcHeight || 90);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.arc(currentX, currentY, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = p.type === 'bomb' ? '#ef4444' : '#f59e0b';
        ctx.beginPath();
        ctx.arc(currentX, currentY + arcY, p.type === 'bomb' ? 5 : 4, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'missile') {
        const angle = Math.atan2(p.targetY - p.y, p.targetX - p.x);
        ctx.translate(p.x, p.y);
        ctx.rotate(angle);

        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(-6, -1.5, 12, 3);

        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.arc(-7, 0, 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'flame') {
        ctx.fillStyle = '#ea580c';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const tailProgress = Math.max(0, p.progress - 0.12);
        let tailX = p.startX + (p.targetX - p.startX) * tailProgress;
        let tailY = p.startY + (p.targetY - p.startY) * tailProgress;
        const dx = p.x - tailX;
        const dy = p.y - tailY;
        const dist = Math.hypot(dx, dy);
        const maxLen = p.type === 'cannon' ? 26 : 18;
        if (dist > maxLen && dist > 0.001) {
          tailX = p.x - (dx / dist) * maxLen;
          tailY = p.y - (dy / dist) * maxLen;
        }

        ctx.strokeStyle = p.faction === 'player' ? '#fde047' : '#f87171';
        ctx.lineWidth = p.type === 'cannon' ? 2.5 : 1.5;
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }

      ctx.restore();
    });
  }

  private renderParticles(particles: Particle[], smokeDensity: 'off' | 'low' | 'normal' = 'normal') {
    const ctx = this.ctx;
    particles.forEach(p => {
      if (p.type === 'smoke' && smokeDensity === 'off') return;

      ctx.save();
      const alpha = p.type === 'smoke' && smokeDensity === 'low' ? p.alpha * 0.45 : p.alpha;
      const size = p.type === 'smoke' && smokeDensity === 'low' ? p.size * 0.6 : p.size;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;

      if (p.type === 'shockwave') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    });
  }

  private renderPings(pings: TacticalPing[]) {
    const ctx = this.ctx;
    pings.forEach(ping => {
      const progress = ping.life / ping.maxLife;
      const radius = progress * 40;
      const alpha = 1 - progress;

      ctx.save();
      ctx.strokeStyle = ping.color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ping.x, ping.y, radius, 0, Math.PI * 2);
      ctx.stroke();

      if (ping.label) {
        ctx.fillStyle = ping.color;
        ctx.font = '10px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(ping.label, ping.x, ping.y - radius - 4);
      }
      ctx.restore();
    });
  }

  private renderFogOfWar(mapData: MapData, fogGrid: Uint8Array, camera: Camera, screenW: number, screenH: number) {
    const ctx = this.ctx;
    const ts = mapData.tileSize;

    const halfW = screenW / 2 / camera.zoom;
    const halfH = screenH / 2 / camera.zoom;
    const minX = Math.max(0, Math.floor((camera.x - halfW) / ts));
    const maxX = Math.min(mapData.width - 1, Math.ceil((camera.x + halfW) / ts));
    const minY = Math.max(0, Math.floor((camera.y - halfH) / ts));
    const maxY = Math.min(mapData.height - 1, Math.ceil((camera.y + halfH) / ts));

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const state = fogGrid[y * mapData.width + x];
        const px = x * ts;
        const py = y * ts;

        if (state === 0) {
          ctx.fillStyle = '#06080d';
          ctx.fillRect(px, py, ts, ts);
        } else if (state === 1) {
          ctx.fillStyle = 'rgba(6, 8, 13, 0.58)';
          ctx.fillRect(px, py, ts, ts);
        }
      }
    }
  }

  private renderPlacementPreview(
    preview: {
      type: BuildingType;
      gridX: number;
      gridY: number;
      rotation?: number;
      isValid: boolean;
      reason?: string;
      recommendations?: BuildingPlacementRecommendation[];
    },
    mapData: MapData
  ) {
    const ctx = this.ctx;
    const config = BUILDING_CONFIGS[preview.type];
    const ts = mapData.tileSize;
    const isRotated = preview.rotation === 90 || preview.rotation === 270;
    const bw = isRotated ? config.size.height : config.size.width;
    const bh = isRotated ? config.size.width : config.size.height;
    const x = preview.gridX * ts;
    const y = preview.gridY * ts;
    const w = bw * ts;
    const h = bh * ts;
    const cx = x + w / 2;
    const cy = y + h / 2;

    ctx.save();

    // -1. Subtle Holographic Placement Grid (visible ONLY during active construction preview)
    const gridPad = 3;
    const minGX = Math.max(0, preview.gridX - gridPad);
    const maxGX = Math.min(mapData.width - 1, preview.gridX + bw + gridPad);
    const minGY = Math.max(0, preview.gridY - gridPad);
    const maxGY = Math.min(mapData.height - 1, preview.gridY + bh + gridPad);

    ctx.strokeStyle = preview.isValid ? 'rgba(56, 185, 138, 0.16)' : 'rgba(228, 91, 99, 0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let gx = minGX; gx <= maxGX; gx++) {
      ctx.moveTo(gx * ts, minGY * ts);
      ctx.lineTo(gx * ts, maxGY * ts);
    }
    for (let gy = minGY; gy <= maxGY; gy++) {
      ctx.moveTo(minGX * ts, gy * ts);
      ctx.lineTo(maxGX * ts, gy * ts);
    }
    ctx.stroke();

    // 0. Holographic Ground Placement Recommendations (Scored Best Sites)
    if (preview.recommendations && preview.recommendations.length > 0) {
      preview.recommendations.forEach((rec, idx) => {
        // If cursor is actively snapping to this recommendation site, skip drawing background marker
        if (rec.gridX === preview.gridX && rec.gridY === preview.gridY) return;

        const rx = rec.gridX * ts;
        const ry = rec.gridY * ts;
        const rw = bw * ts;
        const rh = bh * ts;
        const rcx = rx + rw / 2;
        const rcy = ry + rh / 2;

        const themeColor = rec.label === 'RECOMMENDED' ? '#38B98A' : rec.label === 'ALTERNATIVE' ? '#F6AD55' : '#63B3ED';
        const pulse = 0.65 + Math.sin(this.animFrameTime * 4 + idx * 1.5) * 0.25;

        // Ground highlight zone
        ctx.fillStyle = rec.label === 'RECOMMENDED' ? 'rgba(56, 185, 138, 0.12)' : 'rgba(246, 173, 85, 0.1)';
        ctx.fillRect(rx, ry, rw, rh);

        // Dashed border with pulsing alpha
        ctx.strokeStyle = themeColor;
        ctx.globalAlpha = pulse;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.strokeRect(rx, ry, rw, rh);
        ctx.setLineDash([]);
        ctx.globalAlpha = 1.0;

        // Tactical Corner Brackets
        const cLen = Math.min(10, ts * 0.35);
        ctx.strokeStyle = themeColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        // Top-left
        ctx.moveTo(rx - 1, ry + cLen);
        ctx.lineTo(rx - 1, ry - 1);
        ctx.lineTo(rx + cLen, ry - 1);
        // Top-right
        ctx.moveTo(rx + rw + 1 - cLen, ry - 1);
        ctx.lineTo(rx + rw + 1, ry - 1);
        ctx.lineTo(rx + rw + 1, ry + cLen);
        // Bottom-left
        ctx.moveTo(rx - 1, ry + rh + 1 - cLen);
        ctx.lineTo(rx - 1, ry + rh + 1);
        ctx.lineTo(rx + cLen, ry + rh + 1);
        // Bottom-right
        ctx.moveTo(rx + rw + 1 - cLen, ry + rh + 1);
        ctx.lineTo(rx + rw + 1, ry + rh + 1);
        ctx.lineTo(rx + rw + 1, ry + rh + 1 - cLen);
        ctx.stroke();

        // Pulsing Tactical Center Ring & Crosshair
        ctx.strokeStyle = themeColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(rcx, rcy, 12, 0, Math.PI * 2);
        ctx.stroke();

        // Badge banner
        const badgeW = Math.max(160, Math.min(220, rw + 40));
        const hasProsCons = Boolean(rec.advantage || rec.disadvantage);
        const badgeH = hasProsCons ? 36 : 24;
        const badgeX = rcx - badgeW / 2;
        const badgeY = ry - badgeH - 6;

        ctx.fillStyle = 'rgba(12, 20, 28, 0.94)';
        ctx.beginPath();
        ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
        ctx.fill();
        ctx.strokeStyle = themeColor;
        ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.fillStyle = themeColor;
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        const distStr = rec.distanceToHQ !== undefined ? ` · ${Math.round(rec.distanceToHQ)}m` : '';
        ctx.fillText(`#${idx + 1} ${rec.label} (${Math.round(rec.score)}%)${distStr}`, rcx, badgeY + 11);

        if (hasProsCons) {
          ctx.fillStyle = '#38B98A';
          ctx.font = '8px "Plus Jakarta Sans", sans-serif';
          const advText = rec.advantage ? `+ ${rec.advantage}` : rec.reason;
          ctx.fillText(advText.length > 34 ? advText.substring(0, 32) + '..' : advText, rcx, badgeY + 22);

          if (rec.disadvantage) {
            ctx.fillStyle = '#f87171';
            ctx.fillText(rec.disadvantage.length > 34 ? rec.disadvantage.substring(0, 32) + '..' : rec.disadvantage, rcx, badgeY + 31);
          }
        } else {
          ctx.fillStyle = '#94a3b8';
          ctx.font = '8px "Plus Jakarta Sans", sans-serif';
          const shortReason = rec.reason.length > 28 ? rec.reason.substring(0, 26) + '..' : rec.reason;
          ctx.fillText(shortReason, rcx, badgeY + 20);
        }
      });
    }

    // 1. Tactical Weapon / Sensor Range Radius Circle (if building has a combat or radar range)
    const range = config.range || (preview.type === 'radar_station' ? 700 : preview.type === 'repair_bay' ? 260 : 0);
    if (range > 0) {
      ctx.fillStyle = preview.isValid ? 'rgba(56, 185, 138, 0.08)' : 'rgba(228, 91, 99, 0.08)';
      ctx.strokeStyle = preview.isValid ? 'rgba(56, 185, 138, 0.45)' : 'rgba(228, 91, 99, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy, range, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 2. Ground Footprint Grid Tiles
    for (let gy = 0; gy < bh; gy++) {
      for (let gx = 0; gx < bw; gx++) {
        const tx = x + gx * ts;
        const ty = y + gy * ts;
        ctx.fillStyle = preview.isValid ? 'rgba(56, 185, 138, 0.28)' : 'rgba(228, 91, 99, 0.32)';
        ctx.fillRect(tx + 1, ty + 1, ts - 2, ts - 2);

        ctx.strokeStyle = preview.isValid ? 'rgba(56, 185, 138, 0.6)' : 'rgba(228, 91, 99, 0.6)';
        ctx.lineWidth = 1;
        ctx.strokeRect(tx + 1, ty + 1, ts - 2, ts - 2);
      }
    }

    // 3. Outer Footprint Border with Corner Brackets
    ctx.strokeStyle = preview.isValid ? '#38B98A' : '#E45B63';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(x, y, w, h);

    const cornerLen = Math.min(12, ts * 0.4);
    ctx.lineWidth = 3;
    // Top-left
    ctx.beginPath();
    ctx.moveTo(x - 2, y + cornerLen);
    ctx.lineTo(x - 2, y - 2);
    ctx.lineTo(x + cornerLen, y - 2);
    // Top-right
    ctx.moveTo(x + w + 2 - cornerLen, y - 2);
    ctx.lineTo(x + w + 2, y - 2);
    ctx.lineTo(x + w + 2, y + cornerLen);
    // Bottom-left
    ctx.moveTo(x - 2, y + h + 2 - cornerLen);
    ctx.lineTo(x - 2, y + h + 2);
    ctx.lineTo(x + cornerLen, y + h + 2);
    // Bottom-right
    ctx.moveTo(x + w + 2 - cornerLen, y + h + 2);
    ctx.lineTo(x + w + 2, y + h + 2);
    ctx.lineTo(x + w + 2, y + h + 2 - cornerLen);
    ctx.stroke();

    // 4. Holographic Building Blueprint Projection (True 2.5D Geometry Hologram)
    const elev = this.getBuildingElevation(preview.type);
    const roofY = y - elev;

    ctx.save();
    ctx.globalAlpha = 0.55;

    // 2.5D front wall ghost
    if (elev > 0) {
      ctx.fillStyle = preview.isValid ? 'rgba(56, 185, 138, 0.2)' : 'rgba(228, 91, 99, 0.2)';
      ctx.fillRect(x + 2, y + h - elev, w - 4, elev);
      ctx.strokeStyle = preview.isValid ? '#38B98A' : '#E45B63';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 2, y + h - elev, w - 4, elev);
    }

    // Elevated roof deck ghost
    ctx.fillStyle = preview.isValid ? 'rgba(56, 185, 138, 0.28)' : 'rgba(228, 91, 99, 0.28)';
    ctx.fillRect(x + 2, roofY + 2, w - 4, h - 4);
    ctx.strokeStyle = preview.isValid ? '#38B98A' : '#E45B63';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 2, roofY + 2, w - 4, h - 4);

    const ghostBuilding: Building = {
      id: 'ghost_preview',
      type: preview.type,
      faction: 'player',
      x: preview.gridX,
      y: preview.gridY,
      pixelX: cx,
      pixelY: cy,
      width: bw,
      height: bh,
      hp: config.maxHp,
      maxHp: config.maxHp,
      armor: config.armor,
      level: 1,
      constructionProgress: 1.0,
      isUnderConstruction: false,
      isRepairing: false,
      productionQueue: [],
      lastAttackTime: 0,
      selected: false,
      rotation: preview.rotation || 0,
    };
    this.renderBuildingDetails(ghostBuilding, x, roofY, w, h, true, preview.isValid ? '#38B98A' : '#E45B63');
    ctx.restore();

    // 5. Tactical Status Floating Header
    const plaqueW = Math.max(140, w + 20);
    const plaqueH = 34;
    const plaqueX = cx - plaqueW / 2;
    const plaqueY = roofY - plaqueH - 8;

    ctx.fillStyle = 'rgba(16, 24, 32, 0.95)';
    ctx.beginPath();
    ctx.roundRect(plaqueX, plaqueY, plaqueW, plaqueH, 6);
    ctx.fill();
    ctx.strokeStyle = preview.isValid ? '#38B98A' : '#E45B63';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#F4F7FA';
    ctx.font = 'bold 11px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${config.name.toUpperCase()} ${preview.rotation ? `(${preview.rotation}°)` : ''}`, cx, plaqueY + 14);

    ctx.fillStyle = preview.isValid ? '#38B98A' : '#E45B63';
    ctx.font = 'bold 9px "JetBrains Mono", monospace';
    ctx.fillText(
      preview.isValid ? '✓ VALID SITE · CONFIRM TO BUILD' : `✕ ${(preview.reason || 'BLOCKED SITE').toUpperCase()}`,
      cx,
      plaqueY + 27
    );

    ctx.restore();
  }

  private renderWeatherAndLighting(
    mapData: MapData,
    weather: WeatherType,
    dayNightPhase: number,
    _units: Unit[]
  ) {
    const ctx = this.ctx;
    const worldW = mapData.width * mapData.tileSize;
    const worldH = mapData.height * mapData.tileSize;

    // Smooth ambient dusk tone without obscuring troops or cutting out circular halos
    if (dayNightPhase > 0.35) {
      ctx.save();
      ctx.fillStyle = `rgba(10, 20, 35, ${Math.min(0.22, (dayNightPhase - 0.35) * 0.3)})`;
      ctx.fillRect(0, 0, worldW, worldH);
      ctx.restore();
    }

    if (weather === 'rain') {
      ctx.save();
      ctx.strokeStyle = 'rgba(186, 230, 253, 0.22)';
      ctx.lineWidth = 1;
      const count = 45;
      for (let i = 0; i < count; i++) {
        const rx = (Math.sin(i * 99 + this.animFrameTime * 4) * 0.5 + 0.5) * worldW;
        const ry = (i * 137 + this.animFrameTime * 500) % worldH;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - 4, ry + 14);
        ctx.stroke();
      }
      ctx.restore();
    } else if (weather === 'snow') {
      ctx.save();
      ctx.fillStyle = 'rgba(241, 245, 249, 0.45)';
      const count = 50;
      for (let i = 0; i < count; i++) {
        const sx = (i * 149 + Math.sin(this.animFrameTime + i) * 30) % worldW;
        const sy = (i * 97 + this.animFrameTime * 65) % worldH;
        ctx.beginPath();
        ctx.arc(sx, sy, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else if (weather === 'dust_storm') {
      // Subtle desert wind streaks instead of a brown mud blanket
      ctx.save();
      ctx.strokeStyle = 'rgba(217, 119, 6, 0.15)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 25; i++) {
        const dx = (i * 123 + this.animFrameTime * 280) % worldW;
        const dy = (i * 87) % worldH;
        ctx.beginPath();
        ctx.moveTo(dx, dy);
        ctx.lineTo(dx + 28, dy - 6);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private renderFloatingText(texts: FloatingText[]) {
    const ctx = this.ctx;
    texts.forEach(ft => {
      const progress = ft.life / ft.maxLife;
      const alpha = 1 - progress;
      const yOffset = progress * 24;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = ft.color;
      ctx.font = 'bold 12px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(ft.text, ft.x, ft.y - yOffset);
      ctx.restore();
    });
  }

  private renderSelectionBox(
    box: { start: Vector2; current: Vector2 },
    camera: Camera,
    screenW: number,
    screenH: number
  ) {
    const ctx = this.ctx;
    const toScreen = (world: Vector2) => ({
      x: (world.x - camera.x) * camera.zoom + screenW / 2,
      y: (world.y - camera.y) * camera.zoom + screenH / 2,
    });

    const s = toScreen(box.start);
    const c = toScreen(box.current);
    const minX = Math.min(s.x, c.x);
    const minY = Math.min(s.y, c.y);
    const boxW = Math.abs(c.x - s.x);
    const boxH = Math.abs(c.y - s.y);

    ctx.save();
    ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 2]);

    ctx.fillRect(minX, minY, boxW, boxH);
    ctx.strokeRect(minX, minY, boxW, boxH);
    ctx.restore();
  }

  private renderUltraAtmosphere(screenW: number, screenH: number) {
    const ctx = this.ctx;
    ctx.save();
    // Ultra subtle vignette to ground the viewport without washing out battlefield contrast
    const radius = Math.max(screenW, screenH) * 0.72;
    const vignette = ctx.createRadialGradient(
      screenW / 2,
      screenH / 2,
      radius * 0.45,
      screenW / 2,
      screenH / 2,
      radius
    );
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(0.75, 'rgba(6, 10, 18, 0.08)');
    vignette.addColorStop(1, 'rgba(4, 7, 12, 0.28)');

    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, screenW, screenH);
    ctx.restore();
  }

  private renderDefenseZones(tacticalIntelligence: TacticalIntelligence) {
    const ctx = this.ctx;

    tacticalIntelligence.defenseZones.forEach((zone) => {
      ctx.save();

      let strokeColor = 'rgba(34, 197, 94, 0.35)';
      let fillColor = 'rgba(34, 197, 94, 0.03)';
      if (zone.threatLevel === 'YELLOW') {
        strokeColor = 'rgba(234, 179, 8, 0.45)';
        fillColor = 'rgba(234, 179, 8, 0.05)';
      } else if (zone.threatLevel === 'ORANGE') {
        strokeColor = 'rgba(249, 115, 22, 0.55)';
        fillColor = 'rgba(249, 115, 22, 0.07)';
      } else if (zone.threatLevel === 'RED') {
        strokeColor = 'rgba(239, 68, 68, 0.65)';
        fillColor = 'rgba(239, 68, 68, 0.09)';
      }

      // Draw clean subtle translucent boundary fill
      ctx.fillStyle = fillColor;
      ctx.beginPath();
      ctx.arc(zone.center.x, zone.center.y, zone.radius, 0, Math.PI * 2);
      ctx.fill();

      // Single static subtle perimeter line (NO rotating dash offset, NO double rings)
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.arc(zone.center.x, zone.center.y, zone.radius, 0, Math.PI * 2);
      ctx.stroke();

      // Clean, compact Zone Label Pill
      const tagX = zone.center.x;
      const tagY = zone.center.y - zone.radius + 12;
      const labelText = `${zone.name.toUpperCase()} [${zone.threatLevel}]`;

      ctx.font = '600 9px "JetBrains Mono", monospace';
      const textMetrics = ctx.measureText(labelText);
      const pillW = textMetrics.width + 12;
      const pillH = 16;

      ctx.fillStyle = 'rgba(8, 12, 20, 0.75)';
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.roundRect(tagX - pillW / 2, tagY - pillH / 2, pillW, pillH, 3);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = zone.threatLevel === 'GREEN' ? '#86efac' : zone.threatLevel === 'YELLOW' ? '#fde047' : '#fca5a5';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labelText, tagX, tagY);

      ctx.restore();
    });
  }

  private renderRadarSweep(tacticalIntelligence: TacticalIntelligence, buildings: Building[]) {
    const ctx = this.ctx;

    // Locate player radar station, otherwise fallback to player HQ
    const radarBuilding = buildings.find(b => b.type === 'radar_station' && b.faction === 'player' && b.hp > 0 && !b.isUnderConstruction)
      || buildings.find(b => b.type === 'headquarters' && b.faction === 'player');

    if (!radarBuilding) return;

    const cx = radarBuilding.pixelX;
    const cy = radarBuilding.pixelY;
    const range = tacticalIntelligence.radarRange;
    const isOperational = tacticalIntelligence.radarOperational;

    ctx.save();

    if (isOperational) {
      // Single clean translucent radar coverage perimeter (NO 360-deg rotating sweep, NO concentric rings, NO crosshairs)
      ctx.fillStyle = 'rgba(6, 182, 212, 0.03)';
      ctx.beginPath();
      ctx.arc(cx, cy, range, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(6, 182, 212, 0.35)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(cx, cy, range, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // Offline / Power Low indicator
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.25)';
      ctx.lineWidth = 1.0;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.arc(cx, cy, range, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  private renderDetectedThreats(tacticalIntelligence: TacticalIntelligence) {
    const ctx = this.ctx;

    tacticalIntelligence.activeThreats.forEach(threat => {
      ctx.save();
      const tx = threat.position.x;
      const ty = threat.position.y;

      let color = '#eab308'; // YELLOW
      if (threat.threatScore > 50) color = '#f97316'; // ORANGE
      if (threat.threatScore > 85) color = '#ef4444'; // RED

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.globalAlpha = 0.8;

      // Small subtle corner brackets
      const s = 12;
      ctx.beginPath();
      ctx.moveTo(tx - s, ty - s + 4);
      ctx.lineTo(tx - s, ty - s);
      ctx.lineTo(tx - s + 4, ty - s);
      ctx.moveTo(tx + s - 4, ty - s);
      ctx.lineTo(tx + s, ty - s);
      ctx.lineTo(tx + s, ty - s + 4);
      ctx.moveTo(tx - s, ty + s - 4);
      ctx.lineTo(tx - s, ty + s);
      ctx.lineTo(tx - s + 4, ty + s);
      ctx.moveTo(tx + s - 4, ty + s);
      ctx.lineTo(tx + s, ty + s);
      ctx.lineTo(tx + s, ty + s - 4);
      ctx.stroke();

      ctx.restore();
    });
  }
}

