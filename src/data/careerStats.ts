/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CareerStats {
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  unitsBuilt: number;
  enemiesNeutralized: number;
  creditsEarned: number;
  nukesLaunched: number;
  threatsIntercepted: number;
  highestDefenseWave: number;
  campaignMissionsCleared: number;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: 'combat' | 'defense' | 'economy' | 'tech';
  unlocked: boolean;
  unlockedAt?: number;
  progress?: number;
  maxProgress?: number;
}

const DEFAULT_STATS: CareerStats = {
  matchesPlayed: 0,
  matchesWon: 0,
  matchesLost: 0,
  unitsBuilt: 0,
  enemiesNeutralized: 0,
  creditsEarned: 0,
  nukesLaunched: 0,
  threatsIntercepted: 0,
  highestDefenseWave: 0,
  campaignMissionsCleared: 0,
};

const ACHIEVEMENTS_DEF: Omit<Achievement, 'unlocked' | 'unlockedAt'>[] = [
  {
    id: 'first_blood',
    title: 'First Blood',
    description: 'Neutralize your first hostile enemy unit or structure.',
    icon: 'Crosshair',
    category: 'combat',
  },
  {
    id: 'first_victory',
    title: 'Operation First Strike',
    description: 'Claim victory in any Skirmish, Campaign, or Defense match.',
    icon: 'Trophy',
    category: 'combat',
  },
  {
    id: 'radar_aegis',
    title: 'Aegis Sentinel',
    description: 'Construct an Advanced Radar Station and activate Automated Base Defense.',
    icon: 'Radio',
    category: 'defense',
  },
  {
    id: 'armored_vanguard',
    title: 'Steel Vanguard',
    description: 'Construct a Tank Factory and command 5+ Main Battle Tanks.',
    icon: 'Shield',
    category: 'combat',
  },
  {
    id: 'sky_sovereign',
    title: 'Sky Sovereign',
    description: 'Build an Airfield and deploy Attack Helicopters or Stealth Fighters.',
    icon: 'Plane',
    category: 'combat',
  },
  {
    id: 'nuclear_deterrent',
    title: 'Atomic Authority',
    description: 'Construct a Nuclear Silo and deploy a tactical nuclear strike.',
    icon: 'Flame',
    category: 'combat',
  },
  {
    id: 'apex_tech',
    title: 'Technological Apex',
    description: 'Construct a Tech Center and complete composite armor & heavy ordnance research.',
    icon: 'Cpu',
    category: 'tech',
  },
  {
    id: 'fortress_survivor',
    title: 'Iron Bulwark',
    description: 'Survive wave 5 or higher in Endless Fortress Defense mode.',
    icon: 'Castle',
    category: 'defense',
  },
  {
    id: 'supreme_commander',
    title: 'Supreme Commander',
    description: 'Win 5 tactical matches across any theater of war.',
    icon: 'Medal',
    category: 'combat',
  },
];

const STATS_STORAGE_KEY = 'iron_dominion_career_stats';
const ACHIEVEMENTS_STORAGE_KEY = 'iron_dominion_achievements';

export function getCareerStats(): CareerStats {
  try {
    const raw = localStorage.getItem(STATS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATS };
    return { ...DEFAULT_STATS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_STATS };
  }
}

export function saveCareerStats(stats: CareerStats): void {
  try {
    localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(stats));
  } catch {
    //
  }
}

export function getAchievements(): Achievement[] {
  try {
    const raw = localStorage.getItem(ACHIEVEMENTS_STORAGE_KEY);
    const unlockedMap: Record<string, number> = raw ? JSON.parse(raw) : {};
    return ACHIEVEMENTS_DEF.map(def => ({
      ...def,
      unlocked: !!unlockedMap[def.id],
      unlockedAt: unlockedMap[def.id],
    }));
  } catch {
    return ACHIEVEMENTS_DEF.map(def => ({ ...def, unlocked: false }));
  }
}

export function unlockAchievement(id: string): boolean {
  try {
    const raw = localStorage.getItem(ACHIEVEMENTS_STORAGE_KEY);
    const unlockedMap: Record<string, number> = raw ? JSON.parse(raw) : {};
    if (!unlockedMap[id]) {
      unlockedMap[id] = Date.now();
      localStorage.setItem(ACHIEVEMENTS_STORAGE_KEY, JSON.stringify(unlockedMap));
      return true;
    }
  } catch {
    //
  }
  return false;
}

export function recordMatchProgress(params: {
  won?: boolean;
  lost?: boolean;
  unitsBuilt?: number;
  kills?: number;
  creditsEarned?: number;
  nukeLaunched?: boolean;
  defenseWave?: number;
  threatsIntercepted?: number;
  campaignCleared?: boolean;
}): void {
  const stats = getCareerStats();

  if (params.won) {
    stats.matchesPlayed += 1;
    stats.matchesWon += 1;
    unlockAchievement('first_victory');
    if (stats.matchesWon >= 5) unlockAchievement('supreme_commander');
  } else if (params.lost) {
    stats.matchesPlayed += 1;
    stats.matchesLost += 1;
  }

  if (params.unitsBuilt) stats.unitsBuilt += params.unitsBuilt;
  if (params.kills) {
    stats.enemiesNeutralized += params.kills;
    if (stats.enemiesNeutralized > 0) unlockAchievement('first_blood');
  }
  if (params.creditsEarned) stats.creditsEarned += params.creditsEarned;
  if (params.nukeLaunched) {
    stats.nukesLaunched += 1;
    unlockAchievement('nuclear_deterrent');
  }
  if (params.threatsIntercepted) {
    stats.threatsIntercepted += params.threatsIntercepted;
  }
  if (params.defenseWave && params.defenseWave > stats.highestDefenseWave) {
    stats.highestDefenseWave = params.defenseWave;
    if (params.defenseWave >= 5) unlockAchievement('fortress_survivor');
  }
  if (params.campaignCleared) {
    stats.campaignMissionsCleared += 1;
  }

  saveCareerStats(stats);
}
