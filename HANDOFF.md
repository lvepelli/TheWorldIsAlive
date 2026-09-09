# HANDOFF — continue THE WORLD IS ALIVE without this conversation

Read this first. Everything needed to continue lives in this repository; nothing depends on the original chat session.

## Status (v0.4.0)

**Playable, complete first version.** Builds, passes unit + browser smoke tests, works on desktop and 360–430 px phones, installs as a PWA, saves to IndexedDB, exports/imports JSON.

```bash
npm install && npm run dev      # play
npm test                        # engine tests (vitest, ~3 s)
npm run build && npm run e2e    # production build + headless desktop/mobile smoke run with screenshots in tests/e2e/output
```

## Completed systems

| Area | Where | Notes |
| --- | --- | --- |
| Seeded RNG, noise | `src/engine/rng.ts` | sfc32 + gradient noise; state saved with the world |
| Geography & countries | `engine/generator/geography.ts` | 240×120 grid, ~32 countries, mountains shape borders |
| World generation | `engine/generator/world.ts` | names (7 language families), flags, cities, people, companies, orgs, outlets, relations, wars, markets |
| Simulation | `engine/simulation/*` | daily tick; weekly economy/population; monthly politics/tech/characters; yearly climate |
| Events & consequences | `engine/events/*` | actions (shared mutations), spawn rules, trigger→rule scheduling, causal links |
| Markets | `engine/simulation/markets.ts` | companies, national/global indexes, 8 commodities, event shocks |
| News / social / trending | `engine/simulation/information.ts`, `engine/ai/narrative.ts` | bias-aware templates; profession/trait-aware posts, replies, virality |
| Summaries | `engine/simulation/summary.ts` | day/month/year |
| God Mode | `engine/godmode/*` | presets, freeform interpreter, executor, intervention log |
| Persistence | `engine/persistence/storage.ts` | IndexedDB via idb-keyval, memory fallback, validation, export/import |
| Optional LLM | `engine/ai/llm.ts`, `prompts/` | enhancer + interpreter with fallback; disabled unless `VITE_AI_ENDPOINT` set |
| Dialogue | `engine/ai/dialogue.ts` | local template provider; UI in person inspector ("Talk to them") |
| Bylines / quote-reposts | `simulation/information.ts` | articles carry `authorId` (journalist characters gain fame); viral posts get quoted |
| Pick on map | `state/store.ts` `godPick`, `map/WorldMap.tsx`, `screens/GodScreen.tsx` | tapping a nation fills a God preset parameter |
| PWA install | `ui/install.ts`, `components/InstallButton.tsx` | Android prompt capture, iOS hint |
| Story arcs | `events/spawn.ts` (space, espionage, secession, automation, feuds), `events/consequences.ts` (referendum, succession crisis, space race, sanctions, startups, reconstruction, asset grabs, lockdown protests) | History → Sagas tab groups chains (`collectChain`, `sagaTitle` in `HistoryScreen.tsx`) |
| UI | `src/ui/*` | map renderer, 9 screens, inspector, graph, cinematics, toasts, intro, audio, debug |
| PWA | `public/manifest.webmanifest`, `public/sw.js`, `src/pwa.ts`, `public/icons` | |

## Incomplete / simplified (honest list)

- **Character conversations** use a template-based local provider (`engine/ai/dialogue.ts`); an LLM version is not wired yet (prompt exists). Relationships are generated and updated by scandals, leadership changes and feuds (`simulation/relations.ts`); more event types could use `shiftRelationships`/`relate`.
- **Regions** (country → region → city) are collapsed to country → city. `Region` type exists but is unused.
- **Trade routes on the map** are shown only for the selected country; there is no trade-volume simulation beyond `tradePartners` relation effects.
- **Weather** is not simulated; disasters/epidemics/battles show as decaying zones, migrations as particle flows, wars as pulsing borders/arcs.
- **Country creation** splits by distance from the capital; borders of the new state can look arbitrary. Recomputes neighbors; relations copied at half strength.
- **LLM path is tested only against a mocked endpoint** (`tests/llm.test.ts`); no live provider was available during development. `chat()` parsing supports OpenAI and Anthropic shapes.
- **Audio** is a small synthesized set; no ambient music assets.
- **Service worker** caches the shell only; hashed assets are cached on first fetch (cache-first). Bump `CACHE` in `sw.js` when you need to force refresh.
- **Save size**: ~1 MB at start, ~7–8 MB after ten simulated years (events cap 3000, yearly `compact()` in `simulation/tick.ts` strips stale detail). Fine for IndexedDB; the autosave serializes on the main thread every 45 s of activity — move it to a worker or compress if phones show jank. Dead people still keep full profiles (~2 KB each).
- **No i18n**; all text is English and template-generated.

## Known bugs / rough edges

- Names are procedural; a few may look odd (`cityName`/`countryName` do basic cluster cleanup).
- Very small countries may have overlapping labels at low zoom (labels hide below ~6.5 px).
- When many severity-3 events occur in a single `advance()` jump, only the top 2–3 are toasted (by design) — the rest are in LIVE.
- The e2e test taps a grid of map points to find land; on unusual seeds it may need more attempts (it retries 12 times).

## Architectural decisions you should not casually undo

- **Mutable World + version counter** (see ARCHITECTURE.md). Do not switch to immutable updates without measuring; the tick loop relies on in-place mutation.
- **All meaningful changes go through `createEvent`** with effects and causality. Do not mutate country stats directly from UI code.
- **Engine has no React/DOM imports** (except `persistence/storage.ts` for IndexedDB and `document.createElement` inside the *renderer*, which is UI). Keep it that way so tests and workers keep working.
- **Determinism**: only use the passed `RNG`; never `Math.random()` in the engine (`randomSeed()` in the store is UI-side and fine).
- **Save format version** is `SAVE_VERSION` in `types.ts`; when changing the data model, add defaults in `validateWorld()` and bump the version if incompatible.

## Files that are safe vs. delicate

- Safe to extend: `spawn.ts`, `consequences.ts`, `actions.ts`, `presets.ts`, screens, `global.css`.
- Delicate: `geography.ts` (region growth + island cleanup; noise is blended with a one-world-width-shifted sample so terrain wraps seamlessly — keep that if you change the noise), `contours.ts` (edge tracing assumes 4-connectivity and the seam rule), `renderer.ts` (camera wrap math), `loop.ts` (render throttling and cinematic gating), `storage.ts` (validation).

## Technical debt

- `Inspector.tsx` is large (one file, seven views); split per entity kind when touching it seriously.
- CI runs are serialized by the `pages` concurrency group; each push cancels queued (not running) runs, so a burst of pushes means only the last one gets QA'd. Fine for solo work; switch to per-SHA groups if several people push.
- Some inline styles in screens should migrate to CSS classes.
- Event `type` strings are free-form; a union type would catch typos in TRIGGERS.
- `RelationGraph` re-runs layout on every open (240 frames) — fine, but could cache positions.
- `prompts/*.md` and `prompts.ts` are duplicated by hand.

## Testing status

- `tests/robustness.test.ts`: six simulated years with ~240 random freeform commands and presets, invariants checked yearly (capitals, living leaders, city ownership, symmetric wars/alliances, finite numbers, geography consistency), save round-trip after chaos; junk-input interpreter test.
- `tests/llm.test.ts`: mocked endpoint tests for God interpretation, fallback, enhancer budget, Anthropic-style parsing.
- `tests/contours.test.ts`: polygon coverage vs. cell area for every country; single-cell island edge case.
- `tests/engine.test.ts`: 12 tests — determinism, world richness, 365-day progression (~0.6 s), first-5-days activity, run determinism, save round-trip, corrupted save rejection, every God preset, freeform interpretation + consequences, summaries, 20-year balance (population, GDP, inflation, debt, wars, living people, index bounds, event cap, dialogue).
- `tests/e2e/smoke.mjs`: desktop 1440×900 and mobile 390×844 (touch): intro → seed → map → advance month → tap select → all screens → event causal chain → freeform God command → preset (meteor, cinematic) → save → reload → continue → interventions persist → fast-forward. Screenshots in `tests/e2e/output/`.
- Not covered: LLM path, Safari/Firefox (Chromium only), real devices.

## Next recommended tasks (priority order)

1. **Wire `LLMDialogueProvider`** (prompt exists) behind the same `DialogueProvider` interface; add a per-character memory of conversations.
2. **More relationship-driven rules**: rivals exploit downfalls, allies rally to a leader under attack, mentors endorse successors; marriages/partners as personal events.
3. **Weather fronts / climate visualization** on the map and a trade-volume simulation feeding the trade arcs.
4. **Religious schisms**, corporate succession fights, and sports/cultural championships as recurring calendar events.
5. **Regions** inside big countries (use `Region`), with regional unrest driving secession.
6. **Balance pass** over 20 simulated years: check GDP/inflation runaway, war frequency, death rates; add regression tests for bounds.
7. **Cloud saves**: implement `SaveStore` against a backend; add user identity.
8. **Localization** of templates (extract strings from `narrative.ts`/`actions.ts`).
9. **Accessibility**: focus management for sheets/modals, reduced-motion audit, ARIA for canvas selections (announce selection via live region).
10. **Capacitor packaging** (see MOBILE.md) + native file export.

## Balance snapshot (seed `diag`, 15 years)

Per year: ~900 events, 1–7 wars declared, 0–2 coups, 1–6 revolutions, 0–10 elections, ~50–70 breakthroughs (after tuning), 8–20 severity-5 and 60–100 severity-4 events, 35–90 protests, 7–16 disasters; average unrest 8–15, stability 55–62; pending consequences hover around 70–95. Use the throwaway diagnostic pattern from git history (`tests/_diag.test.ts`) if you retune: count with `world.stats.eventsGenerated` and `e.day`, not array slices (the event cap trims the array).

## Deployment & testing status

- **Live URL (mirror, active now):** https://raw.githack.com/lvepelli/TheWorldIsAlive/gh-pages/index.html — raw.githack.com serving the `gh-pages` branch. It shows a one-time "One more step → Open the page" prompt before the app (QA clicks through it). jsDelivr and statically.io were tried and both serve HTML as text/plain. CI records the commit-pinned mirror URL in `docs/qa/LIVE_URL.txt`. Service workers may not register on the CDN origin (the app still works; just no offline/PWA there).
- **GitHub Pages URL:** https://lvepelli.github.io/TheWorldIsAlive/ — **blocked on one owner click** (Settings → Pages → Source: Deploy from a branch → `gh-pages` / root). `has_pages` was false on 2026-09-09; the Actions `GITHUB_TOKEN` gets "Resource not accessible by integration" when trying to create the Pages site. Once enabled, CI automatically prefers this URL for QA.
- **Pipeline:** `.github/workflows/deploy.yml` — on push: `npm ci` → `npm test` → `npm run build` (relative base) → `peaceiris/actions-gh-pages` pushes `dist/` to `gh-pages` → `qa` job resolves the live URL (Pages if it serves `build-id.txt` for this SHA, else the githack mirror), runs `tests/e2e/deployed.mjs` against the live URL (360×800, 390×844, 430×932 portrait + 1440×900) and commits `docs/qa/*.png` + `docs/qa/REPORT.md` with `[skip ci]`.
- **Manual redeploy:** Actions → *Deploy & QA* → *Run workflow*.
- **Base path:** `vite.config.ts` uses `base: './'` (override with `BASE_PATH`); `index.html`, `manifest.webmanifest` and `sw.js` use relative/scope-relative paths so the same build works at `/`, under a sub-path, or on a CDN. `src/pwa.ts` registers `${BASE_URL}sw.js`.
- **Netlify:** a site `the-world-is-alive` exists on the connected Netlify account (id `e8531fa1-f3f5-4308-b3e0-505741cc3410`) with `netlify.toml` in the repo, but the development sandbox could not reach Netlify hosts, so it has no deploy yet. Connecting the GitHub repo in the Netlify UI (build `npm run build`, publish `dist`) would give a second URL at the domain root.
- **Vercel:** requires the connector to be authorized; not used.
- **Stable checkpoints:** v0.3.0 = commit `915980f` (tag `v0.3.0` exists locally; the remote refused tag pushes from this environment — create it with `git tag v0.3.0 915980f && git push origin v0.3.0` from a machine with tag permission). Deployment pipeline = `c6819eb`.

## Build & deploy

- Static hosting: `npm run build` → upload `dist/` (all paths absolute from `/`; set `base` in `vite.config.ts` for sub-path hosting and adjust `sw.js` paths).
- Environment: `.env` (never committed); `.env.example` documents keys.
- Sharing: `/?seed=<seed>` generates that world on load (guarded by `sessionStorage` so a reload does not regenerate). The seed itself is displayed in History and the debug overlay.
- Packaging: `npm run package` → `the-world-is-alive.zip` (sources + docs + tests, no node_modules/dist).
