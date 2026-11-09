/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Faction = 'player' | 'enemy' | 'neutral';

export type GameMode = 'skirmish' | 'campaign' | 'defense' | 'sandbox' | 'custom';
export type AIDifficulty = 'easy' | 'normal' | 'hard' | 'expert';
export type WeatherType = 'clear' | 'rain' | 'dust_storm' | 'night' | 'snow';
export type SquadFormation = 'line' | 'wedge' | 'column' | 'spread' | 'circle' | 'spearhead';

export interface Vector2 {
  x: number;
  y: number;
}

export type UnitType =
  // Infantry
  | 'rifleman'
  | 'heavy_gunner'
  | 'sniper'
  | 'medic'
  | 'engineer'
  | 'rocket_soldier'
  | 'scout'
  | 'commando'
  | 'grenadier'
  | 'flamethrower'
  | 'field_commander'
  // Ground Vehicles
  | 'recon_buggy'
  | 'armored_car'
  | 'apc'
  | 'ifv'
  | 'artillery'
  | 'mlrs'
  | 'logistics_truck'
  | 'recovery_vehicle'
  | 'medical_apc'
  | 'aa_vehicle'
  | 'light_tank'
  | 'main_battle_tank'
  | 'heavy_tank'
  | 'siege_tank'
  | 'mobile_sam'
  | 'ugv_robot_tank'
  // Air Units (Fixed Wing)
  | 'viper_fighter'
  | 'stealth_fighter'
  | 'raven_bomber'
  // Rotary Wing
  | 'hawk_helicopter'
  | 'attack_helicopter'
  | 'titan_transport'
  // Drones & Robotics
  | 'recon_drone'
  | 'combat_drone'
  | 'ucav_drone';

export type BuildingType =
  | 'headquarters'
  | 'power_plant'
  | 'coin_generator' // Resource Refinery / Solar Plant
  | 'barracks'
  | 'vehicle_factory'
  | 'field_hospital' // Medical Support Center
  | 'airfield'
  | 'helipad'
  | 'supply_depot'
  | 'research_lab'
  | 'turret_gun'
  | 'turret_missile'
  | 'turret_aa'
  | 'heavy_turret'
  | 'radar_station'
  | 'repair_bay'
  | 'defense_wall';

export type UnitCategory = 'infantry' | 'vehicle' | 'aircraft';
export type UnitStance = 'aggressive' | 'defensive' | 'hold_fire';
export type UnitCommandType =
  | 'idle'
  | 'stop'
  | 'move'
  | 'attack'
  | 'attack_move'
  | 'patrol'
  | 'hold'
  | 'guard'
  | 'follow'
  | 'heal'
  | 'auto_heal'
  | 'repair'
  | 'capture'
  | 'retreat';

export interface UnitConfig {
  type: UnitType;
  name: string;
  category: UnitCategory;
  cost: number;
  trainTime: number; // in seconds
  maxHp: number;
  armor: number; // damage reduction %
  damage: number;
  attackSpeed: number; // attacks per second
  range: number; // in pixels
  speed: number; // pixels per second
  vision: number; // sight radius in pixels
  description: string;
  requiredBuilding?: BuildingType;
  requiredTech?: string;
  isAntiAir?: boolean;
  canHeal?: boolean;
  canRepair?: boolean;
  isAir?: boolean;
  splashRadius?: number;
  projectileSpeed?: number;
}

export interface BuildingConfig {
  type: BuildingType;
  name: string;
  cost: number;
  buildTime: number;
  maxHp: number;
  armor: number;
  size: { width: number; height: number }; // grid tiles (e.g. 2x2, 3x3)
  powerProduced: number;
  powerConsumed: number;
  creditsPerSecond: number;
  description: string;
  requiredBuilding?: BuildingType;
  requiredTech?: string;
  range?: number;
  damage?: number;
  attackSpeed?: number;
  vision: number;
  canProduce?: (UnitType | BuildingType)[];
  popCapBonus?: number;
}

export interface TechUpgrade {
  id: string;
  name: string;
  cost: number;
  researchTime: number;
  description: string;
  requiredBuilding: BuildingType;
  effect:
    | 'armor_boost'
    | 'damage_boost'
    | 'optics_boost'
    | 'speed_boost'
    | 'nano_repair'
    | 'aircraft_tech'
    | 'tactical_nuke';
}

export interface TreadMark {
  x: number;
  y: number;
  rotation: number;
  life: number;
  maxLife: number;
}

export interface Unit {
  id: string;
  type: UnitType;
  faction: Faction;
  x: number;
  y: number;
  targetX?: number;
  targetY?: number;
  rotation: number; // radians
  turretRotation?: number; // radians (for tanks)
  altitude: number; // 0 for ground, 45-80 for aircraft
  rotorAngle?: number; // for helicopters
  hp: number;
  maxHp: number;
  armor: number;
  kills: number;
  rank: number; // 0 = Recruit, 1 = Veteran, 2 = Elite, 3 = Ace
  stance: UnitStance;
  command: UnitCommandType;
  targetUnitId?: string;
  targetBuildingId?: string;
  patrolPointA?: Vector2;
  patrolPointB?: Vector2;
  guardTargetId?: string;
  followTargetId?: string;
  lastAttackTime: number;
  selected: boolean;
  path: Vector2[];
  speed: number;
  currentSpeed?: number; // for smooth acceleration/deceleration
  angularVelocity?: number;
  bankAngle?: number; // roll angle in turns for aircraft
  muzzleFlash?: number; // flash duration timer
  isMoving: boolean;
  isAttacking: boolean;
  abilityCooldown: number;
  healCooldown?: number;
  recoilOffset?: number; // for cannon kickback
  assignedZoneId?: string; // id of assigned DefenseZone
  homePosition?: Vector2; // return post after defending
  isDefendingZone?: boolean; // active defensive response
  manualOrderTime?: number; // timestamp when player gave explicit order
}

export interface Building {
  id: string;
  type: BuildingType;
  faction: Faction;
  x: number; // grid x
  y: number; // grid y
  pixelX: number;
  pixelY: number;
  width: number; // in tiles
  height: number;
  hp: number;
  maxHp: number;
  armor: number;
  level: number;
  constructionProgress: number; // 0 to 1 (1 = fully built)
  isUnderConstruction: boolean;
  isRepairing: boolean;
  productionQueue: { unitType: UnitType; progress: number; totalTime: number }[];
  rallyPoint?: Vector2;
  lastAttackTime: number;
  targetUnitId?: string;
  selected: boolean;
  rotation?: number; // 0, 90, 180, 270 degrees
}

export interface Projectile {
  id: string;
  x: number;
  y: number;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  targetUnitId?: string;
  targetBuildingId?: string;
  speed: number;
  damage: number;
  splashRadius: number;
  faction: Faction;
  type: 'bullet' | 'cannon' | 'missile' | 'laser' | 'artillery' | 'nuke' | 'flame' | 'grenade' | 'bomb';
  progress: number; // 0 to 1
  arcHeight?: number; // for artillery/grenade
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  alpha: number;
  type: 'smoke' | 'fire' | 'spark' | 'explosion' | 'debris' | 'rain' | 'snow' | 'tracer' | 'heal' | 'dust' | 'shockwave';
}

export interface Wreckage {
  id: string;
  x: number;
  y: number;
  rotation: number;
  type: UnitType;
  life: number; // duration before despawning
  maxLife: number;
}

export interface FloatingText {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

export interface TacticalPing {
  id: string;
  x: number;
  y: number;
  color: string;
  life: number;
  maxLife: number;
  label?: string;
}

export interface PlayerEconomy {
  credits: number;
  incomeRate: number; // credits per sec
  powerSupply: number;
  powerDemand: number;
  population: number;
  populationCap: number;
  armyStrength: number;
}

export interface MapProp {
  id: string;
  x: number;
  y: number;
  type: 'tree' | 'rock' | 'ruin' | 'barricade' | 'sandbags' | 'wreck' | 'bush' | 'bush_cluster' | 'wild_grass';
  size: number;
  rotation: number;
  blocking?: boolean;
  variant?: number;
}

export interface MapData {
  id: string;
  name: string;
  biome: 'temperate' | 'desert' | 'snow' | 'urban' | 'volcanic' | 'industrial';
  width: number; // in tiles
  height: number;
  tileSize: number;
  tiles: number[][]; // 0: grass/ground, 1: dirt/rubble, 2: road/bridge, 3: water/ice, 4: cliff/wall, 5: forest
  resourceNodes: { x: number; y: number; amount: number; remaining: number }[];
  props: MapProp[];
  playerSpawn: Vector2;
  enemySpawn: Vector2;
}

export interface CampaignMission {
  id: number;
  title: string;
  codenamed: string;
  briefing: string;
  mapId: string;
  startingCredits: number;
  objectives: { id: string; text: string; completed: boolean }[];
  enemyDifficulty: AIDifficulty;
  rewardCredits: number;
  unlocks: string[];
}

export interface TacticalOverlaySettings {
  attackRange: boolean;
  radarCoverage: boolean;
  defenseZones: boolean;
  patrolRoutes: boolean;
  buildingFootprints: boolean;
  unitSelection: boolean;
  enemyDetection: boolean;
  resourceLocations: boolean;
  pathfindingDebug: boolean;
}

export interface GameSettings {
  soundEnabled: boolean;
  musicEnabled: boolean;
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  combatVolume?: number;
  uiVolume?: number;
  voiceAlerts?: boolean;
  muteWhenBackgrounded?: boolean;
  showHealthBars: 'always' | 'damaged' | 'selected';
  gameSpeed: number; // 0.5, 1, 1.5, 2
  fogOfWarEnabled: boolean;
  weatherEffects: boolean;
  combatEffects: boolean;
  smokeDensity: 'off' | 'low' | 'normal';
  unitVisibility: 'standard' | 'enhanced';
  dayNightCycle: boolean;
  graphicsQuality: 'low' | 'medium' | 'high' | 'ultra';
  screenShake: number; // 0 to 1
  showDamageNumbers: boolean;
  // Controls
  cameraSensitivity?: number;
  zoomSensitivity?: number;
  tapToMove?: boolean;
  multiSelection?: boolean;
  edgeScrolling?: boolean;
  touchFeedback?: boolean;
  pinchZoom?: boolean;
  doubleTapSelection?: boolean;
  touchTargetSize?: 'standard' | 'large';
  // AI & Automation
  autoDefenseEnabled?: boolean;
  defensePolicy?: DefensePolicy;
  emergencyReinforcements?: boolean;
  autoRepair?: boolean;
  autoHeal?: boolean;
  supportRatio?: number; // e.g. 8 (1 medic per 8 infantry)
  retreatThreshold?: number;
  // Radar & Defense Overlays
  radarVisibility?: boolean;
  radarSize?: 'compact' | 'standard' | 'large';
  radarPosition?: 'top-right' | 'top-left' | 'bottom-right';
  alertSoundEnabled?: boolean;
  showThreatOverlay?: boolean;
  showDefenseZoneOverlay?: boolean;
  // Tactical Overlays Menu Configuration (All off by default)
  overlays?: Partial<TacticalOverlaySettings>;
  // Accessibility & Eye Comfort
  eyeComfortMode?: boolean;
  reducedFlashing?: boolean;
  uiScale?: 'compact' | 'standard' | 'large';
  largeTouchTargets?: boolean;
  colorblindMode?: boolean;
  reducedMotion?: boolean;
  highContrast?: boolean;
  textSize?: 'small' | 'standard' | 'large';
  // Graphics Fine-Tuning
  resolutionScale?: number;
  shadowQuality?: 'off' | 'low' | 'medium' | 'high';
  textureQuality?: 'low' | 'medium' | 'high';
  particleDensity?: 'low' | 'medium' | 'high';
  antiAliasing?: boolean;
  frameRateTarget?: 30 | 60 | 120 | 0;
  // Mobile Systems
  commandDeckState?: 'collapsed' | 'compact' | 'expanded';
  autoCenterOnStart?: boolean;
  smoothCamera?: boolean;
  cameraBounds?: 'strict' | 'relaxed';
  touchSensitivity?: number;
  gestureSensitivity?: number;
  notifications?: boolean;
}

export interface SaveSlotData {
  id: string;
  name: string;
  timestamp: number;
  mode: GameMode;
  gameTime: number;
  summary: string;
  stateJson: string;
  version?: number;
}

export type AIModuleId = 'architect' | 'production' | 'defense' | 'medical' | 'repair' | 'economy' | 'expansion';

export interface AIModuleInfo {
  id: AIModuleId;
  name: string;
  enabled: boolean;
  status: 'ONLINE' | 'ACTIVE' | 'STANDBY' | 'PAUSED' | 'OFFLINE';
  objective: string;
  lastAction: string;
  reason: string;
  resourceLimit?: string;
  limitLabel?: string;
  limitValue?: number;
  limitMin?: number;
  limitMax?: number;
  limitStep?: number;
  lastActionTime: number;
}

export type AICommanderMode =
  | 'balanced'
  | 'defensive'
  | 'offensive'
  | 'support_priority'
  | 'counter_armor'
  | 'counter_air'
  | 'economy'
  | 'counter'
  | 'aggressive'
  | 'custom';

export interface AICommanderCustomComposition {
  infantryPct: number;
  armorPct: number;
  antiAirPct: number;
  artilleryPct: number;
  supportPct: number;
}

export interface AutoProductionSettings {
  enabled: boolean;
  strategy: AICommanderMode;
  reserveCredits: number;
  targetArmySize: number;
  maxQueueLength: number;
  emergencyDefense: boolean;
  customComposition?: AICommanderCustomComposition;
  priorityUnits?: UnitType[];
  lastDecisionReason?: string;
  lastDecisionTime?: number;
  scoutedThreatsSummary?: string;
}

export type AIArchitectMode =
  | 'manual'
  | 'assisted'
  | 'balanced'
  | 'defensive'
  | 'offensive'
  | 'economy'
  | 'custom';

export interface AIArchitectDecision {
  id: string;
  time: number;
  buildingType: BuildingType;
  action: 'built' | 'recommended' | 'skipped' | 'blocked';
  reason: string;
  gridPos?: Vector2;
  cost: number;
}

export interface AIArchitectCustomWeights {
  powerPriority: number;
  economyPriority: number;
  defensePriority: number;
  militaryPriority: number;
  supportPriority: number;
}

export interface AIArchitectSettings {
  enabled: boolean;
  mode: AIArchitectMode;
  reserveCredits: number;
  maxConcurrentConstruction: number;
  isPaused: boolean;
  customWeights?: AIArchitectCustomWeights;
  lastDecisionReason?: string;
  lastDecisionTime?: number;
  decisionsHistory: AIArchitectDecision[];
  pendingAssistedRecommendation?: {
    id: string;
    type: BuildingType;
    gridX: number;
    gridY: number;
    rotation: number;
    reason: string;
    advantage: string;
    cost: number;
  } | null;
}

export interface BuildingPlacementRecommendation {
  gridX: number;
  gridY: number;
  score: number;
  label: 'RECOMMENDED' | 'ALTERNATIVE' | 'EXPANSION';
  reason: string;
  advantage: string;
  disadvantage: string;
  footprint?: { width: number; height: number };
  distanceToHQ?: number;
}

export interface BaseIntelligenceReport {
  integrityScore: number;
  planningStyle: 'balanced' | 'defensive' | 'offensive';
  powerStatus: 'optimal' | 'stable' | 'deficit';
  powerDelta: number;
  defensiveCoverageScore: number;
  factoryThroughputScore: number;
  radarCoverageScore: number;
  recommendations: {
    type: 'power' | 'defense' | 'production' | 'radar' | 'expansion';
    title: string;
    description: string;
    severity: 'critical' | 'warning' | 'info';
  }[];
}

// --- SYSTEM 1: INTELLIGENT RADAR & AUTOMATIC BASE DEFENSE ---

export type ThreatLevel = 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';

export interface DetectedThreat {
  id: string;
  targetId: string;
  unitType: UnitType;
  category: 'infantry' | 'vehicle' | 'aircraft';
  position: Vector2;
  lastKnownVelocity?: Vector2;
  confidence: number; // 0 to 1
  firstSeenTime: number;
  lastSeenTime: number;
  threatScore: number;
  isApproaching: boolean;
  threatenedZoneId?: string;
  distanceToHQ: number;
}

export type DefenseZoneType = 'hq' | 'factory' | 'power' | 'perimeter' | 'resource' | 'custom';

export interface DefenseZone {
  id: string;
  name: string;
  type: DefenseZoneType;
  center: Vector2;
  radius: number;
  assignedUnitIds: string[];
  threatLevel: ThreatLevel;
  color: string;
}

export type DefensePolicy = 'alert_only' | 'defensive_intercept' | 'full_defense';

export interface DefenseIntelligenceSettings {
  autoDefenseEnabled: boolean;
  defensePolicy: DefensePolicy;
  emergencyReinforcements: boolean;
  retreatThresholdHp: number; // e.g. 0.25
  maxChaseDistance: number; // in pixels
  autoRepairEnabled: boolean;
  reserveArmyPct: number; // percentage of units that remain at base as emergency reserve
  showRadarOverlay: boolean;
  showDefenseZones: boolean;
  alertSoundEnabled: boolean;
}

export interface StrategicLogEntry {
  id: string;
  time: number;
  text: string;
  level: 'info' | 'warning' | 'critical' | 'success';
}

export interface TacticalIntelligence {
  threatLevel: ThreatLevel;
  threatLevelTime: number;
  lastAlertSoundTime: number;
  activeThreats: DetectedThreat[];
  defenseZones: DefenseZone[];
  settings: DefenseIntelligenceSettings;
  strategicLog: StrategicLogEntry[];
  radarOperational: boolean;
  radarRange: number;
}

// --- SYSTEM 4 & 5: MAP ENVIRONMENTS & MATCH CONFIGURATION ---

export type MapEnvironment = 'verdant' | 'desert' | 'snow' | 'industrial' | 'volcanic' | 'urban';
export type MapSize = 'small' | 'medium' | 'large' | 'extra_large';

export interface MatchSetupConfig {
  mapId: string;
  mapSize: MapSize;
  environment: MapEnvironment;
  difficulty: AIDifficulty;
  aiOpponentsCount: number;
  startingCredits: number;
  startingArmy: 'minimal' | 'standard' | 'strike_force';
  startingTech: 'basic' | 'advanced' | 'all';
  fogOfWar: boolean;
  victoryCondition: 'annihilation' | 'destroy_hq' | 'domination';
  gameSpeed: number;
}
