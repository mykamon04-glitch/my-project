// Proves the Settings > Graphics controls change real rendering behaviour (not just stored values).
const { chromium } = require('playwright');
const res = []; const ok = (n, p, i = '') => { res.push(p); console.log((p ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : '')); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window.__n = { clear: 0, ellipse: 0 };
    const P = CanvasRenderingContext2D.prototype;
    const c = P.clearRect, e = P.ellipse;
    P.clearRect = function (...a) { if (this.canvas.width > 600) window.__n.clear++; return c.apply(this, a); };
    P.ellipse = function (...a) { if (this.canvas.width > 600) window.__n.ellipse++; return e.apply(this, a); };
  });
  await p.goto('http://127.0.0.1:4173/'); await p.waitForTimeout(600);
  await p.getByText('Quick Deploy').first().click(); await p.waitForTimeout(2500);

  // the visible 2D game canvas (page also holds a hidden 3D canvas and a minimap)
  const gameCanvasWidth = () => p.evaluate(() => Math.max(...[...document.querySelectorAll('canvas')].filter(c => c.offsetParent !== null && c.getBoundingClientRect().width > 600).map(c => c.width)));
  const sample = async (ms) => { await p.evaluate(() => { window.__n = { clear: 0, ellipse: 0 }; }); await p.waitForTimeout(ms); return p.evaluate(() => ({ ...window.__n })); };
  const openSettings = async () => { await p.locator('nav button').filter({ hasText: /^\s*MORE\s*$/ }).first().click(); await p.waitForTimeout(600); };
  const closeSettings = async () => { await p.getByRole('button', { name: /CONFIRM/i }).last().click().catch(() => {}); await p.waitForTimeout(500); };
  const click = async (name) => { await p.getByRole('button', { name, exact: true }).first().click(); await p.waitForTimeout(350); };

  const baseW = await gameCanvasWidth();
  ok('default canvas width equals viewport at DPR 1 (original behaviour kept)', baseW === 1280, `width=${baseW}`);
  const baseline = await sample(2000);
  ok('uncapped by default (>40 frames in 2s)', baseline.clear > 40, `frames=${baseline.clear}`);

  // Presets
  await openSettings();
  await click('Performance');
  await closeSettings();
  const perfW = await gameCanvasWidth();
  ok('Performance preset lowers render resolution (0.75x)', perfW === Math.floor(1280 * 0.75), `width=${perfW}`);
  const perf = await sample(2000);
  const perFrame = (r) => r.ellipse / Math.max(1, r.clear);
  ok('Performance preset (shadows off) draws fewer ellipses per frame', perFrame(perf) < perFrame(baseline) * 0.99, `ellipses/frame ${perFrame(baseline).toFixed(1)} -> ${perFrame(perf).toFixed(1)}`);

  // Frame cap
  await openSettings();
  await click('Ultra');
  await p.getByRole('button', { name: /^30/ }).first().click(); await p.waitForTimeout(300);
  await closeSettings();
  const w2 = await gameCanvasWidth();
  ok('Ultra preset restores full resolution', w2 === 1280, `width=${w2}`);
  const capped = await sample(2500);
  ok('30 FPS target caps frame rate (<= ~36 fps)', capped.clear / 2.5 <= 36, `fps=${(capped.clear / 2.5).toFixed(1)}`);

  ok('no page errors', errs.length === 0, errs.join('|'));
  await p.screenshot({ path: '/tmp/graphics-settings.png' });
  await b.close(); process.exit(res.every(Boolean) ? 0 : 1);
})();
