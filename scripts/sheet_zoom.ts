// Close-up sheet: a few soldier sprites magnified, on a terrain-like background, plus true-size row.
import { MeshBuilder, renderMesh } from '../src/game/units/raster';
import { materialsFor } from '../src/game/units/palette';
import { buildSoldier, Clip, SoldierSpec } from '../src/game/units/soldier';
import { Sheet } from './png';

const spec: SoldierSpec = { headgear: 'helmet', armor: 1, pack: 'assault', weapon: 'rifle', stance: 'stand', extras: ['kneepads'] };
const TEX = 3, MAG = 8, WPX = 26, HPX = 26, AX = 11, AY = 17;
const render = (clip: Clip, f: number, heading: number, fac: 'player' | 'enemy' = 'player') => {
  const b = new MeshBuilder(); buildSoldier(b, spec, clip, f);
  return renderMesh(b.build(), materialsFor(fac), { heading, wpx: WPX, hpx: HPX, ax: AX, ay: AY, texel: TEX, ss: 2, shadow: 1, ink: 0.6, gain: 1.08 });
};
const cw = WPX * TEX * MAG, chh = HPX * TEX * MAG;
const sheet = new Sheet(cw * 4, chh * 2 + 100, [60, 66, 46]);
const cells: [Clip, number, number, 'player' | 'enemy'][] = [['idle', 0, Math.PI / 2, 'player'], ['walk', 2, 0, 'player'], ['aim', 0, Math.PI / 4, 'player'], ['aim', 0, -Math.PI / 2, 'player'], ['walk', 5, Math.PI, 'enemy'], ['aim', 0, Math.PI * 0.75, 'enemy'], ['work', 0, 0.3, 'player'], ['die', 3, 0, 'player']];
cells.forEach((c, i) => sheet.blit(render(c[0], c[1], c[2], c[3]), (i % 4) * cw, Math.floor(i / 4) * chh, MAG));
// true-size row (1 texel = 1 px) for a sense of the in-game look at 3 device px per world px
for (let d = 0; d < 8; d++) sheet.blit(render('walk', d, (d * Math.PI) / 4), 20 + d * 90, chh * 2 + 10, 1);
sheet.save(process.argv[2] ?? '/tmp/sheet_zoom.png');
