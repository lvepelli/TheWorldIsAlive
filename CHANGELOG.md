# Changelog

## 0.1.0 — first complete playable build

- Engine: seeded world generation (geography, countries, cities, people, companies, organizations, outlets, relations, markets); daily tick with weekly/monthly/yearly systems; 24 spontaneous event rules; 40+ consequence rules with causal links; character objectives; markets with event shocks; news with outlet bias; social feed with personalities, replies, virality and trending; deterministic summaries.
- God Mode: 34 presets in 7 groups; freeform command interpreter with entity resolution and composite intents; intervention log with downstream consequence counts.
- UI: living canvas map (smooth borders, terrain texture, glowing cities, alliance/war arcs, event rings, overlays, labels, wrap-around camera, pinch/zoom); World/Live/News/Social/Markets/People/Orgs/History/God screens; inspector for every entity with causal chain and relationship graph; cinematic overlays; toasts; intro + generation sequence; save/load/export/import; debug overlay; synthesized optional audio.
- Mobile: bottom navigation, bottom-sheet inspector, compact HUD, safe areas; PWA manifest, service worker, icons.
- AI: local narrative and God interpreters; optional OpenAI-compatible LLM enhancement and interpretation with fallback; prompt templates.
- Tests: 11 vitest engine tests (determinism, richness, progression, persistence, God presets, freeform interpretation, summaries); Playwright smoke test across desktop and mobile viewports (navigation, inspector, God Mode, persistence, fast-forward).
- Docs: README, ARCHITECTURE, GAME_DESIGN, WORLD_ENGINE, AI_SYSTEM, MOBILE, HANDOFF.
