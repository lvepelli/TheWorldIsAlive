# World Engine

## Generation premise (`generator/premise.ts`)

After geography, countries, people, companies, outlets, relationships and markets are generated, `applyPremise(world, seed)` picks one of eight starting situations deterministically from the seed (`premiseFor(seed)` is cheap enough for the intro to show it before generation) and nudges the initial state: The Cold Peace (two blocs, alliances, hostile relations), The Long Boom (growth, debt, inflated valuations), The Age of Unrest, After the Plague (smaller population, biotech premium), The Machine Dawn (tech + unemployment in the top eight economies), The Fractured Map (three live border wars), The Gilded Age (corruption, tycoon wealth), The Quiet Century (calm). The choice is stored in `meta.premise`, a historic `premise.opening` event is recorded on day 0, and one opening arc per premise is scheduled into `world.pending` (rules prefixed `premise.` in `consequences.ts`), so the History → Sagas tab shows the premise as the root of its own chain.

## Tick model

One tick = one simulated day (`simulation/tick.ts`). Cadences:

| Cadence | System | File |
| --- | --- | --- |
| Daily | pending consequences, spontaneous events, reactions, markets, news, social, trending (every 2 days) | tick.ts, consequences.ts, spawn.ts, markets.ts, information.ts |
| Weekly | population growth, GDP compounding, growth/inflation/unemployment/debt drift, happiness, unrest, stability, approval, polarization, city drift, company fundamentals | systems.ts `weeklyTick` |
| Monthly | technology, military, corruption, climate risk, relation drift, elections, coup/collapse/revolution risk, organizations, character objectives, monthly summary | systems.ts `monthlyTick`, characters.ts |
| Yearly | climate report, yearly summary | systems.ts `yearlyTick` |

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

## Events

Spontaneous rules (`spawn.ts`) with state-dependent weights: protest, scandal, tech breakthrough, company founded/bankrupt, corporate launch/flop, disaster, border clash, war declared/battle/ended, diplomacy (alliance/breakdown/tension), cyberattack, discovery, culture moment, crime, movement founded, epidemic, resource discovery, economic shock, person rise, summit, strike, assassination.

Expected events/day: `(0.55 + countries/60) × 1.8 (first 20 days)`.

Severity scale: 1 minor local · 2 notable · 3 national · 4 major international · 5 world-changing. Severity drives media/social relevance, `historic`, toasts (≥3) and cinematics (5).

## Consequence engine (`consequences.ts`)

`TRIGGERS` map event types to rules with delay ranges and probabilities; `react()` schedules them into `world.pending`; `resolvePending()` executes due rules, which read the source event's `data`/`actors` and the *current* world state (so a scheduled "allies join war" no-ops if the war already ended). Produced events get `causedBy = source.id` and are appended to `source.consequences`, giving the UI a causal tree ("Why did this happen?").

Implemented chains: war (markets, allies join, refugees, attrition→end, anti-war protest, reconstruction), coup crackdown, collapse (neighbors react, warlords), crisis (unrest, bankruptcies, central bank), boom markets, energy (markets, politics), tech (market reaction, government interest, competitor response, scientist fame, diffusion), disaster (aid, blame, markets), epidemic (spread/contain/pandemic, vaccine), scandal fallout (survive/resign/downfall), protest escalation (revolution/crackdown/concession), movement growth, bankruptcy layoffs, startup progress, alliance trade deal, arms race, assassination crisis, independence recognition/war, migration politics, resource investment.

## Markets (`markets.ts`)

Daily: commodities random-walk with mean reversion; companies move by fundamentals (growth, national GDP growth, inflation), global mood, sector-commodity betas, country unrest/war, and event `shocks` (`{sector|countryId|companyId|commodityId, pct}`) collected from today's events; national indexes are value-weighted company returns; the World Composite is GDP-weighted. Histories keep 120 days.

## Characters (`characters.ts`)

Monthly per living person: mortality by age, retirement, influence/fame/reputation/wealth drift, and objective pursuit gated by tier and ambition: entrepreneurs/scientists found companies or produce breakthroughs; leaders enact policies; challengers attack low-approval leaders; journalists expose scandals (if press is free); activists found/lead movements; ambitious generals coup unstable states; stars enter politics; executives acquire rivals; criminals corrupt politicians; diplomats defuse tension; religious leaders preach; citizens go viral. Tier 1 (leaders, movement leaders, breakthrough scientists) act ~3× more often than tier 2.

## Information (`information.ts`, `ai/narrative.ts`)

News: coverage selection by home relevance, severity, outlet bias; headline prefix and body spin per bias (establishment, opposition, sensational, business, international, independent, state); tone. Social: reaction counts by severity, author stance from ideology/personality/involvement, profession-specific templates, trait flavor, replies (agree/disagree), virality, ambient posts. Trending = hashtag weight over the last 3 days.

## Summaries (`summary.ts`)

Deterministic daily/monthly/yearly summaries: major events, wars, market change, fragile states, most talked-about people, corporate winners/losers, dominant category, interventions.

## Limits and caps

Events capped at 4000 (old minor ones trimmed; historic kept), news 600, social 900, histories 60 entries per entity, memories 30, price histories 120 days.
