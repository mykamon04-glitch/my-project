// Smart Recruitment UI: doctrine choice persists in the engine (survives panel remount), controls stay on-screen.
const { chromium } = require('playwright');
const res = []; const ok = (n, p, i = '') => { res.push(p); console.log((p ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : '')); };
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[320, 640], [390, 844], [844, 390]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:4173/'); await p.waitForTimeout(500);
    await p.getByText('Quick Deploy').first().click(); await p.waitForTimeout(1800);
    const nav = t => p.locator('nav button').filter({ hasText: new RegExp('^\\s*' + t + '\\s*$') }).first();
    await nav('AI').click(); await p.waitForTimeout(600);
    const card = p.getByTestId('smart-recruitment');
    ok(`${w}x${h} card visible`, await card.isVisible());
    const radio = name => p.getByRole('radio', { name, exact: true });

    await radio('Armored').click(); await p.waitForTimeout(300);
    ok(`${w}x${h} Armored selected`, (await radio('Armored').getAttribute('aria-checked')) === 'true');
    // leave the panel and come back: component state is rebuilt from the ENGINE
    await nav('ARMY').click(); await p.waitForTimeout(400); await nav('AI').click(); await p.waitForTimeout(600);
    ok(`${w}x${h} choice persisted in engine`, (await radio('Armored').getAttribute('aria-checked')) === 'true');

    await radio('Infantry').click(); await p.waitForTimeout(250);
    await nav('ARMY').click(); await p.waitForTimeout(300); await nav('AI').click(); await p.waitForTimeout(500);
    ok(`${w}x${h} switching doctrine persists`, (await radio('Infantry').getAttribute('aria-checked')) === 'true' && (await radio('Armored').getAttribute('aria-checked')) === 'false');

    // switch + stepper
    const sw = p.getByRole('switch', { name: /Smart Recruitment/ });
    const before = await sw.getAttribute('aria-checked');
    await sw.click(); await p.waitForTimeout(300);
    ok(`${w}x${h} on/off switch flips`, (await sw.getAttribute('aria-checked')) !== before);
    const target = card.getByText(/^\d+$/).last();
    const t0 = await target.innerText();
    await p.getByRole('button', { name: 'Army size target plus' }).click(); await p.waitForTimeout(200);
    ok(`${w}x${h} army target stepper changes value`, (await target.innerText()) !== t0, `${t0} -> ${await target.innerText()}`);

    // Custom: compact numeric inputs, live total, explicit Normalize action
    await radio('Custom').click(); await p.waitForTimeout(250);
    const armor = p.getByLabel('Armor %', { exact: true });
    ok(`${w}x${h} Custom shows numeric composition inputs`, await armor.isVisible());
    const totalText = () => p.getByTestId('composition-total').innerText();
    await armor.fill('90'); await p.waitForTimeout(250);
    const over = await totalText();
    ok(`${w}x${h} total flags a non-100 mix`, /Total (1\d\d)%/.test(over) && /over/.test(over), over);
    await p.getByRole('button', { name: 'Normalize to 100%' }).click(); await p.waitForTimeout(250);
    ok(`${w}x${h} Normalize makes the total exactly 100%`, /Total 100%/.test(await totalText()) && (await p.getByRole('button', { name: 'Normalize to 100%' }).count()) === 0, await totalText());
    await armor.fill('-5'); await p.waitForTimeout(200);
    ok(`${w}x${h} invalid input is clamped to 0`, (await armor.inputValue()) === '0');

    // no horizontal overflow, controls inside viewport
    const dims = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    ok(`${w}x${h} no horizontal overflow`, dims.sw <= dims.cw);
    const cb = await card.boundingBox();
    ok(`${w}x${h} card within viewport width`, !!cb && cb.x >= 0 && cb.x + cb.width <= w, JSON.stringify(cb && { x: Math.round(cb.x), w: Math.round(cb.width) }));
    ok(`${w}x${h} no page errors`, errs.length === 0, errs.join('|'));
    if (w === 390) await p.screenshot({ path: '/tmp/smart-recruitment-390.png' });
    await ctx.close();
  }
  await b.close(); process.exit(res.every(Boolean) ? 0 : 1);
})();
