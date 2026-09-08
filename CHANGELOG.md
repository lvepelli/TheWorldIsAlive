# Changelog

## 0.3.0 — living details

- Map: decaying impact zones for disasters, epidemics (pandemics span wider), battles and crackdowns.
- Automation/AI arc: high-tech nations suffer automation shocks that raise unemployment and polarization, followed by machine-tax movements, universal dividends or sweeping AI regulation with market effects.
- Personal life: partnerships, engagements and births between characters (with relationship links and life-story entries).
- Breakthrough frequency tuned down; balance snapshot documented in HANDOFF.md.
- Shareable worlds: `?seed=` deep link and a 🔗 copy-link button in the HUD.
- Contour-tracing unit tests; README screenshots under `docs/screenshots`.

## 0.2.0 — depth pass

- People now have generated relationships (rivals, allies, mentors, family, funders, leader ties, cross-border friendships) shown in profiles and the network graph.
- Talk to any character: a local dialogue provider answers in the character's voice from personality, objective, memories, relationships and national mood (LLM prompt ready).
- New story arcs: space race milestones (up to "first human on Mars") with rival programs; secession movements → referendum → new country or crackdown; succession crises in monarchies/autocracies; corporate espionage → diplomatic tension.
- Map: animated migration flows, alliance/trade/war link mode toggle (auto / all / none), cinematic zoom-out reveal, smooth biome/elevation texture clipped to land.
- Live screen shows a generated "Today in the world" summary next to the latest monthly/yearly review.
- First-launch onboarding card; compact mobile HUD; save/audio moved into the mobile More sheet; modals portal to body.
- Market gravity (valuation ceilings relative to home GDP, price/sales anchor, growth mean reversion) and smarter event trimming keep 20-year runs sane; new long-run balance test.
- Intro shows a live preview of the continents the typed seed will generate.
- Relationship dynamics: scandals, coups, revolutions and elections shift ties (allies distance themselves, deposed leaders and usurpers become enemies, journalists who expose someone become enemies); public feuds between enemies are a new event; dialogue references betrayals.
- Tests: mocked OpenAI-compatible endpoint validates the LLM God interpreter, fallback, article enhancer budget and Anthropic-style parsing; robustness fuzz test runs six years of random freeform commands and presets and checks world invariants and save round-trip.

## 0.1.0 — first complete playable build

- Engine: seeded world generation (geography, countries, cities, people, companies, organizations, outlets, relations, markets); daily tick with weekly/monthly/yearly systems; 24 spontaneous event rules; 40+ consequence rules with causal links; character objectives; markets with event shocks; news with outlet bias; social feed with personalities, replies, virality and trending; deterministic summaries.
- God Mode: 34 presets in 7 groups; freeform command interpreter with entity resolution and composite intents; intervention log with downstream consequence counts.
- UI: living canvas map (smooth borders, terrain texture, glowing cities, alliance/war arcs, event rings, overlays, labels, wrap-around camera, pinch/zoom); World/Live/News/Social/Markets/People/Orgs/History/God screens; inspector for every entity with causal chain and relationship graph; cinematic overlays; toasts; intro + generation sequence; save/load/export/import; debug overlay; synthesized optional audio.
- Mobile: bottom navigation, bottom-sheet inspector, compact HUD, safe areas; PWA manifest, service worker, icons.
- AI: local narrative and God interpreters; optional OpenAI-compatible LLM enhancement and interpretation with fallback; prompt templates.
- Tests: 11 vitest engine tests (determinism, richness, progression, persistence, God presets, freeform interpretation, summaries); Playwright smoke test across desktop and mobile viewports (navigation, inspector, God Mode, persistence, fast-forward).
- Docs: README, ARCHITECTURE, GAME_DESIGN, WORLD_ENGINE, AI_SYSTEM, MOBILE, HANDOFF.
