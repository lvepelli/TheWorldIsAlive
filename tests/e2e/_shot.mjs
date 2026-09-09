import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page = await ctx.newPage(); await page.goto('http://localhost:4179/?seed=showcase-42'); await page.waitForSelector('.map-canvas', { timeout: 20000 }); await page.waitForTimeout(3000);
await page.screenshot({ path: 'tests/e2e/output/review-welcome.png' }); await browser.close();
