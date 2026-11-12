// Scans all rendered text in every panel for float artifacts / NaN / Infinity / undefined.
const { chromium } = require('playwright');
const BAD = /\d+\.\d{3,}|\bNaN\b|\bInfinity\b|\bundefined\b|\bnull\b/;
(async () => {
  const b = await chromium.launch();
  const bad = [];
  for (const [w, h] of [[390, 844], [844, 390], [1280, 720]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    const p = await ctx.newPage();
    await p.goto('http://127.0.0.1:4173/'); await p.waitForTimeout(600);
    const scan = async (label) => {
      const t = await p.locator('body').innerText();
      for (const line of t.split('\n')) if (BAD.test(line)) bad.push(`${w}x${h} [${label}] ${line.trim().slice(0, 100)}`);
    };
    await scan('main-menu');
    await p.getByText('Quick Deploy').first().click(); await p.waitForTimeout(6000); // let sim run several seconds
    await scan('hud');
    for (const tab of ['BUILD', 'ARMY', 'DEFENSE', 'AI', 'MORE']) {
      await p.locator('nav button').filter({ hasText: new RegExp('^\\s*' + tab + '\\s*$') }).first().click().catch(() => {});
      await p.waitForTimeout(700); await scan(tab);
    }
    // select all units via the army tab and scan the selection dock
    await p.locator('nav button').filter({ hasText: /^\s*ARMY\s*$/ }).first().click().catch(() => {});
    await p.waitForTimeout(400);
    const all = p.getByText(/^ALL \(/).first(); if (await all.count()) { await all.click().catch(() => {}); await p.waitForTimeout(500); await scan('army-all'); }
    await ctx.close();
  }
  await b.close();
  if (bad.length) { console.log('FOUND ' + bad.length + ' suspicious strings'); bad.forEach(x => console.log(' ' + x)); process.exit(1); }
  console.log('PASS no float artifacts / NaN / Infinity / undefined in any scanned panel');
})();
