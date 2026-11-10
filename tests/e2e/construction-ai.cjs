// Construction AI panel (V8.1) in the real UI: strategy, toggles, modes, limit, live slots with explanations, decision log, cancel, approve.
const { chromium } = require('playwright');
const res = []; const ok = (n, p, i = '') => { res.push(p); console.log((p ? 'PASS ' : 'FAIL ') + n + (i ? ' - ' + i : '')); };
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of (process.env.ONE ? [[390, 844]] : [[390, 844], [320, 640], [844, 390]])) {
    const tag = `${w}x${h}`;
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:4173/'); await p.waitForTimeout(500);
    await p.getByText('TESTING SANDBOX', { exact: false }).first().click().catch(() => {});
    await p.getByText('Quick Deploy').first().click(); await p.waitForTimeout(2000);
    const nav = t => p.locator('nav button').filter({ hasText: new RegExp('^\\s*' + t + '\\s*$') }).first();
    await nav('AI').click(); await p.waitForTimeout(600);
    const panel = p.getByTestId('construction-ai');
    ok(`${tag} panel visible`, await panel.isVisible());
    const count = () => p.getByTestId('construction-count').innerText();
    const active = async () => parseInt((await count()).split('/')[0], 10);
    ok(`${tag} starts at 0/5 when off`, (await count()).trim() === '0/5', await count());

    // strategy selector: five real strategies, blurb follows the choice
    const sel = p.locator('#construction-strategy');
    const opts = await sel.locator('option').allInnerTexts();
    ok(`${tag} five strategies offered`, opts.length === 5 && opts.includes('Defense Only') && opts.includes('Adaptive Commander'), opts.join(' | '));
    await sel.selectOption('army_production'); await p.waitForTimeout(200);
    ok(`${tag} strategy blurb updates`, /Barracks, factories/.test(await p.getByTestId('strategy-blurb').innerText()));
    await sel.selectOption('balanced');

    // toggles flip real settings
    const sw = name => p.getByRole('switch', { name: new RegExp(name) }).first();
    const flip = async name => { const before = await sw(name).getAttribute('aria-checked'); await sw(name).scrollIntoViewIfNeeded(); await sw(name).click(); await p.waitForTimeout(150); return [before, await sw(name).getAttribute('aria-checked')]; };
    for (const n of ['Avoid duplicate', 'Allow prerequisite', 'Prioritize base defense', 'Reserve emergency']) {
      const [x, y] = await flip(n);
      ok(`${tag} toggle "${n}" flips`, x !== y, `${x} -> ${y}`);
    }
    await flip('Avoid duplicate'); await flip('Allow prerequisite'); await flip('Prioritize base defense'); await flip('Reserve emergency'); // back to defaults

    const mode = name => p.getByRole('radio', { name, exact: true }).first();
    await mode('AUTO').click(); await p.waitForTimeout(8000);
    const n1 = await active();
    ok(`${tag} AUTO starts projects but never more than the limit`, n1 >= 1 && n1 <= 5, await count());
    const names = [];
    for (let s = 1; s <= 5; s++) names.push((await p.getByTestId(`slot-name-${s}`).innerText()).trim());
    ok(`${tag} slots name real buildings or stay free`, names.filter(n => n !== 'Free').length === n1, names.join(' | '));
    const note1 = (await p.locator('[data-testid^="slot-note-"]').first().innerText()).trim();
    ok(`${tag} each project shows a short explanation`, /^(Building|Starting|Delaying|Needs your approval|Proposed)/.test(note1) && note1.length < 160, note1);

    const dims = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    ok(`${tag} no horizontal overflow`, dims.sw <= dims.cw);

    // decision log
    const logBtn = p.getByRole('button', { name: /AI decision log/ });
    await logBtn.scrollIntoViewIfNeeded(); await logBtn.click(); await p.waitForTimeout(200);
    const lines = await p.getByTestId('construction-log').locator('li').allInnerTexts();
    ok(`${tag} decision log lists real decisions`, lines.length >= 2 && lines.some(l => /Building |Completed|Skipping/.test(l)), `${lines.length} lines; first: ${lines[0]}`);
    await logBtn.click();

    // cancel exactly one
    if (n1 >= 1) {
      const target = names.find(n => n !== 'Free');
      const before = await active();
      const cancel = p.getByRole('button', { name: new RegExp('^Cancel ' + target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }).first();
      await cancel.scrollIntoViewIfNeeded(); await cancel.click(); await p.waitForTimeout(250);
      ok(`${tag} cancelling one project frees one slot only`, (await active()) === before - 1, `${before} -> ${await active()}`);
    }

    // limit selector
    await p.getByRole('radio', { name: '2 buildings', exact: true }).click(); await p.waitForTimeout(300);
    ok(`${tag} limit shows 2`, /\/2$/.test((await count()).trim()), await count());

    // OFF plans nothing new
    await mode('OFF').click(); await p.waitForTimeout(1500);
    const afterOff = await active();
    await p.waitForTimeout(3500);
    ok(`${tag} OFF plans nothing new`, (await active()) <= afterOff, `${afterOff} -> ${await count()}`);

    // SUGGEST waits for approval; a new strategy forces fresh proposals
    await p.getByRole('radio', { name: '5 buildings', exact: true }).click();
    await sel.selectOption('adaptive');
    await mode('SUGGEST').click(); await p.waitForTimeout(7000);
    const awaiting = (await Promise.all([1, 2, 3, 4, 5].map(s => p.getByTestId(`slot-status-${s}`).innerText().catch(() => '')))).filter(x => /Awaiting approval/.test(x)).length;
    ok(`${tag} SUGGEST proposes projects that await approval`, awaiting >= 1, `awaiting=${awaiting}`);
    if (awaiting >= 1) {
      const approve = p.getByRole('button', { name: /^Approve (?!all)/ }).first();
      await approve.scrollIntoViewIfNeeded();
      const card = approve.locator('xpath=ancestor::div[starts-with(@data-testid,"slot-card-")][1]');
      const slotNo = (await card.getAttribute('data-testid')).split('-').pop();
      await approve.click(); await p.waitForTimeout(600);
      const st = await p.getByTestId(`slot-status-${slotNo}`).innerText();
      ok(`${tag} approving a proposal starts that very project`, /Constructing|Waiting for resources/.test(st), `slot ${slotNo}: ${st}`);
    }

    if (w === 390) { await panel.scrollIntoViewIfNeeded(); await p.screenshot({ path: '/tmp/construction-ai-390.png' }); }
    ok(`${tag} no page errors`, errs.length === 0, errs.join('|'));
    await ctx.close();
  }
  await b.close(); process.exit(res.every(Boolean) ? 0 : 1);
})();
