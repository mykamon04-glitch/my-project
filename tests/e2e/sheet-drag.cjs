const { chromium } = require('playwright');
const res = []; const ok = (n, p, i = '') => { res.push(p); console.log((p ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : '')); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:4173/'); await p.waitForTimeout(700);
  await p.getByText('Quick Deploy').first().click(); await p.waitForTimeout(1800);
  const nav = t => p.locator('nav button').filter({ hasText: new RegExp('^\\s*' + t + '\\s*$') }).first();
  const sheet = p.getByTestId('bottom-sheet');
  const hudBottom = () => p.evaluate(() => document.querySelector('header').getBoundingClientRect().bottom);
  const navTop = () => p.evaluate(() => document.querySelector('nav').getBoundingClientRect().top);
  const box = async () => (await sheet.boundingBox());
  const handle = () => p.getByRole('separator', { name: /resize/i });
  const dragHandle = async (dy) => {
    const hb = await handle().boundingBox(); const x = hb.x + hb.width / 2, y = hb.y + hb.height / 2;
    await p.mouse.move(x, y); await p.mouse.down();
    for (let i = 1; i <= 10; i++) await p.mouse.move(x, y + (dy * i) / 10);
    await p.mouse.up(); await p.waitForTimeout(450);
  };

  await nav('BUILD').click(); await p.waitForTimeout(500);
  ok('opens at half', (await sheet.getAttribute('data-snap')) === 'half');
  const half = await box();

  await dragHandle(-420);
  const exp = await box();
  ok('drag up -> expanded', (await sheet.getAttribute('data-snap')) === 'expanded', `h ${Math.round(half.height)} -> ${Math.round(exp.height)}`);
  ok('expanded taller than half', exp.height > half.height + 80);
  ok('expanded does not overlap top HUD', exp.y >= (await hudBottom()) - 1, `sheetTop=${Math.round(exp.y)} hudBottom=${Math.round(await hudBottom())}`);
  ok('expanded stays above nav', exp.y + exp.height <= (await navTop()) + 1, `sheetBottom=${Math.round(exp.y + exp.height)} navTop=${Math.round(await navTop())}`);

  await dragHandle(+180);
  ok('drag down a bit -> half', (await sheet.getAttribute('data-snap')) === 'half');
  await dragHandle(+500);
  ok('drag far down -> collapsed', (await sheet.count()) === 0);

  await nav('BUILD').click(); await p.waitForTimeout(500);
  await handle().click(); await p.waitForTimeout(400);
  ok('tap handle -> expanded', (await sheet.getAttribute('data-snap')) === 'expanded');
  await handle().click(); await p.waitForTimeout(400);
  ok('tap handle again -> half', (await sheet.getAttribute('data-snap')) === 'half');

  // internal scrolling in expanded state & orientation change
  await handle().click(); await p.waitForTimeout(400);
  await p.setViewportSize({ width: 844, height: 390 }); await p.waitForTimeout(600);
  const land = await box();
  ok('landscape: expanded sheet inside viewport & below HUD', land.y >= (await hudBottom()) - 1 && land.y + land.height <= 390, JSON.stringify({ y: Math.round(land.y), h: Math.round(land.height), hud: Math.round(await hudBottom()) }));
  const dims = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  ok('landscape: no horizontal overflow', dims.sw <= dims.cw);
  await p.screenshot({ path: '/tmp/drag_landscape.png' });
  ok('no page errors', errs.length === 0, errs.join('|'));
  await b.close(); process.exit(res.every(Boolean) ? 0 : 1);
})();
