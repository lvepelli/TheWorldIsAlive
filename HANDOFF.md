# HANDOFF — continue THE WORLD IS ALIVE without this conversation

Read this first. Everything needed to continue lives in this repository; nothing depends on the original chat session.

## Status (v0.6.0)

**Playable, complete first version.** Builds, passes unit + browser smoke tests, works on desktop and 360–430 px phones, installs as a PWA, saves to IndexedDB, exports/imports JSON.

```bash
npm install && npm run dev      # play
npm test                        # engine tests (vitest, 33 tests, ~35 s incl. the 20-year balance run and the 6-year fuzz)
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

- **Character conversations** use a template-based local provider (`engine/ai/dialogue.ts`); an LLM version is not wired yet (prompt exists). Relationships are generated and updated by scandals, leadership changes, feuds, breakups and funding withdrawals (`simulation/relations.ts`), and they drive consequences (`consequences.ts`: rival pounce, ally rally, rival ascends, mentor endorsement, purge/opposition). Weekly editorials live in `information.ts` (`generateEditorials`). Starting situations ("premises") are in `generator/premise.ts`; add one by appending to `PREMISES` (deterministic from the seed, so existing seeds change if the list order changes).
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
- Objectives are behaviour: `characters.ts` matches `person.objective` text against regexes (peace/election/reform/resign for leaders, field words for CEOs via `pivotForObjective`, research fields via `fieldFromObjective`). Any code that sets an objective string is therefore steering the simulation; keep the phrases human-readable and check those regexes when adding new ones.
- Anything that mutates the world outside a tick (dialogue persuasion, presets executed from the UI) must call `useGame.getState().bump()` afterwards or screens keep showing stale memoized data until the next day.
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

1. **Enable GitHub Pages** (owner, one click) so the clean URL and first-party PWA install work; CI then prefers it automatically.
2. **Dialogue depth**: `LLMDialogueProvider`, conversation memories, next-day "Interview" posts and persuasion ("you should …" can change an open character's objective) exist in `ai/dialogue.ts`; leaders act on peace/election/reform/resignation objectives and CEOs pivot companies toward persuaded fields (`characters.ts`, `pivotForObjective`); journalist profile pieces quote interviews and researchers chase persuaded fields (`fieldFromObjective`). Next: multi-turn negotiations (a leader asking something back) and interview transcripts in the chronicle export.
3. **More relationship-driven rules**: rival pounce / ally rally / mentor endorsement / purge (`consequences.ts`), breakups and funder withdrawals (`spawn.ts`) exist; next: family feuds over inheritance, mentors turning on protégés, and characters remembering who helped them (use `memories`).
4. **Weather depth**: storm cells (`simulation/weather.ts`) already steer hurricanes and floods and follow seasons; next: droughts from long dry spells, crop yields and food prices tied to weather, and a forecast line in the daily summary.
5. **More calendar events** (film festivals, summits with agendas). Anniversaries of major events exist (`simulation/anniversaries.ts`, one commemoration a day at most). The World Games (4-yearly) and Laurel Prizes (yearly) live in `systems.ts` `yearlyTick`. Passed-over executives already become rivals of the new CEO (`characters.ts`). Religious revival/decline and schisms now live in `spawn.ts` (`religion.tide`, `religion.schism`); a state-religion / theocracy consequence would extend them.
6. **Regions** inside big countries (use `Region`), with regional unrest driving secession.
7. **Balance pass** over 20 simulated years: check GDP/inflation runaway, war frequency, death rates; add regression tests for bounds.
8. **Cloud saves**: implement `SaveStore` against a backend; add user identity.
9. **Localization** of templates (extract strings from `narrative.ts`/`actions.ts`).
10. **Accessibility**: modal focus trap + inspector focus hand-off are done; keyboard map navigation, larger-text and high-contrast settings all exist; remaining: audit colour-only information (severity colours) for a text equivalent everywhere.
11. **Capacitor packaging** (see MOBILE.md) + native file export.

## Balance snapshot (seed `diag`, 15 years)

*Update (v0.5.0):* after 10 years, unrest is below 20 in ~22 of 32 countries and polarization below 40 in ~24 (both mean-revert weekly in `systems.ts`); ~58 movements are alive with a support histogram of roughly 31/9/5/10/3 across 20-point buckets; ~48 elections per decade, 0–3 won by movement leaders; objective-driven leader actions are rare without player conversations (a handful of reform packages per decade). Global GDP ≈ 155–175 T after 20 years, market index 5–12 k, top company $4–8 T.

Per year: ~900 events, 1–7 wars declared, 0–2 coups, 1–6 revolutions, 0–10 elections, ~50–70 breakthroughs (after tuning), 8–20 severity-5 and 60–100 severity-4 events, 35–90 protests, 7–16 disasters; average unrest 8–15, stability 55–62; pending consequences hover around 70–95. Use the throwaway diagnostic pattern from git history (`tests/_diag.test.ts`) if you retune: count with `world.stats.eventsGenerated` and `e.day`, not array slices (the event cap trims the array).

## Deployment & testing status

**Verified 2026-09-09 (CI runs 18–33, re-verified on every push since; latest report in `docs/qa/REPORT.md`):** the production build served over HTTPS from the githack mirror passed the full QA on 360×800, 390×844, 430×932 (portrait, touch) and 1440×900: intro → world generation → painted map → simulation progressing → tap-to-inspect → drag → pinch → Live/News/Social/Markets/History without horizontal overflow → causal chain → freeform God command → autosave surviving reload → manifest + service worker served. The only noise was a blocked resource belonging to githack's own interstitial page (now excluded from the verdict).

- **Live URL (mirror, active now):** https://raw.githack.com/lvepelli/TheWorldIsAlive/gh-pages/index.html — raw.githack.com serving the `gh-pages` branch. It shows a "One more step → Open the page" prompt once per browser session before the app (QA clicks through it; it did not reappear after reload). jsDelivr and statically.io were tried and both serve HTML as text/plain. CI records the commit-pinned mirror URL in `docs/qa/LIVE_URL.txt`. Service workers may not register on the CDN origin (the app still works; just no offline/PWA there).
- **GitHub Pages URL:** https://lvepelli.github.io/TheWorldIsAlive/ — **blocked on one owner click** (Settings → Pages → Source: Deploy from a branch → `gh-pages` / root). `has_pages` was false on 2026-09-09; the Actions `GITHUB_TOKEN` gets "Resource not accessible by integration" when trying to create the Pages site. Once enabled, CI automatically prefers this URL for QA.
- **Pipeline:** `.github/workflows/deploy.yml` — on push: `npm ci` → `npm test` → `npm run build` (relative base) → `peaceiris/actions-gh-pages` pushes `dist/` to `gh-pages` → `qa` job resolves the live URL (Pages if it serves `build-id.txt` for this SHA, else the githack mirror), runs `tests/e2e/deployed.mjs` against the live URL (360×800, 390×844, 430×932 portrait + 1440×900) and commits `docs/qa/*.png` + `docs/qa/REPORT.md` with `[skip ci]`.
- **Manual redeploy:** Actions → *Deploy & QA* → *Run workflow*.
- **Base path:** `vite.config.ts` uses `base: './'` (override with `BASE_PATH`); `index.html`, `manifest.webmanifest` and `sw.js` use relative/scope-relative paths so the same build works at `/`, under a sub-path, or on a CDN. `src/pwa.ts` registers `${BASE_URL}sw.js`.
- **Netlify:** a site `the-world-is-alive` exists on the connected Netlify account (id `e8531fa1-f3f5-4308-b3e0-505741cc3410`) with `netlify.toml` in the repo, but the development sandbox could not reach Netlify hosts, so it has no deploy yet. Connecting the GitHub repo in the Netlify UI (build `npm run build`, publish `dist`) would give a second URL at the domain root.
- **Vercel:** requires the connector to be authorized; not used.
- **Stable checkpoints:** v0.6.0 = commit `63aec24` (weather, premises, movements, LLM dialogue); latest verified head = the commit named in `docs/qa/REPORT.md` (CI re-verifies every push); v0.5.0 = `5fff102`; v0.3.0 = commit `915980f` (tag `v0.3.0` exists locally; the remote refused tag pushes from this environment — create it with `git tag v0.3.0 915980f && git push origin v0.3.0` from a machine with tag permission). Deployment pipeline = `c6819eb`.

## Build & deploy

- Static hosting: `npm run build` → upload `dist/` (all paths absolute from `/`; set `base` in `vite.config.ts` for sub-path hosting and adjust `sw.js` paths).
- Environment: `.env` (never committed); `.env.example` documents keys.
- Sharing: `/?seed=<seed>` generates that world on load (guarded by `sessionStorage` so a reload does not regenerate). The seed itself is displayed in History and the debug overlay.
- Packaging: `npm run package` → `the-world-is-alive.zip` (sources + docs + tests, no node_modules/dist).
