# Changelog

## 0.9.1 — regions you can touch

- Accessibility: the relationship graph carries a hidden text alternative (nodes, ties and their strength).
- Accessibility: the map canvas describes itself to screen readers (nations, wars, restless regions, events on record, current selection) and updates as the world changes.
- God Mode: region fields in the Create Country, Grant Autonomy, Annex Region and Regional Referendum forms autocomplete with the regions of the chosen country.
- Tests: `tests/prompts.test.ts` checks that every prompt in `prompts.ts` has a markdown twin with the same placeholders.
- Secession referendums driven by independence movements now split off the region the movement grew in (named in its title, or its leader's home region) instead of a distance-from-capital wedge; the old split remains the fallback.
- Tests: the 20-year balance run also asserts the world does not slide into misery (mean unrest < 35, debt < 200 %, freedom > 40, happiness > 40).
- Balance (long run): freedom now drifts back toward what each form of government sustains (democracy 78 … junta 16, nudged by happiness, minus 8 at war), so crackdowns and security laws fade unless renewed; public debt consolidates above 90 % of GDP instead of spiralling for decades; automation shocks are capped at eight a year world-wide; autonomy demands and crackdowns push national unrest a little less and concessions calm it a little more. Twenty years on `diag` now end with mean unrest 18 (was 31), happiness 55 (was 38), freedom 57 (was 38), inflation 4.8 % (was 8.5), growth 2.1 % (was 0.2) and debt 128 % (was 254 %).
- Calendar: a yearly climate conference every December, hosted where the seas bite hardest (recent coastal losses weigh in), attended by the biggest economies; it is a summit on climate finance, so the existing accord / collapse machinery decides whether a climate fund follows.
- Fix: a schism of a schism no longer produces "New New …" names; the splinter takes a prefix the parent does not already carry.
- Calendar: every living faith with real support has a holy season — once a year its country's capital fills with pilgrims (happiness up, unrest down, a small retail bump); in polarised countries the last night can turn into clashes.
- Elections have campaigns: from September of the year before a vote, a campaign story opens with an early poll for the incumbent, a named challenger (a surging movement's leader, or the most influential politician) and a promise; the challenger gains fame and a résumé line.
- LLM: the God-command prompt now lists regions (id, country, unrest) so an LLM interpreter can target them for independence, autonomy, annexation and referendums.
- God Mode: "Hold a referendum in <Region>" and a Regional Referendum preset (45 presets) put any region to a vote; the result lands weeks later like a natural one.
- Referendums: a free state (freedom above 60) answers an autonomy demand with a referendum about a third of the time (once per region per three years). Turnout and the yes-share follow identity, unrest and existing autonomy; a yes brings sweeping devolution (or, when the region is furious and the state fragile, an honoured vote for independence), a no calms the region and costs the governor who campaigned for it. Sagas: "The X referendum".
- Summaries: monthly and yearly reviews name the most restless regions (unrest above 55) and their countries.
- People: a "Governors" filter chip lists every sitting governor (search already matched titles).
- CI: the live QA also checks that a tap on the Regions overlay opens a region inspector.
- Map: region names are tappable once drawn, and on the Regions overlay any tap on land opens that region (hover on desktop names it).
- Regions are entities: tapping a region in a country's list (or its name in a city view) opens a Region inspector — population, prosperity, unrest, identity, autonomy, the governor, its cities, its story and the events that happened there — with a focus button that switches to the Regions overlay.
- Procedural variety: region names take flavour from the country's language family (Fjords, Krai, Wadi, Escarpment, Shire, Prefecture, Costa …) on top of the generic Province / Highlands / Coast set.
- Mobile: tapping an overlay chip shows a one-line hint above the bar for a few seconds (what the colours mean); chips also carry the hint as a tooltip.
- Map: the desktop legend explains the active overlay in a few words (what the colours mean, that dotted seams are regions).
- Map: region names appear as small italic labels once you zoom in (and from a lighter zoom on the Regions overlay), amber where the region is angry; the capital's own region is not labelled on the political map since it reads as the country.
- History: the Markdown chronicle export gains a "Borders" section (foundings, annexations, devolutions, ✦ for your doing); a "Borders" tab lists every founding, annexation and devolution in order, with a one-line tally of how the map has changed; tap an entry to open the event.
- Dialogue: ask anyone "How is your region?" (new starter chip) — governors describe the region they run, its mood, its autonomy and the last thing that happened to it; regionalists state their cause; others say where they are from.
- Narrative: a decisive war's ending notes that negotiators are still arguing over the loser's border regions when an annexation is on the table.
- Balance: automation shocks hit a given country at most once a year (they used to recur every few weeks in high-tech states), and a universal basic dividend is introduced once per country instead of again and again. Ten years on `diag`: 158 shocks (was ~345) and 37 dividends (was 121).
- Policies: a restless region (unrest > 45) pushes two regional policies onto the leader's agenda — a regional development fund (city prosperity up, regional unrest down, debt up) and, in freer states, a devolution act (autonomy up, unrest down) — each named after the region in the policy story. About 9 funds and 7 devolution acts per decade on `diag`.
- Inspector: a "Show on map" button next to a country's regions switches to the Regions overlay and focuses the country.
- Tests: the 20-year balance run now asserts the map does not fragment (≤ 45 nations) and that every city's region belongs to its country.

## 0.9.0 — regions and borders

- Regions: every country with three or more cities is split into 2–4 regions (seeded, seam-aware k-means over its cities; `generator/regions.ts`), each with an identity, an autonomy level and its own unrest that drifts with the country's mood, the prosperity gap to the rest of the country and the odd slight from the capital (`simulation/regions.ts`). Distinct, aggrieved regions demand autonomy; the capital concedes (devolution, autonomy up) or cracks down (freedom down, unrest up), and a crackdown can end in secession along the region's own borders — the new state takes exactly the region's cities and the cells nearest to them, so borders stop looking arbitrary. Ten years on the `diag` seed: ~45 autonomy demands, 20 concessions, 16 crackdowns, 3 new states. Country inspector lists regions (unrest, identity, autonomy, last chapter); city inspector names the region; sagas are named ("The X question", "The X crackdown", "The birth of X"). Old saves get regions on load.
- God Mode: regions are targets — "Gresh Province declares independence" splits exactly that region off, "Grant Kien Valley autonomy" (or the Grant Autonomy preset, 43 presets) devolves power; region names typed into the Create Country / Grant Autonomy forms are matched by name.
- Fix: the featured-worlds chip row on the intro is `safe center`-aligned, so with nine premises the first chip is no longer clipped off the left edge and unreachable on desktop.
- Premise: "The Patchwork Empire" — the largest nation becomes a monarchy/federation/autocracy holding restless, distinct regions with separatist governors; two scripted autonomy demands open the game (`premise.patchwork.demands`). Chosen for any seed containing "empire" or "patchwork" (featured seed `amber-empire-1`), so existing seeds keep their premises.
- Inspector: region rows show population, average prosperity, identity, autonomy and the governor (tap to open them); a city's line names its region with its unrest.
- CI: the deployed-site QA gains three checks per viewport — the Regions overlay paints the map, God understands annexation, governors appear among the people (`tests/e2e/deployed.mjs`).
- Regionalists: characters whose objective is to free a region or win it autonomy/independence (ousted and separatist governors) found a liberation movement there (`<Region> Liberation Front`, they lead it) or rally the one that exists (`region.rally`), pushing regional unrest — so an annexation or a crackdown keeps producing named people with a cause (`simulation/objectives.ts` `regionalistActsOnObjective`).
- Annexation: wars can redraw the map. When a decisive winner (military ≥ 1.15× the loser's) ends a war, the peace terms may cede the loser's region nearest to the winner (`war.annex`, 45 %): its cities, the cells nearest to them, a share of population and GDP and its people change flags (`actions.ts` `transferRegion`, `geography.version` tells the renderer to rebuild borders, fronts and seams). The ousted governor swears to free the region; the annexed region starts restless and distinct, so it feeds the autonomy machinery, and an insurgency can flare within months (`annex.insurgency`). God Mode: "X annexes <Region>" and an Annex Region preset (44 presets). Twenty years on `diag`: 14 annexations, 8 insurgencies, no city/cell inconsistencies.
- Governors: every region has a governor character (tier-2 politician in its biggest city, "Governor of X", ambitions shaped by the region's identity). Separatist-minded governors lead autonomy demands (fame, memories), are credited when the capital concedes, and are dismissed after a crackdown — becoming enemies of the leader with a new objective, "win independence for X" — while a loyal replacement is appointed; when a region secedes its governor becomes the founding leader. Dead or retired governors are replaced monthly. Ten years on the `diag` seed: ~33 of 41 demands governor-led, 13 dismissals; a state that just lost a region cannot lose another for three years, and the world digests one new border at a time (two years between foundings, both for regional secessions and separatist referendums): 20 years on `diag` now make 6 new nations instead of 16.
- Map: a Regions overlay colours every region by its unrest (per-cell Voronoi fill around the country's cities, painted as a one-pixel-per-cell image so a rebuild costs about a millisecond even at 20× speed) and draws the region seams; on the political map the seams appear as faint dotted lines once you zoom in (drawn per frame from a cached segment list, so they stay crisp at any zoom).

## 0.8.0 — festivals and fronts

- Calendar: a film festival every spring (a host city, a winning artist and their film; political films can get banned by an unfree host, and a media company may buy the rights) and a trade fair every autumn (the biggest trading nation hosts its partners, relations warm, and the two headline companies form a joint venture or fall out) — `simulation/calendar.ts`, rules `festival.banned`, `festival.rights`, `fair.venture`. Sagas rooted in them are named ("The film X banned", "The venture born at the X fair"); posts carry #RedCarpet / #TradeFair tags.
- God Mode: "Film Festival" and "Trade Fair" presets (42 presets) and matching freeform intents ("Hold a film festival in X", "X hosts a trade fair", delays work) — a commanded festival or fair is a player intervention with the same follow-ups; two new "Inspire me" examples.
- Map: festivals, fairs, World Games, Laurel ceremonies and joint ventures glow gold on the map for three weeks with a slowly turning ring of lights (static under reduced motion), so good news is visible next to the red and blue wounds of wars and disasters.
- Map: war fronts are traced along the smoothed border polygons instead of raw grid-cell edges, so they no longer look stair-stepped next to the borders at high zoom (a spatial hash of the neighbour's contour points marks the shared stretch; each run is drawn as one rounded polyline with the ember glow, marching hot line and sparks).
- Rising seas: each year the most climate-stressed nations (risk above 65) can lose a coastal district — "X loses ground to the sea" displaces people, dents prosperity and, when large, sends climate migrants to a safer neighbour. About one such loss a year world-wide, most of them chaining into migration.
- Policies: coastal defence programs (debt up, climate risk down, coastal prosperity up) enter the agenda of stressed coastal nations and jump to the top after a sea loss. Sea-rise sagas are named ("The sea takes X").
- Accessibility: every severity dot (event cards, causal chains, sagas, the world ticker) carries its label as `aria-label` and hover title, and the Live severity filter chips are readable by screen readers.

## 0.7.0 — bread, water and consequences

- Intro: "featured worlds" chips — one curated seed per premise (The Cold Peace, The Fractured Map, …) that fills the seed box; the premise tag under the preview updates as you pick.
- Social: characters you interviewed talk about it on the feed the next day (hashtag Interview), quoting the question and their answer.
- Organizations: movements, parties and religions show public support instead of influence in the list.
- Dialogue: advice sticks — telling a character "you should …" can persuade an open-minded one (openness vs caution) to adopt it as a new objective, recorded in their life story and shown as "✦ took it to heart" in the conversation; cautious characters refuse in character.
- Leaders act on their objectives: one talked into peace seeks a ceasefire or sends an olive branch, one set on elections calls a vote, one set on reform loosens the state's grip, one set on stepping down resigns — so persuading a leader in conversation changes the world.
- Fix: a leader whose home city seceded could be assassinated without any succession (the throne stayed with a dead person); succession now covers every country a person led, and a sitting leader stays with the old capital when their city breaks away.
- Companies act on their CEO's objectives: a chief persuaded toward a field (a cure, space, clean energy, AI, defense, transport, food, finance) pivots the company into that sector, sometimes with a breakthrough to match; freshly adopted objectives are pursued with urgency for about eight months.
- Journalists quote your interviews: a famous character you questioned may get a profile piece ("…: X speaks") built on what they told you, with fame and reputation effects; researchers persuaded toward a field chase breakthroughs in it.
- Mobile: toasts stay at the top while the inspector sheet is open on a list screen, so they never cover the sheet.
- People: a "Changed course" panel lists characters you persuaded and what they did about it; the inspector marks an objective that came from an interview.
- Dialogue: a "You should make peace." starter chip makes persuasion discoverable.
- Hardening: persuaded objectives are sanitized (no quotes, angle brackets or newlines) and capped at 80 characters; advice spanning lines still counts.
- Chronicle export gains a "Conversations that mattered" section: who you persuaded and what they did.
- Fix: the leader "call an election" behaviour only fires for objectives that actually ask for one ("hold free elections", "call a snap election", "demand new elections"), never for the common generated goal "win the next election".
- Balance: company pivots driven by generated ambitions ("reach orbit") are rarer (25% per attempt) and never contradict the company's own name; persuaded chiefs still pivot readily. Ten years on the `diag` seed without player input: ~4 objective-driven reforms, ~25 pivots (before this change), no objective-driven elections or resignations.
- Summaries: the premise line appears in the first week of daily summaries, the first monthly summary and the first yearly review only (it used to repeat monthly for a year).
- Anniversaries: on the 1st, 10th, 25th and 50th anniversary of a major event (severity 5, or severity 4 with a long chain, in the military, environmental, health, scientific or leadership categories) a commemoration is recorded and chained to the original, so sagas stretch across decades and the History tab shows the world remembering.
- Summits have agendas: each summit records its topic and, weeks later, either delivers an accord (a climate fund, debt relief for the poorest guest, a trade agreement, machine-safety rules, an arms-control protocol, a refugee framework or a security council, each with fitting effects) or collapses with damaged relations; success depends on relations, freedom and whether any guests are at war.
- Relationships: a mentor whose protégé has outgrown them (and who is ambitious enough to mind) publicly disowns them — the tie flips to rivalry, the protégé remembers it, and the feud rules take over. Sagas rooted in a summit are named ("The Laraland accord", "The talks that failed in Micaunia").
- Balance: a state cannot collapse or suffer a coup twice within two years (transitional regimes get a chance, recorded in the country's history), and a collapsed government's council starts at a stability floor of 15 instead of zero. Ten years on the `diag` seed: 5 collapses and 6 coups (was 43 collapses, with failed states collapsing up to eight times each).
- Family: a fortune passes to family and partners on death (recorded in their life stories); heirs — or a rival of the deceased contesting a single heir — can fall out over the estate ("X's heirs go to war over the estate"), becoming rivals. Characters remember who stood by them in a scandal and name them when asked who they trust.
- Weather and food: droughts and wildfires favour dry, front-free regions in the dry season (half of them now land there); droughts push grain prices up (about 6% per magnitude), floods a little, hurricanes nudge oil.
- Food-price crisis chain: when grain rises more than 25% in two months a global "Food prices spiral" event hits the poorest third of nations (happiness, unrest, inflation), followed by bread riots in one of them and emergency grain shipments from a rich country that ease prices and relations. About four such crises a decade organically; droughts, floods and wars feed them.
- God Mode: Famine preset (harvests fail, grain spikes, the food-crisis chain follows); the interpreter understands "a famine strikes X", "harvests fail", "food prices spiral". Sagas rooted in a food crisis are named ("The hungry year").
- Harvests: a yearly harvest report — each nation's yield follows farmland, water, climate stress, technology and this year's droughts and floods; poor harvests cost happiness and add unrest, bumper crops cheer, and the world's shortfall or surplus moves grain (and so the food-crisis chain).
- Map: Harvest overlay colours nations by their last harvest's yield ratio (potential before the first report).
- Policies: leaders can launch irrigation programs (water +6) and agritech subsidies (farmland +4), and reach for them first after a poor harvest — about six such policies a year world-wide, enough to offset the yearly climate drain on water.
- Famine migration: a food crisis can send people from a hungry nation to a better-fed neighbour ("Hunger, not war, drove them"), feeding the existing migration politics.
- God Mode: Rains Return preset breaks a drought (water +12, cheer, grain eases, the drought zone fades within days); the interpreter understands "end the drought in X", "make it rain", "let it rain".
- Grain export bans: during a food crisis a breadbasket nation may seal its silos (grain +4%, importers' inflation and relations suffer, domestic relief); also a God preset and interpreter phrasing ("X bans grain exports").
- Water disputes: a thirsty nation (water under 35) with a water-rich neighbour sees relations sour over dams, diversions and shared aquifers (about two flare-ups a year world-wide), feeding the existing border-clash and war logic.
- History → Sagas: chains rooted in a tension rise are named ("The water war", "Rivers and grudges", "The road to war in X").
- Fix: a persuaded leader's new goal was being overwritten by the standing-based rewrite and could be starved of attempts because event memories evicted the urgency marker; urgency now keys off the durable life-story entry, persists for eight months, and objective-driven actions run for any sitting leader (generals and activists included), with a persuaded leader following through 80% of the time.

## 0.6.0 — weather, premises and the long game

- World premises: every seed opens on a starting situation (The Cold Peace, The Long Boom, The Age of Unrest, After the Plague, The Machine Dawn, The Fractured Map, The Gilded Age, The Quiet Century) applied at generation, shown on the intro under the seed preview and on the onboarding card.
- Premise arcs: each premise also schedules its own opening storyline (a border incident in the Cold Peace, a bubble warning and possible crash after the Long Boom, mass marches in the Age of Unrest, an outbreak scare After the Plague, an automation shock at the Machine Dawn, peace talks on the Fractured Map, a tycoon scandal in the Gilded Age, a resource find in the Quiet Century), all chained to a historic "premise.opening" event.
- Trade model: trade volume between partners is derived from the smaller economy, relations, adjacency, alliance and openness (`simulation/trade.ts`); it feeds growth potential (open economies grow faster, losing partners hurts), scales the trade arcs on the map, and the country inspector lists top partners with yearly volume.
- Map: Trade overlay colours nations by trade as a share of GDP.
- Accessibility: "larger text" and "high contrast" settings in the More sheet (persisted); the desktop side nav gains a ⚙ more button for settings, saves, share and install.
- Mobile: on list screens (Live, News, Social, …) toasts dock above the bottom nav instead of covering the screen header.
- History: 📜 Export chronicle — the world's story as Markdown (premise, year reviews, sagas, historic events, interventions, the world today), copied to the clipboard or shared via the Web Share sheet on phones.
- Fix: yearly reviews were almost always titled "A Quiet Year" because unclassified events counted toward "quiet"; years are now named by what actually dominated them.
- Live: "Developing stories" strip — causal chains still producing events, named like sagas, each card jumping to the latest event.
- God Mode: delayed interventions — "In 3 months, X declares war on Y", "next year a pandemic begins", "two weeks from now…" record an omen event now and carry out the plan on the day (through the consequence engine, so it survives saves); the resulting event is chained to the omen.
- Religion: faiths rise in hard times and ebb in prosperity ("revival"/"decline" events) and split in schisms — a breakaway leader founds a Reformed/True/Orthodox splinter with part of the faithful, the two leaders become enemies, polarization jumps.
- Characters: an executive passed over for the CEO job becomes the new chief's rival (with a new objective), feeding the feud, scandal and funding rules.
- Culture: yearly Laurel Prizes for art and science (fame, wealth and influence for the laureates; a `prize.laurels` event), alongside the four-yearly World Games.
- Politics: movements grow over several rounds, fade when the mood calms (monthly support drift), and a surging movement fields its leader as the main election challenger — protest movements can now win power. A country sustains at most four movements; new energy merges into the strongest.
- News: an "Editorials" filter chip surfaces the weekly opinion pieces (they were buried under daily coverage).
- AI: `LLMDialogueProvider` — character conversations go through the configured LLM endpoint (prompt `character_dialogue`, with personality, objective, memories, relationships, national mood and the running thread), falling back to the local provider on any failure; characters remember being interviewed (low-weight memories) whichever provider answers.
- Map: weather fronts — storm cells that darken and flicker with lightning over climate-stressed land; a Climate overlay colours nations by climate risk.
- Weather with consequences: storm cells are simulation-time objects (`simulation/weather.ts`) shared by the engine and the map, with seasons (hurricane season in the tropics in the second half of the year, winter storms in mid-latitudes); half of all hurricanes and floods now strike countries sitting under a front, so the map foreshadows disasters.
- Balance: polarization now mean-reverts toward what unrest, war and mood sustain (it used to pin at 97 in a third of countries after a decade); movement support boosts from rallies, protests and tycoons reduced. After 10 years on the `diag` seed: 58 live movements (was 226), 2 of 32 countries above 80 polarization (was 14).
- Accessibility: modals trap focus, close on Escape and return focus to the opener; the inspector takes focus when it opens and gives it back when dismissed.
- Keyboard map: focus the map and use arrow keys to pan, + / − to zoom, Enter to select what is under the crosshair (or the nearest city), Home to reset.
- Summaries: the daily summary carries a storm forecast line when fronts sit over land.
- Tests: JSON round-trip mid-story (pending omens, premise), premise arcs, God delay parsing, LLM dialogue mock.

## 0.5.0 — rivals, fronts and editorials

- Map: burning war fronts — borders shared by countries at war glow with a marching hot line and sparks when zoomed in.
- Companies: when a CEO dies, retires or moves on, the board appoints a successor (an existing executive or a newly generated one) with a `ceo.change` event and a small valuation shock.
- Relationship-driven consequences: rivals pounce on scandals, allies rally, rivals rise after a downfall, mentors endorse new leaders, and new leaders purge or face old rivals as opposition.
- Personal life: partners separate under the strain of scandals and feuds; funders pull their backing from soured entrepreneurs (hitting their companies).
- God Mode: Snap Election (forces a vote, even in autocracies), Spark Rivalry and Matchmaker presets; the interpreter understands "calls a snap election", "become bitter rivals" and "falls in love with"; two people can be named in one command.
- News: weekly editorials — a few outlets publish opinion pieces on the story of the week, each spun through its bias (marked "editorial").
- History → Sagas: names for scandal rivalries ("The Okoro affair", "Vidal against the world"), feuds, snap elections and purges.
- Balance: rival pile-ons capped, breakups reachable for less famous couples, senior allies can act as mentors.

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
