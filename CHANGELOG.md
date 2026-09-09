# Changelog

## 0.5.0 — rivals, fronts and editorials

- Map: burning war fronts — borders shared by countries at war glow with a marching hot line and sparks when zoomed in.
- Companies: when a CEO dies, retires or moves on, the board appoints a successor (an existing executive or a newly generated one) with a `ceo.change` event and a small valuation shock.
- Relationship-driven consequences: rivals pounce on scandals, allies rally, rivals rise after a downfall, mentors endorse new leaders, and new leaders purge or face old rivals as opposition.
- Personal life: partners separate under the strain of scandals and feuds; funders pull their backing from soured entrepreneurs (hitting their companies).
- God Mode: Snap Election (forces a vote, even in autocracies), Spark Rivalry and Matchmaker presets; the interpreter understands "calls a snap election", "become bitter rivals" and "falls in love with"; two people can be named in one command.
- News: weekly editorials — a few outlets publish opinion pieces on the story of the week, each spun through its bias (marked "editorial").
- History → Sagas: names for scandal rivalries ("The Okoro affair", "Vidal against the world"), feuds, snap elections and purges.
- Balance: rival pile-ons capped, breakups reachable for less famous couples, senior allies can act as mentors.
- World premises: every seed opens on a starting situation (The Cold Peace, The Long Boom, The Age of Unrest, After the Plague, The Machine Dawn, The Fractured Map, The Gilded Age, The Quiet Century) applied at generation, shown on the intro under the seed preview and on the onboarding card.
- Premise arcs: each premise also schedules its own opening storyline (a border incident in the Cold Peace, a bubble warning and possible crash after the Long Boom, mass marches in the Age of Unrest, an outbreak scare After the Plague, an automation shock at the Machine Dawn, peace talks on the Fractured Map, a tycoon scandal in the Gilded Age, a resource find in the Quiet Century), all chained to a historic "premise.opening" event.
- Trade model: trade volume between partners is derived from the smaller economy, relations, adjacency, alliance and openness (`simulation/trade.ts`); it feeds growth potential (open economies grow faster, losing partners hurts), scales the trade arcs on the map, and the country inspector lists top partners with yearly volume.
- Map: Trade overlay colours nations by trade as a share of GDP.
- Accessibility: "larger text" and "high contrast" settings in the More sheet (persisted); the desktop side nav gains a ⚙ more button for settings, saves, share and install.
- Mobile: on list screens (Live, News, Social, …) toasts dock above the bottom nav instead of covering the screen header.
- History: 📜 Export chronicle — the world's story as Markdown (premise, year reviews, sagas, historic events, interventions, the world today), copied to the clipboard or shared via the Web Share sheet on phones.
- Fix: yearly reviews were almost always titled "A Quiet Year" because unclassified events counted toward "quiet"; years are now named by what actually dominated them.
- Live: "Developing stories" strip — causal chains still producing events, named like sagas, each card jumping to the latest event.
- Accessibility: modals trap focus, close on Escape and return focus to the opener; the inspector takes focus when it opens and gives it back when dismissed.
- Keyboard map: focus the map and use arrow keys to pan, + / − to zoom, Enter to select what is under the crosshair (or the nearest city), Home to reset.

## 0.4.0 — deployed & turning

- Deployment: GitHub Pages via `.github/workflows/deploy.yml` (gh-pages branch), base-path-aware build, post-deploy Playwright QA on three phone viewports + desktop committed to `docs/qa`. Live: https://lvepelli.github.io/TheWorldIsAlive/
- Map: day/night terminator sweeping the planet; tileable ocean/static raster with screen-space vignette; wrap-continuous terrain noise (no antimeridian seam); softer highland/snow texture; camera opens on the population-weighted center; seam hairline clipped from border strokes.
- Tooling: `tests/e2e/deployed.mjs` (QA any URL), `tests/e2e/serve.mjs` (static server), `netlify.toml`.
- Map: city lights brighten on the night side.
- Mobile: swipe down on the inspector header/grabber to dismiss.
- God Mode: "Inspire me" now names real countries, people and companies from the current world; "Surprise me" fires a random preset.
- Consequences: sanctions after coups, startups spawned by breakthroughs, reconstruction after disasters, asset grabs after bankruptcies, anti-lockdown protests during pandemics.
- Living characters: social reactions depend on family, partner, ally and enemy ties to the people involved.
- History → Sagas: causal chains grouped into named emergent stories ("The Yukouri war", "From garage to giant").
- News: consequence coverage references its cause ("weeks after…"); independent and international outlets mark stories as developing.
- Social: quote-reposts of viral posts by other public figures.
- God Mode: pick a country parameter by tapping it on the map (◎ next to country dropdowns).
- Characters: objectives evolve with success and standing (founders aim for IPOs, unpopular leaders fight to survive).
- PWA: in-app Install button (Android/desktop) and iOS Add-to-Home-Screen hint; compact landscape layout for phones.
- Saves: yearly compaction keeps files under ~8 MB after a decade; event cap 3000.
- Fix: secession could push a parent country's population below zero.
- News: journalist bylines (articles are written by characters who gain fame; profiles list bylines); more specific hashtags.
- Consequences: post-election honeymoon policies; disputed elections in corrupt states.
- Mobile: Share-this-world button (Web Share API) in the More sheet.
- Map: drifting cloud shadows. Countries show a motto and language. Yearly reviews are named by what dominated them ("The Year of Fire").
- Accessibility: live region announces the inspected entity.
- QA: pinch-zoom check; host-interstitial handling; content-type recorded.
- Emergent stories: tycoon arc (billionaires fund parties, then run for office); World Games every four years with a champion athlete; scandal survival depends on a character's allies and enemies.

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
