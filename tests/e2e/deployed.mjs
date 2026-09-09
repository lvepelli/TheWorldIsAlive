/**
 * QA against a deployed URL (used by .github/workflows/deploy.yml, also runnable locally):
 *   DEPLOY_URL=https://lvepelli.github.io/TheWorldIsAlive/ node tests/e2e/deployed.mjs
 * Checks intro → generation → map → navigation → God Mode → save/reload → PWA assets on
 * three phone viewports (portrait) and desktop; writes screenshots + docs/qa/REPORT.md.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

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
  try {
    const res = await page.goto(SITE, { waitUntil: 'load', timeout: 60000 });
    check(res && res.ok(), `page loads (HTTP ${res?.status()}, ${res?.headers()['content-type'] ?? '?'})`);
    // githack shows a one-time "One more step" interstitial for HTML; click through it.
    if ((await page.locator('text=Open the page').count()) > 0) { lines.push('- ℹ️ host interstitial clicked (githack "One more step")'); await page.click('text=Open the page'); await page.waitForLoadState('load'); errors.length = 0; /* errors so far belong to the host's interstitial page, not the app */ }
    await page.waitForSelector('input[aria-label="World seed"]', { timeout: 30000 });
    check(true, 'intro renders');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    check(!overflow, 'no horizontal overflow on intro');
    await shot('01-intro');
    await page.fill('input[aria-label="World seed"]', 'qa-' + viewport.width);
    await page.click('text=Use seed');
    await page.waitForSelector('.map-canvas', { timeout: 30000 });
    await page.waitForTimeout(2500);
    check(true, 'world generated, map canvas present');
    const painted = await page.evaluate(() => { const c = document.querySelector('.map-canvas'); const g = c.getContext('2d'); const d = g.getImageData(0, 0, c.width, c.height).data; let lit = 0; for (let i = 0; i < d.length; i += 4 * 97) if (d[i] + d[i + 1] + d[i + 2] > 60) lit++; return lit; });
    check(painted > 50, `map is painted (${painted} bright samples)`);
    if (await page.locator('text=Got it').count()) await page.click('text=Got it');
    await shot('02-world');
    const date1 = await page.locator('.clock .date').innerText();
    await page.waitForTimeout(3200);
    const date2 = await page.locator('.clock .date').innerText();
    check(date1 !== date2, `simulation progresses at 1× (${date1} → ${date2})`);
    await page.click('.clock .speeds button:nth-child(1)');
    // touch targets
    const small = await page.evaluate(() => Array.from(document.querySelectorAll('.bottom-nav button, .clock .speeds button, .btn')).filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.height < 28 || r.width < 28); }).length);
    check(small === 0, `no visible controls under 28px (${small})`);
    // tap to select (retry over a grid until land is hit), then drag
    const box = await page.locator('.map-canvas').boundingBox();
    let selected = false;
    for (let i = 0; i < 24 && !selected; i++) { const x = box.x + box.width * (0.12 + (i % 6) * 0.15), y = box.y + box.height * (0.28 + Math.floor(i / 6) * 0.12); if (mobile) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); await page.waitForTimeout(300); selected = (await page.locator('.inspector.open').count()) > 0; }
    check(selected, 'tap on map opens inspector');
    await shot('03-inspector');
    const inspOverflow = await page.evaluate(() => { const el = document.querySelector('.inspector'); return el ? el.scrollWidth > el.clientWidth + 1 : false; });
    check(!inspOverflow, 'inspector has no horizontal overflow');
    if (selected) await page.click('.inspector-head button[aria-label="Close"]');
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
    const nav = async (label) => { if (mobile && !['World', 'Live', 'News', 'God'].includes(label)) { await page.click('.bottom-nav button[aria-label="More"]'); await page.click(`.modal button:has-text("${label}")`); } else await page.click(`${mobile ? '.bottom-nav' : '.side-nav'} button[aria-label="${label}"]`); await page.waitForTimeout(400); };
    for (const s of ['Live', 'News', 'Social', 'Markets', 'History']) { await nav(s); const ov = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1); check((await page.locator('.screen-title').count()) > 0 && !ov, `${s} screen renders without overflow`); }
    await shot('04-news');
    // v0.6 features: editorials, developing stories, chronicle export, conversations, delayed God commands
    await nav('News'); await page.click('.chip:has-text("Editorials")'); await page.waitForTimeout(400);
    check((await page.locator('.tag:has-text("editorial")').count()) > 0, 'News shows weekly editorials');
    await nav('Live');
    check((await page.locator('.story-card').count()) > 0 || (await page.locator('.event-card').count()) > 0, 'Live shows developing stories or events');
    await nav('History');
    check((await page.locator('button:has-text("Export chronicle")').count()) > 0, 'History offers the chronicle export');
    await nav('People');
    await page.locator('.entity-row').first().click(); await page.waitForTimeout(500);
    const ask = page.locator('.inspector input[placeholder^="Ask"]');
    if (await ask.count()) { await ask.fill('You should make peace with your rivals'); await ask.press('Enter'); await page.waitForTimeout(500); }
    check((await page.locator('.inspector .card').count()) > 0, 'a character answers a question');
    await page.click('.inspector-head button[aria-label="Close"]');
    await nav('God');
    await page.fill('textarea.god-input', 'In 2 weeks, a global pandemic begins'); await page.waitForTimeout(500);
    check((await page.locator('text=Scheduled: in 2 weeks').count()) > 0, 'delayed God command is understood');
    await page.fill('textarea.god-input', ''); await page.waitForTimeout(200);
    await nav('Live');
    await page.locator('.event-card').first().click(); await page.waitForTimeout(400);
    check((await page.locator('.chain').count()) > 0, 'event inspector shows causal chain');
    await page.click('.inspector-head button[aria-label="Close"]');
    // v0.8/v0.9 features: Regions overlay, region seams, God region targeting (annex), governors in the country inspector
    await nav('World');
    await page.click('button:has-text("Regions")'); await page.waitForTimeout(900);
    const paintedRegions = await page.evaluate(() => { const c = document.querySelector('.map-canvas'); const g = c.getContext('2d'); const d = g.getImageData(0, 0, c.width, c.height).data; let lit = 0; for (let i = 0; i < d.length; i += 4 * 97) if (d[i] + d[i + 1] + d[i + 2] > 60) lit++; return lit; });
    check(paintedRegions > 50, `Regions overlay paints the map (${paintedRegions} bright samples)`);
    { // a tap on land while the Regions overlay is active opens that region's inspector
      let kind = '';
      for (const [fx, fy] of [[0.5, 0.42], [0.4, 0.35], [0.6, 0.5], [0.3, 0.55]]) { await page.mouse.click(Math.round(viewport.width * fx), Math.round(viewport.height * fy)); await page.waitForTimeout(500); kind = (await page.locator('.inspector .kicker').first().textContent().catch(() => '')) ?? ''; if (/region/i.test(kind)) break; await page.click('.inspector-head button[aria-label="Close"]').catch(() => {}); }
      check(/region/i.test(kind), 'tap on the Regions overlay opens a region inspector');
      await page.click('.inspector-head button[aria-label="Close"]').catch(() => {});
    }
    await page.click('button:has-text("Political")'); await page.waitForTimeout(300);
    await nav('God');
    await page.fill('textarea.god-input', 'The strongest nation annexes a region of its neighbour'); await page.waitForTimeout(600);
    check((await page.locator('text=/annex/i').count()) > 1, 'God understands annexation');
    await page.fill('textarea.god-input', ''); await page.waitForTimeout(200);
    await nav('People');
    check((await page.locator('.entity-row:has-text("Governor of")').count()) > 0 || (await page.locator('text=/Governor of/').count()) > 0, 'governors appear among the people');
    await nav('World');
    await nav('God');
    await page.fill('textarea.god-input', 'A small battery company discovers a battery that stores twenty times more energy.');
    await page.waitForTimeout(500);
    check((await page.locator('text=The world understands').count()) > 0, 'freeform God command interpreted');
    await page.click('text=Make it so'); await page.waitForTimeout(900);
    if (await page.locator('.cinematic').count()) { await shot('05-cinematic'); await page.click('.cinematic'); await page.waitForTimeout(300); }
    check((await page.locator('text=It is done.').count()) > 0, 'God intervention executed');
    await shot('06-god');
    // save + reload
    await nav('World');
    if (mobile) { await page.click('.bottom-nav button[aria-label="More"]'); await page.click('text=Save / load / export'); } else await page.click('button[aria-label="Save and load"]');
    await page.click('text=Overwrite autosave'); await page.waitForTimeout(600); await page.keyboard.press('Escape');
    await page.reload({ waitUntil: 'load' });
    if ((await page.locator('text=Open the page').count()) > 0) { lines.push('- ℹ️ host interstitial appeared again after reload'); await page.click('text=Open the page'); await page.waitForLoadState('load'); errors.length = 0; }
    await page.waitForSelector('.logo', { timeout: 30000 });
    check((await page.locator('button:has-text("Continue")').count()) > 0, 'autosave survives reload (IndexedDB)');
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
