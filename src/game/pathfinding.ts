/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Building, MapData, SquadFormation, Vector2 } from '../types/game';

// Min-Heap Node
interface HeapNode {
  index: number;
  f: number;
}

class FastMinHeap {
  private data: HeapNode[] = [];

  public get size(): number {
    return this.data.length;
  }

  public push(index: number, f: number) {
    this.data.push({ index, f });
    this.bubbleUp(this.data.length - 1);
  }

  public pop(): HeapNode | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0];
    const bottom = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = bottom;
      this.sinkDown(0);
    }
    return top;
  }

  private bubbleUp(idx: number) {
    const node = this.data[idx];
    while (idx > 0) {
      const parentIdx = (idx - 1) >> 1;
      const parent = this.data[parentIdx];
      if (node.f >= parent.f) break;
      this.data[idx] = parent;
      idx = parentIdx;
    }
    this.data[idx] = node;
  }

  private sinkDown(idx: number) {
    const length = this.data.length;
    const node = this.data[idx];
    while (true) {
      let left = (idx << 1) + 1;
      let right = left + 1;
      let swap = -1;

      if (left < length && this.data[left].f < node.f) {
        swap = left;
      }
      if (right < length) {
        if (swap === -1 ? this.data[right].f < node.f : this.data[right].f < this.data[left].f) {
          swap = right;
        }
      }

      if (swap === -1) break;
      this.data[idx] = this.data[swap];
      idx = swap;
    }
    this.data[idx] = node;
  }
}

export class PathfindingGrid {
  private width: number;
  private height: number;
  private tileSize: number;
  private grid: boolean[][]; // true = walkable, false = blocked

  // Flat lookup arrays for ultra-fast A* without memory allocation
  private gScore: Float32Array;
  private parentIndex: Int32Array;
  private closedTag: Uint32Array;
  private openTag: Uint32Array;
  private currentSearchTag: number = 1;

  constructor(mapData: MapData) {
    this.width = mapData.width;
    this.height = mapData.height;
    this.tileSize = mapData.tileSize;
    this.grid = [];

    const totalNodes = this.width * this.height;
    this.gScore = new Float32Array(totalNodes);
    this.parentIndex = new Int32Array(totalNodes);
    this.closedTag = new Uint32Array(totalNodes);
    this.openTag = new Uint32Array(totalNodes);

    this.rebuild(mapData, []);
  }

  public rebuild(mapData: MapData, buildings: Building[]) {
    this.grid = [];
    for (let y = 0; y < this.height; y++) {
      const row: boolean[] = [];
      for (let x = 0; x < this.width; x++) {
        const tileType = mapData.tiles[y]?.[x] ?? 0;
        // 3: water/ice, 4: cliff are non-walkable for ground units
        const walkable = tileType !== 3 && tileType !== 4;
        row.push(walkable);
      }
      this.grid.push(row);
    }

    // Mark building footprints as non-walkable
    for (const b of buildings) {
      if (b.hp <= 0) continue;
      for (let dy = 0; dy < b.height; dy++) {
        for (let dx = 0; dx < b.width; dx++) {
          const gx = b.x + dx;
          const gy = b.y + dy;
          if (gx >= 0 && gx < this.width && gy >= 0 && gy < this.height) {
            this.grid[gy][gx] = false;
          }
        }
      }
    }
  }

  public isWalkable(gridX: number, gridY: number): boolean {
    if (gridX < 0 || gridX >= this.width || gridY < 0 || gridY >= this.height) {
      return false;
    }
    return this.grid[gridY][gridX];
  }

  public isPixelWalkable(pixelX: number, pixelY: number): boolean {
    const gx = Math.floor(pixelX / this.tileSize);
    const gy = Math.floor(pixelY / this.tileSize);
    return this.isWalkable(gx, gy);
  }

  // Fast Line-of-Sight Raymarch: If unobstructed, path is instant 0-cost direct vector
  public hasLineOfSight(x0: number, y0: number, x1: number, y1: number): boolean {
    let dx = Math.abs(x1 - x0);
    let dy = Math.abs(y1 - y0);
    let x = x0;
    let y = y0;
    let n = 1 + dx + dy;
    const xInc = x1 > x0 ? 1 : -1;
    const yInc = y1 > y0 ? 1 : -1;
    let error = dx - dy;
    dx *= 2;
    dy *= 2;

    for (; n > 0; --n) {
      if (!this.isWalkable(x, y)) {
        return false;
      }
      if (error > 0) {
        x += xInc;
        error -= dy;
      } else {
        y += yInc;
        error += dx;
      }
    }
    return true;
  }

  // High-Performance A* with Min-Heap, Clean Tag Isolation and Path Smoothing
  public findPath(startPixel: Vector2, targetPixel: Vector2, isAircraft: boolean = false): Vector2[] {
    // Aircraft fly directly ignoring ground terrain obstacles
    if (isAircraft) {
      return [{ x: targetPixel.x, y: targetPixel.y }];
    }

    const startX = Math.floor(startPixel.x / this.tileSize);
    const startY = Math.floor(startPixel.y / this.tileSize);
    let targetX = Math.floor(targetPixel.x / this.tileSize);
    let targetY = Math.floor(targetPixel.y / this.tileSize);

    // Clamp coordinates
    targetX = Math.max(0, Math.min(this.width - 1, targetX));
    targetY = Math.max(0, Math.min(this.height - 1, targetY));

    // If already at target
    if (startX === targetX && startY === targetY) {
      return [{ x: targetPixel.x, y: targetPixel.y }];
    }

    // Direct Line-Of-Sight check: Bypass full A* search if direct line is clear
    if (this.hasLineOfSight(startX, startY, targetX, targetY)) {
      return [{ x: targetPixel.x, y: targetPixel.y }];
    }

    // If destination is blocked, find nearest walkable tile
    if (!this.isWalkable(targetX, targetY)) {
      const neighbors = [
        { x: targetX + 1, y: targetY },
        { x: targetX - 1, y: targetY },
        { x: targetX, y: targetY + 1 },
        { x: targetX, y: targetY - 1 },
        { x: targetX + 1, y: targetY + 1 },
        { x: targetX - 1, y: targetY - 1 },
        { x: targetX + 1, y: targetY - 1 },
        { x: targetX - 1, y: targetY + 1 },
      ];
      for (const n of neighbors) {
        if (this.isWalkable(n.x, n.y)) {
          targetX = n.x;
          targetY = n.y;
          break;
        }
      }
    }

    if (startX === targetX && startY === targetY) {
      return [{ x: targetPixel.x, y: targetPixel.y }];
    }

    // Advance search tag (avoids reallocating or clearing 4096-element arrays)
    this.currentSearchTag++;
    const searchTag = this.currentSearchTag;

    const width = this.width;
    const startIndex = startY * width + startX;
    const targetIndex = targetY * width + targetX;

    this.openTag[startIndex] = searchTag;
    this.gScore[startIndex] = 0;
    this.parentIndex[startIndex] = -1;

    const heap = new FastMinHeap();
    const startH = Math.hypot(targetX - startX, targetY - startY);
    heap.push(startIndex, startH);

    let iterations = 0;
    const maxIterations = 900;

    const dxs = [0, 0, -1, 1, -1, 1, -1, 1];
    const dys = [-1, 1, 0, 0, -1, -1, 1, 1];
    const costs = [1, 1, 1, 1, 1.414, 1.414, 1.414, 1.414];

    while (heap.size > 0 && iterations < maxIterations) {
      iterations++;
      const top = heap.pop()!;
      const currIdx = top.index;

      if (currIdx === targetIndex) {
        // Reconstruct raw path
        const rawPath: Vector2[] = [];
        let curr = currIdx;
        while (curr !== -1) {
          const cy = Math.floor(curr / width);
          const cx = curr % width;
          rawPath.unshift({
            x: cx * this.tileSize + this.tileSize / 2,
            y: cy * this.tileSize + this.tileSize / 2,
          });
          curr = this.parentIndex[curr];
        }

        if (rawPath.length === 0) {
          return [{ x: targetPixel.x, y: targetPixel.y }];
        }

        rawPath[rawPath.length - 1] = { x: targetPixel.x, y: targetPixel.y };

        // Raycast string-pulling / smoothing to eliminate jagged zigzagging
        if (rawPath.length <= 2) {
          return rawPath;
        }

        const smoothedPath: Vector2[] = [rawPath[0]];
        let currentPoint = 0;

        while (currentPoint < rawPath.length - 1) {
          let furthestVisible = currentPoint + 1;
          for (let check = rawPath.length - 1; check > currentPoint + 1; check--) {
            const p1 = rawPath[currentPoint];
            const p2 = rawPath[check];
            const gx1 = Math.floor(p1.x / this.tileSize);
            const gy1 = Math.floor(p1.y / this.tileSize);
            const gx2 = Math.floor(p2.x / this.tileSize);
            const gy2 = Math.floor(p2.y / this.tileSize);

            if (this.hasLineOfSight(gx1, gy1, gx2, gy2)) {
              furthestVisible = check;
              break;
            }
          }
          smoothedPath.push(rawPath[furthestVisible]);
          currentPoint = furthestVisible;
        }

        return smoothedPath;
      }

      this.closedTag[currIdx] = searchTag;
      const currG = this.gScore[currIdx];
      const cx = currIdx % width;
      const cy = Math.floor(currIdx / width);

      for (let d = 0; d < 8; d++) {
        const nx = cx + dxs[d];
        const ny = cy + dys[d];

        if (nx < 0 || nx >= width || ny < 0 || ny >= this.height) continue;
        const nIdx = ny * width + nx;

        if (this.closedTag[nIdx] === searchTag || !this.grid[ny][nx]) continue;

        // Diagonal corner cutting prevention
        if (d >= 4) {
          if (!this.grid[cy][nx] || !this.grid[ny][cx]) continue;
        }

        const newG = currG + costs[d];
        const recordedG = this.openTag[nIdx] === searchTag ? this.gScore[nIdx] : Infinity;

        if (newG < recordedG) {
          this.parentIndex[nIdx] = currIdx;
          this.gScore[nIdx] = newG;
          this.openTag[nIdx] = searchTag;
          const h = Math.hypot(targetX - nx, targetY - ny);
          heap.push(nIdx, newG + h);
        }
      }
    }

    // Direct fallback if path blocked
    return [{ x: targetPixel.x, y: targetPixel.y }];
  }
}

// Generate realistic squad formations (Line, Wedge, Column, Spread, Circle, Spearhead)
export function calculateSquadOffsets(
  count: number,
  formation: SquadFormation = 'spread',
  spacing: number = 38
): Vector2[] {
  const offsets: Vector2[] = [];
  if (count <= 1) return [{ x: 0, y: 0 }];

  switch (formation) {
    case 'line': {
      const startX = -((count - 1) * spacing) / 2;
      for (let i = 0; i < count; i++) {
        offsets.push({ x: startX + i * spacing, y: 0 });
      }
      break;
    }

    case 'column': {
      for (let i = 0; i < count; i++) {
        const row = Math.floor(i / 2);
        const col = i % 2;
        offsets.push({
          x: (col === 0 ? -1 : 1) * (spacing * 0.6),
          y: row * spacing - ((count / 2) * spacing) / 2,
        });
      }
      break;
    }

    case 'wedge': {
      offsets.push({ x: 0, y: -spacing * 0.8 });
      for (let i = 1; i < count; i++) {
        const side = i % 2 === 1 ? -1 : 1;
        const tier = Math.ceil(i / 2);
        offsets.push({
          x: side * tier * spacing * 1.0,
          y: -spacing * 0.8 + tier * spacing * 0.75,
        });
      }
      break;
    }

    case 'spearhead': {
      // Vanguard point tip
      offsets.push({ x: 0, y: -spacing * 1.3 });
      for (let i = 1; i < count; i++) {
        if (i % 3 === 0) {
          // Center spine column
          const spineTier = Math.floor(i / 3);
          offsets.push({ x: 0, y: -spacing * 1.3 + spineTier * spacing * 0.9 });
        } else {
          // Left / Right acute wing
          const side = i % 2 === 1 ? -1 : 1;
          const wingTier = Math.ceil(i / 2);
          offsets.push({
            x: side * wingTier * spacing * 0.85,
            y: -spacing * 1.3 + wingTier * spacing * 0.95,
          });
        }
      }
      break;
    }

    case 'circle': {
      const radius = Math.max(spacing * 1.2, (count * spacing) / (2 * Math.PI));
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        offsets.push({
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
        });
      }
      break;
    }

    case 'spread':
    default: {
      const cols = Math.ceil(Math.sqrt(count));
      const rows = Math.ceil(count / cols);
      const startX = -((cols - 1) * spacing) / 2;
      const startY = -((rows - 1) * spacing) / 2;

      for (let i = 0; i < count; i++) {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const jitterX = (Math.random() - 0.5) * 6;
        const jitterY = (Math.random() - 0.5) * 6;
        offsets.push({
          x: startX + c * spacing + jitterX,
          y: startY + r * spacing + jitterY,
        });
      }
      break;
    }
  }

  return offsets;
}
