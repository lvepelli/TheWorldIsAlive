# THE WORLD IS ALIVE

A living, procedural civilization simulator that runs entirely in the browser.
Generate a world of nations, cities, leaders, companies, media outlets and citizens;
watch history emerge from their collisions; then intervene as a god and trace
what you caused.

- **Procedural**: every seed produces a different planet, borders, names, flags, economies and rivalries. The same seed reproduces the same starting world.
- **Simulated**: population, economy, politics, geopolitics, technology, society, environment and information systems influence each other every day.
- **Consequential**: every event can schedule follow-ups. Wars trigger refugee waves, market shocks, allied interventions and anti-war protests; breakthroughs reshuffle markets and geopolitics; scandals end careers.
- **Narrated**: a fictional media ecosystem covers events with different biases; a social feed reacts with characters that have personalities; markets move.
- **God Mode**: 30+ preset interventions plus a freeform command box ("A small battery company discovers a battery that stores twenty times more energy…").
- **Mobile-first**: bottom navigation, bottom-sheet inspector, pinch/zoom map, safe areas, installable PWA. Works offline once loaded.
- **Portable**: plain Vite + React + TypeScript. No backend, no API key required. Optional LLM hooks.

## Screenshots

| | |
| --- | --- |
| ![World map](docs/screenshots/world-desktop.png) | ![Newsroom](docs/screenshots/news-desktop.png) |
| ![Markets](docs/screenshots/markets-desktop.png) | ![Person dialogue](docs/screenshots/person-dialogue-desktop.png) |

Mobile: [world map](docs/screenshots/world-mobile.png) · [God Mode cinematic](docs/screenshots/god-cinematic-mobile.png) · [intro with seed preview](docs/screenshots/intro-desktop.png)

Share a world: append `?seed=your-seed` to the URL (the 🔗 button copies it).

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173  (also reachable on your LAN for phone testing)
```

Other commands:

```bash
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build
npm test           # engine unit tests (vitest)
npm run e2e        # headless browser smoke test on desktop + mobile viewports (requires `npm run build` first)
npm run package    # zip the whole project (without node_modules/dist) → the-world-is-alive.zip
node scripts/icons.mjs   # regenerate PNG icons from public/icons/icon.svg
```

Requirements: Node 20+ and npm. Playwright uses the system/bundled Chromium; set `CHROMIUM_PATH` if needed.

## How to play

1. **Generate** a world (or type a seed). Watch the initialization sequence and the reveal.
2. **Observe**: the map is the heart of the game. Tap a country or a glowing city to open the inspector. Switch map overlays (political, stability, wealth, tension, mood, tech).
3. **Advance time**: pause / 1× / 5× / 20× / fast-forward, or jump a day, week, month or year.
4. **Follow the world**: LIVE (event stream + daily summary), NEWS (outlets with bias), SOCIAL (posts, replies, trending), MARKETS (indexes, commodities, companies), PEOPLE, ORGS, HISTORY (timeline, your interventions, period summaries).
5. **Intervene**: GOD → describe what you want, or pick a preset. Then open the resulting event and read *Why did this happen?* to follow the causal chain as consequences unfold over the following days and months.
6. **Save**: autosaves every ~45 s of simulation and after interventions. Manual save/load, export to a `.json` file, import on any device.

Keyboard (desktop): `Space` pause/resume · `1–4` speeds · `G` God Mode · `W` world · `L` live · `Esc` close · `Shift+D` debug overlay.

## Project structure

```
index.html                  app shell (viewport, PWA meta)
public/                     manifest.webmanifest, sw.js (offline cache), icons/
src/
  main.tsx                  entry
  pwa.ts                    service-worker registration
  engine/                   pure TypeScript simulation, no React
    rng.ts                  seeded RNG + noise
    types.ts                data model (World, Country, Person, Company, Event …)
    names.ts                procedural naming (language families)
    time.ts, ids.ts
    generator/              geography.ts (continents, borders), world.ts (everything else)
    simulation/             tick.ts (orchestrator), systems.ts, characters.ts, markets.ts,
                            information.ts (news/social), summary.ts
    events/                 engine.ts (createEvent/effects), actions.ts (world mutations),
                            spawn.ts (spontaneous events), consequences.ts (reaction rules)
    godmode/                presets.ts, interpreter.ts (freeform → plan), execute.ts
    ai/                     narrative.ts (local provider), llm.ts (optional), prompts.ts, index.ts
    persistence/            storage.ts (IndexedDB / memory, export/import, validation)
  state/                    store.ts (zustand), loop.ts (time loop)
  ui/                       App.tsx, Intro.tsx, Overlays.tsx, audio.ts, format.ts
    map/                    contours.ts, renderer.ts (canvas), WorldMap.tsx (input)
    screens/                World, Live, News, Social, Markets, People, Orgs, History, God, SaveManager
    components/             Inspector, EventCard, EntityRow, Flag, Avatar, Sparkline, RelationGraph, Modal, Stat
    styles/global.css       design system
prompts/                    LLM prompt templates (mirrored in src/engine/ai/prompts.ts)
tests/                      engine.test.ts (vitest), e2e/smoke.mjs (playwright)
scripts/                    package.mjs, icons.mjs
docs → *.md at repo root    ARCHITECTURE, GAME_DESIGN, WORLD_ENGINE, AI_SYSTEM, MOBILE, HANDOFF, CHANGELOG
```

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — modules, state, rendering, data model, event flow, persistence
- [GAME_DESIGN.md](GAME_DESIGN.md) — player fantasy, loop, systems, God Mode, procedural generation
- [WORLD_ENGINE.md](WORLD_ENGINE.md) — simulation model, tick cadence, formulas, event and consequence rules
- [AI_SYSTEM.md](AI_SYSTEM.md) — local fallbacks, prompt locations, LLM integration, cost control
- [MOBILE.md](MOBILE.md) — responsive architecture, touch, PWA, Capacitor packaging
- [HANDOFF.md](HANDOFF.md) — **start here if you are continuing development**
- [CHANGELOG.md](CHANGELOG.md)

## Configuration

Copy `.env.example` to `.env`. Everything is optional. Setting `VITE_AI_ENDPOINT` enables LLM enhancement of top news stories and LLM interpretation of freeform God commands (with automatic local fallback).

## License

No license has been chosen yet by the project owner. All generated names, countries, people and events are fictional.
