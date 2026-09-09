/** Regenerates the README showcase screenshots in docs/screenshots. Usage: node tests/e2e/showcase.mjs (after npm run build). */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const OUT = new URL('../../docs/screenshots/', import.meta.url).pathname;
const srv = spawn('node', [new URL('./serve.mjs', import.meta.url).pathname, '4199'], { stdio: 'ignore' }); await new Promise((r) => setTimeout(r, 900));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const open = async (vp, mobile) => { const ctx = await browser.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 }); const page = await ctx.newPage(); await page.goto('http://localhost:4199'); await page.waitForSelector('.logo'); return { ctx, page }; };
const start = async (page, seed) => { await page.fill('input[aria-label="World seed"]', seed); await page.click('text=Use seed'); await page.waitForSelector('.map-canvas', { timeout: 20000 }); await page.waitForTimeout(3200); await page.click('.clock .speeds button:nth-child(1)'); if (await page.locator('text=Got it').count()) await page.click('text=Got it'); };
const dismiss = async (page) => { for (let i = 0; i < 4; i++) if (await page.locator('.cinematic').count()) { await page.click('.cinematic'); await page.waitForTimeout(200); } };
// Intro (desktop) with featured worlds
{ const { ctx, page } = await open({ width: 1440, height: 900 }, false); await page.click('.chip:has-text("The Fractured Map")'); await page.waitForTimeout(900); await page.screenshot({ path: `${OUT}intro-desktop.png` }); await ctx.close(); }
// World (desktop): fractured map premise → wars, fronts, all links
{ const { ctx, page } = await open({ width: 1440, height: 900 }, false); await start(page, 'amber-citadel-1'); await page.click('button:has-text("LINKS")'); await page.waitForTimeout(1500); await page.screenshot({ path: `${OUT}world-desktop.png` });
  await page.click('button[aria-label="Advance time"]:visible'); await page.click('.modal button:has-text("1 month")').catch(() => {}); await page.waitForTimeout(2500); await dismiss(page);
  await page.click('.side-nav button[aria-label="News"]'); await page.waitForTimeout(400); await page.click('.chip:has-text("Editorials")'); await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}news-desktop.png` });
  await page.click('.side-nav button[aria-label="Markets"]'); await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}markets-desktop.png` });
  await page.click('.side-nav button[aria-label="People"]'); await page.waitForTimeout(300); await page.locator('.entity-row').first().click(); await page.waitForTimeout(400);
  const ask = page.locator('.inspector input[placeholder^="Ask"]'); await ask.scrollIntoViewIfNeeded(); for (const q of ['What do you want?', 'You should make peace with your rivals']) { await ask.fill(q); await ask.press('Enter'); await page.waitForTimeout(300); }
  await page.locator('.inspector .card').first().scrollIntoViewIfNeeded(); await page.screenshot({ path: `${OUT}person-dialogue-desktop.png` }); await ctx.close(); }
// Mobile world + cinematic
{ const { ctx, page } = await open({ width: 390, height: 844 }, true); await start(page, 'amber-citadel-1'); await page.waitForTimeout(800); await page.screenshot({ path: `${OUT}world-mobile.png` });
  await page.locator('.bottom-nav button[aria-label="God"]').click(); await page.fill('textarea.god-input', 'A meteor strikes the largest city.'); await page.waitForTimeout(600); await page.click('text=✦ Make it so'); await page.waitForTimeout(700);
  if (await page.locator('.cinematic').count()) await page.screenshot({ path: `${OUT}god-cinematic-mobile.png` }); await ctx.close(); }
await browser.close(); srv.kill(); console.log('showcase written to', OUT);
