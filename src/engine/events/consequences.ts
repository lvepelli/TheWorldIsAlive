/**
 * Consequence engine. When an event is created, `react` inspects it and
 * schedules follow-up rules. `resolvePending` runs the rules whose day has come.
 * Rules are generic: they read the source event's data and current world state.
 */
import { RNG, clamp } from '../rng';
import type { World, WorldEvent, PendingConsequence, ID, Sector } from '../types';
import * as A from './actions';
import { createEvent, fx, ref, schedule } from './engine';
import type { MarketShock } from '../simulation/markets';

export type ConsequenceRule = (world: World, rng: RNG, source: WorldEvent, payload: Record<string, unknown>) => WorldEvent | null | void;

const c$ = (w: World, id?: ID) => (id ? w.countries[id] : undefined);

export const CONSEQUENCE_RULES: Record<string, ConsequenceRule> = {
  // ---- War chain ----
  'war.allies-join': (w, rng, src) => {
    const a = c$(w, src.data?.attacker as ID), b = c$(w, src.data?.defender as ID);
    if (!a || !b || !a.atWarWith.includes(b.id)) return null;
    const allies = b.alliances.map((id) => w.countries[id]).filter((x) => x && !x.atWarWith.includes(a.id) && x.id !== a.id);
    if (!allies.length) return null;
    const ally = rng.pick(allies);
    if (rng.next() > 0.5 + ally.military / 200) return null;
    return A.declareWar(w, rng, ally, a, src.id, false, `its treaty obligations to ${b.name}`);
  },
  'war.refugees': (w, rng, src) => {
    const b = c$(w, src.data?.defender as ID);
    if (!b) return null;
    const dest = b.neighbors.map((id) => w.countries[id]).filter((x) => x && !x.atWarWith.includes(b.id));
    if (!dest.length) return null;
    const to = rng.pickWeighted(dest, (x) => x.stability + x.gdp / 10);
    return A.migrationWave(w, rng, b, to, b.population * rng.float(0.005, 0.03), src.id);
  },
  'war.markets': (w, rng, src) => {
    const a = c$(w, src.data?.attacker as ID), b = c$(w, src.data?.defender as ID);
    if (!a || !b) return null;
    return createEvent(w, {
      category: 'economic', type: 'market.reaction', severity: 3, causedBy: src.id,
      title: `Defense stocks soar, ${b.adjective} markets plunge on war news`,
      description: `Investors fled ${b.name} and ${a.name} assets while arms manufacturers posted their best day in years. Oil jumped ${rng.int(4, 15)}% on supply fears.`,
      location: { countryId: b.id }, actors: [ref('country', a.id), ref('country', b.id)], effects: [], tags: ['markets', 'war', a.code, b.code],
      data: { shocks: [{ sector: 'defense', pct: 0.12 }, { countryId: b.id, pct: -0.12 }, { countryId: a.id, pct: -0.06 }, { commodityId: 'oil', pct: 0.08 }, { commodityId: 'gold', pct: 0.03 }] as MarketShock[] },
    });
  },
  'war.attrition': (w, rng, src) => {
    const a = c$(w, src.data?.attacker as ID), b = c$(w, src.data?.defender as ID);
    if (!a || !b || !a.atWarWith.includes(b.id)) return null;
    // War weariness: unrest and economy erode; reschedule while it lasts
    for (const x of [a, b]) { x.unrest = clamp(x.unrest + 2, 0, 100); x.gdpGrowth -= 0.3; x.happiness = clamp(x.happiness - 1.5, 0, 100); }
    if (rng.next() < 0.18 + Math.max(a.unrest, b.unrest) / 400) return A.endWar(w, rng, a, b, src.id);
    schedule(w, 'war.attrition', src.id, 30);
    return null;
  },
  'war.antiwar-protest': (w, rng, src) => {
    const a = c$(w, src.data?.attacker as ID);
    if (!a || !a.atWarWith.length || a.freedom < 30) return null;
    const city = A.capitalOf(w, a);
    return createEvent(w, {
      category: 'social', type: 'protest', severity: 2, causedBy: src.id,
      title: `Anti-war protests fill ${city.name}`,
      description: `Thousands marched against the war in the ${a.adjective} capital chanting "not in our name". ${rng.pick(['The government called them traitors.', 'Police kept their distance.', 'Veterans joined the march.'])}`,
      location: { cityId: city.id }, actors: [ref('country', a.id)], effects: [fx('country', a.id, 'approval', -4), fx('country', a.id, 'unrest', 3)], tags: ['protest', 'war', a.code],
    });
  },
  'peace.recovery': (w, rng, src) => {
    for (const ref_ of src.actors) { const c = c$(w, ref_.id); if (c && ref_.kind === 'country') { c.gdpGrowth += 1.5; c.happiness = clamp(c.happiness + 5, 0, 100); } }
    const a = c$(w, src.actors[0]?.id);
    if (!a) return null;
    return createEvent(w, {
      category: 'economic', type: 'reconstruction', severity: 2, causedBy: src.id,
      title: `Reconstruction boom begins in ${a.name}`,
      description: `Construction firms and foreign lenders are pouring into ${a.name} as the post-war rebuilding effort begins.`,
      location: { countryId: a.id }, actors: [ref('country', a.id)], effects: [fx('country', a.id, 'gdpGrowth', 1)], tags: ['economy', 'reconstruction', a.code], data: { shocks: [{ sector: 'construction', countryId: a.id, pct: 0.1 }] },
    });
  },
  // ---- Coup / collapse chain ----
  'coup.crackdown': (w, rng, src) => {
    const c = c$(w, src.actors.find((x) => x.kind === 'country')?.id);
    if (!c) return null;
    const j = A.peopleOf(w, c.id, 'journalist')[0];
    return createEvent(w, {
      category: 'political', type: 'crackdown', severity: 3, causedBy: src.id,
      title: `Junta crackdown: arrests and censorship sweep ${c.name}`,
      description: `The new regime in ${c.name} suspended the constitution, shut down independent outlets and arrested opposition figures${j ? ` including journalist ${j.name}` : ''}. Curfews are in force in every major city.`,
      location: { countryId: c.id }, actors: [ref('country', c.id), ...(j ? [ref('person', j.id)] : [])],
      effects: [fx('country', c.id, 'freedom', -20), fx('country', c.id, 'unrest', -8), fx('country', c.id, 'stability', 5), fx('country', c.id, 'corruption', 5), ...(j ? [fx('person', j.id, 'fame', 15), fx('person', j.id, 'influence', -10)] : [])], tags: ['repression', c.code],
    });
  },
  'collapse.neighbors-react': (w, rng, src) => {
    const c = c$(w, src.actors.find((x) => x.kind === 'country')?.id);
    if (!c) return null;
    const nb = c.neighbors.map((id) => w.countries[id]).filter(Boolean);
    if (!nb.length) return null;
    const n = rng.pickWeighted(nb, (x) => x.military);
    if (rng.bool(0.35) && (n.relations[c.id] ?? 0) < 0) return A.declareWar(w, rng, n, c, src.id, false, 'the security vacuum next door');
    return A.migrationWave(w, rng, c, n, c.population * rng.float(0.01, 0.05), src.id);
  },
  'collapse.warlords': (w, rng, src) => {
    const c = c$(w, src.actors.find((x) => x.kind === 'country')?.id);
    if (!c || c.stability > 45) return null;
    if (rng.bool(0.4)) return A.changeLeader(w, rng, c, 'coup', src.id);
    return A.createMovement(w, rng, c, src.id, false, 'nationalist', undefined, 'restore order by any means');
  },
  // ---- Economic chains ----
  'crisis.unrest': (w, rng, src) => {
    const global = !!src.data?.global;
    const targets = global ? Object.values(w.countries).filter((c) => c.stability < 50) : [c$(w, src.actors[0]?.id)].filter(Boolean) as typeof w.countries[string][];
    if (!targets.length) return null;
    const c = rng.pick(targets);
    const city = A.capitalOf(w, c);
    return createEvent(w, {
      category: 'social', type: 'protest.mass', severity: 3, causedBy: src.id,
      title: `Austerity riots rock ${city.name}`,
      description: `Unemployment and price rises following the economic crisis have driven ${c.adjective} citizens into the streets. Banks were attacked and the parliament evacuated.`,
      location: { cityId: city.id }, actors: [ref('country', c.id)], effects: [fx('country', c.id, 'approval', -8), fx('country', c.id, 'stability', -5), fx('country', c.id, 'unrest', 6)], tags: ['protest', 'economy', c.code],
    });
  },
  'crisis.bankruptcies': (w, rng, src) => {
    const global = !!src.data?.global;
    const cid = src.actors[0]?.id;
    const pool = Object.values(w.companies).filter((co) => co.alive && (global || co.countryId === cid) && co.value < 50);
    if (!pool.length) return null;
    return A.bankruptCompany(w, rng, rng.pick(pool), src.id, false, 'Starved of credit during the downturn');
  },
  'crash.markets': (w, rng, src) => {
    const global = !!src.data?.global; const cid = src.actors[0]?.id;
    createEvent(w, {
      category: 'economic', type: 'market.reaction', severity: 2, causedBy: src.id, title: global ? 'Central banks pledge emergency liquidity' : `${c$(w, cid)?.adjective ?? ''} central bank steps in`,
      description: 'Emergency rate cuts and liquidity lines were announced to halt the sell-off. Traders remain skeptical.', location: cid ? { countryId: cid } : undefined,
      actors: cid ? [ref('country', cid)] : [], effects: [], tags: ['markets', 'economy'], data: { shocks: [global ? { pct: -0.06 } : { countryId: cid, pct: -0.1 }, { commodityId: 'gold', pct: 0.04 }] },
    });
    return null;
  },
  'boom.markets': (w, rng, src) => {
    const global = !!src.data?.global; const cid = src.actors[0]?.id;
    return createEvent(w, {
      category: 'economic', type: 'market.reaction', severity: 2, causedBy: src.id, title: global ? 'Global markets hit record highs' : `${c$(w, cid)?.adjective ?? ''} stocks surge to record`,
      description: 'Indexes closed at all-time highs as the boom drew in retail and institutional investors alike.', location: cid ? { countryId: cid } : undefined,
      actors: cid ? [ref('country', cid)] : [], effects: [], tags: ['markets', 'economy'], data: { shocks: [global ? { pct: 0.05 } : { countryId: cid, pct: 0.08 }] },
    });
  },
  'energy.markets': (w, rng, src) => createEvent(w, {
    category: 'economic', type: 'market.reaction', severity: 3, causedBy: src.id, title: 'Oil and gas prices spike on energy crisis',
    description: 'Energy producers rallied while airlines, shipping and manufacturing sold off as fuel costs exploded.', actors: [], effects: [], tags: ['markets', 'energy'],
    data: { shocks: [{ commodityId: 'oil', pct: 0.25 }, { commodityId: 'gas', pct: 0.35 }, { sector: 'energy', pct: 0.1 }, { sector: 'transport', pct: -0.1 }, { sector: 'manufacturing', pct: -0.05 }] },
  }),
  'energy.politics': (w, rng, src) => {
    const c = rng.pickWeighted(Object.values(w.countries), (x) => 100 - x.resources.oil);
    return A.shiftOpinion(w, rng, c, -rng.float(8, 18), src.id, false, 'Blackouts and fuel rationing');
  },
  // ---- Technology chains ----
  'tech.market-reaction': (w, rng, src) => {
    const co = src.actors.find((a) => a.kind === 'company'); const c = c$(w, src.actors.find((a) => a.kind === 'country')?.id);
    const field = String(src.data?.field ?? 'technology');
    const sector = (src.data?.sector as Sector | undefined) ?? (field.includes('batter') || field.includes('fusion') || field.includes('fuel') ? 'energy' : field.includes('gene') || field.includes('longevity') ? 'biotech' : 'technology');
    const mag = Number(src.data?.magnitude ?? 1);
    const rivals = Object.values(w.companies).filter((x) => x.alive && x.sector === sector && x.id !== co?.id);
    const rival = rivals.length ? rng.pickWeighted(rivals, (x) => x.value) : null;
    return createEvent(w, {
      category: 'economic', type: 'market.reaction', severity: mag >= 2 ? 4 : 3, causedBy: src.id,
      title: `${field.charAt(0).toUpperCase() + field.slice(1)} breakthrough reshuffles the ${sector} sector`,
      description: `Investors piled into ${co ? w.companies[co.id]?.name : `${c?.adjective ?? ''} ${sector} firms`} while incumbents ${rival ? `such as ${rival.name}` : ''} fell sharply as analysts priced in disruption. ${mag >= 2 ? 'Commodity markets convulsed.' : ''}`,
      location: c ? { countryId: c.id } : undefined, actors: [...(co ? [co] : []), ...(rival ? [ref('company', rival.id)] : [])], effects: rival ? [fx('company', rival.id, 'value%', -12 * mag), fx('company', rival.id, 'growth', -2)] : [],
      tags: ['markets', sector, field.replace(/\s+/g, '-')],
      data: { shocks: [{ sector, pct: 0.04 * mag }, ...(sector === 'energy' ? [{ commodityId: 'oil', pct: -0.08 * mag }, { commodityId: 'lithium', pct: field.includes('batter') ? 0.15 * mag : 0 }] : []), ...(sector === 'technology' ? [{ commodityId: 'compute', pct: 0.1 * mag }] : [])] },
    });
  },
  'tech.government-interest': (w, rng, src) => {
    const c = c$(w, src.actors.find((a) => a.kind === 'country')?.id);
    const co = src.actors.find((a) => a.kind === 'company');
    if (!c) return null;
    const others = Object.values(w.countries).filter((x) => x.id !== c.id);
    const rival = rng.pickWeighted(others, (x) => Math.max(1, -(c.relations[x.id] ?? 0)) + x.technology / 5);
    const field = String(src.data?.field ?? 'technology');
    A.setRelation(w, c, rival, -8);
    return createEvent(w, {
      category: 'political', type: 'tech.strategic', severity: 3, causedBy: src.id,
      title: `${c.name} classifies ${field} technology as strategic`,
      description: `The ${c.adjective} government moved to restrict exports of the new ${field} technology${co ? ` developed by ${w.companies[co.id]?.name}` : ''}, citing national security. ${rival.name} denounced the move as "technological blackmail".`,
      location: { countryId: c.id }, actors: [ref('country', c.id), ref('country', rival.id), ...(co ? [co] : [])], effects: [fx('country', c.id, 'military', 3), fx('country', c.id, 'technology', 1)], tags: ['technology', 'geopolitics', c.code, rival.code],
    });
  },
  'tech.diffusion': (w, rng, src) => {
    const c = c$(w, src.actors.find((a) => a.kind === 'country')?.id);
    if (!c) return null;
    const partners = [...c.tradePartners, ...c.alliances].map((id) => w.countries[id]).filter(Boolean);
    if (!partners.length) return null;
    for (const p of partners) p.technology = clamp(p.technology + 1, 0, 100);
    const field = String(src.data?.field ?? 'technology');
    return createEvent(w, {
      category: 'technological', type: 'tech.diffusion', severity: 2, causedBy: src.id,
      title: `${field.charAt(0).toUpperCase() + field.slice(1)} technology spreads to ${c.adjective} partners`,
      description: `Licensing deals brought the ${field} breakthrough to ${partners.slice(0, 3).map((p) => p.name).join(', ')}${partners.length > 3 ? ' and others' : ''}, lifting productivity across the bloc.`,
      location: { countryId: c.id }, actors: [ref('country', c.id), ...partners.slice(0, 3).map((p) => ref('country', p.id))], effects: partners.map((p) => fx('country', p.id, 'gdpGrowth', 0.3)), tags: ['technology', c.code],
    });
  },
  'tech.competitor-response': (w, rng, src) => {
    const co = src.actors.find((a) => a.kind === 'company');
    const sector = (src.data?.sector as Sector | undefined) ?? 'technology';
    const rivals = Object.values(w.companies).filter((x) => x.alive && x.sector === sector && x.id !== co?.id && x.value > 5);
    if (!rivals.length) return null;
    const r = rng.pickWeighted(rivals, (x) => x.value);
    const field = String(src.data?.field ?? 'technology');
    return createEvent(w, {
      category: 'corporate', type: 'corporate.pivot', severity: 2, causedBy: src.id,
      title: `${r.name} announces $${rng.int(2, 40)}B ${field} crash program`,
      description: `Rattled by ${co ? w.companies[co.id]?.name + "'s" : 'the recent'} breakthrough, ${r.name} CEO ${w.people[r.ceoId]?.name ?? ''} pledged to "catch up or die trying". Poaching of engineers has already begun.`,
      location: { cityId: r.cityId }, actors: [ref('company', r.id), ref('person', r.ceoId)], effects: [fx('company', r.id, 'value%', 3), fx('company', r.id, 'growth', 2)], tags: ['corporate', sector],
    });
  },
  'tech.scientist-fame': (w, rng, src) => {
    const p = src.actors.find((a) => a.kind === 'person');
    const person = p ? w.people[p.id] : undefined;
    if (!person) return null;
    person.objective = rng.pick(['found a company around the breakthrough', 'win the highest prize', 'enter public life']);
    return createEvent(w, {
      category: 'personal', type: 'person.rise', severity: 2, causedBy: src.id,
      title: `${person.name} becomes the face of the ${String(src.data?.field ?? 'tech')} revolution`,
      description: `Magazine covers, keynote invitations and political overtures: ${person.name} is now one of the most talked-about figures in ${w.countries[person.countryId]?.name}.`,
      location: { cityId: person.cityId }, actors: [ref('person', person.id)], effects: [fx('person', person.id, 'fame', 15), fx('person', person.id, 'wealth', 20)], tags: ['people', 'science'],
    });
  },
  // ---- Disaster chain ----
  'disaster.aid': (w, rng, src) => {
    const c = c$(w, src.actors.find((a) => a.kind === 'country')?.id);
    if (!c) return null;
    const donors = [...c.alliances, ...c.tradePartners].map((id) => w.countries[id]).filter(Boolean);
    const donor = donors.length ? rng.pickWeighted(donors, (x) => x.gdp) : rng.pickWeighted(Object.values(w.countries).filter((x) => x.id !== c.id), (x) => x.gdp);
    A.setRelation(w, c, donor, 10);
    return createEvent(w, {
      category: 'diplomatic', type: 'aid', severity: 2, causedBy: src.id,
      title: `${donor.name} sends emergency aid to ${c.name}`,
      description: `Cargo planes carrying medical teams and supplies from ${donor.name} landed in ${A.capitalOf(w, c).name}. ${rng.pick(['Relief agencies say it is not enough.', 'The gesture was widely praised.', 'Critics call it a soft-power play.'])}`,
      location: { countryId: c.id }, actors: [ref('country', donor.id), ref('country', c.id)], effects: [fx('country', c.id, 'stability', 2), fx('country', donor.id, 'approval', 1)], tags: ['aid', 'diplomacy', c.code, donor.code],
    });
  },
  'disaster.blame': (w, rng, src) => {
    const c = c$(w, src.actors.find((a) => a.kind === 'country')?.id);
    if (!c || rng.next() > 0.6) return null;
    return A.shiftOpinion(w, rng, c, -rng.float(5, 14), src.id, false, `The slow response to the ${String(src.data?.kind ?? 'disaster')}`);
  },
  'disaster.markets': (w, rng, src) => {
    const c = c$(w, src.actors.find((a) => a.kind === 'country')?.id);
    if (!c) return null;
    const kind = String(src.data?.kind);
    createEvent(w, {
      category: 'economic', type: 'market.reaction', severity: 2, causedBy: src.id, title: `Insurers hit as ${kind} losses mount in ${c.name}`,
      description: `Damage estimates from the ${kind} exceed $${rng.int(2, 80)}B. Insurance and construction stocks moved sharply.`, location: { countryId: c.id }, actors: [ref('country', c.id)], effects: [], tags: ['markets', 'disaster', c.code],
      data: { shocks: [{ sector: 'finance', countryId: c.id, pct: -0.05 }, { sector: 'construction', countryId: c.id, pct: 0.06 }, ...(kind === 'drought' ? [{ commodityId: 'grain', pct: 0.12 }] : [])] },
    });
    return null;
  },
  // ---- Epidemic chain ----
  'epidemic.spread': (w, rng, src) => {
    const c = c$(w, src.actors.find((a) => a.kind === 'country')?.id);
    if (!c) return null;
    if (src.data?.pandemic) return null;
    const spread = rng.next() < 0.25 + (100 - c.technology) / 400;
    if (!spread) return createEvent(w, {
      category: 'health', type: 'outbreak.contained', severity: 2, causedBy: src.id, title: `${String(src.data?.pathogen)} outbreak contained in ${c.name}`,
      description: `Health officials declared the outbreak over after ${rng.int(3, 12)} weeks of quarantine measures. Praise for the response lifted the government.`, location: { countryId: c.id }, actors: [ref('country', c.id)],
      effects: [fx('country', c.id, 'approval', 4), fx('country', c.id, 'happiness', 2)], tags: ['health', c.code],
    });
    if (rng.next() < 0.3) return A.epidemic(w, rng, c, src.id, false, true);
    const nb = c.neighbors.map((id) => w.countries[id]).filter(Boolean);
    if (!nb.length) return null;
    return A.epidemic(w, rng, rng.pick(nb), src.id);
  },
  'pandemic.vaccine': (w, rng, src) => {
    const cos = Object.values(w.companies).filter((x) => x.alive && (x.sector === 'biotech' || x.sector === 'health'));
    if (!cos.length) return null;
    const co = rng.pickWeighted(cos, (x) => x.value);
    const c = w.countries[co.countryId];
    for (const x of Object.values(w.countries)) { x.happiness = clamp(x.happiness + 5, 0, 100); x.gdpGrowth += 1.5; }
    return createEvent(w, {
      category: 'scientific', type: 'vaccine', severity: 4, causedBy: src.id, title: `${co.name} vaccine ends the ${String(src.data?.pathogen)} pandemic`,
      description: `Mass vaccination with ${co.name}'s shot has broken the pandemic. ${c?.name} is being hailed as the country that saved the world, and ${w.people[co.ceoId]?.name ?? 'its CEO'} as a hero.`,
      location: { cityId: co.cityId }, actors: [ref('company', co.id), ref('person', co.ceoId), ref('country', co.countryId)], effects: [fx('company', co.id, 'value%', 60), fx('person', co.ceoId, 'fame', 30), fx('country', co.countryId, 'approval', 8)], tags: ['health', 'science', 'global'], historic: true,
      data: { shocks: [{ pct: 0.06 }, { sector: 'biotech', pct: 0.15 }, { sector: 'transport', pct: 0.1 }] },
    });
  },
  // ---- Scandal chain ----
  'scandal.fallout': (w, rng, src) => {
    const p = src.actors.find((a) => a.kind === 'person'); const person = p ? w.people[p.id] : undefined;
    if (!person || !person.alive) return null;
    const c = w.countries[person.countryId];
    const isLeader = c?.leaderId === person.id;
    const survives = rng.next() < 0.45 + person.personality.charisma * 0.3 - (isLeader ? (100 - c.approval) / 300 : 0);
    if (survives) return createEvent(w, {
      category: 'political', type: 'scandal.survived', severity: 2, causedBy: src.id, title: `${person.name} weathers the scandal`,
      description: `Despite weeks of headlines, ${person.name} ${rng.pick(['kept the support of key allies', 'rode out the storm', 'turned the story into an attack on the media'])}. The accusations remain unresolved.`,
      location: { cityId: person.cityId }, actors: [ref('person', person.id)], effects: [fx('person', person.id, 'reputation', 10)], tags: ['scandal'],
    });
    if (isLeader && c) return A.changeLeader(w, rng, c, 'resignation', src.id);
    person.influence = clamp(person.influence - 20, 0, 100);
    if (person.affiliations.length) { const co = w.companies[person.affiliations[0]]; if (co && co.ceoId === person.id) { co.reputation = clamp(co.reputation - 15, -100, 100); const fam = A.familyOf(w, c); const newCeo = A.peopleOf(w, c.id, 'executive').find((x) => x.id !== person.id && x.affiliations.length === 0); if (newCeo) { co.ceoId = newCeo.id; newCeo.affiliations.push(co.id); newCeo.title = 'CEO'; } void fam; } }
    return createEvent(w, {
      category: 'personal', type: 'downfall', severity: 3, causedBy: src.id, title: `${person.name} steps down in disgrace`,
      description: `${person.name} resigned from all positions after the scandal became untenable. ${rng.pick(['A criminal investigation is underway.', 'Former allies are distancing themselves.', 'The fall from grace was swift.'])}`,
      location: { cityId: person.cityId }, actors: [ref('person', person.id)], effects: [fx('person', person.id, 'wealth%', -30), fx('person', person.id, 'fame', 5)], tags: ['scandal', 'downfall'],
    });
  },
  // ---- Protest chain ----
  'protest.escalation': (w, rng, src) => {
    const c = c$(w, src.actors.find((a) => a.kind === 'country')?.id);
    if (!c) return null;
    if (c.unrest > 65 && c.stability < 40 && rng.bool(0.5)) return A.changeLeader(w, rng, c, 'revolution', src.id);
    if (c.freedom < 40 && rng.bool(0.5)) {
      return createEvent(w, {
        category: 'political', type: 'crackdown', severity: 3, causedBy: src.id, title: `Security forces crush protests in ${c.name}`,
        description: `Live ammunition and mass arrests ended the demonstrations. Human rights groups report ${rng.int(10, 400)} dead. The world's response has been ${rng.pick(['muted', 'furious', 'divided'])}.`,
        location: { countryId: c.id }, actors: [ref('country', c.id)], effects: [fx('country', c.id, 'unrest', -12), fx('country', c.id, 'freedom', -8), fx('country', c.id, 'stability', 3), fx('country', c.id, 'happiness', -6)], tags: ['repression', c.code],
      });
    }
    if (rng.bool(0.4)) return createEvent(w, {
      category: 'political', type: 'concession', severity: 2, causedBy: src.id, title: `${c.name} government concedes to protesters`,
      description: `${A.leaderOf(w, c)?.name ?? 'The government'} announced ${rng.pick(['a cabinet reshuffle', 'price controls', 'early elections', 'an anti-corruption commission'])} to calm the streets.`,
      location: { countryId: c.id }, actors: [ref('country', c.id)], effects: [fx('country', c.id, 'unrest', -10), fx('country', c.id, 'approval', 3), fx('country', c.id, 'freedom', 3)], tags: ['politics', c.code],
    });
    return null;
  },
  // ---- Movement chain ----
  'movement.growth': (w, rng, src) => {
    const o = src.actors.find((a) => a.kind === 'organization'); const org = o ? w.organizations[o.id] : undefined;
    const c = c$(w, org?.countryId ?? undefined);
    if (!org || !c || !org.alive) return null;
    org.support = clamp(org.support + rng.float(-5, 15) + c.unrest / 10, 0, 100);
    if (org.support > 45 && rng.bool(0.4)) {
      const leader = org.leaderId ? w.people[org.leaderId] : undefined;
      if (leader && c.electionEvery && rng.bool(0.5)) { leader.profession = 'politician'; leader.objective = 'win the next election'; }
      return createEvent(w, {
        category: 'social', type: 'movement.surge', severity: 3, causedBy: src.id, title: `${org.name} becomes a national force in ${c.name}`,
        description: `Polls show ${org.support.toFixed(0)}% of ${c.adjective} citizens now back ${org.name}. ${leader ? `${leader.name} is being discussed as a future leader.` : ''}`,
        location: { countryId: c.id }, actors: [ref('organization', org.id), ref('country', c.id), ...(leader ? [ref('person', leader.id)] : [])], effects: [fx('organization', org.id, 'influence', 15), fx('country', c.id, 'polarization', 6), ...(leader ? [fx('person', leader.id, 'influence', 15), fx('person', leader.id, 'fame', 15)] : [])], tags: ['movement', c.code],
      });
    }
    return null;
  },
  // ---- Company chain ----
  'bankrupt.layoffs': (w, rng, src) => {
    const c = c$(w, src.actors.find((a) => a.kind === 'country')?.id);
    if (!c) return null;
    const city = w.cities[(src.location.cityId ?? c.capitalId)];
    return createEvent(w, {
      category: 'social', type: 'protest', severity: 2, causedBy: src.id, title: `Laid-off workers protest in ${city?.name ?? c.name}`,
      description: `Former employees of the collapsed firm blocked roads demanding severance and government intervention.`, location: { cityId: city?.id }, actors: [ref('country', c.id)], effects: [fx('country', c.id, 'unrest', 2), fx('country', c.id, 'approval', -1)], tags: ['protest', 'economy', c.code],
    });
  },
  'startup.progress': (w, rng, src) => {
    const co = src.actors.find((a) => a.kind === 'company'); const company = co ? w.companies[co.id] : undefined;
    if (!company || !company.alive) return null;
    const founder = w.people[company.founderId ?? company.ceoId];
    const success = rng.next() < 0.35 + (founder?.personality.ambition ?? 0.5) * 0.25 + (w.countries[company.countryId]?.technology ?? 50) / 400;
    if (!success) { if (rng.bool(0.5)) return A.bankruptCompany(w, rng, company, src.id, false, 'Out of runway'); return null; }
    company.value *= rng.float(3, 12); company.publicListed = company.value > 2; company.growth += 8; company.employees = Math.round(company.employees * 3);
    if (founder) { founder.wealth += company.value * 300; founder.fame = clamp(founder.fame + 15, 0, 100); founder.influence = clamp(founder.influence + 8, 0, 100); }
    const ev = createEvent(w, {
      category: 'corporate', type: 'startup.success', severity: company.value > 20 ? 3 : 2, causedBy: src.id, title: `${company.name} valued at $${company.value.toFixed(1)}B in blockbuster funding round`,
      description: `${founder?.name ?? 'The founders'}' ${company.sector} startup ${company.name} closed a round that makes it one of the fastest-growing companies in ${w.countries[company.countryId]?.name}.`,
      location: { cityId: company.cityId }, actors: [ref('company', company.id), ...(founder ? [ref('person', founder.id)] : [])], effects: [], tags: ['startup', company.sector],
    });
    if (rng.bool(0.4)) schedule(w, 'startup.progress', ev.id, rng.int(120, 400));
    return ev;
  },
  'alliance.trade': (w, rng, src) => {
    const [a, b] = src.actors.filter((x) => x.kind === 'country').map((x) => w.countries[x.id]);
    if (!a || !b) return null;
    return createEvent(w, {
      category: 'economic', type: 'trade.deal', severity: 2, causedBy: src.id, title: `${a.name} and ${b.name} sign free-trade agreement`,
      description: `Building on their new alliance, ${a.name} and ${b.name} eliminated tariffs on most goods. Exporters cheered; some domestic industries fear competition.`,
      location: { countryId: a.id }, actors: [ref('country', a.id), ref('country', b.id)], effects: [fx('country', a.id, 'gdpGrowth', 0.5), fx('country', b.id, 'gdpGrowth', 0.5)], tags: ['trade', a.code, b.code],
    });
  },
  'tension.arms-race': (w, rng, src) => {
    const [a, b] = src.actors.filter((x) => x.kind === 'country').map((x) => w.countries[x.id]);
    if (!a || !b || (a.relations[b.id] ?? 0) > -40) return null;
    return createEvent(w, {
      category: 'military', type: 'military.buildup', severity: 2, causedBy: src.id, title: `${a.name} announces record defense budget amid tensions with ${b.name}`,
      description: `The ${a.adjective} parliament approved a ${rng.int(15, 60)}% increase in military spending. ${b.name} called it "preparation for aggression".`,
      location: { countryId: a.id }, actors: [ref('country', a.id), ref('country', b.id)], effects: [fx('country', a.id, 'military', 5), fx('country', a.id, 'debt', 3), fx('country', b.id, 'military', 2)], tags: ['military', a.code, b.code], data: { shocks: [{ sector: 'defense', countryId: a.id, pct: 0.08 }] },
    });
  },
  'assassination.crisis': (w, rng, src) => {
    const c = c$(w, src.actors.find((a) => a.kind === 'country')?.id);
    if (!c) return null;
    const suspects = Object.values(w.countries).filter((x) => x.id !== c.id && (c.relations[x.id] ?? 0) < -30);
    if (suspects.length && rng.bool(0.5)) { const s = rng.pick(suspects); return A.shiftTension(w, rng, c, s, 35, src.id, false, `Evidence linking ${s.adjective} agents to the assassination`); }
    return createEvent(w, {
      category: 'political', type: 'martial-law', severity: 3, causedBy: src.id, title: `${c.name} declares state of emergency after assassination`,
      description: `Troops are on the streets of ${A.capitalOf(w, c).name} and a nationwide manhunt is underway.`, location: { countryId: c.id }, actors: [ref('country', c.id)], effects: [fx('country', c.id, 'freedom', -6), fx('country', c.id, 'unrest', -4)], tags: ['security', c.code],
    });
  },
  'independence.recognition': (w, rng, src) => {
    const [nc, parent] = src.actors.filter((x) => x.kind === 'country').map((x) => w.countries[x.id]);
    if (!nc || !parent) return null;
    const recog = Object.values(w.countries).filter((x) => x.id !== nc.id && x.id !== parent.id && (parent.relations[x.id] ?? 0) < 20);
    if (recog.length && rng.bool(0.6)) { const r = rng.pick(recog); A.setRelation(w, nc, r, 40); if (!r.alliances.includes(nc.id) && rng.bool(0.3)) return A.formAlliance(w, rng, r, nc, src.id); return createEvent(w, { category: 'diplomatic', type: 'recognition', severity: 2, causedBy: src.id, title: `${r.name} recognizes ${nc.name}`, description: `${r.name} became the first state to formally recognize ${nc.name}, infuriating ${parent.name}.`, location: { countryId: nc.id }, actors: [ref('country', r.id), ref('country', nc.id), ref('country', parent.id)], effects: [fx('country', nc.id, 'stability', 5)], tags: ['diplomacy', nc.code] }); }
    if (rng.bool(0.4)) return A.declareWar(w, rng, parent, nc, src.id, false, 'the illegal secession');
    return null;
  },
  'migration.politics': (w, rng, src) => {
    const to = c$(w, src.actors[1]?.id);
    if (!to) return null;
    if (rng.bool(0.5)) return A.createMovement(w, rng, to, src.id, false, 'nationalist', undefined, 'stop the migration wave');
    return A.shiftOpinion(w, rng, to, -rng.float(4, 10), src.id, false, 'The handling of the migration wave');
  },
  'resource.investment': (w, rng, src) => {
    const c = c$(w, src.actors[0]?.id);
    if (!c) return null;
    const resource = String(src.data?.resource ?? 'minerals');
    const sector: Sector = resource === 'oil' ? 'energy' : resource === 'water' ? 'agriculture' : 'mining';
    const cos = Object.values(w.companies).filter((x) => x.alive && x.sector === sector);
    const co = cos.length ? rng.pickWeighted(cos, (x) => x.value) : null;
    if (co && w.countries[co.countryId]) A.setRelation(w, c, w.countries[co.countryId], 8);
    return createEvent(w, {
      category: 'corporate', type: 'investment', severity: 2, causedBy: src.id, title: co ? `${co.name} wins rights to ${c.adjective} ${resource} fields` : `Investment rush into ${c.name}`,
      description: `${co ? `${co.name} signed a $${rng.int(2, 50)}B deal` : 'Foreign firms signed deals'} to develop the newly discovered reserves. Critics warn of a "resource curse".`,
      location: { countryId: c.id }, actors: [ref('country', c.id), ...(co ? [ref('company', co.id)] : [])], effects: [fx('country', c.id, 'gdp', c.gdp * 0.03), ...(co ? [fx('company', co.id, 'value%', 10)] : [])], tags: ['resources', c.code],
    });
  },
};

Object.assign(CONSEQUENCE_RULES, {
  'secession.referendum': (w: World, rng: RNG, src: WorldEvent) => {
    const c = c$(w, src.actors.find((a) => a.kind === 'country')?.id);
    const org = src.actors.find((a) => a.kind === 'organization'); const o = org ? w.organizations[org.id] : undefined;
    if (!c || !o || !o.alive) return null;
    if (o.support < 30 || c.stability > 60) { if (rng.bool(0.5)) schedule(w, 'secession.referendum', src.id, rng.int(120, 300)); return null; }
    if (rng.bool(0.5)) return A.createCountry(w, rng, c, src.id, false);
    return createEvent(w, { category: 'political', type: 'referendum.blocked', severity: 3, causedBy: src.id, title: `${c.name} bans independence referendum`, description: `The ${c.adjective} government declared the separatist vote illegal and deployed police to polling stations. ${o.name} vowed to continue.`, location: { countryId: c.id }, actors: [ref('country', c.id), ref('organization', o.id)], effects: [fx('country', c.id, 'unrest', 10), fx('country', c.id, 'freedom', -5), fx('organization', o.id, 'support', 8)], tags: ['secession', c.code] });
  },
  'succession.crisis': (w: World, rng: RNG, src: WorldEvent) => {
    const c = c$(w, src.actors.find((a) => a.kind === 'country')?.id);
    if (!c || !['monarchy', 'autocracy', 'oligarchy', 'theocracy'].includes(c.government)) return null;
    const claimants = A.peopleOf(w, c.id).filter((p) => p.id !== c.leaderId && (p.profession === 'politician' || p.profession === 'general'));
    if (!claimants.length) return null;
    const rival = rng.pickWeighted(claimants, (p) => p.influence + p.personality.ambition * 40);
    if (rng.next() < 0.35 + rival.personality.ambition * 0.3) return A.changeLeader(w, rng, c, rival.profession === 'general' ? 'coup' : 'succession', src.id, false, rival);
    return createEvent(w, { category: 'political', type: 'succession.dispute', severity: 3, causedBy: src.id, title: `Succession dispute shakes ${c.name}`, description: `${rival.name} refused to recognize the new ${w.people[c.leaderId]?.title ?? 'ruler'} of ${c.name}, claiming a stronger right to rule. Factions are forming.`, location: { countryId: c.id }, actors: [ref('country', c.id), ref('person', rival.id), ref('person', c.leaderId)], effects: [fx('country', c.id, 'stability', -8), fx('country', c.id, 'polarization', 8), fx('person', rival.id, 'influence', 8)], tags: ['succession', c.code] });
  },
  'space.race': (w: World, rng: RNG, src: WorldEvent) => {
    const c = c$(w, src.actors.find((a) => a.kind === 'country')?.id);
    if (!c) return null;
    const rivals = Object.values(w.countries).filter((x) => x.id !== c.id && x.technology > 60);
    if (!rivals.length) return null;
    const r = rng.pickWeighted(rivals, (x) => x.technology + Math.max(0, -(c.relations[x.id] ?? 0)));
    return createEvent(w, { category: 'technological', type: 'space.program', severity: 3, causedBy: src.id, title: `${r.name} announces crash space program to answer ${c.name}`, description: `Stung by ${c.adjective} success, ${r.name} pledged a decade of funding for its own deep-space ambitions. "We will not be spectators," said ${w.people[r.leaderId]?.name ?? 'the leader'}.`, location: { countryId: r.id }, actors: [ref('country', r.id), ref('country', c.id)], effects: [fx('country', r.id, 'technology', 2), fx('country', r.id, 'debt', 3), fx('country', r.id, 'approval', 2)], tags: ['space', r.code, c.code], data: { shocks: [{ sector: 'aerospace', countryId: r.id, pct: 0.1 }] } });
  },
  'automation.politics': (w: World, rng: RNG, src: WorldEvent) => {
    const c = c$(w, src.actors.find((a) => a.kind === 'country')?.id);
    if (!c) return null;
    const roll = rng.next();
    if (roll < 0.35) return A.createMovement(w, rng, c, src.id, false, 'socialist', undefined, 'tax the machines and share the gains');
    if (roll < 0.7) return createEvent(w, { category: 'political', type: 'policy', severity: 2, causedBy: src.id, title: `${c.name} introduces universal basic dividend`, description: `Facing automation-driven unemployment, ${A.leaderOf(w, c)?.name ?? 'the government'} signed a universal dividend funded by a levy on autonomous systems. Tech firms threatened to relocate.`, location: { countryId: c.id }, actors: [ref('country', c.id)], effects: [fx('country', c.id, 'happiness', 6), fx('country', c.id, 'unrest', -5), fx('country', c.id, 'debt', 6), fx('country', c.id, 'polarization', -3)], tags: ['policy', 'automation', c.code], data: { policy: 'universal dividend', shocks: [{ sector: 'technology', countryId: c.id, pct: -0.05 }] } });
    return createEvent(w, { category: 'political', type: 'regulation', severity: 3, causedBy: src.id, title: `${c.name} passes sweeping AI regulation`, description: `Parliament in ${c.name} imposed licensing, audits and liability on autonomous systems after the automation shock. Startups called it a death sentence; unions celebrated.`, location: { countryId: c.id }, actors: [ref('country', c.id)], effects: [fx('country', c.id, 'technology', -2), fx('country', c.id, 'unrest', -4), fx('country', c.id, 'approval', 3)], tags: ['regulation', 'ai', c.code], data: { shocks: [{ sector: 'technology', countryId: c.id, pct: -0.08 }] } });
  },
  'coup.sanctions': (w: World, rng: RNG, src: WorldEvent) => {
    const c = c$(w, src.actors.find((a) => a.kind === 'country')?.id);
    if (!c) return null;
    const democracies = Object.values(w.countries).filter((x) => x.id !== c.id && x.freedom > 60 && (x.gdp > c.gdp * 0.5));
    if (!democracies.length) return null;
    const lead = rng.pickWeighted(democracies, (x) => x.gdp);
    const bloc = [lead, ...democracies.filter((x) => x.id !== lead.id && lead.alliances.includes(x.id))].slice(0, 4);
    for (const d of bloc) { A.setRelation(w, d, c, -20); d.tradePartners = d.tradePartners.filter((t) => t !== c.id); c.tradePartners = c.tradePartners.filter((t) => t !== d.id); }
    return createEvent(w, { category: 'diplomatic', type: 'sanctions', severity: 3, causedBy: src.id, title: `${lead.name}${bloc.length > 1 ? ' and allies' : ''} impose sanctions on ${c.name}`, description: `Citing the unconstitutional seizure of power, ${bloc.map((x) => x.name).join(', ')} froze assets and cut trade with ${c.name}. The junta called it "colonial arrogance".`, location: { countryId: c.id }, actors: [ref('country', lead.id), ref('country', c.id)], effects: [fx('country', c.id, 'gdpGrowth', -2), fx('country', c.id, 'inflation', 4), fx('country', c.id, 'unrest', 5), fx('country', c.id, 'approval', 3)], tags: ['sanctions', 'diplomacy', c.code, lead.code], data: { shocks: [{ countryId: c.id, pct: -0.08 }] } });
  },
  'tech.startups': (w: World, rng: RNG, src: WorldEvent) => {
    const c = c$(w, src.actors.find((a) => a.kind === 'country')?.id);
    if (!c) return null;
    const sector = (src.data?.sector as Sector | undefined) ?? 'technology';
    const ev = A.foundCompany(w, rng, c, sector, src.id, false, undefined, undefined, `${String(src.data?.field ?? sector)} applications`);
    ev.description += ` The founders say the recent ${String(src.data?.field ?? sector)} breakthrough made the venture possible.`;
    return ev;
  },
  'disaster.reconstruction': (w: World, rng: RNG, src: WorldEvent) => {
    const c = c$(w, src.actors.find((a) => a.kind === 'country')?.id); const city = src.location.cityId ? w.cities[src.location.cityId] : undefined;
    if (!c) return null;
    const cos = Object.values(w.companies).filter((x) => x.alive && x.sector === 'construction');
    const co = cos.length ? rng.pickWeighted(cos, (x) => x.value) : null;
    return createEvent(w, { category: 'economic', type: 'reconstruction', severity: 2, causedBy: src.id, title: `${city?.name ?? c.name} rebuilds after the ${String(src.data?.kind ?? 'disaster')}`, description: `${co ? `${co.name} won the main contract as` : 'As'} reconstruction of ${city?.name ?? c.name} began. Cranes fill the skyline; ${rng.pick(['survivors are returning', 'critics question where the money went', 'the new district is planned to be disaster-proof'])}.`, location: { cityId: city?.id, countryId: c.id }, actors: [ref('country', c.id), ...(co ? [ref('company', co.id)] : [])], effects: [fx('country', c.id, 'gdpGrowth', 0.8), fx('country', c.id, 'approval', 3), ...(city ? [fx('city', city.id, 'prosperity', 6)] : []), ...(co ? [fx('company', co.id, 'value%', 8)] : [])], tags: ['reconstruction', c.code], data: { shocks: [{ sector: 'construction', countryId: c.id, pct: 0.06 }] } });
  },
  'bankrupt.assets': (w: World, rng: RNG, src: WorldEvent) => {
    const dead = src.actors.find((a) => a.kind === 'company'); const d = dead ? w.companies[dead.id] : undefined;
    if (!d) return null;
    const buyers = Object.values(w.companies).filter((x) => x.alive && x.sector === d.sector && x.id !== d.id);
    if (!buyers.length) return null;
    const b = rng.pickWeighted(buyers, (x) => x.value);
    b.employees += Math.round(d.employees * 0.3); b.revenue += d.revenue * 0.2;
    return createEvent(w, { category: 'corporate', type: 'acquisition', severity: 2, causedBy: src.id, title: `${b.name} picks up the pieces of ${d.name}`, description: `${b.name} bought ${d.name}'s ${rng.pick(['factories', 'patents', 'customer base', 'best engineers'])} out of bankruptcy for cents on the dollar.`, location: { cityId: b.cityId }, actors: [ref('company', b.id), ref('company', d.id)], effects: [fx('company', b.id, 'value%', 5), fx('company', b.id, 'growth', 1)], tags: ['corporate', d.sector] });
  },
  'pandemic.lockdown-protests': (w: World, rng: RNG, src: WorldEvent) => {
    const c = rng.pickWeighted(Object.values(w.countries), (x) => x.polarization + (100 - x.happiness));
    return createEvent(w, { category: 'social', type: 'protest', severity: 2, causedBy: src.id, title: `Anti-lockdown protests spread in ${c.name}`, description: `Months into the pandemic, crowds in ${A.capitalOf(w, c).name} defied restrictions, chanting against "medical tyranny". ${rng.pick(['Police stood back.', 'Clashes left dozens injured.', 'The government blamed foreign disinformation.'])}`, location: { countryId: c.id }, actors: [ref('country', c.id)], effects: [fx('country', c.id, 'polarization', 5), fx('country', c.id, 'unrest', 4), fx('country', c.id, 'approval', -3)], tags: ['protest', 'pandemic', c.code] });
  },
  'espionage.tension': (w: World, rng: RNG, src: WorldEvent) => {
    const [a, b] = src.actors.filter((x) => x.kind === 'country').map((x) => w.countries[x.id]);
    if (!a || !b) return null;
    return A.shiftTension(w, rng, a, b, rng.float(10, 25), src.id, false, 'The corporate espionage affair');
  },
});

interface Trigger { match: (e: WorldEvent) => boolean; rule: string; delay: [number, number]; p: number; }

const TRIGGERS: Trigger[] = [
  { match: (e) => e.type === 'war.declared', rule: 'war.markets', delay: [1, 2], p: 1 },
  { match: (e) => e.type === 'war.declared', rule: 'war.allies-join', delay: [3, 30], p: 0.6 },
  { match: (e) => e.type === 'war.declared', rule: 'war.refugees', delay: [5, 40], p: 0.85 },
  { match: (e) => e.type === 'war.declared', rule: 'war.attrition', delay: [40, 90], p: 1 },
  { match: (e) => e.type === 'war.declared', rule: 'war.antiwar-protest', delay: [7, 40], p: 0.5 },
  { match: (e) => e.type === 'war.ended', rule: 'peace.recovery', delay: [30, 120], p: 0.8 },
  { match: (e) => e.type === 'leader.coup', rule: 'coup.crackdown', delay: [2, 14], p: 0.8 },
  { match: (e) => e.type === 'government.collapse', rule: 'collapse.neighbors-react', delay: [7, 60], p: 0.85 },
  { match: (e) => e.type === 'government.collapse', rule: 'collapse.warlords', delay: [60, 240], p: 0.7 },
  { match: (e) => e.type === 'economy.crisis', rule: 'crisis.unrest', delay: [10, 60], p: 0.8 },
  { match: (e) => e.type === 'economy.crisis', rule: 'crisis.bankruptcies', delay: [15, 90], p: 0.7 },
  { match: (e) => e.type === 'economy.crisis' || e.type === 'economy.crash', rule: 'crash.markets', delay: [1, 3], p: 1 },
  { match: (e) => e.type === 'economy.boom', rule: 'boom.markets', delay: [1, 5], p: 1 },
  { match: (e) => e.type === 'economy.energy-crisis', rule: 'energy.markets', delay: [1, 2], p: 1 },
  { match: (e) => e.type === 'economy.energy-crisis', rule: 'energy.politics', delay: [10, 40], p: 0.9 },
  { match: (e) => e.type === 'tech.breakthrough', rule: 'tech.market-reaction', delay: [1, 3], p: 1 },
  { match: (e) => e.type === 'tech.breakthrough' && e.severity >= 4, rule: 'tech.government-interest', delay: [10, 60], p: 0.75 },
  { match: (e) => e.type === 'tech.breakthrough', rule: 'tech.competitor-response', delay: [5, 40], p: 0.8 },
  { match: (e) => e.type === 'tech.breakthrough' && e.severity >= 4, rule: 'tech.scientist-fame', delay: [7, 30], p: 0.7 },
  { match: (e) => e.type === 'tech.breakthrough', rule: 'tech.diffusion', delay: [120, 400], p: 0.8 },
  { match: (e) => e.type.startsWith('disaster.'), rule: 'disaster.aid', delay: [2, 10], p: 0.85 },
  { match: (e) => e.type.startsWith('disaster.'), rule: 'disaster.blame', delay: [10, 40], p: 0.6 },
  { match: (e) => e.type.startsWith('disaster.') && e.severity >= 4, rule: 'disaster.markets', delay: [1, 3], p: 1 },
  { match: (e) => e.type === 'health.epidemic', rule: 'epidemic.spread', delay: [14, 60], p: 1 },
  { match: (e) => e.type === 'health.pandemic', rule: 'pandemic.vaccine', delay: [120, 400], p: 1 },
  { match: (e) => e.type === 'scandal', rule: 'scandal.fallout', delay: [7, 45], p: 0.9 },
  { match: (e) => e.type === 'protest.mass', rule: 'protest.escalation', delay: [5, 30], p: 0.9 },
  { match: (e) => e.type === 'movement.founded', rule: 'movement.growth', delay: [60, 240], p: 1 },
  { match: (e) => e.type === 'company.bankrupt' && e.severity >= 3, rule: 'bankrupt.layoffs', delay: [3, 20], p: 0.6 },
  { match: (e) => e.type === 'company.founded', rule: 'startup.progress', delay: [90, 400], p: 1 },
  { match: (e) => e.type === 'alliance.formed', rule: 'alliance.trade', delay: [20, 120], p: 0.7 },
  { match: (e) => e.type === 'tension.rise' && e.severity >= 3, rule: 'tension.arms-race', delay: [10, 60], p: 0.6 },
  { match: (e) => e.type === 'death.assassination' && e.severity >= 4, rule: 'assassination.crisis', delay: [1, 7], p: 1 },
  { match: (e) => e.type === 'country.founded', rule: 'independence.recognition', delay: [10, 90], p: 1 },
  { match: (e) => e.type === 'migration.wave' && e.severity >= 3, rule: 'migration.politics', delay: [20, 90], p: 0.8 },
  { match: (e) => e.type === 'resource.discovery', rule: 'resource.investment', delay: [20, 90], p: 0.9 },
  { match: (e) => e.type === 'movement.founded' && e.title.includes('independence'), rule: 'secession.referendum', delay: [120, 400], p: 1 },
  { match: (e) => e.type === 'leader.succession', rule: 'succession.crisis', delay: [10, 60], p: 0.7 },
  { match: (e) => e.type === 'space.milestone', rule: 'space.race', delay: [20, 120], p: 0.8 },
  { match: (e) => e.type === 'espionage', rule: 'espionage.tension', delay: [5, 30], p: 0.6 },
  { match: (e) => e.type === 'automation.shock', rule: 'automation.politics', delay: [20, 120], p: 0.9 },
  { match: (e) => e.type === 'leader.coup', rule: 'coup.sanctions', delay: [7, 40], p: 0.75 },
  { match: (e) => e.type === 'tech.breakthrough' && e.severity >= 4, rule: 'tech.startups', delay: [30, 150], p: 0.8 },
  { match: (e) => e.type.startsWith('disaster.') && e.severity >= 4, rule: 'disaster.reconstruction', delay: [60, 150], p: 0.85 },
  { match: (e) => e.type === 'company.bankrupt' && e.severity >= 3, rule: 'bankrupt.assets', delay: [10, 60], p: 0.7 },
  { match: (e) => e.type === 'health.pandemic', rule: 'pandemic.lockdown-protests', delay: [40, 120], p: 0.9 },
];

/** Schedule follow-ups for a freshly created event. */
export function react(world: World, rng: RNG, ev: WorldEvent): void {
  for (const t of TRIGGERS) {
    if (!t.match(ev)) continue;
    if (rng.next() > t.p) continue;
    schedule(world, t.rule, ev.id, rng.int(t.delay[0], t.delay[1]));
  }
}

/** Run consequence rules that are due today. Returns produced events. */
export function resolvePending(world: World, rng: RNG): WorldEvent[] {
  const out: WorldEvent[] = [];
  const due: PendingConsequence[] = [];
  const rest: PendingConsequence[] = [];
  for (const p of world.pending) (p.dueDay <= world.day ? due : rest).push(p);
  world.pending = rest;
  for (const p of due) {
    const rule = CONSEQUENCE_RULES[p.ruleId];
    const src = world.events.find((e) => e.id === p.sourceEventId);
    if (!rule || !src) continue;
    try {
      const ev = rule(world, rng, src, p.payload ?? {});
      if (ev) { if (!src.consequences.includes(ev.id)) src.consequences.push(ev.id); ev.relatedEvents.push(src.id); out.push(ev); }
    } catch (err) {
      console.warn('[consequence] rule failed', p.ruleId, err);
    }
  }
  return out;
}

/** Extract market shocks carried by events created today. */
export function collectShocks(events: WorldEvent[]): MarketShock[] {
  const out: MarketShock[] = [];
  for (const e of events) {
    const s = e.data?.shocks as MarketShock[] | undefined;
    if (s) out.push(...s);
    // Generic effects: severity-based shock on the country of the event
    if (e.location.countryId && e.severity >= 3 && !s) {
      const neg = ['military', 'environmental', 'criminal', 'health'].includes(e.category) || e.type.includes('collapse') || e.type.includes('crisis') || e.type.includes('scandal') || e.type.includes('coup');
      out.push({ countryId: e.location.countryId, pct: (neg ? -1 : 0.5) * 0.01 * e.severity });
    }
  }
  return out;
}
