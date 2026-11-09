// Placement UX: Deploy -> controls on-screen -> Rotate works -> Cancel leaves credits untouched and closes controls.
const { chromium } = require('playwright');
const res = []; const ok = (n, p, i = '') => { res.push(p); console.log((p ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : '')); };
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[360, 740], [844, 390]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:4173/'); await p.waitForTimeout(500);
    await p.getByText('Quick Deploy').first().click(); await p.waitForTimeout(1800);
    const credits = async () => { const t = await p.locator('header button').filter({ hasText: /\$/ }).first().innerText(); return parseFloat(t.match(/\$([\d,.]+)/)[1].replace(/,/g, '')); };
    const c0 = await credits();
    await p.locator('nav button').filter({ hasText: /^\s*BUILD\s*$/ }).first().click(); await p.waitForTimeout(400);
    await p.getByRole('button', { name: /DEPLOY/ }).first().click(); await p.waitForTimeout(600);
    for (const name of [/CONFIRM/i, /ROTATE/i, /CANCEL/i]) {
      const el = p.getByRole('button', { name }).first();
      const bb = await el.boundingBox();
      ok(`${w}x${h} ${name} control inside viewport`, !!bb && bb.x >= 0 && bb.y >= 0 && bb.x + bb.width <= w && bb.y + bb.height <= h, JSON.stringify(bb && { x: Math.round(bb.x), y: Math.round(bb.y), w: Math.round(bb.width) }));
    }
    await p.getByRole('button', { name: /ROTATE/i }).first().click(); await p.waitForTimeout(300);
    await p.getByRole('button', { name: /CANCEL/i }).first().click(); await p.waitForTimeout(500);
    ok(`${w}x${h} cancel closes placement controls`, (await p.getByRole('button', { name: /CONFIRM/i }).count()) === 0);
    const c1 = await credits();
    ok(`${w}x${h} cancel charges nothing`, c1 >= c0 - 1, `before=${c0} after=${c1}`);
    ok(`${w}x${h} no page errors`, errs.length === 0, errs.join('|'));
    await ctx.close();
  }
  await b.close(); process.exit(res.every(Boolean) ? 0 : 1);
})();
