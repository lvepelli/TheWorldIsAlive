# Mobile

## Test from a phone right now

1. Open **https://raw.githack.com/lvepelli/TheWorldIsAlive/gh-pages/index.html** in the phone browser (HTTPS, no server on your PC needed). Once GitHub Pages is enabled by the owner (Settings → Pages → Source: branch `gh-pages`), **https://lvepelli.github.io/TheWorldIsAlive/** is the nicer address and the one that supports full PWA install (service worker on a first-party origin).
2. Generate a world. Use the bottom navigation; tap countries/cities; pinch to zoom; drag to pan.
3. Install as an app: iOS Safari → Share → *Add to Home Screen*; Android Chrome → menu → *Add to Home screen* (or the install prompt). The installed app runs standalone (no browser chrome), keeps saves in IndexedDB, and works offline after the first load.
4. Share a specific world: `?seed=<seed>` in the URL (the 🔗 button in the desktop HUD copies it).

Deployment: `.github/workflows/deploy.yml` on every push publishes the path-relative build to the `gh-pages` branch (served by GitHub Pages when enabled, and mirrored by githack immediately). The workflow's `qa` job runs `tests/e2e/deployed.mjs` against the live URL on three phone viewports and desktop and commits screenshots and `docs/qa/REPORT.md`. Netlify/Vercel can host the same static `dist/` (see `netlify.toml`); when hosting at the domain root, build without `BASE_PATH`.

## Responsive architecture

- Breakpoint at **900 px**: below it the app uses a bottom navigation (World, Live, News, God, More), a compact HUD (date + speed buttons; world name hidden; save/audio moved into *More*), and the inspector becomes a **bottom sheet** (max 72% height, grabber to close). Above it: a 68 px side rail and a 400 px right inspector.
- Minimum tested width: 360 px. Landscape phones (height ≤ 520 px) get a compact layout: smaller bottom nav, ticker/onboarding hidden, single toast. All controls have ≥ 40 px tap targets (nav 60 px).
- Safe areas: `viewport-fit=cover` + `env(safe-area-inset-*)` on the bottom nav, HUD and modals.
- No hover requirements: hover only adds a country tooltip on desktop mice.
- Typography: 14 px base, 13 px body copy in cards; numbers in a mono stack.

## Touch interaction (map)

`WorldMap.tsx` uses Pointer Events with `touch-action: none` on the canvas:

- one finger: pan (with 6 px dead zone to distinguish taps)
- two fingers: pinch zoom around the pinch center + pan
- tap: select city (14 px radius) else country; on mobile the camera shifts so the selection stays visible above the sheet
- double tap: zoom in; wheel: zoom (desktop)
- camera eases toward `focus` requests (inspect → ◎ button, cinematics)

## Performance on phones

- Device pixel ratio capped at 2 for the map canvas.
- Static map raster rebuilt only on overlay change; city glow sprites cached.
- React re-render throttled during fast-forward; lists paginate ("Load more").
- Simulation runs ≈ 700 days/s on a laptop; fast-forward budgets 14 ms/frame so the UI stays responsive.

## PWA

- `public/manifest.webmanifest` (standalone display, icons SVG + PNG 192/512, theme color).
- `public/sw.js`: cache-first app shell with network refresh; registered only in production builds (`src/pwa.ts`).
- Installable on iOS (Add to Home Screen) and Android (install prompt). Works offline after the first load; saves live in IndexedDB on the device; export/import moves worlds between devices.

## Native packaging (Capacitor)

The app has no server dependency and uses only standard web APIs (Canvas 2D, Pointer Events, IndexedDB, WebAudio, localStorage, Blob download for export, `<input type=file>` for import). To wrap it:

```bash
npm i @capacitor/core @capacitor/cli && npx cap init "The World Is Alive" com.example.twia --web-dir dist
npm run build && npx cap add ios && npx cap add android && npx cap sync
```

Notes for native builds:
- Export uses an `<a download>` Blob link; on native, swap `exportSave()` for `@capacitor/filesystem` + Share.
- Audio starts only after a user gesture (already the case: toggling the audio button).
- Consider `@capacitor/status-bar` for the dark status bar and `@capacitor/haptics` for God Mode.
- Keep `viewport-fit=cover`; Capacitor's WebView honors safe-area insets.
