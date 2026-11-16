/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MapSize } from '../../types/game';
import { Density, Environment, GeneratedMap, MapGenParams, generateMap } from './generator';

/** The five V14 battlefields. Each is a seeded recipe; the default seed gives the "official" layout. */
export interface MapEntry {
  id: string;
  name: string;
  environment: Environment;
  description: string;
  defaultSeed: number;
  features: string[];
  recommended: string;   // recommended player count / difficulty note
}

export const MAP_CATALOG: MapEntry[] = [
  {
    id: 'temperate_warzone', name: 'Verdant Warzone', environment: 'temperate', defaultSeed: 1201,
    description: 'Rolling grassland with forest belts, rocky outcrops and dirt supply roads. Several open approaches and a contested centre deposit.',
    features: ['Forest cover', 'Three approach routes', 'Contested centre'], recommended: 'Balanced — good first map',
  },
  {
    id: 'desert_frontline', name: 'Desert Frontline', environment: 'desert', defaultSeed: 2207,
    description: 'Sand and rock with ridgelines broken by narrow passes, a dry riverbed across the middle and abandoned industrial blocks.',
    features: ['Ridgeline choke points', 'Dry riverbed', 'Open armour routes'], recommended: 'Armour-heavy play',
  },
  {
    id: 'urban_conflict', name: 'Urban Conflict Zone', environment: 'urban', defaultSeed: 3301,
    description: 'A ruined city grid: wide avenues, defensible intersections, rubble lots and many parallel routes between the bases.',
    features: ['Street grid', 'Ruined blocks', 'Many routes'], recommended: 'Infantry and close combat',
  },
  {
    id: 'mountain_stronghold', name: 'Mountain Stronghold', environment: 'mountain', defaultSeed: 4409,
    description: 'Rocky high ground and forested valleys. Ridges are crossed only through a few passes — natural defensive positions.',
    features: ['Narrow passes', 'Forested valleys', 'Defensible bases'], recommended: 'Defensive play',
  },
  {
    id: 'coastal_operations', name: 'Coastal Operations', environment: 'coastal', defaultSeed: 5503,
    description: 'Shoreline and open sea on two flanks, a river between the bases crossed by road bridges, and port facilities on the coast.',
    features: ['Bridge choke points', 'Coastal flanks', 'Port facilities'], recommended: 'Control the bridges',
  },
];

/** Older map ids (saves, campaign missions, settings) resolve to the closest V14 battlefield. */
export const LEGACY_MAP_IDS: Record<string, string> = {
  verdant_valley: 'temperate_warzone', verdant_frontier: 'temperate_warzone',
  river_delta: 'coastal_operations',
  desert_outpost: 'desert_frontline', desert_stronghold: 'desert_frontline',
  snow_tundra: 'mountain_stronghold', frozen_wasteland: 'mountain_stronghold', volcanic_frontier: 'mountain_stronghold',
  industrial_ruin: 'urban_conflict', industrial_warzone: 'urban_conflict',
};

export const resolveMapId = (id: string): string => (MAP_CATALOG.some(m => m.id === id) ? id : LEGACY_MAP_IDS[id] ?? 'temperate_warzone');
export const mapEntry = (id: string): MapEntry => MAP_CATALOG.find(m => m.id === resolveMapId(id))!;

export interface MapOptions {
  size?: MapSize;
  seed?: number;
  resourceDensity?: Density;
  forestDensity?: Density;
  obstacleDensity?: Density;
  roads?: boolean;
  layout?: 'diagonal' | 'horizontal';
}

export function mapParams(id: string, o: MapOptions = {}): MapGenParams {
  const e = mapEntry(id);
  return {
    environment: e.environment,
    size: o.size ?? 'medium',
    seed: o.seed ?? e.defaultSeed,
    resourceDensity: o.resourceDensity ?? 'normal',
    forestDensity: o.forestDensity ?? 'normal',
    obstacleDensity: o.obstacleDensity ?? 'normal',
    roads: o.roads ?? true,
    layout: o.layout ?? 'diagonal',
  };
}

const cache = new Map<string, GeneratedMap>();
/** Build (or reuse) a battlefield. Pure and deterministic; returns a fresh deep copy so matches never share state. */
export function buildMap(id: string, o: MapOptions = {}): GeneratedMap {
  const p = mapParams(id, o);
  const key = JSON.stringify([resolveMapId(id), p]);
  let m = cache.get(key);
  if (!m) {
    const e = mapEntry(id);
    m = generateMap(p, e.id, e.name);
    cache.set(key, m);
    if (cache.size > 12) cache.delete(cache.keys().next().value as string);
  }
  return JSON.parse(JSON.stringify(m)) as GeneratedMap;
}
