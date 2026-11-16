/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { pickUnit, unitAimPoint } from './game/unitPicking';
import React, { useEffect, useRef, useState, useCallback, useReducer } from 'react';
import { Eye, EyeOff, Crosshair, Layers, RotateCcw, Navigation, CheckSquare, Hammer, X, Check, Target, ChevronDown } from 'lucide-react';
import { soundEngine } from './audio/soundEngine';
import { BaseAdvisorModal } from './components/BaseAdvisorModal';
import { ConstructionControlBar, PlacementState } from './components/ConstructionControlBar';
import { GameModal } from './components/GameModal';
import { CareerOverlay, DEFAULT_SETUP, MainMenuScreen, MapSelectScreen, MatchSetupScreen, SetupState, setupToConfig } from './components/screens/MenuScreens';
import { ConfirmDialog, HelpOverlay, PauseMenu } from './components/nav/NavUI';
import { initialNav, navReducer, shouldPause, topOverlay } from './game/navigation';
import { latestSaveSlot, writeSaveSlot } from './components/SaveLoadModal';
import { CAMPAIGN_MISSIONS } from './data/gameData';
import { SaveLoadModal } from './components/SaveLoadModal';
import { SettingsModal } from './components/SettingsModal';
import { MobileTopHUD } from './components/mobile/MobileTopHUD';
import { MobileBottomSheet } from './components/mobile/MobileBottomSheet';
import { MobileFloatingRadar } from './components/mobile/MobileFloatingRadar';
import { BUILDING_CONFIGS, UNIT_CONFIGS } from './data/gameData';
import { recordMatchProgress } from './data/careerStats';
import { GameEngine } from './game/engine';
import { AutoQuality, frameIntervalMs, getRenderScale, presetValues } from './game/renderQuality';
import { Camera, TacticalRenderer } from './game/renderer';
import { TacticalThreeRenderer } from './game/threeRenderer';
import {
  AIDifficulty,
  Building,
  BuildingPlacementRecommendation,
  BuildingType,
  GameMode,
  MatchSetupConfig,
  SaveSlotData,
  SquadFormation,
  Unit,
  Vector2,
} from './types/game';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const threeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const rendererRef = useRef<TacticalRenderer | null>(null);
  const threeRendererRef = useRef<TacticalThreeRenderer | null>(null);

  // UI state
  // V14 central navigation: screens + overlay stack (replaces inMainMenu / isSettingsOpen / isSaveLoadOpen booleans)
  const [nav, dispatchNav] = useReducer(navReducer, initialNav);
  const navRef = useRef(nav);
  navRef.current = nav;
  const inMainMenu = nav.screen !== 'gameplay';
  const topNav = topOverlay(nav);
  const pausedByNavRef = useRef(false);
  const settingsBackRef = useRef<(() => void) | null>(null);
  const [devToolsSignal, setDevToolsSignal] = useState(0);
  const [setup, setSetupState] = useState<SetupState>(() => {
    try { return { ...DEFAULT_SETUP, ...JSON.parse(localStorage.getItem('iron_dominion_setup') || '{}') }; } catch { return DEFAULT_SETUP; }
  });
  const setSetup = (s: SetupState) => { setSetupState(s); try { localStorage.setItem('iron_dominion_setup', JSON.stringify(s)); } catch { /* ignore */ } };
  const [is3DMode, setIs3DMode] = useState<boolean>(false);
  const [modalType, setModalType] = useState<'victory' | 'defeat' | 'briefing' | 'settings' | null>(null);
  // V12: outcome of a finished match (battlefield stays viewable, read-only, until a new match starts)
  const [matchOver, setMatchOver] = useState<'victory' | 'defeat' | null>(null);
  const isSettingsOpen = nav.overlays.some(o => o.id === 'settings');
  const isSaveLoadOpen = nav.overlays.some(o => o.id === 'save_load');
  const [isAdvisorOpen, setIsAdvisorOpen] = useState<boolean>(false);
  const [showRadar, setShowRadar] = useState<boolean>(true);
  const [showObjectives, setShowObjectives] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isCinematicMode, setIsCinematicMode] = useState<boolean>(false);
  const [isTouchMultiSelect, setIsTouchMultiSelect] = useState<boolean>(false);
  const [followUnit, setFollowUnit] = useState<boolean>(false);
  const [activeInteractionMode, setActiveInteractionMode] = useState<'NORMAL' | 'MOVE_TARGET' | 'ATTACK_TARGET' | 'DEFEND_TARGET' | 'PATROL_TARGET' | 'BOX_SELECT'>('NORMAL');
  const [, setTick] = useState<number>(0);

  // Robust Mobile Camera System with Smart Recovery
  const cameraRef = useRef<Camera>({ x: 500, y: 1800, zoom: 1.0 });
  const targetCameraRef = useRef<Camera>({ x: 500, y: 1800, zoom: 1.0 });
  const lastValidCameraRef = useRef<Camera>({ x: 500, y: 1800, zoom: 1.0 });
  const cameraHistoryRef = useRef<Camera[]>([]);
  const [hasCameraHistory, setHasCameraHistory] = useState<boolean>(false);

  // Input states
  const [activePlacement, setActivePlacement] = useState<PlacementState | null>(null);
  const [isNukeTargeting, setIsNukeTargeting] = useState<boolean>(false);
  const [mouseWorldPos, setMouseWorldPos] = useState<Vector2>({ x: 0, y: 0 });
  const [selectionBox, setSelectionBox] = useState<{ start: Vector2; current: Vector2 } | null>(null);
  const isMouseDownRef = useRef<boolean>(false);
  const mouseDownPosRef = useRef<Vector2 | null>(null);
  const touchStartRef = useRef<{
    screenX: number;
    screenY: number;
    time: number;
    isPan: boolean;
    initialDist?: number;
    initialZoom?: number;
    worldMid?: Vector2;
    boxStartWorld?: Vector2;
  } | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const isBoxSelectingRef = useRef<boolean>(false);
  const lastTapTimeRef = useRef<number>(0);
  const lastTapPosRef = useRef<Vector2>({ x: 0, y: 0 });
  const keysDownRef = useRef<Set<string>>(new Set());

  // Game Loop High-Performance Synchronization Refs (Prevents RAF loop teardowns & freezing)
  const activePlacementRef = useRef<PlacementState | null>(null);
  const mouseWorldPosRef = useRef<Vector2>({ x: 0, y: 0 });
  const selectionBoxRef = useRef<{ start: Vector2; current: Vector2 } | null>(null);
  const followUnitRef = useRef<boolean>(false);
  const modalTypeRef = useRef<'victory' | 'defeat' | 'briefing' | 'settings' | null>(null);
  const selectedUnitIdsRef = useRef<string[]>([]);

  // Selected Entities
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const selectedBuildingIdRef = useRef<string | null>(null);
  selectedBuildingIdRef.current = selectedBuildingId;
  const activeInteractionModeRef = useRef<string>('NORMAL');
  const handleCancelPlacementRef = useRef<(() => void) | null>(null);

  // Fullscreen Handler
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Immersive Inactivity Timer (fades nonessential panels after 6s of inactivity in full screen)
  const [isImmersiveInactive, setIsImmersiveInactive] = useState<boolean>(false);
  const lastInteractionTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    const handleUserActivity = () => {
      lastInteractionTimeRef.current = Date.now();
      setIsImmersiveInactive(prev => (prev ? false : prev));
    };

    window.addEventListener('pointerdown', handleUserActivity, { passive: true });
    window.addEventListener('touchstart', handleUserActivity, { passive: true });
    window.addEventListener('keydown', handleUserActivity, { passive: true });

    const interval = setInterval(() => {
      if (isFullscreen && !inMainMenu && !isSettingsOpen && !isSaveLoadOpen && !isAdvisorOpen) {
        if (Date.now() - lastInteractionTimeRef.current > 6000) {
          setIsImmersiveInactive(true);
        }
      } else {
        setIsImmersiveInactive(false);
      }
    }, 1000);

    return () => {
      window.removeEventListener('pointerdown', handleUserActivity);
      window.removeEventListener('touchstart', handleUserActivity);
      window.removeEventListener('keydown', handleUserActivity);
      clearInterval(interval);
    };
  }, [isFullscreen, inMainMenu, isSettingsOpen, isSaveLoadOpen, isAdvisorOpen]);

  // Initialize Audio & Game
  const startNewGame = useCallback(
    (
      mode: GameMode,
      difficulty: AIDifficulty,
      mapId: string,
      campaignId?: number,
      matchConfig?: Partial<MatchSetupConfig>
    ) => {
      soundEngine.init();
      soundEngine.resume();
      soundEngine.startAmbientMusic();

      const engine = new GameEngine(mode, difficulty, mapId, campaignId, matchConfig);
      engineRef.current = engine;
      if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug')) { (window as any).__engine = engine; (window as any).__camRef = cameraRef; (window as any).__tcamRef = targetCameraRef; } // test hook, only with ?debug

      const playerHQ = engine.buildings.find(b => b.type === 'headquarters' && b.faction === 'player');
      const startX = playerHQ ? playerHQ.pixelX : engine.mapData.playerSpawn.x;
      const startY = playerHQ ? playerHQ.pixelY : engine.mapData.playerSpawn.y;

      const initZoom = window.innerWidth < 640 ? 0.95 : 1.0;
      const initialCam: Camera = { x: startX, y: startY, zoom: initZoom, rotation: 0 };
      cameraRef.current = { ...initialCam };
      targetCameraRef.current = { ...initialCam };
      lastValidCameraRef.current = { ...initialCam };
      cameraHistoryRef.current = [];
      setHasCameraHistory(false);

      setSelectedUnitIds([]);
      setSelectedBuildingId(null);
      setActivePlacement(null);
      activePlacementRef.current = null;
      setIsNukeTargeting(false);
      setActiveInteractionMode('NORMAL');
      dispatchNav({ type: 'start_match' });
      setMatchOver(null);
      pausedByNavRef.current = false;

      if (mode === 'campaign') {
        setModalType('briefing');
      } else {
        setModalType(null);
      }
    },
    []
  );

  const saveCameraHistory = useCallback(() => {
    cameraHistoryRef.current.push({
      x: cameraRef.current.x,
      y: cameraRef.current.y,
      zoom: cameraRef.current.zoom,
      rotation: cameraRef.current.rotation || 0,
    });
    if (cameraHistoryRef.current.length > 6) cameraHistoryRef.current.shift();
    setHasCameraHistory(true);
  }, []);

  const handleCenterHQ = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const playerHQ = engine.buildings.find(b => b.type === 'headquarters' && b.faction === 'player');
    if (playerHQ) {
      saveCameraHistory();
      targetCameraRef.current = {
        x: playerHQ.pixelX,
        y: playerHQ.pixelY,
        zoom: Math.max(0.9, cameraRef.current.zoom),
      };
      soundEngine.playClick();
    }
  }, [saveCameraHistory]);

  const handleFitBase = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const playerBuildings = engine.buildings.filter(b => b.faction === 'player' && b.hp > 0);
    if (playerBuildings.length === 0) {
      handleCenterHQ();
      return;
    }
    saveCameraHistory();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    playerBuildings.forEach(b => {
      minX = Math.min(minX, b.pixelX - 60);
      maxX = Math.max(maxX, b.pixelX + 60);
      minY = Math.min(minY, b.pixelY - 60);
      maxY = Math.max(maxY, b.pixelY + 60);
    });
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const baseW = Math.max(300, maxX - minX);
    const baseH = Math.max(300, maxY - minY);
    const fitZoom = Math.max(
      0.65,
      Math.min(1.2, Math.min(window.innerWidth / (baseW * 1.35), window.innerHeight / (baseH * 1.35)))
    );
    targetCameraRef.current = { x: centerX, y: centerY, zoom: fitZoom };
    soundEngine.playClick();
  }, [handleCenterHQ, saveCameraHistory]);

  const handleFocusSelected = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (selectedUnitIdsRef.current.length > 0) {
      const u = engine.units.find(o => o.id === selectedUnitIdsRef.current[0]);
      if (u) {
        saveCameraHistory();
        targetCameraRef.current = { x: u.x, y: u.y, zoom: cameraRef.current.zoom };
        soundEngine.playClick();
      }
    } else if (selectedBuildingId) {
      const b = engine.buildings.find(o => o.id === selectedBuildingId);
      if (b) {
        saveCameraHistory();
        targetCameraRef.current = { x: b.pixelX, y: b.pixelY, zoom: cameraRef.current.zoom };
        soundEngine.playClick();
      }
    }
  }, [selectedBuildingId, saveCameraHistory]);

  const handleReturnToLastView = useCallback(() => {
    const prev = cameraHistoryRef.current.pop();
    if (prev) {
      targetCameraRef.current = { ...prev };
      setHasCameraHistory(cameraHistoryRef.current.length > 0);
      soundEngine.playClick();
    }
  }, []);

  const handlePreviewRecommendation = useCallback(
    (rec: BuildingPlacementRecommendation) => {
      const engine = engineRef.current;
      if (!engine) return;
      saveCameraHistory();
      const ts = engine.mapData.tileSize;
      targetCameraRef.current = {
        x: rec.gridX * ts + ts,
        y: rec.gridY * ts + ts,
        zoom: cameraRef.current.zoom,
      };
      soundEngine.playClick();
    },
    [saveCameraHistory]
  );


  const handleCenterArmy = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const army = engine.units.filter(u => u.faction === 'player' && u.hp > 0);
    if (army.length > 0) {
      saveCameraHistory();
      targetCameraRef.current = {
        x: army[0].x,
        y: army[0].y,
        zoom: cameraRef.current.zoom,
      };
      soundEngine.playClick();
    }
  }, [saveCameraHistory]);

  const handleZoomIn = useCallback(() => {
    targetCameraRef.current = {
      ...targetCameraRef.current,
      zoom: Math.min(1.75, targetCameraRef.current.zoom * 1.25),
    };
  }, []);

  const handleZoomOut = useCallback(() => {
    targetCameraRef.current = {
      ...targetCameraRef.current,
      zoom: Math.max(0.55, targetCameraRef.current.zoom * 0.8),
    };
  }, []);

  const toggleFollow = useCallback(() => {
    const next = !followUnit;
    setFollowUnit(next);
    followUnitRef.current = next;
    soundEngine.playClick();
  }, [followUnit]);

  const handleSetZoomPreset = useCallback((targetZoom: number) => {
    targetCameraRef.current.zoom = Math.max(0.45, Math.min(1.85, targetZoom));
    soundEngine.playClick();
  }, []);

  const handleSelectSquad = useCallback((squadNum: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    const squadIds = engine.controlGroups[squadNum] || [];
    if (squadIds.length === 0) return;
    const validUnits = engine.units.filter(u => u.faction === 'player' && u.hp > 0 && squadIds.includes(u.id));
    if (validUnits.length > 0) {
      engine.units.forEach(u => (u.selected = squadIds.includes(u.id) && u.hp > 0));
      engine.buildings.forEach(b => (b.selected = false));
      selectedUnitIdsRef.current = squadIds;
      setSelectedUnitIds(squadIds);
      setSelectedBuildingId(null);
      soundEngine.playSelectUnit();
    }
  }, []);

  const handleSaveSquad = useCallback((squadNum: number) => {
    const engine = engineRef.current;
    if (!engine || selectedUnitIdsRef.current.length === 0) return;
    engine.controlGroups[squadNum] = [...selectedUnitIdsRef.current];
    soundEngine.playClick();
    setTick(t => t + 1);
  }, []);

  const loadSavedGame = useCallback((saveData: SaveSlotData) => {
    soundEngine.init();
    soundEngine.resume();
    soundEngine.startAmbientMusic();

    const engine = new GameEngine(saveData.mode, 'normal');
    const ok = engine.importSaveData(saveData);
    setMatchOver(null);
    if (ok) {
      engineRef.current = engine;
      if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug')) { (window as any).__engine = engine; (window as any).__camRef = cameraRef; (window as any).__tcamRef = targetCameraRef; } // test hook, only with ?debug
      const playerHQ = engine.buildings.find(b => b.type === 'headquarters' && b.faction === 'player');
      const startX = playerHQ ? playerHQ.pixelX : engine.mapData.playerSpawn.x;
      const startY = playerHQ ? playerHQ.pixelY : engine.mapData.playerSpawn.y;
      const initCam: Camera = engine.lastLoadedCamera
        ? { ...engine.lastLoadedCamera }
        : { x: startX, y: startY, zoom: 1.0 };
      cameraRef.current = { ...initCam };
      targetCameraRef.current = { ...initCam };
      lastValidCameraRef.current = { ...initCam };
      cameraHistoryRef.current = [];
      setHasCameraHistory(false);
      setSelectedUnitIds([]);
      setSelectedBuildingId(null);
      setActiveInteractionMode('NORMAL');
      modalTypeRef.current = null;
      setModalType(null);
      dispatchNav({ type: 'start_match' });
      pausedByNavRef.current = false;
    }
  }, []);

  const restartCurrentGame = useCallback(() => {
    if (!engineRef.current) return;
    const current = engineRef.current;
    startNewGame(current.mode, current.difficulty, current.mapData.id, current.currentMission?.id, current.matchConfig); // same map seed & setup
  }, [startNewGame]);

  /** Leave the match for the main menu: stop the simulation and release the match (V14). */
  const goHome = useCallback(() => {
    const e = engineRef.current;
    if (e) e.isPaused = true;
    engineRef.current = null;
    threeRendererRef.current = null;
    modalTypeRef.current = null;
    setModalType(null);
    setSelectedUnitIds([]);
    setSelectedBuildingId(null);
    activePlacementRef.current = null;
    setActivePlacement(null);
    setActiveInteractionMode('NORMAL');
    setIsAdvisorOpen(false);
    try { soundEngine.stopAmbientMusic?.(); } catch { /* optional */ }
    dispatchNav({ type: 'home', force: true });
  }, []);
  /** Home button: asks first when an active match could be lost. */
  const requestHome = useCallback(() => {
    const e = engineRef.current;
    if (navRef.current.screen === 'gameplay' && e && !e.matchEnd) dispatchNav({ type: 'home' });
    else goHome();
  }, [goHome]);
  const startFromSetup = useCallback((s: SetupState, quick = false) => {
    const mode = quick ? 'sandbox' : s.mode;
    if (mode === 'campaign') {
      const mission = CAMPAIGN_MISSIONS.find(m => m.id === s.campaignId) ?? CAMPAIGN_MISSIONS[0];
      startNewGame('campaign', mission.enemyDifficulty, mission.mapId, mission.id, setupToConfig({ ...s, mapId: mission.mapId, seed: null }));
      return;
    }
    const debugMap = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug') ? new URLSearchParams(window.location.search).get('map') : null;
    const ss = debugMap ? { ...s, mapId: debugMap, seed: null } : s;
    startNewGame(mode, ss.difficulty, ss.mapId, undefined, setupToConfig(ss));
  }, [startNewGame]);

  // Pause the match while any overlay is open over it; resume (only what navigation paused) when it closes.
  useEffect(() => {
    const e = engineRef.current;
    if (!e) return;
    const want = shouldPause(nav);
    if (want && !e.isPaused) { e.isPaused = true; pausedByNavRef.current = true; }
    else if (!want && pausedByNavRef.current) { e.isPaused = false; pausedByNavRef.current = false; }
  }, [nav]);

  // Back: Esc, Android system back and browser back all route here.
  const handleNavBack = useCallback(() => {
    const n = navRef.current;
    const top = topOverlay(n);
    if (top?.id === 'settings' && settingsBackRef.current) { settingsBackRef.current(); return; }
    if (top) { dispatchNav({ type: 'back' }); return; }
    if (modalTypeRef.current) { modalTypeRef.current = null; setModalType(null); return; } // results / briefing -> battlefield
    if (n.screen === 'gameplay') {
      if (activePlacementRef.current) { handleCancelPlacementRef.current?.(); return; }
      if (activeInteractionModeRef.current !== 'NORMAL') { setActiveInteractionMode('NORMAL'); return; }
      if (selectedUnitIdsRef.current.length > 0 || selectedBuildingIdRef.current) {
        const e = engineRef.current;
        e?.units.forEach(u => (u.selected = false)); e?.buildings.forEach(b => (b.selected = false));
        selectedUnitIdsRef.current = [];
        setSelectedUnitIds([]); setSelectedBuildingId(null);
        return;
      }
    }
    dispatchNav({ type: 'back' });
  }, []);
  const handleNavBackRef = useRef(handleNavBack);
  handleNavBackRef.current = handleNavBack;
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => { if (ev.code === 'Escape') { ev.preventDefault(); handleNavBackRef.current(); } };
    window.addEventListener('keydown', onKey);
    // Android system back / browser back: keep one history entry as a guard and turn "back" into in-game navigation
    try { history.pushState({ ironNav: 1 }, ''); } catch { /* ignore */ }
    const onPop = () => { try { history.pushState({ ironNav: 1 }, ''); } catch { /* ignore */ } handleNavBackRef.current(); };
    window.addEventListener('popstate', onPop);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('popstate', onPop); };
  }, []);

  // Autosave Checkpoint (every 60s)
  useEffect(() => {
    if (inMainMenu) return;
    const interval = setInterval(() => {
      if (engineRef.current && engineRef.current.gameStatus === 'playing') {
        try {
          const autoSave = engineRef.current.exportSaveData('autosave', 'Automatic Checkpoint');
          const stored = localStorage.getItem('iron_dominion_save_slots');
          const slots = stored ? JSON.parse(stored) : {};
          slots['autosave'] = autoSave;
          localStorage.setItem('iron_dominion_save_slots', JSON.stringify(slots));
        } catch {
          //
        }
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [inMainMenu]);

  // Main Loop Runner
  // Main Loop Runner - High-performance continuous loop (never restarts on mouse move or selection)
  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();

    let autoQ: AutoQuality | null = null;
    const loop = (time: number) => {
      // Frame-rate target (Settings): skip this frame if it is too soon; elapsed time accumulates into the next dt.
      const minFrameMs = frameIntervalMs(engineRef.current?.settings);
      if (minFrameMs > 0 && time - lastTime < minFrameMs - 2) {
        animId = requestAnimationFrame(loop);
        return;
      }
      const rawFrameMs = time - lastTime;
      const dt = Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;

      // V12 Auto graphics preset: adapt to the measured frame rate (thresholds follow the frame-rate cap)
      const st = engineRef.current?.settings;
      if (st?.autoQuality) {
        const cap = st.frameRateTarget || 60;
        if (!autoQ || autoQ.cap !== cap) autoQ = new AutoQuality(st.graphicsQuality, cap * 0.63, cap * 0.93, cap);
        const lv = autoQ.sample(rawFrameMs);
        if (lv) { st.graphicsQuality = lv; Object.assign(st, presetValues(lv)); }
      } else autoQ = null;

      const engine = engineRef.current;
      const canvas = canvasRef.current;

      if (engine && canvas && !inMainMenu) {
        // --- SMART CAMERA RECOVERY SYSTEM (Phase 5) ---
        const cam = cameraRef.current;
        const targetCam = targetCameraRef.current;
        if (
          typeof cam.x !== 'number' ||
          typeof cam.y !== 'number' ||
          typeof cam.zoom !== 'number' ||
          !isFinite(cam.x) ||
          !isFinite(cam.y) ||
          !isFinite(cam.zoom) ||
          isNaN(cam.x) ||
          isNaN(cam.y) ||
          isNaN(cam.zoom) ||
          cam.zoom < 0.2
        ) {
          // Detected invalid camera state -> immediately restore last known valid transform
          cameraRef.current = { ...lastValidCameraRef.current };
          targetCameraRef.current = { ...lastValidCameraRef.current };
        }

        // Follow selected unit camera lock
        if (followUnitRef.current && selectedUnitIdsRef.current.length > 0) {
          const tracked = engine.units.find(u => u.id === selectedUnitIdsRef.current[0] && u.hp > 0);
          if (tracked) {
            targetCameraRef.current.x = tracked.x;
            targetCameraRef.current.y = tracked.y;
          }
        } else {
          // Camera Key Movement (WASD / Arrows)
          const panSpeed = (720 * dt) / Math.max(0.3, cameraRef.current.zoom);
          if (keysDownRef.current.has('KeyW') || keysDownRef.current.has('ArrowUp')) targetCameraRef.current.y -= panSpeed;
          if (keysDownRef.current.has('KeyS') || keysDownRef.current.has('ArrowDown')) targetCameraRef.current.y += panSpeed;
          if (keysDownRef.current.has('KeyA') || keysDownRef.current.has('ArrowLeft')) targetCameraRef.current.x -= panSpeed;
          if (keysDownRef.current.has('KeyD') || keysDownRef.current.has('ArrowRight')) targetCameraRef.current.x += panSpeed;
        }

        // Smooth Camera Damping Interpolation (Fluid & responsive 60fps motion)
        const isSmooth = engine.settings.smoothCamera !== false;
        if (isSmooth) {
          const lerpFactor = Math.min(1.0, dt * 12);
          cameraRef.current.x += (targetCameraRef.current.x - cameraRef.current.x) * lerpFactor;
          cameraRef.current.y += (targetCameraRef.current.y - cameraRef.current.y) * lerpFactor;
          cameraRef.current.zoom += (targetCameraRef.current.zoom - cameraRef.current.zoom) * lerpFactor;
          const targetRot = targetCameraRef.current.rotation || 0;
          const curRot = cameraRef.current.rotation || 0;
          cameraRef.current.rotation = curRot + (targetRot - curRot) * lerpFactor;
        } else {
          cameraRef.current.x = targetCameraRef.current.x;
          cameraRef.current.y = targetCameraRef.current.y;
          cameraRef.current.zoom = targetCameraRef.current.zoom;
          cameraRef.current.rotation = targetCameraRef.current.rotation || 0;
        }

        // Auto-match canvas physical buffer to viewport on frame 1 and resizes with High-DPI 2K/4K scaling
        const dpr = getRenderScale(engine.settings);
        const targetW = Math.floor(window.innerWidth * dpr);
        const targetH = Math.floor(window.innerHeight * dpr);
        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW;
          canvas.height = targetH;
        }

        // Safe World Boundary Clamping
        const mapPxW = engine.mapData.width * engine.mapData.tileSize;
        const mapPxH = engine.mapData.height * engine.mapData.tileSize;
        const pad = engine.settings.cameraBounds === 'relaxed' ? 60 : 120;
        const minCamX = pad;
        const maxCamX = Math.max(pad, mapPxW - pad);
        const minCamY = pad;
        const maxCamY = Math.max(pad, mapPxH - pad);

        cameraRef.current.x = Math.max(minCamX, Math.min(maxCamX, cameraRef.current.x));
        cameraRef.current.y = Math.max(minCamY, Math.min(maxCamY, cameraRef.current.y));
        targetCameraRef.current.x = Math.max(minCamX, Math.min(maxCamX, targetCameraRef.current.x));
        targetCameraRef.current.y = Math.max(minCamY, Math.min(maxCamY, targetCameraRef.current.y));

        cameraRef.current.zoom = Math.max(0.55, Math.min(1.75, cameraRef.current.zoom));
        targetCameraRef.current.zoom = Math.max(0.55, Math.min(1.75, targetCameraRef.current.zoom));

        // Save last verified valid camera state
        lastValidCameraRef.current = {
          x: cameraRef.current.x,
          y: cameraRef.current.y,
          zoom: cameraRef.current.zoom,
          rotation: cameraRef.current.rotation || 0,
        };

        // Engine simulation update
        engine.update(dt);

        // Match outcome (V12): the engine decides it once; the results screen opens once, after the destruction
        // sequence. Closing it (VIEW BATTLEFIELD) never re-opens it or records the result again.
        const outcome = engine.consumeMatchOutcome();
        if (outcome) {
          modalTypeRef.current = outcome.outcome;
          setModalType(outcome.outcome);
          setMatchOver(outcome.outcome);
          activePlacementRef.current = null;
          if (outcome.outcome === 'victory') recordMatchProgress({ won: true, campaignCleared: engine.mode === 'campaign' });
          else recordMatchProgress({ lost: true });
        }

        // Battlefield Rendering (3D Three.js PBR or 2D Classic)
        if (is3DMode) {
          const threeCanvas = threeCanvasRef.current;
          if (!threeRendererRef.current && threeCanvas) {
            threeRendererRef.current = new TacticalThreeRenderer(threeCanvas);
          }
          if (threeRendererRef.current) {
            threeRendererRef.current.render(
              engine.gameTime,
              cameraRef.current,
              engine.mapData,
              engine.fogGrid,
              engine.buildings,
              engine.units,
              engine.projectiles,
              engine.particles,
              engine.wreckages,
              engine.treadMarks,
              engine.floatingTexts,
              engine.pings,
              selectionBoxRef.current,
              activePlacementRef.current,
              engine.weather,
              engine.dayNightPhase,
              engine.screenShakeOffset,
              engine.settings,
              engine.controlGroups
            );
          }
        } else {
          if (!rendererRef.current && canvas) {
            rendererRef.current = new TacticalRenderer(canvas);
          }
          if (rendererRef.current) {
            rendererRef.current.render(
              engine.gameTime,
              cameraRef.current,
              engine.mapData,
              engine.fogGrid,
              engine.buildings,
              engine.units,
              engine.projectiles,
              engine.particles,
              engine.wreckages,
              engine.treadMarks,
              engine.floatingTexts,
              engine.pings,
              selectionBoxRef.current,
              activePlacementRef.current,
              engine.weather,
              engine.dayNightPhase,
              engine.screenShakeOffset,
              engine.settings,
              engine.controlGroups,
              engine.tacticalIntelligence
            );
          }
        }
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [inMainMenu, is3DMode]);

  // Periodic HUD state sync timer (10 fps)
  useEffect(() => {
    const timer = setInterval(() => {
      if (engineRef.current && !inMainMenu) {
        setTick(t => t + 1);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [inMainMenu]);

  // Resize Listener
  useEffect(() => {
    const handleResize = () => {
      if (threeCanvasRef.current) {
        threeCanvasRef.current.width = window.innerWidth;
        threeCanvasRef.current.height = window.innerHeight;
        threeRendererRef.current?.resize(window.innerWidth, window.innerHeight);
      }
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [inMainMenu]);

  const handleCycleZoom = useCallback(() => {
    const levels = [0.65, 0.95, 1.4];
    const cur = targetCameraRef.current.zoom;
    const next = levels.find(l => l > cur + 0.05) || levels[0];
    targetCameraRef.current.zoom = next;
    soundEngine.playClick();
  }, []);

  const handleRotateCamera = useCallback(() => {
    const cur = targetCameraRef.current.rotation || 0;
    const next = (cur + Math.PI / 4) % (Math.PI * 2);
    targetCameraRef.current.rotation = next;
    soundEngine.playClick();
  }, []);

  const screenToWorld = useCallback((screenX: number, screenY: number): Vector2 => {
    if (is3DMode && threeRendererRef.current) {
      return threeRendererRef.current.screenToWorld(screenX, screenY);
    }
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const cam = cameraRef.current;
    const canvasX = screenX - rect.left;
    const canvasY = screenY - rect.top;
    return {
      x: (canvasX - rect.width / 2) / cam.zoom + cam.x,
      y: (canvasY - rect.height / 2) / cam.zoom + cam.y,
    };
  }, [is3DMode]);

  // --- Tactical Move / Attack Execution Helper ---
  const issueMoveOrAttack = useCallback((world: Vector2, isAttackMove: boolean = false) => {
    const engine = engineRef.current;
    if (!engine || selectedUnitIds.length === 0) return;

    const hitRadius = Math.max(34, 34 / cameraRef.current.zoom);
    const clickedEnemyUnit = pickUnit(engine.units, world, hitRadius, 'enemy');

    const clickedEnemyBuilding = engine.buildings.find(
      b => b.faction === 'enemy' && b.hp > 0 && Math.hypot(b.pixelX - world.x, b.pixelY - world.y) <= Math.max(48, b.width * 20 + 12)
    );

    if (clickedEnemyUnit || clickedEnemyBuilding) {
      selectedUnitIds.forEach(id => {
        const u = engine.units.find(o => o.id === id);
        if (u) {
          u.command = 'attack';
          if (clickedEnemyUnit) u.targetUnitId = clickedEnemyUnit.id;
          if (clickedEnemyBuilding) u.targetBuildingId = clickedEnemyBuilding.id;
          u.path = engine.pathGrid.findPath(
            u,
            clickedEnemyUnit || { x: clickedEnemyBuilding!.pixelX, y: clickedEnemyBuilding!.pixelY },
            UNIT_CONFIGS[u.type].isAir
          );
        }
      });
      soundEngine.playCommandAffirmative();
      engine.pings.push({
        id: Math.random().toString(),
        x: world.x,
        y: world.y,
        color: '#E45B63',
        life: 0,
        maxLife: 1.0,
        label: 'ATTACK',
      });
    } else {
      engine.issueUnitGroupCommand(selectedUnitIds, world, isAttackMove);
      soundEngine.playCommandAffirmative();
      engine.pings.push({
        id: Math.random().toString(),
        x: world.x,
        y: world.y,
        color: '#38B98A',
        life: 0,
        maxLife: 1.0,
        label: isAttackMove ? 'ATK-MOVE' : 'MOVE',
      });
    }
  }, [selectedUnitIds]);

  // --- Construction Placement Handlers (Intelligent Placement Assistant) ---
  const handleStartPlacement = useCallback((type: BuildingType) => {
    const engine = engineRef.current;
    if (!engine) return;
    const cfg = BUILDING_CONFIGS[type];
    const ts = engine.mapData.tileSize;

    const recommendations = engine.getRecommendedBuildingPositions(type, 0);

    let gx = Math.floor(cameraRef.current.x / ts) - Math.floor(cfg.size.width / 2);
    let gy = Math.floor(cameraRef.current.y / ts) - Math.floor(cfg.size.height / 2);
    gx = Math.max(1, Math.min(engine.mapData.width - cfg.size.width - 1, gx));
    gy = Math.max(1, Math.min(engine.mapData.height - cfg.size.height - 1, gy));

    const check = engine.canPlaceBuilding(type, gx, gy, 'player', undefined, 0);
    // If current center is invalid and we have valid AI recommendations, snap immediately to recommendation #1
    if (!check.valid && recommendations.length > 0) {
      gx = recommendations[0].gridX;
      gy = recommendations[0].gridY;
    }
    const finalCheck = engine.canPlaceBuilding(type, gx, gy, 'player', undefined, 0);

    const newPlacement: PlacementState = {
      type,
      gridX: gx,
      gridY: gy,
      rotation: 0,
      isValid: finalCheck.valid,
      reason: finalCheck.reason,
      recommendations,
    };
    activePlacementRef.current = newPlacement;
    setActivePlacement(newPlacement);
    setActiveInteractionMode('NORMAL');
    soundEngine.playClick();
  }, []);

  const handleSelectRecommendation = useCallback((rec: BuildingPlacementRecommendation) => {
    const engine = engineRef.current;
    if (!engine || !activePlacementRef.current) return;
    const cur = activePlacementRef.current;
    const check = engine.canPlaceBuilding(cur.type, rec.gridX, rec.gridY, 'player', undefined, cur.rotation);
    const updated: PlacementState = {
      ...cur,
      gridX: rec.gridX,
      gridY: rec.gridY,
      isValid: check.valid,
      reason: check.reason,
    };
    activePlacementRef.current = updated;
    setActivePlacement(updated);
    soundEngine.playClick();
  }, []);

  const handleNudgePlacement = useCallback((dx: number, dy: number) => {
    const engine = engineRef.current;
    if (!engine || !activePlacementRef.current) return;
    const cur = activePlacementRef.current;
    const cfg = BUILDING_CONFIGS[cur.type];
    const isRotated = cur.rotation === 90 || cur.rotation === 270;
    const bw = isRotated ? cfg.size.height : cfg.size.width;
    const bh = isRotated ? cfg.size.width : cfg.size.height;

    const newGx = Math.max(1, Math.min(engine.mapData.width - bw - 1, cur.gridX + dx));
    const newGy = Math.max(1, Math.min(engine.mapData.height - bh - 1, cur.gridY + dy));
    const check = engine.canPlaceBuilding(cur.type, newGx, newGy, 'player', undefined, cur.rotation);

    const updated: PlacementState = {
      ...cur,
      gridX: newGx,
      gridY: newGy,
      isValid: check.valid,
      reason: check.reason,
    };
    activePlacementRef.current = updated;
    setActivePlacement(updated);
    soundEngine.playClick();
  }, []);

  const handleRotatePlacement = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || !activePlacementRef.current) return;
    const cur = activePlacementRef.current;
    const cfg = BUILDING_CONFIGS[cur.type];
    const nextRot = ((cur.rotation + 90) % 360) as 0 | 90 | 180 | 270;
    const isRotated = nextRot === 90 || nextRot === 270;
    const bw = isRotated ? cfg.size.height : cfg.size.width;
    const bh = isRotated ? cfg.size.width : cfg.size.height;

    const newGx = Math.max(1, Math.min(engine.mapData.width - bw - 1, cur.gridX));
    const newGy = Math.max(1, Math.min(engine.mapData.height - bh - 1, cur.gridY));
    const check = engine.canPlaceBuilding(cur.type, newGx, newGy, 'player', undefined, nextRot);

    const recs = engine.getRecommendedBuildingPositions(cur.type, nextRot);
    const updated: PlacementState = {
      ...cur,
      gridX: newGx,
      gridY: newGy,
      rotation: nextRot,
      isValid: check.valid,
      reason: check.reason,
      recommendations: recs,
    };
    activePlacementRef.current = updated;
    setActivePlacement(updated);
    soundEngine.playClick();
  }, []);

  const handleConfirmPlacement = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || !activePlacementRef.current) return;
    const cur = activePlacementRef.current;
    if (!cur.isValid) {
      soundEngine.playError();
      return;
    }

    const b = engine.placeBuilding(cur.type, cur.gridX, cur.gridY, 'player', cur.rotation);
    if (b) {
      activePlacementRef.current = null;
      setActivePlacement(null);
      setTick(t => t + 1);
    }
  }, []);

  activeInteractionModeRef.current = activeInteractionMode;
  const handleCancelPlacement = useCallback(() => {
    activePlacementRef.current = null;
    setActivePlacement(null);
    soundEngine.playClick();
  }, []);
  handleCancelPlacementRef.current = handleCancelPlacement;

  // --- Tap / Click Selection & Targeting Handler ---
  const handlePrimaryActionAtWorld = useCallback((world: Vector2, isTouch: boolean = false) => {
    const engine = engineRef.current;
    if (!engine) return;

    // 1. Building placement positioning (tap moves ghost preview; does not place immediately)
    if (activePlacementRef.current) {
      const cur = activePlacementRef.current;
      const cfg = BUILDING_CONFIGS[cur.type];
      const ts = engine.mapData.tileSize;
      const isRotated = cur.rotation === 90 || cur.rotation === 270;
      const bw = isRotated ? cfg.size.height : cfg.size.width;
      const bh = isRotated ? cfg.size.width : cfg.size.height;
      const gx = Math.max(1, Math.min(engine.mapData.width - bw - 1, Math.floor(world.x / ts)));
      const gy = Math.max(1, Math.min(engine.mapData.height - bh - 1, Math.floor(world.y / ts)));
      const check = engine.canPlaceBuilding(cur.type, gx, gy, 'player', undefined, cur.rotation);
      const updated: PlacementState = {
        ...cur,
        gridX: gx,
        gridY: gy,
        isValid: check.valid,
        reason: check.reason,
      };
      activePlacementRef.current = updated;
      setActivePlacement(updated);
      soundEngine.playClick();

      // Priority 3: Auto-pan camera when placement ghost approaches viewport edge
      const canvas = canvasRef.current;
      if (canvas) {
        const cam = cameraRef.current;
        const screenX = (world.x - cam.x) * cam.zoom + canvas.width / 2;
        const screenY = (world.y - cam.y) * cam.zoom + canvas.height / 2;
        const edgePad = 80;
        let panX = 0;
        let panY = 0;
        if (screenX < edgePad) panX = (screenX - edgePad) / cam.zoom;
        else if (screenX > canvas.width - edgePad) panX = (screenX - (canvas.width - edgePad)) / cam.zoom;
        if (screenY < edgePad + 40) panY = (screenY - (edgePad + 40)) / cam.zoom;
        else if (screenY > canvas.height - edgePad - 90) panY = (screenY - (canvas.height - edgePad - 90)) / cam.zoom;

        if (panX !== 0 || panY !== 0) {
          targetCameraRef.current.x += panX * 0.75;
          targetCameraRef.current.y += panY * 0.75;
        }
      }
      return;
    }

    // 2. Nuke strike
    if (isNukeTargeting) {
      engine.launchTacticalNuke(world);
      setIsNukeTargeting(false);
      return;
    }

    // 3. Move Targeting Mode Active
    if (activeInteractionMode === 'MOVE_TARGET') {
      issueMoveOrAttack(world, false);
      setActiveInteractionMode('NORMAL');
      return;
    }

    // 4. Attack Targeting Mode Active
    if (activeInteractionMode === 'ATTACK_TARGET') {
      issueMoveOrAttack(world, true);
      setActiveInteractionMode('NORMAL');
      return;
    }

    // 4b. Defend / patrol targeting (V12): the tapped point becomes the defensive position / patrol waypoint
    if (activeInteractionMode === 'DEFEND_TARGET' || activeInteractionMode === 'PATROL_TARGET') {
      const ids = selectedUnitIdsRef.current;
      if (ids.length > 0) {
        if (activeInteractionMode === 'DEFEND_TARGET') engine.issueDefend(ids, world);
        else engine.issuePatrol(ids, world);
      }
      setActiveInteractionMode('NORMAL');
      return;
    }

    // 5. Direct Troop Control (Touch-to-Move / Tap-to-Attack)
    const unitHitRadius = isTouch
      ? Math.max(38, 38 / cameraRef.current.zoom)
      : Math.max(26, 26 / cameraRef.current.zoom);

    // If player has units currently selected:
    if (selectedUnitIdsRef.current.length > 0) {
      // 5a. Check if tapping an enemy unit
      const clickedEnemy = pickUnit(engine.units, world, unitHitRadius, 'enemy');
      // 5b. Check if tapping an enemy building
      const clickedEnemyBuilding = engine.buildings.find(
        b => b.faction === 'enemy' && b.hp > 0 && Math.hypot(b.pixelX - world.x, b.pixelY - world.y) <= Math.max(48, b.width * 20 + 12)
      );

      if (clickedEnemy || clickedEnemyBuilding) {
        issueMoveOrAttack(world, false);
        return;
      }

      // 5c. Check if tapping another friendly unit to switch selection
      const clickedOtherFriendly = pickUnit(engine.units, world, unitHitRadius, 'player');

      if (clickedOtherFriendly && !isTouchMultiSelect && !selectedUnitIdsRef.current.includes(clickedOtherFriendly.id)) {
        engine.units.forEach(u => (u.selected = u.id === clickedOtherFriendly.id));
        engine.buildings.forEach(b => (b.selected = false));
        clickedOtherFriendly.selected = true;
        selectedUnitIdsRef.current = [clickedOtherFriendly.id];
        setSelectedUnitIds([clickedOtherFriendly.id]);
        setSelectedBuildingId(null);
        soundEngine.playSelectUnit();
        return;
      }

      // 5d. TOUCH-TO-MOVE: Tapped empty ground -> Selected unit(s) immediately move there!
      issueMoveOrAttack(world, false);
      return;
    }

    // 6. No units currently selected: Check if tapping a friendly unit to select
    const clickedUnit = pickUnit(engine.units, world, unitHitRadius, 'player');

    if (clickedUnit) {
      if (isTouchMultiSelect) {
        clickedUnit.selected = !clickedUnit.selected;
        const newIds = clickedUnit.selected
          ? [...selectedUnitIdsRef.current, clickedUnit.id]
          : selectedUnitIdsRef.current.filter(id => id !== clickedUnit.id);
        selectedUnitIdsRef.current = newIds;
        setSelectedUnitIds(newIds);
      } else {
        engine.units.forEach(u => (u.selected = false));
        engine.buildings.forEach(b => (b.selected = false));
        clickedUnit.selected = true;
        selectedUnitIdsRef.current = [clickedUnit.id];
        setSelectedUnitIds([clickedUnit.id]);
        setSelectedBuildingId(null);
      }
      soundEngine.playSelectUnit();
      return;
    }

    // 7. Check if tapping a friendly building
    const clickedBuilding = engine.buildings.find(
      b =>
        b.faction === 'player' &&
        b.hp > 0 &&
        Math.abs(b.pixelX - world.x) <= b.width * 20 + 14 &&
        Math.abs(b.pixelY - world.y) <= b.height * 20 + 14
    );

    if (clickedBuilding) {
      engine.units.forEach(u => (u.selected = false));
      engine.buildings.forEach(b => (b.selected = false));
      clickedBuilding.selected = true;
      setSelectedBuildingId(clickedBuilding.id);
      selectedUnitIdsRef.current = [];
      setSelectedUnitIds([]);
      soundEngine.playClick();
      return;
    }

    // 8. Tapped empty ground with no units selected -> clear building selection
    if (!isTouchMultiSelect) {
      engine.buildings.forEach(b => (b.selected = false));
      setSelectedBuildingId(null);
    }
  }, [
    activeInteractionMode,
    isNukeTargeting,
    isTouchMultiSelect,
    issueMoveOrAttack,
  ]);

  // --- Mouse Handlers ---
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    soundEngine.init();
    soundEngine.resume();

    const world = screenToWorld(e.clientX, e.clientY);
    const engine = engineRef.current;
    if (!engine) return;

    if (e.button === 0) {
      if (activePlacementRef.current || isNukeTargeting || activeInteractionMode !== 'NORMAL') {
        handlePrimaryActionAtWorld(world, false);
        return;
      }

      isMouseDownRef.current = true;
      mouseDownPosRef.current = world;
      const box = { start: world, current: world };
      selectionBoxRef.current = box;
      setSelectionBox(box);
    }

    if (e.button === 2) {
      e.preventDefault();

      if (activePlacementRef.current) {
        handleCancelPlacement();
        return;
      }
      if (isNukeTargeting) {
        setIsNukeTargeting(false);
        soundEngine.playClick();
        return;
      }
      if (activeInteractionMode !== 'NORMAL') {
        setActiveInteractionMode('NORMAL');
        soundEngine.playClick();
        return;
      }

      if (selectedUnitIdsRef.current.length > 0) {
        issueMoveOrAttack(world, false);
      } else if (selectedBuildingId) {
        const b = engine.buildings.find(o => o.id === selectedBuildingId);
        if (b && b.faction === 'player') {
          b.rallyPoint = { x: world.x, y: world.y };
          soundEngine.playClick();
          engine.pings.push({
            id: Math.random().toString(),
            x: world.x,
            y: world.y,
            color: '#36C9E8',
            life: 0,
            maxLife: 1.0,
            label: 'RALLY POINT',
          });
        }
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const world = screenToWorld(e.clientX, e.clientY);
    mouseWorldPosRef.current = world;
    setMouseWorldPos(world);

    if (activePlacementRef.current && isMouseDownRef.current) {
      handlePrimaryActionAtWorld(world, false);
      return;
    }

    if (isMouseDownRef.current && mouseDownPosRef.current) {
      const box = {
        start: mouseDownPosRef.current,
        current: world,
      };
      selectionBoxRef.current = box;
      setSelectionBox(box);
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const engine = engineRef.current;
    if (!engine) return;

    if (activePlacementRef.current) {
      isMouseDownRef.current = false;
      mouseDownPosRef.current = null;
      selectionBoxRef.current = null;
      setSelectionBox(null);
      return;
    }

    if (isMouseDownRef.current && mouseDownPosRef.current) {
      const start = mouseDownPosRef.current;
      const end = screenToWorld(e.clientX, e.clientY);
      const dist = Math.hypot(end.x - start.x, end.y - start.y);

      if (dist > 15) {
        const minX = Math.min(start.x, end.x);
        const maxX = Math.max(start.x, end.x);
        const minY = Math.min(start.y, end.y);
        const maxY = Math.max(start.y, end.y);

        const insideUnits = engine.units.filter(
          u => u.faction === 'player' && u.hp > 0 && u.x >= minX && u.x <= maxX && ((u.y >= minY && u.y <= maxY) || (unitAimPoint(u).y >= minY && unitAimPoint(u).y <= maxY))
        );

        if (insideUnits.length > 0) {
          engine.units.forEach(u => (u.selected = false));
          engine.buildings.forEach(b => (b.selected = false));

          insideUnits.forEach(u => (u.selected = true));
          const ids = insideUnits.map(u => u.id);
          selectedUnitIdsRef.current = ids;
          setSelectedUnitIds(ids);
          setSelectedBuildingId(null);
          soundEngine.playSelectUnit();
        }
      } else {
        handlePrimaryActionAtWorld(end, false);
      }
    }

    isMouseDownRef.current = false;
    mouseDownPosRef.current = null;
    selectionBoxRef.current = null;
    setSelectionBox(null);
  };

  // --- Double-Tap Handler: Double-Tap Empty Ground resets zoom, Double-Tap Unit focuses & selects same type ---
  const handleDoubleTapAtWorld = useCallback((world: Vector2) => {
    const engine = engineRef.current;
    if (!engine) return;

    const clickedUnit = pickUnit(engine.units, world, 38, 'player');

    if (clickedUnit) {
      // DOUBLE TAP UNIT: Select all units of same type and focus camera on unit!
      const sameTypeUnits = engine.units.filter(u => u.faction === 'player' && u.hp > 0 && u.type === clickedUnit.type);
      engine.units.forEach(u => (u.selected = false));
      sameTypeUnits.forEach(u => (u.selected = true));
      const ids = sameTypeUnits.map(u => u.id);
      selectedUnitIdsRef.current = ids;
      setSelectedUnitIds(ids);
      setSelectedBuildingId(null);
      saveCameraHistory();
      targetCameraRef.current.x = clickedUnit.x;
      targetCameraRef.current.y = clickedUnit.y;
      soundEngine.playSelectUnit();
    } else {
      // DOUBLE TAP EMPTY TERRAIN: Reset smoothly to preferred tactical zoom (0.95x)!
      saveCameraHistory();
      targetCameraRef.current.zoom = 0.95;
      soundEngine.playClick();
    }
  }, [saveCameraHistory]);

  // --- Mobile Touch Gestures (Midpoint Invariant Zoom, Smooth Pan, Long-Press Box Select, Reliable Tap) ---
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    soundEngine.init();
    soundEngine.resume();

    // Cancel any pending long press
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    isBoxSelectingRef.current = false;

    // Two-finger gesture (Pinch zoom toward midpoint + Two-finger drag pan without selecting)
    if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const worldMid = screenToWorld(midX, midY);

      // Auto-disengage follow mode when user initiates camera gestures
      if (followUnitRef.current) {
        followUnitRef.current = false;
        setFollowUnit(false);
      }

      touchStartRef.current = {
        screenX: midX,
        screenY: midY,
        time: Date.now(),
        isPan: true,
        initialDist: Math.max(10, dist),
        initialZoom: targetCameraRef.current.zoom,
        worldMid,
      };
      return;
    }

    // One-finger touch
    if (e.touches.length === 1) {
      const t = e.touches[0];
      touchStartRef.current = {
        screenX: t.clientX,
        screenY: t.clientY,
        time: Date.now(),
        isPan: false,
      };

      // Long-Press (> 280ms) triggers Mobile Box Drag Selection!
      const startX = t.clientX;
      const startY = t.clientY;
      longPressTimerRef.current = window.setTimeout(() => {
        if (touchStartRef.current && !touchStartRef.current.isPan) {
          isBoxSelectingRef.current = true;
          const startWorld = screenToWorld(startX, startY);
          if (touchStartRef.current) {
            touchStartRef.current.boxStartWorld = startWorld;
          }
          selectionBoxRef.current = { start: startWorld, current: startWorld };
          setSelectionBox({ start: startWorld, current: startWorld });
          soundEngine.playClick();
        }
      }, 280);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!touchStartRef.current) return;

    // Two-finger continuous pinch-to-zoom with midpoint world position invariance
    if (e.touches.length === 2 && touchStartRef.current.initialDist && touchStartRef.current.initialZoom && touchStartRef.current.worldMid) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

      const ratio = dist / touchStartRef.current.initialDist;
      const zoomSens = engineRef.current?.settings.zoomSensitivity ?? 1.0;
      const effectiveRatio = 1 + (ratio - 1) * zoomSens;
      const newZoom = Math.max(0.45, Math.min(1.85, touchStartRef.current.initialZoom * effectiveRatio));
      targetCameraRef.current.zoom = newZoom;

      // Authoritative Midpoint Invariant: Keep world position directly beneath fingers
      targetCameraRef.current.x = touchStartRef.current.worldMid.x - (midX - window.innerWidth / 2) / newZoom;
      targetCameraRef.current.y = touchStartRef.current.worldMid.y - (midY - window.innerHeight / 2) / newZoom;
      return;
    }

    // One-finger gestures
    if (e.touches.length === 1) {
      const t = e.touches[0];
      const dx = t.clientX - touchStartRef.current.screenX;
      const dy = t.clientY - touchStartRef.current.screenY;
      const dist = Math.hypot(dx, dy);

      // If finger moved before long-press timer fired, cancel box selection trigger and engage normal pan
      if (dist > 12 && longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }

      // If in Long-Press Box Selection mode: Drag the tactical selection rectangle
      if (isBoxSelectingRef.current && touchStartRef.current.boxStartWorld) {
        const curWorld = screenToWorld(t.clientX, t.clientY);
        selectionBoxRef.current = { start: touchStartRef.current.boxStartWorld, current: curWorld };
        setSelectionBox({ start: touchStartRef.current.boxStartWorld, current: curWorld });
        return;
      }

      // Standard One-Finger Battlefield Pan
      if (dist > 12 || touchStartRef.current.isPan) {
        touchStartRef.current.isPan = true;
        if (followUnitRef.current) {
          followUnitRef.current = false;
          setFollowUnit(false);
        }
        const panSens = engineRef.current?.settings.cameraSensitivity ?? 1.0;
        const currentZoom = Math.max(0.3, cameraRef.current.zoom);
        targetCameraRef.current.x -= (dx / currentZoom) * panSens;
        targetCameraRef.current.y -= (dy / currentZoom) * panSens;
        touchStartRef.current.screenX = t.clientX;
        touchStartRef.current.screenY = t.clientY;
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (!touchStartRef.current) return;

    const engine = engineRef.current;

    // Finish Mobile Drag Box Selection
    if (isBoxSelectingRef.current) {
      isBoxSelectingRef.current = false;
      const box = selectionBoxRef.current;
      if (box && engine) {
        const minX = Math.min(box.start.x, box.current.x);
        const maxX = Math.max(box.start.x, box.current.x);
        const minY = Math.min(box.start.y, box.current.y);
        const maxY = Math.max(box.start.y, box.current.y);

        const insideUnits = engine.units.filter(
          u => u.faction === 'player' && u.hp > 0 && u.x >= minX && u.x <= maxX && ((u.y >= minY && u.y <= maxY) || (unitAimPoint(u).y >= minY && unitAimPoint(u).y <= maxY))
        );

        if (insideUnits.length > 0) {
          engine.units.forEach(u => (u.selected = false));
          engine.buildings.forEach(b => (b.selected = false));
          insideUnits.forEach(u => (u.selected = true));
          const ids = insideUnits.map(u => u.id);
          selectedUnitIdsRef.current = ids;
          setSelectedUnitIds(ids);
          setSelectedBuildingId(null);
          soundEngine.playSelectUnit();
        }
      }
      selectionBoxRef.current = null;
      setSelectionBox(null);
      touchStartRef.current = null;
      return;
    }

    // Tap or Double-Tap
    if (!touchStartRef.current.isPan) {
      const clientX = touchStartRef.current.screenX;
      const clientY = touchStartRef.current.screenY;
      const world = screenToWorld(clientX, clientY);

      const now = Date.now();
      const prevTapTime = lastTapTimeRef.current;
      const prevPos = lastTapPosRef.current;
      const tapDist = Math.hypot(clientX - prevPos.x, clientY - prevPos.y);

      if (now - prevTapTime < 320 && tapDist < 35) {
        // Double-tap detected on mobile!
        handleDoubleTapAtWorld(world);
        lastTapTimeRef.current = 0;
      } else {
        lastTapTimeRef.current = now;
        lastTapPosRef.current = { x: clientX, y: clientY };
        handlePrimaryActionAtWorld(world, true);
      }
    }

    touchStartRef.current = null;
  };

  const handleTouchCancel = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    isBoxSelectingRef.current = false;
    selectionBoxRef.current = null;
    setSelectionBox(null);
    touchStartRef.current = null;
  };


  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const engine = engineRef.current;
    if (!engine) return;
    const world = screenToWorld(e.clientX, e.clientY);

    const clickedUnit = pickUnit(engine.units, world, 25, 'player');

    if (clickedUnit) {
      const sameTypeUnits = engine.units.filter(u => u.faction === 'player' && u.hp > 0 && u.type === clickedUnit.type);
      engine.units.forEach(u => (u.selected = false));
      sameTypeUnits.forEach(u => (u.selected = true));
      setSelectedUnitIds(sameTypeUnits.map(u => u.id));
      setSelectedBuildingId(null);
      soundEngine.playSelectUnit();
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.88;
    targetCameraRef.current.zoom = Math.max(0.55, Math.min(1.75, targetCameraRef.current.zoom * zoomFactor));
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysDownRef.current.add(e.code);
      const engine = engineRef.current;
      if (!engine || inMainMenu) return;

      if (e.code === 'Tab') {
        e.preventDefault();
        setIsCinematicMode(prev => !prev);
        return;
      }

      if (e.code === 'KeyF') {
        setFollowUnit(prev => !prev);
        return;
      }

      if (e.code === 'KeyR' && activePlacementRef.current) {
        handleRotatePlacement();
        return;
      }

      if (e.code === 'Enter' && activePlacementRef.current) {
        if (activePlacementRef.current.isValid) {
          handleConfirmPlacement();
        }
        return;
      }

      if (e.code === 'Escape') {
        setIsNukeTargeting(false);
        return; // V14: Esc is handled by handleNavBack (placement, command mode, selection, then pause)
      }

      if (e.code === 'F2') {
        const army = engine.units.filter(u => u.faction === 'player' && u.hp > 0);
        engine.units.forEach(u => (u.selected = army.includes(u)));
        setSelectedUnitIds(army.map(u => u.id));
        soundEngine.playSelectUnit();
        return;
      }

      if (e.code === 'Space') {
        if (selectedUnitIds.length > 0) {
          const sel = engine.units.find(u => u.id === selectedUnitIds[0] && u.hp > 0);
          if (sel) {
            cameraRef.current.x = sel.x;
            cameraRef.current.y = sel.y;
            return;
          }
        }
        const hq = engine.buildings.find(b => b.type === 'headquarters' && b.faction === 'player');
        if (hq) {
          cameraRef.current.x = hq.pixelX;
          cameraRef.current.y = hq.pixelY;
        } else {
          const army = engine.units.filter(u => u.faction === 'player' && u.hp > 0);
          if (army.length > 0) {
            cameraRef.current.x = army[0].x;
            cameraRef.current.y = army[0].y;
          }
        }
        return;
      }

      if (e.code === 'KeyH' && !e.ctrlKey) {
        const hq = engine.buildings.find(b => b.type === 'headquarters' && b.faction === 'player');
        if (hq) {
          cameraRef.current.x = hq.pixelX;
          cameraRef.current.y = hq.pixelY;
        }
        return;
      }

      // V12 desktop shortcuts, routed through the same engine commands / target modes as the touch UI:
      // M move · A attack · D defend · P patrol (then click the target) · S stop · G hold position
      if (selectedUnitIds.length > 0 && !e.ctrlKey && !e.metaKey) {
        const mode = ({ KeyM: 'MOVE_TARGET', KeyA: 'ATTACK_TARGET', KeyD: 'DEFEND_TARGET', KeyP: 'PATROL_TARGET' } as const)[e.code as 'KeyM'];
        if (mode) { setActiveInteractionMode(m => (m === mode ? 'NORMAL' : mode)); soundEngine.playClick(); return; }
        if (e.code === 'KeyS') { engine.issueStop(selectedUnitIds); return; }
        if (e.code === 'KeyG') { engine.issueHold(selectedUnitIds); return; }
      }

      const numMatch = e.code.match(/^Digit([1-5])$/);
      if (numMatch) {
        const groupNum = parseInt(numMatch[1], 10);
        if (e.ctrlKey) {
          engine.controlGroups[groupNum] = [...selectedUnitIds];
          soundEngine.playClick();
        } else {
          const squadIds = engine.controlGroups[groupNum] || [];
          const activeUnits = engine.units.filter(u => squadIds.includes(u.id) && u.hp > 0);
          engine.units.forEach(u => (u.selected = activeUnits.includes(u)));
          setSelectedUnitIds(activeUnits.map(u => u.id));
          if (activeUnits.length > 0) soundEngine.playSelectUnit();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysDownRef.current.delete(e.code);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [inMainMenu, selectedUnitIds]);

  const toggleMute = () => {
    const muted = soundEngine.toggleMute();
    setIsMuted(muted);
  };

  const engine = engineRef.current;
  const selectedUnits = engine
    ? engine.units.filter(u => u.selected && u.faction === 'player' && u.hp > 0)
    : [];
  const selectedBuilding = engine
    ? engine.buildings.find(b => b.id === selectedBuildingId && b.hp > 0) || null
    : null;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans select-none">
      {inMainMenu ? (
        nav.screen === 'map_select' ? (
          <MapSelectScreen setup={setup} onChange={setSetup} onBack={() => dispatchNav({ type: 'back' })} onHome={requestHome}
            onContinue={() => dispatchNav({ type: 'go', screen: 'match_setup' })} />
        ) : nav.screen === 'match_setup' ? (
          <MatchSetupScreen setup={setup} onChange={setSetup} onBack={() => dispatchNav({ type: 'back' })} onHome={requestHome}
            onChangeMap={() => dispatchNav({ type: 'go', screen: 'map_select' })} onStart={() => startFromSetup(setup)} />
        ) : (
          <MainMenuScreen
            latestSave={latestSaveSlot()}
            onContinue={() => { const d = latestSaveSlot(); if (d) loadSavedGame(d); }}
            onNewGame={() => dispatchNav({ type: 'go', screen: 'match_setup' })}
            onMapSelect={() => dispatchNav({ type: 'go', screen: 'map_select' })}
            onLoad={() => dispatchNav({ type: 'open', overlay: { id: 'save_load', mode: 'load' } })}
            onSettings={() => dispatchNav({ type: 'open', overlay: { id: 'settings', category: null } })}
            onHelp={() => dispatchNav({ type: 'open', overlay: { id: 'help' } })}
            onCareer={() => dispatchNav({ type: 'open', overlay: { id: 'career' } })}
            onQuickDeploy={() => startFromSetup(setup, true)}
          />
        )
      ) : (
        <>
          {/* REAL-TIME 3D BATTLEFIELD CANVAS (Three.js PBR) */}
          <canvas
            ref={threeCanvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchCancel}
            onDoubleClick={handleDoubleClick}
            onWheel={handleWheel}
            onContextMenu={e => e.preventDefault()}
            className={`w-full h-full block bg-[#0a1017] touch-none ${!is3DMode ? 'hidden' : ''} ${
              activePlacement
                ? 'cursor-cell'
                : isNukeTargeting || activeInteractionMode === 'ATTACK_TARGET'
                ? 'cursor-crosshair'
                : activeInteractionMode === 'MOVE_TARGET'
                ? 'cursor-pointer'
                : 'cursor-default'
            }`}
          />

          {/* 2D CANVAS FALLBACK */}
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchCancel}
            onDoubleClick={handleDoubleClick}
            onWheel={handleWheel}
            onContextMenu={e => e.preventDefault()}
            className={`w-full h-full block bg-[#101820] touch-none ${is3DMode ? 'hidden' : ''} ${
              activePlacement
                ? 'cursor-cell'
                : isNukeTargeting || activeInteractionMode === 'ATTACK_TARGET'
                ? 'cursor-crosshair'
                : activeInteractionMode === 'MOVE_TARGET'
                ? 'cursor-pointer'
                : 'cursor-default'
            }`}
          />

          {/* HUD OVERLAYS (Hidden in Cinematic Mode) */}
          {engine && (
            <>
              {/* RESTORE BUTTON IN CINEMATIC MODE */}
              {isCinematicMode && (
                <button
                  onClick={() => setIsCinematicMode(false)}
                  title="Restore Tactical HUD (Tab)"
                  className="absolute top-4 right-4 z-40 p-2.5 rounded-lg bg-[#1C2933]/90 border border-[#38B98A] text-[#38B98A] hover:text-white backdrop-blur-md shadow-xl flex items-center gap-1.5 text-xs font-mono"
                >
                  <Eye className="w-4 h-4" />
                  <span>RESTORE HUD</span>
                </button>
              )}

              {/* UNIFIED STREAMLINED MOBILE RTS TOP HUD */}
              {!isCinematicMode && (
                <MobileTopHUD
                  engine={engine}
                  onOpenSettings={() => dispatchNav({ type: 'open', overlay: { id: 'settings', category: null } })}
                  onSelectAllTroops={() => {
                    const ids = engine.selectAllUnits();
                    selectedUnitIdsRef.current = ids;
                    setSelectedUnitIds(ids);
                    engine.buildings.forEach(b => (b.selected = false));
                    setSelectedBuildingId(null);
                    if (ids.length > 0) soundEngine.playSelectUnit();
                    else soundEngine.playError();
                  }}
                  onOpenSaveLoad={() => dispatchNav({ type: 'open', overlay: { id: 'save_load', mode: engineRef.current ? 'save' : 'load' } })}
                  onOpenAdvisor={() => setIsAdvisorOpen(true)}
                  onCenterHQ={handleCenterHQ}
                  onFitBase={handleFitBase}
                  onToggleFollow={toggleFollow}
                  isFollowing={followUnit}
                  onCycleZoom={handleCycleZoom}
                  currentZoom={cameraRef.current.zoom}
                  onRotateCamera={handleRotateCamera}
                  is3D={is3DMode}
                  onToggle3D={() => {
                    setIs3DMode(prev => !prev);
                    soundEngine.playClick();
                  }}
                  isRadarVisible={showRadar}
                  onToggleRadar={() => {
                    setShowRadar(prev => !prev);
                    soundEngine.playClick();
                  }}
                  onToggleMute={toggleMute}
                  isMuted={isMuted}
                  isFullscreen={isFullscreen}
                  onToggleFullscreen={toggleFullscreen}
                  onStartBuildingPlacement={handleStartPlacement}
                  onExitToMenu={requestHome}
                  onRefresh={() => setTick(t => t + 1)}
                  onOpenMenu={() => dispatchNav({ type: 'open', overlay: { id: 'pause' } })}
                  devToolsSignal={devToolsSignal}
                />
              )}

              {/* FLOATING ASSISTED ARCHITECT RECOMMENDATION BANNER */}
              {!isCinematicMode && engine.aiArchitect.pendingAssistedRecommendation && (
                <aside
                  role="alert"
                  aria-label="AI construction recommendation"
                  className="fixed top-[var(--hud-top)] left-1/2 -translate-x-1/2 z-40 max-w-sm w-[92%] bg-[#101820]/95 backdrop-blur-md border border-[#38bdf8]/60 rounded-xl p-2.5 shadow-2xl flex items-center justify-between gap-2 animate-in fade-in slide-in-from-top-2 duration-300 pointer-events-auto"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-[#0284c7]/20 border border-[#0284c7]/50 flex items-center justify-center shrink-0">
                      <Hammer className="w-4 h-4 text-[#38bdf8]" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="text-[9px] font-bold uppercase px-1 py-0.2 rounded bg-[#38bdf8]/20 text-[#38bdf8]">
                          AI ADVICE
                        </span>
                        <span className="font-bold text-xs text-white truncate">
                          {BUILDING_CONFIGS[engine.aiArchitect.pendingAssistedRecommendation.type]?.name}
                        </span>
                      </div>
                      <p className="text-[10px] text-[#A9B8C5] truncate">
                        {engine.aiArchitect.pendingAssistedRecommendation.reason}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => {
                        engine.acceptAssistedRecommendation();
                        setTick(t => t + 1);
                      }}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] rounded-lg shadow-md transition-colors"
                    >
                      BUILD (${engine.aiArchitect.pendingAssistedRecommendation.cost})
                    </button>
                    <button
                      onClick={() => {
                        engine.rejectAssistedRecommendation();
                        setTick(t => t + 1);
                      }}
                      className="p-1 text-[#A9B8C5] hover:text-rose-400 text-[10px] rounded transition-colors"
                      title="Decline"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </aside>
              )}


              {/* Floating Miniature Radar (Positioned safely below the HUD header) */}
              {!isCinematicMode && showRadar && (
                <MobileFloatingRadar
                  engine={engine}
                  camera={cameraRef.current}
                  onMoveCamera={(wx, wy) => {
                    targetCameraRef.current.x = wx;
                    targetCameraRef.current.y = wy;
                  }}
                  onCenterHQ={handleCenterHQ}
                  onCenterArmy={handleCenterArmy}
                  viewportWidth={window.innerWidth}
                  viewportHeight={window.innerHeight}
                />
              )}

              {/* Modern Mobile Bottom Sheet (BUILD | ARMY | DEFENSE | AI | MENU) */}
              {!isCinematicMode && (
                <MobileBottomSheet
                  engine={engine}
                  selectedUnits={selectedUnits}
                  selectedBuilding={selectedBuilding}
                  onStartBuildingPlacement={handleStartPlacement}
                  onFilterSelectionToType={type => {
                    const matching = engine.units.filter(u => u.faction === 'player' && u.type === type && u.hp > 0).map(u => u.id);
                    if (matching.length > 0) {
                      engine.units.forEach(u => (u.selected = matching.includes(u.id)));
                      selectedUnitIdsRef.current = matching;
                      setSelectedUnitIds(matching);
                      soundEngine.playSelectUnit();
                    }
                  }}
                  onQueueUnit={(bId, uType) => {
                    engine.queueUnitProduction(bId, uType);
                    setTick(t => t + 1);
                  }}
                  onCancelQueue={(bId, idx) => {
                    engine.cancelUnitProduction(bId, idx);
                    setTick(t => t + 1);
                  }}
                  onSelectSingleUnit={uId => {
                    engine.units.forEach(u => (u.selected = u.id === uId));
                    selectedUnitIdsRef.current = [uId];
                    setSelectedUnitIds([uId]);
                  }}
                  onIssueUnitCommandType={cmd => {
                    if (cmd === 'retreat') {
                      engine.issueRetreat(selectedUnitIds);
                    } else if (cmd === 'attack_move' || cmd === 'attack') {
                      setActiveInteractionMode(m => (m === 'ATTACK_TARGET' ? 'NORMAL' : 'ATTACK_TARGET'));
                    } else if (cmd === 'defend') {
                      // V12: tap DEFEND, then tap the position to hold (tap DEFEND again to cancel)
                      setActiveInteractionMode(m => (m === 'DEFEND_TARGET' ? 'NORMAL' : 'DEFEND_TARGET'));
                    } else if (cmd === 'guard') {
                      engine.issueGuard(selectedUnitIds);
                      soundEngine.playCommandAffirmative();
                    } else if (cmd === 'patrol') {
                      setActiveInteractionMode(m => (m === 'PATROL_TARGET' ? 'NORMAL' : 'PATROL_TARGET'));
                    } else if (cmd === 'hold') {
                      engine.issueHold(selectedUnitIds);
                      soundEngine.playCommandAffirmative();
                    } else if (cmd === 'stop') {
                      engine.issueStop(selectedUnitIds);
                      soundEngine.playCommandAffirmative();
                    } else if (cmd === 'move') {
                      setActiveInteractionMode(m => (m === 'MOVE_TARGET' ? 'NORMAL' : 'MOVE_TARGET'));
                    } else if (cmd === 'auto_heal' || cmd === 'heal') {
                      engine.issueHeal(selectedUnitIds);
                      soundEngine.playCommandAffirmative();
                    } else if (cmd === 'repair') {
                      engine.issueRepair(selectedUnitIds);
                      soundEngine.playCommandAffirmative();
                    }
                  }}
                  onToggleRepair={bId => {
                    engine.toggleBuildingRepair(bId);
                    setTick(t => t + 1);
                  }}
                  onDemolish={bId => {
                    engine.demolishBuilding(bId);
                    setSelectedBuildingId(null);
                    setTick(t => t + 1);
                  }}
                  onResearch={techId => {
                    engine.researchTech(techId);
                    setTick(t => t + 1);
                  }}
                  onTriggerNukeTargeting={() => {
                    setIsNukeTargeting(true);
                    setActiveInteractionMode('NORMAL');
                    soundEngine.playAlarm();
                  }}
                  onSetFormation={formation => {
                    engine.currentFormation = formation;
                    engine.issueUnitGroupCommand(selectedUnitIds, cameraRef.current, false, formation);
                    setTick(t => t + 1);
                  }}
                  activeInteractionMode={activeInteractionMode}
                  onOpenAdvisor={() => setIsAdvisorOpen(true)}
                  onPreviewRecommendation={handlePreviewRecommendation}
                  onSelectAllArmy={() => {
                    const ids = engine.selectAllUnits();
                    selectedUnitIdsRef.current = ids;
                    setSelectedUnitIds(ids);
                    setSelectedBuildingId(null);
                    soundEngine.playSelectUnit();
                  }}
                  onSelectInfantry={() => {
                    const ids = engine.selectUnitsByCategory('infantry');
                    selectedUnitIdsRef.current = ids;
                    setSelectedUnitIds(ids);
                    setSelectedBuildingId(null);
                    soundEngine.playSelectUnit();
                  }}
                  onSelectTanks={() => {
                    const ids = engine.selectUnitsByCategory('vehicle');
                    selectedUnitIdsRef.current = ids;
                    setSelectedUnitIds(ids);
                    setSelectedBuildingId(null);
                    soundEngine.playSelectUnit();
                  }}
                  onSelectAirUnits={() => {
                    const ids = engine.selectUnitsByCategory('aircraft');
                    selectedUnitIdsRef.current = ids;
                    setSelectedUnitIds(ids);
                    setSelectedBuildingId(null);
                    soundEngine.playSelectUnit();
                  }}
                  onSelectSupportUnits={() => {
                    const ids = engine.selectSupportUnits();
                    selectedUnitIdsRef.current = ids;
                    setSelectedUnitIds(ids);
                    setSelectedBuildingId(null);
                    soundEngine.playSelectUnit();
                  }}
                  onSelectIdleUnits={() => {
                    const ids = engine.selectIdleUnits();
                    selectedUnitIdsRef.current = ids;
                    setSelectedUnitIds(ids);
                    setSelectedBuildingId(null);
                    soundEngine.playSelectUnit();
                  }}
                  onSelectCombatUnits={() => {
                    const ids = engine.selectCombatUnits();
                    selectedUnitIdsRef.current = ids;
                    setSelectedUnitIds(ids);
                    setSelectedBuildingId(null);
                    soundEngine.playSelectUnit();
                  }}
                  onClearSelection={() => {
                    const ids = engine.clearSelection();
                    selectedUnitIdsRef.current = ids;
                    setSelectedUnitIds(ids);
                    setSelectedBuildingId(null);
                  }}
                  onSelectDamagedUnits={() => {
                    const ids = engine.selectDamagedUnits();
                    selectedUnitIdsRef.current = ids;
                    setSelectedUnitIds(ids);
                    setSelectedBuildingId(null);
                    soundEngine.playSelectUnit();
                  }}
                  onSelectSquad={handleSelectSquad}
                  onSaveSquad={handleSaveSquad}
                  controlGroups={engine.controlGroups}
                  onOpenSettings={() => dispatchNav({ type: 'open', overlay: { id: 'settings', category: null } })}
                  onOpenSaveLoad={() => dispatchNav({ type: 'open', overlay: { id: 'save_load', mode: engineRef.current ? 'save' : 'load' } })}
                  onToggleFullscreen={toggleFullscreen}
                  isFullscreen={isFullscreen}
                  onToggleMute={toggleMute}
                  isMuted={isMuted}
                  onExitToMenu={requestHome}
                  onCenterHQ={handleCenterHQ}
                  onFitBase={handleFitBase}
                  onToggleFollow={toggleFollow}
                  isFollowing={followUnit}
                  onSetRallyPointMode={() => {
                    setActiveInteractionMode('MOVE_TARGET');
                    soundEngine.playClick();
                  }}
                  onCancelPlacement={handleCancelPlacement}
                />
              )}

              {/* SHARED CONSTRUCTION COMMAND BAR HUD (Intelligent Placement Assistant) */}
              {activePlacement && (
                <ConstructionControlBar
                  placement={activePlacement}
                  onNudge={handleNudgePlacement}
                  onRotate={handleRotatePlacement}
                  onConfirm={handleConfirmPlacement}
                  onCancel={handleCancelPlacement}
                  onSelectRecommendation={handleSelectRecommendation}
                />
              )}
            </>
          )}

          {/* V12: finished match, results closed -> read-only battlefield with a way back to the results */}
          {engine && engine.matchEnd && engine.matchPhase === 'results' && !modalType && (
            <button
              data-testid="match-over-banner"
              onClick={() => { const o = engine.matchEnd!.outcome; modalTypeRef.current = o; setModalType(o); }}
              className="fixed left-1/2 -translate-x-1/2 z-40 px-3 h-8 rounded-full bg-[#0E1620]/92 border border-[#2a3b4f] text-[11px] font-display font-semibold tracking-wider flex items-center gap-2 shadow-lg"
              style={{ top: 'calc(env(safe-area-inset-top, 0px) + 64px)' }}
            >
              <span className={engine.matchEnd.outcome === 'victory' ? 'text-[#3FBF8F]' : 'text-[#E06A5F]'}>
                {engine.matchEnd.outcome === 'victory' ? 'VICTORY' : 'DEFEAT'}
              </span>
              <span className="text-slate-400">MATCH OVER · READ-ONLY</span>
              <span className="text-slate-100">VIEW RESULTS</span>
            </button>
          )}

          {/* GAME MODAL (Victory, Defeat, Briefing, Settings) */}
          {engine && (
            <GameModal
              engine={engine}
              modalType={modalType}
              onClose={() => { modalTypeRef.current = null; setModalType(null); }}
              onStartNewGame={startNewGame}
              onRestartCurrent={restartCurrentGame}
              onMainMenu={goHome}
            />
          )}


          {/* BASE ADVISOR MODAL */}
          {engine && (
            <BaseAdvisorModal
              engine={engine}
              isOpen={isAdvisorOpen}
              onClose={() => setIsAdvisorOpen(false)}
              onStartBuildingPlacement={handleStartPlacement}
            />
          )}
        </>
      )}

      {/* V14 OVERLAYS: only the top of the navigation stack is shown */}
      {topNav?.id === 'settings' && (
        <SettingsModal
          engine={engine && !inMainMenu ? engine : null}
          isOpen
          category={topNav.category}
          onCategory={c => dispatchNav({ type: 'settings_category', category: c })}
          onClose={() => dispatchNav({ type: 'close' })}
          onHome={requestHome}
          onResume={!inMainMenu ? () => dispatchNav({ type: 'close_all' }) : undefined}
          onOpenSaveLoad={() => dispatchNav({ type: 'open', overlay: { id: 'save_load', mode: !inMainMenu ? 'save' : 'load' } })}
          backRef={settingsBackRef}
          onSettingsChanged={() => setTick(t => t + 1)}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
        />
      )}
      {topNav?.id === 'save_load' && (
        <SaveLoadModal
          engine={!inMainMenu ? engineRef.current : null}
          isOpen
          mode={topNav.mode}
          canSave={!engineRef.current?.matchEnd}
          onClose={() => dispatchNav({ type: 'close' })}
          onHome={requestHome}
          onLoadData={d => loadSavedGame(d)}
        />
      )}
      {topNav?.id === 'help' && <HelpOverlay onBack={() => dispatchNav({ type: 'close' })} onHome={requestHome} />}
      {topNav?.id === 'career' && <CareerOverlay onBack={() => dispatchNav({ type: 'close' })} />}
      {topNav?.id === 'pause' && engineRef.current && (
        <PauseMenu
          onResume={() => dispatchNav({ type: 'close' })}
          onSave={() => dispatchNav({ type: 'open', overlay: { id: 'save_load', mode: 'save' } })}
          onLoad={() => dispatchNav({ type: 'open', overlay: { id: 'save_load', mode: 'load' } })}
          onSettings={() => dispatchNav({ type: 'open', overlay: { id: 'settings', category: null } })}
          onHelp={() => dispatchNav({ type: 'open', overlay: { id: 'help' } })}
          onRestart={() => dispatchNav({ type: 'open', overlay: { id: 'confirm', kind: 'restart_match' } })}
          onMainMenu={requestHome}
          canSave={!engineRef.current.matchEnd}
          gameSpeed={engineRef.current.gameSpeed}
          onSpeed={v => { const e = engineRef.current; if (e) { e.gameSpeed = v; e.settings.gameSpeed = v; } setTick(t => t + 1); }}
          muted={isMuted}
          onToggleMute={toggleMute}
          fullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          onAdvisor={() => { dispatchNav({ type: 'close' }); setIsAdvisorOpen(true); }}
          onDevTools={engineRef.current.mode === 'sandbox' || (typeof window !== 'undefined' && /[?&]debug=1/.test(window.location.search)) ? () => { dispatchNav({ type: 'close' }); setDevToolsSignal(n => n + 1); } : undefined}
        />
      )}
      {topNav?.id === 'confirm' && topNav.kind === 'leave_match' && (
        <ConfirmDialog
          title="Leave this match?"
          message="Progress since your last save will be lost unless you save now."
          onCancel={() => dispatchNav({ type: 'close' })}
          options={[
            { label: 'Save and exit', tone: 'primary', testId: 'confirm-save-exit', onSelect: () => { const e = engineRef.current; if (e) writeSaveSlot('quicksave', e.exportSaveData('quicksave', 'Quick save')); goHome(); } },
            { label: 'Exit without saving', tone: 'danger', testId: 'confirm-exit', onSelect: goHome },
          ]}
        />
      )}
      {topNav?.id === 'confirm' && topNav.kind === 'restart_match' && (
        <ConfirmDialog
          title="Restart the match?"
          message="The current match is discarded and a new one starts on the same map."
          onCancel={() => dispatchNav({ type: 'close' })}
          options={[{ label: 'Restart match', tone: 'danger', testId: 'confirm-restart', onSelect: restartCurrentGame }]}
        />
      )}
    </div>
  );
}
