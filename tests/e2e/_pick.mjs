import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto('http://localhost:4173/?seed=showcase-42'); await page.waitForSelector('.map-canvas', { timeout: 20000 }); await page.waitForTimeout(2500);
await page.click('.clock .speeds button:nth-child(1)'); if (await page.locator('text=Got it').count()) await page.click('text=Got it');
await page.click('.bottom-nav button[aria-label="God"]'); await page.click('.preset:has-text("Start War")'); await page.waitForTimeout(200);
await page.locator('button[aria-label="Pick on the map"]').first().click(); await page.waitForTimeout(500);
console.log('banner:', await page.locator('text=Tap a nation on the map').count());
const box = await page.locator('.map-canvas').boundingBox();
let done = false;
for (let i = 0; i < 24 && !done; i++) { const x = box.x + box.width * (0.12 + (i % 6) * 0.15), y = box.y + box.height * (0.28 + Math.floor(i / 6) * 0.12); await page.touchscreen.tap(x, y); await page.waitForTimeout(300); done = (await page.locator('.god-hero').count()) > 0; }
const val = await page.locator('.panel-solid select').first().inputValue();
console.log('returned to god:', done, 'aggressor param:', val);
await page.screenshot({ path: 'tests/e2e/output/review-pick.png' }); await browser.close();
