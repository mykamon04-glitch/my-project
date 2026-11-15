import { MeshBuilder, renderFit } from '../src/game/units/raster';
import { materialsFor } from '../src/game/units/palette';
import { buildSoldier } from '../src/game/units/soldier';
import { VEHICLES } from '../src/game/units/vehicles';
import { AIRCRAFT } from '../src/game/units/aircraft';
import { INFANTRY } from '../src/game/units/models';

const mats = materialsFor('player');
const time = (label: string, n: number, f: (i: number) => void) => { for (let i = 0; i < 20; i++) f(i); const t0 = performance.now(); for (let i = 0; i < n; i++) f(i); console.log(label.padEnd(28), ((performance.now() - t0) / n).toFixed(3), 'ms'); };
let m: any;
time('build soldier', 200, i => { const b = new MeshBuilder(); buildSoldier(b, INFANTRY.rifleman, 'walk', i % 8); m = b.build(); });
console.log('  soldier tris', m.n);
time('render soldier t3 ss2', 200, i => renderFit(m, mats, { heading: i * 0.3, texel: 3, ss: 2, shadow: 1, ink: 0.6 }));
time('render soldier t3 ss1', 200, i => renderFit(m, mats, { heading: i * 0.3, texel: 3, ss: 1, shadow: 1, ink: 0.6 }));
time('build mbt hull', 100, () => { const b = new MeshBuilder(); VEHICLES.main_battle_tank.hull(b); m = b.build(); });
console.log('  hull tris', m.n);
time('render hull t3 ss2', 100, i => renderFit(m, mats, { heading: i * 0.3, texel: 3, ss: 2, shadow: 1, groundAO: 3 }));
time('render hull t2.5 ss2', 100, i => renderFit(m, mats, { heading: i * 0.3, texel: 2.5, ss: 2, shadow: 1, groundAO: 3 }));
time('render hull t2 ss2', 100, i => renderFit(m, mats, { heading: i * 0.3, texel: 2, ss: 2, shadow: 1, groundAO: 3 }));
{ const b = new MeshBuilder(); VEHICLES.main_battle_tank.turret!.build(b, {}); m = b.build(); }
console.log('  turret tris', m.n);
time('render turret t3 ss2', 100, i => renderFit(m, mats, { heading: i * 0.3, texel: 3, ss: 2, shadow: 0 }));
{ const b = new MeshBuilder(); AIRCRAFT.raven_bomber.body(b); m = b.build(); }
time('render bomber t3 ss2', 50, i => renderFit(m, mats, { heading: i * 0.3, texel: 3, ss: 2, shadow: 0 }));
