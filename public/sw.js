/* THE WORLD IS ALIVE — minimal offline-first service worker (app shell cache). */
const CACHE = 'twia-shell-v6';
// Scope-relative so the same worker serves from / or from a sub-path (GitHub Pages).
const BASE = new URL('./', self.location.href).pathname;
const SHELL = [BASE, BASE + 'index.html', BASE + 'manifest.webmanifest', BASE + 'icons/icon.svg'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin + BASE)) return;
  e.respondWith(
    caches.match(req).then((hit) => {
      const fetching = fetch(req).then((res) => { if (res && res.status === 200) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; }).catch(() => hit);
      return hit || fetching;
    }),
  );
});
