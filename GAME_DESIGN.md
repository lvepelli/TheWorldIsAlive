# Game Design

## Player fantasy

*You are watching a civilization that feels alive — and you can change its history.*

The player is an observer with divine powers. The world has no win condition; the reward is understanding, surprise and authorship: "I caused that" and "why did this happen?".

## Core loop

1. Generate a world (seed) → initialization sequence → map reveal.
2. Observe: map, live stream, news, social, markets, people, organizations.
3. Advance time (pause/1×/5×/20×/≫ or jumps).
4. Events emerge; consequences chain; cinematics for world-changing moments.
5. Inspect entities and follow relationships.
6. Intervene through God Mode (preset or freeform, immediately or "in 3 months"), or the quiet way: talk a leader or a CEO into something and watch them act on it.
7. Trace consequences in the event's causal chain and in History → Your interventions.
8. Continue indefinitely; the world's story diverges from every other seed and every other player.

## First five minutes

- The world starts three days in, so the map already pulses with events; the first 20 days spawn events at ~1.8× rate.
- Every generated world has smoldering rivalries (hostile neighbors, sometimes an active war), unstable states, corrupt regimes and fast-growing tech companies, so protests, scandals, clashes and breakthroughs are likely quickly.
- Toasts announce notable events; a severity-5 event triggers a cinematic with camera focus.
- God Mode is one tap away; the inspector offers contextual God shortcuts on every country, person and company.

## Sections

| Section | Purpose |
| --- | --- |
| World | Living map; overlays (political, stability, wealth, tension, mood, tech, trade, climate, harvest); war fronts, trade arcs, day/night; tap to inspect; keyboard navigation; ticker |
| Live | Daily and period summaries, developing-story cards (active causal chains), chronological event stream with category/severity filters |
| News | Outlets with bias, style, credibility, audience; multiple outlets spin the same event differently |
| Social | Posts, replies, likes/reposts, viral flag, trending hashtags, global mood |
| Markets | World composite, national indexes, commodities, listed companies, movers |
| People | Searchable/sortable figures; profiles with personality, objectives, life story, memories, sentiment; talk to anyone (local or LLM voice), and "you should …" can persuade open characters — leaders then make peace, call votes or reform, CEOs pivot companies; a "Changed course" panel tracks the people you swayed |
| Orgs | Governments, parties, movements, companies, research, military, alliances, NGOs, unions, religions, criminal networks, media |
| History | Timeline by month with filters (year, country, category), named sagas, your interventions with downstream counts, period summaries, Markdown chronicle export |
| God | Freeform command with live interpretation preview; delayed commands ("In 3 months, …") recorded as omens and carried out on the day; 39 presets in 7 groups; intervention log |

## God Mode

- **Presets** (`src/engine/godmode/presets.ts`): war/peace/tension/alliance/breakdown/destabilize; change/collapse government, revolution, coup, create country, movement, opinion swings; create/bankrupt company, boom, crisis, crash, energy crisis, resource discovery; breakthrough, discovery, accelerate progress; disasters, meteor, epidemic, pandemic; migration, belief movement; create/remove public figure, scandal, reveal secret.
- **Freeform**: local interpreter matches intents by regex, resolves named countries/companies/people, sector keywords, magnitudes ("twenty times", "huge") and composite intents ("a small X company discovers Y" → new company + breakthrough). Shows what it understood before executing. An LLM interpreter can replace it (see AI_SYSTEM.md).
- Every intervention is an event with `causedBy: 'player'`, is recorded in `world.interventions`, and immediately produces market, news and social reactions before regular consequences unfold over days.

## Storytelling arcs

Arcs emerge from rules rather than scripts. Examples that the current rule set can produce:

- Entrepreneur founds startup → funding round → breakthrough → market reshuffle → government classifies tech as strategic → rival state tension → arms race.
- Scandal → fallout → resignation → succession → approval crash → protests → crackdown or revolution.
- Border clash → war → allies join → refugees → migration politics → nationalist movement → election upset.
- Drought → aid → blame → opinion collapse; epidemic → spread → pandemic → vaccine hero company.
- Government collapse → neighbors invade or absorb refugees → warlords/coup.

## Procedural generation

Seeded generation (`generator/`): continents from blob-weighted fBm noise; countries grown by weighted multi-source flooding (mountains slow growth → natural borders); names from 7 language families chosen by latitude; flags; cities by coast/moisture weighting; people, companies, organizations, outlets, relations, alliances, trade, initial wars; markets. Seeds are stored and shown; same seed → same start.

## Difficulty / balance

There is no failure state. Balance work is about pacing: events per day (≈0.6 + countries/60), severity distribution (most 2–3, rare 4–5), consequence delays (days to months) and the drift formulas in `systems.ts`. Tunables are concentrated in `spawn.ts` (weights), `consequences.ts` (TRIGGERS delays/probabilities) and `systems.ts`.
