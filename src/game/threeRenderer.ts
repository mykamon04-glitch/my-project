/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
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
  WeatherType,
  Wreckage,
} from '../types/game';
import { Camera } from './renderer';

export type GraphicsQuality = 'auto' | 'low' | 'medium' | 'high' | 'ultra';

export interface ThreeRendererOptions {
  quality?: GraphicsQuality;
}

/**
 * Procedural PBR Military Texture Generator
 * Generates high-fidelity normal maps, roughness maps, camouflage patterns,
 * rubber tread textures, and concrete finishes without external HTTP asset calls.
 */
class TextureGenerator {
  // 1. Armor Normal Map: panel seams, beveled edges, hex bolt rivets
  static createArmorNormalMap(): THREE.CanvasTexture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'rgb(128, 128, 255)';
      ctx.fillRect(0, 0, size, size);

      const panels = 4;
      const step = size / panels;
      for (let i = 0; i < panels; i++) {
        for (let j = 0; j < panels; j++) {
          const x = i * step + 4;
          const y = j * step + 4;
          const w = step - 8;
          const h = step - 8;

          ctx.strokeStyle = 'rgb(165, 165, 255)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(x, y + h);
          ctx.lineTo(x, y);
          ctx.lineTo(x + w, y);
          ctx.stroke();

          ctx.strokeStyle = 'rgb(92, 92, 255)';
          ctx.beginPath();
          ctx.moveTo(x + w, y);
          ctx.lineTo(x + w, y + h);
          ctx.lineTo(x, y + h);
          ctx.stroke();

          const corners = [
            [x + 10, y + 10],
            [x + w - 10, y + 10],
            [x + 10, y + h - 10],
            [x + w - 10, y + h - 10],
          ];
          corners.forEach(([cx, cy]) => {
            ctx.fillStyle = 'rgb(155, 155, 255)';
            ctx.beginPath();
            ctx.arc(cx - 1, cy - 1, 3.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgb(95, 95, 235)';
            ctx.beginPath();
            ctx.arc(cx + 1, cy + 1, 3.5, 0, Math.PI * 2);
            ctx.fill();
          });
        }
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  // 2. Concrete Bunker Normal Map: formwork lines and aggregate pitting
  static createConcreteNormalMap(): THREE.CanvasTexture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'rgb(128, 128, 255)';
      ctx.fillRect(0, 0, size, size);

      const imgData = ctx.getImageData(0, 0, size, size);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const noise = (Math.random() - 0.5) * 30;
        data[i] = Math.min(255, Math.max(0, 128 + noise));
        data[i + 1] = Math.min(255, Math.max(0, 128 + noise));
        data[i + 2] = 255;
      }
      ctx.putImageData(imgData, 0, 0);

      ctx.strokeStyle = 'rgb(95, 95, 240)';
      ctx.lineWidth = 2;
      for (let y = 64; y < size; y += 64) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(size, y);
        ctx.stroke();
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  // 3. Tank Track Tread Texture: deep rubber chevron cleats
  static createTreadTexture(): THREE.CanvasTexture {
    const w = 128;
    const h = 256;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#16191f';
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = '#282d36';
      const step = 24;
      for (let y = 0; y < h; y += step) {
        ctx.beginPath();
        ctx.moveTo(8, y + 4);
        ctx.lineTo(w / 2, y + 14);
        ctx.lineTo(w - 8, y + 4);
        ctx.lineTo(w - 8, y + 12);
        ctx.lineTo(w / 2, y + 22);
        ctx.lineTo(8, y + 12);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#3e4652';
        ctx.fillRect(w / 2 - 3, y, 6, step);
        ctx.fillStyle = '#282d36';
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 4);
    return tex;
  }

  // 4. Matte Camouflage Patterns
  static createCamoTexture(faction: 'player' | 'enemy'): THREE.CanvasTexture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const isPlayer = faction === 'player';
      const baseColor = isPlayer ? '#3e5241' : '#63252a';
      const camoColors = isPlayer
        ? ['#2c3a2f', '#4e6252', '#222822', '#586b5b']
        : ['#4b1a1e', '#7b2e35', '#241a1c', '#8a373f'];

      ctx.fillStyle = baseColor;
      ctx.fillRect(0, 0, size, size);

      for (let layer = 0; layer < 4; layer++) {
        ctx.fillStyle = camoColors[layer];
        for (let i = 0; i < 28; i++) {
          ctx.beginPath();
          let px = Math.random() * size;
          let py = Math.random() * size;
          ctx.moveTo(px, py);
          const points = 4 + Math.floor(Math.random() * 4);
          for (let p = 0; p < points; p++) {
            px += (Math.random() - 0.5) * 110;
            py += (Math.random() - 0.5) * 110;
            ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
        }
      }

      for (let i = 0; i < 4000; i++) {
        ctx.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.06)';
        ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
}

/**
 * Tactical Three.js RTS Engine Renderer
 * Recreates the complete AAA Military Asset Sheet:
 * - Infantry: Rifleman, Grenadier, Marksman, Anti-Armor, Medic, Engineer, Field Commander, Spec Ops
 * - Ground Vehicles: Recon Buggy, Armored Car, 8x8 APC, IFV, Artillery, MLRS, Logistics Truck, Recovery Vehicle
 * - Tanks: Sabre Light Tank, Centurion MBT, Mammoth Heavy Tank, Dreadnought Siege Tank, UGV Robot Tank
 * - Air Units: Viper Fighter, Phantom Multirole, Raven Stealth Bomber
 * - Rotary Wing: Hawk Utility, Cobra Attack, Titan Transport
 * - Drones: Scout Drone, Combat Drone, UCAV Strike Drone
 * - Fortified Base Buildings, PBR Materials, Realistic Cannon Recoil, and Combat VFX
 */
export class TacticalThreeRenderer {
  private canvas: HTMLCanvasElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private raycaster: THREE.Raycaster;
  private groundPlane: THREE.Plane;
  private isSoftwareGl: boolean;
  private quality: GraphicsQuality = 'auto';

  // Lighting
  private dirLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private combatLight: THREE.PointLight;

  // Scene Root Groups
  private terrainGroup: THREE.Group;
  private buildingsGroup: THREE.Group;
  private unitsGroup: THREE.Group;
  private projectilesGroup: THREE.Group;
  private fxGroup: THREE.Group;
  private previewGroup: THREE.Group;
  private oreGroup: THREE.Group;
  private damageSmokeGroup: THREE.Group;

  // Cache & Object Pools
  private buildingMeshes = new Map<string, THREE.Group>();
  private unitMeshes = new Map<string, THREE.Group>();
  private materials = new Map<string, THREE.Material>();

  // Map state tracking
  private currentMapId: string = '';
  private mapWidthWorld: number = 2000;
  private mapHeightWorld: number = 2000;

  // Animation & Time
  private lastAnimTime: number = 0;
  private rotorAngle: number = 0;
  private radarDishAngle: number = 0;

  constructor(canvas: HTMLCanvasElement, options?: ThreeRendererOptions) {
    this.canvas = canvas;
    this.quality = options?.quality || 'auto';

    // Software WebGL detection
    this.isSoftwareGl = (() => {
      try {
        const gl = document.createElement('canvas').getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return false;
      }
    })();

    const antialias = !this.isSoftwareGl && this.quality !== 'low';
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    this.applyPixelRatio();

    const enableShadows = !this.isSoftwareGl && this.quality !== 'low';
    this.renderer.shadowMap.enabled = enableShadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0c131a);
    this.scene.fog = new THREE.FogExp2(0x0c131a, 0.0003);

    const aspect = canvas.width / Math.max(1, canvas.height);
    this.camera = new THREE.PerspectiveCamera(45, aspect, 10, 4800);
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    try {
      const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
      pmremGenerator.dispose();
    } catch {
      // Fallback
    }

    this.dirLight = new THREE.DirectionalLight(0xfff5e6, 2.0);
    this.dirLight.position.set(650, 1100, 550);
    this.dirLight.castShadow = enableShadows;
    if (enableShadows) {
      this.dirLight.shadow.mapSize.width = this.quality === 'ultra' ? 2048 : 1024;
      this.dirLight.shadow.mapSize.height = this.quality === 'ultra' ? 2048 : 1024;
      this.dirLight.shadow.camera.near = 100;
      this.dirLight.shadow.camera.far = 3000;
      const d = 1300;
      this.dirLight.shadow.camera.left = -d;
      this.dirLight.shadow.camera.right = d;
      this.dirLight.shadow.camera.top = d;
      this.dirLight.shadow.camera.bottom = -d;
      this.dirLight.shadow.bias = -0.0003;
      this.dirLight.shadow.normalBias = 0.025;
    }
    this.scene.add(this.dirLight);

    this.hemiLight = new THREE.HemisphereLight(0x89b6dc, 0x272f38, 0.85);
    this.scene.add(this.hemiLight);

    this.combatLight = new THREE.PointLight(0xffaa44, 0, 400);
    this.scene.add(this.combatLight);

    this.terrainGroup = new THREE.Group();
    this.oreGroup = new THREE.Group();
    this.buildingsGroup = new THREE.Group();
    this.unitsGroup = new THREE.Group();
    this.projectilesGroup = new THREE.Group();
    this.damageSmokeGroup = new THREE.Group();
    this.fxGroup = new THREE.Group();
    this.previewGroup = new THREE.Group();

    this.scene.add(this.terrainGroup);
    this.scene.add(this.oreGroup);
    this.scene.add(this.buildingsGroup);
    this.scene.add(this.unitsGroup);
    this.scene.add(this.damageSmokeGroup);
    this.scene.add(this.projectilesGroup);
    this.scene.add(this.fxGroup);
    this.scene.add(this.previewGroup);

    this.initPBRMaterials();
  }

  public setQuality(quality: GraphicsQuality) {
    this.quality = quality;
    this.applyPixelRatio();
    const enableShadows = !this.isSoftwareGl && quality !== 'low';
    this.renderer.shadowMap.enabled = enableShadows;
    this.dirLight.castShadow = enableShadows;
  }

  private applyPixelRatio() {
    if (this.isSoftwareGl || this.quality === 'low') {
      this.renderer.setPixelRatio(1);
    } else if (this.quality === 'medium') {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    } else if (this.quality === 'high') {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    } else if (this.quality === 'ultra') {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));
    } else {
      const isMobile = window.innerWidth < 768;
      this.renderer.setPixelRatio(isMobile ? Math.min(window.devicePixelRatio, 1.5) : Math.min(window.devicePixelRatio, 2.0));
    }
  }

  public resize(width: number, height: number) {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  // --- Initialize PBR Textures & Realistic Military Materials ---
  private initPBRMaterials() {
    const armorNormal = TextureGenerator.createArmorNormalMap();
    const concreteNormal = TextureGenerator.createConcreteNormalMap();
    const treadTex = TextureGenerator.createTreadTexture();
    const playerCamoTex = TextureGenerator.createCamoTexture('player');
    const enemyCamoTex = TextureGenerator.createCamoTexture('enemy');

    // 1. Dark Steel Chassis / Weapons
    this.materials.set(
      'hull_graphite',
      new THREE.MeshStandardMaterial({
        color: 0x222830,
        normalMap: armorNormal,
        normalScale: new THREE.Vector2(0.6, 0.6),
        metalness: 0.85,
        roughness: 0.38,
      })
    );

    // 2. Concrete Bunker Masonry
    this.materials.set(
      'concrete_bunker',
      new THREE.MeshStandardMaterial({
        color: 0x3d444d,
        normalMap: concreteNormal,
        normalScale: new THREE.Vector2(0.8, 0.8),
        metalness: 0.15,
        roughness: 0.9,
      })
    );

    // 3. Player Olive-Drab Digital Military Camo
    this.materials.set(
      'player_armor',
      new THREE.MeshStandardMaterial({
        map: playerCamoTex,
        normalMap: armorNormal,
        normalScale: new THREE.Vector2(0.5, 0.5),
        metalness: 0.55,
        roughness: 0.45,
      })
    );

    // 4. Enemy Crimson Splinter Armor
    this.materials.set(
      'enemy_armor',
      new THREE.MeshStandardMaterial({
        map: enemyCamoTex,
        normalMap: armorNormal,
        normalScale: new THREE.Vector2(0.5, 0.5),
        metalness: 0.6,
        roughness: 0.42,
      })
    );

    // 5. Heavy Rubber / Caterpillar Treads
    this.materials.set(
      'tread_rubber',
      new THREE.MeshStandardMaterial({
        map: treadTex,
        color: 0x181c22,
        roughness: 0.88,
        metalness: 0.25,
      })
    );

    // 6. Cockpit & Tower Ballistic Glass
    this.materials.set(
      'canopy_glass',
      new THREE.MeshPhysicalMaterial({
        color: 0x1d3d63,
        metalness: 0.95,
        roughness: 0.08,
        transparent: true,
        opacity: 0.82,
        reflectivity: 0.95,
      })
    );

    // 7. Tactical Cyan Optics & Plasma
    this.materials.set(
      'cyan_glow',
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
      })
    );

    // 8. Amber Warning / Rocket Warheads
    this.materials.set(
      'hazard_amber',
      new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        metalness: 0.4,
        roughness: 0.35,
      })
    );

    // 9. Ghillie Foliage Material (Olive / Frond green)
    this.materials.set(
      'ghillie_foliage',
      new THREE.MeshStandardMaterial({
        color: 0x4a5d3f,
        roughness: 0.95,
        metalness: 0.05,
      })
    );

    // 10. Spec Ops Carbon Armor
    this.materials.set(
      'spec_ops_black',
      new THREE.MeshStandardMaterial({
        color: 0x14171c,
        normalMap: armorNormal,
        normalScale: new THREE.Vector2(0.4, 0.4),
        metalness: 0.7,
        roughness: 0.35,
      })
    );

    // 11. Tiberium Cyan Crystal
    this.materials.set(
      'ore_crystal',
      new THREE.MeshPhysicalMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.85,
        metalness: 0.1,
        roughness: 0.15,
        transparent: true,
        opacity: 0.9,
      })
    );

    // 12. Damage Smoke & Flame Particles
    this.materials.set(
      'smoke_particle',
      new THREE.MeshBasicMaterial({
        color: 0x222222,
        transparent: true,
        opacity: 0.6,
      })
    );
    this.materials.set(
      'flame_ember',
      new THREE.MeshBasicMaterial({
        color: 0xff6600,
        transparent: true,
        opacity: 0.8,
      })
    );
  }

  // --- Screen to 3D World Raycasting ---
  public screenToWorld(screenX: number, screenY: number): Vector2 {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((screenX - rect.left) / rect.width) * 2 - 1;
    const y = -((screenY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);
    const hitPoint = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, hitPoint);

    if (hit) {
      return { x: hitPoint.x, y: hitPoint.z };
    }
    return { x: 0, y: 0 };
  }

  // --- World to Screen Coordinates ---
  public worldToScreen(worldX: number, worldY: number): Vector2 {
    const pos = new THREE.Vector3(worldX, 0, worldY);
    pos.project(this.camera);

    const rect = this.canvas.getBoundingClientRect();
    const x = ((pos.x + 1) / 2) * rect.width + rect.left;
    const y = ((-pos.y + 1) / 2) * rect.height + rect.top;
    return { x, y };
  }

  // --- Update Camera from 2D Pan, Zoom, and 360-degree Azimuth Rotation ---
  private updateCamera(cam: Camera) {
    const zoom = Math.max(0.35, cam.zoom || 1.0);
    const distance = 960 / zoom;
    const pitchRad = (54 * Math.PI) / 180;
    const azimuthRad = cam.rotation || 0;

    const horizontalDist = Math.cos(pitchRad) * distance;
    const offsetY = Math.sin(pitchRad) * distance;
    const offsetX = Math.sin(azimuthRad) * horizontalDist;
    const offsetZ = Math.cos(azimuthRad) * horizontalDist;

    this.camera.position.set(cam.x + offsetX, offsetY, cam.y + offsetZ);
    this.camera.lookAt(cam.x, 0, cam.y);

    this.dirLight.position.set(cam.x + 550, 1000, cam.y + 450);
    this.dirLight.target.position.set(cam.x, 0, cam.y);
    this.dirLight.target.updateMatrixWorld();
  }

  // --- Terrain Build or Refresh ---
  private updateTerrain(mapData: MapData) {
    if (this.currentMapId === mapData.id && this.terrainGroup.children.length > 0) return;

    this.currentMapId = mapData.id;
    const ts = mapData.tileSize;
    const mapW = mapData.width * ts;
    const mapH = mapData.height * ts;
    this.mapWidthWorld = mapW;
    this.mapHeightWorld = mapH;

    while (this.terrainGroup.children.length > 0) {
      const obj = this.terrainGroup.children[0];
      this.terrainGroup.remove(obj);
      if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
    }
    while (this.oreGroup.children.length > 0) {
      const obj = this.oreGroup.children[0];
      this.oreGroup.remove(obj);
      if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
    }

    const biome = mapData.biome || 'temperate';
    let baseHex = '#27382b';
    let rockColor = 0x41474e;
    let waterColor = 0x114f73;
    let oreColor = 0x38bdf8;

    if (biome === 'desert') {
      baseHex = '#7a6241';
      rockColor = 0x6e563a;
      waterColor = 0x165b6b;
    } else if (biome === 'snow') {
      baseHex = '#899da9';
      rockColor = 0x434e59;
      waterColor = 0x266885;
    } else if (biome === 'volcanic') {
      baseHex = '#241a17';
      rockColor = 0x1d1614;
      waterColor = 0x7c2d12;
      oreColor = 0xf97316;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = baseHex;
      ctx.fillRect(0, 0, 1024, 1024);

      for (let i = 0; i < 30000; i++) {
        const x = Math.random() * 1024;
        const y = Math.random() * 1024;
        const r = 1 + Math.random() * 2.5;
        ctx.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 1;
      const step = 64;
      for (let x = 0; x <= 1024; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 1024);
        ctx.stroke();
      }
      for (let y = 0; y <= 1024; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(1024, y);
        ctx.stroke();
      }
    }

    const groundTex = new THREE.CanvasTexture(canvas);
    groundTex.wrapS = THREE.RepeatWrapping;
    groundTex.wrapT = THREE.RepeatWrapping;
    groundTex.repeat.set(mapData.width / 4, mapData.height / 4);
    groundTex.colorSpace = THREE.SRGBColorSpace;

    const groundMat = new THREE.MeshStandardMaterial({
      map: groundTex,
      roughness: 0.9,
      metalness: 0.1,
    });

    const groundGeo = new THREE.PlaneGeometry(mapW, mapH, 1, 1);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.position.set(mapW / 2, 0, mapH / 2);
    groundMesh.receiveShadow = true;
    this.terrainGroup.add(groundMesh);

    const rockMat = new THREE.MeshStandardMaterial({
      color: rockColor,
      roughness: 0.92,
      metalness: 0.2,
    });
    const waterMat = new THREE.MeshStandardMaterial({
      color: waterColor,
      roughness: 0.15,
      metalness: 0.45,
      transparent: true,
      opacity: 0.85,
    });
    const cliffGeo = new THREE.BoxGeometry(ts, 22, ts);

    for (let y = 0; y < mapData.height; y++) {
      for (let x = 0; x < mapData.width; x++) {
        const tile = mapData.tiles[y][x];
        const wx = x * ts + ts / 2;
        const wz = y * ts + ts / 2;

        if (tile === 4) {
          const cliff = new THREE.Mesh(cliffGeo, rockMat);
          cliff.position.set(wx, 11, wz);
          cliff.castShadow = true;
          cliff.receiveShadow = true;
          this.terrainGroup.add(cliff);
        } else if (tile === 3) {
          const water = new THREE.Mesh(new THREE.PlaneGeometry(ts, ts), waterMat);
          water.rotateX(-Math.PI / 2);
          water.position.set(wx, 0.4, wz);
          this.terrainGroup.add(water);
        }
      }
    }

    const crystalGeo = new THREE.ConeGeometry(4.5, 18, 5);
    crystalGeo.translate(0, 9, 0);
    const oreMat = this.materials.get('ore_crystal')!;

    mapData.resourceNodes.forEach(rn => {
      const cluster = new THREE.Group();
      const rx = rn.x * ts + ts / 2;
      const rz = rn.y * ts + ts / 2;

      for (let i = 0; i < 7; i++) {
        const crystal = new THREE.Mesh(crystalGeo, oreMat);
        const ang = (i / 7) * Math.PI * 2;
        const rad = 5 + Math.random() * 7;
        crystal.position.set(Math.cos(ang) * rad, 0, Math.sin(ang) * rad);
        crystal.rotation.x = (Math.random() - 0.5) * 0.45;
        crystal.rotation.z = (Math.random() - 0.5) * 0.45;
        crystal.rotation.y = Math.random() * Math.PI;
        crystal.scale.setScalar(0.75 + Math.random() * 0.55);
        crystal.castShadow = true;
        cluster.add(crystal);
      }
      cluster.position.set(rx, 0, rz);
      this.oreGroup.add(cluster);
    });
  }

  // --- Photorealistic 3D Military Structures ---
  private createBuildingModel(b: Building): THREE.Group {
    const group = new THREE.Group();
    const isPlayer = b.faction === 'player';
    const armorMat = isPlayer ? this.materials.get('player_armor')! : this.materials.get('enemy_armor')!;
    const hullMat = this.materials.get('hull_graphite')!;
    const concreteMat = this.materials.get('concrete_bunker')!;
    const cyanGlow = this.materials.get('cyan_glow')!;
    const hazardMat = this.materials.get('hazard_amber')!;
    const glassMat = this.materials.get('canopy_glass')!;
    const treadMat = this.materials.get('tread_rubber')!;

    const ts = 40;
    const bw = b.width * ts * 0.92;
    const bh = b.height * ts * 0.92;

    switch (b.type) {
      case 'headquarters': {
        const base = new THREE.Mesh(new THREE.BoxGeometry(bw, 14, bh), concreteMat);
        base.position.y = 7;
        base.castShadow = true;
        base.receiveShadow = true;
        group.add(base);

        const deck = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.74, 16, bh * 0.74), armorMat);
        deck.position.y = 22;
        deck.castShadow = true;
        group.add(deck);

        const rampGeo = new THREE.BoxGeometry(bw * 0.34, 4, bh * 0.45);
        rampGeo.rotateX(0.25);
        const ramp = new THREE.Mesh(rampGeo, hazardMat);
        ramp.position.set(0, 3, bh * 0.42);
        group.add(ramp);

        const dishMount = new THREE.Group();
        dishMount.name = 'radarDishMount';
        dishMount.position.set(-bw * 0.24, 32, -bh * 0.22);

        const dishGeo = new THREE.CylinderGeometry(11, 2.5, 4, 14, 1, true);
        dishGeo.rotateX(Math.PI / 3);
        const dish = new THREE.Mesh(dishGeo, hullMat);
        dishMount.add(dish);

        const horn = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 9), cyanGlow);
        horn.position.set(0, 4.5, 3.5);
        dishMount.add(horn);
        group.add(dishMount);

        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.4, 30), hullMat);
        mast.position.set(bw * 0.26, 37, -bh * 0.24);
        group.add(mast);

        const beacon = new THREE.Mesh(new THREE.SphereGeometry(2), cyanGlow);
        beacon.position.set(bw * 0.26, 52, -bh * 0.24);
        group.add(beacon);

        // Support Props from Asset Sheet: Tripod sensor & terminal suitcase near HQ
        const tripodMount = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 6), hullMat);
        tripodMount.position.set(bw * 0.4, 14, bh * 0.35);
        group.add(tripodMount);
        const sensorHead = new THREE.Mesh(new THREE.BoxGeometry(4, 2.5, 3), cyanGlow);
        sensorHead.position.set(bw * 0.4, 18, bh * 0.35);
        group.add(sensorHead);
        break;
      }

      case 'barracks': {
        const garrison = new THREE.Mesh(new THREE.BoxGeometry(bw, 18, bh), armorMat);
        garrison.position.y = 9;
        garrison.castShadow = true;
        group.add(garrison);

        const roof = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.86, 4, bh * 0.88), hullMat);
        roof.position.y = 20;
        group.add(roof);

        const door = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.44, 10, 2), cyanGlow);
        door.position.set(0, 5, bh / 2);
        group.add(door);

        const scrub1 = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 6, 8), hullMat);
        scrub1.position.set(-bw * 0.3, 23, 0);
        group.add(scrub1);
        const scrub2 = scrub1.clone();
        scrub2.position.set(bw * 0.3, 23, 0);
        group.add(scrub2);
        break;
      }

      case 'vehicle_factory': {
        const bay = new THREE.Mesh(new THREE.BoxGeometry(bw, 22, bh), hullMat);
        bay.position.y = 11;
        bay.castShadow = true;
        group.add(bay);

        const gantry = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.72, 8, bh * 0.94), armorMat);
        gantry.position.y = 26;
        group.add(gantry);

        const crane = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.76, 3.5, 5), hazardMat);
        crane.position.set(0, 29, 0);
        group.add(crane);

        const pipeGeo = new THREE.CylinderGeometry(2.5, 3, 16);
        const pipe1 = new THREE.Mesh(pipeGeo, treadMat);
        pipe1.position.set(-bw * 0.38, 27, -bh * 0.35);
        group.add(pipe1);
        const pipe2 = pipe1.clone();
        pipe2.position.set(-bw * 0.26, 27, -bh * 0.35);
        group.add(pipe2);
        break;
      }

      case 'power_plant': {
        const foundation = new THREE.Mesh(new THREE.CylinderGeometry(bw * 0.46, bw * 0.5, 10, 16), concreteMat);
        foundation.position.y = 5;
        foundation.castShadow = true;
        group.add(foundation);

        const core = new THREE.Mesh(new THREE.CylinderGeometry(bw * 0.28, bw * 0.28, 20, 16), cyanGlow);
        core.position.y = 19;
        group.add(core);

        const ring = new THREE.Mesh(new THREE.TorusGeometry(bw * 0.42, 3.5, 8, 20), armorMat);
        ring.rotateX(Math.PI / 2);
        ring.position.y = 19;
        group.add(ring);
        break;
      }

      case 'coin_generator': {
        const furnace = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.62, 22, bh * 0.76), armorMat);
        furnace.position.set(-bw * 0.14, 11, 0);
        furnace.castShadow = true;
        group.add(furnace);

        const siloGeo = new THREE.CylinderGeometry(bw * 0.17, bw * 0.17, 28, 12);
        const s1 = new THREE.Mesh(siloGeo, hullMat);
        s1.position.set(bw * 0.3, 14, -bh * 0.22);
        group.add(s1);
        const s2 = s1.clone();
        s2.position.set(bw * 0.3, 14, bh * 0.22);
        group.add(s2);

        const chute = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.36, 4, bh * 0.36), treadMat);
        chute.position.set(-bw * 0.14, 4, bh * 0.4);
        group.add(chute);

        const oreBatch = new THREE.Mesh(new THREE.DodecahedronGeometry(6), this.materials.get('ore_crystal')!);
        oreBatch.position.set(-bw * 0.14, 10, bh * 0.4);
        group.add(oreBatch);
        break;
      }

      case 'supply_depot': {
        const warehouse = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.88, 15, bh * 0.72), armorMat);
        warehouse.position.y = 7.5;
        warehouse.castShadow = true;
        group.add(warehouse);

        const c1 = new THREE.Mesh(new THREE.BoxGeometry(15, 8, 22), isPlayer ? hazardMat : treadMat);
        c1.position.set(bw * 0.28, 4, bh * 0.22);
        group.add(c1);

        // Specialist supply crates and tripod terminal from asset sheet
        const crate = new THREE.Mesh(new THREE.BoxGeometry(8, 6, 8), hazardMat);
        crate.position.set(-bw * 0.3, 3, bh * 0.25);
        group.add(crate);
        break;
      }

      case 'field_hospital': {
        const clinic = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.85, 14, bh * 0.8), concreteMat);
        clinic.position.y = 7;
        clinic.castShadow = true;
        group.add(clinic);

        const roof = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.9, 3, bh * 0.85), armorMat);
        roof.position.y = 15;
        group.add(roof);

        // Red cross insignia on roof
        const redCross1 = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.45, 0.4, 4), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
        redCross1.position.y = 16.6;
        group.add(redCross1);
        const redCross2 = new THREE.Mesh(new THREE.BoxGeometry(4, 0.4, bh * 0.45), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
        redCross2.position.y = 16.6;
        group.add(redCross2);

        // Deployed field trauma tent
        const tent = new THREE.Mesh(new THREE.ConeGeometry(bw * 0.25, 10, 4), armorMat);
        tent.position.set(bw * 0.35, 5, bh * 0.3);
        group.add(tent);
        break;
      }

      case 'airfield':
      case 'helipad': {
        const deck = new THREE.Mesh(new THREE.BoxGeometry(bw, 3, bh), treadMat);
        deck.position.y = 1.5;
        deck.receiveShadow = true;
        group.add(deck);

        const tower = new THREE.Mesh(new THREE.BoxGeometry(18, 34, 18), concreteMat);
        tower.position.set(-bw * 0.34, 17, -bh * 0.34);
        tower.castShadow = true;
        group.add(tower);

        const glass = new THREE.Mesh(new THREE.BoxGeometry(20, 8, 20), glassMat);
        glass.position.set(-bw * 0.34, 35, -bh * 0.34);
        group.add(glass);
        break;
      }

      case 'radar_station': {
        const hex = new THREE.Mesh(new THREE.CylinderGeometry(bw * 0.46, bw * 0.5, 12, 6), concreteMat);
        hex.position.y = 6;
        hex.castShadow = true;
        group.add(hex);

        const mount = new THREE.Group();
        mount.name = 'radarDishMount';
        mount.position.set(0, 16, 0);

        const dish = new THREE.Mesh(new THREE.CylinderGeometry(20, 4.5, 6, 16, 1, true), hullMat);
        dish.rotateX(Math.PI / 3);
        mount.add(dish);

        const probe = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 14), cyanGlow);
        probe.position.set(0, 7, 4.5);
        mount.add(probe);
        group.add(mount);
        break;
      }

      case 'research_lab': {
        const foundation = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.86, 12, bh * 0.86), armorMat);
        foundation.position.y = 6;
        foundation.castShadow = true;
        group.add(foundation);

        const dome = new THREE.Mesh(new THREE.SphereGeometry(bw * 0.3, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), glassMat);
        dome.position.set(-bw * 0.12, 12, 0);
        group.add(dome);

        const tube = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 18, 12), cyanGlow);
        tube.position.set(bw * 0.28, 15, 0);
        group.add(tube);
        break;
      }

      case 'heavy_turret':
      case 'turret_gun': {
        const mount = new THREE.Mesh(new THREE.CylinderGeometry(bw * 0.42, bw * 0.46, 8, 12), concreteMat);
        mount.position.y = 4;
        mount.castShadow = true;
        group.add(mount);

        const head = new THREE.Group();
        head.name = 'turretHead';
        head.position.set(0, 11, 0);

        const cupola = new THREE.Mesh(new THREE.BoxGeometry(16, 9, 20), armorMat);
        head.add(cupola);

        const bGeo = new THREE.CylinderGeometry(1.6, 2.0, 24);
        bGeo.rotateX(Math.PI / 2);
        const b1 = new THREE.Mesh(bGeo, hullMat);
        b1.position.set(-4.5, 0, 14);
        head.add(b1);
        const b2 = new THREE.Mesh(bGeo, hullMat);
        b2.position.set(4.5, 0, 14);
        head.add(b2);

        group.add(head);
        break;
      }

      case 'turret_missile':
      case 'turret_aa': {
        const mount = new THREE.Mesh(new THREE.CylinderGeometry(bw * 0.42, bw * 0.46, 8, 12), concreteMat);
        mount.position.y = 4;
        group.add(mount);

        const launcher = new THREE.Group();
        launcher.name = 'launcher';
        launcher.position.set(0, 11, 0);

        const rack = new THREE.Mesh(new THREE.BoxGeometry(18, 6, 22), armorMat);
        rack.rotateX(-0.35);
        launcher.add(rack);

        const misGeo = new THREE.CylinderGeometry(1.4, 1.4, 20);
        misGeo.rotateX(Math.PI / 2 - 0.35);
        for (let i = -1; i <= 1; i++) {
          const mis = new THREE.Mesh(misGeo, hazardMat);
          mis.position.set(i * 5.5, 4.5, 2);
          launcher.add(mis);
        }
        group.add(launcher);
        break;
      }

      case 'defense_wall':
      case 'repair_bay':
      default: {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(bw, 16, bh * 0.38), concreteMat);
        wall.position.y = 8;
        wall.castShadow = true;
        group.add(wall);

        const pylon = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5.5, 20, 8), armorMat);
        pylon.position.set(0, 10, 0);
        group.add(pylon);

        const beacon = new THREE.Mesh(new THREE.SphereGeometry(2), cyanGlow);
        beacon.position.set(0, 21, 0);
        group.add(beacon);
        break;
      }
    }

    return group;
  }

  // --- Photorealistic 3D Military Units (From the AAA Military Asset Sheet) ---
  private createUnitModel(u: Unit): THREE.Group {
    const group = new THREE.Group();
    const isPlayer = u.faction === 'player';
    const armorMat = isPlayer ? this.materials.get('player_armor')! : this.materials.get('enemy_armor')!;
    const hullMat = this.materials.get('hull_graphite')!;
    const cyanGlow = this.materials.get('cyan_glow')!;
    const hazardMat = this.materials.get('hazard_amber')!;
    const treadMat = this.materials.get('tread_rubber')!;
    const glassMat = this.materials.get('canopy_glass')!;
    const ghillieMat = this.materials.get('ghillie_foliage')!;
    const specOpsMat = this.materials.get('spec_ops_black')!;

    switch (u.type) {
      // ==========================================
      // 1. INFANTRY UNITS
      // ==========================================
      case 'rifleman':
      case 'grenadier':
      case 'sniper':
      case 'rocket_soldier':
      case 'medic':
      case 'engineer':
      case 'field_commander':
      case 'commando':
      case 'scout':
      case 'heavy_gunner':
      case 'flamethrower': {
        const isSpecOps = u.type === 'commando';
        const isMarksman = u.type === 'sniper';
        const isCommander = u.type === 'field_commander';
        const isMedic = u.type === 'medic';
        const isEngineer = u.type === 'engineer';
        const isGrenadier = u.type === 'grenadier';
        const isRocket = u.type === 'rocket_soldier';

        // Torso / Plate Carrier
        const suitMat = isSpecOps ? specOpsMat : isMarksman ? ghillieMat : armorMat;
        const torso = new THREE.Mesh(new THREE.BoxGeometry(4.8, 6.5, 3.2), suitMat);
        torso.position.y = 6.2;
        torso.castShadow = true;
        group.add(torso);

        // Helmet
        const helmMat = isEngineer ? hazardMat : isSpecOps ? specOpsMat : isMarksman ? ghillieMat : hullMat;
        const helmet = new THREE.Mesh(new THREE.SphereGeometry(2.3, 10, 10), helmMat);
        helmet.position.set(0, 11, 0);
        group.add(helmet);

        // Visor / Optics
        if (isSpecOps) {
          // GPNVG-18 quad-tube panoramic night-vision goggles
          const nvg = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.9, 1.6), cyanGlow);
          nvg.position.set(0, 11.2, 2.2);
          group.add(nvg);
        } else if (!isMarksman) {
          const visor = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.2, 1.4), cyanGlow);
          visor.position.set(0, 11, 1.8);
          group.add(visor);
        }

        // Ghillie foliage fronds for sniper/marksman
        if (isMarksman) {
          for (let f = 0; f < 6; f++) {
            const frond = new THREE.Mesh(new THREE.ConeGeometry(2, 5, 4), ghillieMat);
            frond.position.set((Math.random() - 0.5) * 4, 8 + Math.random() * 4, (Math.random() - 0.5) * 3);
            frond.rotation.z = (Math.random() - 0.5) * 0.8;
            group.add(frond);
          }
        }

        // Commander Datapad & Antenna
        if (isCommander) {
          const datapad = new THREE.Mesh(new THREE.BoxGeometry(2.5, 3.2, 0.4), cyanGlow);
          datapad.position.set(0, 7.5, 2.4);
          datapad.rotateX(0.4);
          group.add(datapad);

          const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 9), hullMat);
          ant.position.set(-2, 12, -1.5);
          group.add(ant);
        }

        // Weapon
        let weapon: THREE.Mesh;
        if (isRocket) {
          // Javelin ATGM shoulder launcher tube
          const launcherGeo = new THREE.CylinderGeometry(1.6, 1.8, 14);
          launcherGeo.rotateX(Math.PI / 2);
          weapon = new THREE.Mesh(launcherGeo, hullMat);
          weapon.position.set(2.6, 8, 3.5);
        } else if (isGrenadier) {
          // Drum grenade launcher
          weapon = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.2, 8), hullMat);
          weapon.position.set(2.4, 7, 3.5);
          const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 2.5), hazardMat);
          drum.position.set(2.4, 5.8, 3);
          group.add(drum);
        } else if (isMarksman) {
          // Suppressed Sniper Rifle with Long Barrel
          weapon = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 13), hullMat);
          weapon.position.set(2.4, 7, 5);
        } else {
          // Standard Assault Rifle / Carbine
          weapon = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.6, 8), hullMat);
          weapon.position.set(2.4, 7, 3.5);
        }
        weapon.name = 'weaponAssembly';
        group.add(weapon);

        // Backpack / Specialist Gear
        if (isMedic) {
          const medpack = new THREE.Mesh(new THREE.BoxGeometry(3.5, 4.5, 2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
          medpack.position.set(0, 6.5, -2.2);
          group.add(medpack);
          const cross = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 0.2), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
          cross.position.set(0, 6.5, -3.3);
          group.add(cross);
        } else if (isEngineer) {
          const engPack = new THREE.Mesh(new THREE.BoxGeometry(4, 4.5, 2.5), hazardMat);
          engPack.position.set(0, 6.5, -2.4);
          group.add(engPack);
        }

        // Articulated Legs
        const legGeo = new THREE.BoxGeometry(1.8, 5.2, 2.0);
        const leftLeg = new THREE.Mesh(legGeo, treadMat);
        leftLeg.name = 'leftLeg';
        leftLeg.position.set(-1.5, 2.6, 0);
        group.add(leftLeg);

        const rightLeg = new THREE.Mesh(legGeo, treadMat);
        rightLeg.name = 'rightLeg';
        rightLeg.position.set(1.5, 2.6, 0);
        group.add(rightLeg);
        break;
      }

      // ==========================================
      // 2. GROUND VEHICLES & TANKS
      // ==========================================
      case 'recon_buggy': {
        const chassis = new THREE.Mesh(new THREE.BoxGeometry(13, 5, 20), armorMat);
        chassis.position.y = 5.5;
        chassis.castShadow = true;
        group.add(chassis);

        const cage = new THREE.Mesh(new THREE.BoxGeometry(11, 6.5, 13), hullMat);
        cage.position.set(0, 10.5, -1);
        group.add(cage);

        const wheelGeo = new THREE.CylinderGeometry(3.8, 3.8, 3.0, 12);
        wheelGeo.rotateZ(Math.PI / 2);
        [[-7.2, 3.8, 6.5], [7.2, 3.8, 6.5], [-7.2, 3.8, -6.5], [7.2, 3.8, -6.5]].forEach(pos => {
          const w = new THREE.Mesh(wheelGeo, treadMat);
          w.position.set(pos[0], pos[1], pos[2]);
          group.add(w);
        });

        const pod = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 3.5), cyanGlow);
        pod.position.set(0, 15, 0);
        group.add(pod);
        break;
      }

      case 'armored_car': {
        // 4x4 Tactical Protected Patrol Vehicle (Tactical SUV)
        const body = new THREE.Mesh(new THREE.BoxGeometry(14, 7, 22), armorMat);
        body.position.y = 7;
        body.castShadow = true;
        group.add(body);

        const cabin = new THREE.Mesh(new THREE.BoxGeometry(12, 6, 12), hullMat);
        cabin.position.set(0, 12, -1);
        group.add(cabin);

        const windshield = new THREE.Mesh(new THREE.BoxGeometry(11.5, 4, 1), glassMat);
        windshield.position.set(0, 12, 5.5);
        windshield.rotateX(0.25);
        group.add(windshield);

        const wheelGeo = new THREE.CylinderGeometry(3.6, 3.6, 2.8, 12);
        wheelGeo.rotateZ(Math.PI / 2);
        [[-7.5, 3.6, 6.5], [7.5, 3.6, 6.5], [-7.5, 3.6, -6.5], [7.5, 3.6, -6.5]].forEach(pos => {
          const w = new THREE.Mesh(wheelGeo, treadMat);
          w.position.set(pos[0], pos[1], pos[2]);
          group.add(w);
        });

        // Rooftop gun turret cupola
        const turret = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 4, 3, 10), hullMat);
        turret.position.set(0, 16, 0);
        group.add(turret);
        const mg = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 7), hullMat);
        mg.position.set(0, 17.5, 4);
        group.add(mg);
        break;
      }

      case 'apc':
      case 'medical_apc': {
        // 8x8 Heavy Armored Personnel Carrier
        const hull = new THREE.Mesh(new THREE.BoxGeometry(15, 7.5, 27), armorMat);
        hull.position.y = 7.5;
        hull.castShadow = true;
        group.add(hull);

        const wGeo = new THREE.CylinderGeometry(3.2, 3.2, 2.6, 10);
        wGeo.rotateZ(Math.PI / 2);
        [-9, -3, 3, 9].forEach(z => {
          const wL = new THREE.Mesh(wGeo, treadMat);
          wL.position.set(-8.8, 3.5, z);
          group.add(wL);
          const wR = new THREE.Mesh(wGeo, treadMat);
          wR.position.set(8.8, 3.5, z);
          group.add(wR);
        });

        // RWS or Medical Emblems
        if (u.type === 'medical_apc') {
          const redCross = new THREE.Mesh(new THREE.BoxGeometry(4.5, 4.5, 0.4), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
          redCross.position.set(7.8, 7.5, 0);
          redCross.rotateY(Math.PI / 2);
          group.add(redCross);
        } else {
          const rws = new THREE.Mesh(new THREE.BoxGeometry(4, 3.5, 5), hullMat);
          rws.position.set(0, 12.5, 2);
          group.add(rws);
          const mg = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 7), hullMat);
          mg.rotateX(Math.PI / 2);
          mg.position.set(0, 13.5, 6);
          group.add(mg);
        }
        break;
      }

      case 'ifv':
      case 'aa_vehicle': {
        // Tracked Infantry Fighting Vehicle / Flak Tank
        const hull = new THREE.Mesh(new THREE.BoxGeometry(16, 6.5, 24), armorMat);
        hull.position.y = 6;
        hull.castShadow = true;
        group.add(hull);

        const trackGeo = new THREE.BoxGeometry(3.5, 6, 26);
        const tL = new THREE.Mesh(trackGeo, treadMat);
        tL.position.set(-9, 5, 0);
        group.add(tL);
        const tR = new THREE.Mesh(trackGeo, treadMat);
        tR.position.set(9, 5, 0);
        group.add(tR);

        const turret = new THREE.Group();
        turret.position.set(0, 10, -1);

        const cupola = new THREE.Mesh(new THREE.BoxGeometry(10, 4.5, 12), hullMat);
        turret.add(cupola);

        // 30mm Autocannon
        const gunGeo = new THREE.CylinderGeometry(1.2, 1.4, 18);
        gunGeo.rotateX(Math.PI / 2);
        const gun = new THREE.Mesh(gunGeo, hullMat);
        gun.position.set(0, 1, 10);
        turret.add(gun);

        // ATGM Missile Pod on Side
        const atgmPod = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 8), hazardMat);
        atgmPod.position.set(6, 2.5, 0);
        turret.add(atgmPod);

        group.add(turret);
        break;
      }

      case 'artillery': {
        // Self-Propelled Artillery with 155mm Howitzer
        const hull = new THREE.Mesh(new THREE.BoxGeometry(18, 7, 28), armorMat);
        hull.position.y = 6.5;
        hull.castShadow = true;
        group.add(hull);

        const trackGeo = new THREE.BoxGeometry(3.8, 6.5, 30);
        const tL = new THREE.Mesh(trackGeo, treadMat);
        tL.position.set(-10, 5.5, 0);
        group.add(tL);
        const tR = new THREE.Mesh(trackGeo, treadMat);
        tR.position.set(10, 5.5, 0);
        group.add(tR);

        const turret = new THREE.Group();
        turret.name = 'turretAssembly';
        turret.position.set(0, 11, -3);

        const boxTurret = new THREE.Mesh(new THREE.BoxGeometry(14, 8, 16), hullMat);
        boxTurret.position.y = 4;
        turret.add(boxTurret);

        // Massive 155mm Cannon Barrel with Muzzle Brake
        const barrelGroup = new THREE.Group();
        barrelGroup.name = 'cannonBarrelGroup';
        barrelGroup.position.set(0, 5, 4);

        const barrelGeo = new THREE.CylinderGeometry(2.0, 2.4, 32);
        barrelGeo.rotateX(Math.PI / 2 - 0.25); // Elevated
        const barrel = new THREE.Mesh(barrelGeo, hullMat);
        barrel.position.set(0, 3, 15);
        barrelGroup.add(barrel);

        const brake = new THREE.Mesh(new THREE.BoxGeometry(5.2, 3.8, 4), treadMat);
        brake.position.set(0, 6.8, 30);
        barrelGroup.add(brake);

        turret.add(barrelGroup);
        group.add(turret);
        break;
      }

      case 'mlrs':
      case 'mobile_sam': {
        // Multiple Launch Rocket System (12-tube pod)
        const hull = new THREE.Mesh(new THREE.BoxGeometry(17, 7, 26), armorMat);
        hull.position.y = 6.5;
        hull.castShadow = true;
        group.add(hull);

        const trackGeo = new THREE.BoxGeometry(3.6, 6.5, 28);
        const tL = new THREE.Mesh(trackGeo, treadMat);
        tL.position.set(-9.5, 5.5, 0);
        group.add(tL);
        const tR = new THREE.Mesh(trackGeo, treadMat);
        tR.position.set(9.5, 5.5, 0);
        group.add(tR);

        // Rocket Launcher Pod elevated 40 degrees
        const launcher = new THREE.Group();
        launcher.position.set(0, 11, -2);

        const pod = new THREE.Mesh(new THREE.BoxGeometry(13, 7, 18), hullMat);
        pod.rotateX(-0.38);
        launcher.add(pod);

        // Rocket warhead tips
        for (let r = 0; r < 2; r++) {
          for (let c = 0; c < 6; c++) {
            const warhead = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 2), hazardMat);
            warhead.rotateX(Math.PI / 2 - 0.38);
            warhead.position.set(-5 + c * 2, 2 - r * 3, 8);
            launcher.add(warhead);
          }
        }

        group.add(launcher);
        break;
      }

      case 'logistics_truck': {
        // Heavy 6x6 Logistics Transport Truck
        const cab = new THREE.Mesh(new THREE.BoxGeometry(14, 9, 10), armorMat);
        cab.position.set(0, 9, 8);
        cab.castShadow = true;
        group.add(cab);

        const bed = new THREE.Mesh(new THREE.BoxGeometry(14, 10, 18), hullMat);
        bed.position.set(0, 9.5, -6);
        group.add(bed);

        const canopy = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 18, 8, 1, false, 0, Math.PI), armorMat);
        canopy.rotateZ(Math.PI / 2);
        canopy.position.set(0, 14.5, -6);
        group.add(canopy);

        const wGeo = new THREE.CylinderGeometry(3.5, 3.5, 2.8, 10);
        wGeo.rotateZ(Math.PI / 2);
        [8, -2, -10].forEach(z => {
          const wL = new THREE.Mesh(wGeo, treadMat);
          wL.position.set(-8, 3.5, z);
          group.add(wL);
          const wR = new THREE.Mesh(wGeo, treadMat);
          wR.position.set(8, 3.5, z);
          group.add(wR);
        });
        break;
      }

      case 'recovery_vehicle': {
        // Armored Recovery Vehicle with crane boom & front dozer blade
        const hull = new THREE.Mesh(new THREE.BoxGeometry(17, 7, 26), armorMat);
        hull.position.y = 6.5;
        hull.castShadow = true;
        group.add(hull);

        const blade = new THREE.Mesh(new THREE.BoxGeometry(20, 6, 2.5), hazardMat);
        blade.position.set(0, 4.5, 14);
        group.add(blade);

        const crane = new THREE.Group();
        crane.position.set(0, 10, -5);
        const boom = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 18), hazardMat);
        boom.rotateX(0.5);
        boom.position.set(0, 6, 7);
        crane.add(boom);
        group.add(crane);

        const trackGeo = new THREE.BoxGeometry(3.8, 6.5, 28);
        const tL = new THREE.Mesh(trackGeo, treadMat);
        tL.position.set(-9.5, 5.5, 0);
        group.add(tL);
        const tR = new THREE.Mesh(trackGeo, treadMat);
        tR.position.set(9.5, 5.5, 0);
        group.add(tR);
        break;
      }

      case 'light_tank':
      case 'main_battle_tank':
      case 'heavy_tank':
      case 'siege_tank':
      case 'ugv_robot_tank': {
        const isMammoth = u.type === 'heavy_tank';
        const isSiege = u.type === 'siege_tank';
        const isSabre = u.type === 'light_tank';
        const isUGV = u.type === 'ugv_robot_tank';

        const hullW = isMammoth ? 23 : isSiege ? 21 : isSabre ? 15 : isUGV ? 13 : 18;
        const hullL = isMammoth ? 31 : isSiege ? 29 : isSabre ? 21 : isUGV ? 17 : 25;

        const hull = new THREE.Mesh(new THREE.BoxGeometry(hullW, 6.5, hullL), armorMat);
        hull.position.y = 5.8;
        hull.castShadow = true;
        group.add(hull);

        // Caterpillar Tracks
        const trackGeo = new THREE.BoxGeometry(3.8, 6.5, hullL + 2.5);
        const tLeft = new THREE.Mesh(trackGeo, treadMat);
        tLeft.position.set(-hullW / 2 - 1.4, 5.2, 0);
        group.add(tLeft);
        const tRight = new THREE.Mesh(trackGeo, treadMat);
        tRight.position.set(hullW / 2 + 1.4, 5.2, 0);
        group.add(tRight);

        // Turret Assembly
        const turret = new THREE.Group();
        turret.name = 'turretAssembly';
        turret.position.set(0, 9.8, 0);

        const turretBox = new THREE.Mesh(new THREE.BoxGeometry(hullW * 0.68, 5.2, hullL * 0.58), hullMat);
        turretBox.position.y = 2.6;
        turret.add(turretBox);

        // CITV Commander Optic
        const citv = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 3), cyanGlow);
        citv.position.set(hullW * 0.22, 6.5, -2);
        turret.add(citv);

        // Cannon Assembly with Recoil
        const cannonGroup = new THREE.Group();
        cannonGroup.name = 'cannonBarrelGroup';
        cannonGroup.position.set(0, 2.6, 2);

        const barrelLen = isMammoth ? 28 : isSiege ? 32 : isSabre ? 18 : isUGV ? 14 : 22;
        const barrelGeo = new THREE.CylinderGeometry(1.5, 1.9, barrelLen);
        barrelGeo.rotateX(Math.PI / 2);
        const barrel = new THREE.Mesh(barrelGeo, hullMat);
        barrel.position.set(0, 0, barrelLen / 2 + 2);
        cannonGroup.add(barrel);

        const muzzle = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3.2, 3), treadMat);
        muzzle.position.set(0, 0, barrelLen + 2);
        cannonGroup.add(muzzle);

        // Mammoth Dual Cannons & Top Missile Pod
        if (isMammoth) {
          const barrel2 = barrel.clone();
          const muzzle2 = muzzle.clone();
          barrel.position.x = -3.5;
          muzzle.position.x = -3.5;
          barrel2.position.x = 3.5;
          muzzle2.position.x = 3.5;
          cannonGroup.add(barrel2);
          cannonGroup.add(muzzle2);

          const topPod = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 10), hazardMat);
          topPod.position.set(0, 7.5, -3);
          turret.add(topPod);
        }

        turret.add(cannonGroup);
        group.add(turret);
        break;
      }

      // ==========================================
      // 3. AIR UNITS & ROTARY WING
      // ==========================================
      case 'viper_fighter':
      case 'stealth_fighter':
      case 'raven_bomber': {
        const isRaven = u.type === 'raven_bomber';
        const isViper = u.type === 'viper_fighter';

        if (isRaven) {
          // Raven Flying-Wing Stealth Heavy Bomber
          const wing = new THREE.Mesh(new THREE.ConeGeometry(24, 42, 4), specOpsMat);
          wing.rotateX(Math.PI / 2);
          wing.scale.set(1.4, 0.12, 0.7);
          wing.position.set(0, 32, 0);
          group.add(wing);

          const afterburner = new THREE.Mesh(new THREE.BoxGeometry(10, 1.5, 3), cyanGlow);
          afterburner.position.set(0, 32, -14);
          group.add(afterburner);
        } else {
          // Viper or Phantom Multirole Strike Fighter
          const fuseLen = isViper ? 28 : 34;
          const fuselage = new THREE.Mesh(new THREE.ConeGeometry(5.2, fuseLen, 4), armorMat);
          fuselage.rotateX(Math.PI / 2);
          fuselage.position.set(0, 30, 0);
          group.add(fuselage);

          const wings = new THREE.Mesh(new THREE.BoxGeometry(32, 1.2, 15), hullMat);
          wings.position.set(0, 30, -2);
          group.add(wings);

          const tailGeo = new THREE.BoxGeometry(1.2, 9, 7);
          const tailL = new THREE.Mesh(tailGeo, armorMat);
          tailL.position.set(-5.5, 35, -11);
          tailL.rotateZ(-0.35);
          group.add(tailL);
          const tailR = tailL.clone();
          tailR.position.x = 5.5;
          tailR.rotation.z = 0.35;
          group.add(tailR);

          const afterburner = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 4), cyanGlow);
          afterburner.rotateX(Math.PI / 2);
          afterburner.position.set(0, 30, -16);
          group.add(afterburner);
        }
        break;
      }

      case 'hawk_helicopter':
      case 'attack_helicopter':
      case 'titan_transport': {
        const isTitan = u.type === 'titan_transport';
        const isHawk = u.type === 'hawk_helicopter';

        if (isTitan) {
          // Tandem twin-rotor heavy lift Chinook-style
          const body = new THREE.Mesh(new THREE.BoxGeometry(13, 10, 34), armorMat);
          body.position.y = 20;
          body.castShadow = true;
          group.add(body);

          const fRotor = new THREE.Group();
          fRotor.name = 'mainRotor';
          fRotor.position.set(0, 27, 12);
          const bGeo = new THREE.BoxGeometry(36, 0.4, 2.5);
          fRotor.add(new THREE.Mesh(bGeo, treadMat));
          group.add(fRotor);

          const aRotor = new THREE.Group();
          aRotor.name = 'aftRotor';
          aRotor.position.set(0, 30, -12);
          aRotor.add(new THREE.Mesh(bGeo, treadMat));
          group.add(aRotor);
        } else {
          // Cobra Attack or Hawk Utility Gunship
          const body = new THREE.Mesh(new THREE.BoxGeometry(11, 8.5, 28), armorMat);
          body.position.y = 19;
          body.castShadow = true;
          group.add(body);

          const canopy = new THREE.Mesh(new THREE.BoxGeometry(7.5, 5.5, 11), glassMat);
          canopy.position.set(0, 22.5, 6.5);
          group.add(canopy);

          const tail = new THREE.Mesh(new THREE.BoxGeometry(3.2, 4.2, 20), hullMat);
          tail.position.set(0, 20, -19);
          group.add(tail);

          const rotorHub = new THREE.Group();
          rotorHub.name = 'mainRotor';
          rotorHub.position.set(0, 25.5, 0);
          const bladeGeo = new THREE.BoxGeometry(38, 0.4, 2.6);
          const b1 = new THREE.Mesh(bladeGeo, treadMat);
          rotorHub.add(b1);
          const b2 = b1.clone();
          b2.rotateY(Math.PI / 2);
          rotorHub.add(b2);
          group.add(rotorHub);

          if (!isHawk) {
            // Cobra Rocket Pods & Chin Gun
            const podGeo = new THREE.CylinderGeometry(2.2, 2.2, 9);
            podGeo.rotateX(Math.PI / 2);
            const podL = new THREE.Mesh(podGeo, hazardMat);
            podL.position.set(-8.5, 17, 2);
            group.add(podL);
            const podR = podL.clone();
            podR.position.x = 8.5;
            group.add(podR);

            const chinGun = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 8), hullMat);
            chinGun.rotateX(Math.PI / 2);
            chinGun.position.set(0, 14, 11);
            group.add(chinGun);
          }
        }
        break;
      }

      // ==========================================
      // 4. DRONES & ROBOTICS
      // ==========================================
      case 'recon_drone':
      case 'combat_drone':
      case 'ucav_drone': {
        const isUCAV = u.type === 'ucav_drone';
        const isCombat = u.type === 'combat_drone';

        if (isUCAV) {
          // Predator / Reaper Long-Endurance Fixed-Wing Drone
          const fuse = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 22), specOpsMat);
          fuse.rotateX(Math.PI / 2);
          fuse.position.set(0, 22, 0);
          group.add(fuse);

          const wings = new THREE.Mesh(new THREE.BoxGeometry(36, 0.6, 5), hullMat);
          wings.position.set(0, 22, 2);
          group.add(wings);

          const vTail = new THREE.Mesh(new THREE.BoxGeometry(8, 0.6, 4), hullMat);
          vTail.position.set(0, 24, -9);
          vTail.rotateZ(0.4);
          group.add(vTail);

          const optic = new THREE.Mesh(new THREE.SphereGeometry(1.5), cyanGlow);
          optic.position.set(0, 20.5, 9);
          group.add(optic);
        } else {
          // Multi-Rotor Drones (Scout Quadcopter or Combat Hexacopter)
          const core = new THREE.Mesh(new THREE.SphereGeometry(3.6, 12, 12), hullMat);
          core.position.y = 17;
          group.add(core);

          const optic = new THREE.Mesh(new THREE.SphereGeometry(1.8), cyanGlow);
          optic.position.set(0, 16, 3.2);
          group.add(optic);

          const armGeo = new THREE.CylinderGeometry(0.9, 0.9, 15);
          armGeo.rotateZ(Math.PI / 2);
          const a1 = new THREE.Mesh(armGeo, treadMat);
          a1.position.y = 17;
          a1.rotateY(Math.PI / 4);
          group.add(a1);
          const a2 = a1.clone();
          a2.rotateY(Math.PI / 2);
          group.add(a2);

          if (isCombat) {
            const pod = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 6), hazardMat);
            pod.position.set(4, 15, 0);
            group.add(pod);
            const pod2 = pod.clone();
            pod2.position.x = -4;
            group.add(pod2);
          }
        }
        break;
      }
    }

    return group;
  }

  // --- Main Render Frame Loop ---
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
    const dt = Math.min(0.1, currentTime - (this.lastAnimTime || currentTime));
    this.lastAnimTime = currentTime;
    this.rotorAngle += dt * 34;
    this.radarDishAngle += dt * 0.75;

    // 1. Maintain terrain geometry
    this.updateTerrain(mapData);

    // 2. Camera positioning (PRIORITY 1: screenShakeOffset bypassed for rock-steady camera)
    this.updateCamera(camera);

    // 3. Day / Night & Weather Lighting Tone
    const ambientIntensity = 0.5 + Math.sin(dayNightPhase * Math.PI) * 0.35;
    this.hemiLight.intensity = Math.max(0.35, ambientIntensity);
    this.dirLight.intensity = Math.max(0.45, 1.5 * Math.sin(dayNightPhase * Math.PI));

    // 4. Update Buildings
    const activeBuildingIds = new Set<string>();
    buildings.forEach(b => {
      if (b.hp <= 0) return;
      activeBuildingIds.add(b.id);

      let group = this.buildingMeshes.get(b.id);
      if (!group) {
        group = this.createBuildingModel(b);
        this.buildingsGroup.add(group);
        this.buildingMeshes.set(b.id, group);
      }

      group.position.set(b.pixelX, 0, b.pixelY);
      if (b.rotation !== undefined) {
        group.rotation.y = (b.rotation * Math.PI) / 180;
      }

      if (b.isUnderConstruction) {
        const prog = Math.max(0.2, b.constructionProgress);
        group.scale.set(prog, prog, prog);
      } else {
        group.scale.set(1, 1, 1);
      }

      const dish = group.getObjectByName('radarDishMount');
      if (dish) {
        dish.rotation.y = this.radarDishAngle;
      }
    });

    this.buildingMeshes.forEach((mesh, id) => {
      if (!activeBuildingIds.has(id)) {
        this.buildingsGroup.remove(mesh);
        this.buildingMeshes.delete(id);
      }
    });

    // 5. Update Units & Combat Animations (Recoil, Rotors, Legs)
    const activeUnitIds = new Set<string>();
    units.forEach(u => {
      if (u.hp <= 0) return;
      activeUnitIds.add(u.id);

      let group = this.unitMeshes.get(u.id);
      if (!group) {
        group = this.createUnitModel(u);
        this.unitsGroup.add(group);
        this.unitMeshes.set(u.id, group);
      }

      group.position.set(u.x, 0, u.y);

      if (u.rotation !== undefined) {
        group.rotation.y = -u.rotation + Math.PI / 2;
      }

      if (u.selected) {
        group.scale.set(1.08, 1.08, 1.08);
      } else {
        group.scale.set(1, 1, 1);
      }

      // Rotor animations
      const rotor = group.getObjectByName('mainRotor');
      if (rotor) rotor.rotation.y = this.rotorAngle;
      const aftRotor = group.getObjectByName('aftRotor');
      if (aftRotor) aftRotor.rotation.y = -this.rotorAngle;

      // Infantry walk cycle
      const leftLeg = group.getObjectByName('leftLeg');
      const rightLeg = group.getObjectByName('rightLeg');
      if (leftLeg && rightLeg && (u.targetX !== undefined || u.targetY !== undefined)) {
        const swing = Math.sin(currentTime * 12) * 0.45;
        leftLeg.rotation.x = swing;
        rightLeg.rotation.x = -swing;
      }

      // Tank Cannon Recoil Animation
      const cannon = group.getObjectByName('cannonBarrelGroup');
      if (cannon) {
        const timeSinceFire = currentTime - (u.lastAttackTime || 0);
        if (timeSinceFire < 0.25) {
          const recoilProgress = timeSinceFire / 0.25;
          const kick = Math.sin((1 - recoilProgress) * Math.PI) * -3.2;
          cannon.position.z = 2 + kick;
        } else {
          cannon.position.z = 2;
        }
      }
    });

    this.unitMeshes.forEach((mesh, id) => {
      if (!activeUnitIds.has(id)) {
        this.unitsGroup.remove(mesh);
        this.unitMeshes.delete(id);
      }
    });

    // 6. 3D Projectiles
    while (this.projectilesGroup.children.length > 0) {
      const obj = this.projectilesGroup.children[0];
      this.projectilesGroup.remove(obj);
      if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
    }

    const projMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    const missileMat = new THREE.MeshBasicMaterial({ color: 0xf97316 });

    projectiles.forEach(p => {
      const isMissile = p.type === 'missile' || p.type === 'nuke';
      const geo = isMissile ? new THREE.ConeGeometry(2, 9, 6) : new THREE.SphereGeometry(1.8);
      const mesh = new THREE.Mesh(geo, isMissile ? missileMat : projMat);

      const elevation = (p.arcHeight || 0) * Math.sin(p.progress * Math.PI) + 8;
      mesh.position.set(p.x, elevation, p.y);

      if (isMissile) {
        mesh.lookAt(p.targetX, elevation, p.targetY);
      }
      this.projectilesGroup.add(mesh);
    });

    // 7. Damage Smoke & Flame Plumes for Damaged Units & Buildings (HP < 40%)
    while (this.damageSmokeGroup.children.length > 0) {
      const obj = this.damageSmokeGroup.children[0];
      this.damageSmokeGroup.remove(obj);
      if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
    }

    const smokeMat = this.materials.get('smoke_particle')!;
    const flameMat = this.materials.get('flame_ember')!;
    const smokeGeo = new THREE.DodecahedronGeometry(2.5);

    units.forEach(u => {
      if (u.hp > 0 && u.hp < u.maxHp * 0.4) {
        const puff = new THREE.Mesh(smokeGeo, Math.random() < 0.3 ? flameMat : smokeMat);
        const yOffset = 8 + (Math.sin(currentTime * 4 + u.x) + 1) * 3;
        puff.position.set(u.x + (Math.random() - 0.5) * 4, yOffset, u.y + (Math.random() - 0.5) * 4);
        this.damageSmokeGroup.add(puff);
      }
    });

    buildings.forEach(b => {
      if (b.hp > 0 && b.hp < b.maxHp * 0.4) {
        const puff = new THREE.Mesh(smokeGeo, smokeMat);
        puff.position.set(b.pixelX, 16 + (Math.sin(currentTime * 3) + 1) * 4, b.pixelY);
        this.damageSmokeGroup.add(puff);
      }
    });

    // 8. Building Placement Hologram Ghost
    while (this.previewGroup.children.length > 0) {
      const obj = this.previewGroup.children[0];
      this.previewGroup.remove(obj);
      if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
    }

    if (placementPreview) {
      const ts = mapData.tileSize;
      const bCfg = BUILDING_CONFIGS[placementPreview.type];
      if (bCfg) {
        const widthTiles = bCfg.size.width;
        const heightTiles = bCfg.size.height;
        const wx = placementPreview.gridX * ts + (widthTiles * ts) / 2;
        const wz = placementPreview.gridY * ts + (heightTiles * ts) / 2;

        const ghostMat = new THREE.MeshStandardMaterial({
          color: placementPreview.isValid ? 0x22c55e : 0xef4444,
          transparent: true,
          opacity: 0.65,
          roughness: 0.3,
        });

        const ghostBox = new THREE.Mesh(
          new THREE.BoxGeometry(widthTiles * ts * 0.9, 18, heightTiles * ts * 0.9),
          ghostMat
        );
        ghostBox.position.set(wx, 9, wz);

        if (placementPreview.rotation !== undefined) {
          ghostBox.rotation.y = (placementPreview.rotation * Math.PI) / 180;
        }
        this.previewGroup.add(ghostBox);

        const footMat = new THREE.MeshBasicMaterial({
          color: placementPreview.isValid ? 0x4ade80 : 0xf87171,
          transparent: true,
          opacity: 0.45,
        });
        const foot = new THREE.Mesh(new THREE.PlaneGeometry(widthTiles * ts, heightTiles * ts), footMat);
        foot.rotateX(-Math.PI / 2);
        foot.position.set(wx, 0.8, wz);
        this.previewGroup.add(foot);
      }
    }

    // 9. Render Scene
    this.renderer.render(this.scene, this.camera);
  }

  public dispose() {
    this.renderer.dispose();
    this.buildingMeshes.clear();
    this.unitMeshes.clear();
    this.materials.forEach(m => m.dispose());
  }
}
