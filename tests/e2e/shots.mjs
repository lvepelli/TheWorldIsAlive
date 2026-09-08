/** Captures settled screenshots of key views for visual review. Usage: node tests/e2e/shots.mjs */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
const DIST = new URL('../../dist/', import.meta.url).pathname; const OUT = new URL('./output/', import.meta.url).pathname; await mkdir(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const server = createServer(async (req, res) => { let p = join(DIST, decodeURIComponent(req.url.split('?')[0])); try { const s = await stat(p); if (s.isDirectory()) p = join(p, 'index.html'); } catch { p = join(DIST, 'index.html'); } try { const d = await readFile(p); res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream' }); res.end(d); } catch { res.writeHead(404); res.end(); } });
await new Promise((r) => server.listen(4175, r));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
async function shot(name, viewport, mobile, fn) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  const page = await ctx.newPage(); await page.goto('http://localhost:4175'); await page.waitForSelector('.logo');
  await fn(page, name); await ctx.close();
}
const seedAndPlay = async (page) => { await page.fill('input[aria-label="World seed"]', 'showcase-42'); await page.click('text=Use seed'); await page.waitForSelector('.map-canvas', { timeout: 20000 }); await page.waitForTimeout(2500); await page.click('.clock .speeds button:nth-child(1)'); };
await shot('review-intro-desktop', { width: 1440, height: 900 }, false, async (page, n) => { await page.fill('input[aria-label="World seed"]', 'amber-tide-1234'); await page.waitForTimeout(1500); await page.screenshot({ path: `${OUT}/${n}.png` }); });
await shot('review-intro-mobile', { width: 390, height: 844 }, true, async (page, n) => { await page.waitForTimeout(1500); await page.screenshot({ path: `${OUT}/${n}.png` }); });
await shot('review-world-mobile', { width: 390, height: 844 }, true, async (page, n) => { await seedAndPlay(page); await page.click('text=Got it'); await page.waitForTimeout(300); await page.screenshot({ path: `${OUT}/${n}.png` }); });
await shot('review-person-desktop', { width: 1440, height: 900 }, false, async (page, n) => { await seedAndPlay(page); await page.click('.side-nav button[aria-label="People"]'); await page.waitForTimeout(300); await page.locator('.entity-row').first().click(); await page.waitForTimeout(400); await page.locator('.chip:has-text("What do you want?")').click(); await page.locator('.chip:has-text("Who do you trust?")').click(); await page.waitForTimeout(300); await page.screenshot({ path: `${OUT}/${n}.png` }); });
await shot('review-event-mobile', { width: 390, height: 844 }, true, async (page, n) => { await seedAndPlay(page); await page.click('text=Got it'); await page.click('.bottom-nav button[aria-label="Live"]'); await page.waitForTimeout(300); await page.locator('.event-card').first().click(); await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}/${n}.png` }); });
await browser.close(); server.close(); console.log('done');
