/**
 * QA against a deployed URL (used by .github/workflows/deploy.yml, also runnable locally):
 *   DEPLOY_URL=https://lvepelli.github.io/TheWorldIsAlive/ QA_OUT=/tmp/qa node tests/e2e/deployed.mjs
 * Checks intro → generation → map → sections → panels → map modes → God Mode (ES + EN) → alerts →
 * localization → text hygiene → save/reload → PWA assets on three phone viewports and desktop;
 * writes screenshots + REPORT.md to docs/qa (or QA_OUT).
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { startWorld, nav, closeInspector, closeDrawer, dismissCinematic, textIssues, overflow } from './_lib.mjs';

const RAW = process.env.DEPLOY_URL || 'http://localhost:4173/';
const SITE = /\.html$/.test(RAW) ? RAW : RAW.replace(/\/?$/, '/');
const OUT = process.env.QA_OUT ? process.env.QA_OUT.replace(/\/?$/, '/') : new URL('../../docs/qa/', import.meta.url).pathname; // QA_OUT: write elsewhere for local runs so CI-owned docs/qa stays untouched
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const report = [`# Deployed QA report`, ``, `URL: ${SITE}`, `Date: ${new Date().toISOString()}`, ``];
let failures = 0;

async function run(name, viewport, mobile) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const lines = [`## ${name} (${viewport.width}×${viewport.height})`, ``];
  const check = (ok, msg) => { lines.push(`- ${ok ? '✅' : '❌'} ${msg}`); if (!ok) failures++; };
  const shot = (n) => page.screenshot({ path: `${OUT}${name}-${n}.png` });
  const painted = () => page.evaluate(() => { const c = document.querySelector('.map-canvas'); const g = c.getContext('2d'); const d = g.getImageData(0, 0, c.width, c.height).data; let lit = 0; for (let i = 0; i < d.length; i += 4 * 97) if (d[i] + d[i + 1] + d[i + 2] > 60) lit++; return lit; });
  try {
    const res = await page.goto(SITE, { waitUntil: 'load', timeout: 60000 });
    check(res && res.ok(), `page loads (HTTP ${res?.status()}, ${res?.headers()['content-type'] ?? '?'})`);
    if ((await page.locator('text=Open the page').count()) > 0) { lines.push('- ℹ️ host interstitial clicked (githack "One more step")'); await page.click('text=Open the page'); await page.waitForLoadState('load'); errors.length = 0; }
    await page.waitForSelector('[data-testid="seed"]', { timeout: 30000 });
    check(true, 'intro renders');
    check((await page.evaluate(() => document.documentElement.lang)) === 'es', 'Spanish is the default language');
    check(!(await overflow(page)), 'no horizontal overflow on intro');
    await shot('01-intro');
    await startWorld(page, 'qa-' + viewport.width, { pause: false });
    check(true, 'world generated, map canvas present');
    check((await painted()) > 50, `map is painted`);
    await shot('02-world');
    const date1 = await page.locator('[data-testid="date"]').innerText();
    await page.waitForTimeout(3200);
    const date2 = await page.locator('[data-testid="date"]').innerText();
    check(date1 !== date2, `simulation progresses at 1× (${date1} → ${date2})`);
    await page.click('[data-testid="speed-0"]');
    await dismissCinematic(page);
    const small = await page.evaluate(() => Array.from(document.querySelectorAll('.bottom-nav button, .clock .speeds button, .btn, .nav-rail button')).filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.height < 28 || r.width < 26); }).length);
    check(small === 0, `no visible controls under 28px (${small})`);
    // tap to select, then drag
    const box = await page.locator('.map-canvas').boundingBox();
    let selected = false;
    for (let i = 0; i < 24 && !selected; i++) { const x = box.x + box.width * (0.12 + (i % 6) * 0.15), y = box.y + box.height * (0.28 + Math.floor(i / 6) * 0.12); if (mobile) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); await page.waitForTimeout(300); selected = (await page.locator('[data-testid="inspector"]').count()) > 0; }
    check(selected, 'tap on map opens the entity panel');
    if (selected) check((await page.locator('.inspector [data-tab]').count()) >= 3, 'entity panel has tabs');
    await shot('03-inspector');
    const inspOverflow = await page.evaluate(() => { const el = document.querySelector('.inspector'); return el ? el.scrollWidth > el.clientWidth + 1 : false; });
    check(!inspOverflow, 'entity panel has no horizontal overflow');
    await closeInspector(page);
    await page.waitForTimeout(300);
    const before = await page.screenshot({ clip: { x: box.x + 10, y: box.y + box.height * 0.45, width: 120, height: 80 } });
    if (mobile) { const cdp = await ctx.newCDPSession(page); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width * 0.5, y: box.y + box.height * 0.5 }] }); for (let k = 1; k <= 6; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width * 0.5 + k * 20, y: box.y + box.height * 0.5 + k * 8 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
    else { await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5); await page.mouse.down(); await page.mouse.move(box.x + box.width * 0.5 + 140, box.y + box.height * 0.5 + 60, { steps: 10 }); await page.mouse.up(); }
    await page.waitForTimeout(400);
    const after = await page.screenshot({ clip: { x: box.x + 10, y: box.y + box.height * 0.45, width: 120, height: 80 } });
    check(!before.equals(after), 'map drag moves the view');
    if (mobile) {
      const s0 = await page.evaluate(() => window.__twiaRenderer?.camera.scale ?? 0);
      const cdp2 = await ctx.newCDPSession(page); const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      await cdp2.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - 30, y: cy }, { x: cx + 30, y: cy }] });
      for (let k = 1; k <= 6; k++) await cdp2.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - 30 - k * 12, y: cy }, { x: cx + 30 + k * 12, y: cy }] });
      await cdp2.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(300);
      const s1 = await page.evaluate(() => window.__twiaRenderer?.camera.scale ?? 0);
      check(s1 > s0 * 1.2, `pinch zoom scales the map (${s0.toFixed(2)} → ${s1.toFixed(2)})`);
    }
    // Sections
    for (const s of ['countries', 'regions', 'people', 'companies', 'economy', 'politics', 'diplomacy', 'technology', 'society', 'religions', 'calendar', 'events', 'news', 'social', 'history', 'god']) {
      await nav(page, s, mobile);
      const ok = (await page.locator('[data-testid="panel-col"], [data-testid="drawer"]').count()) > 0;
      check(ok && !(await overflow(page)), `${s} section renders without overflow`);
    }
    await nav(page, 'economy', mobile); await shot('04-economy');
    await page.locator('.table tbody tr').first().click(); await page.waitForTimeout(300);
    check((await page.locator('[data-testid="inspector-kind"]').count()) > 0, 'economy table row opens the country panel');
    await closeInspector(page);
    await nav(page, 'events', mobile);
    check((await page.locator('[data-testid="event-card"]').count()) > 0, 'events timeline lists events');
    await page.locator('[data-testid="event-card"]').first().click(); await page.waitForTimeout(400);
    check((await page.locator('[data-testid="chain"]').count()) > 0, 'event detail shows causes and consequences');
    await shot('05-event');
    await closeInspector(page);
    await nav(page, 'news', mobile); await page.click('.chip:nth-child(2)'); await page.waitForTimeout(300);
    check((await page.locator('.article').count()) > 0 || (await page.locator('[data-testid="drawer"] .dim').count()) > 0, 'news renders articles or an empty state');
    await nav(page, 'calendar', mobile); await shot('06-calendar');
    await nav(page, 'people', mobile);
    await page.locator('.entity-row').first().click(); await page.waitForTimeout(400);
    const ask = page.locator('[data-testid="ask"]');
    if (await ask.count()) { await ask.fill('¿Qué quieres?'); await ask.press('Enter'); await page.waitForTimeout(500); }
    check((await page.locator('[data-testid="answer"]').count()) > 0, 'a character answers a question');
    await closeInspector(page);
    // Map modes
    await nav(page, 'world', mobile);
    await page.click('[data-testid="mapmode"]'); await page.click('[data-mapmode="regions"]'); await page.waitForTimeout(900);
    check((await painted()) > 50, 'Regions map mode paints the map');
    await shot('07-regions');
    { let kind = '';
      for (const [fx, fy] of [[0.5, 0.42], [0.4, 0.35], [0.6, 0.5], [0.3, 0.55]]) { await page.mouse.click(Math.round(viewport.width * fx), Math.round(viewport.height * fy)); await page.waitForTimeout(500); kind = (await page.locator('[data-testid="inspector-kind"]').first().textContent().catch(() => '')) ?? ''; if (/regi/i.test(kind)) break; await closeInspector(page); }
      check(/regi/i.test(kind), 'tap in Regions mode opens a region panel');
      await closeInspector(page); }
    for (const m of ['economy', 'population', 'diplomacy', 'conflict', 'religion', 'political']) { await page.click('[data-testid="mapmode"]'); await page.click(`[data-mapmode="${m}"]`); await page.waitForTimeout(250); }
    check((await painted()) > 50, 'map modes cycle without breaking the map');
    // God Mode: Spanish + English free text, categories, preset
    await nav(page, 'god', mobile);
    await page.fill('[data-testid="god-input"]', 'Dentro de dos semanas empieza una pandemia global'); await page.waitForTimeout(500);
    check((await page.locator('[data-testid="god-preview"]').count()) > 0 && /2 (weeks|semanas)|14/.test(await page.locator('[data-testid="god-preview"]').innerText()), 'Spanish delayed God command is understood');
    await page.fill('[data-testid="god-input"]', 'The strongest nation annexes a region of its neighbour'); await page.waitForTimeout(500);
    check(/annex|anexion/i.test(await page.locator('[data-testid="god-preview"]').innerText()), 'English God command is understood');
    await page.fill('[data-testid="god-input"]', 'Una pequeña empresa descubre una batería que almacena veinte veces más energía.'); await page.waitForTimeout(500);
    await page.click('[data-testid="god-execute"]'); await page.waitForTimeout(900); await dismissCinematic(page);
    check((await page.locator('[data-testid="god-result"]').count()) > 0, 'God intervention executed');
    check((await page.locator('[data-god-group]').count()) >= 10, 'God Mode shows its categories');
    await page.click('[data-god-group="environment"]'); await page.click('.preset[data-preset="meteor"]');
    check((await page.locator('[data-testid="god-config"]').count()) > 0, 'preset configuration shows target, magnitude and timing');
    await page.click('[data-testid="god-run-preset"]'); await page.waitForTimeout(700); await dismissCinematic(page);
    await shot('08-god');
    // Alerts
    await page.click('[data-testid="alerts"]'); await page.waitForTimeout(300);
    check((await page.locator('.alert-row').count()) > 0, 'alerts panel lists grouped alerts');
    await closeDrawer(page);
    // Localization
    await nav(page, 'world', mobile);
    await page.click('[data-testid="menu"]'); await page.click('[data-testid="lang-en"]'); await page.waitForTimeout(300);
    check(/world/i.test(await page.locator(mobile ? '.bottom-nav [data-nav="world"]' : '.nav-rail [data-nav="world"]').innerText()), 'UI switches to English');
    await page.click('[data-testid="lang-es"]'); await page.waitForTimeout(300);
    check(/mundo/i.test(await page.locator(mobile ? '.bottom-nav [data-nav="world"]' : '.nav-rail [data-nav="world"]').innerText()), 'UI switches back to Spanish');
    // Save + reload
    await page.click('[data-testid="open-saves"]'); await page.click('[data-testid="save-autosave"]'); await page.waitForTimeout(600); await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    // Text hygiene on the busiest screen
    await nav(page, 'events', mobile);
    const issues = await textIssues(page);
    check(issues.length === 0, `no duplicated words or broken punctuation on screen${issues.length ? ': ' + issues.slice(0, 3).join(' | ') : ''}`);
    await closeDrawer(page);
    await page.reload({ waitUntil: 'load' });
    if ((await page.locator('text=Open the page').count()) > 0) { lines.push('- ℹ️ host interstitial appeared again after reload'); await page.click('text=Open the page'); await page.waitForLoadState('load'); errors.length = 0; }
    await page.waitForSelector('.logo', { timeout: 30000 });
    check((await page.locator('[data-testid="continue"]').count()) > 0, 'autosave survives reload (IndexedDB)');
    // PWA assets
    const manifest = await page.evaluate(async () => { const l = document.querySelector('link[rel=manifest]'); if (!l) return null; const r = await fetch(l.href); return r.ok ? await r.json() : null; });
    check(!!manifest && Array.isArray(manifest.icons) && manifest.icons.length >= 2, 'manifest served with icons');
    const sw = await page.evaluate(async () => { const r = await fetch(new URL('sw.js', location.href).href); return r.ok && (await r.text()).includes('CACHE'); });
    check(sw, 'service worker file served');
    const reg = await page.evaluate(async () => { if (!('serviceWorker' in navigator)) return 'unsupported'; await new Promise((r) => setTimeout(r, 1500)); const rg = await navigator.serviceWorker.getRegistration(); return rg ? 'registered' : 'none'; });
    if (SITE.startsWith('https') && !/jsdelivr|githack|statically/.test(SITE)) check(reg === 'registered', `service worker ${reg}`); else lines.push(`- ℹ️ service worker ${reg} (only asserted on first-party https hosts)`);
    const appErrors = errors.filter((e) => !/ERR_BLOCKED_BY_RESPONSE/.test(e));
    check(appErrors.length === 0, `no runtime errors${appErrors.length ? ': ' + appErrors.slice(0, 3).join(' | ') : ''}`);
  } catch (e) {
    check(false, `exception: ${e.message.split('\n')[0]}`);
    if (errors.length) lines.push(`- ℹ️ runtime errors: ${errors.slice(0, 5).join(' | ')}`);
    try { lines.push(`- ℹ️ body: ${(await page.evaluate(() => document.body.innerText.slice(0, 300))).replace(/\n+/g, ' / ')}`); } catch { /* ignore */ }
    try { await shot('99-error'); } catch { /* ignore */ }
  }
  report.push(...lines, '');
  await ctx.close();
}

await run('android-360', { width: 360, height: 800 }, true);
await run('iphone-390', { width: 390, height: 844 }, true);
await run('phone-430', { width: 430, height: 932 }, true);
await run('desktop-1440', { width: 1440, height: 900 }, false);
await browser.close();
report.push(failures ? `**${failures} check(s) failed.**` : '**All checks passed.**');
await writeFile(`${OUT}REPORT.md`, report.join('\n'));
console.log(report.join('\n'));
process.exit(failures ? 1 : 0);
