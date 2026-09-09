# World Engine

## Generation premise (`generator/premise.ts`)

After geography, countries, people, companies, outlets, relationships and markets are generated, `applyPremise(world, seed)` picks one of eight starting situations deterministically from the seed (a ninth, The Patchwork Empire, is chosen whenever the seed contains "empire" or "patchwork", so existing seeds keep their premises) (`premiseFor(seed)` is cheap enough for the intro to show it before generation) and nudges the initial state: The Cold Peace (two blocs, alliances, hostile relations), The Long Boom (growth, debt, inflated valuations), The Age of Unrest, After the Plague (smaller population, biotech premium), The Machine Dawn (tech + unemployment in the top eight economies), The Fractured Map (three live border wars), The Gilded Age (corruption, tycoon wealth), The Quiet Century (calm). The choice is stored in `meta.premise`, a historic `premise.opening` event is recorded on day 0, and one opening arc per premise is scheduled into `world.pending` (rules prefixed `premise.` in `consequences.ts`), so the History → Sagas tab shows the premise as the root of its own chain.

## Tick model

One tick = one simulated day (`simulation/tick.ts`). Cadences:

| Cadence | System | File |
| --- | --- | --- |
| Daily | pending consequences, spontaneous events, reactions, markets, news, social, trending (every 2 days) | tick.ts, consequences.ts, spawn.ts, markets.ts, information.ts |
| Weekly | population growth, GDP compounding, growth/inflation/unemployment/debt drift, happiness, unrest, stability, approval, polarization, city drift, company fundamentals | systems.ts `weeklyTick` |
| Monthly | technology, military, corruption, climate risk, relation drift, elections, coup/collapse/revolution risk, organizations, character objectives, monthly summary | systems.ts `monthlyTick`, characters.ts |
| Yearly | climate report, harvest report, rising seas, World Games (every 4 years), Laurel Prizes, yearly summary | systems.ts `yearlyTick` |
| Monthly (elections) | campaign season from September before an election year (`election.campaign`: poll, challenger, promise), then the vote in January | systems.ts `monthlyTick` |
| Monthly (regions) | regional unrest drift, autonomy demands | simulation/regions.ts `regionsTick` |
| Calendar | film festival (May), trade fair (October), holy days per faith (its own month), climate conference (December, a `summit` with topic climate finance) — once per year each, guarded by the event log | simulation/calendar.ts `calendarTick` (from the monthly tick) |

Years are 365 days (no leap years) for determinism; `time.ts` converts day indexes to calendar dates.

## Country model (key formulas, weekly)

- Population: `growth = 0.018 − tech·0.014 + (happiness−50)·0.004 − war·0.01` per year.
- GDP compounds at `gdpGrowth`; growth mean-reverts (4%/week) to a potential `1 + (tech−50)/40 + (stability−50)/60 + (freedom−50)/100 − (corruption−40)/80 − 3·war − max(0, debt−100)/80`.
- Inflation targets `2 + max(0,growth)·0.4 + max(0,debt−90)/30 + 3·war`; unemployment targets `8 − 1.2·growth (+4 if stability<40)`.
- Happiness target: economy, freedom, stability, corruption and war terms; unrest target: `(60−happiness)·1.2 + (polarization−40)/2 + (50−approval)/3 (−8 under repression)`.
- Stability target: approval, unrest, corruption, elections, wars. Approval decays toward `0.7·happiness + 15`.
- Monthly: technology grows with GDP per capita and freedom; military with threats; corruption with low freedom/stability; relations drift toward an ideology/alliance/trade baseline.
- Elections: if `electionEvery` and the year matches, incumbent wins with `p = approval/100 + 0.15·charisma − 0.1 (+0.15 if corruption>70)`, else `changeLeader('election')`.
- Coups/collapse: stability < 25 → 6%/month; unrest > 75 & stability < 40 → 8%/month revolution.

Monthly, freedom drifts 2 % toward a government baseline (democracy 78, federation 72, republic 68, council 56, technocracy 50, monarchy 45, oligarchy 36, theocracy 30, autocracy 26, junta 16) + 0.15·(happiness − 50) − 8 at war; weekly, debt above 90 % of GDP is consolidated at 0.4 % of the excess per week.

## Events

Spontaneous rules (`spawn.ts`) with state-dependent weights: protest, scandal, tech breakthrough, company founded/bankrupt, corporate launch/flop, disaster, border clash, war declared/battle/ended, diplomacy (alliance/breakdown/tension), cyberattack, discovery, culture moment, crime, movement founded, epidemic, resource discovery, economic shock, person rise, summit, strike, assassination.

Expected events/day: `(0.55 + countries/60) × 1.8 (first 20 days)`.

Severity scale: 1 minor local · 2 notable · 3 national · 4 major international · 5 world-changing. Severity drives media/social relevance, `historic`, toasts (≥3) and cinematics (5).

## Consequence engine (`consequences.ts`)

`TRIGGERS` map event types to rules with delay ranges and probabilities; `react()` schedules them into `world.pending`; `resolvePending()` executes due rules, which read the source event's `data`/`actors` and the *current* world state (so a scheduled "allies join war" no-ops if the war already ended). Produced events get `causedBy = source.id` and are appended to `source.consequences`, giving the UI a causal tree ("Why did this happen?").

Implemented chains: war (markets, allies join, refugees, attrition→end, anti-war protest, reconstruction), coup crackdown, collapse (neighbors react, warlords), crisis (unrest, bankruptcies, central bank), boom markets, energy (markets, politics), tech (market reaction, government interest, competitor response, scientist fame, diffusion), disaster (aid, blame, markets), epidemic (spread/contain/pandemic, vaccine), scandal fallout (survive/resign/downfall), protest escalation (revolution/crackdown/concession), movement growth, bankruptcy layoffs, startup progress, alliance trade deal, arms race, assassination crisis, independence recognition/war, migration politics, resource investment.

## Weather (`weather.ts`)

Five storm cells drift eastward along a tropical and a mid-latitude band; `stormCells(world, subDay)` is a pure function of `world.day`, so the map and the engine agree. Strength = (0.3 + climateRisk of the land beneath × 0.7) × season (`seasonFactor`: hurricane season peaks around September in the tropics, winter storms around January elsewhere). The `disaster` spawn rule sends half of its rolls to `stormBound()` countries as hurricanes or floods scaled by front strength; the rest keep the climate-risk weighting with extra weight for dry, front-free countries in the dry season (`seasonFactor < 0.45`), where droughts and wildfires are 2.2× likelier. Droughts shock grain (+6% per magnitude), floods +3%, hurricanes nudge oil. Weekly, a grain rise above 25% over 60 days fires a global `food.crisis` (poorest third of nations; riots and grain aid follow). Yearly, `harvest.report` computes each nation's yield = farmland × (0.5 + water/2) × (1 − climateRisk/300) × drought/flood penalties × tech bonus × noise, compares it with potential, and moves grain by 0.6 × the population-weighted world shortfall (clamped −12%…+25%). Also yearly, nations with climate risk above 65 may lose a coastal district (`sea.rise`, displacing 1–4% of a city; large losses chain into `sea.migration`), and leaders of such nations reach for coastal defence programs. Thirsty nations (water under 35) next to water-rich ones spawn `water.dispute` tension rises (~2 a year) that feed the border-clash and war logic.

## Trade (`trade.ts`)

Nothing is stored: `tradeVolume(a, b)` = (min(gdp) × 0.04 + √(gdpA·gdpB) × 0.01) × neighbor 1.5 × ally 1.3 × relations factor (0.6 at −60 … 1.6 at +100) × openness (freedom). War or relations below −60 suspend a link. `tradeShare` (total / GDP, capped 0.8) enters the weekly growth potential as `(min(0.5, share) − 0.25) × 2`, so sanctions, wars and broken alliances have a lasting economic cost. The map scales trade arcs by log volume, the Trade overlay colours countries by share, and the inspector Trade section lists top partners.

## Regions (`generator/regions.ts`, `simulation/regions.ts`)

Every country with three or more cities is split into 2–4 regions by k-means over its cities (seeded from the capital and the farthest cities, seam-aware). A region has an identity (0..1, higher far from the capital or across a coast/inland divide; ~0.1 for the capital's region), an autonomy level and its own unrest. Monthly, `unrest → 0.7·country unrest + 50·identity + 0.8·prosperity gap + 0.25·max(0, polarization−50) − 0.3·autonomy (+5 at war)` at 8 % a month, plus an occasional slight (+8..18, 2.5 %/month when identity > 0.45); cities drift 3 % toward their region's unrest. A non-capital region with unrest > 55 and identity > 0.4 demands autonomy (30 %/month, at most yearly) → `region.response` (concession 70 % if freedom > 55, 45 % if stability < 40, else 20 %; otherwise crackdown) and maybe a `<Region> League` independence movement; a crackdown schedules `region.secession` (needs unrest ≥ 70 and stability ≤ 55, else retried), which calls `createCountry(..., regionId)`: the new state takes the region's cities and every cell whose nearest city belongs to the region. Each region has a governor (`appointGovernor`, tier-2 politician, objective from identity: "win autonomy for X" / "keep X loyal"); separatist governors lead demands and are dismissed by crackdowns (becoming the leader's enemy, objective "win independence for X"), and a seceding region's governor becomes the new state's founding leader. In free states (freedom > 60) about a third of demands are answered with a referendum instead (`region.referendum`, once per region per three years): turnout ≈ 45 + 0.35·unrest + 20·identity, yes ≈ 30 + 35·identity + 0.5·(unrest − 50) − 0.2·autonomy (± 9); yes → autonomy +40 and unrest −30, or an honoured independence vote when yes > 65, unrest > 70 and stability < 60; no → unrest −15 and a reputational hit for a governor who campaigned. One lost region per country per three years, and two years between any two foundings world-wide. **Annexation:** `war.ended` with a decisive winner (military ≥ 1.15× the loser's) schedules `war.annex` (45 %, 5–30 days): the loser's non-capital region nearest to the winner's cities is transferred with `transferRegion` — cells nearest to its cities, cities, a population/GDP share, people and companies; `geography.version` is bumped so contours, fronts and seams rebuild. The region arrives with unrest ≥ 70, identity +0.25 and a loyal new governor; `annex.insurgency` (60 %, 30–200 days) adds unrest and instability. Old saves without regions get them (and governors, on the next monthly tick) in `validateWorld`.

## Markets (`markets.ts`)

Daily: commodities random-walk with mean reversion; companies move by fundamentals (growth, national GDP growth, inflation), global mood, sector-commodity betas, country unrest/war, and event `shocks` (`{sector|countryId|companyId|commodityId, pct}`) collected from today's events; national indexes are value-weighted company returns; the World Composite is GDP-weighted. Histories keep 120 days.

## Characters (`characters.ts`)

Monthly per living person: mortality by age, retirement, influence/fame/reputation/wealth drift, and objective pursuit gated by tier and ambition: entrepreneurs/scientists found companies or produce breakthroughs; leaders enact policies; challengers attack low-approval leaders; journalists expose scandals (if press is free); activists found/lead movements; ambitious generals coup unstable states; stars enter politics; executives acquire rivals; criminals corrupt politicians; diplomats defuse tension; religious leaders preach; citizens go viral. Tier 1 (leaders, movement leaders, breakthrough scientists) act ~3× more often than tier 2.

## Information (`information.ts`, `ai/narrative.ts`)

News: coverage selection by home relevance, severity, outlet bias; headline prefix and body spin per bias (establishment, opposition, sensational, business, international, independent, state); tone. Social: reaction counts by severity, author stance from ideology/personality/involvement, profession-specific templates, trait flavor, replies (agree/disagree), virality, ambient posts. Trending = hashtag weight over the last 3 days.

## Summaries (`summary.ts`)

Deterministic daily/monthly/yearly summaries: major events, wars, market change, fragile states, most talked-about people, corporate winners/losers, dominant category, interventions.

## Limits and caps

Events capped at 3000 (old minor ones trimmed; historic kept), news 600, social 900, histories 60 entries per entity (people compacted to 30 yearly), memories 30, price histories 120 days. Behavioural caps: at most four live movements per country (new ones merge into the strongest), one government collapse or coup per country per two years, one anniversary commemoration a day, persuaded objectives at most 80 characters, six dialogue turns kept per LLM thread, one editorial per outlet per week (2–4 outlets).
