// Contact sheet of the soldier model: clips x frames for one direction, and 8 directions of key poses.
import { MeshBuilder, renderMesh } from '../src/game/units/raster';
import { materialsFor } from '../src/game/units/palette';
import { buildSoldier, CLIP_FRAMES, Clip, SoldierSpec } from '../src/game/units/soldier';
import { Sheet } from './png';

const spec: SoldierSpec = { headgear: 'helmet', armor: 1, pack: 'assault', weapon: 'rifle', stance: 'stand', extras: ['kneepads'] };
const TEX = 3, MAG = 3, WPX = 26, HPX = 26, AX = 11, AY = 17;
const render = (clip: Clip, f: number, heading: number, fac: 'player' | 'enemy' = 'player') => {
  const b = new MeshBuilder(); buildSoldier(b, spec, clip, f);
  return renderMesh(b.build(), materialsFor(fac), { heading, wpx: WPX, hpx: HPX, ax: AX, ay: AY, texel: TEX, ss: 2, shadow: 1, ink: 0.6, gain: 1.08 });
};
const cw = WPX * TEX * MAG, chh = HPX * TEX * MAG;
const clips: Clip[] = ['idle', 'walk', 'run', 'aim', 'fire', 'reload', 'hit', 'work', 'die'];
const sheet = new Sheet(cw * 8, chh * (clips.length + 3));
const t0 = Date.now(); let n = 0;
clips.forEach((c, r) => { for (let f = 0; f < Math.min(8, CLIP_FRAMES[c]); f++) { sheet.blit(render(c, f, 0.0), f * cw, r * chh, MAG); n++; } });
for (let d = 0; d < 8; d++) { sheet.blit(render('idle', 0, (d * Math.PI) / 4), d * cw, clips.length * chh, MAG); sheet.blit(render('aim', 0, (d * Math.PI) / 4), d * cw, (clips.length + 1) * chh, MAG); sheet.blit(render('walk', 2, (d * Math.PI) / 4, 'enemy'), d * cw, (clips.length + 2) * chh, MAG); n += 3; }
console.log('sprites', n, 'ms/sprite', ((Date.now() - t0) / n).toFixed(2));
sheet.save(process.argv[2] ?? '/tmp/sheet_soldier.png');
