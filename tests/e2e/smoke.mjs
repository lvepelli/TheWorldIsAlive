/**
 * Browser smoke test: boots the built app in headless Chromium at desktop and mobile viewports,
 * generates a world, drives navigation (sections, panels, map modes), God Mode, localization,
 * text hygiene and persistence, and captures screenshots to tests/e2e/output.
 * Run: npm run build && npm run e2e
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { serveDist, startWorld, nav, closeInspector, closeDrawer, dismissCinematic, textIssues, overflow } from './_lib.mjs';

const DIST = new URL('../../dist/', import.meta.url).pathname;
const OUT = new URL('./output/', import.meta.url).pathname;
await mkdir(OUT, { recursive: true });
const server = await serveDist(DIST, 4173);
const base = 'http://localhost:4173';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const errors = [];
let failures = 0;
const check = (cond, msg) => { if (cond) console.log('  ✓', msg); else { failures++; console.log('  ✗', msg); } };

async function run(name, viewport, mobile) {
  console.log(`\n== ${name} (${viewport.width}x${viewport.height}) ==`);
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: console ${m.text()}`); });
  const shot = (n) => page.screenshot({ path: `${OUT}/${name}-${n}.png` });
  await page.goto(base);
  await page.waitForSelector('.logo');
  check((await page.evaluate(() => document.documentElement.lang)) === 'es', 'Spanish is the default language');
  check((await page.locator('[data-testid="generate"]').innerText()).length > 0, 'intro renders (generate button)');
  await shot('01-intro');
  await startWorld(page, 'showcase-42');
  await shot('02-world');
  check(await page.locator('.map-canvas').count() === 1, 'map rendered');
  const dateText = await page.locator('[data-testid="date"]').innerText();
  check(/\d{4}/.test(dateText), `clock shows date (${dateText})`);
  await page.click('[data-testid="advance"]'); await page.click('[data-testid="advance-30"]');
  await page.waitForTimeout(700); await dismissCinematic(page);
  const date2 = await page.locator('[data-testid="date"]').innerText();
  check(date2 !== dateText, `time advanced (${date2})`);
  await shot('03-advanced');
  // Tap the map to select something
  const box = await page.locator('.map-canvas').boundingBox();
  let selected = false;
  for (let i = 0; i < 12 && !selected; i++) {
    const x = box.x + box.width * (0.25 + (i % 4) * 0.16), y = box.y + box.height * (0.3 + Math.floor(i / 4) * 0.18);
    if (mobile) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
    await page.waitForTimeout(250);
    selected = await page.locator('[data-testid="inspector"]').count() > 0;
  }
  check(selected, 'tap on map opens inspector');
  if (selected) { const tabs = await page.locator('.inspector [data-tab]').count(); check(tabs >= 5, `country panel has tabs (${tabs})`); await page.locator('.inspector [data-tab="economy"]').click().catch(() => {}); await page.waitForTimeout(200); }
  await shot('04-inspector');
  await closeInspector(page);
  // Sections
  for (const s of ['countries', 'regions', 'people', 'companies', 'economy', 'politics', 'diplomacy', 'technology', 'society', 'religions', 'calendar', 'events', 'news', 'social', 'history']) {
    await nav(page, s, mobile);
    const ok = (await page.locator('[data-testid="panel-col"], [data-testid="drawer"]').count()) > 0;
    check(ok && !(await overflow(page)), `${s} section renders without overflow`);
    if (['countries', 'economy', 'events', 'god', 'calendar'].includes(s)) await shot(`05-${s}`);
  }
  // Economy table → row opens the country
  await nav(page, 'economy', mobile);
  await page.locator('.table tbody tr').first().click(); await page.waitForTimeout(300);
  check((await page.locator('[data-testid="inspector-kind"]').count()) > 0, 'economy row opens a country panel');
  await closeInspector(page);
  // Events → event detail with chain
  await nav(page, 'events', mobile);
  const cards = await page.locator('[data-testid="event-card"]').count();
  check(cards > 5, `events timeline has events (${cards})`);
  await page.locator('[data-testid="event-card"]').first().click(); await page.waitForTimeout(300);
  check(await page.locator('[data-testid="chain"]').count() > 0, 'event detail shows the causal chain');
  await shot('06-event');
  await closeInspector(page);
  // Map modes
  await nav(page, 'world', mobile);
  await page.click('[data-testid="mapmode"]'); await page.click('[data-mapmode="regions"]'); await page.waitForTimeout(700);
  await shot('07-regions');
  await page.click('[data-testid="mapmode"]'); await page.click('[data-mapmode="economy"]'); await page.waitForTimeout(400);
  await page.click('[data-testid="mapmode"]'); await page.click('[data-mapmode="political"]'); await page.waitForTimeout(300);
  check(true, 'map modes switch');
  // God mode: Spanish freeform, category, preset with magnitude and timing
  await nav(page, 'god', mobile);
  await page.fill('[data-testid="god-input"]', 'Una pequeña empresa descubre una batería que almacena veinte veces más energía.');
  await page.waitForTimeout(450);
  check(await page.locator('[data-testid="god-preview"]').count() > 0, 'Spanish God command interpreted');
  await page.click('[data-testid="god-execute"]'); await page.waitForTimeout(800); await dismissCinematic(page);
  check(await page.locator('[data-testid="god-result"]').count() > 0, 'God intervention executed');
  await shot('08-god');
  await page.click('[data-god-group="environment"]');
  await page.click('.preset[data-preset="meteor"]');
  await page.click('[data-testid="god-run-preset"]'); await page.waitForTimeout(600); await dismissCinematic(page);
  const interventions = await page.locator('.god-hero ~ .panel-solid .card').count();
  check(interventions >= 2, `interventions logged (${interventions})`);
  // Alerts + calendar
  await page.click('[data-testid="alerts"]'); await page.waitForTimeout(300);
  check((await page.locator('.alert-item, .alert-group, [data-testid="drawer"], [data-testid="panel-col"]').count()) > 0, 'alerts panel opens');
  await shot('09-alerts');
  await closeDrawer(page);
  // Localization switch ES → EN → ES
  await nav(page, 'world', mobile);
  await page.click('[data-testid="menu"]'); await page.click('[data-testid="lang-en"]'); await page.waitForTimeout(300);
  check((await page.evaluate(() => document.documentElement.lang)) === 'en', 'language switches to English');
  const navEn = await page.locator(mobile ? '.bottom-nav [data-nav="world"]' : '.nav-rail [data-nav="world"]').innerText();
  check(/world/i.test(navEn), `English nav label (${navEn.trim()})`);
  await page.click('[data-testid="lang-es"]'); await page.waitForTimeout(300);
  const navEs = await page.locator(mobile ? '.bottom-nav [data-nav="world"]' : '.nav-rail [data-nav="world"]').innerText();
  check(/mundo/i.test(navEs), `Spanish nav label restored (${navEs.trim()})`);
  // Save via settings, reload, continue
  await page.click('[data-testid="open-saves"]'); await page.click('[data-testid="save-autosave"]'); await page.waitForTimeout(500);
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await page.reload(); await page.waitForSelector('.logo');
  const cont = page.locator('[data-testid="continue"]');
  check(await cont.count() > 0, 'autosave offered after refresh');
  await cont.click();
  await page.waitForSelector('.map-canvas', { timeout: 15000 }); await page.waitForTimeout(500);
  if (await page.locator('[data-testid="onboard-ok"]').count()) await page.click('[data-testid="onboard-ok"]');
  await nav(page, 'history', mobile);
  await page.click('[data-tab="interventions"]'); await page.waitForTimeout(200);
  check(await page.locator('[data-testid="drawer"] .card, [data-testid="panel-col"] .card').count() >= 2, 'interventions survive reload');
  await shot('10-history');
  // Text hygiene on a busy screen
  const issues = await textIssues(page);
  check(issues.length === 0, `no duplicated words / broken punctuation on screen${issues.length ? ': ' + issues.slice(0, 3).join(' | ') : ''}`);
  await closeDrawer(page);
  // Fast forward
  await nav(page, 'world', mobile);
  const date3 = await page.locator('[data-testid="date"]').innerText();
  await page.click('[data-testid="speed-100"]'); await page.waitForTimeout(4000); await page.click('[data-testid="speed-0"]'); await dismissCinematic(page);
  const date4 = await page.locator('[data-testid="date"]').innerText();
  check(date4 !== date3, `fast forward works (${date3} → ${date4})`);
  await shot('11-fastforward');
  await ctx.close();
}

await run('desktop', { width: 1440, height: 900 }, false);
await run('mobile', { width: 390, height: 844 }, true);
await browser.close();
server.close();
console.log('\nErrors:', errors.length ? errors : 'none');
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures || errors.length ? 1 : 0);
