/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BUILDING_CONFIGS, UNIT_CONFIGS } from '../data/gameData';
import { AIDifficulty, Building, BuildingType, MapData, Unit, UnitType, Vector2 } from '../types/game';
import { PathfindingGrid } from './pathfinding';

export interface AIState {
  credits: number;
  lastDecisionTime: number;
  lastScoutTime: number;
  lastAttackTime: number;
  attackTargetPos?: Vector2;
  attackSquadIds: string[];
  isAssaulting: boolean;
  baseCenter: Vector2;
}

export class EnemyAI {
  private difficulty: AIDifficulty;
  private state: AIState;
  private mapData: MapData;

  constructor(difficulty: AIDifficulty, mapData: MapData) {
    this.difficulty = difficulty;
    this.mapData = mapData;
    this.state = {
      credits: difficulty === 'easy' ? 800 : difficulty === 'normal' ? 1200 : difficulty === 'hard' ? 2000 : 3200,
      lastDecisionTime: 0,
      lastScoutTime: 0,
      lastAttackTime: 0,
      attackSquadIds: [],
      isAssaulting: false,
      baseCenter: { ...mapData.enemySpawn },
    };
  }

  public getCredits(): number {
    return this.state.credits;
  }

  public addCredits(amount: number) {
    this.state.credits += amount;
  }

  public update(
    currentTime: number,
    enemyBuildings: Building[],
    enemyUnits: Unit[],
    playerBuildings: Building[],
    playerUnits: Unit[],
    pathGrid: PathfindingGrid,
    onBuildStructure: (type: BuildingType, x: number, y: number) => void,
    onTrainUnit: (buildingId: string, unitType: UnitType) => void,
    onIssueUnitCommand: (unitIds: string[], target: Vector2, isAttackMove: boolean) => void,
    onRepairBuilding: (buildingId: string) => void
  ) {
    // Passive AI income based on resource buildings
    const refineries = enemyBuildings.filter(b => b.type === 'coin_generator' && b.constructionProgress >= 1);
    const hqs = enemyBuildings.filter(b => b.type === 'headquarters' && b.constructionProgress >= 1);

    const baseIncomeRate = this.difficulty === 'easy' ? 12 : this.difficulty === 'normal' ? 22 : this.difficulty === 'hard' ? 35 : 50;
    const incomeFromBuildings = refineries.length * 30 + hqs.length * 15;
    this.state.credits += (baseIncomeRate + incomeFromBuildings) * (1 / 60);

    // AI decisions pulse every 1.5 - 2.5 seconds depending on difficulty
    const decisionInterval = this.difficulty === 'expert' ? 1.0 : this.difficulty === 'hard' ? 1.5 : this.difficulty === 'normal' ? 2.2 : 3.2;

    if (currentTime - this.state.lastDecisionTime < decisionInterval) {
      return;
    }
    this.state.lastDecisionTime = currentTime;

    // 1. Repair damaged buildings
    enemyBuildings.forEach(b => {
      if (b.hp < b.maxHp * 0.75 && !b.isRepairing && this.state.credits > 100) {
        onRepairBuilding(b.id);
      }
    });

    // 2. Base Construction Evaluation
    this.manageConstruction(enemyBuildings, onBuildStructure, pathGrid);

    // 3. Unit Recruitment Management
    this.manageRecruitment(enemyBuildings, enemyUnits, playerUnits, onTrainUnit);

    // 4. Military Squad Coordination (Scouting, Defense, Combined-Arms Assaults)
    this.manageMilitary(currentTime, enemyBuildings, enemyUnits, playerBuildings, playerUnits, onIssueUnitCommand);
  }

  private manageConstruction(
    enemyBuildings: Building[],
    onBuildStructure: (type: BuildingType, x: number, y: number) => void,
    pathGrid: PathfindingGrid
  ) {
    const hasHQ = enemyBuildings.some(b => b.type === 'headquarters' && b.hp > 0);
    if (!hasHQ) return;

    // Calculate AI power balance
    let powerSupply = 0;
    let powerDemand = 0;
    enemyBuildings.forEach(b => {
      if (b.constructionProgress >= 1) {
        const config = BUILDING_CONFIGS[b.type];
        powerSupply += config.powerProduced;
        powerDemand += config.powerConsumed;
      }
    });

    const powerDeficit = powerSupply - powerDemand < 15;
    const powerPlants = enemyBuildings.filter(b => b.type === 'power_plant');
    const refineries = enemyBuildings.filter(b => b.type === 'coin_generator');
    const barracks = enemyBuildings.filter(b => b.type === 'barracks');
    const factories = enemyBuildings.filter(b => b.type === 'vehicle_factory');
    const turrets = enemyBuildings.filter(b => b.type === 'turret_gun' || b.type === 'turret_missile');

    let toBuild: BuildingType | null = null;

    if (powerPlants.length === 0 || (powerDeficit && this.state.credits >= 300)) {
      toBuild = 'power_plant';
    } else if (refineries.length < 2 && this.state.credits >= 500) {
      toBuild = 'coin_generator';
    } else if (barracks.length === 0 && this.state.credits >= 400) {
      toBuild = 'barracks';
    } else if (factories.length === 0 && barracks.length > 0 && this.state.credits >= 750) {
      toBuild = 'vehicle_factory';
    } else if (turrets.length < (this.difficulty === 'easy' ? 2 : this.difficulty === 'normal' ? 4 : 6) && this.state.credits >= 350) {
      toBuild = this.difficulty === 'hard' || this.difficulty === 'expert' ? 'turret_missile' : 'turret_gun';
    } else if (refineries.length < 3 && this.state.credits >= 900) {
      toBuild = 'coin_generator';
    }

    if (toBuild && this.state.credits >= BUILDING_CONFIGS[toBuild].cost) {
      const pos = this.findPlacementSpot(toBuild, enemyBuildings, pathGrid);
      if (pos) {
        this.state.credits -= BUILDING_CONFIGS[toBuild].cost;
        onBuildStructure(toBuild, pos.x, pos.y);
      }
    }
  }

  private findPlacementSpot(type: BuildingType, buildings: Building[], pathGrid: PathfindingGrid): Vector2 | null {
    const config = BUILDING_CONFIGS[type];
    const baseGridX = Math.floor(this.state.baseCenter.x / this.mapData.tileSize);
    const baseGridY = Math.floor(this.state.baseCenter.y / this.mapData.tileSize);

    // Search in spirals around base center
    const radius = 10;
    for (let r = 3; r < radius; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const gx = baseGridX + dx;
          const gy = baseGridY + dy;

          if (this.isValidBuildLocation(gx, gy, config.size.width, config.size.height, buildings, pathGrid)) {
            return { x: gx, y: gy };
          }
        }
      }
    }
    return null;
  }

  private isValidBuildLocation(gx: number, gy: number, w: number, h: number, buildings: Building[], pathGrid: PathfindingGrid): boolean {
    if (gx < 2 || gx + w >= this.mapData.width - 2 || gy < 2 || gy + h >= this.mapData.height - 2) {
      return false;
    }

    // Check map tiles & path grid
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const tx = gx + x;
        const ty = gy + y;
        const tileType = this.mapData.tiles[ty]?.[tx] ?? 0;
        if (tileType === 3 || tileType === 4 || tileType === 5) return false;
        if (!pathGrid.isWalkable(tx, ty)) return false;
      }
    }

    // Check collision with existing buildings
    for (const b of buildings) {
      if (b.hp <= 0) continue;
      if (gx < b.x + b.width + 1 && gx + w + 1 > b.x && gy < b.y + b.height + 1 && gy + h + 1 > b.y) {
        return false;
      }
    }

    return true;
  }

  private manageRecruitment(
    enemyBuildings: Building[],
    enemyUnits: Unit[],
    playerUnits: Unit[],
    onTrainUnit: (buildingId: string, unitType: UnitType) => void
  ) {
    // Counter player army composition and tech
    const playerTanks = playerUnits.filter(u => UNIT_CONFIGS[u.type].category === 'vehicle').length;
    const playerAir = playerUnits.filter(u => UNIT_CONFIGS[u.type].isAir).length;
    const playerInfantry = playerUnits.filter(u => UNIT_CONFIGS[u.type].category === 'infantry').length;

    // 1. Barracks Recruitment
    const barracks = enemyBuildings.filter(b => b.type === 'barracks' && b.constructionProgress >= 1);
    barracks.forEach(barrack => {
      if (barrack.productionQueue.length < 2) {
        let unitToTrain: UnitType = 'rifleman';

        if (this.difficulty === 'expert' || this.difficulty === 'hard') {
          if (playerTanks >= 2 && Math.random() < 0.65) {
            unitToTrain = 'rocket_soldier';
          } else if (playerInfantry >= 3 && Math.random() < 0.5) {
            unitToTrain = Math.random() < 0.5 ? 'heavy_gunner' : 'grenadier';
          } else if (Math.random() < 0.3) {
            unitToTrain = 'commando';
          } else if (Math.random() < 0.25) {
            unitToTrain = 'sniper';
          } else {
            unitToTrain = 'rifleman';
          }
        } else if (this.difficulty === 'normal') {
          if (playerTanks >= 3 && Math.random() < 0.55) {
            unitToTrain = 'rocket_soldier';
          } else if (Math.random() < 0.35) {
            unitToTrain = 'heavy_gunner';
          } else {
            unitToTrain = 'rifleman';
          }
        } else {
          // Easy: basic riflemen with occasional heavy gunners
          unitToTrain = Math.random() < 0.2 ? 'heavy_gunner' : 'rifleman';
        }

        const cost = UNIT_CONFIGS[unitToTrain].cost;
        if (this.state.credits >= cost) {
          this.state.credits -= cost;
          onTrainUnit(barrack.id, unitToTrain);
        }
      }
    });

    // 2. Vehicle Factory Recruitment
    const factories = enemyBuildings.filter(b => b.type === 'vehicle_factory' && b.constructionProgress >= 1);
    factories.forEach(factory => {
      if (factory.productionQueue.length < 2) {
        let vehicleToTrain: UnitType = 'light_tank';
        const rand = Math.random();

        if (this.difficulty === 'expert') {
          // Expert counter-unit intelligence
          if (playerAir >= 1 && Math.random() < 0.75) {
            vehicleToTrain = Math.random() < 0.5 ? 'aa_vehicle' : 'mobile_sam';
          } else if (playerTanks >= 3 && Math.random() < 0.6) {
            vehicleToTrain = Math.random() < 0.5 ? 'heavy_tank' : 'siege_tank';
          } else if (rand < 0.3) {
            vehicleToTrain = 'artillery';
          } else if (rand < 0.65) {
            vehicleToTrain = 'main_battle_tank';
          } else {
            vehicleToTrain = 'recon_buggy';
          }
        } else if (this.difficulty === 'hard') {
          if (playerAir >= 1 && Math.random() < 0.6) {
            vehicleToTrain = 'aa_vehicle';
          } else if (rand < 0.35) {
            vehicleToTrain = 'main_battle_tank';
          } else if (rand < 0.6) {
            vehicleToTrain = 'heavy_tank';
          } else if (rand < 0.8) {
            vehicleToTrain = 'artillery';
          } else {
            vehicleToTrain = 'light_tank';
          }
        } else if (this.difficulty === 'normal') {
          if (playerAir >= 2 && Math.random() < 0.4) {
            vehicleToTrain = 'aa_vehicle';
          } else {
            vehicleToTrain = rand < 0.55 ? 'light_tank' : 'main_battle_tank';
          }
        } else {
          // Easy
          vehicleToTrain = rand < 0.75 ? 'light_tank' : 'recon_buggy';
        }

        const cost = UNIT_CONFIGS[vehicleToTrain].cost;
        if (this.state.credits >= cost) {
          this.state.credits -= cost;
          onTrainUnit(factory.id, vehicleToTrain);
        }
      }
    });
  }

  private manageMilitary(
    currentTime: number,
    enemyBuildings: Building[],
    enemyUnits: Unit[],
    playerBuildings: Building[],
    playerUnits: Unit[],
    onIssueUnitCommand: (unitIds: string[], target: Vector2, isAttackMove: boolean) => void
  ) {
    const aliveUnits = enemyUnits.filter(u => u.hp > 0);
    if (aliveUnits.length === 0) return;

    // Check if enemy base or HQ is under siege
    const hq = enemyBuildings.find(b => b.type === 'headquarters');
    const threatsNearHQ = hq
      ? playerUnits.filter(u => Math.hypot(u.x - hq.pixelX, u.y - hq.pixelY) < (this.difficulty === 'expert' ? 550 : 450))
      : [];

    if (threatsNearHQ.length > 0 && hq) {
      // BASE UNDER ATTACK! Dynamic defensive recall
      const allUnitIds = aliveUnits.map(u => u.id);
      onIssueUnitCommand(allUnitIds, { x: hq.pixelX, y: hq.pixelY }, true);
      return;
    }

    // Scouting Mission
    const scoutInterval = this.difficulty === 'expert' ? 25 : this.difficulty === 'hard' ? 35 : this.difficulty === 'normal' ? 50 : 75;
    if (currentTime - this.state.lastScoutTime > scoutInterval && aliveUnits.length > 2) {
      this.state.lastScoutTime = currentTime;
      const scoutUnit = aliveUnits.find(u => u.type === 'scout' || u.type === 'recon_buggy' || u.type === 'rifleman');
      if (scoutUnit) {
        // Scout near player base or contested central nodes
        const randTarget = {
          x: Math.max(100, Math.min(this.mapData.width * 40 - 100, this.mapData.playerSpawn.x + (Math.random() - 0.5) * 400)),
          y: Math.max(100, Math.min(this.mapData.height * 40 - 100, this.mapData.playerSpawn.y + (Math.random() - 0.5) * 400)),
        };
        onIssueUnitCommand([scoutUnit.id], randTarget, true);
      }
    }

    // Coordinated Combined-Arms Attack Waves
    const minArmySize =
      this.difficulty === 'easy' ? 5 : this.difficulty === 'normal' ? 8 : this.difficulty === 'hard' ? 10 : 12;
    const attackInterval =
      this.difficulty === 'easy' ? 60 : this.difficulty === 'normal' ? 42 : this.difficulty === 'hard' ? 30 : 22;

    if (aliveUnits.length >= minArmySize && currentTime - this.state.lastAttackTime > attackInterval) {
      this.state.lastAttackTime = currentTime;
      this.state.isAssaulting = true;

      // Primary & Secondary strategic targets
      let targetPos: Vector2 = { ...this.mapData.playerSpawn };
      const playerRefineries = playerBuildings.filter(b => b.type === 'coin_generator' && b.hp > 0);
      const playerTurrets = playerBuildings.filter(b => (b.type === 'turret_gun' || b.type === 'turret_missile' || b.type === 'heavy_turret') && b.hp > 0);
      const playerHQ = playerBuildings.find(b => b.type === 'headquarters' && b.hp > 0);

      // Expert / Hard AI target selection
      if (this.difficulty === 'expert' || this.difficulty === 'hard') {
        if (playerRefineries.length > 0 && Math.random() < 0.65) {
          // Economic choke: target player's income
          targetPos = { x: playerRefineries[0].pixelX, y: playerRefineries[0].pixelY };
        } else if (playerHQ) {
          targetPos = { x: playerHQ.pixelX, y: playerHQ.pixelY };
        } else if (playerTurrets.length > 0) {
          targetPos = { x: playerTurrets[0].pixelX, y: playerTurrets[0].pixelY };
        } else if (playerUnits.length > 0) {
          targetPos = { x: playerUnits[0].x, y: playerUnits[0].y };
        }

        // Multi-pronged assault on Hard / Expert: split into Main Force + Flanking Detachment
        if (aliveUnits.length >= 8 && this.difficulty === 'expert') {
          const mainForce = aliveUnits.slice(0, Math.floor(aliveUnits.length * 0.7));
          const flankForce = aliveUnits.slice(Math.floor(aliveUnits.length * 0.7));

          // Main force attacks primary target
          onIssueUnitCommand(mainForce.map(u => u.id), targetPos, true);

          // Flanking detachment attacks alternate target (e.g. secondary refinery or player spawn)
          const flankTarget = playerRefineries.length > 1
            ? { x: playerRefineries[1].pixelX, y: playerRefineries[1].pixelY }
            : { x: this.mapData.playerSpawn.x + 80, y: this.mapData.playerSpawn.y - 80 };
          onIssueUnitCommand(flankForce.map(u => u.id), flankTarget, true);
          return;
        }
      } else {
        // Normal & Easy targeting
        if (playerHQ && Math.random() < 0.6) {
          targetPos = { x: playerHQ.pixelX, y: playerHQ.pixelY };
        } else if (playerRefineries.length > 0 && Math.random() < 0.5) {
          targetPos = { x: playerRefineries[0].pixelX, y: playerRefineries[0].pixelY };
        } else if (playerUnits.length > 0) {
          targetPos = { x: playerUnits[0].x, y: playerUnits[0].y };
        }
      }

      // Mobilize ~75% of army for assault, keep ~25% as base reserve
      const assaultUnits = aliveUnits.slice(0, Math.ceil(aliveUnits.length * 0.78));
      const assaultIds = assaultUnits.map(u => u.id);
      onIssueUnitCommand(assaultIds, targetPos, true);
    }
  }
}
