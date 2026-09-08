# Architecture

## Overview

```
┌──────────────────────────────────────────────────────────────────┐
│ UI (React)                                                        │
│  screens/  components/  map/ (Canvas 2D renderer)  Overlays       │
│        ▲ subscribe(version)            │ actions                  │
│  state/store.ts (zustand) ◄────────────┘   state/loop.ts (rAF)    │
│        │ holds a mutable World + RNG                              │
├────────┼─────────────────────────────────────────────────────────┤
│ Engine (pure TS, no DOM except persistence)                       │
│  generator → World                                                │
│  simulation/tick.ts ─► resolvePending ─► spawn ─► weekly/monthly  │
│        ─► react (schedule consequences) ─► markets ─► news/social │
│  godmode: interpreter (text→plan) → execute (plan→events)         │
│  persistence: SaveStore (IndexedDB | memory) + JSON export        │
└──────────────────────────────────────────────────────────────────┘
```

Design principles:

1. **Engine is UI-agnostic and synchronous.** `src/engine` never imports React or the store. Everything is a function of `(world, rng)`. This makes it testable in Node (vitest) and portable to a worker or a server later.
2. **The World is a mutable object.** Deep-cloning a world with thousands of entities per tick would be too expensive. Instead, the store keeps one `World` instance and bumps `version` after each batch of ticks; components subscribe to `version` and recompute derived data with `useMemo`.
3. **Determinism.** All randomness flows through `RNG` (sfc32) seeded from the world seed. The RNG state is stored in the save file, so a loaded world continues the same sequence. Player interventions consume RNG too, so histories diverge after intervention — by design.
4. **Events are the unit of change.** Any meaningful mutation goes through `createEvent()` with structured `effects`, `actors`, `causedBy` and `tags`. The consequence engine and the information layer only read events.

## Data model (`src/engine/types.ts`)

- `World` — root: meta (seed/name/version), `day`, entity maps (`countries`, `cities`, `people`, `companies`, `organizations`, `outlets`), `events[]`, `news[]`, `social[]`, `pending[]` (scheduled consequences), `indexes`, `commodities`, `interventions[]`, `summaries[]`, `trending[]`, `geography`, `stats`, `rngState`, `counters` (id sequences).
- `Geography` — a `width × height` grid (240×120). `cells[i]` is the index of the country in `countryOrder` (−1 = water); `elevation` and `moisture` per cell.
- `Country`, `City`, `Person`, `Company`, `Organization`, `MediaOutlet` — see the file; every entity has an `id` with a kind prefix (`c_`, `city_`, `p_`, `co_`, `org_`, `m_`, `ev_`, `n_`, `s_`, `god_`).
- `WorldEvent` — `category`, `type` (rule id such as `war.declared`), `severity 1–5`, `location {countryId, cityId, x, y}`, `actors`, `causedBy` (`'simulation' | 'player' | eventId`), `consequences[]`, `relatedEvents[]`, `affectedEntities[]`, `effects[]` (`EffectDelta`), `tags`, `historic`, `playerIntervention`, `data` (rule-specific payload, e.g. market `shocks`).
- `EffectDelta` — `{ target: EntityRef, field, delta }`; a field ending in `%` is multiplicative. Bounds are enforced in `applyEffect()`.

## Event flow

1. `tickDay(world, rng)` increments `day`.
2. `resolvePending` runs consequence rules whose `dueDay` has arrived (`events/consequences.ts` → `CONSEQUENCE_RULES`).
3. `spawnDailyEvents` samples spontaneous events from weighted `SPAWN_RULES` (`events/spawn.ts`). Weights depend on world state (unrest → protests, hostility → clashes, tech → breakthroughs…).
4. Weekly / monthly / yearly systems run (`simulation/systems.ts`, `simulation/characters.ts`).
5. `react()` walks every event created today against `TRIGGERS` and schedules follow-ups into `world.pending`.
6. `tickMarkets()` applies fundamentals + `collectShocks(events)`.
7. `generateNews()` and `generateSocial()` derive coverage and reactions from today's events; `updateTrending()` aggregates hashtags.

All world mutations that mean something (wars, coups, bankruptcies, disasters…) live in `events/actions.ts` and are shared between simulation rules and God Mode, so both produce identical, fully-linked events.

## State management (`src/state`)

- `store.ts` — zustand store: `phase`, `world`, `rng`, `version`, `speed`, `screen`, `selection` (+ back stack), `cinematic` queue, `toasts`, `overlay`, `focus` (camera request), `settings` (localStorage), `saves`. Actions: `newWorld`, `advance`, `select`, `runGodPlan/runGodText`, `saveWorld/loadWorld/exportSave/importSave`.
- `loop.ts` — a single `requestAnimationFrame` loop. Speeds map to ms-per-day (1×=1.4 s, 5×, 20×); fast-forward runs as many ticks as fit in ~14 ms per frame. React re-render is throttled (≈8 Hz at fast-forward). Severity ≥ 5 events become cinematics (rate-limited), ≥ 3 become toasts. Autosave every 45 s of activity.

## Rendering (`src/ui/map`)

- `contours.ts` converts the cell grid into smooth vector polygons per country (boundary-edge tracing → collinear simplification → Chaikin smoothing ×2). Computed once per world (and whenever a country is created).
- `renderer.ts` (`MapRenderer`) keeps a **static raster** (ocean gradient, graticule, coast glow, country fills tinted per overlay, biome/elevation texture clipped to land, vignette) rebuilt only when the overlay changes. Each frame draws: static ×(1–3 wrap copies), vector borders (war pulse / selection / hover), alliance and war arcs, city glow sprites (cached per size), event rings (last 20 days), labels (LOD by zoom). Camera wraps horizontally.
- `WorldMap.tsx` handles pointer events (pan, pinch, wheel, tap/double-tap), eases the camera toward `focus` requests, and hit-tests cities then countries.

Performance budget: ~300 cities, ~32 polygons, ≤80 event rings → comfortably 60 fps on desktop; the static raster is the expensive part (~30–60 ms) and only rebuilds on overlay change.

## UI structure

- `App.tsx` — layout (side nav ≥900 px, bottom nav below), screen switch, inspector, toasts, cinematic, debug overlay, error boundary, keyboard shortcuts.
- `components/Inspector.tsx` — one view per entity kind, with **Why did this happen?** causal chain for events, relationship graph tabs (`RelationGraph.tsx`, a tiny force layout on canvas), and God shortcuts.
- Styling is a single `styles/global.css` with tokens (`--sev-*`, `--cat-*`, panels, buttons, inputs, mobile/desktop breakpoints at 900 px).

## Persistence (`src/engine/persistence/storage.ts`)

`SaveStore` interface (`list/save/load/remove`) with `IndexedDBStore` (idb-keyval) and `MemoryStore` fallback. Saves are the JSON-serialized `World` (~1–4 MB after a few years). `validateWorld()` fills defaults for missing collections and rejects structurally broken files (used for import). Replacing local storage with a backend means implementing `SaveStore` once.

## Extending

- New event: add a `SpawnRule` in `spawn.ts` (or an action in `actions.ts`), optional `TRIGGERS` + `CONSEQUENCE_RULES` in `consequences.ts`, hashtag hints in `ai/narrative.ts`, a cinematic kicker in `ui/Overlays.tsx` if severity 5.
- New God preset: add to `GOD_PRESETS`; add an intent regex to `interpreter.ts` for freeform support.
- New entity field: add to `types.ts`, generation in `generator/world.ts`, defaults in `validateWorld()`, drift in `systems.ts`, display in `Inspector.tsx`.
