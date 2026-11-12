/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { soundEngine } from '../audio/soundEngine';
import { BUILDING_CONFIGS, CAMPAIGN_MISSIONS, MAP_PRESETS, TECH_UPGRADES, UNIT_CONFIGS } from '../data/gameData';
import {
  AIDifficulty,
  Building,
  BuildingType,
  CampaignMission,
  Faction,
  FloatingText,
  GameMode,
  GameSettings,
  MapData,
  Particle,
  PlayerEconomy,
  Projectile,
  SaveSlotData,
  SquadFormation,
  TacticalPing,
  TreadMark,
  Unit,
  UnitCategory,
  UnitCommandType,
  UnitType,
  Vector2,
  WeatherType,
  Wreckage,
  AutoProductionSettings,
  BuildingPlacementRecommendation,
  BaseIntelligenceReport,
  DefenseZone,
  DefenseZoneType,
  DetectedThreat,
  TacticalIntelligence,
  ThreatLevel,
  DefensePolicy,
  StrategicLogEntry,
  MatchSetupConfig,
  AIArchitectSettings,
  AIArchitectMode,
  AIArchitectDecision,
  AIArchitectCustomWeights,
  AIModuleId,
  AIModuleInfo,
} from '../types/game';
import { EnemyAI } from './ai';
import {
  calculateDamage,
  createDustParticles,
  createEngineSmokeParticles,
  createExplosionParticles,
  createHealParticles,
  createRepairParticles,
  createMuzzleFlashParticles,
  createWreckage,
  getAngle,
  getDistance,
  lerpAngle,
} from './combat';
import { calculateSquadOffsets, PathfindingGrid } from './pathfinding';
import { ensureArchitectState, getReservedCredits, syncConstructionTasks, planAndStartConstruction, approveTask, cancelTask } from './constructionAI';

export class GameEngine {
  public mode: GameMode;
  public difficulty: AIDifficulty;
  public mapData: MapData;
  public pathGrid: PathfindingGrid;
  public ai: EnemyAI;

  public isRunning: boolean = true;
  public isPaused: boolean = false;
  public gameSpeed: number = 1.0;
  public gameTime: number = 0;

  // Game Entities
  public units: Unit[] = [];
  public buildings: Building[] = [];
  public projectiles: Projectile[] = [];
  public particles: Particle[] = [];
  public wreckages: Wreckage[] = [];
  public treadMarks: TreadMark[] = [];
  public floatingTexts: FloatingText[] = [];
  public pings: TacticalPing[] = [];

  // Screen Shake FX
  public screenShakeIntensity: number = 0;
  public screenShakeOffset: Vector2 = { x: 0, y: 0 };

  // Fog of War
  public fogGrid: Uint8Array;

  // Economy & Tech
  public economy: PlayerEconomy;
  public unlockedTechs: Set<string> = new Set();
  public researchInProgress: { techId: string; progress: number; totalTime: number } | null = null;

  // Control Groups & Formations
  public controlGroups: Record<number, string[]> = {};
  public currentFormation: SquadFormation = 'spread';

  // Base Intelligence & Autonomous Military Production (AI Commander)
  public autoProduction: AutoProductionSettings = {
    enabled: false,
    strategy: 'balanced',
    reserveCredits: 400,
    targetArmySize: 30,
    maxQueueLength: 2,
    emergencyDefense: true,
    lastDecisionReason: 'AI Commander initialized. Standing by for strategic activation.',
    scoutedThreatsSummary: 'No confirmed enemy units detected in immediate defense perimeter.',
    customComposition: {
      infantryPct: 30,
      armorPct: 35,
      antiAirPct: 15,
      artilleryPct: 10,
      supportPct: 10,
    },
  };
  public basePlanningStyle: 'balanced' | 'defensive' | 'offensive' = 'balanced';

  // Base Architecture & Intelligent Automated Construction (AI Base Architect)
  public aiArchitect: AIArchitectSettings = {
    enabled: false,
    mode: 'balanced',
    reserveCredits: 450,
    maxConcurrentConstruction: 5, // up to five simultaneous AI construction projects
    tasks: [],
    taskHistory: [],
    blockedTypes: {},
    lastPlanTime: -999,
    nextTaskSeq: 1,
    isPaused: false,
    decisionsHistory: [],
    pendingAssistedRecommendation: null,
    lastDecisionReason: 'AI Architect online. Standing by for strategic activation.',
    lastDecisionTime: 0,
    customWeights: {
      powerPriority: 30,
      economyPriority: 25,
      defensePriority: 20,
      militaryPriority: 20,
      supportPriority: 5,
    },
  };

  // System 1: Intelligent Radar & Threat Detection Architecture
  public tacticalIntelligence: TacticalIntelligence = {
    threatLevel: 'GREEN',
    threatLevelTime: 0,
    lastAlertSoundTime: 0,
    activeThreats: [],
    defenseZones: [],
    settings: {
      autoDefenseEnabled: true,
      defensePolicy: 'defensive_intercept',
      emergencyReinforcements: true,
      retreatThresholdHp: 0.25,
      maxChaseDistance: 380,
      autoRepairEnabled: true,
      reserveArmyPct: 20,
      showRadarOverlay: true,
      showDefenseZones: true,
      alertSoundEnabled: true,
    },
    strategicLog: [
      {
        id: 'init_log',
        time: 0,
        text: 'Tactical Defense Grid Online. Radar surveillance active.',
        level: 'info',
      },
    ],
    radarOperational: false,
    radarRange: 420,
  };

  // Modular Autonomous Systems (Priority 7)
  public aiMedicalEnabled: boolean = true;
  public aiMedicalStatus: 'ONLINE' | 'ACTIVE' | 'STANDBY' | 'PAUSED' | 'OFFLINE' = 'STANDBY';
  public aiMedicalObjective: string = 'Active squad triage and field support';
  public aiMedicalLastAction: string = 'Standing by for casualties';
  public aiMedicalReason: string = 'All frontline personnel healthy';
  public aiMedicalLastTime: number = 0;

  public aiRepairEnabled: boolean = true;
  public aiRepairStatus: 'ONLINE' | 'ACTIVE' | 'STANDBY' | 'PAUSED' | 'OFFLINE' = 'STANDBY';
  public aiRepairObjective: string = 'Structural integrity and armor maintenance';
  public aiRepairLastAction: string = 'Base structures at maximum integrity';
  public aiRepairReason: string = 'No critical structural breaches detected';
  public aiRepairLastTime: number = 0;

  public aiEconomyEnabled: boolean = true;
  public aiEconomyStatus: 'ONLINE' | 'ACTIVE' | 'STANDBY' | 'PAUSED' | 'OFFLINE' = 'ONLINE';
  public aiEconomyObjective: string = 'Maintain grid stability and credit cashflow';
  public aiEconomyLastAction: string = 'Harvesting mineral ore';
  public aiEconomyReason: string = 'Balancing generation vs facility demand';
  public aiEconomyLastTime: number = 0;

  public aiExpansionEnabled: boolean = true;
  public aiExpansionStatus: 'ONLINE' | 'ACTIVE' | 'STANDBY' | 'PAUSED' | 'OFFLINE' = 'ONLINE';
  public aiExpansionObjective: string = 'Secure mineral deposits & forward outposts';
  public aiExpansionLastAction: string = 'Surveying resource nodes across map';
  public aiExpansionReason: string = 'Ready for secondary refinery perimeter expansion';
  public aiExpansionLastTime: number = 0;

  // Campaign / Defense Waves State
  public currentMission: CampaignMission | null = null;
  public defenseWave: number = 1;
  public nextWaveTimer: number = 30;
  public gameStatus: 'playing' | 'victory' | 'defeat' = 'playing';

  // Weather & Lighting
  public weather: WeatherType = 'clear';
  public dayNightCycleEnabled: boolean = true;
  public dayNightPhase: number = 0;

  // Victory Condition & Match Setup
  public victoryCondition: 'annihilation' | 'destroy_hq' | 'domination' = 'annihilation';
  public matchConfig?: Partial<MatchSetupConfig>;

  // Settings
  public settings: GameSettings;

  constructor(
    mode: GameMode = 'skirmish',
    difficulty: AIDifficulty = 'normal',
    mapId: string = 'verdant_valley',
    campaignMissionId?: number,
    matchConfig?: Partial<MatchSetupConfig>
  ) {
    this.mode = mode;
    this.difficulty = difficulty;
    this.matchConfig = matchConfig;
    if (matchConfig?.victoryCondition) this.victoryCondition = matchConfig.victoryCondition;
    const preset = MAP_PRESETS[mapId] || MAP_PRESETS.verdant_valley;
    this.mapData = preset.generator(matchConfig?.mapSize);
    this.weather = this.mapData.biome === 'snow' ? 'snow' : this.mapData.biome === 'desert' ? 'dust_storm' : 'clear';
    this.pathGrid = new PathfindingGrid(this.mapData);
    this.ai = new EnemyAI(difficulty, this.mapData);

    const totalTiles = this.mapData.width * this.mapData.height;
    this.fogGrid = new Uint8Array(totalTiles);

    const startingCredits = matchConfig?.startingCredits ?? (mode === 'sandbox' ? 999999 : mode === 'campaign' ? 1600 : 1200);

    this.economy = {
      credits: startingCredits,
      incomeRate: 0,
      powerSupply: 50,
      powerDemand: 0,
      population: 0,
      populationCap: 50,
      armyStrength: 0,
    };

    const fogSetting = matchConfig?.fogOfWar !== undefined ? matchConfig.fogOfWar : mode !== 'sandbox';
    const initSpeed = matchConfig?.gameSpeed ?? 1.0;
    this.gameSpeed = initSpeed;

    this.settings = {
      soundEnabled: true,
      musicEnabled: true,
      masterVolume: 0.8,
      sfxVolume: 0.85,
      musicVolume: 0.35,
      showHealthBars: 'damaged',
      gameSpeed: initSpeed,
      fogOfWarEnabled: fogSetting,
      weatherEffects: true,
      combatEffects: true,
      smokeDensity: 'low',
      unitVisibility: 'standard',
      dayNightCycle: false,
      graphicsQuality: (typeof localStorage !== 'undefined' ? (localStorage.getItem('iron_dominion_graphics_quality') as any) : null) || 'ultra',
      screenShake: 0.0, // PRIORITY 1: Screen shake disabled by default
      showDamageNumbers: true,
      eyeComfortMode: false,
      overlays: {
        attackRange: false,
        radarCoverage: false,
        defenseZones: false,
        patrolRoutes: false,
        buildingFootprints: false,
        unitSelection: true,
        enemyDetection: false,
        resourceLocations: false,
        pathfindingDebug: false,
      },
      supportRatio: 7,
      autoHeal: true,
      autoRepair: true,
    };

    if (mode === 'campaign' && campaignMissionId) {
      const mission = CAMPAIGN_MISSIONS.find(m => m.id === campaignMissionId);
      if (mission) {
        this.currentMission = JSON.parse(JSON.stringify(mission));
        this.economy.credits = mission.startingCredits;
        this.difficulty = mission.enemyDifficulty;
      }
    }

    this.initializeMatch();
  }

  public initializeMatch() {
    this.units = [];
    this.buildings = [];
    this.projectiles = [];
    this.particles = [];
    this.wreckages = [];
    this.treadMarks = [];
    this.floatingTexts = [];
    this.pings = [];
    this.gameTime = 0;
    this.gameStatus = 'playing';

    // 1. Spawn Player Headquarters
    const pSpawn = this.mapData.playerSpawn;
    const hqConfig = BUILDING_CONFIGS.headquarters;
    const ts = this.mapData.tileSize;
    const pGridX = Math.floor(pSpawn.x / ts);
    const pGridY = Math.floor(pSpawn.y / ts);
    const bw = hqConfig.size.width;
    const bh = hqConfig.size.height;
    const playerHqPixelX = pGridX * ts + (bw * ts) / 2;
    const playerHqPixelY = pGridY * ts + (bh * ts) / 2;

    this.buildings.push({
      id: 'player_hq',
      type: 'headquarters',
      faction: 'player',
      x: pGridX,
      y: pGridY,
      pixelX: playerHqPixelX,
      pixelY: playerHqPixelY,
      width: bw,
      height: bh,
      hp: hqConfig.maxHp,
      maxHp: hqConfig.maxHp,
      armor: hqConfig.armor,
      level: 1,
      constructionProgress: 1.0,
      isUnderConstruction: false,
      isRepairing: false,
      productionQueue: [],
      rallyPoint: { x: playerHqPixelX + 80, y: playerHqPixelY + 80 },
      lastAttackTime: 0,
      selected: false,
    });

    // Establish Initial Tactical Defense Zones
    this.initDefenseZones({ x: playerHqPixelX, y: playerHqPixelY });
    this.tacticalIntelligence.threatLevel = 'GREEN';
    this.tacticalIntelligence.threatLevelTime = 0;
    this.tacticalIntelligence.activeThreats = [];
    this.tacticalIntelligence.strategicLog = [
      {
        id: `init_${Date.now()}`,
        time: 0,
        text: 'Tactical Defense Grid Online. HQ & perimeter security zones established.',
        level: 'info',
      },
    ];

    // Starting squad (positioned clear of HQ footprint)
    this.spawnUnit('rifleman', 'player', { x: playerHqPixelX + 70, y: playerHqPixelY + 50 });
    this.spawnUnit('rifleman', 'player', { x: playerHqPixelX + 90, y: playerHqPixelY + 50 });
    this.spawnUnit('scout', 'player', { x: playerHqPixelX + 110, y: playerHqPixelY + 50 });

    if (this.matchConfig?.startingArmy === 'strike_force') {
      this.spawnUnit('rocket_soldier', 'player', { x: playerHqPixelX + 70, y: playerHqPixelY + 80 });
      this.spawnUnit('rocket_soldier', 'player', { x: playerHqPixelX + 90, y: playerHqPixelY + 80 });
      this.spawnUnit('main_battle_tank', 'player', { x: playerHqPixelX + 110, y: playerHqPixelY + 80 });
      this.spawnUnit('apc', 'player', { x: playerHqPixelX + 135, y: playerHqPixelY + 80 });
    }

    if (this.matchConfig?.startingTech === 'advanced') {
      this.unlockedTechs.add('armor_boost');
      this.unlockedTechs.add('damage_boost');
      this.unlockedTechs.add('optics_boost');
    } else if (this.matchConfig?.startingTech === 'all') {
      TECH_UPGRADES.forEach(t => this.unlockedTechs.add(t.id));
    }

    if (this.mode === 'sandbox') {
      this.spawnUnit('main_battle_tank', 'player', { x: playerHqPixelX + 80, y: playerHqPixelY + 90 });
      this.spawnUnit('attack_helicopter', 'player', { x: playerHqPixelX + 120, y: playerHqPixelY + 90 });
      this.spawnUnit('artillery', 'player', { x: playerHqPixelX + 160, y: playerHqPixelY + 90 });
    }

    // 2. Spawn Enemy Headquarters & Garrison
    if (this.mode !== 'defense') {
      const eSpawn = this.mapData.enemySpawn;
      const eGridX = Math.floor(eSpawn.x / ts);
      const eGridY = Math.floor(eSpawn.y / ts);
      const enemyHqPixelX = eGridX * ts + (bw * ts) / 2;
      const enemyHqPixelY = eGridY * ts + (bh * ts) / 2;

      this.buildings.push({
        id: 'enemy_hq',
        type: 'headquarters',
        faction: 'enemy',
        x: eGridX,
        y: eGridY,
        pixelX: enemyHqPixelX,
        pixelY: enemyHqPixelY,
        width: bw,
        height: bh,
        hp: hqConfig.maxHp,
        maxHp: hqConfig.maxHp,
        armor: hqConfig.armor,
        level: 1,
        constructionProgress: 1.0,
        isUnderConstruction: false,
        isRepairing: false,
        productionQueue: [],
        rallyPoint: { x: enemyHqPixelX - 70, y: enemyHqPixelY - 70 },
        lastAttackTime: 0,
        selected: false,
      });

      this.spawnUnit('rifleman', 'enemy', { x: enemyHqPixelX - 60, y: enemyHqPixelY - 50 });
      this.spawnUnit('rifleman', 'enemy', { x: enemyHqPixelX - 85, y: enemyHqPixelY - 50 });
      this.spawnUnit('scout', 'enemy', { x: enemyHqPixelX - 110, y: enemyHqPixelY - 50 });
    }

    this.pathGrid.rebuild(this.mapData, this.buildings);
    this.updateFogOfWar();
  }

  // --- Main Tick ---
  public update(deltaTime: number) {
    if (this.isPaused || this.gameStatus !== 'playing') return;

    const dt = Math.min(deltaTime * this.gameSpeed, 0.1);
    this.gameTime += dt;

    // Decay Screen Shake
    if (this.screenShakeIntensity > 0) {
      const mag = this.screenShakeIntensity * 12 * this.settings.screenShake;
      this.screenShakeOffset = {
        x: (Math.random() - 0.5) * mag,
        y: (Math.random() - 0.5) * mag,
      };
      this.screenShakeIntensity = Math.max(0, this.screenShakeIntensity - dt * 3.5);
    } else {
      this.screenShakeOffset = { x: 0, y: 0 };
    }

    // Day/Night Cycle
    if (this.settings.dayNightCycle) {
      this.dayNightPhase = ((Math.sin((this.gameTime / 120) * Math.PI) + 1) / 2) * 0.7;
    }

    // Dynamic Weather Transitions
    if (this.settings.weatherEffects && Math.floor(this.gameTime) % 90 === 0 && Math.random() < 0.05) {
      const weathers: WeatherType[] =
        this.mapData.biome === 'snow'
          ? ['snow', 'snow', 'clear']
          : this.mapData.biome === 'desert'
          ? ['dust_storm', 'clear', 'dust_storm']
          : ['clear', 'clear', 'rain'];
      this.weather = weathers[Math.floor(Math.random() * weathers.length)];
    }

    // 1. Units Update
    this.updateUnits(dt);

    // 2. Buildings Update
    this.updateBuildings(dt);
    syncConstructionTasks(this); // Construction AI statuses follow the real buildings every frame

    // 3. Projectiles & Ballistics
    this.updateProjectiles(dt);

    // 4. Combat Particles, Wreckage, Tread Marks
    this.updateVisualEffects(dt);

    // 5. Economy & Power Grid
    this.updateEconomy(dt);

    // 6. Enemy AI Update
    const enemyBuildings = this.buildings.filter(b => b.faction === 'enemy');
    const enemyUnits = this.units.filter(u => u.faction === 'enemy');
    const playerBuildings = this.buildings.filter(b => b.faction === 'player');
    const playerUnits = this.units.filter(u => u.faction === 'player');

    this.ai.update(
      this.gameTime,
      enemyBuildings,
      enemyUnits,
      playerBuildings,
      playerUnits,
      this.pathGrid,
      (type, x, y) => this.placeBuilding(type, x, y, 'enemy'),
      (buildingId, unitType) => this.queueUnitProduction(buildingId, unitType),
      (unitIds, target, isAttackMove) => this.issueUnitGroupCommand(unitIds, target, isAttackMove),
      (buildingId) => this.toggleBuildingRepair(buildingId)
    );

    // 7. Base Defense Mode Waves
    if (this.mode === 'defense') {
      this.updateDefenseWaves(dt);
    }

    // 8. Fog of War Update
    if (Math.floor(this.gameTime * 6) % 1 === 0) {
      this.updateFogOfWar();
    }

    // 8a. Intelligent Radar & Threat Classification (every ~0.33s)
    if (Math.floor(this.gameTime * 3) % 1 === 0) {
      this.updateRadarAndThreatIntelligence(dt);
    }

    // 8b. Autonomous Base Defense Protocol (every 0.5s)
    if (Math.floor(this.gameTime * 2) % 1 === 0) {
      this.updateAutomaticBaseDefense(dt);
    }

    // 8c. Autonomous Military Production Update (Every 2 seconds)
    if (Math.floor(this.gameTime * 2) % 4 === 0) {
      this.updateAutoProduction();
    }

    // 8d. AI Base Architect (Every 2.5 seconds)
    if (Math.floor(this.gameTime * 2) % 5 === 0) {
      this.updateAIArchitect();
    }

    // 9. Match End Conditions
    this.checkMatchEndConditions();
  }

  public addScreenShake(amount: number) {
    this.screenShakeIntensity = Math.min(1.5, this.screenShakeIntensity + amount);
  }

  // --- Units Update ---
  private updateUnits(dt: number) {
    const hasNanoRepair = this.unlockedTechs.has('nano_repair');

    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];

      if (u.hp <= 0) {
        if (UNIT_CONFIGS[u.type].category === 'vehicle') {
          this.wreckages.push(createWreckage(u));
        }
        this.particles.push(...createExplosionParticles(u.x, u.y, UNIT_CONFIGS[u.type].category === 'vehicle'));
        this.addScreenShake(UNIT_CONFIGS[u.type].category === 'vehicle' ? 0.4 : 0.15);
        soundEngine.playExplosion(UNIT_CONFIGS[u.type].category === 'vehicle');
        this.units.splice(i, 1);
        continue;
      }

      // Recover cannon recoil & muzzle flashes
      if (u.recoilOffset && u.recoilOffset > 0) {
        u.recoilOffset = Math.max(0, u.recoilOffset - dt * 20);
      }
      if (u.muzzleFlash && u.muzzleFlash > 0) {
        u.muzzleFlash = Math.max(0, u.muzzleFlash - dt);
      }

      // Helicopter rotor spin
      if (u.type === 'attack_helicopter') {
        u.rotorAngle = (u.rotorAngle || 0) + dt * 32;
      }

      // Nanite self-repair when out of combat
      if (hasNanoRepair && u.faction === 'player' && this.gameTime - u.lastAttackTime > 5 && u.hp < u.maxHp) {
        u.hp = Math.min(u.maxHp, u.hp + dt * 4.5);
      }

      // --- MEDICAL TRIAGE & SUPPORT HEALING STATE MACHINE ---
      const canHealInfantry = UNIT_CONFIGS[u.type].canHeal || u.type === 'medic' || u.type === 'medical_apc';
      if (canHealInfantry && (!u.healCooldown || this.gameTime - u.healCooldown > 0.9)) {
        // Self-Preservation / Threat Evaluation: If medic is critically wounded (<35% HP), fall back from nearby hostiles
        if (u.hp < u.maxHp * 0.35 && u.command !== 'retreat' && u.command !== 'move') {
          const nearestEnemy = this.units.find(
            e => e.faction !== u.faction && e.hp > 0 && Math.hypot(u.x - e.x, u.y - e.y) < 140
          );
          if (nearestEnemy) {
            const retreatAngle = Math.atan2(u.y - nearestEnemy.y, u.x - nearestEnemy.x);
            const retreatTarget = {
              x: Math.max(20, Math.min(this.mapData.width * 40 - 20, u.x + Math.cos(retreatAngle) * 90)),
              y: Math.max(20, Math.min(this.mapData.height * 40 - 20, u.y + Math.sin(retreatAngle) * 90)),
            };
            u.command = 'move';
            u.path = [{ x: retreatTarget.x, y: retreatTarget.y }];
          }
        }

        // Autonomous Triage: Prioritize most severely injured infantry (% HP)
        const triageRadius = u.type === 'medical_apc' ? 220 : 180;
        const healAmount = u.type === 'medical_apc' ? 36 : 26;
        let bestTarget: Unit | null = null;
        let lowestHpRatio = 0.999;

        for (const other of this.units) {
          if (
            other.faction === u.faction &&
            other.id !== u.id &&
            other.hp > 0 &&
            other.hp < other.maxHp &&
            UNIT_CONFIGS[other.type].category === 'infantry' &&
            Math.hypot(u.x - other.x, u.y - other.y) <= triageRadius
          ) {
            const ratio = other.hp / other.maxHp;
            if (ratio < lowestHpRatio) {
              lowestHpRatio = ratio;
              bestTarget = other;
            }
          }
        }

        if (bestTarget) {
          u.healCooldown = this.gameTime;
          // Strict max HP clamping — never exceed maxHp
          const actualHealed = Math.min(healAmount, bestTarget.maxHp - bestTarget.hp);
          bestTarget.hp = Math.min(bestTarget.maxHp, bestTarget.hp + actualHealed);
          this.particles.push(...createHealParticles(bestTarget.x, bestTarget.y));
          if (this.settings.showDamageNumbers && actualHealed > 0) {
            this.floatingTexts.push({
              id: Math.random().toString(),
              x: bestTarget.x,
              y: bestTarget.y - 18,
              text: `+${Math.round(actualHealed)}`,
              color: '#10b981',
              life: 0,
              maxLife: 0.9,
            });
          }
        }
      }

      // --- REPAIR ENGINEER (VEHICLE & STRUCTURE FIELD REPAIR) ---
      if (u.type === 'engineer' && (!u.healCooldown || this.gameTime - u.healCooldown > 1.0)) {
        const repairRadius = 140;
        const repairAmount = 40;

        // 1. Check Damaged Vehicles
        const damagedVehicle = this.units.find(
          other =>
            other.faction === u.faction &&
            other.id !== u.id &&
            other.hp > 0 &&
            other.hp < other.maxHp &&
            UNIT_CONFIGS[other.type].category === 'vehicle' &&
            Math.hypot(u.x - other.x, u.y - other.y) <= repairRadius
        );

        if (damagedVehicle) {
          u.healCooldown = this.gameTime;
          const actualRepaired = Math.min(repairAmount, damagedVehicle.maxHp - damagedVehicle.hp);
          damagedVehicle.hp = Math.min(damagedVehicle.maxHp, damagedVehicle.hp + actualRepaired);
          this.particles.push(...createRepairParticles(damagedVehicle.x, damagedVehicle.y));
          if (this.settings.showDamageNumbers && actualRepaired > 0) {
            this.floatingTexts.push({
              id: Math.random().toString(),
              x: damagedVehicle.x,
              y: damagedVehicle.y - 18,
              text: `+${Math.round(actualRepaired)}`,
              color: '#38bdf8',
              life: 0,
              maxLife: 0.9,
            });
          }
        } else {
          // 2. Check Damaged Friendly Buildings
          const damagedBuilding = this.buildings.find(
            b =>
              b.faction === u.faction &&
              b.hp > 0 &&
              b.hp < b.maxHp &&
              Math.hypot(u.x - b.pixelX, u.y - b.pixelY) <= repairRadius + (b.width * 20)
          );
          if (damagedBuilding) {
            u.healCooldown = this.gameTime;
            const actualRepaired = Math.min(repairAmount, damagedBuilding.maxHp - damagedBuilding.hp);
            damagedBuilding.hp = Math.min(damagedBuilding.maxHp, damagedBuilding.hp + actualRepaired);
            this.particles.push(...createRepairParticles(damagedBuilding.pixelX, damagedBuilding.pixelY));
            if (this.settings.showDamageNumbers && actualRepaired > 0) {
              this.floatingTexts.push({
                id: Math.random().toString(),
                x: damagedBuilding.pixelX,
                y: damagedBuilding.pixelY - 25,
                text: `+${Math.round(actualRepaired)}`,
                color: '#38bdf8',
                life: 0,
                maxLife: 0.9,
              });
            }
          }
        }
      }

      // --- ADVANCED 2.5D TROOP MOVEMENT & STEERING ENGINE ---
      const category = UNIT_CONFIGS[u.type].category;
      const isVehicle = category === 'vehicle';
      const isAir = UNIT_CONFIGS[u.type].isAir;

      // Damaged vehicle smoke plumes
      if (isVehicle && u.hp < u.maxHp * 0.5 && Math.random() < 0.25) {
        this.particles.push(...createEngineSmokeParticles(u.x, u.y, u.hp < u.maxHp * 0.25));
      }

      // 1. Path waypoint following with acceleration & turning radius
      if (u.path.length > 0) {
        u.isMoving = true;
        const targetWaypoint = u.path[0];
        const dist = getDistance(u, targetWaypoint);
        const targetAngle = getAngle(u, targetWaypoint);

        // Turn rate based on unit mass & category
        let turnRate = 14; // Infantry fast pivot
        let accelRate = 350; // px/s^2
        if (category === 'vehicle') {
          if (u.type === 'heavy_tank' || u.type === 'siege_tank') {
            turnRate = 3.2;
            accelRate = 85;
          } else if (u.type === 'artillery' || u.type === 'main_battle_tank') {
            turnRate = 4.2;
            accelRate = 110;
          } else {
            turnRate = 6.5; // recon buggy, light tank
            accelRate = 180;
          }
        } else if (isAir) {
          turnRate = 4.2;
          accelRate = 160;
        }

        // Calculate angular difference
        let angleDiff = (targetAngle - u.rotation) % (Math.PI * 2);
        if (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        if (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

        // Smooth rotation towards waypoint
        u.rotation = lerpAngle(u.rotation, targetAngle, turnRate * dt);

        // Aircraft banking in turns
        if (isAir) {
          const targetBank = Math.max(-0.45, Math.min(0.45, angleDiff * 1.2));
          u.bankAngle = (u.bankAngle || 0) + (targetBank - (u.bankAngle || 0)) * Math.min(1, 8 * dt);
        }

        // Speed throttling during sharp turns (turning radius simulation for vehicles)
        let maxAllowedSpeed = u.speed;
        if (category === 'vehicle' && Math.abs(angleDiff) > Math.PI * 0.25) {
          maxAllowedSpeed *= Math.max(0.35, 1 - Math.abs(angleDiff) / Math.PI);
        }

        // Arrival smoothing (decelerate when approaching final waypoint)
        if (u.path.length === 1 && dist < 45) {
          maxAllowedSpeed = Math.max(12, maxAllowedSpeed * (dist / 45));
        }

        // Smooth acceleration / deceleration
        const curSpd = u.currentSpeed ?? 0;
        if (curSpd < maxAllowedSpeed) {
          u.currentSpeed = Math.min(maxAllowedSpeed, curSpd + accelRate * dt);
        } else {
          u.currentSpeed = Math.max(maxAllowedSpeed, curSpd - accelRate * 1.5 * dt);
        }

        const moveStep = (u.currentSpeed || 10) * dt;

        // Leave light dust tracks behind moving tanks (brief lifetime, strictly capped)
        if (category === 'vehicle' && Math.random() < 0.15) {
          if (this.treadMarks.length > 25) {
            this.treadMarks.shift();
          }
          this.treadMarks.push({
            x: u.x,
            y: u.y,
            rotation: u.rotation,
            life: 0,
            maxLife: 2.0,
          });
          this.particles.push(...createDustParticles(u.x, u.y));
        }

        // Check if waypoint reached
        if (dist <= Math.max(moveStep, 8)) {
          u.x = targetWaypoint.x;
          u.y = targetWaypoint.y;
          u.path.shift();
          if (u.path.length === 0) {
            u.isMoving = false;
            u.currentSpeed = 0;
            if (u.bankAngle) u.bankAngle = 0;
            if (u.command === 'move' || u.command === 'retreat') u.command = 'idle';
            if (u.command === 'patrol' && u.patrolPointA && u.patrolPointB) {
              const distToA = Math.hypot(u.x - u.patrolPointA.x, u.y - u.patrolPointA.y);
              const nextTarget = distToA < 40 ? u.patrolPointB : u.patrolPointA;
              u.path = this.pathGrid.findPath(u, nextTarget, isAir);
              u.isMoving = u.path.length > 0;
            }
          }
        } else {
          // Drive forward along heading vector
          const worldPxW = this.mapData.width * this.mapData.tileSize;
          const worldPxH = this.mapData.height * this.mapData.tileSize;
          u.x = Math.max(12, Math.min(worldPxW - 12, u.x + Math.cos(u.rotation) * moveStep));
          u.y = Math.max(12, Math.min(worldPxH - 12, u.y + Math.sin(u.rotation) * moveStep));
        }
      } else {
        u.isMoving = false;
        // Smoothly decelerate to 0 when idle
        if (u.currentSpeed && u.currentSpeed > 0) {
          u.currentSpeed = Math.max(0, u.currentSpeed - 300 * dt);
        }
        if (u.bankAngle && Math.abs(u.bankAngle) > 0.01) {
          u.bankAngle = lerpAngle(u.bankAngle, 0, 6 * dt);
        }

        // Dynamic follow & guard orders
        if (u.command === 'follow' && u.followTargetId) {
          const ally = this.units.find(o => o.id === u.followTargetId && o.hp > 0);
          if (ally && Math.hypot(u.x - ally.x, u.y - ally.y) > 75) {
            u.path = this.pathGrid.findPath(u, { x: ally.x, y: ally.y }, isAir);
            u.isMoving = u.path.length > 0;
          }
        } else if (u.command === 'guard' && u.guardTargetId) {
          const target = this.buildings.find(b => b.id === u.guardTargetId && b.hp > 0) ||
                         this.units.find(o => o.id === u.guardTargetId && o.hp > 0);
          const tx = (target as any)?.pixelX ?? (target as any)?.x;
          const ty = (target as any)?.pixelY ?? (target as any)?.y;
          if (target && tx !== undefined && Math.hypot(u.x - tx, u.y - ty) > 110) {
            u.path = this.pathGrid.findPath(u, { x: tx, y: ty }, isAir);
            u.isMoving = u.path.length > 0;
          }
        } else if (u.command === 'attack_move' && u.targetX !== undefined && u.targetY !== undefined && !u.targetUnitId && !u.targetBuildingId) {
          if (Math.hypot(u.x - u.targetX, u.y - u.targetY) > 30) {
            u.path = this.pathGrid.findPath(u, { x: u.targetX, y: u.targetY }, isAir);
            u.isMoving = u.path.length > 0;
          } else {
            u.command = 'idle';
          }
        }
      }

      // 2. Local Obstacle & Unit Separation (Boids Separation)
      // Prevents units from excessively clumping or overlapping into a single point
      if (!isAir && i < 120) { // Keep performance high
        const sepDist = category === 'vehicle' ? 32 : 18;
        let sepX = 0;
        let sepY = 0;
        let neighbors = 0;

        for (let j = 0; j < this.units.length; j++) {
          if (i === j) continue;
          const other = this.units[j];
          if (other.hp <= 0 || UNIT_CONFIGS[other.type].isAir) continue;

          const dx = u.x - other.x;
          const dy = u.y - other.y;
          const distSq = dx * dx + dy * dy;

          if (distSq > 0.01 && distSq < sepDist * sepDist) {
            const d = Math.sqrt(distSq);
            const strength = (sepDist - d) / sepDist;
            sepX += (dx / d) * strength;
            sepY += (dy / d) * strength;
            neighbors++;
            if (neighbors >= 4) break; // Limit calculations per unit
          }
        }

        if (neighbors > 0) {
          const pushWeight = (category === 'vehicle' ? 24 : 35) * dt;
          const nx = u.x + sepX * pushWeight;
          const ny = u.y + sepY * pushWeight;
          if (this.pathGrid.isPixelWalkable(nx, ny)) {
            u.x = nx;
            u.y = ny;
          }
        }
      }

      // 3. Independent Turret Alignment
      // Realign turret with vehicle hull if not actively targeting an enemy
      if (u.turretRotation !== undefined && !u.targetUnitId && !u.targetBuildingId) {
        u.turretRotation = lerpAngle(u.turretRotation, u.rotation, 4.0 * dt);
      }

      // Combat Engagement
      this.handleUnitCombat(u, dt);
    }
  }

  private handleUnitCombat(u: Unit, dt: number) {
    if (u.command === 'hold' && !u.targetUnitId && !u.targetBuildingId) {
      this.findTargetInRange(u);
    } else if (u.command === 'idle' || u.command === 'attack_move' || u.stance === 'aggressive') {
      if (!u.targetUnitId && !u.targetBuildingId) {
        this.findTargetInRange(u);
      }
    }

    let targetEntity: { x: number; y: number; hp: number; maxHp: number; armor: number; category: 'infantry' | 'vehicle' | 'aircraft' | 'building' } | null = null;
    let targetObj: Unit | Building | null = null;

    if (u.targetUnitId) {
      const tu = this.units.find(o => o.id === u.targetUnitId && o.hp > 0);
      if (tu) {
        targetEntity = {
          x: tu.x,
          y: tu.y,
          hp: tu.hp,
          maxHp: tu.maxHp,
          armor: tu.armor,
          category: UNIT_CONFIGS[tu.type].category,
        };
        targetObj = tu;
      } else {
        u.targetUnitId = undefined;
      }
    } else if (u.targetBuildingId) {
      const tb = this.buildings.find(o => o.id === u.targetBuildingId && o.hp > 0);
      if (tb) {
        targetEntity = {
          x: tb.pixelX,
          y: tb.pixelY,
          hp: tb.hp,
          maxHp: tb.maxHp,
          armor: tb.armor,
          category: 'building',
        };
        targetObj = tb;
      } else {
        u.targetBuildingId = undefined;
      }
    }

    if (!targetEntity) {
      u.isAttacking = false;
      return;
    }

    const dist = getDistance(u, targetEntity);
    const range = UNIT_CONFIGS[u.type].range;
    const targetAngle = getAngle(u, targetEntity);

    if (u.turretRotation !== undefined) {
      u.turretRotation = lerpAngle(u.turretRotation, targetAngle, 8 * dt);
    } else {
      u.rotation = lerpAngle(u.rotation, targetAngle, 8 * dt);
    }

    if (dist <= range) {
      u.isAttacking = true;
      if (u.command === 'attack_move' && u.path.length > 0) {
        u.path = [];
      }

      const attackCooldown = 1 / UNIT_CONFIGS[u.type].attackSpeed;
      if (this.gameTime - u.lastAttackTime >= attackCooldown) {
        u.lastAttackTime = this.gameTime;
        u.recoilOffset = 5;
        this.fireWeapon(u, targetEntity, targetObj);
      }
    } else if (u.command !== 'hold') {
      u.isAttacking = false;
      if (u.path.length === 0 || Math.random() < 0.1) {
        u.path = this.pathGrid.findPath(u, targetEntity, UNIT_CONFIGS[u.type].isAir);
      }
    }
  }

  private findTargetInRange(u: Unit) {
    const range = UNIT_CONFIGS[u.type].vision;
    let closestDist = range;
    let closestUnit: Unit | null = null;
    let closestBuilding: Building | null = null;

    for (const other of this.units) {
      if (other.faction !== u.faction && other.hp > 0) {
        const dist = getDistance(u, other);
        if (dist < closestDist) {
          closestDist = dist;
          closestUnit = other;
        }
      }
    }

    if (!closestUnit) {
      for (const b of this.buildings) {
        if (b.faction !== u.faction && b.hp > 0) {
          const dist = getDistance(u, { x: b.pixelX, y: b.pixelY });
          if (dist < closestDist) {
            closestDist = dist;
            closestBuilding = b;
          }
        }
      }
    }

    if (closestUnit) {
      u.targetUnitId = closestUnit.id;
    } else if (closestBuilding) {
      u.targetBuildingId = closestBuilding.id;
    }
  }

  private fireWeapon(
    attacker: Unit,
    targetPos: { x: number; y: number; hp: number; maxHp: number; armor: number; category: 'infantry' | 'vehicle' | 'aircraft' | 'building' },
    targetObj: Unit | Building | null
  ) {
    const config = UNIT_CONFIGS[attacker.type];
    const isVehicle = config.category === 'vehicle';
    let baseDamage = config.damage;

    // Recoil kickback and muzzle flash synchronization
    attacker.recoilOffset = isVehicle ? 6 : 2.5;
    attacker.muzzleFlash = 0.08;
    const aimAngle = attacker.turretRotation !== undefined ? attacker.turretRotation : attacker.rotation;
    const barrelLen = isVehicle ? 18 : 8;
    const tipX = attacker.x + Math.cos(aimAngle) * barrelLen;
    const tipY = attacker.y + Math.sin(aimAngle) * barrelLen;
    this.particles.push(...createMuzzleFlashParticles(tipX, tipY, aimAngle, isVehicle));

    if (this.unlockedTechs.has('damage_boost') && attacker.faction === 'player') {
      baseDamage *= 1.2;
    }

    if (attacker.rank > 0) {
      baseDamage *= 1 + attacker.rank * 0.15;
    }

    if (attacker.type === 'artillery') {
      soundEngine.playCannonShot();
      this.addScreenShake(0.35);
      this.projectiles.push({
        id: Math.random().toString(),
        startX: attacker.x,
        startY: attacker.y,
        x: attacker.x,
        y: attacker.y,
        targetX: targetPos.x + (Math.random() - 0.5) * 20,
        targetY: targetPos.y + (Math.random() - 0.5) * 20,
        speed: 240,
        damage: baseDamage,
        splashRadius: config.splashRadius || 65,
        faction: attacker.faction,
        type: 'artillery',
        progress: 0,
        arcHeight: 110,
      });
      return;
    }

    if (attacker.type === 'stealth_fighter') {
      soundEngine.playCannonShot();
      this.addScreenShake(0.4);
      this.projectiles.push({
        id: Math.random().toString(),
        startX: attacker.x,
        startY: attacker.y - 50,
        x: attacker.x,
        y: attacker.y - 50,
        targetX: targetPos.x,
        targetY: targetPos.y,
        speed: 320,
        damage: baseDamage,
        splashRadius: config.splashRadius || 45,
        faction: attacker.faction,
        type: 'bomb',
        progress: 0,
        arcHeight: 60,
      });
      return;
    }

    if (attacker.type === 'rocket_soldier' || attacker.type === 'mobile_sam' || attacker.type === 'attack_helicopter') {
      soundEngine.playMissileLaunch();
      this.projectiles.push({
        id: Math.random().toString(),
        startX: attacker.x,
        startY: attacker.y - (config.isAir ? 40 : 0),
        x: attacker.x,
        y: attacker.y - (config.isAir ? 40 : 0),
        targetX: targetPos.x,
        targetY: targetPos.y,
        targetUnitId: attacker.targetUnitId,
        targetBuildingId: attacker.targetBuildingId,
        speed: 400,
        damage: baseDamage,
        splashRadius: config.splashRadius || 30,
        faction: attacker.faction,
        type: 'missile',
        progress: 0,
      });
      return;
    }

    if (attacker.type === 'flamethrower') {
      soundEngine.playRifleShot();
      this.projectiles.push({
        id: Math.random().toString(),
        startX: attacker.x,
        startY: attacker.y,
        x: attacker.x,
        y: attacker.y,
        targetX: targetPos.x,
        targetY: targetPos.y,
        speed: 260,
        damage: baseDamage,
        splashRadius: 35,
        faction: attacker.faction,
        type: 'flame',
        progress: 0,
      });
      return;
    }

    if (attacker.type === 'grenadier') {
      soundEngine.playExplosion(false);
      this.projectiles.push({
        id: Math.random().toString(),
        startX: attacker.x,
        startY: attacker.y,
        x: attacker.x,
        y: attacker.y,
        targetX: targetPos.x,
        targetY: targetPos.y,
        speed: 300,
        damage: baseDamage,
        splashRadius: 40,
        faction: attacker.faction,
        type: 'grenade',
        progress: 0,
        arcHeight: 45,
      });
      return;
    }

    if (isVehicle) {
      soundEngine.playCannonShot();
      this.addScreenShake(0.15);
    } else {
      soundEngine.playRifleShot();
    }

    this.projectiles.push({
      id: Math.random().toString(),
      startX: attacker.x,
      startY: attacker.y,
      x: attacker.x,
      y: attacker.y,
      targetX: targetPos.x,
      targetY: targetPos.y,
      targetUnitId: attacker.targetUnitId,
      targetBuildingId: attacker.targetBuildingId,
      speed: config.projectileSpeed || 550,
      damage: baseDamage,
      splashRadius: config.splashRadius || 0,
      faction: attacker.faction,
      type: isVehicle ? 'cannon' : 'bullet',
      progress: 0,
    });
  }

  // --- Buildings Update ---
  private updateBuildings(dt: number) {
    const isPlayerPowerDeficit = this.economy.powerSupply < this.economy.powerDemand;

    for (let i = this.buildings.length - 1; i >= 0; i--) {
      const b = this.buildings[i];

      if (b.hp <= 0) {
        this.particles.push(...createExplosionParticles(b.pixelX, b.pixelY, true));
        this.addScreenShake(0.6);
        soundEngine.playExplosion(true);
        if (b.faction === 'player' && b.constructionProgress >= 1) {
          const log = (this.aiArchitect.lossLog ??= []);
          log.unshift({ t: this.gameTime, type: b.type });
          if (log.length > 20) log.length = 20;
          this.aiArchitect.planDirty = true; // a destroyed building is a reason to re-plan
        }
        this.buildings.splice(i, 1);
        this.pathGrid.rebuild(this.mapData, this.buildings);
        continue;
      }

      // Construction progress
      if (b.constructionProgress < 1.0) {
        const buildSpeed = b.faction === 'player' && isPlayerPowerDeficit ? 0.5 : 1.0;
        const totalSec = BUILDING_CONFIGS[b.type].buildTime;
        b.constructionProgress = Math.min(1.0, b.constructionProgress + (dt * buildSpeed) / totalSec);
        if (b.constructionProgress >= 1.0) {
          b.isUnderConstruction = false;
          if (b.faction === 'player') {
            soundEngine.playComplete();
            this.floatingTexts.push({
              id: Math.random().toString(),
              x: b.pixelX,
              y: b.pixelY - 30,
              text: 'STRUCTURE READY',
              color: '#38bdf8',
              life: 0,
              maxLife: 1.5,
            });
          }
          this.pathGrid.rebuild(this.mapData, this.buildings);
        }
      }

      // Active Repairing
      if (b.isRepairing && b.hp < b.maxHp) {
        const repairCostPerSec = 15;
        if (b.faction === 'player') {
          if (this.economy.credits >= repairCostPerSec * dt) {
            this.economy.credits -= repairCostPerSec * dt;
            b.hp = Math.min(b.maxHp, b.hp + dt * 45);
            if (b.hp >= b.maxHp) b.isRepairing = false;
          } else {
            b.isRepairing = false;
          }
        } else {
          b.hp = Math.min(b.maxHp, b.hp + dt * 40);
          if (b.hp >= b.maxHp) b.isRepairing = false;
        }
      }

      // Defensive Turrets
      if (
        b.constructionProgress >= 1.0 &&
        (b.type === 'turret_gun' || b.type === 'turret_missile' || b.type === 'turret_aa' || b.type === 'heavy_turret')
      ) {
        this.handleTurretDefense(b, dt);
      }

      // Field Hospital Passive Triage Aura (Restores nearby wounded infantry)
      if (b.constructionProgress >= 1.0 && b.type === 'field_hospital') {
        const triageRadius = 220;
        const triageRate = 14;
        this.units.forEach(u => {
          if (
            u.faction === b.faction &&
            u.hp > 0 &&
            u.hp < u.maxHp &&
            UNIT_CONFIGS[u.type].category === 'infantry' &&
            Math.hypot(u.x - b.pixelX, u.y - b.pixelY) <= triageRadius
          ) {
            u.hp = Math.min(u.maxHp, u.hp + dt * triageRate);
            if (Math.random() < 0.04) {
              this.particles.push(...createHealParticles(u.x, u.y));
            }
          }
        });
      }

      // Production Queues
      if (b.productionQueue.length > 0) {
        const currentItem = b.productionQueue[0];
        const trainSpeed = b.faction === 'player' && isPlayerPowerDeficit ? 0.5 : 1.0;
        currentItem.progress += (dt * trainSpeed) / currentItem.totalTime;

        if (currentItem.progress >= 1.0) {
          const ts = this.mapData.tileSize;
          const baseExitX = b.pixelX;
          const baseExitY = b.pixelY + (b.height * ts) / 2 + 18;

          // Spiral search outward if entrance is obstructed by other units or cliffs
          let spawnX = baseExitX;
          let spawnY = baseExitY;
          let foundClear = false;

          for (let r = 0; r <= 3 && !foundClear; r++) {
            for (let dx = -r; dx <= r && !foundClear; dx++) {
              for (let dy = -r; dy <= r && !foundClear; dy++) {
                if (r > 0 && Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                const testX = baseExitX + dx * 26;
                const testY = baseExitY + dy * 26;
                const gx = Math.floor(testX / ts);
                const gy = Math.floor(testY / ts);
                if (gx < 1 || gx >= this.mapData.width - 1 || gy < 1 || gy >= this.mapData.height - 1) continue;
                const tile = this.mapData.tiles[gy]?.[gx];
                if (tile === 3 || tile === 4) continue; // water or cliff
                const unitBlock = this.units.some(u => u.hp > 0 && Math.hypot(u.x - testX, u.y - testY) < 22);
                if (!unitBlock) {
                  spawnX = testX;
                  spawnY = testY;
                  foundClear = true;
                }
              }
            }
          }

          const spawned = this.spawnUnit(currentItem.unitType, b.faction, { x: spawnX, y: spawnY });
          b.productionQueue.shift();

          // Orient unit facing outward toward rally point or south gate
          const exitAngle = b.rallyPoint ? getAngle(spawned, b.rallyPoint) : Math.PI / 2;
          spawned.rotation = exitAngle;
          if (spawned.turretRotation !== undefined) {
            spawned.turretRotation = exitAngle;
          }
          spawned.currentSpeed = 35; // initial rolling impulse away from doorway

          // Auto-dispatch out of the building gate toward rally point or staging waypoint
          const targetRally = b.rallyPoint ? {
            x: b.rallyPoint.x + (Math.random() - 0.5) * 28,
            y: b.rallyPoint.y + (Math.random() - 0.5) * 28,
          } : {
            x: spawnX,
            y: spawnY + 45,
          };
          this.issueUnitGroupCommand([spawned.id], targetRally, false, 'spread');

          if (b.faction === 'player') {
            soundEngine.playComplete();
            this.floatingTexts.push({
              id: Math.random().toString(),
              x: spawnX,
              y: spawnY - 20,
              text: `${UNIT_CONFIGS[currentItem.unitType].name.toUpperCase()} READY`,
              color: '#38B98A',
              life: 0,
              maxLife: 1.4,
            });
          }
        }
      }
    }
  }

  private handleTurretDefense(b: Building, dt: number) {
    const config = BUILDING_CONFIGS[b.type];
    const range = config.range || 240;

    const target = this.units.find(
      u => u.faction !== b.faction && u.hp > 0 && Math.hypot(u.x - b.pixelX, u.y - b.pixelY) <= range
    );

    if (target) {
      b.targetUnitId = target.id;
      const isPlayerPowerDeficit = b.faction === 'player' && this.economy.powerSupply < this.economy.powerDemand;
      const effectiveAttackSpeed = isPlayerPowerDeficit ? (config.attackSpeed || 1.5) * 0.5 : (config.attackSpeed || 1.5);
      const cooldown = 1 / effectiveAttackSpeed;
      if (this.gameTime - b.lastAttackTime >= cooldown) {
        b.lastAttackTime = this.gameTime;

        if (b.type === 'turret_missile') {
          soundEngine.playMissileLaunch();
          this.projectiles.push({
            id: Math.random().toString(),
            startX: b.pixelX,
            startY: b.pixelY,
            x: b.pixelX,
            y: b.pixelY,
            targetX: target.x,
            targetY: target.y,
            targetUnitId: target.id,
            speed: 360,
            damage: config.damage || 80,
            splashRadius: 30,
            faction: b.faction,
            type: 'missile',
            progress: 0,
          });
        } else if (b.type === 'heavy_turret') {
          soundEngine.playCannonShot();
          this.addScreenShake(0.2);
          this.projectiles.push({
            id: Math.random().toString(),
            startX: b.pixelX,
            startY: b.pixelY,
            x: b.pixelX,
            y: b.pixelY,
            targetX: target.x,
            targetY: target.y,
            targetUnitId: target.id,
            speed: 550,
            damage: config.damage || 130,
            splashRadius: 25,
            faction: b.faction,
            type: 'cannon',
            progress: 0,
          });
        } else {
          soundEngine.playRifleShot();
          this.projectiles.push({
            id: Math.random().toString(),
            startX: b.pixelX,
            startY: b.pixelY,
            x: b.pixelX,
            y: b.pixelY,
            targetX: target.x,
            targetY: target.y,
            targetUnitId: target.id,
            speed: 600,
            damage: config.damage || 30,
            splashRadius: 0,
            faction: b.faction,
            type: 'bullet',
            progress: 0,
          });
        }
      }
    } else {
      b.targetUnitId = undefined;
    }
  }

  // --- Projectiles & Collisions ---
  private updateProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];

      const totalDist = Math.hypot(p.targetX - p.startX, p.targetY - p.startY);
      const step = (p.speed * dt) / Math.max(1, totalDist);
      p.progress += step;

      p.x = p.startX + (p.targetX - p.startX) * Math.min(1, p.progress);
      p.y = p.startY + (p.targetY - p.startY) * Math.min(1, p.progress);

      if (p.progress >= 1.0) {
        this.resolveProjectileImpact(p);
        this.projectiles.splice(i, 1);
      }
    }
  }

  private resolveProjectileImpact(p: Projectile) {
    const isSplash = p.splashRadius > 0;

    if (isSplash) {
      this.particles.push(...createExplosionParticles(p.x, p.y, p.splashRadius > 45));
      soundEngine.playExplosion(p.splashRadius > 45);
      this.addScreenShake(p.splashRadius > 45 ? 0.45 : 0.2);

      this.units.forEach(u => {
        if (u.faction !== p.faction && u.hp > 0) {
          const d = Math.hypot(u.x - p.x, u.y - p.y);
          if (d <= p.splashRadius) {
            const falloff = 1 - (d / p.splashRadius) * 0.5;
            const dmg = calculateDamage(
              p.type,
              'vehicle',
              UNIT_CONFIGS[u.type].category,
              p.damage * falloff,
              u.armor
            );
            u.hp -= dmg;
            if (this.settings.showDamageNumbers) {
              this.floatingTexts.push({
                id: Math.random().toString(),
                x: u.x,
                y: u.y - 12,
                text: `-${dmg}`,
                color: '#ef4444',
                life: 0,
                maxLife: 0.8,
              });
            }
          }
        }
      });

      this.buildings.forEach(b => {
        if (b.faction !== p.faction && b.hp > 0) {
          const d = Math.hypot(b.pixelX - p.x, b.pixelY - p.y);
          if (d <= p.splashRadius + 20) {
            const dmg = calculateDamage(p.type, 'vehicle', 'building', p.damage, b.armor);
            b.hp -= dmg;
          }
        }
      });
    } else {
      if (p.targetUnitId) {
        const u = this.units.find(o => o.id === p.targetUnitId && o.hp > 0);
        if (u) {
          const dmg = calculateDamage(p.type, 'infantry', UNIT_CONFIGS[u.type].category, p.damage, u.armor);
          u.hp -= dmg;
          if (this.settings.showDamageNumbers) {
            this.floatingTexts.push({
              id: Math.random().toString(),
              x: u.x,
              y: u.y - 10,
              text: `-${dmg}`,
              color: '#ef4444',
              life: 0,
              maxLife: 0.7,
            });
          }
        }
      } else if (p.targetBuildingId) {
        const b = this.buildings.find(o => o.id === p.targetBuildingId && o.hp > 0);
        if (b) {
          const dmg = calculateDamage(p.type, 'infantry', 'building', p.damage, b.armor);
          b.hp -= dmg;
        }
      }
    }
  }

  // --- Visual Effects ---
  private updateVisualEffects(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const part = this.particles[i];
      part.life += dt;
      part.x += part.vx * dt;
      part.y += part.vy * dt;
      part.alpha = Math.max(0, 1 - part.life / part.maxLife);
      if (part.life >= part.maxLife) {
        this.particles.splice(i, 1);
      }
    }

    for (let i = this.wreckages.length - 1; i >= 0; i--) {
      const w = this.wreckages[i];
      w.life += dt;
      if (w.life >= w.maxLife) {
        this.wreckages.splice(i, 1);
      }
    }
    if (this.wreckages.length > 20) {
      this.wreckages.splice(0, this.wreckages.length - 20);
    }

    for (let i = this.treadMarks.length - 1; i >= 0; i--) {
      const tm = this.treadMarks[i];
      tm.life += dt;
      if (tm.life >= tm.maxLife) {
        this.treadMarks.splice(i, 1);
      }
    }

    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life += dt;
      if (ft.life >= ft.maxLife) {
        this.floatingTexts.splice(i, 1);
      }
    }

    for (let i = this.pings.length - 1; i >= 0; i--) {
      const ping = this.pings[i];
      ping.life += dt;
      if (ping.life >= ping.maxLife) {
        this.pings.splice(i, 1);
      }
    }
  }

  // --- Economy & Power Grid ---
  private updateEconomy(dt: number) {
    let powerSupply = 0;
    let powerDemand = 0;
    let incomePerSec = 0;
    let bonusPopCap = 50;

    const playerBuildings = this.buildings.filter(b => b.faction === 'player' && b.hp > 0);
    playerBuildings.forEach(b => {
      if (b.constructionProgress >= 1.0) {
        const cfg = BUILDING_CONFIGS[b.type];
        powerSupply += cfg.powerProduced;
        powerDemand += cfg.powerConsumed;
        incomePerSec += cfg.creditsPerSecond;
        if (cfg.popCapBonus) bonusPopCap += cfg.popCapBonus;
      }
    });

    this.economy.powerSupply = powerSupply;
    this.economy.powerDemand = powerDemand;
    this.economy.incomeRate = Math.round(incomePerSec * 60);
    this.economy.populationCap = bonusPopCap;

    this.economy.credits += incomePerSec * dt;

    const friendlyUnits = this.units.filter(u => u.faction === 'player' && u.hp > 0);
    this.economy.population = friendlyUnits.length;
    this.economy.armyStrength = friendlyUnits.reduce((acc, u) => acc + UNIT_CONFIGS[u.type].cost, 0);

    // Research Progress
    if (this.researchInProgress) {
      this.researchInProgress.progress += dt / this.researchInProgress.totalTime;
      if (this.researchInProgress.progress >= 1.0) {
        this.unlockedTechs.add(this.researchInProgress.techId);
        soundEngine.playComplete();
        this.floatingTexts.push({
          id: Math.random().toString(),
          x: this.mapData.playerSpawn.x,
          y: this.mapData.playerSpawn.y - 50,
          text: 'RESEARCH COMPLETE',
          color: '#f59e0b',
          life: 0,
          maxLife: 2.0,
        });
        this.researchInProgress = null;
      }
    }
  }

  // --- Fog of War ---
  private updateFogOfWar() {
    if (!this.settings.fogOfWarEnabled) {
      this.fogGrid.fill(2);
      return;
    }

    const w = this.mapData.width;
    const h = this.mapData.height;
    const ts = this.mapData.tileSize;

    for (let i = 0; i < this.fogGrid.length; i++) {
      if (this.fogGrid[i] === 2) {
        this.fogGrid[i] = 1;
      }
    }

    const reveal = (pixelX: number, pixelY: number, visionRadius: number) => {
      const tileRadius = Math.ceil(visionRadius / ts);
      const centerGX = Math.floor(pixelX / ts);
      const centerGY = Math.floor(pixelY / ts);

      for (let dy = -tileRadius; dy <= tileRadius; dy++) {
        for (let dx = -tileRadius; dx <= tileRadius; dx++) {
          const gx = centerGX + dx;
          const gy = centerGY + dy;
          if (gx >= 0 && gx < w && gy >= 0 && gy < h) {
            if (dx * dx + dy * dy <= tileRadius * tileRadius) {
              this.fogGrid[gy * w + gx] = 2;
            }
          }
        }
      }
    };

    this.units.forEach(u => {
      if (u.faction === 'player' && u.hp > 0) {
        reveal(u.x, u.y, UNIT_CONFIGS[u.type].vision);
      }
    });

    this.buildings.forEach(b => {
      if (b.faction === 'player' && b.hp > 0) {
        const own = BUILDING_CONFIGS[b.type].vision;
        // An online (completed + powered) radar extends what the player can see to its sensor range.
        const radarReach = b.type === 'radar_station' && b.constructionProgress >= 1.0 && this.tacticalIntelligence.radarOperational
          ? this.tacticalIntelligence.radarRange
          : 0;
        reveal(b.pixelX, b.pixelY, Math.max(own, radarReach));
      }
    });
  }

  // --- Base Defense Waves ---
  private updateDefenseWaves(dt: number) {
    this.nextWaveTimer -= dt;
    if (this.nextWaveTimer <= 0) {
      soundEngine.playAlarm();
      const waveCount = 5 + this.defenseWave * 2;
      const waveTypes: UnitType[] =
        this.defenseWave >= 6
          ? ['heavy_tank', 'siege_tank', 'raven_bomber', 'stealth_fighter', 'mlrs', 'attack_helicopter', 'artillery', 'titan_transport']
          : this.defenseWave >= 3
          ? ['main_battle_tank', 'ifv', 'light_tank', 'viper_fighter', 'heavy_gunner', 'rocket_soldier', 'ucav_drone', 'hawk_helicopter']
          : ['rifleman', 'grenadier', 'armored_car', 'heavy_gunner', 'light_tank', 'commando', 'recon_buggy'];

      for (let i = 0; i < waveCount; i++) {
        const uType = waveTypes[Math.floor(Math.random() * waveTypes.length)];
        const spawnX = this.mapData.enemySpawn.x + (Math.random() - 0.5) * 120;
        const spawnY = this.mapData.enemySpawn.y + (Math.random() - 0.5) * 120;
        const u = this.spawnUnit(uType, 'enemy', { x: spawnX, y: spawnY });
        u.command = 'attack_move';
        u.path = this.pathGrid.findPath(u, this.mapData.playerSpawn, UNIT_CONFIGS[u.type].isAir);
      }

      this.floatingTexts.push({
        id: Math.random().toString(),
        x: this.mapData.playerSpawn.x,
        y: this.mapData.playerSpawn.y - 60,
        text: `⚠️ WAVE ${this.defenseWave} INCOMING!`,
        color: '#ef4444',
        life: 0,
        maxLife: 2.5,
      });

      this.defenseWave++;
      this.nextWaveTimer = Math.max(30, 60 - this.defenseWave * 3);
    }
  }

  // --- Match End Conditions ---
  private checkMatchEndConditions() {
    const playerHQ = this.buildings.find(b => b.type === 'headquarters' && b.faction === 'player' && b.hp > 0);
    const playerUnits = this.units.filter(u => u.faction === 'player' && u.hp > 0);

    if (!playerHQ && playerUnits.length === 0) {
      this.gameStatus = 'defeat';
      soundEngine.playAlarm();
      return;
    }

    if (this.mode === 'skirmish' || this.mode === 'custom') {
      const enemyHQ = this.buildings.find(b => b.type === 'headquarters' && b.faction === 'enemy' && b.hp > 0);
      const enemyUnits = this.units.filter(u => u.faction === 'enemy' && u.hp > 0);
      const isVictoryAchieved =
        this.victoryCondition === 'destroy_hq'
          ? !enemyHQ
          : !enemyHQ && enemyUnits.length === 0;
      if (isVictoryAchieved) {
        this.gameStatus = 'victory';
        soundEngine.playComplete();
      }
    } else if (this.mode === 'campaign' && this.currentMission) {
      const hasPower = this.buildings.some(b => b.type === 'power_plant' && b.faction === 'player' && b.hp > 0);
      const hasBarracks = this.buildings.some(b => b.type === 'barracks' && b.faction === 'player' && b.hp > 0);
      const infantryCount = this.units.filter(u => u.faction === 'player' && UNIT_CONFIGS[u.type].category === 'infantry').length;
      const enemyHQ = this.buildings.find(b => b.type === 'headquarters' && b.faction === 'enemy' && b.hp > 0);
      const enemyUnits = this.units.filter(u => u.faction === 'enemy' && u.hp > 0);

      this.currentMission.objectives.forEach(obj => {
        if (obj.id === 'build_power' && hasPower) obj.completed = true;
        if (obj.id === 'build_barracks' && hasBarracks) obj.completed = true;
        if (obj.id === 'recruit_squad' && infantryCount >= 6) obj.completed = true;
        if (obj.id === 'destroy_enemy' && !enemyHQ && enemyUnits.length === 0) obj.completed = true;
        if (obj.id === 'destroy_hq' && !enemyHQ) obj.completed = true;
      });

      const allDone = this.currentMission.objectives.every(o => o.completed);
      if (allDone) {
        this.gameStatus = 'victory';
        soundEngine.playComplete();
      }
    }
  }

  // --- Public Player Actions ---

  public spawnUnit(type: UnitType, faction: Faction, pos: Vector2): Unit {
    const config = UNIT_CONFIGS[type];
    const unit: Unit = {
      id: `${faction}_${type}_${Math.random().toString(36).substring(2, 9)}`,
      type,
      faction,
      x: pos.x,
      y: pos.y,
      rotation: faction === 'player' ? -Math.PI / 4 : (3 * Math.PI) / 4,
      turretRotation: config.category === 'vehicle' ? (faction === 'player' ? -Math.PI / 4 : (3 * Math.PI) / 4) : undefined,
      altitude: config.isAir ? (type === 'recon_drone' ? 45 : type === 'attack_helicopter' ? 55 : 75) : 0,
      hp: config.maxHp,
      maxHp: config.maxHp,
      armor: config.armor,
      kills: 0,
      rank: 0,
      stance: 'aggressive',
      command: 'idle',
      lastAttackTime: 0,
      selected: false,
      path: [],
      speed: config.speed,
      isMoving: false,
      isAttacking: false,
      abilityCooldown: 0,
      homePosition: { x: pos.x, y: pos.y },
      isDefendingZone: false,
    };

    this.units.push(unit);
    return unit;
  }

  public canPlaceBuilding(
    type: BuildingType,
    gridX: number,
    gridY: number,
    faction: Faction = 'player',
    ignoreBuildingId?: string,
    rotation: number = 0,
    ignoreFunds: boolean = false // site-only check (used by Construction AI, which handles funds itself)
  ): { valid: boolean; reason?: string } {
    const config = BUILDING_CONFIGS[type];
    const isRotated = rotation === 90 || rotation === 270;
    const bw = isRotated ? config.size.height : config.size.width;
    const bh = isRotated ? config.size.width : config.size.height;
    const ts = this.mapData.tileSize;

    // 1. Map bounds check (ensure building fits inside playable map)
    if (gridX < 0 || gridX + bw > this.mapData.width || gridY < 0 || gridY + bh > this.mapData.height) {
      return { valid: false, reason: 'Beyond battlefield operational perimeter' };
    }

    // 2. Resource deposit clearance (cannot build directly on top of titanium crystal fields)
    for (const node of this.mapData.resourceNodes) {
      if (node.x >= gridX && node.x < gridX + bw && node.y >= gridY && node.y < gridY + bh) {
        return { valid: false, reason: 'Obstructed by Titanium Crystal deposit' };
      }
    }

    // 3. Terrain walkability clearance (water and boundary cliffs only)
    for (let dy = 0; dy < bh; dy++) {
      for (let dx = 0; dx < bw; dx++) {
        const tx = gridX + dx;
        const ty = gridY + dy;
        const tileType = this.mapData.tiles[ty]?.[tx] ?? 0;
        if (tileType === 3) {
          return { valid: false, reason: 'Cannot construct on water/ice' };
        }
        if (tileType === 4) {
          return { valid: false, reason: 'Cannot construct on rocky cliff face' };
        }
      }
    }

    // 4. Ground unit collision check (cannot place building directly on top of mobile troops)
    const minPxX = gridX * ts;
    const maxPxX = (gridX + bw) * ts;
    const minPxY = gridY * ts;
    const maxPxY = (gridY + bh) * ts;
    for (const u of this.units) {
      if (u.hp > 0 && !UNIT_CONFIGS[u.type].isAir) {
        if (u.x >= minPxX && u.x <= maxPxX && u.y >= minPxY && u.y <= maxPxY) {
          return { valid: false, reason: 'Site obstructed by military units (move troops away)' };
        }
      }
    }

    // 5. Existing building footprint overlap & 1-tile clearance check
    for (const b of this.buildings) {
      if (b.hp <= 0 || b.id === ignoreBuildingId) continue;

      // Direct footprint overlap check (strict collision prevention)
      const overlaps =
        gridX < b.x + b.width &&
        gridX + bw > b.x &&
        gridY < b.y + b.height &&
        gridY + bh > b.y;
      if (overlaps) {
        return { valid: false, reason: 'Overlaps existing structure' };
      }
    }

    // 5b. Exit Doorway Clearance Check (for production structures: barracks, factory, hospital, airfield)
    if (type === 'barracks' || type === 'vehicle_factory' || type === 'field_hospital' || type === 'airfield') {
      const exitGy = gridY + bh;
      let hasClearExit = false;
      for (let dx = 0; dx < bw; dx++) {
        const exitGx = gridX + dx;
        if (exitGy < this.mapData.height && exitGx >= 0 && exitGx < this.mapData.width) {
          const tile = this.mapData.tiles[exitGy]?.[exitGx] ?? 0;
          const blockedByTerrain = tile === 3 || tile === 4;
          const blockedByBuilding = this.buildings.some(
            b => b.hp > 0 && b.id !== ignoreBuildingId &&
            exitGx >= b.x && exitGx < b.x + b.width &&
            exitGy >= b.y && exitGy < b.y + b.height
          );
          if (!blockedByTerrain && !blockedByBuilding) {
            hasClearExit = true;
            break;
          }
        }
      }
      if (!hasClearExit && exitGy < this.mapData.height) {
        return { valid: false, reason: 'Southern unit departure doorway obstructed by obstacles' };
      }
    }

    // 6. Player construction range check (must be within construction radius of friendly HQ or buildings)
    if (faction === 'player' && this.mode !== 'sandbox') {
      const friendlyBuildings = this.buildings.filter(b => b.faction === 'player' && b.hp > 0);
      if (friendlyBuildings.length > 0) {
        const buildRadius = 18; // 18 tiles construction envelope
        const isNearBase = friendlyBuildings.some(b => {
          const cDist = Math.hypot(b.x + b.width / 2 - (gridX + bw / 2), b.y + b.height / 2 - (gridY + bh / 2));
          return cDist <= buildRadius;
        });
        if (!isNearBase) {
          return { valid: false, reason: 'Outside base construction field (build closer to base)' };
        }
      }
    }

    // 7. Resource affordability check
    if (!ignoreFunds && faction === 'player' && this.economy.credits < config.cost) {
      return { valid: false, reason: `Insufficient funds (Requires $${config.cost.toLocaleString()})` };
    }

    return { valid: true };
  }

  public placeBuilding(
    type: BuildingType,
    gridX: number,
    gridY: number,
    faction: Faction = 'player',
    rotation: number = 0
  ): Building | null {
    const config = BUILDING_CONFIGS[type];
    const isRotated = rotation === 90 || rotation === 270;
    const bw = isRotated ? config.size.height : config.size.width;
    const bh = isRotated ? config.size.width : config.size.height;
    const ts = this.mapData.tileSize;

    // Strict Placement Validation
    const check = this.canPlaceBuilding(type, gridX, gridY, faction, undefined, rotation);
    if (!check.valid) {
      soundEngine.playError();
      return null;
    }

    const pixelX = gridX * ts + (bw * ts) / 2;
    const pixelY = gridY * ts + (bh * ts) / 2;

    if (faction === 'player') {
      this.economy.credits -= config.cost;
      soundEngine.playBuildPlace();
    }

    const building: Building = {
      id: `${faction}_${type}_${Math.random().toString(36).substring(2, 9)}`,
      type,
      faction,
      x: gridX,
      y: gridY,
      pixelX,
      pixelY,
      width: bw,
      height: bh,
      hp: config.maxHp,
      maxHp: config.maxHp,
      armor: config.armor,
      level: 1,
      constructionProgress: 0.05,
      isUnderConstruction: true,
      isRepairing: false,
      productionQueue: [],
      rallyPoint: { x: pixelX + 60, y: pixelY + 60 },
      lastAttackTime: 0,
      selected: false,
      rotation,
    };

    this.buildings.push(building);
    this.pathGrid.rebuild(this.mapData, this.buildings);
    return building;
  }

  // Auto Place: One-tap intelligent automatic construction at optimal site
  public autoPlaceBuilding(type: BuildingType, rotation: number = 0): Building | null {
    const recs = this.getRecommendedBuildingPositions(type, rotation);
    if (recs.length === 0) {
      soundEngine.playError();
      return null;
    }
    const best = recs[0];
    const placed = this.placeBuilding(type, best.gridX, best.gridY, 'player', rotation);
    if (placed) {
      this.floatingTexts.push({
        id: Math.random().toString(),
        x: placed.pixelX,
        y: placed.pixelY - 28,
        text: `AUTO PLACED (${best.score}% OPTIMAL)`,
        color: '#10b981',
        life: 0,
        maxLife: 2.0,
      });
    }
    return placed;
  }

  // --- Rally Point Configuration ---
  public setBuildingRallyPoint(buildingId: string, worldPos: Vector2) {
    const b = this.buildings.find(o => o.id === buildingId);
    if (b) {
      b.rallyPoint = { x: worldPos.x, y: worldPos.y };
      soundEngine.playCommandAffirmative();
      this.pings.push({
        id: Math.random().toString(),
        x: worldPos.x,
        y: worldPos.y,
        color: '#F2B84B',
        life: 0,
        maxLife: 1.2,
        label: 'RALLY POINT SET',
      });
    }
  }

  // --- Intelligent Building Placement Assistant ---
  public getRecommendedBuildingPositions(
    type: BuildingType,
    rotation: number = 0,
    opts?: { limit?: number; reserved?: { x: number; y: number; w: number; h: number }[]; margin?: number; ignoreFunds?: boolean }
  ): BuildingPlacementRecommendation[] {
    const recommendations: BuildingPlacementRecommendation[] = [];
    const hq = this.buildings.find(b => b.type === 'headquarters' && b.faction === 'player');
    const playerBuildings = this.buildings.filter(b => b.faction === 'player' && b.hp > 0);
    if (!hq && playerBuildings.length === 0) return recommendations;

    const config = BUILDING_CONFIGS[type];
    const isRotated = rotation === 90 || rotation === 270;
    const bw = isRotated ? config.size.height : config.size.width;
    const bh = isRotated ? config.size.width : config.size.height;

    const anchorX = hq ? hq.x + Math.floor(hq.width / 2) : playerBuildings[0].x;
    const anchorY = hq ? hq.y + Math.floor(hq.height / 2) : playerBuildings[0].y;
    const isDefense = type === 'turret_gun' || type === 'turret_missile' || type === 'turret_aa' || type === 'heavy_turret' || type === 'defense_wall';
    const isPower = type === 'power_plant';
    const isRefinery = type === 'coin_generator';
    const isProduction = type === 'barracks' || type === 'vehicle_factory' || type === 'helipad' || type === 'airfield';

    // Enemy direction or map center direction
    const enemyHQ = this.buildings.find(b => b.type === 'headquarters' && b.faction === 'enemy');
    const targetThreatX = enemyHQ ? enemyHQ.x : Math.floor(this.mapData.width / 2);
    const targetThreatY = enemyHQ ? enemyHQ.y : Math.floor(this.mapData.height / 2);
    const threatAngle = Math.atan2(targetThreatY - anchorY, targetThreatX - anchorX);

    const candidates: {
      x: number;
      y: number;
      score: number;
      label: 'RECOMMENDED' | 'ALTERNATIVE' | 'EXPANSION';
      reason: string;
      advantage: string;
      disadvantage: string;
      distanceToHQ: number;
    }[] = [];

    const minR = isDefense ? 5 : 2;
    const maxR = isDefense ? 15 : 12;

    for (let r = minR; r <= maxR; r += 2) {
      const stepAngle = Math.PI / 8;
      for (let a = 0; a < Math.PI * 2; a += stepAngle) {
        const testGx = Math.round(anchorX + Math.cos(a) * r);
        const testGy = Math.round(anchorY + Math.sin(a) * r);

        const check = this.canPlaceBuilding(type, testGx, testGy, 'player', undefined, rotation, opts?.ignoreFunds ?? false);
        if (!check.valid) continue;
        // Sites already promised to other (not yet started) construction projects are off limits.
        if (opts?.reserved) {
          const mg = opts.margin ?? 0;
          if (opts.reserved.some(r => testGx < r.x + r.w + mg && testGx + bw + mg > r.x && testGy < r.y + r.h + mg && testGy + bh + mg > r.y)) continue;
        }

        let score = 55;
        let label: 'RECOMMENDED' | 'ALTERNATIVE' | 'EXPANSION' = 'RECOMMENDED';
        let reason = 'Balanced base grid connection';
        let advantage = 'Solid structural anchor within base operational shield';
        let disadvantage = 'Standard transit distance from core production lines';

        const angleDiff = Math.abs(Math.atan2(Math.sin(a - threatAngle), Math.cos(a - threatAngle)));
        const distToHQ = Math.round(Math.hypot(testGx - anchorX, testGy - anchorY));

        if (isDefense) {
          score += (Math.PI - angleDiff) * 32;
          if (r >= 7 && r <= 12) score += 20;
          if (angleDiff < Math.PI / 4) {
            label = 'RECOMMENDED';
            reason = 'Optimal forward choke point defense';
            advantage = 'Interlocks firing arcs to intercept incoming armored hostiles before they breach the base';
            disadvantage = 'Slightly exposed beyond immediate repair drone tether range';
          } else if (angleDiff < Math.PI / 2) {
            label = 'ALTERNATIVE';
            reason = 'Flank security coverage';
            advantage = 'Prevents hostile reconnaissance raids and flanking armor maneuvers';
            disadvantage = 'Less concentrated firepower along the primary invasion corridor';
          } else {
            label = 'EXPANSION';
            reason = 'Rear base perimeter safeguard';
            advantage = 'Guards rear power reactors and logistics silos against air drops';
            disadvantage = 'Will remain dormant unless hostiles penetrate the front line';
          }
        } else if (isPower) {
          score += angleDiff * 26; // Safe rear
          if (r <= 6) score += 24;
          if (angleDiff > Math.PI * 0.55) {
            label = 'RECOMMENDED';
            reason = 'Sheltered rear interior';
            advantage = 'Protected behind command citadel away from direct ballistic and artillery fire';
            disadvantage = 'Consumes valuable central real estate near headquarters';
          } else {
            label = 'ALTERNATIVE';
            reason = 'Secondary power distribution sector';
            advantage = 'Leaves central staging grounds open for large vehicle factories';
            disadvantage = 'Closer to peripheral perimeter defensive line';
          }
        } else if (isRefinery) {
          let nearestResourceDist = 999;
          this.mapData.resourceNodes.forEach(rn => {
            const d = Math.hypot(rn.x - testGx, rn.y - testGy);
            if (d < nearestResourceDist) nearestResourceDist = d;
          });
          score += Math.max(0, 45 - nearestResourceDist * 2.8);
          if (nearestResourceDist <= 9) {
            label = 'RECOMMENDED';
            reason = 'Close proximity to Titanium resource field';
            advantage = 'Minimizes haulage transit distance for maximum continuous credit income rate';
            disadvantage = 'Exposed toward forward contested territory';
          } else {
            label = 'ALTERNATIVE';
            reason = 'Secondary logistics storage depot';
            advantage = 'Safe distance from hostile scout skirmish paths';
            disadvantage = 'Longer travel times slightly reduce mining throughput efficiency';
          }
        } else if (isProduction) {
          score += (Math.PI - angleDiff) * 14;
          if (r >= 4 && r <= 8) score += 22;
          if (r <= 6) {
            label = 'RECOMMENDED';
            reason = 'Direct troop exit to frontline';
            advantage = 'Unobstructed southern departure gates allowing rapid rally dispatch to the front';
            disadvantage = 'Requires continuous power grid availability to avoid production bottlenecks';
          } else {
            label = 'EXPANSION';
            reason = 'Forward staging assembly yard';
            advantage = 'Positions heavy armor factories closer to contested bridges';
            disadvantage = 'Demands dedicated turret defenses to prevent early sabotage';
          }
        }

        const tooCloseToOthers = candidates.some(c => Math.hypot(c.x - testGx, c.y - testGy) < 3.2);
        if (!tooCloseToOthers) {
          candidates.push({
            x: testGx,
            y: testGy,
            score: Math.min(98, Math.max(45, Math.round(score))),
            label,
            reason,
            advantage,
            disadvantage,
            distanceToHQ: distToHQ,
          });
        }
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    const top = candidates.slice(0, opts?.limit ?? 3);
    if (top.length >= 1) top[0].label = 'RECOMMENDED';
    if (top.length >= 2) top[1].label = 'ALTERNATIVE';
    if (top.length >= 3) top[2].label = 'EXPANSION';

    return top.map(c => ({
      gridX: c.x,
      gridY: c.y,
      score: c.score,
      label: c.label,
      reason: c.reason,
      advantage: c.advantage,
      disadvantage: c.disadvantage,
      footprint: { width: bw, height: bh },
      distanceToHQ: c.distanceToHQ,
    }));
  }

  // --- Base Layout Intelligence Analysis ---
  public getBaseIntelligenceReport(planningStyle: 'balanced' | 'defensive' | 'offensive' = this.basePlanningStyle): BaseIntelligenceReport {
    const playerBuildings = this.buildings.filter(b => b.faction === 'player' && b.hp > 0);
    const powerProduced = this.economy.powerSupply;
    const powerDemand = this.economy.powerDemand;
    const powerDelta = powerProduced - powerDemand;

    const defenseBuildings = playerBuildings.filter(b =>
      b.type === 'turret_gun' || b.type === 'turret_missile' || b.type === 'turret_aa' || b.type === 'heavy_turret' || b.type === 'defense_wall'
    );
    const radar = playerBuildings.find(b => b.type === 'radar_station');
    const factories = playerBuildings.filter(b =>
      b.type === 'barracks' || b.type === 'vehicle_factory' || b.type === 'helipad' || b.type === 'airfield'
    );

    let powerStatus: 'optimal' | 'stable' | 'deficit' = 'optimal';
    if (powerDelta < 0) powerStatus = 'deficit';
    else if (powerDelta < 40) powerStatus = 'stable';

    const defenseScore = Math.min(100, defenseBuildings.length * 20);
    const factoryScore = Math.min(100, factories.length * 25);
    const radarScore = radar ? 100 : 0;

    const integrityScore = Math.round(
      (powerStatus === 'deficit' ? 25 : powerStatus === 'stable' ? 65 : 95) * 0.35 +
      defenseScore * 0.3 +
      factoryScore * 0.25 +
      radarScore * 0.1
    );

    const recommendations: BaseIntelligenceReport['recommendations'] = [];

    if (powerDelta < 0) {
      recommendations.push({
        type: 'power',
        title: 'CRITICAL POWER DEFICIT',
        description: `Base requires ${Math.abs(powerDelta)} additional megawatts. Construct a Fusion Reactor immediately to restore turret defenses and factory speed.`,
        severity: 'critical',
      });
    } else if (powerDelta < 35) {
      recommendations.push({
        type: 'power',
        title: 'LOW POWER RESERVE',
        description: `Power reserve is tight (+${powerDelta} PWR). Additional military facilities will brownout the grid.`,
        severity: 'warning',
      });
    }

    if (defenseBuildings.length < 2) {
      recommendations.push({
        type: 'defense',
        title: 'PERIMETER DEFENSE EXPOSURE',
        description: 'HQ lacks automated perimeter defense turrets against hostile vehicle incursions. Deploy Vulcan Turrets or Missile Batteries along approach routes.',
        severity: planningStyle === 'defensive' ? 'critical' : 'warning',
      });
    }

    if (!radar) {
      recommendations.push({
        type: 'radar',
        title: 'RADAR SURVEILLANCE OFFLINE',
        description: 'Deploy a Radar & Sensor Dish to reveal enemy army movements on the tactical minimap and eliminate fog of war blinds.',
        severity: 'info',
      });
    }

    if (factories.length === 0) {
      recommendations.push({
        type: 'production',
        title: 'NO ACTIVE UNIT PRODUCTION',
        description: 'Construct an Infantry Academy or War Factory to recruit combat forces.',
        severity: 'critical',
      });
    }

    return {
      integrityScore,
      planningStyle,
      powerStatus,
      powerDelta,
      defensiveCoverageScore: defenseScore,
      factoryThroughputScore: factoryScore,
      radarCoverageScore: radarScore,
      recommendations,
    };
  }

  // --- SYSTEM 1: INTELLIGENT RADAR & AUTOMATIC BASE DEFENSE ARCHITECTURE ---

  public initDefenseZones(hqPos: Vector2) {
    this.tacticalIntelligence.defenseZones = [
      {
        id: 'zone_hq',
        name: 'Command HQ Citadel',
        type: 'hq',
        center: { x: hqPos.x, y: hqPos.y },
        radius: 340,
        assignedUnitIds: [],
        threatLevel: 'GREEN',
        color: '#38bdf8',
      },
      {
        id: 'zone_factory',
        name: 'Industrial Assembly Sector',
        type: 'factory',
        center: { x: hqPos.x + 160, y: hqPos.y + 70 },
        radius: 300,
        assignedUnitIds: [],
        threatLevel: 'GREEN',
        color: '#f59e0b',
      },
      {
        id: 'zone_power',
        name: 'Power Grid Infrastructure',
        type: 'power',
        center: { x: hqPos.x - 140, y: hqPos.y + 110 },
        radius: 260,
        assignedUnitIds: [],
        threatLevel: 'GREEN',
        color: '#10b981',
      },
      {
        id: 'zone_perimeter',
        name: 'Outer Defensive Perimeter',
        type: 'perimeter',
        center: { x: hqPos.x, y: hqPos.y },
        radius: 650,
        assignedUnitIds: [],
        threatLevel: 'GREEN',
        color: '#ef4444',
      },
      {
        id: 'zone_resource',
        name: 'Titanium Resource Outpost',
        type: 'resource',
        center: { x: hqPos.x + 80, y: hqPos.y - 180 },
        radius: 280,
        assignedUnitIds: [],
        threatLevel: 'GREEN',
        color: '#a855f7',
      },
    ];
  }

  public addStrategicLogEntry(text: string, level: 'info' | 'warning' | 'critical' | 'success') {
    const entry: StrategicLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      time: this.gameTime,
      text,
      level,
    };
    this.tacticalIntelligence.strategicLog.unshift(entry);
    if (this.tacticalIntelligence.strategicLog.length > 50) {
      this.tacticalIntelligence.strategicLog.pop();
    }
  }

  public updateRadarAndThreatIntelligence(dt: number) {
    const playerBuildings = this.buildings.filter(b => b.faction === 'player' && b.hp > 0);
    const playerHq = playerBuildings.find(b => b.type === 'headquarters');
    const radar = playerBuildings.find(b => b.type === 'radar_station' && b.constructionProgress >= 1.0);
    const hasPower = this.economy.powerSupply >= this.economy.powerDemand;

    // Radar operational check
    const isRadarOnline = Boolean(radar && hasPower);
    const prevRadarStatus = this.tacticalIntelligence.radarOperational;
    this.tacticalIntelligence.radarOperational = isRadarOnline;
    this.tacticalIntelligence.radarRange = isRadarOnline ? 850 : 420;

    // Log radar power status changes
    if (prevRadarStatus !== isRadarOnline) {
      if (isRadarOnline) {
        this.addStrategicLogEntry('Radar Station Online: Long-range early warning sensors active (850m radius).', 'info');
      } else if (radar && !hasPower) {
        this.addStrategicLogEntry('Radar Station Offline: Power grid deficit! Sensor coverage degraded to optical baseline.', 'warning');
      } else {
        this.addStrategicLogEntry('Radar Station Lost: Construct a Radar Station to re-enable tactical surveillance.', 'warning');
      }
    }

    const hqPos = playerHq ? { x: playerHq.pixelX, y: playerHq.pixelY } : this.mapData.playerSpawn;

    if (this.tacticalIntelligence.defenseZones.length === 0) {
      this.initDefenseZones(hqPos);
    } else {
      const hqZone = this.tacticalIntelligence.defenseZones.find(z => z.type === 'hq');
      if (hqZone) hqZone.center = hqPos;
      const perimeterZone = this.tacticalIntelligence.defenseZones.find(z => z.type === 'perimeter');
      if (perimeterZone) perimeterZone.center = hqPos;

      // Update factory zone center if factories exist
      const factoryB = playerBuildings.find(b => b.type === 'vehicle_factory' || b.type === 'barracks');
      if (factoryB) {
        const factoryZone = this.tacticalIntelligence.defenseZones.find(z => z.type === 'factory');
        if (factoryZone) factoryZone.center = { x: factoryB.pixelX, y: factoryB.pixelY };
      }

      // Update power zone center if power plants exist
      const powerB = playerBuildings.find(b => b.type === 'power_plant');
      if (powerB) {
        const powerZone = this.tacticalIntelligence.defenseZones.find(z => z.type === 'power');
        if (powerZone) powerZone.center = { x: powerB.pixelX, y: powerB.pixelY };
      }
    }

    // Scan enemy units with line-of-sight & stealth detection
    const enemyUnits = this.units.filter(u => u.faction === 'enemy' && u.hp > 0);
    const detectedList: DetectedThreat[] = [];

    enemyUnits.forEach(enemy => {
      // Fog-of-war rule: sensors may not reveal enemies that the player's fog still hides
      // (otherwise warnings and the Defense AI react to units the minimap does not show).
      if (this.settings.fogOfWarEnabled) {
        const fgx = Math.floor(enemy.x / this.mapData.tileSize);
        const fgy = Math.floor(enemy.y / this.mapData.tileSize);
        if (this.fogGrid[fgy * this.mapData.width + fgx] !== 2) return;
      }
      const distToHQ = getDistance(enemy, hqPos);
      const distToRadar = radar ? getDistance(enemy, { x: radar.pixelX, y: radar.pixelY }) : distToHQ;

      // Stealth rules: stealth fighters reduce radar cross-section by 60%
      const isStealth = enemy.type === 'stealth_fighter';
      const effectiveSensorRange = isStealth
        ? (isRadarOnline ? 380 : 200)
        : this.tacticalIntelligence.radarRange;

      let detected = distToHQ <= effectiveSensorRange || distToRadar <= effectiveSensorRange;

      // Line of sight vision from any player building or unit
      if (!detected) {
        for (const b of playerBuildings) {
          const bVision = BUILDING_CONFIGS[b.type]?.vision || 260;
          if (getDistance(enemy, { x: b.pixelX, y: b.pixelY }) <= bVision) {
            detected = true;
            break;
          }
        }
      }
      if (!detected) {
        const playerScouts = this.units.filter(u => u.faction === 'player' && (u.type === 'scout' || u.type === 'recon_drone'));
        for (const s of playerScouts) {
          const sVision = UNIT_CONFIGS[s.type]?.vision || 320;
          if (getDistance(enemy, s) <= sVision) {
            detected = true;
            break;
          }
        }
      }

      if (detected) {
        // Approaching velocity check
        const toHQX = hqPos.x - enemy.x;
        const toHQY = hqPos.y - enemy.y;
        const curSpd = enemy.currentSpeed || enemy.speed || 1;
        const velX = Math.cos(enemy.rotation) * curSpd;
        const velY = Math.sin(enemy.rotation) * curSpd;
        const dot = (velX * toHQX + velY * toHQY) / (Math.hypot(toHQX, toHQY) || 1);
        const isApproaching = dot > 0.45 && distToHQ < 950;

        // Threat Score calculation
        const cfg = UNIT_CONFIGS[enemy.type];
        let baseScore = cfg.isAir ? 65 : cfg.category === 'vehicle' ? 55 : 25;
        if (enemy.type === 'heavy_tank' || enemy.type === 'siege_tank' || enemy.type === 'artillery') baseScore += 25;
        const proximityBonus = Math.max(0, (1 - distToHQ / 950) * 45);
        const approachBonus = isApproaching ? 20 : 0;
        const threatScore = Math.round(baseScore + proximityBonus + approachBonus);

        // Threatened zone matching
        let threatenedZoneId: string | undefined;
        for (const zone of this.tacticalIntelligence.defenseZones) {
          if (getDistance(enemy, zone.center) <= zone.radius) {
            threatenedZoneId = zone.id;
            break;
          }
        }

        const existing = this.tacticalIntelligence.activeThreats.find(t => t.targetId === enemy.id);
        detectedList.push({
          id: `threat_${enemy.id}`,
          targetId: enemy.id,
          unitType: enemy.type,
          category: cfg.isAir ? 'aircraft' : cfg.category === 'vehicle' ? 'vehicle' : 'infantry',
          position: { x: enemy.x, y: enemy.y },
          lastKnownVelocity: { x: velX, y: velY },
          confidence: 1.0,
          firstSeenTime: existing ? existing.firstSeenTime : this.gameTime,
          lastSeenTime: this.gameTime,
          threatScore,
          isApproaching,
          threatenedZoneId,
          distanceToHQ: distToHQ,
        });
      }
    });

    this.tacticalIntelligence.activeThreats = detectedList;

    // Automatic Threat Classification with hysteresis & cooldowns
    let targetAlert: ThreatLevel = 'GREEN';
    const isAttackingBase = enemyUnits.some(e => e.targetBuildingId && playerBuildings.some(b => b.id === e.targetBuildingId));
    const closeHostiles = detectedList.some(t => t.distanceToHQ < 340 || (t.threatenedZoneId && t.threatScore > 75));
    const midHostiles = detectedList.some(t => t.distanceToHQ < 600 || (t.isApproaching && t.threatScore > 50));
    const anyHostiles = detectedList.length > 0;

    if (isAttackingBase || closeHostiles) {
      targetAlert = 'RED';
    } else if (midHostiles) {
      targetAlert = 'ORANGE';
    } else if (anyHostiles) {
      targetAlert = 'YELLOW';
    } else {
      targetAlert = 'GREEN';
    }

    const currentAlert = this.tacticalIntelligence.threatLevel;
    const severityMap: Record<ThreatLevel, number> = { GREEN: 0, YELLOW: 1, ORANGE: 2, RED: 3 };

    if (severityMap[targetAlert] > severityMap[currentAlert]) {
      // Instant Escalation
      this.tacticalIntelligence.threatLevel = targetAlert;
      this.tacticalIntelligence.threatLevelTime = this.gameTime;
      const logSeverity = targetAlert === 'RED' ? 'critical' : 'warning';
      const msg =
        targetAlert === 'RED'
          ? `CRITICAL ALERT [RED]: Strategic perimeter breached! Base under direct attack by ${detectedList.length} hostile units!`
          : targetAlert === 'ORANGE'
          ? `HIGH ALERT [ORANGE]: Armed enemy force approaching defensive zones. Readiness mobilized.`
          : `SUSPICIOUS [YELLOW]: Enemy reconnaissance scout detected near outer perimeter.`;
      this.addStrategicLogEntry(msg, logSeverity);

      if (this.tacticalIntelligence.settings.alertSoundEnabled && this.gameTime - this.tacticalIntelligence.lastAlertSoundTime > 6) {
        if (targetAlert !== 'GREEN') {
          soundEngine.playThreatWarning(targetAlert);
        }
        this.tacticalIntelligence.lastAlertSoundTime = this.gameTime;
      }
    } else if (severityMap[targetAlert] < severityMap[currentAlert]) {
      // De-escalation hysteresis cooldown: require 3.5 seconds of sustained lower threat
      if (this.gameTime - this.tacticalIntelligence.threatLevelTime > 3.5) {
        this.tacticalIntelligence.threatLevel = targetAlert;
        this.tacticalIntelligence.threatLevelTime = this.gameTime;
        if (targetAlert === 'GREEN') {
          this.addStrategicLogEntry('Threat resolved. All defensive sectors secure. Returning to NORMAL (GREEN).', 'success');
        }
      }
    }

    // Update zone threat levels
    this.tacticalIntelligence.defenseZones.forEach(zone => {
      const zoneThreats = detectedList.filter(t => t.threatenedZoneId === zone.id);
      if (zoneThreats.some(t => t.threatScore > 80)) zone.threatLevel = 'RED';
      else if (zoneThreats.length > 0) zone.threatLevel = 'ORANGE';
      else zone.threatLevel = 'GREEN';
    });
  }

  public updateAutomaticBaseDefense(dt: number) {
    if (!this.tacticalIntelligence.settings.autoDefenseEnabled) return;
    if (this.tacticalIntelligence.settings.defensePolicy === 'alert_only') return;

    const threats = this.tacticalIntelligence.activeThreats;
    const playerUnits = this.units.filter(u => u.faction === 'player' && u.hp > 0);
    const playerBuildings = this.buildings.filter(b => b.faction === 'player' && b.hp > 0);
    const repairBay = playerBuildings.find(b => b.type === 'repair_bay');
    const hq = playerBuildings.find(b => b.type === 'headquarters');

    // If no threats are present, return units to their home positions after cooldown
    if (threats.length === 0 && this.tacticalIntelligence.threatLevel === 'GREEN') {
      playerUnits.forEach(u => {
        if (u.isDefendingZone) {
          // Manual orders always take absolute priority
          if (u.manualOrderTime && this.gameTime - u.manualOrderTime < 15) return;

          if (u.homePosition && getDistance(u, u.homePosition) > 40) {
            u.command = 'move';
            u.targetX = u.homePosition.x;
            u.targetY = u.homePosition.y;
            u.path = this.pathGrid.findPath(u, u.homePosition, UNIT_CONFIGS[u.type].isAir);
          } else {
            // Already near home: cancel the stale defensive order, otherwise the unit keeps walking out
            // to the old threat position and is stranded there (units were left idle 150px+ from home).
            u.command = 'idle';
            u.path = [];
            u.targetUnitId = undefined;
            u.targetBuildingId = undefined;
          }
          u.isDefendingZone = false;
        }
      });
      return;
    }

    // Separate threats by class
    const airThreats = threats.filter(t => t.category === 'aircraft');
    const armorThreats = threats.filter(t => t.category === 'vehicle');
    const generalThreats = threats;

    // Filter units that can respond
    const eligibleDefenders = playerUnits.filter(u => {
      // 1. Never override recent manual player orders (Scenario F)
      if (u.manualOrderTime && this.gameTime - u.manualOrderTime < 15) return false;
      // 2. Units currently retreating to repair
      if (u.hp < u.maxHp * this.tacticalIntelligence.settings.retreatThresholdHp) {
        const safeHaven = repairBay || hq;
        if (safeHaven && !u.isMoving) {
          const safePos = { x: safeHaven.pixelX + 60, y: safeHaven.pixelY + 60 };
          u.command = 'move';
          u.targetX = safePos.x;
          u.targetY = safePos.y;
          u.path = this.pathGrid.findPath(u, safePos, UNIT_CONFIGS[u.type].isAir);
        }
        return false;
      }
      return true;
    });

    // Reserve army threshold: reserve nearest % of units around HQ
    const hqPos = hq ? { x: hq.pixelX, y: hq.pixelY } : this.mapData.playerSpawn;
    eligibleDefenders.sort((a, b) => getDistance(a, hqPos) - getDistance(b, hqPos));
    const reserveCount = Math.floor(eligibleDefenders.length * (this.tacticalIntelligence.settings.reserveArmyPct / 100));
    
    // Only deploy reserve if HQ itself is in critical RED status
    const deployableDefenders =
      this.tacticalIntelligence.threatLevel === 'RED'
        ? eligibleDefenders
        : eligibleDefenders.slice(reserveCount);

    const maxChase = this.tacticalIntelligence.settings.maxChaseDistance;

    deployableDefenders.forEach(u => {
      const cfg = UNIT_CONFIGS[u.type];

      // Support units: Medics & Engineers auto-repair / heal
      if (u.type === 'medic' || u.type === 'engineer') {
        if (this.tacticalIntelligence.settings.autoRepairEnabled) {
          const damagedBuilding = playerBuildings.find(b => b.hp < b.maxHp * 0.85);
          if (damagedBuilding && !u.isAttacking) {
            u.command = 'repair';
            u.path = this.pathGrid.findPath(u, { x: damagedBuilding.pixelX, y: damagedBuilding.pixelY }, false);
            u.isDefendingZone = true;
          }
        }
        return;
      }

      // Anti-Air defenders prioritize hostile aircraft (Scenario C)
      if ((u.type === 'mobile_sam' || u.type === 'aa_vehicle') && airThreats.length > 0) {
        const closestAir = airThreats.reduce((prev, curr) => (curr.distanceToHQ < prev.distanceToHQ ? curr : prev));
        const dist = getDistance(u, closestAir.position);
        if (dist > cfg.range * 0.8 && dist <= maxChase + cfg.range) {
          u.command = 'attack_move';
          u.targetX = closestAir.position.x;
          u.targetY = closestAir.position.y;
          u.targetUnitId = closestAir.targetId;
          u.path = this.pathGrid.findPath(u, closestAir.position, false);
          u.isDefendingZone = true;
        }
        return;
      }

      // Tanks & Armored forces intercept armor and heavy targets (Scenario B)
      if (cfg.category === 'vehicle' && u.type !== 'artillery') {
        const targetThreat = armorThreats.length > 0 ? armorThreats[0] : generalThreats[0];
        if (targetThreat) {
          const dist = getDistance(u, targetThreat.position);
          if (dist > cfg.range * 0.75 && dist <= maxChase + cfg.range) {
            u.command = 'attack_move';
            u.targetX = targetThreat.position.x;
            u.targetY = targetThreat.position.y;
            u.targetUnitId = targetThreat.targetId;
            u.path = this.pathGrid.findPath(u, targetThreat.position, false);
            u.isDefendingZone = true;
          }
        }
        return;
      }

      // Artillery positions at standoff distance
      if (u.type === 'artillery') {
        const threat = generalThreats[0];
        if (threat) {
          const dist = getDistance(u, threat.position);
          if (dist < 280) {
            // Reposition away from threat
            const awayAngle = Math.atan2(u.y - threat.position.y, u.x - threat.position.x);
            const standoffPos = {
              x: threat.position.x + Math.cos(awayAngle) * 450,
              y: threat.position.y + Math.sin(awayAngle) * 450,
            };
            u.command = 'move';
            u.targetX = standoffPos.x;
            u.targetY = standoffPos.y;
            u.path = this.pathGrid.findPath(u, standoffPos, false);
          } else if (dist > cfg.range * 0.9 && dist <= maxChase + cfg.range) {
            u.command = 'attack_move';
            u.targetX = threat.position.x;
            u.targetY = threat.position.y;
            u.path = this.pathGrid.findPath(u, threat.position, false);
          }
          u.isDefendingZone = true;
        }
        return;
      }

      // Infantry screen buildings and choke points
      if (cfg.category === 'infantry') {
        const threat = generalThreats[0];
        if (threat) {
          const dist = getDistance(u, threat.position);
          if (dist > cfg.range * 0.85 && dist <= maxChase) {
            u.command = 'attack_move';
            u.targetX = threat.position.x;
            u.targetY = threat.position.y;
            u.targetUnitId = threat.targetId;
            u.path = this.pathGrid.findPath(u, threat.position, false);
            u.isDefendingZone = true;
          }
        }
        return;
      }

      // Aircraft sortie against major ground or air threats
      if (cfg.isAir) {
        const threat = armorThreats.length > 0 ? armorThreats[0] : generalThreats[0];
        if (threat) {
          u.command = 'attack_move';
          u.targetX = threat.position.x;
          u.targetY = threat.position.y;
          u.targetUnitId = threat.targetId;
          u.path = [{ x: threat.position.x, y: threat.position.y }];
          u.isDefendingZone = true;
        }
      }
    });
  }

  public triggerEmergencyReinforcements(): boolean {
    const threats = this.tacticalIntelligence.activeThreats;
    const airThreats = threats.filter(t => t.category === 'aircraft');
    const armorThreats = threats.filter(t => t.category === 'vehicle');

    const factories = this.buildings.filter(b => b.type === 'vehicle_factory' && b.faction === 'player' && b.constructionProgress >= 1.0);
    const barracks = this.buildings.filter(b => b.type === 'barracks' && b.faction === 'player' && b.constructionProgress >= 1.0);

    let queuedAny = false;
    if (airThreats.length > 0 && factories.length > 0) {
      const f = factories[0];
      if (f.productionQueue.length < 5) {
        this.queueUnitProduction(f.id, 'aa_vehicle');
        queuedAny = true;
        this.addStrategicLogEntry('EMERGENCY MOBILIZATION: Skyguard AA Vehicle fast-tracked to counter hostile aircraft!', 'critical');
      }
    } else if (armorThreats.length > 0 && factories.length > 0) {
      const f = factories[0];
      if (f.productionQueue.length < 5) {
        this.queueUnitProduction(f.id, 'main_battle_tank');
        queuedAny = true;
        this.addStrategicLogEntry('EMERGENCY MOBILIZATION: Battle Tank queued to intercept armored assault!', 'critical');
      }
    } else if (barracks.length > 0) {
      const b = barracks[0];
      if (b.productionQueue.length < 5) {
        this.queueUnitProduction(b.id, 'rocket_soldier');
        queuedAny = true;
        this.addStrategicLogEntry('EMERGENCY MOBILIZATION: Anti-armor Rocket Soldiers deployed to defend perimeter!', 'critical');
      }
    }

    if (!queuedAny) {
      this.addStrategicLogEntry('Emergency Reinforcements: No open production queue or insufficient resources.', 'warning');
    }
    return queuedAny;
  }

  public assignUnitToDefenseZone(unitId: string, zoneId: string) {
    const unit = this.units.find(u => u.id === unitId);
    const zone = this.tacticalIntelligence.defenseZones.find(z => z.id === zoneId);
    if (!unit || !zone) return;

    this.tacticalIntelligence.defenseZones.forEach(z => {
      z.assignedUnitIds = z.assignedUnitIds.filter(id => id !== unitId);
    });

    zone.assignedUnitIds.push(unitId);
    unit.assignedZoneId = zoneId;
    unit.homePosition = { x: zone.center.x, y: zone.center.y };
    this.addStrategicLogEntry(`Unit ${UNIT_CONFIGS[unit.type].name} assigned to defense zone: ${zone.name}`, 'info');
  }

  public createCustomDefenseZone(name: string, center: Vector2, radius: number) {
    const id = `zone_custom_${Date.now()}`;
    const newZone: DefenseZone = {
      id,
      name,
      type: 'custom',
      center,
      radius: Math.max(150, Math.min(600, radius)),
      assignedUnitIds: [],
      threatLevel: 'GREEN',
      color: '#34d399',
    };
    this.tacticalIntelligence.defenseZones.push(newZone);
    this.addStrategicLogEntry(`New Tactical Defense Zone created: "${name}" (radius ${Math.round(newZone.radius)}m).`, 'info');
    return newZone;
  }

  public setDefensePolicy(policy: DefensePolicy) {
    this.tacticalIntelligence.settings.defensePolicy = policy;
    const policyName =
      policy === 'full_defense'
        ? 'Full Defensive Mobilization'
        : policy === 'defensive_intercept'
        ? 'Defensive Perimeter Intercept'
        : 'Alert & Detection Only';
    this.addStrategicLogEntry(`Defensive doctrine set to: ${policyName}.`, 'info');
  }

  public toggleAutoDefense() {
    this.tacticalIntelligence.settings.autoDefenseEnabled = !this.tacticalIntelligence.settings.autoDefenseEnabled;
    const status = this.tacticalIntelligence.settings.autoDefenseEnabled ? 'ACTIVATED' : 'DISENGAGED';
    this.addStrategicLogEntry(`Automated Base Defense Protocol ${status}.`, 'info');
  }

  // --- Centralized Autonomous Military Production Scheduler (AI Commander) ---
  public updateAutoProduction() {
    if (!this.autoProduction.enabled) return;
    if (this.economy.credits < this.autoProduction.reserveCredits + 80 + getReservedCredits(this)) return;
    if (this.economy.population >= this.economy.populationCap) return;

    const playerHQ = this.buildings.find(b => b.type === 'headquarters' && b.faction === 'player');
    const playerUnits = this.units.filter(u => u.faction === 'player' && u.hp > 0);
    if (playerUnits.length >= this.autoProduction.targetArmySize) return;

    // Scan scouted / visible enemy forces under Fog of War
    const visibleEnemyUnits: Unit[] = [];
    const ts = this.mapData.tileSize;
    const w = this.mapData.width;

    this.units.forEach(u => {
      if (u.faction === 'enemy' && u.hp > 0) {
        if (!this.settings.fogOfWarEnabled) {
          visibleEnemyUnits.push(u);
        } else {
          const gx = Math.floor(u.x / ts);
          const gy = Math.floor(u.y / ts);
          if (gx >= 0 && gx < w && gy >= 0 && gy < this.mapData.height) {
            if (this.fogGrid[gy * w + gx] === 2) {
              visibleEnemyUnits.push(u);
            }
          }
        }
      }
    });

    const enemyAirCount = visibleEnemyUnits.filter(u => UNIT_CONFIGS[u.type].isAir).length;
    const enemyArmorCount = visibleEnemyUnits.filter(u => UNIT_CONFIGS[u.type].category === 'vehicle').length;
    const enemyInfantryCount = visibleEnemyUnits.filter(u => UNIT_CONFIGS[u.type].category === 'infantry').length;

    // Check emergency defense priority (threat within 600px of player HQ)
    const baseThreat = playerHQ
      ? visibleEnemyUnits.some(u => Math.hypot(u.x - playerHQ.pixelX, u.y - playerHQ.pixelY) < 600)
      : false;

    let threatSummary = 'Perimeter clear. No confirmed hostiles detected.';
    if (visibleEnemyUnits.length > 0) {
      threatSummary = `Scouted ${visibleEnemyUnits.length} hostiles (${enemyArmorCount} Armor, ${enemyAirCount} Air, ${enemyInfantryCount} Inf).`;
    }
    this.autoProduction.scoutedThreatsSummary = threatSummary;

    // Available operational production buildings
    const barracks = this.buildings.filter(b => b.type === 'barracks' && b.faction === 'player' && b.constructionProgress >= 1.0);
    const factories = this.buildings.filter(b => b.type === 'vehicle_factory' && b.faction === 'player' && b.constructionProgress >= 1.0);
    const helipads = this.buildings.filter(b => b.type === 'helipad' && b.faction === 'player' && b.constructionProgress >= 1.0);
    const airfields = this.buildings.filter(b => b.type === 'airfield' && b.faction === 'player' && b.constructionProgress >= 1.0);

    const infantryUnits = playerUnits.filter(u => UNIT_CONFIGS[u.type].category === 'infantry');
    const vehicleUnits = playerUnits.filter(u => UNIT_CONFIGS[u.type].category === 'vehicle');
    const antiAirUnits = playerUnits.filter(u => UNIT_CONFIGS[u.type].isAntiAir);
    const airUnits = playerUnits.filter(u => UNIT_CONFIGS[u.type].isAir);

    const mode = this.autoProduction.strategy;
    let chosenUnit: UnitType | null = null;
    let targetBuilding: Building | null = null;
    let decisionReason = 'Maintaining balanced operational forces.';

    // Priority Units Override (if player configured specific priority units)
    if (this.autoProduction.priorityUnits && this.autoProduction.priorityUnits.length > 0) {
      for (const pUnit of this.autoProduction.priorityUnits) {
        const pCfg = UNIT_CONFIGS[pUnit];
        const pB = this.buildings.find(b => b.type === pCfg.requiredBuilding && b.faction === 'player' && b.constructionProgress >= 1.0 && b.productionQueue.length < this.autoProduction.maxQueueLength);
        if (pB && this.economy.credits >= this.autoProduction.reserveCredits + pCfg.cost) {
          chosenUnit = pUnit;
          targetBuilding = pB;
          decisionReason = `Player priority order: fast-tracking ${pCfg.name}.`;
          break;
        }
      }
    }

    // Emergency Defense Reaction
    if (!chosenUnit && this.autoProduction.emergencyDefense && baseThreat) {
      if (enemyAirCount > antiAirUnits.length && factories.length > 0) {
        chosenUnit = 'aa_vehicle';
        targetBuilding = factories.find(b => b.productionQueue.length < this.autoProduction.maxQueueLength) || null;
        decisionReason = 'EMERGENCY: Enemy air assault detected! Deploying Skyguard Flak interceptors.';
      } else if (enemyArmorCount > 0 && barracks.length > 0) {
        chosenUnit = 'rocket_soldier';
        targetBuilding = barracks.find(b => b.productionQueue.length < this.autoProduction.maxQueueLength) || null;
        decisionReason = 'EMERGENCY: Hostile armor breaching perimeter! Mobilizing anti-tank rocket squads.';
      } else if (factories.length > 0) {
        chosenUnit = 'main_battle_tank';
        targetBuilding = factories.find(b => b.productionQueue.length < this.autoProduction.maxQueueLength) || null;
        decisionReason = 'EMERGENCY: Base defense reinforcement! Commissioning battle tanks.';
      }
    }

    // Support Ratio Check (Priority 5: Ensure 1 medic per 6-8 infantry)
    const supportRatio = this.settings.supportRatio || 7;
    const currentMedics = playerUnits.filter(u => u.type === 'medic' || u.type === 'medical_apc').length;
    const neededMedics = Math.floor(infantryUnits.length / supportRatio);

    if (!chosenUnit && neededMedics > currentMedics && (barracks.length > 0 || factories.length > 0)) {
      if (barracks.length > 0) {
        chosenUnit = 'medic';
        targetBuilding = barracks.find(b => b.productionQueue.length < this.autoProduction.maxQueueLength) || null;
        decisionReason = `Support doctrine: deploying Combat Medic to fulfill triage ratio (1 per ${supportRatio} infantry).`;
      } else if (factories.length > 0) {
        chosenUnit = 'medical_apc';
        targetBuilding = factories.find(b => b.productionQueue.length < this.autoProduction.maxQueueLength) || null;
        decisionReason = 'Support doctrine: fabricating armored Medical APC for field casualty recovery.';
      }
    }

    // Strategic Mode Logic
    if (!chosenUnit) {
      if (mode === 'support_priority') {
        if (currentMedics < neededMedics + 2 && barracks.length > 0) {
          chosenUnit = 'medic';
          targetBuilding = barracks.find(b => b.productionQueue.length < this.autoProduction.maxQueueLength) || null;
          decisionReason = 'Support Priority doctrine: training frontline field medic.';
        } else if (factories.length > 0 && Math.random() < 0.5) {
          chosenUnit = 'medical_apc';
          targetBuilding = factories.find(b => b.productionQueue.length < this.autoProduction.maxQueueLength) || null;
          decisionReason = 'Support Priority doctrine: mobilizing armored Medical APC.';
        } else if (barracks.length > 0) {
          chosenUnit = 'engineer';
          targetBuilding = barracks.find(b => b.productionQueue.length < this.autoProduction.maxQueueLength) || null;
          decisionReason = 'Support Priority doctrine: training field engineer for structure & vehicle repair.';
        }
      } else if (mode === 'counter_armor') {
        if (factories.length > 0) {
          chosenUnit = this.unlockedTechs.has('armor_boost') ? 'heavy_tank' : 'siege_tank';
          targetBuilding = factories.find(b => b.productionQueue.length < this.autoProduction.maxQueueLength) || null;
          decisionReason = 'Counter-Armor doctrine: commissioning heavy armor crushers.';
        } else if (barracks.length > 0) {
          chosenUnit = 'rocket_soldier';
          targetBuilding = barracks.find(b => b.productionQueue.length < this.autoProduction.maxQueueLength) || null;
          decisionReason = 'Counter-Armor doctrine: massing shaped-charge anti-tank squads.';
        }
      } else if (mode === 'counter_air') {
        if (factories.length > 0) {
          chosenUnit = 'aa_vehicle';
          targetBuilding = factories.find(b => b.productionQueue.length < this.autoProduction.maxQueueLength) || null;
          decisionReason = 'Counter-Air doctrine: producing Skyguard mobile anti-air.';
        } else if (barracks.length > 0) {
          chosenUnit = 'rocket_soldier';
          targetBuilding = barracks.find(b => b.productionQueue.length < this.autoProduction.maxQueueLength) || null;
          decisionReason = 'Counter-Air doctrine: recruiting surface-to-air rocket troopers.';
        }
      } else if (mode === 'counter') {
        if (enemyAirCount > antiAirUnits.length) {
          if (factories.length > 0) {
            chosenUnit = 'aa_vehicle';
            targetBuilding = factories.find(b => b.productionQueue.length < this.autoProduction.maxQueueLength) || null;
            decisionReason = `Countering scouted ${enemyAirCount} enemy aircraft with Skyguard Flak Tanks.`;
          } else if (barracks.length > 0) {
            chosenUnit = 'rocket_soldier';
            targetBuilding = barracks.find(b => b.productionQueue.length < this.autoProduction.maxQueueLength) || null;
            decisionReason = 'Recruiting rocket troopers for perimeter anti-air coverage.';
          }
        } else if (enemyArmorCount > vehicleUnits.length) {
          if (factories.length > 0) {
            chosenUnit = this.unlockedTechs.has('armor_boost') ? 'heavy_tank' : 'main_battle_tank';
            targetBuilding = factories.find(b => b.productionQueue.length < this.autoProduction.maxQueueLength) || null;
            decisionReason = `Countering ${enemyArmorCount} enemy armored units with heavy armor columns.`;
          } else if (barracks.length > 0) {
            chosenUnit = 'rocket_soldier';
            targetBuilding = barracks.find(b => b.productionQueue.length < this.autoProduction.maxQueueLength) || null;
            decisionReason = 'Training shaped-charge rocket soldiers to ambush enemy tanks.';
          }
        } else if (enemyInfantryCount >= 3) {
          if (barracks.length > 0) {
            chosenUnit = 'heavy_gunner';
            targetBuilding = barracks.find(b => b.productionQueue.length < this.autoProduction.maxQueueLength) || null;
            decisionReason = 'Deploying heavy suppression gunners against hostile infantry.';
          } else if (factories.length > 0) {
            chosenUnit = 'apc';
            targetBuilding = factories.find(b => b.productionQueue.length < this.autoProduction.maxQueueLength) || null;
            decisionReason = 'Deploying armored personnel carriers for rapid anti-personnel sweep.';
          }
        } else {
          chosenUnit = factories.length > 0 && Math.random() < 0.6 ? 'main_battle_tank' : 'rifleman';
          targetBuilding = (chosenUnit === 'main_battle_tank' ? factories : barracks).find(b => b.productionQueue.length < this.autoProduction.maxQueueLength) || null;
          decisionReason = 'No immediate confirmed threats; assembling core combined-arms reserve.';
        }
      } else if (mode === 'defensive') {
        if (antiAirUnits.length < 2 && factories.length > 0) {
          chosenUnit = 'aa_vehicle';
          targetBuilding = factories.find(b => b.productionQueue.length < this.autoProduction.maxQueueLength) || null;
          decisionReason = 'Bolstering perimeter anti-air umbrella.';
        } else if (infantryUnits.length < 10 && barracks.length > 0) {
          chosenUnit = Math.random() < 0.6 ? 'heavy_gunner' : 'rocket_soldier';
          targetBuilding = barracks.find(b => b.productionQueue.length < this.autoProduction.maxQueueLength) || null;
          decisionReason = 'Entrenching defensive infantry garrisons at base chokepoints.';
        } else if (factories.length > 0) {
          chosenUnit = 'siege_tank';
          targetBuilding = factories.find(b => b.productionQueue.length < this.autoProduction.maxQueueLength) || null;
          decisionReason = 'Fabricating heavy siege cannons for base lockdown.';
        }
      } else if (mode === 'aggressive' || mode === 'offensive') {
        if (factories.length > 0 && (vehicleUnits.length < 10 || Math.random() < 0.65)) {
          chosenUnit = this.unlockedTechs.has('armor_boost') && Math.random() < 0.4 ? 'heavy_tank' : 'main_battle_tank';
          targetBuilding = factories.find(b => b.productionQueue.length < this.autoProduction.maxQueueLength) || null;
          decisionReason = 'Assembling heavy battle tank strike spearhead.';
        } else if (airfields.length > 0 && Math.random() < 0.4) {
          chosenUnit = 'stealth_fighter';
          targetBuilding = airfields.find(b => b.productionQueue.length < this.autoProduction.maxQueueLength) || null;
          decisionReason = 'Launching supersonic tactical bomber for airfield strike sorties.';
        } else if (helipads.length > 0 && airUnits.length < 3) {
          chosenUnit = 'attack_helicopter';
          targetBuilding = helipads.find(b => b.productionQueue.length < this.autoProduction.maxQueueLength) || null;
          decisionReason = 'Commissioning Viper gunships for aerial flanking.';
        } else if (barracks.length > 0) {
          chosenUnit = 'commando';
          targetBuilding = barracks.find(b => b.productionQueue.length < this.autoProduction.maxQueueLength) || null;
          decisionReason = 'Deploying Black Ops commandos for forward assault.';
        }
      } else if (mode === 'economy') {
        if (this.economy.credits > this.autoProduction.reserveCredits + 400) {
          if (barracks.length > 0 && infantryUnits.length < 6) {
            chosenUnit = 'rifleman';
            targetBuilding = barracks.find(b => b.productionQueue.length < this.autoProduction.maxQueueLength) || null;
            decisionReason = 'Economic mode: training low-cost rifleman squad.';
          } else if (factories.length > 0 && vehicleUnits.length < 4) {
            chosenUnit = 'light_tank';
            targetBuilding = factories.find(b => b.productionQueue.length < this.autoProduction.maxQueueLength) || null;
            decisionReason = 'Economic mode: commissioning cost-efficient Sabre light tank.';
          }
        }
      } else if (mode === 'custom' && this.autoProduction.customComposition) {
        const comp = this.autoProduction.customComposition;
        const totalTarget = Math.max(1, comp.infantryPct + comp.armorPct + comp.antiAirPct + comp.artilleryPct + comp.supportPct);
        const currentInfPct = (infantryUnits.length / Math.max(1, playerUnits.length)) * 100;
        const currentArmorPct = (vehicleUnits.length / Math.max(1, playerUnits.length)) * 100;
        const currentAaPct = (antiAirUnits.length / Math.max(1, playerUnits.length)) * 100;

        if (currentInfPct < (comp.infantryPct / totalTarget) * 100 && barracks.length > 0) {
          chosenUnit = 'rifleman';
          targetBuilding = barracks.find(b => b.productionQueue.length < this.autoProduction.maxQueueLength) || null;
          decisionReason = 'Custom army ratio: rebalancing infantry brigade.';
        } else if (currentArmorPct < (comp.armorPct / totalTarget) * 100 && factories.length > 0) {
          chosenUnit = 'main_battle_tank';
          targetBuilding = factories.find(b => b.productionQueue.length < this.autoProduction.maxQueueLength) || null;
          decisionReason = 'Custom army ratio: rebalancing armored vehicle division.';
        } else if (currentAaPct < (comp.antiAirPct / totalTarget) * 100 && factories.length > 0) {
          chosenUnit = 'aa_vehicle';
          targetBuilding = factories.find(b => b.productionQueue.length < this.autoProduction.maxQueueLength) || null;
          decisionReason = 'Custom army ratio: rebalancing mobile anti-air detachment.';
        } else if (factories.length > 0) {
          chosenUnit = 'light_tank';
          targetBuilding = factories.find(b => b.productionQueue.length < this.autoProduction.maxQueueLength) || null;
          decisionReason = 'Custom army ratio: maintaining configured quota.';
        }
      } else {
        // Balanced Army Mode
        if (barracks.length > 0 && infantryUnits.length < 8) {
          const pool: UnitType[] = ['rifleman', 'heavy_gunner', 'rocket_soldier', 'medic'];
          chosenUnit = pool[Math.floor(Math.random() * pool.length)];
          targetBuilding = barracks.find(b => b.productionQueue.length < this.autoProduction.maxQueueLength) || null;
          decisionReason = 'Balanced doctrine: rotating tactical infantry training.';
        } else if (factories.length > 0 && vehicleUnits.length < 8) {
          const pool: UnitType[] = ['light_tank', 'main_battle_tank', 'aa_vehicle', 'medical_apc'];
          chosenUnit = pool[Math.floor(Math.random() * pool.length)];
          targetBuilding = factories.find(b => b.productionQueue.length < this.autoProduction.maxQueueLength) || null;
          decisionReason = 'Balanced doctrine: commissioning combined armor & air defense.';
        } else if (helipads.length > 0 && airUnits.length < 3) {
          chosenUnit = 'attack_helicopter';
          targetBuilding = helipads.find(b => b.productionQueue.length < this.autoProduction.maxQueueLength) || null;
          decisionReason = 'Balanced doctrine: commissioning attack rotorcraft.';
        }
      }
    }

    if (chosenUnit && targetBuilding) {
      const cfg = UNIT_CONFIGS[chosenUnit];
      if (this.economy.credits >= this.autoProduction.reserveCredits + cfg.cost) {
        this.queueUnitProduction(targetBuilding.id, chosenUnit);
        this.autoProduction.lastDecisionReason = decisionReason;
        this.autoProduction.lastDecisionTime = this.gameTime;
      }
    }
  }

  public queueUnitProduction(buildingId: string, unitType: UnitType): boolean {
    const b = this.buildings.find(o => o.id === buildingId);
    if (!b || b.hp <= 0 || b.constructionProgress < 1.0) return false;

    const config = UNIT_CONFIGS[unitType];

    // Facility rule: a unit may only be produced by the building type it requires
    // (previously any building accepted any unit and charged for it).
    if (config.requiredBuilding && config.requiredBuilding !== b.type) return false;

    if (b.faction === 'player') {
      if (this.economy.credits < config.cost) return false;
      // Population cap must include units already waiting in production queues,
      // otherwise a large batch overshoots the cap when the units spawn.
      const queued = this.buildings.reduce((n, o) => (o.faction === 'player' ? n + o.productionQueue.length : n), 0);
      if (this.economy.population + queued >= this.economy.populationCap) return false;
      this.economy.credits -= config.cost;
      soundEngine.playClick();
    }

    b.productionQueue.push({
      unitType,
      progress: 0,
      totalTime: config.trainTime,
    });
    return true;
  }

  public cancelUnitProduction(buildingId: string, queueIndex: number): boolean {
    const b = this.buildings.find(o => o.id === buildingId);
    if (!b || !b.productionQueue[queueIndex]) return false;

    const item = b.productionQueue[queueIndex];
    if (b.faction === 'player') {
      this.economy.credits += UNIT_CONFIGS[item.unitType].cost;
    }
    b.productionQueue.splice(queueIndex, 1);
    return true;
  }

  // --- Centralized Autonomous Base Construction Manager (AI Base Architect) ---
  /**
   * Construction AI tick. Planning, site reservation, resource handling and starting live in constructionAI.ts;
   * all of it goes through placeBuilding(), so costs, build times and placement rules are the original ones.
   */
  public updateAIArchitect() {
    if (!this.aiArchitect.enabled || this.aiArchitect.isPaused || this.aiArchitect.mode === 'manual') {
      return;
    }
    planAndStartConstruction(this);
  }

  /**
   * The original doctrine decision tree, unchanged, extracted so it can be asked repeatedly.
   * `plannedTypes` are projects that are planned but not placed yet; they are counted as if they already
   * existed, so five simultaneous plans never repeat the same building.
   */
  public chooseArchitectBuilding(plannedTypes: BuildingType[] = []): { type: BuildingType; reason: string } | null {
    const virtual = plannedTypes.map(type => ({ type, faction: 'player', hp: 1, isUnderConstruction: true, constructionProgress: 0 }) as unknown as Building);
    const playerBuildings = [...this.buildings.filter(b => b.faction === 'player' && b.hp > 0), ...virtual];
    const underConstruction = [
      ...this.buildings.filter(b => b.faction === 'player' && b.isUnderConstruction && b.constructionProgress < 1.0),
      ...virtual,
    ];
    const playerHQ = playerBuildings.find(b => b.type === 'headquarters');
    if (!playerHQ && playerBuildings.length === 0) return null;

    // Assess base strategic requirements
    const powerProduced = this.economy.powerSupply;
    const powerConsumed = this.economy.powerDemand;
    const powerSurplus = powerProduced - powerConsumed;
    const powerDeficit = powerSurplus <= 0;
    const powerTight = powerSurplus < 25;

    const popSurplus = this.economy.populationCap - this.economy.population;
    const popTight = popSurplus <= 4 && this.economy.populationCap < 120;

    const refineries = playerBuildings.filter(b => b.type === 'coin_generator');
    const barracks = playerBuildings.filter(b => b.type === 'barracks');
    const factories = playerBuildings.filter(b => b.type === 'vehicle_factory');
    const radars = playerBuildings.filter(b => b.type === 'radar_station');
    const turrets = playerBuildings.filter(b => ['turret_gun', 'turret_missile', 'turret_aa', 'heavy_turret'].includes(b.type));
    const repairs = playerBuildings.filter(b => b.type === 'repair_bay');
    const medicals = playerBuildings.filter(b => b.type === 'field_hospital');
    const helipads = playerBuildings.filter(b => b.type === 'helipad');
    const airfields = playerBuildings.filter(b => b.type === 'airfield');

    const threatLevel = this.tacticalIntelligence.threatLevel;
    const enemyAirDetected = this.tacticalIntelligence.activeThreats.some(t => t.category === 'aircraft');

    let chosenType: BuildingType | null = null;
    let reason = '';

    const pendingReactors = underConstruction.filter(b => b.type === 'power_plant').length;
    const projectedPowerSurplus = powerSurplus + pendingReactors * 120;

    // 1. Critical Power Grid Need (factoring in active reactor construction to avoid duplicate construction loops)
    if (powerDeficit && pendingReactors === 0) {
      chosenType = 'power_plant';
      reason = 'Critical power failure: emergency Fusion Reactor construction.';
    } else if (powerTight && projectedPowerSurplus < 25 && pendingReactors === 0) {
      chosenType = 'power_plant';
      reason = 'Power grid capacity near ceiling: expanding Fusion Reactor output.';
    }
    // 2. Population Logistics Need
    else if (popTight) {
      chosenType = 'supply_depot';
      reason = 'Logistics quarters exhausted: deploying Supply Depot for troop capacity.';
    }
    // 3. Doctrine-Driven Construction Strategy
    else {
      const mode = this.aiArchitect.mode;

      if (mode === 'economy') {
        if (refineries.length < 3) {
          chosenType = 'coin_generator';
          reason = 'Economy focus: establishing high-yield Ore Refinery.';
        } else if (barracks.length === 0) {
          chosenType = 'barracks';
          reason = 'Economy focus: infantry training barracks for base security.';
        } else if (turrets.length < 2) {
          chosenType = 'turret_gun';
          reason = 'Economy focus: perimeter defense turret to safeguard refineries.';
        } else if (factories.length === 0) {
          chosenType = 'vehicle_factory';
          reason = 'Economy focus: commissioning mechanized war factory.';
        } else if (refineries.length < 5) {
          chosenType = 'coin_generator';
          reason = 'Economy focus: expanding resource harvesting network.';
        } else if (radars.length === 0) {
          chosenType = 'radar_station';
          reason = 'Economy focus: radar surveillance for early hazard detection.';
        } else {
          chosenType = 'turret_missile';
          reason = 'Economy focus: reinforced anti-armor defense.';
        }
      } else if (mode === 'defensive') {
        if (barracks.length === 0) {
          chosenType = 'barracks';
          reason = 'Defensive doctrine: securing garrison infantry production.';
        } else if (turrets.length < 2) {
          chosenType = 'turret_gun';
          reason = 'Defensive doctrine: deploying Gatling Turret at base perimeter.';
        } else if (turrets.length < 4) {
          chosenType = enemyAirDetected ? 'turret_aa' : 'turret_missile';
          reason = enemyAirDetected
            ? 'Defensive doctrine: anti-air Flak Turret countering hostile aircraft.'
            : 'Defensive doctrine: Heavy Missile Battery for perimeter choke points.';
        } else if (radars.length === 0) {
          chosenType = 'radar_station';
          reason = 'Defensive doctrine: Tactical Radar Station for early threat interception.';
        } else if (factories.length === 0) {
          chosenType = 'vehicle_factory';
          reason = 'Defensive doctrine: armored vehicle factory for mobile defense.';
        } else if (repairs.length === 0) {
          chosenType = 'repair_bay';
          reason = 'Defensive doctrine: field repair bay to sustain damaged units.';
        } else if (turrets.length < 6) {
          chosenType = 'heavy_turret';
          reason = 'Defensive doctrine: fortified bastion turret installation.';
        } else if (refineries.length < 2) {
          chosenType = 'coin_generator';
          reason = 'Defensive doctrine: sustainable logistics revenue.';
        } else {
          chosenType = 'defense_wall';
          reason = 'Defensive doctrine: reinforced perimeter security walls.';
        }
      } else if (mode === 'offensive') {
        if (barracks.length === 0) {
          chosenType = 'barracks';
          reason = 'Offensive doctrine: rapid troop barracks deployment.';
        } else if (factories.length === 0) {
          chosenType = 'vehicle_factory';
          reason = 'Offensive doctrine: mechanized War Factory for armor production.';
        } else if (refineries.length < 2) {
          chosenType = 'coin_generator';
          reason = 'Offensive doctrine: fuel & munitions funding refinery.';
        } else if (helipads.length === 0) {
          chosenType = 'helipad';
          reason = 'Offensive doctrine: combat Helipad for aerial strike assets.';
        } else if (radars.length === 0) {
          chosenType = 'radar_station';
          reason = 'Offensive doctrine: battlefield surveillance and radar targeting.';
        } else if (airfields.length === 0 && this.economy.credits > 1200) {
          chosenType = 'airfield';
          reason = 'Offensive doctrine: tactical Airfield for strategic bomber runs.';
        } else if (factories.length < 2) {
          chosenType = 'vehicle_factory';
          reason = 'Offensive doctrine: secondary tank assembly line.';
        } else if (repairs.length === 0) {
          chosenType = 'repair_bay';
          reason = 'Offensive doctrine: forward vehicle recovery and repair station.';
        } else {
          chosenType = 'turret_missile';
          reason = 'Offensive doctrine: frontline fire support battery.';
        }
      } else if (mode === 'custom' && this.aiArchitect.customWeights) {
        const w = this.aiArchitect.customWeights;
        const candidates: { type: BuildingType; score: number; reasonText: string }[] = [];
        if (powerSurplus < 60) {
          candidates.push({ type: 'power_plant', score: w.powerPriority * 1.5, reasonText: 'Custom priority: power grid reinforcement.' });
        }
        if (refineries.length < 4) {
          candidates.push({ type: 'coin_generator', score: w.economyPriority * (1 + (3 - refineries.length) * 0.4), reasonText: 'Custom priority: resource income development.' });
        }
        if (turrets.length < 5) {
          candidates.push({ type: enemyAirDetected ? 'turret_aa' : 'turret_gun', score: w.defensePriority * (threatLevel !== 'GREEN' ? 1.5 : 1.0), reasonText: 'Custom priority: defense perimeter expansion.' });
        }
        if (barracks.length === 0 || (factories.length === 0 && barracks.length > 0)) {
          candidates.push({ type: barracks.length === 0 ? 'barracks' : 'vehicle_factory', score: w.militaryPriority * 1.4, reasonText: 'Custom priority: military production foundation.' });
        }
        if (repairs.length === 0 || medicals.length === 0) {
          candidates.push({ type: repairs.length === 0 ? 'repair_bay' : 'field_hospital', score: w.supportPriority * 1.2, reasonText: 'Custom priority: support logistics facility.' });
        }
        candidates.sort((a, b) => b.score - a.score);
        if (candidates.length > 0) {
          chosenType = candidates[0].type;
          reason = candidates[0].reasonText;
        }
      } else {
        // Balanced (and default for Assisted)
        if (refineries.length === 0) {
          chosenType = 'coin_generator';
          reason = 'Balanced doctrine: establishing initial ore refinery for revenue.';
        } else if (barracks.length === 0) {
          chosenType = 'barracks';
          reason = 'Balanced doctrine: commissioning Infantry Academy for troops.';
        } else if (refineries.length < 2) {
          chosenType = 'coin_generator';
          reason = 'Balanced doctrine: second refinery to stabilize war income.';
        } else if (factories.length === 0) {
          chosenType = 'vehicle_factory';
          reason = 'Balanced doctrine: War Factory for mechanized tank warfare.';
        } else if (turrets.length < 2) {
          chosenType = 'turret_gun';
          reason = 'Balanced doctrine: perimeter security turret guarding base approaches.';
        } else if (radars.length === 0) {
          chosenType = 'radar_station';
          reason = 'Balanced doctrine: Radar Station to uncover shroud & hostiles.';
        } else if (turrets.length < 4) {
          chosenType = enemyAirDetected ? 'turret_aa' : 'turret_missile';
          reason = enemyAirDetected
            ? 'Balanced doctrine: anti-air flak turret responding to hostile air threats.'
            : 'Balanced doctrine: guided missile battery for heavy defense.';
        } else if (helipads.length === 0) {
          chosenType = 'helipad';
          reason = 'Balanced doctrine: Helipad for close air support rotorcraft.';
        } else if (repairs.length === 0) {
          chosenType = 'repair_bay';
          reason = 'Balanced doctrine: vehicle depot for maintenance and repairs.';
        } else if (factories.length < 2) {
          chosenType = 'vehicle_factory';
          reason = 'Balanced doctrine: secondary heavy vehicle factory.';
        } else {
          chosenType = 'coin_generator';
          reason = 'Balanced doctrine: surplus economic expansion.';
        }
      }
    }

    return chosenType ? { type: chosenType, reason } : null;
  }

  public acceptAssistedRecommendation(): boolean {
    const rec = this.aiArchitect.pendingAssistedRecommendation;
    if (!rec) return false;
    // V6.2: the banner mirrors a Construction AI project; approving it lets that project start normally
    if (String(rec.id).startsWith('ctask_')) {
      const ok = approveTask(this, rec.id);
      if (ok) soundEngine.playClick();
      return ok;
    }
    const config = BUILDING_CONFIGS[rec.type];
    if (this.economy.credits < config.cost) {
      soundEngine.playError();
      return false;
    }
    const placed = this.placeBuilding(rec.type, rec.gridX, rec.gridY, 'player', rec.rotation);
    if (placed) {
      this.floatingTexts.push({
        id: Math.random().toString(),
        x: placed.pixelX,
        y: placed.pixelY - 32,
        text: `APPROVED: +${config.name.toUpperCase()}`,
        color: '#10b981',
        life: 0,
        maxLife: 2.2,
      });
      this.addStrategicLogEntry(`Commander approved ${config.name} construction.`, 'success');
      this.aiArchitect.pendingAssistedRecommendation = null;
      return true;
    }
    return false;
  }

  public rejectAssistedRecommendation() {
    const pending = this.aiArchitect.pendingAssistedRecommendation;
    if (pending && String(pending.id).startsWith('ctask_')) {
      cancelTask(this, pending.id);
      soundEngine.playClick();
      return;
    }
    if (this.aiArchitect.pendingAssistedRecommendation) {
      const type = this.aiArchitect.pendingAssistedRecommendation.type;
      this.aiArchitect.pendingAssistedRecommendation = null;
      this.addStrategicLogEntry(`Commander declined ${BUILDING_CONFIGS[type].name} recommendation.`, 'info');
      soundEngine.playClick();
    }
  }

  public setAIArchitectMode(mode: AIArchitectMode) {
    this.aiArchitect.mode = mode;
    this.aiArchitect.pendingAssistedRecommendation = null;
    this.addStrategicLogEntry(`AI Architect doctrine switched to: ${mode.toUpperCase()}.`, 'info');
    soundEngine.playClick();
  }

  public toggleAIArchitect() {
    this.aiArchitect.enabled = !this.aiArchitect.enabled;
    const status = this.aiArchitect.enabled ? 'ONLINE' : 'OFFLINE';
    this.addStrategicLogEntry(`AI Base Architect protocol ${status}.`, 'info');
    soundEngine.playClick();
  }

  public toggleAIArchitectPause() {
    this.aiArchitect.isPaused = !this.aiArchitect.isPaused;
    soundEngine.playClick();
  }

  public setAIArchitectReserve(reserve: number) {
    this.aiArchitect.reserveCredits = Math.max(0, reserve);
  }

  public toggleBuildingRepair(buildingId: string) {
    const b = this.buildings.find(o => o.id === buildingId);
    if (b) {
      b.isRepairing = !b.isRepairing;
      soundEngine.playClick();
    }
  }

  public demolishBuilding(buildingId: string) {
    const bIdx = this.buildings.findIndex(o => o.id === buildingId);
    if (bIdx >= 0) {
      const b = this.buildings[bIdx];
      if (b.faction === 'player') {
        this.economy.credits += Math.round(BUILDING_CONFIGS[b.type].cost * 0.5);
      }
      this.buildings.splice(bIdx, 1);
      this.pathGrid.rebuild(this.mapData, this.buildings);
      soundEngine.playExplosion(false);
    }
  }

  public researchTech(techId: string): boolean {
    if (this.unlockedTechs.has(techId) || this.researchInProgress) return false;
    const tech = TECH_UPGRADES.find(t => t.id === techId);
    if (!tech || this.economy.credits < tech.cost) return false;

    this.economy.credits -= tech.cost;
    this.researchInProgress = {
      techId,
      progress: 0,
      totalTime: tech.researchTime,
    };
    soundEngine.playClick();
    return true;
  }

  public issueUnitGroupCommand(
    unitIds: string[],
    target: Vector2,
    isAttackMove: boolean,
    formation: SquadFormation = this.currentFormation
  ) {
    const selectedUnits = this.units.filter(u => unitIds.includes(u.id) && u.hp > 0);
    if (selectedUnits.length === 0) return;

    // Role-based Formation Sorting (Priority 7):
    // Rank 0: Armored vehicles & tanks (Front Vanguard)
    // Rank 1: Combat infantry (Mid-line fire support)
    // Rank 2: Medics, Medical APCs, & Engineers (Protected Rear Support)
    // Rank 3: Artillery, Siege Tanks, & SAMs (Stand-off Long Range)
    // Rank 4: Aircraft
    const getRoleRank = (type: UnitType): number => {
      if (type === 'medic' || type === 'medical_apc' || type === 'engineer') return 2;
      if (type === 'artillery' || type === 'siege_tank' || type === 'mobile_sam') return 3;
      const cfg = UNIT_CONFIGS[type];
      if (cfg.isAir) return 4;
      if (cfg.category === 'vehicle') return 0;
      return 1;
    };
    selectedUnits.sort((a, b) => getRoleRank(a.type) - getRoleRank(b.type));

    const offsets = calculateSquadOffsets(selectedUnits.length, formation, 38);

    // If large group, compute primary route for first ground unit to reuse corridors
    let primaryGroundPath: Vector2[] | null = null;
    const groundUnits = selectedUnits.filter(u => !UNIT_CONFIGS[u.type].isAir);
    if (groundUnits.length > 0) {
      primaryGroundPath = this.pathGrid.findPath(groundUnits[0], target, false);
    }

    selectedUnits.forEach((u, idx) => {
      const off = offsets[idx] || { x: 0, y: 0 };
      const rawTarget = { x: target.x + off.x, y: target.y + off.y };
      // A formation slot can fall on a building, rock or water: snap ground units to the nearest walkable ground.
      const subTarget = UNIT_CONFIGS[u.type].isAir ? rawTarget : this.pathGrid.walkablePixel(rawTarget);

      u.command = isAttackMove ? 'attack_move' : 'move';
      u.targetX = subTarget.x;
      u.targetY = subTarget.y;
      u.targetUnitId = undefined;
      u.targetBuildingId = undefined;
      u.followTargetId = undefined;

      if (u.faction === 'player') {
        u.manualOrderTime = this.gameTime;
        u.homePosition = { x: subTarget.x, y: subTarget.y };
        u.isDefendingZone = false;
      }

      const isAir = UNIT_CONFIGS[u.type].isAir;
      if (isAir) {
        u.path = [{ x: subTarget.x, y: subTarget.y }];
      } else if (this.pathGrid.hasLineOfSight(
        Math.floor(u.x / this.mapData.tileSize),
        Math.floor(u.y / this.mapData.tileSize),
        Math.floor(subTarget.x / this.mapData.tileSize),
        Math.floor(subTarget.y / this.mapData.tileSize)
      )) {
        u.path = [{ x: subTarget.x, y: subTarget.y }];
      } else if (primaryGroundPath && primaryGroundPath.length > 1 && idx > 0 && Math.hypot(u.x - groundUnits[0].x, u.y - groundUnits[0].y) < 160) {
        // Reuse leader's waypoints with squad offset
        u.path = primaryGroundPath.map((wp, wIdx) => {
          if (wIdx === primaryGroundPath!.length - 1) {
            return { x: subTarget.x, y: subTarget.y };
          }
          return { x: wp.x + off.x * 0.4, y: wp.y + off.y * 0.4 };
        });
      } else {
        u.path = this.pathGrid.findPath(u, subTarget, false);
      }
    });

    if (selectedUnits.some(u => u.faction === 'player')) {
      soundEngine.playCommandAffirmative();
      this.pings.push({
        id: Math.random().toString(),
        x: target.x,
        y: target.y,
        color: isAttackMove ? '#ef4444' : '#22c55e',
        life: 0,
        maxLife: 1.2,
        label: isAttackMove ? 'ATTACK-MOVE' : formation.toUpperCase(),
      });
    }
  }

  public issueMove(unitIds: string[], target: Vector2, formation: SquadFormation = this.currentFormation) {
    this.issueUnitGroupCommand(unitIds, target, false, formation);
  }

  // Targeted Attack Order (Operates on actual enemy entities: units or buildings)
  public issueAttack(unitIds: string[], targetUnitId?: string, targetBuildingId?: string) {
    const selectedUnits = this.units.filter(u => unitIds.includes(u.id));
    if (selectedUnits.length === 0) return;

    let targetPos: Vector2 | null = null;
    let targetName = 'TARGET';

    if (targetUnitId) {
      const tu = this.units.find(u => u.id === targetUnitId && u.hp > 0);
      if (tu) {
        targetPos = { x: tu.x, y: tu.y };
        targetName = UNIT_CONFIGS[tu.type]?.name || 'ENEMY UNIT';
      }
    } else if (targetBuildingId) {
      const tb = this.buildings.find(b => b.id === targetBuildingId && b.hp > 0);
      if (tb) {
        targetPos = { x: tb.pixelX, y: tb.pixelY };
        targetName = BUILDING_CONFIGS[tb.type]?.name || 'ENEMY STRUCTURE';
      }
    }

    if (!targetPos) return;

    selectedUnits.forEach(u => {
      u.command = 'attack';
      u.targetUnitId = targetUnitId;
      u.targetBuildingId = targetBuildingId;
      if (u.faction === 'player') {
        u.manualOrderTime = this.gameTime;
        u.isDefendingZone = false;
      }
      const range = UNIT_CONFIGS[u.type].range;
      const curDist = Math.hypot(u.x - targetPos!.x, u.y - targetPos!.y);
      if (curDist > range * 0.85) {
        u.path = this.pathGrid.findPath(u, targetPos!, UNIT_CONFIGS[u.type].isAir);
      } else {
        u.path = [];
      }
    });

    soundEngine.playCommandAffirmative();
    this.pings.push({
      id: Math.random().toString(),
      x: targetPos.x,
      y: targetPos.y,
      color: '#ef4444',
      life: 0,
      maxLife: 1.5,
      label: `ATTACK: ${targetName}`,
    });
  }

  // Defend Area Command (Holds ground and defends territory within visual radius)
  public issueDefend(unitIds: string[], targetLocation?: Vector2) {
    const selectedUnits = this.units.filter(u => unitIds.includes(u.id));
    if (selectedUnits.length === 0) return;

    const center: Vector2 = targetLocation || {
      x: selectedUnits.reduce((acc, u) => acc + u.x, 0) / selectedUnits.length,
      y: selectedUnits.reduce((acc, u) => acc + u.y, 0) / selectedUnits.length,
    };

    const offsets = calculateSquadOffsets(selectedUnits.length, 'circle', 42);
    selectedUnits.forEach((u, idx) => {
      const off = offsets[idx] || { x: 0, y: 0 };
      const subTarget = { x: center.x + off.x, y: center.y + off.y };
      u.command = 'idle';
      u.stance = 'defensive';
      u.targetUnitId = undefined;
      u.targetBuildingId = undefined;
      u.patrolPointA = { x: subTarget.x, y: subTarget.y };
      u.path = this.pathGrid.findPath(u, subTarget, UNIT_CONFIGS[u.type].isAir);
    });

    soundEngine.playCommandAffirmative();
    this.pings.push({
      id: Math.random().toString(),
      x: center.x,
      y: center.y,
      color: '#36C9E8',
      life: 0,
      maxLife: 1.2,
      label: 'DEFEND SECTOR',
    });
  }

  // Guard Friendly Unit or Structure Command
  public issueGuard(unitIds: string[], targetFriendlyId?: string) {
    const selectedUnits = this.units.filter(u => unitIds.includes(u.id));
    if (selectedUnits.length === 0) return;

    let targetPos: Vector2 | null = null;
    if (targetFriendlyId) {
      const fu = this.units.find(u => u.id === targetFriendlyId && u.hp > 0);
      if (fu) targetPos = { x: fu.x, y: fu.y };
      const fb = this.buildings.find(b => b.id === targetFriendlyId && b.hp > 0);
      if (fb) targetPos = { x: fb.pixelX, y: fb.pixelY };
    }

    // Default to nearest friendly building (or player spawn) if no target is specified
    if (!targetPos) {
      const firstUnit = selectedUnits[0];
      const friendlyBuildings = this.buildings.filter(b => b.faction === 'player' && b.hp > 0);
      if (friendlyBuildings.length > 0) {
        friendlyBuildings.sort(
          (a, b) =>
            Math.hypot(a.pixelX - firstUnit.x, a.pixelY - firstUnit.y) -
            Math.hypot(b.pixelX - firstUnit.x, b.pixelY - firstUnit.y)
        );
        targetPos = { x: friendlyBuildings[0].pixelX, y: friendlyBuildings[0].pixelY };
      } else {
        targetPos = { ...this.mapData.playerSpawn };
      }
    }

    selectedUnits.forEach(u => {
      u.command = 'guard';
      u.guardTargetId = targetFriendlyId;
      u.targetUnitId = undefined;
      u.targetBuildingId = undefined;
      u.path = this.pathGrid.findPath(u, targetPos!, UNIT_CONFIGS[u.type].isAir);
    });

    soundEngine.playCommandAffirmative();
    this.pings.push({
      id: Math.random().toString(),
      x: targetPos.x,
      y: targetPos.y,
      color: '#38B98A',
      life: 0,
      maxLife: 1.2,
      label: 'ESCORT / GUARD',
    });
  }

  // Patrol Command (Move between current position and assigned waypoint)
  public issuePatrol(unitIds: string[], targetWaypoint?: Vector2) {
    const selectedUnits = this.units.filter(u => unitIds.includes(u.id));
    if (selectedUnits.length === 0) return;

    const leadUnit = selectedUnits[0];
    const waypoint: Vector2 = targetWaypoint || {
      x: Math.max(80, Math.min(this.mapData.width * 40 - 80, leadUnit.x + Math.cos(leadUnit.rotation) * 160)),
      y: Math.max(80, Math.min(this.mapData.height * 40 - 80, leadUnit.y + Math.sin(leadUnit.rotation) * 160)),
    };

    selectedUnits.forEach(u => {
      u.command = 'patrol';
      u.patrolPointA = { x: u.x, y: u.y };
      u.patrolPointB = { x: waypoint.x, y: waypoint.y };
      u.targetUnitId = undefined;
      u.targetBuildingId = undefined;
      u.path = this.pathGrid.findPath(u, waypoint, UNIT_CONFIGS[u.type].isAir);
    });

    soundEngine.playCommandAffirmative();
    this.pings.push({
      id: Math.random().toString(),
      x: waypoint.x,
      y: waypoint.y,
      color: '#F2B84B',
      life: 0,
      maxLife: 1.2,
      label: 'PATROL ROUTE',
    });
  }

  // Hold Position Command (Cease movement, attack targets within range without pursuing)
  public issueHold(unitIds: string[]) {
    const selectedUnits = this.units.filter(u => unitIds.includes(u.id));
    if (selectedUnits.length === 0) return;

    selectedUnits.forEach(u => {
      u.command = 'hold';
      u.path = [];
      u.isMoving = false;
      u.targetUnitId = undefined;
      u.targetBuildingId = undefined;
    });
    soundEngine.playCommandAffirmative();
  }

  // Stop Command (Immediately halt all movement and cancel current orders)
  public issueStop(unitIds: string[]) {
    const selectedUnits = this.units.filter(u => unitIds.includes(u.id));
    if (selectedUnits.length === 0) return;

    selectedUnits.forEach(u => {
      u.command = 'idle';
      u.path = [];
      u.isMoving = false;
      u.isAttacking = false;
      u.targetUnitId = undefined;
      u.targetBuildingId = undefined;
      u.patrolPointA = undefined;
      u.patrolPointB = undefined;
      u.guardTargetId = undefined;
      u.followTargetId = undefined;
    });
    soundEngine.playCommandAffirmative();
  }

  // Tactical Smoke & Fallback Retreat Command
  public issueRetreat(unitIds: string[]) {
    const selectedUnits = this.units.filter(u => unitIds.includes(u.id));
    if (selectedUnits.length === 0) return;

    const baseSpawn = this.mapData.playerSpawn;
    selectedUnits.forEach(u => {
      u.command = 'retreat';
      u.targetUnitId = undefined;
      u.targetBuildingId = undefined;
      u.followTargetId = undefined;
      // Brief clean smoke puff
      this.particles.push(...createExplosionParticles(u.x, u.y, false));
      // Fallback toward base
      u.path = this.pathGrid.findPath(u, baseSpawn, UNIT_CONFIGS[u.type].isAir);
    });
    soundEngine.playCommandAffirmative();
  }

  // Follow & Escort Command (Maintains escort proximity with designated ally or lead unit)
  public issueFollow(unitIds: string[], targetFriendlyId?: string) {
    const selectedUnits = this.units.filter(u => unitIds.includes(u.id));
    if (selectedUnits.length === 0) return;

    let targetUnit = targetFriendlyId ? this.units.find(u => u.id === targetFriendlyId && u.hp > 0) : null;
    if (!targetUnit) {
      // Find nearest friendly unit that is not part of the selection
      const otherFriendlies = this.units.filter(u => u.faction === 'player' && u.hp > 0 && !unitIds.includes(u.id));
      if (otherFriendlies.length > 0) {
        const lead = selectedUnits[0];
        otherFriendlies.sort((a, b) => Math.hypot(a.x - lead.x, a.y - lead.y) - Math.hypot(b.x - lead.x, b.y - lead.y));
        targetUnit = otherFriendlies[0];
      }
    }

    if (!targetUnit) {
      // Fallback: escort nearest friendly structure or base
      this.issueGuard(unitIds);
      return;
    }

    selectedUnits.forEach(u => {
      u.command = 'follow';
      u.followTargetId = targetUnit!.id;
      u.targetUnitId = undefined;
      u.targetBuildingId = undefined;
      u.path = this.pathGrid.findPath(u, { x: targetUnit!.x, y: targetUnit!.y }, UNIT_CONFIGS[u.type].isAir);
    });

    soundEngine.playCommandAffirmative();
    this.pings.push({
      id: Math.random().toString(),
      x: targetUnit.x,
      y: targetUnit.y,
      color: '#36C9E8',
      life: 0,
      maxLife: 1.2,
      label: 'FOLLOW / ESCORT',
    });
  }

  // Targeted or Autonomous Field Healing (Medics & Medical APCs)
  public issueHeal(unitIds: string[], targetUnitId?: string) {
    const selectedUnits = this.units.filter(u => unitIds.includes(u.id));
    const medics = selectedUnits.filter(u => u.type === 'medic' || u.type === 'medical_apc' || UNIT_CONFIGS[u.type]?.canHeal);
    if (medics.length === 0) return;

    let targetUnit = targetUnitId ? this.units.find(u => u.id === targetUnitId && u.hp > 0) : null;
    if (!targetUnit) {
      const wounded = this.units.filter(
        u => u.faction === 'player' && u.hp > 0 && u.hp < u.maxHp && UNIT_CONFIGS[u.type]?.category === 'infantry'
      );
      if (wounded.length > 0) {
        wounded.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp));
        targetUnit = wounded[0];
      }
    }

    medics.forEach(u => {
      u.command = 'heal';
      u.targetUnitId = targetUnit ? targetUnit.id : undefined;
      u.targetBuildingId = undefined;
      if (targetUnit) {
        u.path = this.pathGrid.findPath(u, { x: targetUnit.x, y: targetUnit.y }, false);
      }
    });

    soundEngine.playCommandAffirmative();
    if (targetUnit) {
      this.pings.push({
        id: Math.random().toString(),
        x: targetUnit.x,
        y: targetUnit.y,
        color: '#10b981',
        life: 0,
        maxLife: 1.2,
        label: 'TRIAGE HEAL',
      });
    }
  }

  // Targeted or Autonomous Field Repairs (Combat Engineers)
  public issueRepair(unitIds: string[], targetEntityId?: string) {
    const selectedUnits = this.units.filter(u => unitIds.includes(u.id));
    const engineers = selectedUnits.filter(u => u.type === 'engineer' || UNIT_CONFIGS[u.type]?.canRepair);
    if (engineers.length === 0) return;

    let targetPos: Vector2 | null = null;
    let targetName = 'REPAIR';

    if (targetEntityId) {
      const tb = this.buildings.find(b => b.id === targetEntityId && b.hp > 0);
      if (tb) {
        targetPos = { x: tb.pixelX, y: tb.pixelY };
        targetName = BUILDING_CONFIGS[tb.type].name;
      } else {
        const tu = this.units.find(u => u.id === targetEntityId && u.hp > 0);
        if (tu) {
          targetPos = { x: tu.x, y: tu.y };
          targetName = UNIT_CONFIGS[tu.type].name;
        }
      }
    }

    if (!targetPos) {
      const damagedBuildings = this.buildings.filter(b => b.faction === 'player' && b.hp > 0 && b.hp < b.maxHp);
      const damagedVehicles = this.units.filter(
        u => u.faction === 'player' && u.hp > 0 && u.hp < u.maxHp && UNIT_CONFIGS[u.type]?.category === 'vehicle'
      );
      if (damagedBuildings.length > 0) {
        damagedBuildings.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp));
        targetPos = { x: damagedBuildings[0].pixelX, y: damagedBuildings[0].pixelY };
        targetName = BUILDING_CONFIGS[damagedBuildings[0].type].name;
      } else if (damagedVehicles.length > 0) {
        damagedVehicles.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp));
        targetPos = { x: damagedVehicles[0].x, y: damagedVehicles[0].y };
        targetName = UNIT_CONFIGS[damagedVehicles[0].type].name;
      }
    }

    engineers.forEach(u => {
      u.command = 'repair';
      u.targetUnitId = undefined;
      u.targetBuildingId = undefined;
      if (targetPos) {
        u.path = this.pathGrid.findPath(u, targetPos, false);
      }
    });

    soundEngine.playCommandAffirmative();
    if (targetPos) {
      this.pings.push({
        id: Math.random().toString(),
        x: targetPos.x,
        y: targetPos.y,
        color: '#38bdf8',
        life: 0,
        maxLife: 1.2,
        label: `REPAIR: ${targetName}`,
      });
    }
  }

  // --- Economy Power Diagnostics (Priority 5) ---
  public getPowerDiagnostics() {
    const supply = this.economy.powerSupply;
    const demand = this.economy.powerDemand;
    const balance = supply - demand;
    const isDeficit = balance < 0;
    const underConstructionPower = this.buildings
      .filter(b => b.faction === 'player' && b.type === 'power_plant' && b.isUnderConstruction)
      .length * 120;

    return {
      supply,
      demand,
      balance,
      isDeficit,
      underConstructionPower,
      affectedSystems: isDeficit
        ? [
            'Defense Turrets: Fire rate throttled by -50%',
            'Unit Recruitment: Training queues slowed by -50%',
            'Structure Construction: Assembly speeds throttled by -50%',
            'Radar Station: Scan range and resolution degraded',
          ]
        : [],
      recommendation: isDeficit
        ? underConstructionPower > 0
          ? 'Fusion Reactor currently under construction (+120 GW on completion).'
          : 'Emergency: Deploy Fusion Reactor (+120 GW) immediately to restore base operations.'
        : balance < 25
        ? 'Grid capacity approaching ceiling. Construct Fusion Reactor before expanding heavy industries.'
        : 'Grid operational. Ample power reserves available.',
    };
  }

  // --- 6 Modular AI Commander Systems (Priority 7) ---
  public getAIModules(): AIModuleInfo[] {
    const isPowerDeficit = this.economy.powerSupply < this.economy.powerDemand;
    return [
      {
        id: 'architect',
        name: 'AI Base Architect',
        enabled: this.aiArchitect.enabled,
        status: !this.aiArchitect.enabled ? 'OFFLINE' : this.aiArchitect.isPaused ? 'PAUSED' : 'ONLINE',
        objective: this.aiArchitect.mode === 'assisted' ? 'Recommending optimal construction sites' : `Autonomous construction (${this.aiArchitect.mode} doctrine)`,
        lastAction: this.aiArchitect.decisionsHistory[0]?.reason || this.aiArchitect.lastDecisionReason || 'Analyzing base layout',
        reason: isPowerDeficit ? 'Priority: Deploying emergency Fusion Reactor' : 'Expanding base infrastructure',
        resourceLimit: `Reserve: $${this.aiArchitect.reserveCredits}`,
        limitLabel: 'Concurrent Build Sites',
        limitValue: this.aiArchitect.maxConcurrentConstruction,
        limitMin: 1,
        limitMax: 5,
        limitStep: 1,
        lastActionTime: this.aiArchitect.lastDecisionTime || 0,
      },
      {
        id: 'production',
        name: 'AI Troop Production',
        enabled: this.autoProduction.enabled,
        status: !this.autoProduction.enabled ? 'OFFLINE' : this.economy.population >= this.autoProduction.targetArmySize ? 'STANDBY' : 'ACTIVE',
        objective: `Maintain ${this.autoProduction.targetArmySize}-unit army (${this.autoProduction.strategy} posture)`,
        lastAction: this.autoProduction.lastDecisionReason || 'Recruiting frontline forces',
        reason: this.autoProduction.scoutedThreatsSummary || 'Standing by for unit requests',
        resourceLimit: `Ceiling: ${this.autoProduction.targetArmySize} units`,
        limitLabel: 'Target Army Ceiling',
        limitValue: this.autoProduction.targetArmySize,
        limitMin: 10,
        limitMax: 80,
        limitStep: 5,
        lastActionTime: this.autoProduction.lastDecisionTime || 0,
      },
      {
        id: 'defense',
        name: 'AI Defense Commander',
        enabled: this.tacticalIntelligence.settings.autoDefenseEnabled,
        status: !this.tacticalIntelligence.settings.autoDefenseEnabled ? 'OFFLINE' : this.tacticalIntelligence.threatLevel !== 'GREEN' ? 'ACTIVE' : 'STANDBY',
        objective: `Defend perimeter (${this.tacticalIntelligence.settings.defensePolicy})`,
        lastAction: this.tacticalIntelligence.threatLevel !== 'GREEN' ? `Engaging ${this.tacticalIntelligence.activeThreats.length} detected hostiles` : 'Patrolling defense zones',
        reason: `Threat alert level: ${this.tacticalIntelligence.threatLevel}`,
        resourceLimit: `Reserve: ${this.tacticalIntelligence.settings.reserveArmyPct}%`,
        limitLabel: 'Reserve Army %',
        limitValue: this.tacticalIntelligence.settings.reserveArmyPct,
        limitMin: 0,
        limitMax: 80,
        limitStep: 10,
        lastActionTime: this.tacticalIntelligence.threatLevelTime || 0,
      },
      {
        id: 'medical',
        name: 'AI Medical Support',
        enabled: this.aiMedicalEnabled,
        status: !this.aiMedicalEnabled ? 'OFFLINE' : this.aiMedicalStatus,
        objective: this.aiMedicalObjective,
        lastAction: this.aiMedicalLastAction,
        reason: this.aiMedicalReason,
        resourceLimit: 'Triage threshold: 100% HP',
        limitLabel: 'Triage Range (px)',
        limitValue: 400,
        limitMin: 200,
        limitMax: 800,
        limitStep: 50,
        lastActionTime: this.aiMedicalLastTime,
      },
      {
        id: 'repair',
        name: 'AI Combat Repair',
        enabled: this.aiRepairEnabled,
        status: !this.aiRepairEnabled ? 'OFFLINE' : this.aiRepairStatus,
        objective: this.aiRepairObjective,
        lastAction: this.aiRepairLastAction,
        reason: this.aiRepairReason,
        resourceLimit: 'Repair rate: 45 HP/s ($15/s)',
        limitLabel: 'Repair Threshold %',
        limitValue: 80,
        limitMin: 40,
        limitMax: 95,
        limitStep: 5,
        lastActionTime: this.aiRepairLastTime,
      },
      {
        id: 'economy',
        name: 'AI Economy Manager',
        enabled: this.aiEconomyEnabled,
        status: !this.aiEconomyEnabled ? 'OFFLINE' : this.aiEconomyStatus,
        objective: this.aiEconomyObjective,
        lastAction: this.aiEconomyLastAction,
        reason: isPowerDeficit ? 'Critical power grid brownout' : 'Income flow stable',
        resourceLimit: `Buffer: $${Math.max(this.aiArchitect.reserveCredits, this.autoProduction.reserveCredits)}`,
        limitLabel: 'Treasury Reserve ($)',
        limitValue: Math.max(this.aiArchitect.reserveCredits, this.autoProduction.reserveCredits),
        limitMin: 0,
        limitMax: 4000,
        limitStep: 250,
        lastActionTime: this.aiEconomyLastTime,
      },
      {
        id: 'expansion',
        name: 'AI Expansion Director',
        enabled: this.aiExpansionEnabled,
        status: !this.aiExpansionEnabled ? 'OFFLINE' : this.aiExpansionStatus,
        objective: this.aiExpansionObjective,
        lastAction: this.aiExpansionLastAction,
        reason: this.aiExpansionReason,
        resourceLimit: 'Surveying ore crystal beds',
        limitLabel: 'Expansion Budget ($)',
        limitValue: 2000,
        limitMin: 1000,
        limitMax: 5000,
        limitStep: 500,
        lastActionTime: this.aiExpansionLastTime,
      },
    ];
  }

  public toggleAIModule(id: AIModuleId) {
    if (id === 'architect') {
      this.aiArchitect.enabled = !this.aiArchitect.enabled;
    } else if (id === 'production') {
      this.autoProduction.enabled = !this.autoProduction.enabled;
    } else if (id === 'defense') {
      this.tacticalIntelligence.settings.autoDefenseEnabled = !this.tacticalIntelligence.settings.autoDefenseEnabled;
    } else if (id === 'medical') {
      this.aiMedicalEnabled = !this.aiMedicalEnabled;
    } else if (id === 'repair') {
      this.aiRepairEnabled = !this.aiRepairEnabled;
    } else if (id === 'economy') {
      this.aiEconomyEnabled = !this.aiEconomyEnabled;
    } else if (id === 'expansion') {
      this.aiExpansionEnabled = !this.aiExpansionEnabled;
    }
    soundEngine.playClick();
  }

  // --- Advanced Unit Selection Helpers ---
  public selectAllUnits(faction: Faction = 'player'): string[] {
    const ids: string[] = [];
    this.units.forEach(u => {
      const match = u.faction === faction && u.hp > 0;
      u.selected = match;
      if (match) ids.push(u.id);
    });
    return ids;
  }

  public selectUnitsByCategory(category: UnitCategory, faction: Faction = 'player'): string[] {
    const ids: string[] = [];
    this.units.forEach(u => {
      const match = u.faction === faction && u.hp > 0 && UNIT_CONFIGS[u.type]?.category === category;
      u.selected = match;
      if (match) ids.push(u.id);
    });
    return ids;
  }

  /** Armed units (anything that is not a pure support unit). */
  public selectCombatUnits(faction: Faction = 'player'): string[] {
    const ids: string[] = [];
    this.units.forEach(u => {
      const cfg = UNIT_CONFIGS[u.type];
      const match = u.faction === faction && u.hp > 0 && (cfg?.damage ?? 0) > 0;
      u.selected = match;
      if (match) ids.push(u.id);
    });
    return ids;
  }

  /** Clears every unit and building selection and returns no ids. */
  public clearSelection(): string[] {
    this.units.forEach(u => (u.selected = false));
    this.buildings.forEach(b => (b.selected = false));
    return [];
  }

  public selectIdleUnits(faction: Faction = 'player'): string[] {
    const ids: string[] = [];
    this.units.forEach(u => {
      const match = u.faction === faction && u.hp > 0 && (u.command === 'idle' || (!u.isMoving && !u.isAttacking));
      u.selected = match;
      if (match) ids.push(u.id);
    });
    return ids;
  }

  public selectDamagedUnits(faction: Faction = 'player'): string[] {
    const ids: string[] = [];
    this.units.forEach(u => {
      const match = u.faction === faction && u.hp > 0 && u.hp < u.maxHp;
      u.selected = match;
      if (match) ids.push(u.id);
    });
    return ids;
  }

  public selectSupportUnits(faction: Faction = 'player'): string[] {
    const ids: string[] = [];
    this.units.forEach(u => {
      const cfg = UNIT_CONFIGS[u.type];
      const match =
        u.faction === faction &&
        u.hp > 0 &&
        (Boolean(cfg?.canHeal) || Boolean(cfg?.canRepair) || u.type === 'medic' || u.type === 'engineer' || u.type === 'medical_apc');
      u.selected = match;
      if (match) ids.push(u.id);
    });
    return ids;
  }

  public selectNearbyUnits(worldCenter: Vector2, radius: number = 320, faction: Faction = 'player'): string[] {
    const ids: string[] = [];
    this.units.forEach(u => {
      const match = u.faction === faction && u.hp > 0 && Math.hypot(u.x - worldCenter.x, u.y - worldCenter.y) <= radius;
      u.selected = match;
      if (match) ids.push(u.id);
    });
    return ids;
  }

  public launchTacticalNuke(target: Vector2): boolean {
    if (!this.unlockedTechs.has('tactical_nuke') && this.mode !== 'sandbox') return false;
    soundEngine.playAlarm();
    this.addScreenShake(1.5);

    this.projectiles.push({
      id: Math.random().toString(),
      startX: this.mapData.playerSpawn.x,
      startY: this.mapData.playerSpawn.y,
      x: this.mapData.playerSpawn.x,
      y: this.mapData.playerSpawn.y,
      targetX: target.x,
      targetY: target.y,
      speed: 180,
      damage: 1600,
      splashRadius: 190,
      faction: 'player',
      type: 'artillery',
      progress: 0,
      arcHeight: 260,
    });

    this.floatingTexts.push({
      id: Math.random().toString(),
      x: target.x,
      y: target.y - 30,
      text: '☢️ TACTICAL MISSILE INBOUND!',
      color: '#ef4444',
      life: 0,
      maxLife: 3.0,
    });
    return true;
  }

  public lastLoadedCamera?: { x: number; y: number; zoom: number };

  // --- True Save & Load Serialization (Priority 11 - Versioned & Reliable) ---
  public exportSaveData(slotId: string, name: string, cameraPos?: { x: number; y: number; zoom: number }): SaveSlotData {
    const state = {
      version: 2,
      mode: this.mode,
      difficulty: this.difficulty,
      mapId: this.mapData.id,
      missionId: this.currentMission?.id,
      gameTime: this.gameTime,
      gameSpeed: this.gameSpeed,
      camera: cameraPos || { x: this.mapData.playerSpawn.x, y: this.mapData.playerSpawn.y, zoom: 1.0 },
      economy: this.economy,
      unlockedTechs: Array.from(this.unlockedTechs),
      controlGroups: this.controlGroups,
      aiArchitect: this.aiArchitect,
      autoProduction: this.autoProduction,
      tacticalSettings: this.tacticalIntelligence.settings,
      aiMedicalEnabled: this.aiMedicalEnabled,
      aiRepairEnabled: this.aiRepairEnabled,
      aiEconomyEnabled: this.aiEconomyEnabled,
      units: this.units.map(u => ({
        id: u.id,
        type: u.type,
        faction: u.faction,
        x: u.x,
        y: u.y,
        hp: u.hp,
        maxHp: u.maxHp,
        armor: u.armor,
        kills: u.kills,
        rank: u.rank,
        command: u.command,
        stance: u.stance,
      })),
      buildings: this.buildings.map(b => ({
        id: b.id,
        type: b.type,
        faction: b.faction,
        x: b.x,
        y: b.y,
        pixelX: b.pixelX,
        pixelY: b.pixelY,
        width: b.width,
        height: b.height,
        hp: b.hp,
        maxHp: b.maxHp,
        armor: b.armor,
        level: b.level || 1,
        constructionProgress: b.constructionProgress,
        isUnderConstruction: b.isUnderConstruction,
        isRepairing: b.isRepairing,
        productionQueue: b.productionQueue || [],
      })),
    };

    return {
      id: slotId,
      name,
      timestamp: Date.now(),
      version: 2,
      mode: this.mode,
      gameTime: this.gameTime,
      summary: `${this.mode.toUpperCase()} · ${Math.floor(this.gameTime / 60)}m · $${Math.floor(
        this.economy.credits
      )} · ${this.units.filter(u => u.faction === 'player').length} Units`,
      stateJson: JSON.stringify(state),
    };
  }

  public importSaveData(data: SaveSlotData): boolean {
    try {
      const state = JSON.parse(data.stateJson);
      this.mode = state.mode;
      this.difficulty = state.difficulty;
      this.gameTime = state.gameTime;
      this.economy = state.economy;
      this.unlockedTechs = new Set(state.unlockedTechs);

      if (state.gameSpeed) this.gameSpeed = state.gameSpeed;
      if (state.camera) this.lastLoadedCamera = state.camera;
      if (state.controlGroups) this.controlGroups = state.controlGroups;

      // Restore AI Commander modules
      if (state.aiArchitect) this.aiArchitect = state.aiArchitect;
      ensureArchitectState(this); // older saves: add empty task state, keep their saved limit
      if (state.autoProduction) this.autoProduction = state.autoProduction;
      if (state.tacticalSettings) this.tacticalIntelligence.settings = state.tacticalSettings;
      if (typeof state.aiMedicalEnabled === 'boolean') this.aiMedicalEnabled = state.aiMedicalEnabled;
      if (typeof state.aiRepairEnabled === 'boolean') this.aiRepairEnabled = state.aiRepairEnabled;
      if (typeof state.aiEconomyEnabled === 'boolean') this.aiEconomyEnabled = state.aiEconomyEnabled;

      // Reconstruct units
      this.units = state.units.map((u: Partial<Unit>) => {
        const config = UNIT_CONFIGS[u.type as UnitType];
        return {
          ...u,
          rotation: 0,
          altitude: config.isAir ? 55 : 0,
          stance: u.stance || 'aggressive',
          command: u.command || 'idle',
          lastAttackTime: 0,
          selected: false,
          path: [],
          speed: config.speed,
          isMoving: false,
          isAttacking: false,
          abilityCooldown: 0,
        } as Unit;
      });

      // Reconstruct buildings with queues and progress
      this.buildings = state.buildings.map((b: Partial<Building>) => ({
        ...b,
        level: b.level || 1,
        isUnderConstruction: b.isUnderConstruction ?? (b.constructionProgress !== undefined && b.constructionProgress < 1.0),
        isRepairing: b.isRepairing ?? false,
        productionQueue: Array.isArray(b.productionQueue) ? b.productionQueue : [],
        lastAttackTime: 0,
        selected: false,
      })) as Building[];

      // Safe Building Overlap Resolution Routine (Preserves all state & relocates overlapping structures)
      for (let i = 0; i < this.buildings.length; i++) {
        const b = this.buildings[i];
        for (let j = i + 1; j < this.buildings.length; j++) {
          const other = this.buildings[j];
          const isOverlap =
            b.x < other.x + other.width &&
            b.x + b.width > other.x &&
            b.y < other.y + other.height &&
            b.y + b.height > other.y;
          if (isOverlap) {
            let shifted = false;
            for (let r = 1; r <= 8 && !shifted; r++) {
              for (let dx = -r; dx <= r && !shifted; dx++) {
                for (let dy = -r; dy <= r && !shifted; dy++) {
                  const tx = other.x + dx;
                  const ty = other.y + dy;
                  const check = this.canPlaceBuilding(other.type, tx, ty, other.faction, other.id);
                  if (check.valid) {
                    other.x = tx;
                    other.y = ty;
                    other.pixelX = tx * this.mapData.tileSize + (other.width * this.mapData.tileSize) / 2;
                    other.pixelY = ty * this.mapData.tileSize + (other.height * this.mapData.tileSize) / 2;
                    shifted = true;
                  }
                }
              }
            }
          }
        }
      }

      this.pathGrid.rebuild(this.mapData, this.buildings);
      this.updateFogOfWar();
      return true;
    } catch {
      return false;
    }
  }
}
