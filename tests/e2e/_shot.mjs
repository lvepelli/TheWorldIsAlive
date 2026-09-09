import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:4181/?seed=showcase-42'); await page.waitForSelector('.map-canvas', { timeout: 20000 }); await page.waitForTimeout(3000);
if (await page.locator('text=Got it').count()) await page.click('text=Got it');
await page.screenshot({ path: 'tests/e2e/output/review-clouds.png' }); await browser.close();
