/** Shared helpers for the E2E scripts: static server, world start, navigation and text-quality checks. */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
export async function serveDist(dist, port) {
  const server = createServer(async (req, res) => {
    let p = join(dist, decodeURIComponent(req.url.split('?')[0]));
    try { const s = await stat(p); if (s.isDirectory()) p = join(p, 'index.html'); } catch { p = join(dist, 'index.html'); }
    try { const data = await readFile(p); res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream' }); res.end(data); } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => server.listen(port, r));
  return server;
}

/** Intro → seeded world → paused, onboarding dismissed. */
export async function startWorld(page, seed, { pause = true } = {}) {
  await page.waitForSelector('[data-testid="seed"]', { timeout: 30000 });
  await page.fill('[data-testid="seed"]', seed);
  await page.click('[data-testid="use-seed"]');
  await page.waitForSelector('.map-canvas', { timeout: 30000 });
  await page.waitForTimeout(2200);
  if (pause) await page.click('[data-testid="speed-0"]');
  if (await page.locator('[data-testid="onboard-ok"]').count()) await page.click('[data-testid="onboard-ok"]');
  await dismissCinematic(page);
}
export async function dismissCinematic(page) { for (let i = 0; i < 4; i++) { if (!(await page.locator('.cinematic').count())) break; await page.click('.cinematic'); await page.waitForTimeout(200); } }

const MOBILE_PRIMARY = ['world', 'events', 'news', 'god'];
/** Open a section by nav id (world, countries, economy, god…) on either layout. */
export async function nav(page, id, mobile) {
  await dismissCinematic(page);
  if (mobile) {
    if (MOBILE_PRIMARY.includes(id)) await page.click(`.bottom-nav [data-nav="${id}"]`);
    else { await page.click('.bottom-nav [data-nav="more"]'); await page.click(`.modal [data-nav="${id}"]`); }
  } else await page.click(`.nav-rail [data-nav="${id}"]`);
  await page.waitForTimeout(350);
}
export async function closeInspector(page) { if (await page.locator('[data-testid="inspector-close"]').count()) { await page.click('[data-testid="inspector-close"]'); await page.waitForTimeout(150); } }
export async function closeDrawer(page) { if (await page.locator('[data-testid="drawer-close"]').count()) { await page.click('[data-testid="drawer-close"]'); await page.waitForTimeout(150); } }

/** Scan visible text for duplicated consecutive words, double articles and broken punctuation. Returns offending snippets. */
export async function textIssues(page) {
  return page.evaluate(() => {
    const text = document.body.innerText || '';
    const out = [];
    const lines = text.split(/\n+/);
    for (const line of lines) {
      const l = line.trim(); if (l.length < 4) continue;
      const rep = l.match(/\b([A-Za-zÁÉÍÓÚáéíóúñÑ]{3,})\s+\1\b/);
      if (rep && !/^\d/.test(rep[1])) out.push(`repeat: "${rep[0]}" in "${l.slice(0, 80)}"`);
      const art = l.match(/\b(el el|la la|los los|las las|un un|una una|the the|a a|an an|de de|of of)\b/i);
      if (art) out.push(`article: "${art[0]}" in "${l.slice(0, 80)}"`);
      const punct = l.match(/\s[,.;:](?=\s)|[^.]\.\.(?!\.)|\?\?|!!|\(\s*\)|,\./);
      if (punct) out.push(`punct: "${punct[0]}" in "${l.slice(0, 80)}"`);
    }
    return out.slice(0, 12);
  });
}
export async function overflow(page) { return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1); }
