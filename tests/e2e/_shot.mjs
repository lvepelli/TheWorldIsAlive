import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto('http://localhost:4173/?seed=showcase-42'); await page.waitForSelector('.map-canvas', { timeout: 20000 }); await page.waitForTimeout(2500);
await page.screenshot({ path: 'tests/e2e/output/review-landscape.png' }); await browser.close();
