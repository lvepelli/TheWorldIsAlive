# HANDOFF — continue THE WORLD IS ALIVE without this conversation

Read this first. Everything needed to continue lives in this repository; nothing depends on the original chat session.

## Status (v0.1.0)

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
| UI | `src/ui/*` | map renderer, 9 screens, inspector, graph, cinematics, toasts, intro, audio, debug |
| PWA | `public/manifest.webmanifest`, `public/sw.js`, `src/pwa.ts`, `public/icons` | |

## Incomplete / simplified (honest list)

- **Character conversations** are not implemented (prompt exists; no UI). Relationships between people (`Person.relationships`) are generated empty and only filled implicitly through shared events; the relationship graph uses shared events + affiliations instead.
- **Regions** (country → region → city) are collapsed to country → city. `Region` type exists but is unused.
- **Trade routes on the map** are shown only for the selected country; there is no trade-volume simulation beyond `tradePartners` relation effects.
- **Weather/migration animation** on the map is not implemented; events are shown as rings, wars as pulsing borders/arcs.
- **Country creation** splits by distance from the capital; borders of the new state can look arbitrary. Recomputes neighbors; relations copied at half strength.
- **LLM path is untested against a live endpoint** (no key available during development). `chat()` parsing supports OpenAI and Anthropic shapes.
- **Audio** is a small synthesized set; no ambient music assets.
- **Service worker** caches the shell only; hashed assets are cached on first fetch (cache-first). Bump `CACHE` in `sw.js` when you need to force refresh.
- **Save size** grows with events (cap 4000) — ~1–4 MB JSON. Fine for IndexedDB; consider compression for cloud sync.
- **No i18n**; all text is English and template-generated.

## Known bugs / rough edges

- Names are procedural; a few may look odd (`cityName`/`countryName` do basic cluster cleanup).
- Very small countries may have overlapping labels at low zoom (labels hide below ~6.5 px).
- When many severity-3 events occur in a single `advance()` jump, only the top 2–3 are toasted (by design) — the rest are in LIVE.
- The e2e test taps a grid of map points to find land; on unusual seeds it may need more attempts (it retries 12 times).
- `Person.relationships` array is never populated by the generator (see above).

## Architectural decisions you should not casually undo

- **Mutable World + version counter** (see ARCHITECTURE.md). Do not switch to immutable updates without measuring; the tick loop relies on in-place mutation.
- **All meaningful changes go through `createEvent`** with effects and causality. Do not mutate country stats directly from UI code.
- **Engine has no React/DOM imports** (except `persistence/storage.ts` for IndexedDB and `document.createElement` inside the *renderer*, which is UI). Keep it that way so tests and workers keep working.
- **Determinism**: only use the passed `RNG`; never `Math.random()` in the engine (`randomSeed()` in the store is UI-side and fine).
- **Save format version** is `SAVE_VERSION` in `types.ts`; when changing the data model, add defaults in `validateWorld()` and bump the version if incompatible.

## Files that are safe vs. delicate

- Safe to extend: `spawn.ts`, `consequences.ts`, `actions.ts`, `presets.ts`, screens, `global.css`.
- Delicate: `geography.ts` (region growth + island cleanup), `contours.ts` (edge tracing assumes 4-connectivity and the seam rule), `renderer.ts` (camera wrap math), `loop.ts` (render throttling and cinematic gating), `storage.ts` (validation).

## Technical debt

- `Inspector.tsx` is large (one file, seven views); split per entity kind when touching it seriously.
- Some inline styles in screens should migrate to CSS classes.
- Event `type` strings are free-form; a union type would catch typos in TRIGGERS.
- `RelationGraph` re-runs layout on every open (240 frames) — fine, but could cache positions.
- `prompts/*.md` and `prompts.ts` are duplicated by hand.

## Testing status

- `tests/engine.test.ts`: 11 tests — determinism, world richness, 365-day progression (< 20 s, actually ~0.6 s), first-5-days activity, run determinism, save round-trip, corrupted save rejection, every God preset, freeform interpretation + consequences, summaries.
- `tests/e2e/smoke.mjs`: desktop 1440×900 and mobile 390×844 (touch): intro → seed → map → advance month → tap select → all screens → event causal chain → freeform God command → preset (meteor, cinematic) → save → reload → continue → interventions persist → fast-forward. Screenshots in `tests/e2e/output/`.
- Not covered: LLM path, Safari/Firefox (Chromium only), real devices.

## Next recommended tasks (priority order)

1. **Character dialogue** ("Ask a question" in the person inspector) using `prompts/character_dialogue.md` with a local template fallback.
2. **Populate `Person.relationships`** at generation (family, mentors, rivals, funders) and let rules use them (e.g. rivals exploit scandals).
3. **Map layers toggle**: trade routes for all, migration flows (animated particles from source to destination for `migration.wave` events), disaster zones.
4. **More story arcs**: succession crises in monarchies, secession movements → `createCountry`, corporate espionage, space race milestones ("first human on Mars"), AI-risk arc.
5. **Regions** inside big countries (use `Region`), with regional unrest driving secession.
6. **Balance pass** over 20 simulated years: check GDP/inflation runaway, war frequency, death rates; add regression tests for bounds.
7. **Cloud saves**: implement `SaveStore` against a backend; add user identity.
8. **Localization** of templates (extract strings from `narrative.ts`/`actions.ts`).
9. **Accessibility**: focus management for sheets/modals, reduced-motion audit, ARIA for canvas selections (announce selection via live region).
10. **Capacitor packaging** (see MOBILE.md) + native file export.

## Build & deploy

- Static hosting: `npm run build` → upload `dist/` (all paths absolute from `/`; set `base` in `vite.config.ts` for sub-path hosting and adjust `sw.js` paths).
- Environment: `.env` (never committed); `.env.example` documents keys.
- Packaging: `npm run package` → `the-world-is-alive.zip` (sources + docs + tests, no node_modules/dist).
