/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { M_CAMO, M_GLASS, M_GLOW, M_MATTE, M_METAL, M_RUBBER, M_SKIN, M_TRACK, Material } from './raster';

/**
 * Unit materials (V11). One table per faction, indexed by MAT.*.
 * Muted military colours: the player fields olive-drab / woodland kit, the enemy dark-earth / desert kit, so the two sides
 * read differently by overall tone; identification is completed by small painted team markings (MAT.TEAM), never by
 * saturated paint jobs.
 */
export const MAT = {
  CAMO: 0,      // combat uniform fabric (camouflage pattern)
  GEAR: 1,      // plate carrier / webbing
  POUCH: 2,     // pouches, packs
  HELMET: 3,
  SKIN: 4,
  BOOT: 5,      // boots, gloves
  GUN: 6,       // weapon metal
  ARMOR: 7,     // vehicle paint, primary
  ARMOR2: 8,    // vehicle paint, secondary / darker panels
  STEEL: 9,     // bare steel, gun barrels
  RUBBER: 10,   // tyres
  TRACK: 11,    // track links
  GLASS: 12,
  TEAM: 13,     // restrained team marking
  DARK: 14,     // grilles, openings, exhausts
  CANVAS: 15,   // tarpaulin, stowage rolls
  WHITE: 16,    // medical white
  RED: 17,      // red cross / warning
  LIGHT: 18,    // lamps
  WOOD: 19,     // crates, tool handles
  GHILLIE: 20,  // sniper veil
  BLACK: 21,    // special-forces kit
  AIR: 22,      // aircraft paint, primary
  AIR2: 23,     // aircraft paint, underside / panels
  BRASS: 24,    // ammunition, fittings
  BURNT: 25,    // wreckage
  BURNT2: 26,
} as const;

export type FactionId = 'player' | 'enemy';

const m = (kind: number, c: [number, number, number], o: Partial<Material> = {}): Material => ({ kind, c, ...o });

function table(f: FactionId): Material[] {
  const P = f === 'player';
  const t: Material[] = [];
  t[MAT.CAMO] = P
    ? m(M_CAMO, [128, 132, 98], { pal: [[84, 96, 68], [162, 154, 120], [106, 92, 70]], freq: 0.95 })
    : m(M_CAMO, [164, 140, 108], { pal: [[118, 98, 78], [190, 172, 138], [136, 122, 106]], freq: 0.95 });
  t[MAT.GEAR] = P ? m(M_MATTE, [98, 104, 76], { wear: 0.08 }) : m(M_MATTE, [126, 106, 82], { wear: 0.08 });
  t[MAT.POUCH] = P ? m(M_MATTE, [78, 84, 62], { wear: 0.1 }) : m(M_MATTE, [104, 86, 68], { wear: 0.1 });
  t[MAT.HELMET] = P ? m(M_CAMO, [120, 126, 92], { pal: [[88, 100, 70], [150, 144, 112], [104, 92, 70]], freq: 1.3 }) : m(M_CAMO, [158, 136, 104], { pal: [[122, 102, 80], [184, 166, 132], [136, 120, 102]], freq: 1.3 });
  t[MAT.SKIN] = m(M_SKIN, [204, 160, 128]);
  t[MAT.BOOT] = m(M_MATTE, [70, 60, 48], { wear: 0.08, dust: 0.5 });
  t[MAT.GUN] = m(M_METAL, [40, 42, 44], { spec: 0.22 });
  // vehicle paint: large-patch disruptive camouflage (three-tone woodland for the player, two-tone desert for the enemy)
  t[MAT.ARMOR] = P
    ? m(M_CAMO, [94, 102, 72], { pal: [[60, 66, 54], [94, 102, 72], [108, 90, 66]], freq: 0.17, dust: 0.55 })
    : m(M_CAMO, [152, 130, 100], { pal: [[114, 92, 72], [152, 130, 100], [136, 118, 94]], freq: 0.17, dust: 0.5 });
  t[MAT.ARMOR2] = P ? m(M_MATTE, [70, 78, 56], { wear: 0.12, dust: 0.55 }) : m(M_MATTE, [104, 86, 68], { wear: 0.12, dust: 0.5 });
  t[MAT.STEEL] = m(M_METAL, [72, 76, 78], { spec: 0.3, dust: 0.25 });
  t[MAT.RUBBER] = m(M_RUBBER, [44, 44, 46], { dust: 0.55 });
  t[MAT.TRACK] = m(M_TRACK, [74, 70, 64], { freq: 0.55, dust: 0.6 });
  t[MAT.GLASS] = m(M_GLASS, [30, 42, 52], { spec: 0.8 });
  t[MAT.TEAM] = P ? m(M_MATTE, [64, 158, 128], { wear: 0.04 }) : m(M_MATTE, [186, 74, 66], { wear: 0.04 });
  t[MAT.DARK] = m(M_MATTE, [26, 28, 30], { wear: 0.05 });
  t[MAT.CANVAS] = P ? m(M_MATTE, [104, 104, 78], { wear: 0.16, dust: 0.3 }) : m(M_MATTE, [142, 126, 98], { wear: 0.16, dust: 0.3 });
  t[MAT.WHITE] = m(M_MATTE, [208, 206, 196], { wear: 0.05, dust: 0.25 });
  t[MAT.RED] = m(M_MATTE, [164, 58, 54], { wear: 0.05 });
  t[MAT.LIGHT] = m(M_GLOW, [250, 232, 190]);
  t[MAT.WOOD] = m(M_MATTE, [118, 96, 66], { wear: 0.14 });
  t[MAT.GHILLIE] = P
    ? m(M_CAMO, [84, 92, 58], { pal: [[52, 64, 42], [122, 118, 78], [70, 60, 44]], freq: 1.7 })
    : m(M_CAMO, [132, 116, 86], { pal: [[92, 78, 58], [160, 146, 112], [110, 98, 76]], freq: 1.7 });
  t[MAT.BLACK] = P ? m(M_MATTE, [70, 76, 74], { wear: 0.1 }) : m(M_MATTE, [88, 74, 68], { wear: 0.1 });
  t[MAT.AIR] = P ? m(M_MATTE, [104, 112, 108], { wear: 0.07 }) : m(M_MATTE, [132, 118, 98], { wear: 0.07 });
  t[MAT.AIR2] = P ? m(M_MATTE, [78, 86, 84], { wear: 0.08 }) : m(M_MATTE, [102, 90, 76], { wear: 0.08 });
  t[MAT.BRASS] = m(M_METAL, [150, 122, 62], { spec: 0.25 });
  t[MAT.BURNT] = m(M_MATTE, [44, 40, 36], { wear: 0.3, dust: 0.3 });
  t[MAT.BURNT2] = m(M_MATTE, [70, 52, 40], { wear: 0.35, dust: 0.3 });
  return t;
}

const cache: Partial<Record<FactionId, Material[]>> = {};
export function materialsFor(f: FactionId): Material[] { return (cache[f] ??= table(f)); }

/** Wreckage: every painted surface becomes scorched metal, glass and lamps go dark. */
let burnt: Material[] | null = null;
export function burntMaterials(): Material[] {
  if (burnt) return burnt;
  const base = table('player');
  burnt = base.map((x, i) => {
    if (i === MAT.TRACK) return m(M_TRACK, [46, 42, 38], { freq: 0.55, dust: 0.5 });
    if (i === MAT.RUBBER || i === MAT.DARK || i === MAT.GLASS || i === MAT.LIGHT) return m(M_MATTE, [22, 22, 22], { wear: 0.1 });
    return (i * 7) % 3 === 0 ? m(M_MATTE, [74, 54, 40], { wear: 0.4, dust: 0.3 }) : m(M_MATTE, [46, 42, 38], { wear: 0.35, dust: 0.3 });
  });
  return burnt;
}
