// One-tap Select All Troops from the top HUD troop counter, the compact selection dock (V12: count + MOVE | ATTACK |
// DEFEND | MORE, filters inside MORE), clear, and no-select-on-scroll.
const { chromium } = require('playwright');
const res = []; const ok = (n, p, i = '') => { res.push(p); console.log((p ? 'PASS ' : 'FAIL ') + n + (i ? ' - ' + i : '')); };
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[390, 844], [320, 640], [844, 390]]) {
    const tag = `${w}x${h}`;
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:4173/'); await p.waitForTimeout(500);
    await p.getByText('TESTING SANDBOX', { exact: false }).first().click().catch(() => {});
    await p.getByText('Quick Deploy').first().click(); await p.waitForTimeout(2000);
    const chip = p.getByTitle(/select all troops/i).first();
    ok(`${tag} troop counter is a control`, await chip.isVisible(), (await chip.innerText()).replace(/\n/g, ' '));
    ok(`${tag} nothing selected at start`, (await p.getByText(/\d+ UNITS? SELECTED/).count()) === 0);
    await chip.click(); await p.waitForTimeout(400);
    const header = p.getByText(/\d+ UNITS? SELECTED/).first();
    ok(`${tag} tap selects troops and updates the panel`, await header.isVisible(), await header.innerText().catch(() => ''));
    const n = parseInt((await header.innerText()).match(/\d+/)[0], 10);
    await p.getByTestId('cmd-more').click(); await p.waitForTimeout(250);
    const chips = await p.locator('[title^="Select only "]').allInnerTexts();
    const sum = chips.length ? chips.reduce((a, t) => a + parseInt((t.match(/(\d+)\s*$/) || [0, 0])[1], 10), 0) : n;
    ok(`${tag} count equals the per-type breakdown`, n > 0 && sum === n, `selected=${n} breakdown=${sum}`);
    ok(`${tag} group commands are offered`, (await p.getByTestId('cmd-move').count()) > 0 && (await p.getByTestId('cmd-attack').count()) > 0 && (await p.getByTestId('cmd-defend').count()) > 0);
    ok(`${tag} filter buttons exist`, (await p.getByTestId('selection-filters').getByRole('button').allInnerTexts()).join('|').replace(/\n/g, '').includes('Select All'));
    const f = async name => { await p.getByTestId('selection-filters').getByRole('button', { name, exact: true }).click(); await p.waitForTimeout(250); };
    await f('Infantry');
    const hdr2 = (await p.getByText(/\d+ UNITS? SELECTED/).first().innerText().catch(() => '')).trim();
    ok(`${tag} Infantry filter narrows the selection`, /\d+ UNITS? SELECTED/.test(hdr2) && parseInt(hdr2.match(/\d+/)[0], 10) <= n, hdr2);
    await f('Select All');
    ok(`${tag} Select All restores every troop`, parseInt((await p.getByText(/\d+ UNITS? SELECTED/).first().innerText()).match(/\d+/)[0], 10) === n);
    await p.getByTestId('clear-selection').click(); await p.waitForTimeout(250);
    ok(`${tag} Clear (x) empties the panel`, (await p.getByText(/\d+ UNITS? SELECTED/).count()) === 0);
    // dragging across the HUD must not select
    const bb = await chip.boundingBox();
    await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.mouse.down(); await p.mouse.move(bb.x + bb.width + 40, bb.y + 20, { steps: 5 }); await p.mouse.up(); await p.waitForTimeout(250);
    ok(`${tag} dragging off the counter does not select`, (await p.getByText(/\d+ UNITS? SELECTED/).count()) === 0);
    const dims = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    ok(`${tag} no horizontal overflow`, dims.sw <= dims.cw);
    ok(`${tag} no page errors`, errs.length === 0, errs.join('|'));
    await ctx.close();
  }
  await b.close(); process.exit(res.every(Boolean) ? 0 : 1);
})();
