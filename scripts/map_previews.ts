// Contact sheet of the V14 battlefields (terrain compositor previews). usage: npx vite-node scripts/map_previews.ts <out.png> [px]
import { MAP_CATALOG, buildMap } from '../src/game/maps/catalog';
import { renderMapPreview } from '../src/game/maps/terrain';
import { Sheet } from './png';
const out = process.argv[2] ?? 'maps.png', px = +(process.argv[3] ?? 320);
const sheet = new Sheet(MAP_CATALOG.length * (px + 10) + 10, px + 20, [12, 17, 24]);
MAP_CATALOG.forEach((m, i) => {
  const t0 = performance.now();
  const p = renderMapPreview(buildMap(m.id), px);
  console.log(m.id, (performance.now() - t0).toFixed(0) + 'ms');
  sheet.blit({ w: p.w, h: p.h, data: p.data }, 10 + i * (px + 10), 10, 1);
});
sheet.save(out);
