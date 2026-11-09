const { chromium } = require('playwright');
const [, , w = '390', h = '844'] = process.argv;
const results = []; const ok = (name, pass, info = '') => { results.push({ name, pass, info }); console.log((pass ? 'PASS ' : 'FAIL ') + name + (info ? '  — ' + info : '')); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: +w, height: +h }, hasTouch: +w < 700, isMobile: +w < 700 });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:4173/'); await p.waitForTimeout(800);
  await p.getByText('Quick Deploy').first().click(); await p.waitForTimeout(1800);

  const credits = async () => {
    const t = await p.locator('header button').filter({ hasText: /\$/ }).first().innerText();
    const m = t.match(/\$([\d,.]+)(K|M)?/); if (!m) return NaN;
    let v = parseFloat(m[1].replace(/,/g, '')); if (m[2] === 'K') v *= 1000; if (m[2] === 'M') v *= 1e6; return v;
  };
  const nav = t => p.locator('nav button').filter({ hasText: new RegExp('^\\s*' + t + '\\s*$') }).first();

  // 1. HUD shows no horizontal overflow
  const overflow = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  ok('no horizontal page overflow', overflow.sw <= overflow.cw, JSON.stringify(overflow));

  // 2. Construction: deploy -> placement controls -> confirm -> credits drop
  const c0 = await credits();
  await nav('BUILD').click(); await p.waitForTimeout(500);
  await p.getByRole('button', { name: /DEPLOY/ }).first().click(); await p.waitForTimeout(700);
  const confirm = p.getByRole('button', { name: /CONFIRM/i }).first();
  const confirmVisible = await confirm.isVisible().catch(() => false);
  ok('placement shows CONFIRM button', confirmVisible);
  if (confirmVisible) {
    const bb = await confirm.boundingBox();
    ok('CONFIRM is inside viewport', !!bb && bb.x >= 0 && bb.y >= 0 && bb.x + bb.width <= +w && bb.y + bb.height <= +h, JSON.stringify(bb));
    await confirm.click(); await p.waitForTimeout(900);
    const c1 = await credits();
    ok('credits deducted after confirm', c1 < c0 - 100, `before=${c0} after=${c1}`);
  }

  // 3. AI manager switch is wired to the engine
  await nav('AI').click(); await p.waitForTimeout(700);
  // The AI Base Architect module card (Smart Recruitment has its own switch above the module cards)
  const sw = p.getByRole('switch', { name: /Architect/i }).first();
  const card = sw.locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
  const statusOf = async () => ((await card.innerText()).match(/OFFLINE|ONLINE|STANDBY|ACTIVE|PAUSED/) || ['?'])[0];
  const before = await sw.getAttribute('aria-checked');
  const statusBefore = await statusOf();
  await sw.click(); await p.waitForTimeout(900);
  const after = await sw.getAttribute('aria-checked');
  const statusAfter = await statusOf();
  ok('AI switch toggles engine state', before !== after, `${before}->${after}; status ${statusBefore}->${statusAfter}`);
  ok('AI status text follows engine', statusBefore !== statusAfter, `${statusBefore}->${statusAfter}`);
  await sw.click(); await p.waitForTimeout(400);

  // 4. Army panel renders with real units; recruitment tab opens
  await nav('ARMY').click(); await p.waitForTimeout(600);
  const hp = await p.locator('text=/\\d+\\/\\d+ HP/').first().innerText().catch(() => '');
  ok('unit HP formatted as integers', /^\d+\/\d+ HP$/.test(hp.trim()), hp);
  await p.getByText('RECRUITMENT').first().click(); await p.waitForTimeout(600);
  const recText = await p.locator('body').innerText();
  ok('recruitment catalog shows unit cards', /Rifleman/i.test(recText));

  // 5. Defense list and MORE (settings)
  await nav('DEFENSE').click(); await p.waitForTimeout(500);
  ok('defense panel lists deployable structures', (await p.getByRole('button', { name: /DEPLOY/ }).count()) > 0);
  await nav('MORE').click(); await p.waitForTimeout(700);
  ok('MORE opens settings', /GRAPHICS|OPERATIONS/i.test(await p.locator('body').innerText()));

  ok('no uncaught page errors', errs.length === 0, errs.join(' | ').slice(0, 200));
  await p.screenshot({ path: `/tmp/smoke_${w}x${h}.png` });
  await b.close();
  process.exit(results.some(r => !r.pass) ? 1 : 0);
})();
