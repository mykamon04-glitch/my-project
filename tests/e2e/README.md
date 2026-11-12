# Browser regression checks

Drive the real UI (Playwright) and assert on real state changes, not appearance.

    npm install --legacy-peer-deps && npm run build
    npx vite preview --port 4173 &
    node tests/e2e/smoke.cjs 390 844      # also try 320 640, 844 390, 768 1024, 1280 720
    node tests/e2e/sheet-drag.cjs
    node tests/e2e/placement-cancel.cjs
    node tests/e2e/graphics-settings.cjs
    node tests/e2e/smart-recruitment.cjs
    node tests/e2e/construction-ai.cjs   # uses Sandbox mode
    node tests/e2e/number-scan.cjs    # slow (~2 min)

Requires the `playwright` package and a Chromium build. `smoke.cjs` checks: no horizontal overflow, placement
controls visible and on-screen, credits actually deducted after CONFIRM, AI switch flips real engine state,
integer HP formatting, army/recruitment/defense/MORE panels open. `sheet-drag.cjs` checks drag-to-snap
(collapsed/half/expanded), tap toggle, HUD/nav clearance, and orientation change.
