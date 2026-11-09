/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MapData, MapProp, MapSize, Vector2 } from '../types/game';

export function getDimensionForSize(size?: MapSize): number {
  if (size === 'small') return 48;
  if (size === 'large') return 80;
  if (size === 'extra_large') return 96;
  return 64; // medium default
}

export const MAP_PRESETS: Record<
  string,
  {
    name: string;
    biome: 'temperate' | 'desert' | 'snow' | 'urban' | 'volcanic' | 'industrial';
    description: string;
    generator: (size?: MapSize) => MapData;
  }
> = {
  verdant_valley: {
    name: 'Verdant Frontier',
    biome: 'temperate',
    description: 'A lush temperate valley with central asphalt highways, dense pine groves, rocky ridges, and rich titanium nodes.',
    generator: (s?: MapSize) => generateVerdantValley(s),
  },
  verdant_frontier: {
    name: 'Verdant Frontier',
    biome: 'temperate',
    description: 'A lush temperate valley with central asphalt highways, dense pine groves, rocky ridges, and rich titanium nodes.',
    generator: (s?: MapSize) => generateVerdantValley(s),
  },
  river_delta: {
    name: 'River Delta',
    biome: 'temperate',
    description: 'Two fortified riverbanks divided by a deep flowing channel with two contested stone bridges and sandbag barricades.',
    generator: (s?: MapSize) => generateRiverDelta(s),
  },
  desert_outpost: {
    name: 'Desert Stronghold',
    biome: 'desert',
    description: 'Sun-scorched arid canyons and rocky defiles surrounding valuable geothermal vents, oil derricks, and sand dunes.',
    generator: (s?: MapSize) => generateDesertOutpost(s),
  },
  desert_stronghold: {
    name: 'Desert Stronghold',
    biome: 'desert',
    description: 'Sun-scorched arid canyons and rocky defiles surrounding valuable geothermal vents, oil derricks, and sand dunes.',
    generator: (s?: MapSize) => generateDesertOutpost(s),
  },
  snow_tundra: {
    name: 'Frozen Wasteland',
    biome: 'snow',
    description: 'Sub-zero glacial tundra with frozen lakes, snow drifts, pine forests, and icy mountain corridors.',
    generator: (s?: MapSize) => generateSnowTundra(s),
  },
  frozen_wasteland: {
    name: 'Frozen Wasteland',
    biome: 'snow',
    description: 'Sub-zero glacial tundra with frozen lakes, snow drifts, pine forests, and icy mountain corridors.',
    generator: (s?: MapSize) => generateSnowTundra(s),
  },
  industrial_ruin: {
    name: 'Industrial Warzone',
    biome: 'industrial',
    description: 'A war-torn industrial citadel with cracked concrete avenues, bombed brick plazas, and concrete blast barricades.',
    generator: (s?: MapSize) => generateIndustrialRuin(s),
  },
  industrial_warzone: {
    name: 'Industrial Warzone',
    biome: 'industrial',
    description: 'A war-torn industrial citadel with cracked concrete avenues, bombed brick plazas, and concrete blast barricades.',
    generator: (s?: MapSize) => generateIndustrialRuin(s),
  },
  volcanic_frontier: {
    name: 'Volcanic Frontier',
    biome: 'volcanic',
    description: 'Hazardous basalt badlands with active geothermal fissures, obsidian rock spires, and rich crystallized ore vents.',
    generator: (s?: MapSize) => generateVolcanicFrontier(s),
  },
  urban_conflict: {
    name: 'Urban Conflict',
    biome: 'urban',
    description: 'Dense metropolitan avenues, reinforced road checkpoints, shattered commercial plazas, and high-value logistics hubs.',
    generator: (s?: MapSize) => generateUrbanConflict(s),
  },
};

export function generateVerdantValley(size?: MapSize): MapData {
  const dim = getDimensionForSize(size);
  const width = dim;
  const height = dim;
  const tileSize = 40;
  const tiles: number[][] = [];
  const props: MapProp[] = [];

  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) {
      row.push(0); // grass
    }
    tiles.push(row);
  }

  // Seamless open terrain generation (no artificial rectangular border or cliff frames)

  // Forest clusters
  const forestPockets = [
    { x: 18, y: 14, r: 4 },
    { x: 42, y: 46, r: 5 },
    { x: 30, y: 18, r: 3 },
    { x: 34, y: 44, r: 3 },
  ];
  forestPockets.forEach(p => {
    for (let dy = -p.r; dy <= p.r; dy++) {
      for (let dx = -p.r; dx <= p.r; dx++) {
        const nx = p.x + dx;
        const ny = p.y + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          if (dx * dx + dy * dy <= p.r * p.r && tiles[ny][nx] === 0) {
            tiles[ny][nx] = 5; // forest
            // Place tree prop
            if (Math.random() < 0.6) {
              props.push({
                id: `tree_${nx}_${ny}`,
                x: nx * tileSize + tileSize / 2 + (Math.random() - 0.5) * 10,
                y: ny * tileSize + tileSize / 2 + (Math.random() - 0.5) * 10,
                type: 'tree',
                size: Math.random() * 8 + 14,
                rotation: Math.random() * Math.PI * 2,
              });
            }
          }
        }
      }
    }
  });

  // Rocks along cliffs
  for (let i = 0; i < 22; i++) {
    const rx = Math.floor(Math.random() * width);
    const ry = Math.floor(Math.random() * height);
    if (tiles[ry][rx] === 0 || tiles[ry][rx] === 1) {
      props.push({
        id: `rock_${i}`,
        x: rx * tileSize + tileSize / 2,
        y: ry * tileSize + tileSize / 2,
        type: 'rock',
        size: Math.random() * 6 + 10,
        rotation: Math.random() * Math.PI * 2,
      });
    }
  }

  // Natural landscape props and central battlefield wreckage
  props.push({ id: 'field_rock_1', x: 24 * tileSize, y: 44 * tileSize, type: 'rock', size: 16, rotation: 0.3 });
  props.push({ id: 'wreck_1', x: 31 * tileSize, y: 35 * tileSize, type: 'wreck', size: 22, rotation: 0.8 });

  // Resource nodes (Titanium deposits)
  const resourceNodes = [
    { x: 12, y: 48, amount: 28000, remaining: 28000 },
    { x: 16, y: 52, amount: 22000, remaining: 22000 },
    { x: 32, y: 32, amount: 45000, remaining: 45000 }, // Contested central node
    { x: 48, y: 12, amount: 28000, remaining: 28000 },
    { x: 52, y: 16, amount: 22000, remaining: 22000 },
  ];

  const playerSpawn = { x: Math.round(dim * 0.16) * tileSize, y: Math.round(dim * 0.82) * tileSize };
  const enemySpawn = { x: Math.round(dim * 0.82) * tileSize, y: Math.round(dim * 0.16) * tileSize };
  const vegetation = populateNaturalVegetation('verdant_valley', width, height, tileSize, tiles, playerSpawn, enemySpawn, resourceNodes, 'temperate');
  props.push(...vegetation);

  return {
    id: 'verdant_valley',
    name: 'Verdant Valley',
    biome: 'temperate',
    width,
    height,
    tileSize,
    tiles,
    resourceNodes,
    props,
    playerSpawn,
    enemySpawn,
  };
}

export function generateRiverDelta(size?: MapSize): MapData {
  const dim = getDimensionForSize(size);
  const width = dim;
  const height = dim;
  const tileSize = 40;
  const tiles: number[][] = [];
  const props: MapProp[] = [];

  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) {
      row.push(0);
    }
    tiles.push(row);
  }

  // Seamless open river delta terrain
  // Winding natural river
  for (let x = 0; x < width; x++) {
    const riverY = Math.floor(height - x - 2 + Math.sin(x * 0.2) * 2.5);
    for (let w = -2; w <= 2; w++) {
      const ry = riverY + w;
      if (ry >= 0 && ry < height) {
        tiles[ry][x] = 3; // water
      }
    }
  }

  // Bridge 1 (Northern Crossing)
  const b1X = 20;
  const b1Y = Math.floor(height - b1X - 2 + Math.sin(b1X * 0.2) * 2.5);
  for (let w = -3; w <= 3; w++) {
    for (let bw = -1; bw <= 1; bw++) {
      const by = b1Y + w;
      const bx = b1X + bw;
      if (by >= 0 && by < height && bx >= 0 && bx < width) {
        tiles[by][bx] = 2; // stone bridge
      }
    }
  }

  // Bridge 2 (Southern Crossing)
  const b2X = 44;
  const b2Y = Math.floor(height - b2X - 2 + Math.sin(b2X * 0.2) * 2.5);
  for (let w = -3; w <= 3; w++) {
    for (let bw = -1; bw <= 1; bw++) {
      const by = b2Y + w;
      const bx = b2X + bw;
      if (by >= 0 && by < height && bx >= 0 && bx < width) {
        tiles[by][bx] = 2; // bridge
      }
    }
  }

  // Trees and rocks on river banks
  for (let i = 0; i < 28; i++) {
    const rx = Math.floor(Math.random() * width);
    const ry = Math.floor(Math.random() * height);
    if (tiles[ry][rx] === 0) {
      props.push({
        id: `delta_tree_${i}`,
        x: rx * tileSize + tileSize / 2,
        y: ry * tileSize + tileSize / 2,
        type: Math.random() < 0.65 ? 'tree' : 'rock',
        size: Math.random() * 8 + 12,
        rotation: Math.random() * Math.PI * 2,
      });
    }
  }

  const resourceNodes = [
    { x: 14, y: 50, amount: 28000, remaining: 28000 },
    { x: 22, y: 40, amount: 35000, remaining: 35000 },
    { x: 42, y: 22, amount: 35000, remaining: 35000 },
    { x: 50, y: 14, amount: 28000, remaining: 28000 },
  ];

  const playerSpawn = { x: Math.round(dim * 0.18) * tileSize, y: Math.round(dim * 0.82) * tileSize };
  const enemySpawn = { x: Math.round(dim * 0.82) * tileSize, y: Math.round(dim * 0.18) * tileSize };
  const vegetation = populateNaturalVegetation('river_delta', width, height, tileSize, tiles, playerSpawn, enemySpawn, resourceNodes, 'temperate');
  props.push(...vegetation);

  return {
    id: 'river_delta',
    name: 'River Delta',
    biome: 'temperate',
    width,
    height,
    tileSize,
    tiles,
    resourceNodes,
    props,
    playerSpawn,
    enemySpawn,
  };
}

export function generateDesertOutpost(size?: MapSize): MapData {
  const dim = getDimensionForSize(size);
  const width = dim;
  const height = dim;
  const tileSize = 40;
  const tiles: number[][] = [];
  const props: MapProp[] = [];

  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) {
      row.push(1); // 1: sand / arid dirt
    }
    tiles.push(row);
  }

  // Seamless open desert canyons (no artificial rectangular border)

  // Desert Boulders & Abandoned Tank Husks
  for (let i = 0; i < 24; i++) {
    const rx = Math.floor(Math.random() * width);
    const ry = Math.floor(Math.random() * height);
    if (tiles[ry][rx] === 1) {
      props.push({
        id: `desert_boulder_${i}`,
        x: rx * tileSize + tileSize / 2,
        y: ry * tileSize + tileSize / 2,
        type: i % 5 === 0 ? 'wreck' : 'rock',
        size: Math.random() * 8 + 12,
        rotation: Math.random() * Math.PI * 2,
      });
    }
  }

  const resourceNodes = [
    { x: Math.round(dim * 0.18), y: Math.round(dim * 0.8), amount: 32000, remaining: 32000 },
    { x: Math.round(dim * 0.5), y: Math.round(dim * 0.5), amount: 55000, remaining: 55000 },
    { x: Math.round(dim * 0.8), y: Math.round(dim * 0.18), amount: 32000, remaining: 32000 },
  ];

  const playerSpawn = { x: Math.round(dim * 0.18) * tileSize, y: Math.round(dim * 0.82) * tileSize };
  const enemySpawn = { x: Math.round(dim * 0.82) * tileSize, y: Math.round(dim * 0.18) * tileSize };
  const vegetation = populateNaturalVegetation('desert_outpost', width, height, tileSize, tiles, playerSpawn, enemySpawn, resourceNodes, 'desert');
  props.push(...vegetation);

  return {
    id: 'desert_outpost',
    name: 'Obsidian Canyons',
    biome: 'desert',
    width,
    height,
    tileSize,
    tiles,
    resourceNodes,
    props,
    playerSpawn,
    enemySpawn,
  };
}

export function generateSnowTundra(size?: MapSize): MapData {
  const dim = getDimensionForSize(size);
  const width = dim;
  const height = dim;
  const tileSize = 40;
  const tiles: number[][] = [];
  const props: MapProp[] = [];

  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) {
      row.push(0); // 0: snow
    }
    tiles.push(row);
  }

  // Seamless glacial snow tundra (no artificial rectangular border)
  // Frozen river / Ice sheets (tile 3: frozen water)
  for (let x = 0; x < width; x++) {
    const iceY = Math.floor(x * 0.9 + 5 + Math.sin(x * 0.3) * 2);
    for (let w = -1; w <= 1; w++) {
      const iy = iceY + w;
      if (iy >= 0 && iy < height) {
        tiles[iy][x] = 3;
      }
    }
  }

  // Snowy Pine Trees
  for (let i = 0; i < 35; i++) {
    const rx = Math.floor(Math.random() * width);
    const ry = Math.floor(Math.random() * height);
    if (tiles[ry][rx] === 0) {
      props.push({
        id: `snow_pine_${i}`,
        x: rx * tileSize + tileSize / 2,
        y: ry * tileSize + tileSize / 2,
        type: 'tree',
        size: Math.random() * 8 + 14,
        rotation: Math.random() * Math.PI * 2,
      });
    }
  }

  const resourceNodes = [
    { x: Math.round(dim * 0.18), y: Math.round(dim * 0.8), amount: 30000, remaining: 30000 },
    { x: Math.round(dim * 0.5), y: Math.round(dim * 0.5), amount: 48000, remaining: 48000 },
    { x: Math.round(dim * 0.8), y: Math.round(dim * 0.18), amount: 30000, remaining: 30000 },
  ];

  const playerSpawn = { x: Math.round(dim * 0.16) * tileSize, y: Math.round(dim * 0.82) * tileSize };
  const enemySpawn = { x: Math.round(dim * 0.82) * tileSize, y: Math.round(dim * 0.16) * tileSize };
  const vegetation = populateNaturalVegetation('snow_tundra', width, height, tileSize, tiles, playerSpawn, enemySpawn, resourceNodes, 'snow');
  props.push(...vegetation);

  return {
    id: 'snow_tundra',
    name: 'Frostbite Pass',
    biome: 'snow',
    width,
    height,
    tileSize,
    tiles,
    resourceNodes,
    props,
    playerSpawn,
    enemySpawn,
  };
}

export function generateIndustrialRuin(size?: MapSize): MapData {
  const dim = getDimensionForSize(size);
  const width = dim;
  const height = dim;
  const tileSize = 40;
  const tiles: number[][] = [];
  const props: MapProp[] = [];

  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) {
      row.push(1); // asphalt / rubble dirt
    }
    tiles.push(row);
  }

  // Seamless urban citadel sector (no artificial perimeter cliff border)

  // Concrete barricades, urban ruins, and wrecked vehicles
  for (let i = 0; i < 20; i++) {
    const rx = Math.floor(Math.random() * width);
    const ry = Math.floor(Math.random() * height);
    if (tiles[ry][rx] === 1) {
      props.push({
        id: `urban_prop_${i}`,
        x: rx * tileSize + tileSize / 2,
        y: ry * tileSize + tileSize / 2,
        type: i % 2 === 0 ? 'barricade' : 'wreck',
        size: Math.random() * 6 + 16,
        rotation: Math.random() * Math.PI * 2,
      });
    }
  }

  const resourceNodes = [
    { x: Math.round(dim * 0.16), y: Math.round(dim * 0.82), amount: 32000, remaining: 32000 },
    { x: Math.round(dim * 0.5), y: Math.round(dim * 0.5), amount: 48000, remaining: 48000 },
    { x: Math.round(dim * 0.82), y: Math.round(dim * 0.16), amount: 32000, remaining: 32000 },
  ];

  const playerSpawn = { x: Math.round(dim * 0.16) * tileSize, y: Math.round(dim * 0.82) * tileSize };
  const enemySpawn = { x: Math.round(dim * 0.82) * tileSize, y: Math.round(dim * 0.16) * tileSize };
  const vegetation = populateNaturalVegetation('industrial_ruin', width, height, tileSize, tiles, playerSpawn, enemySpawn, resourceNodes, 'urban');
  props.push(...vegetation);

  return {
    id: 'industrial_ruin',
    name: 'Industrial Warzone',
    biome: 'industrial',
    width,
    height,
    tileSize,
    tiles,
    resourceNodes,
    props,
    playerSpawn,
    enemySpawn,
  };
}

export function generateVolcanicFrontier(size?: MapSize): MapData {
  const width = getDimensionForSize(size);
  const height = width;
  const tileSize = 40;
  const tiles: number[][] = [];
  const props: MapProp[] = [];

  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) {
      row.push(0); // dark basalt / volcanic soil
    }
    tiles.push(row);
  }

  // Lava fissure veins across diagonal
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const distFromDiag = Math.abs(x + y - width);
      if (distFromDiag < 2 && Math.sin(x * 0.4) > 0.2) {
        tiles[y][x] = 1; // ash dirt border
      }
    }
  }

  // Obsidian rock spires and mineral formations
  for (let i = 0; i < 28; i++) {
    const rx = Math.floor(Math.random() * width);
    const ry = Math.floor(Math.random() * height);
    props.push({
      id: `volcanic_rock_${i}`,
      x: rx * tileSize + tileSize / 2,
      y: ry * tileSize + tileSize / 2,
      type: 'rock',
      size: Math.random() * 8 + 12,
      rotation: Math.random() * Math.PI * 2,
    });
  }

  // Resource nodes (Crystallized volcanic geothermal nodes)
  const spawnMargin = Math.floor(width * 0.16);
  const oppMargin = width - spawnMargin;
  const mid = Math.floor(width / 2);

  const resourceNodes = [
    { x: spawnMargin, y: oppMargin - 4, amount: 30000, remaining: 30000 },
    { x: spawnMargin + 4, y: oppMargin, amount: 26000, remaining: 26000 },
    { x: mid, y: mid, amount: 55000, remaining: 55000 }, // High-yield contested central core
    { x: oppMargin - 4, y: spawnMargin, amount: 26000, remaining: 26000 },
    { x: oppMargin, y: spawnMargin + 4, amount: 30000, remaining: 30000 },
  ];

  const playerSpawn = { x: spawnMargin * tileSize, y: oppMargin * tileSize };
  const enemySpawn = { x: oppMargin * tileSize, y: spawnMargin * tileSize };
  const vegetation = populateNaturalVegetation('volcanic_frontier', width, height, tileSize, tiles, playerSpawn, enemySpawn, resourceNodes, 'volcanic');
  props.push(...vegetation);

  return {
    id: 'volcanic_frontier',
    name: 'Volcanic Frontier',
    biome: 'volcanic',
    width,
    height,
    tileSize,
    tiles,
    resourceNodes,
    props,
    playerSpawn,
    enemySpawn,
  };
}

export function generateUrbanConflict(size?: MapSize): MapData {
  const width = getDimensionForSize(size);
  const height = width;
  const tileSize = 40;
  const tiles: number[][] = [];
  const props: MapProp[] = [];

  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) {
      // Paved urban avenues with concrete sections
      const isRoadX = x % 10 === 0 || (x + 1) % 10 === 0;
      const isRoadY = y % 10 === 0 || (y + 1) % 10 === 0;
      row.push(isRoadX || isRoadY ? 2 : 1);
    }
    tiles.push(row);
  }

  // Urban props: Barricades, wrecks, ruins
  for (let i = 0; i < 26; i++) {
    const rx = Math.floor(Math.random() * (width - 4)) + 2;
    const ry = Math.floor(Math.random() * (height - 4)) + 2;
    props.push({
      id: `urban_defense_${i}`,
      x: rx * tileSize + tileSize / 2,
      y: ry * tileSize + tileSize / 2,
      type: i % 3 === 0 ? 'sandbags' : i % 3 === 1 ? 'barricade' : 'wreck',
      size: Math.random() * 6 + 14,
      rotation: Math.random() * Math.PI * 2,
    });
  }

  const spawnMargin = Math.floor(width * 0.16);
  const oppMargin = width - spawnMargin;
  const mid = Math.floor(width / 2);

  const resourceNodes = [
    { x: spawnMargin, y: oppMargin - 4, amount: 32000, remaining: 32000 },
    { x: mid, y: mid, amount: 50000, remaining: 50000 },
    { x: oppMargin, y: spawnMargin + 4, amount: 32000, remaining: 32000 },
  ];

  const playerSpawn = { x: spawnMargin * tileSize, y: oppMargin * tileSize };
  const enemySpawn = { x: oppMargin * tileSize, y: spawnMargin * tileSize };
  const vegetation = populateNaturalVegetation('urban_conflict', width, height, tileSize, tiles, playerSpawn, enemySpawn, resourceNodes, 'urban');
  props.push(...vegetation);

  return {
    id: 'urban_conflict',
    name: 'Urban Conflict',
    biome: 'urban',
    width,
    height,
    tileSize,
    tiles,
    resourceNodes,
    props,
    playerSpawn,
    enemySpawn,
  };
}

function createDeterministicRandom(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function populateNaturalVegetation(
  mapId: string,
  width: number,
  height: number,
  tileSize: number,
  tiles: number[][],
  playerSpawn: Vector2,
  enemySpawn: Vector2,
  resourceNodes: { x: number; y: number }[],
  biome: 'temperate' | 'desert' | 'snow' | 'urban' | 'volcanic' | 'industrial'
): MapProp[] {
  const seed = mapId.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 1337);
  const rand = createDeterministicRandom(seed);
  const props: MapProp[] = [];

  const isClearOfImportantSites = (px: number, py: number, clearanceTiles = 5.5) => {
    const minClearDist = clearanceTiles * tileSize;
    if (Math.hypot(px - playerSpawn.x, py - playerSpawn.y) < minClearDist) return false;
    if (Math.hypot(px - enemySpawn.x, py - enemySpawn.y) < minClearDist) return false;
    for (const rn of resourceNodes) {
      if (Math.hypot(px - (rn.x * tileSize + tileSize / 2), py - (rn.y * tileSize + tileSize / 2)) < 3.8 * tileSize) {
        return false;
      }
    }
    const gx = Math.floor(px / tileSize);
    const gy = Math.floor(py / tileSize);
    if (gx < 2 || gx >= width - 2 || gy < 2 || gy >= height - 2) return false;
    const tile = tiles[gy]?.[gx];
    return tile === 0 || tile === 1;
  };

  // 1. Shrub Clusters (groups of 3-5 bushes near corners and selected open areas)
  const clusterAnchors = [
    { x: 8, y: 10 },
    { x: 54, y: 52 },
    { x: 10, y: 28 },
    { x: 52, y: 34 },
    { x: 26, y: 14 },
    { x: 38, y: 50 },
    { x: 22, y: 36 },
    { x: 42, y: 28 },
  ];

  clusterAnchors.forEach((anc, cIdx) => {
    const cx = anc.x * tileSize + (rand() - 0.5) * 40;
    const cy = anc.y * tileSize + (rand() - 0.5) * 40;
    if (isClearOfImportantSites(cx, cy, 5)) {
      props.push({
        id: `${mapId}_shrub_cluster_${cIdx}`,
        x: cx,
        y: cy,
        type: 'bush_cluster',
        size: 26 + rand() * 8,
        rotation: rand() * Math.PI * 2,
        blocking: false,
        variant: cIdx % 3,
      });
    }
  });

  // 2. Small Rounded Bushes scattered naturally throughout open fields
  const bushCount = biome === 'desert' ? 26 : 46;
  for (let i = 0; i < bushCount; i++) {
    const bx = (4 + rand() * (width - 8)) * tileSize;
    const by = (4 + rand() * (height - 8)) * tileSize;
    if (isClearOfImportantSites(bx, by, 4.5)) {
      props.push({
        id: `${mapId}_bush_${i}`,
        x: bx + (rand() - 0.5) * 16,
        y: by + (rand() - 0.5) * 16,
        type: 'bush',
        size: 11 + rand() * 7,
        rotation: rand() * Math.PI * 2,
        blocking: false,
        variant: i % 4,
      });
    }
  }

  // 3. Small patches of Wild Grass & Low-growing vegetation
  const grassPatchCount = biome === 'snow' ? 18 : 34;
  for (let i = 0; i < grassPatchCount; i++) {
    const gx = (3 + rand() * (width - 6)) * tileSize;
    const gy = (3 + rand() * (height - 6)) * tileSize;
    if (isClearOfImportantSites(gx, gy, 3.5)) {
      props.push({
        id: `${mapId}_wild_grass_${i}`,
        x: gx,
        y: gy,
        type: 'wild_grass',
        size: 10 + rand() * 6,
        rotation: rand() * Math.PI * 2,
        blocking: false,
        variant: i % 3,
      });
    }
  }

  // 4. Scattered decorative stones and small pebbles
  for (let i = 0; i < 22; i++) {
    const sx = (3 + rand() * (width - 6)) * tileSize;
    const sy = (3 + rand() * (height - 6)) * tileSize;
    if (isClearOfImportantSites(sx, sy, 3)) {
      props.push({
        id: `${mapId}_pebble_${i}`,
        x: sx,
        y: sy,
        type: 'rock',
        size: 6 + rand() * 5,
        rotation: rand() * Math.PI * 2,
        blocking: false,
      });
    }
  }

  return props;
}
