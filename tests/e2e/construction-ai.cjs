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
    ok(`${tag} seven strategies offered`, opts.length === 7 && ['Defense Only', 'Adaptive Commander', 'Support & Recovery', 'Strategic Planner'].every(x => opts.includes(x)), opts.join(' | '));
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

    // V8.2: plan tools
    const status = (await p.getByTestId('construction-status').innerText()).trim();
    ok(`${tag} status line shows active/planned/waiting`, /Active \d+ · Planned \d+ · Waiting \d+/.test(status), status);
    await p.getByRole('button', { name: 'Building priorities' }).scrollIntoViewIfNeeded();
    await p.getByRole('button', { name: 'Building priorities' }).click(); await p.waitForTimeout(150);
    ok(`${tag} Building priorities lists the real plan`, (await p.getByTestId('construction-priorities').innerText()).length > 10);
    await p.getByRole('button', { name: 'Explain decision' }).click(); await p.waitForTimeout(150);
    const ex = await p.getByTestId('construction-explain').innerText();
    ok(`${tag} Explain decision gives plain-language reasons`, ex.trim().length > 20, ex.split('\n')[0]);
    await p.getByRole('button', { name: /Recalculate/ }).click(); await p.waitForTimeout(150);
    const lim = p.getByRole('button', { name: /Building limits/ }); await lim.scrollIntoViewIfNeeded(); await lim.click(); await p.waitForTimeout(150);
    const plus = p.getByRole('button', { name: 'Refinery & Silo max minus' }).first();
    await plus.scrollIntoViewIfNeeded(); await plus.click(); await p.waitForTimeout(150);
    ok(`${tag} a building can be excluded (max 0)`, (await p.getByLabel('Refinery & Silo maximum').innerText()).trim() === '0');
    await p.getByRole('button', { name: 'Refinery & Silo max plus' }).first().click(); // back to unlimited
    await p.getByRole('button', { name: 'Refinery & Silo max plus' }).first().isVisible();
    await lim.click();

    // cancel exactly one
    const liveNames = [];
    for (let s2 = 1; s2 <= 5; s2++) liveNames.push((await p.getByTestId(`slot-name-${s2}`).innerText()).trim());
    if (liveNames.some(n => n !== 'Free')) {
      const target = liveNames.find(n => n !== 'Free');
      const before = await active();
      const cancel = p.getByRole('button', { name: new RegExp('^Cancel ' + target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }).first();
      const nBefore = await cancel.count();
      const countOf = async () => (await Promise.all([1, 2, 3, 4, 5].map(k => p.getByTestId('slot-name-' + k).innerText()))).filter(x => x.trim() === target).length;
      const before2 = await countOf();
      if (nBefore) {
        const clicked = await cancel.click({ timeout: 3000 }).then(() => true).catch(() => false); // the project may finish while we aim at it
        await p.waitForTimeout(100);
        if (clicked) ok(`${tag} cancelling a project removes exactly that project`, (await countOf()) === before2 - 1, `${target}: ${before2} -> ${await countOf()}`);
      }
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
