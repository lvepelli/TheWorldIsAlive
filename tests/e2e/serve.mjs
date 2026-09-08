/** Minimal static server for dist/ (SPA fallback). Usage: node tests/e2e/serve.mjs [port] */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
const DIST = new URL('../../dist/', import.meta.url).pathname; const PORT = Number(process.argv[2] || 4173);
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.json': 'application/json' };
createServer((req, res) => { let f = join(DIST, decodeURIComponent(req.url.split('?')[0])); if (!existsSync(f) || statSync(f).isDirectory()) f = join(DIST, 'index.html'); res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f)); }).listen(PORT, () => console.log(`serving dist on http://localhost:${PORT}`));
