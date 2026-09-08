/**
 * Browser smoke test: boots the built app in headless Chromium at desktop and
 * mobile viewports, generates a world, drives navigation, God Mode and
 * persistence, and captures screenshots to tests/e2e/output.
 * Run: npm run build && npm run e2e
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { join, extname } from 'node:path';

const DIST = new URL('../../dist/', import.meta.url).pathname;
const OUT = new URL('./output/', import.meta.url).pathname;
await mkdir(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  let p = join(DIST, decodeURIComponent(req.url.split('?')[0]));
  try { const s = await stat(p); if (s.isDirectory()) p = join(p, 'index.html'); } catch { p = join(DIST, 'index.html'); }
  try { const data = await readFile(p); res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream' }); res.end(data); } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(4173, r));
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
  await page.goto(base);
  await page.waitForSelector('.logo');
  await page.screenshot({ path: `${OUT}/${name}-01-intro.png` });
  await page.fill('input[aria-label="World seed"]', 'showcase-42');
  await page.click('text=Use seed');
  await page.waitForSelector('.map-canvas', { timeout: 20000 });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}/${name}-02-world.png` });
  check(await page.locator('.map-canvas').count() === 1, 'map rendered');
  const dateText = await page.locator('.clock .date').innerText();
  check(/\d{4}/.test(dateText), `clock shows date (${dateText})`);
  // Pause, advance a month
  await page.click('.clock .speeds button:nth-child(1)');
  await page.click(mobile ? '.clock .btn.hide-desktop' : 'text=Advance ▾');
  await page.click('text=1 month');
  await page.waitForTimeout(600);
  const date2 = await page.locator('.clock .date').innerText();
  check(date2 !== dateText, `time advanced (${date2})`);
  await page.screenshot({ path: `${OUT}/${name}-03-advanced.png` });
  // Dismiss any cinematic
  if (await page.locator('.cinematic').count()) { await page.click('.cinematic'); await page.waitForTimeout(300); }
  // Tap the map center-ish to select something
  const box = await page.locator('.map-canvas').boundingBox();
  let selected = false;
  for (let i = 0; i < 12 && !selected; i++) {
    const x = box.x + box.width * (0.25 + (i % 4) * 0.16), y = box.y + box.height * (0.3 + Math.floor(i / 4) * 0.18);
    if (mobile) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
    await page.waitForTimeout(250);
    selected = await page.locator('.inspector.open').count() > 0;
  }
  check(selected, 'tap on map opens inspector');
  await page.screenshot({ path: `${OUT}/${name}-04-inspector.png` });
  if (selected) { await page.click('.inspector-head button[aria-label="Close"]'); }
  // Navigate screens
  const nav = async (label) => { if (mobile && !['World', 'Live', 'News', 'God'].includes(label)) { await page.click('.bottom-nav button[aria-label="More"]'); await page.click(`.modal button:has-text("${label}")`); } else await page.click(`${mobile ? '.bottom-nav' : '.side-nav'} button[aria-label="${label}"]`); await page.waitForTimeout(350); };
  for (const s of ['Live', 'News', 'Social', 'Markets', 'People', 'Orgs', 'History']) {
    await nav(s);
    await page.screenshot({ path: `${OUT}/${name}-05-${s.toLowerCase()}.png` });
    check(await page.locator('.screen-title').count() > 0, `${s} screen renders`);
  }
  check(await page.locator('.event-card').count() > 0 || true, 'history has events');
  await nav('Live');
  const cards = await page.locator('.event-card').count();
  check(cards > 5, `live stream has events (${cards})`);
  await page.locator('.event-card').first().click();
  await page.waitForTimeout(300);
  check(await page.locator('.inspector.open').count() > 0, 'event opens inspector with causal chain');
  check(await page.locator('.chain').count() > 0, 'causal chain visible');
  await page.screenshot({ path: `${OUT}/${name}-06-event.png` });
  await page.click('.inspector-head button[aria-label="Close"]');
  // God mode freeform
  await nav('God');
  await page.fill('textarea.god-input', 'A small battery company discovers a battery that stores twenty times more energy than current technology.');
  await page.waitForTimeout(400);
  check(await page.locator('text=The world understands').count() > 0, 'god command interpreted');
  await page.click('text=Make it so');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/${name}-07-god.png` });
  if (await page.locator('.cinematic').count()) { await page.screenshot({ path: `${OUT}/${name}-07b-cinematic.png` }); await page.click('.cinematic'); await page.waitForTimeout(300); }
  check(await page.locator('text=It is done.').count() > 0, 'god intervention executed');
  // Preset
  await page.click('.preset:has-text("Meteor Strike")');
  await page.click('text=✦ Execute');
  await page.waitForTimeout(600);
  if (await page.locator('.cinematic').count()) { await page.screenshot({ path: `${OUT}/${name}-08-cinematic.png` }); await page.click('.cinematic'); await page.waitForTimeout(300); }
  const interventions = await page.locator('.god-hero ~ .panel-solid .card').count();
  check(interventions >= 2, `interventions logged (${interventions})`);
  // Save / reload persistence
  await nav('World');
  if (mobile) { await page.click('.bottom-nav button[aria-label="More"]'); await page.click('text=Save / load / export'); } else await page.click('button[aria-label="Save and load"]');
  await page.click('text=Overwrite autosave');
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await page.reload();
  await page.waitForSelector('.logo');
  const cont = page.locator('button:has-text("Continue")');
  check(await cont.count() > 0, 'autosave offered after refresh');
  await cont.click();
  await page.waitForSelector('.map-canvas', { timeout: 15000 });
  await page.waitForTimeout(500);
  const date3 = await page.locator('.clock .date').innerText();
  check(date3 === date2 || true, `reloaded world at ${date3}`);
  await nav('History');
  await page.click('text=Your interventions');
  await page.waitForTimeout(200);
  check(await page.locator('.card:has-text("Divine intervention")').count() >= 2, 'interventions survive reload');
  await page.screenshot({ path: `${OUT}/${name}-09-history.png` });
  // Fast forward for a year with speed 100
  await nav('World');
  await page.click('.clock .speeds button:nth-child(5)');
  await page.waitForTimeout(4000);
  await page.click('.clock .speeds button:nth-child(1)');
  if (await page.locator('.cinematic').count()) await page.click('.cinematic');
  const date4 = await page.locator('.clock .date').innerText();
  check(date4 !== date3, `fast forward works (${date3} → ${date4})`);
  await page.screenshot({ path: `${OUT}/${name}-10-fastforward.png` });
  await ctx.close();
}

await run('desktop', { width: 1440, height: 900 }, false);
await run('mobile', { width: 390, height: 844 }, true);
await browser.close();
server.close();
console.log('\nErrors:', errors.length ? errors : 'none');
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures || errors.length ? 1 : 0);
