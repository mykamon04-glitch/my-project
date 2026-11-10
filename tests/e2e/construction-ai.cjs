// Construction AI dashboard in the real UI: modes, limit, five live slot cards, cancel, approve; mobile layout.
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
    const nav = t => p.locator('nav button').filter({ hasText: new RegExp('^\\s*' + t + '\\s*$') }).first();
    await nav('AI').click(); await p.waitForTimeout(600);
    const panel = p.getByTestId('construction-ai');
    ok(`${tag} panel visible`, await panel.isVisible());
    const count = () => p.getByTestId('construction-count').innerText();
    ok(`${tag} starts at 0/5 when off`, (await count()).trim() === '0/5', await count());

    const mode = name => p.getByRole('radio', { name, exact: true }).first();
    await mode('AUTO').click(); await p.waitForTimeout(6500);
    ok(`${tag} AUTO fills all five slots`, (await count()).trim() === '5/5', await count());
    const names = [], pcts1 = [];
    for (let s = 1; s <= 5; s++) {
      names.push((await p.getByTestId(`slot-name-${s}`).innerText()).trim());
      pcts1.push(parseInt(await p.getByTestId(`slot-pct-${s}`).innerText(), 10));
    }
    ok(`${tag} every slot names a real building`, names.every(n => n && n !== 'Free'), names.join(' | '));
    const statuses = await Promise.all([1, 2, 3, 4, 5].map(s => p.getByTestId(`slot-status-${s}`).innerText()));
    ok(`${tag} slots are constructing`, statuses.filter(x => /Constructing/.test(x)).length >= 4, statuses.join(' | '));
    await p.waitForTimeout(3000);
    const pcts2 = [];
    for (let s = 1; s <= 5; s++) pcts2.push(parseInt(await p.getByTestId(`slot-pct-${s}`).innerText().catch(() => '0'), 10));
    const advanced = pcts2.filter((v, i) => v > pcts1[i]).length;
    ok(`${tag} progress advances independently (real state)`, advanced >= 3 && new Set(pcts2).size > 1, `${pcts1} -> ${pcts2}`);

    // controls stay inside the viewport
    const cancelBtns = p.getByRole('button', { name: /^Cancel / });
    const nBtn = await cancelBtns.count(); let inside = true;
    for (let i = 0; i < nBtn; i++) { await cancelBtns.nth(i).scrollIntoViewIfNeeded(); const bb = await cancelBtns.nth(i).boundingBox(); if (!bb || bb.x < 0 || bb.x + bb.width > w) inside = false; }
    ok(`${tag} cancel buttons within screen width`, nBtn >= 4 && inside, `buttons=${nBtn}`);
    const dims = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    ok(`${tag} no horizontal overflow`, dims.sw <= dims.cw);

    // cancel exactly one
    const before = parseInt((await count()).split('/')[0], 10);
    const slot3 = (await p.getByTestId('slot-name-3').innerText()).trim();
    await p.getByRole('button', { name: new RegExp('^Cancel ' + slot3.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }).first().click();
    await p.waitForTimeout(250);
    const after = parseInt((await count()).split('/')[0], 10);
    ok(`${tag} cancelling one project frees one slot only`, after === before - 1, `${before} -> ${after}`);

    // limit selector
    await p.getByRole('radio', { name: '2 buildings', exact: true }).click(); await p.waitForTimeout(300);
    ok(`${tag} limit shows 2`, /\/2$/.test((await count()).trim()), await count());

    // OFF keeps running ones, plans nothing new
    await mode('OFF').click(); await p.waitForTimeout(1500);
    const afterOff = parseInt((await count()).split('/')[0], 10);
    await p.waitForTimeout(3500);
    ok(`${tag} OFF plans nothing new`, parseInt((await count()).split('/')[0], 10) <= afterOff, `${afterOff} -> ${await count()}`);

    // SUGGEST waits for approval
    await p.getByRole('radio', { name: '5 buildings', exact: true }).click();
    await mode('SUGGEST').click(); await p.waitForTimeout(6000);
    const awaiting = (await Promise.all([1, 2, 3, 4, 5].map(s => p.getByTestId(`slot-status-${s}`).innerText().catch(() => '')))).filter(x => /Awaiting approval/.test(x)).length;
    ok(`${tag} SUGGEST proposes projects that await approval`, awaiting >= 1, `awaiting=${awaiting}`);
    const approve = p.getByRole('button', { name: /^Approve (?!all)/ }).first();
    await approve.scrollIntoViewIfNeeded();
    const card = approve.locator('xpath=ancestor::div[starts-with(@data-testid,"slot-card-")][1]');
    const cardId = await card.getAttribute('data-testid');
    const slotNo = cardId.split('-').pop();
    await approve.click(); await p.waitForTimeout(600);
    const st = await p.getByTestId(`slot-status-${slotNo}`).innerText();
    ok(`${tag} approving a proposal starts that very project`, /Constructing|Waiting for resources/.test(st), `slot ${slotNo}: ${st}`);

    if (w === 390) { await panel.scrollIntoViewIfNeeded(); await p.screenshot({ path: '/tmp/construction-ai-390.png' }); }
    ok(`${tag} no page errors`, errs.length === 0, errs.join('|'));
    await ctx.close();
  }
  await b.close(); process.exit(res.every(Boolean) ? 0 : 1);
})();
