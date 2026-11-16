// V14 navigation acceptance tests (real browser, phone and desktop): Back / Home / Resume / Pause on every screen,
// Esc and browser/Android back, unsaved-settings protection, and that returning from menus never resets the match.
const { chromium } = require('playwright');
const res = []; const ok = (n, p, i = '') => { res.push(p); console.log((p ? 'PASS ' : 'FAIL ') + n + (i ? ' - ' + i : '')); };
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[390, 844], [1280, 800], [844, 390]]) {
    const tag = `${w}x${h}`;
    const mobile = w < 900;
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: mobile, isMobile: mobile && w < 500 });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    const tid = id => p.getByTestId(id);
    const visible = async id => (await tid(id).count()) > 0 && (await tid(id).first().isVisible());
    const screen = async () => (await visible('main-menu')) ? 'main' : (await visible('map-select')) ? 'maps' : (await visible('match-setup')) ? 'setup' : (await visible('top-hud')) ? 'game' : '?';
    await p.goto('http://127.0.0.1:4173/?debug=1'); await p.waitForTimeout(600);
    ok(`${tag} main menu shown`, (await screen()) === 'main');

    // Map Selection -> Back returns to the main menu
    await tid('menu-maps').click(); await p.waitForTimeout(250);
    ok(`${tag} map selection opens with 5 real previews`, (await screen()) === 'maps' && (await p.locator('[data-testid^="map-card-"]').count()) === 5);
    await tid('nav-back').click(); await p.waitForTimeout(250);
    ok(`${tag} Map Selection -> Back -> main menu`, (await screen()) === 'main');

    // Settings from the main menu: category -> Back -> list -> Back -> menu; Home works
    await tid('menu-settings').click(); await p.waitForTimeout(250);
    await tid('settings-cat-graphics').click(); await p.waitForTimeout(150);
    ok(`${tag} Settings -> Graphics opens the category`, (await tid('settings-screen').getAttribute('data-category')) === 'graphics');
    await tid('nav-back').click(); await p.waitForTimeout(150);
    ok(`${tag} Settings -> Graphics -> Back returns to Settings`, (await tid('settings-screen').getAttribute('data-category')) === '' && await visible('settings-categories'));
    await tid('nav-back').click(); await p.waitForTimeout(150);
    ok(`${tag} Settings -> Back -> main menu`, (await tid('settings-screen').count()) === 0 && (await screen()) === 'main');
    await tid('menu-settings').click(); await p.waitForTimeout(150);
    await tid('nav-home').click(); await p.waitForTimeout(150);
    ok(`${tag} Settings -> Home -> main menu`, (await tid('settings-screen').count()) === 0 && (await screen()) === 'main');

    // Esc / browser back on menus
    await tid('menu-maps').click(); await p.waitForTimeout(200);
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    ok(`${tag} Esc goes back from Map Selection`, (await screen()) === 'main');
    await tid('menu-new-game').click(); await p.waitForTimeout(200);
    await p.goBack().catch(() => {}); await p.waitForTimeout(300);
    ok(`${tag} browser/Android back goes back from Match Setup`, (await screen()) === 'main', await screen());

    // New game -> setup -> start a skirmish on the desert map
    await tid('menu-maps').click(); await p.waitForTimeout(200);
    await tid('map-card-desert_frontline').click(); await tid('map-continue').click(); await p.waitForTimeout(250);
    ok(`${tag} map choice carries into match setup`, (await tid('match-setup').innerText()).includes('Desert Frontline'));
    await tid('setup-start').click(); await p.waitForTimeout(1400);
    ok(`${tag} match starts`, (await screen()) === 'game');
    const sig = async () => p.evaluate(() => { const e = window.__engine; return e ? { id: e.mapData.id, n: e.units.length, b: e.buildings.length, credits: Math.round(e.economy.credits) } : null; });
    const before = await sig();
    ok(`${tag} match uses the chosen map`, before && before.id === 'desert_frontline', JSON.stringify(before));
    // select something so we can check selection survives a trip through the menus
    await p.evaluate(() => { const e = window.__engine; const u = e.units.find(x => x.faction === 'player'); u.selected = true; });

    // Pause -> Resume preserves the match and pauses the simulation meanwhile
    await p.evaluate(() => { window.__engPause = window.__engine; });
    await tid('hud-menu').click(); await p.waitForTimeout(250);
    ok(`${tag} menu button opens the pause menu`, await visible('pause-menu'));
    const t0 = await p.evaluate(() => window.__engine.gameTime); await p.waitForTimeout(600);
    ok(`${tag} simulation is paused while the menu is open`, (await p.evaluate(() => window.__engine.gameTime)) === t0);
    await tid('pause-resume').click(); await p.waitForTimeout(500);
    const after = await sig();
    const same = await p.evaluate(() => window.__engPause === window.__engine);
    ok(`${tag} Pause -> Resume preserves the match`, same && after.id === before.id && after.b >= before.b && (await screen()) === 'game' && !(await visible('pause-menu')), JSON.stringify({ before, after }));
    ok(`${tag} simulation runs again after Resume`, (await p.evaluate(() => window.__engine.gameTime)) > t0);

    // Gameplay -> Settings -> Graphics -> Back -> Back preserves the match
    const eng1 = await p.evaluate(() => { window.__engMark = window.__engine; return true; });
    await tid('hud-menu').click(); await tid('pause-settings').click(); await p.waitForTimeout(200);
    await tid('settings-cat-graphics').click(); await p.waitForTimeout(150);
    await tid('nav-back').click(); await tid('nav-back').click(); await p.waitForTimeout(250);
    ok(`${tag} Gameplay -> Settings -> Back returns to the pause menu`, await visible('pause-menu'));
    await tid('pause-resume').click(); await p.waitForTimeout(250);
    ok(`${tag} ... and the same match continues (no new engine)`, eng1 && (await p.evaluate(() => window.__engMark === window.__engine)) && (await screen()) === 'game');
    // Settings Resume button
    await tid('hud-menu').click(); await tid('pause-settings').click(); await p.waitForTimeout(150);
    await tid('settings-resume').click(); await p.waitForTimeout(200);
    ok(`${tag} Settings -> Resume returns straight to the match`, (await screen()) === 'game' && !(await visible('settings-screen')) && !(await visible('pause-menu')));

    // Unsaved settings: Back asks before discarding
    await tid('hud-menu').click(); await tid('pause-settings').click(); await p.waitForTimeout(150);
    await tid('settings-cat-graphics').click(); await p.waitForTimeout(150);
    const q0 = await p.evaluate(() => window.__engine.settings.graphicsQuality);
    await p.getByRole('button', { name: /Performance/ }).first().click(); await p.waitForTimeout(100);
    await tid('nav-back').click(); await tid('nav-back').click(); await p.waitForTimeout(200);
    ok(`${tag} unapplied settings changes are not dropped silently`, await visible('confirm-dialog'));
    await tid('confirm-discard').click(); await p.waitForTimeout(200);
    ok(`${tag} Discard restores the previous value`, (await p.evaluate(() => window.__engine.settings.graphicsQuality)) === q0);
    if (await visible('pause-menu')) await tid('pause-resume').click();

    // Esc in a match opens the pause menu; Esc again resumes
    await p.evaluate(() => { const e = window.__engine; e.units.forEach(u => (u.selected = false)); });
    await p.keyboard.press('Escape'); await p.waitForTimeout(150);
    if (!(await visible('pause-menu'))) { await p.keyboard.press('Escape'); await p.waitForTimeout(150); }
    ok(`${tag} Esc in a match opens Pause`, await visible('pause-menu'));
    await p.keyboard.press('Escape'); await p.waitForTimeout(150);
    ok(`${tag} Esc closes Pause`, !(await visible('pause-menu')) && (await screen()) === 'game');
    // Android/browser back in a match opens pause, never leaves the game
    await p.goBack().catch(() => {}); await p.waitForTimeout(300);
    ok(`${tag} system back in a match opens Pause (never exits)`, await visible('pause-menu') && (await screen()) === 'game');

    // Main menu from pause asks for confirmation; Cancel keeps the match; Save & Exit saves
    await tid('pause-main-menu').click(); await p.waitForTimeout(150);
    ok(`${tag} Main menu asks for confirmation`, await visible('confirm-dialog'));
    await tid('confirm-cancel').click(); await p.waitForTimeout(150);
    ok(`${tag} Cancel keeps the match`, (await screen()) === 'game');
    await tid('pause-main-menu').click(); await tid('confirm-save-exit').click(); await p.waitForTimeout(400);
    ok(`${tag} Save and exit returns to the main menu`, (await screen()) === 'main' && (await p.evaluate(() => !!JSON.parse(localStorage.getItem('iron_dominion_save_slots') || '{}').quicksave)));
    // Continue restores the saved match (same map)
    ok(`${tag} Continue is offered`, await visible('menu-continue'));
    await tid('menu-continue').click(); await p.waitForTimeout(1200);
    const cont = await sig();
    ok(`${tag} Continue restores the saved map`, (await screen()) === 'game' && cont && cont.id === 'desert_frontline', JSON.stringify(cont));

    // Restart (with confirmation) keeps the map and seed
    await tid('hud-menu').click(); await tid('pause-restart').click(); await p.waitForTimeout(150);
    await tid('confirm-restart').click(); await p.waitForTimeout(900);
    const rs = await sig();
    ok(`${tag} Restart starts a fresh match on the same map`, rs && rs.id === 'desert_frontline' && (await screen()) === 'game' && !(await visible('pause-menu')));
    // Controls (help) overlay has an exit
    await tid('hud-menu').click(); await tid('pause-help').click(); await p.waitForTimeout(150);
    await tid('nav-back').click(); await p.waitForTimeout(150);
    ok(`${tag} Controls -> Back returns to Pause`, await visible('pause-menu'));
    await tid('pause-main-menu').click(); await tid('confirm-exit').click(); await p.waitForTimeout(300);
    ok(`${tag} Exit without saving -> main menu`, (await screen()) === 'main');
    const dims = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    ok(`${tag} no horizontal overflow`, dims.sw <= dims.cw);
    ok(`${tag} no page errors`, errs.length === 0, errs.join('|').slice(0, 300));
    await p.evaluate(() => localStorage.clear());
    await ctx.close();
  }
  await b.close(); process.exit(res.every(Boolean) ? 0 : 1);
})();
