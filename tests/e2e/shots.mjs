/** Captures settled screenshots of key views for visual review. Usage: node tests/e2e/shots.mjs (after npm run build). */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { serveDist, startWorld, nav, dismissCinematic } from './_lib.mjs';
const OUT = new URL('./output/', import.meta.url).pathname; await mkdir(OUT, { recursive: true });
const server = await serveDist(new URL('../../dist/', import.meta.url).pathname, 4175);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
async function shot(name, viewport, mobile, fn) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  const page = await ctx.newPage(); await page.goto('http://localhost:4175'); await page.waitForSelector('.logo');
  await fn(page, name); await ctx.close();
}
const snap = (page, n) => page.screenshot({ path: `${OUT}/${n}.png` });
await shot('review-intro-desktop', { width: 1440, height: 900 }, false, async (page, n) => { await page.fill('[data-testid="seed"]', 'amber-tide-1234'); await page.waitForTimeout(1500); await snap(page, n); });
await shot('review-intro-mobile', { width: 390, height: 844 }, true, async (page, n) => { await page.waitForTimeout(1500); await snap(page, n); });
await shot('review-world-mobile', { width: 390, height: 844 }, true, async (page, n) => { await startWorld(page, 'showcase-42'); await snap(page, n); });
await shot('review-country-desktop', { width: 1440, height: 900 }, false, async (page, n) => { await startWorld(page, 'showcase-42'); await nav(page, 'countries', false); await page.locator('.entity-row').first().click(); await page.waitForTimeout(400); await snap(page, n); await page.click('.inspector [data-tab="regions"]'); await page.waitForTimeout(300); await snap(page, `${n}-regions`); });
await shot('review-person-desktop', { width: 1440, height: 900 }, false, async (page, n) => { await startWorld(page, 'showcase-42'); await nav(page, 'people', false); await page.locator('.entity-row').first().click(); await page.waitForTimeout(400); await page.locator('.inspector .chips .chip').first().click(); await page.waitForTimeout(300); await snap(page, n); });
await shot('review-event-mobile', { width: 390, height: 844 }, true, async (page, n) => { await startWorld(page, 'showcase-42'); await nav(page, 'events', true); await page.locator('[data-testid="event-card"]').first().click(); await page.waitForTimeout(500); await snap(page, n); });
await shot('review-god-mobile', { width: 390, height: 844 }, true, async (page, n) => { await startWorld(page, 'showcase-42'); await nav(page, 'god', true); await page.click('[data-god-group="politics"]'); await page.click('.preset[data-preset="coup"]'); await page.waitForTimeout(300); await snap(page, n); });
await shot('review-calendar-desktop', { width: 1440, height: 900 }, false, async (page, n) => { await startWorld(page, 'showcase-42'); await nav(page, 'calendar', false); await page.waitForTimeout(300); await snap(page, n); });
await shot('review-diplomacy-desktop', { width: 1440, height: 900 }, false, async (page, n) => { await startWorld(page, 'showcase-42'); await nav(page, 'diplomacy', false); await page.waitForTimeout(300); await snap(page, n); });
await shot('review-zones-desktop', { width: 1440, height: 900 }, false, async (page, n) => { await startWorld(page, 'showcase-42'); await nav(page, 'god', false);
  for (const p of ['meteor', 'pandemic', 'migration']) { await page.click(`.preset[data-preset="${p}"]`); await page.click('[data-testid="god-run-preset"]'); await page.waitForTimeout(500); await dismissCinematic(page); }
  await nav(page, 'world', false); await page.waitForTimeout(2500); await snap(page, n); });
await browser.close(); server.close(); console.log('done');
