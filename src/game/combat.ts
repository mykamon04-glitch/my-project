/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { UNIT_CONFIGS } from '../data/gameData';
import { FloatingText, Particle, Unit, Vector2, Wreckage } from '../types/game';

// Damage type effectiveness calculation
export function calculateDamage(
  attackerType: string,
  attackerCategory: 'infantry' | 'vehicle' | 'aircraft' | 'building',
  targetCategory: 'infantry' | 'vehicle' | 'aircraft' | 'building',
  baseDamage: number,
  targetArmor: number,
  isAntiAirAttacker: boolean = false
): number {
  let multiplier = 1.0;

  // Anti-Air calculations
  if (targetCategory === 'aircraft') {
    if (isAntiAirAttacker || attackerType === 'aa_vehicle' || attackerType === 'mobile_sam' || attackerType === 'turret_aa') {
      multiplier = 2.4; // Anti-air systems shred aircraft
    } else {
      multiplier = 0.25; // Normal ground fire is ineffective against flying aircraft
    }
  } else if (attackerCategory === 'aircraft') {
    if (attackerType === 'stealth_fighter') {
      multiplier = targetCategory === 'building' ? 2.0 : targetCategory === 'vehicle' ? 1.6 : 1.2;
    } else if (attackerType === 'attack_helicopter') {
      multiplier = targetCategory === 'vehicle' ? 1.5 : targetCategory === 'infantry' ? 1.3 : 1.0;
    }
  } else if (attackerCategory === 'infantry') {
    if (attackerType === 'rocket_soldier') {
      multiplier = targetCategory === 'vehicle' ? 1.55 : targetCategory === 'building' ? 1.35 : 0.8;
    } else if (attackerType === 'sniper') {
      multiplier = targetCategory === 'infantry' ? 1.9 : 0.25;
    } else if (attackerType === 'grenadier') {
      multiplier = targetCategory === 'infantry' ? 1.4 : targetCategory === 'building' ? 1.3 : 0.9;
    } else if (attackerType === 'flamethrower') {
      multiplier = targetCategory === 'infantry' ? 1.7 : targetCategory === 'building' ? 1.4 : 0.4;
    } else if (attackerType === 'commando') {
      multiplier = targetCategory === 'building' ? 1.8 : 1.2;
    } else {
      multiplier = targetCategory === 'infantry' ? 1.0 : targetCategory === 'vehicle' ? 0.45 : 0.6;
    }
  } else if (attackerCategory === 'vehicle') {
    if (attackerType === 'artillery') {
      multiplier = targetCategory === 'building' ? 2.0 : targetCategory === 'vehicle' ? 1.25 : 1.5;
    } else if (attackerType === 'siege_tank') {
      multiplier = targetCategory === 'building' ? 1.8 : targetCategory === 'vehicle' ? 1.5 : 1.0;
    } else if (attackerType === 'light_tank' || attackerType === 'main_battle_tank' || attackerType === 'heavy_tank') {
      multiplier = targetCategory === 'vehicle' ? 1.35 : targetCategory === 'building' ? 1.25 : 0.85;
    }
  }

  // Armor mitigation formula: damage * 100 / (100 + armor * 1.5)
  const armorFactor = 100 / (100 + Math.max(0, targetArmor) * 1.5);
  const total = Math.max(3, Math.round(baseDamage * multiplier * armorFactor));
  return total;
}

export function getDistance(a: Vector2, b: Vector2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function getAngle(from: Vector2, to: Vector2): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

export function lerpAngle(current: number, target: number, speed: number): number {
  let diff = (target - current) % (Math.PI * 2);
  if (diff < -Math.PI) diff += Math.PI * 2;
  if (diff > Math.PI) diff -= Math.PI * 2;
  return current + Math.max(-speed, Math.min(speed, diff));
}

export function recordKill(unit: Unit, floatingTexts: FloatingText[]): void {
  unit.kills++;
  const oldRank = unit.rank;

  if (unit.kills >= 12 && unit.rank < 3) {
    unit.rank = 3; // Ace
  } else if (unit.kills >= 6 && unit.rank < 2) {
    unit.rank = 2; // Elite
  } else if (unit.kills >= 2 && unit.rank < 1) {
    unit.rank = 1; // Veteran
  }

  if (unit.rank > oldRank) {
    const config = UNIT_CONFIGS[unit.type];
    const bonusHp = Math.round(config.maxHp * 0.25);
    unit.maxHp += bonusHp;
    unit.hp = Math.min(unit.maxHp, unit.hp + bonusHp);

    floatingTexts.push({
      id: Math.random().toString(),
      x: unit.x,
      y: unit.y - 25,
      text: unit.rank === 3 ? '⭐ ACE RANK!' : unit.rank === 2 ? '⭐ ELITE!' : '⭐ VETERAN!',
      color: '#f59e0b',
      life: 0,
      maxLife: 1.6,
    });
  }
}

export function createWreckage(unit: Unit): Wreckage {
  return {
    id: Math.random().toString(),
    x: unit.x,
    y: unit.y,
    rotation: unit.rotation,
    type: unit.type,
    life: 0,
    maxLife: 25,
  };
}

export function createExplosionParticles(x: number, y: number, isLarge: boolean = false): Particle[] {
  const particles: Particle[] = [];
  const count = isLarge ? 32 : 18;

  // Expanding shockwave ring
  particles.push({
    x,
    y,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 0.35,
    color: '#ffffff',
    size: isLarge ? 48 : 26,
    alpha: 0.9,
    type: 'shockwave',
  });

  // Hot Fire debris
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = (Math.random() * 90 + 35) * (isLarge ? 1.7 : 1.0);
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0,
      maxLife: Math.random() * 0.45 + 0.3,
      color: Math.random() > 0.4 ? '#f97316' : '#ef4444',
      size: Math.random() * 5 + 3,
      alpha: 1.0,
      type: 'fire',
    });
  }

  // Brief light smoke puffs (clean, non-obscuring)
  const smokeCount = isLarge ? 4 : 2;
  for (let i = 0; i < smokeCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 20 + 8;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 8,
      life: 0,
      maxLife: Math.random() * 0.3 + 0.25,
      color: '#475569',
      size: Math.random() * 3 + 3,
      alpha: 0.4,
      type: 'smoke',
    });
  }

  return particles;
}

export function createDustParticles(x: number, y: number): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < 2; i++) {
    particles.push({
      x: x + (Math.random() - 0.5) * 6,
      y: y + (Math.random() - 0.5) * 6,
      vx: (Math.random() - 0.5) * 8,
      vy: -Math.random() * 6,
      life: 0,
      maxLife: 0.2,
      color: '#64748b',
      size: 2,
      alpha: 0.25,
      type: 'dust',
    });
  }
  return particles;
}

export function createHealParticles(x: number, y: number): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < 4; i++) {
    particles.push({
      x: x + (Math.random() - 0.5) * 16,
      y: y + (Math.random() - 0.5) * 16,
      vx: (Math.random() - 0.5) * 15,
      vy: -Math.random() * 25 - 10,
      life: 0,
      maxLife: 0.5,
      color: '#10b981',
      size: 3,
      alpha: 0.8,
      type: 'heal',
    });
  }
  return particles;
}

export function createRepairParticles(x: number, y: number): Particle[] {
  const particles: Particle[] = [];
  const count = 5;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 40 + 15;
    particles.push({
      x: x + (Math.random() - 0.5) * 8,
      y: y + (Math.random() - 0.5) * 8,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 10,
      life: 0,
      maxLife: 0.25 + Math.random() * 0.15,
      color: Math.random() > 0.4 ? '#38bdf8' : '#facc15',
      size: 2.5,
      alpha: 0.95,
      type: 'spark',
    });
  }
  return particles;
}

export function createMuzzleFlashParticles(x: number, y: number, angle: number, isLarge: boolean = false): Particle[] {
  const particles: Particle[] = [];
  const count = isLarge ? 5 : 3;
  // Core spark
  particles.push({
    x,
    y,
    vx: Math.cos(angle) * (isLarge ? 70 : 40),
    vy: Math.sin(angle) * (isLarge ? 70 : 40),
    life: 0,
    maxLife: 0.08,
    color: '#fef08a',
    size: isLarge ? 8 : 4.5,
    alpha: 1.0,
    type: 'spark',
  });
  for (let i = 0; i < count; i++) {
    const spread = angle + (Math.random() - 0.5) * 0.7;
    const speed = (Math.random() * 45 + 30) * (isLarge ? 1.5 : 1.0);
    particles.push({
      x,
      y,
      vx: Math.cos(spread) * speed,
      vy: Math.sin(spread) * speed,
      life: 0,
      maxLife: 0.12,
      color: Math.random() > 0.4 ? '#f59e0b' : '#ef4444',
      size: Math.random() * 2.5 + 1.5,
      alpha: 0.9,
      type: 'spark',
    });
  }
  return particles;
}

export function createEngineSmokeParticles(x: number, y: number, isHeavy: boolean = false): Particle[] {
  const particles: Particle[] = [];
  const count = isHeavy ? 2 : 1;
  for (let i = 0; i < count; i++) {
    particles.push({
      x: x + (Math.random() - 0.5) * 4,
      y: y + (Math.random() - 0.5) * 4,
      vx: (Math.random() - 0.5) * 12,
      vy: -Math.random() * 18 - 8,
      life: 0,
      maxLife: Math.random() * 0.35 + 0.25,
      color: isHeavy && Math.random() < 0.4 ? '#f97316' : '#334155',
      size: Math.random() * 3 + 3,
      alpha: 0.5,
      type: 'smoke',
    });
  }
  return particles;
}

