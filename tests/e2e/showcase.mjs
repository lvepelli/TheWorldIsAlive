/** Regenerates the README showcase screenshots in docs/screenshots. Usage: node tests/e2e/showcase.mjs (after npm run build). */
import { chromium } from 'playwright';
import { serveDist, startWorld, nav, dismissCinematic } from './_lib.mjs';
const OUT = new URL('../../docs/screenshots/', import.meta.url).pathname;
const server = await serveDist(new URL('../../dist/', import.meta.url).pathname, 4199);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const open = async (vp, mobile) => { const ctx = await browser.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 }); const page = await ctx.newPage(); await page.goto('http://localhost:4199'); await page.waitForSelector('.logo'); return { ctx, page }; };
// Intro (desktop) with featured worlds
{ const { ctx, page } = await open({ width: 1440, height: 900 }, false); await page.locator('.chips .chip').nth(1).click(); await page.waitForTimeout(900); await page.screenshot({ path: `${OUT}intro-desktop.png` }); await ctx.close(); }
// World (desktop): fractured map premise → wars, diplomacy mode, economy table, country panel, God Mode
{ const { ctx, page } = await open({ width: 1440, height: 900 }, false); await startWorld(page, 'amber-citadel-1');
  await page.click('[data-testid="advance"]'); await page.click('[data-testid="advance-30"]'); await page.waitForTimeout(2000); await dismissCinematic(page);
  await page.click('[data-testid="mapmode"]'); await page.click('[data-mapmode="diplomacy"]'); await page.waitForTimeout(1200); await page.screenshot({ path: `${OUT}world-desktop.png` });
  await page.click('[data-testid="mapmode"]'); await page.click('[data-mapmode="political"]'); await page.waitForTimeout(300);
  await nav(page, 'economy', false); await page.waitForTimeout(400); await page.locator('.table tbody tr').first().click(); await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}economy-desktop.png` });
  await page.click('[data-testid="inspector-close"]');
  await nav(page, 'news', false); await page.waitForTimeout(400); await page.locator('.chips .chip').nth(1).click(); await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}news-desktop.png` });
  await nav(page, 'people', false); await page.waitForTimeout(300); await page.locator('.entity-row').first().click(); await page.waitForTimeout(400);
  const ask = page.locator('[data-testid="ask"]'); await ask.scrollIntoViewIfNeeded(); for (const q of ['¿Qué quieres?', 'Deberías hacer las paces con tus rivales']) { await ask.fill(q); await ask.press('Enter'); await page.waitForTimeout(300); }
  await page.locator('[data-testid="answer"]').first().scrollIntoViewIfNeeded(); await page.screenshot({ path: `${OUT}person-dialogue-desktop.png` });
  await page.click('[data-testid="inspector-close"]');
  await nav(page, 'god', false); await page.click('[data-god-group="war"]'); await page.click('.preset[data-preset="start-war"]'); await page.waitForTimeout(300); await page.screenshot({ path: `${OUT}god-desktop.png` });
  await ctx.close(); }
// Mobile world + events + cinematic
{ const { ctx, page } = await open({ width: 390, height: 844 }, true); await startWorld(page, 'amber-citadel-1'); await page.waitForTimeout(800); await page.screenshot({ path: `${OUT}world-mobile.png` });
  await nav(page, 'events', true); await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}events-mobile.png` });
  await nav(page, 'god', true); await page.fill('[data-testid="god-input"]', 'Un meteorito golpea la ciudad más grande.'); await page.waitForTimeout(600); await page.click('[data-testid="god-execute"]'); await page.waitForTimeout(700);
  if (await page.locator('.cinematic').count()) await page.screenshot({ path: `${OUT}god-cinematic-mobile.png` }); await ctx.close(); }
await browser.close(); server.close(); console.log('showcase written to', OUT);
