// Contact sheet of unit models composed the way the game composes them (hull + turret, aircraft + rotor hint).
// usage: vite-node scripts/sheet_units.ts <out.png> <kind: vehicles|aircraft|infantry|TYPE[,TYPE..]> [mag]
import { renderLayer, unitKind, INFANTRY, turretPivot, LayerKey } from '../src/game/units/models';
import { VEHICLES } from '../src/game/units/vehicles';
import { AIRCRAFT } from '../src/game/units/aircraft';
import { projectPoint, FitSprite } from '../src/game/units/raster';
import { Sheet } from './png';

const out = process.argv[2] ?? '/tmp/sheet_units.png';
const what = process.argv[3] ?? 'vehicles';
const MAG = Number(process.argv[4] ?? 2);
const TEX = 3, Q = { texel: TEX, ss: 2 };
const types = what === 'vehicles' ? Object.keys(VEHICLES) : what === 'aircraft' ? Object.keys(AIRCRAFT) : what === 'infantry' ? Object.keys(INFANTRY) : what.split(',');
const dirs = [0, 1, 2, 3, 4, 5, 6, 7];
const cell = (what === 'aircraft' ? 62 : what === 'infantry' ? 26 : 50) * TEX * MAG;
const sheet = new Sheet(cell * dirs.length, cell * types.length);
const put = (s: FitSprite, cx: number, cy: number) => sheet.blit(s, Math.round(cx - s.ax * TEX * MAG), Math.round(cy - s.ay * TEX * MAG), MAG);
let n = 0; const t0 = Date.now();
types.forEach((type, row) => {
  const kind = unitKind(type);
  dirs.forEach((d, col) => {
    const cx = col * cell + cell / 2, cy = row * cell + cell * (kind === 'aircraft' ? 0.5 : 0.62);
    const fac = row % 2 === 1 && what !== 'infantry' ? 'enemy' : 'player';
    const base: LayerKey = { type, faction: fac as 'player' | 'enemy', layer: 'body', dir: d, dirs: 8 };
    if (kind === 'infantry') { put(renderLayer({ ...base, clip: col % 2 ? 'walk' : 'aim', frame: col }, Q), cx, cy); n++; return; }
    if (kind === 'aircraft') { put(renderLayer({ ...base, layer: 'shadow' }, Q), cx + 6 * TEX * MAG, cy + 8 * TEX * MAG); put(renderLayer(base, Q), cx, cy); n += 2; return; }
    put(renderLayer({ ...base, tread: 0 }, Q), cx, cy); n++;
    const pv = turretPivot(type);
    if (pv) {
      const heading = (d / 8) * Math.PI * 2, tdir = (d + (row % 3)) % 8;       // turret traversed differently on some rows
      const [dx, dy] = projectPoint(pv, heading);
      put(renderLayer({ ...base, layer: 'turret', dir: tdir, recoil: 0, elev: col >= 6 ? 1 : 0 }, Q), cx + dx * TEX * MAG, cy + dy * TEX * MAG); n++;
    }
  });
});
console.log('sprites', n, 'ms/sprite', ((Date.now() - t0) / n).toFixed(2));
sheet.save(out);
