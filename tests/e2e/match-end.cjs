// V12: enemy HQ destroyed by real combat -> VICTORY results; player HQ destroyed -> DEFEAT. Checks the destruction
// sequence, single results screen, read-only battlefield, re-open banner, and PLAY AGAIN returning a fresh match.
const { chromium } = require('playwright');
const res = []; const ok = (n, p, i = '') => { res.push(p); console.log((p ? 'PASS ' : 'FAIL ') + n + (i ? ' - ' + i : '')); };
(async () => {
  const b = await chromium.launch();
  for (const [w, h, defeat] of [[1280, 800, false], [390, 844, true]]) {
    const tag = `${w}x${h} ${defeat ? 'defeat' : 'victory'}`;
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: w < 500, isMobile: w < 500 });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:4173/?debug=1'); await p.waitForTimeout(500);
    await p.getByText('Quick Deploy').first().click(); await p.waitForTimeout(1200);
    await p.evaluate(defeat => {
      const e = window.__engine; e.mode = 'skirmish'; e.victoryCondition = 'destroy_hq';
      const side = defeat ? 'player' : 'enemy', atk = defeat ? 'enemy' : 'player';
      const hq = e.buildings.find(x => x.type === 'headquarters' && x.faction === side);
      hq.hp = Math.min(hq.hp, 900);
      const ids = []; for (let i = 0; i < 8; i++) ids.push(e.spawnUnit('heavy_tank', atk, { x: hq.pixelX - 160 + (i % 4) * 34, y: hq.pixelY + 150 + Math.floor(i / 4) * 34 }).id);
      if (defeat) for (const id of ids) { const u = e.units.find(x => x.id === id); u.targetBuildingId = hq.id; u.command = 'attack'; }
      else e.issueAttack(ids, undefined, hq.id);
    }, defeat);
    await p.waitForFunction(() => window.__engine.matchEnd, null, { timeout: 60000 });
    const seq = await p.evaluate(() => ({ phase: window.__engine.matchPhase, status: window.__engine.gameStatus, hq: window.__engine.buildings.filter(x => x.type === 'headquarters').length }));
    ok(`${tag} outcome decided by the engine, destruction sequence running`, seq.phase === (defeat ? 'defeat' : 'victory') && seq.hq === 1, JSON.stringify(seq));
    ok(`${tag} no results screen during the sequence`, (await p.getByTestId('match-results').count()) === 0);
    await p.getByTestId('match-results').waitFor({ timeout: 10000 });
    const outcome = await p.getByTestId('match-results').getAttribute('data-outcome');
    ok(`${tag} results screen shows the right outcome`, outcome === (defeat ? 'defeat' : 'victory'), outcome);
    const text = await p.getByTestId('match-results').innerText();
    ok(`${tag} reason and statistics shown`, text.includes(defeat ? 'YOUR HEADQUARTERS HAS FALLEN' : 'ENEMY HEADQUARTERS DESTROYED') && /Match duration/.test(text) && /Damage dealt/.test(text));
    ok(`${tag} no float artifacts in statistics`, !/\d\.\d{3,}|NaN|undefined/.test(text));
    await p.getByTestId('view-battlefield').click(); await p.waitForTimeout(500);
    const frozen = await p.evaluate(async () => { const t = window.__engine.gameTime; await new Promise(r => setTimeout(r, 500)); return t === window.__engine.gameTime; });
    ok(`${tag} battlefield is frozen and read-only`, frozen && !(await p.evaluate(() => window.__engine.commandsEnabled)));
    ok(`${tag} results do not re-open by themselves`, (await p.getByTestId('match-results').count()) === 0);
    await p.getByTestId('match-over-banner').click(); await p.waitForTimeout(300);
    ok(`${tag} banner re-opens the results`, (await p.getByTestId('match-results').count()) === 1);
    await p.getByTestId('play-again').click(); await p.waitForTimeout(1200);
    const fresh = await p.evaluate(() => ({ phase: window.__engine.matchPhase, end: window.__engine.matchEnd, hqs: window.__engine.buildings.filter(x => x.type === 'headquarters').length }));
    ok(`${tag} PLAY AGAIN starts a valid new match`, fresh.phase === 'playing' && fresh.end === null && fresh.hqs === 2, JSON.stringify(fresh));
    ok(`${tag} no page errors`, errs.length === 0, errs.join('|'));
    await ctx.close();
  }
  await b.close(); process.exit(res.every(Boolean) ? 0 : 1);
})();
