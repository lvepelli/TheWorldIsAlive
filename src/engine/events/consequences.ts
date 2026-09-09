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
import { relate } from '../simulation/relations';
import { appointGovernor } from '../generator/world';

export type ConsequenceRule = (world: World, rng: RNG, source: WorldEvent, payload: Record<string, unknown>) => WorldEvent | null | void;

const c$ = (w: World, id?: ID) => (id ? w.countries[id] : undefined);
/** True when a new nation was founded within `days` — used to space secessions out world-wide. */
function recentFounding(w: World, days: number): boolean { for (let i = w.events.length - 1; i >= 0; i--) { const e = w.events[i]; if (w.day - e.day > days) return false; if (e.type === 'country.founded') return true; } return false; }

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
    const allies = person.relationships.filter((r) => r.strength > 0.4 && w.people[r.target.id]?.alive).length;
    const enemies = person.relationships.filter((r) => r.strength < -0.4 && w.people[r.target.id]?.alive).length;
    const survives = rng.next() < 0.45 + person.personality.charisma * 0.3 - (isLeader ? (100 - c.approval) / 300 : 0) + allies * 0.05 - enemies * 0.06;
    if (survives) return createEvent(w, {
      category: 'political', type: 'scandal.survived', severity: 2, causedBy: src.id, title: `${person.name} weathers the scandal`,
      description: `Despite weeks of headlines, ${person.name} ${allies > 0 ? `kept the support of ${allies} key all${allies > 1 ? 'ies' : 'y'}` : rng.pick(['rode out the storm', 'turned the story into an attack on the media'])}. The accusations remain unresolved.`,
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
  // ---- Food crisis chain ----
  'food.riots': (w, rng, src) => {
    const ids = (src.data?.poor as ID[] | undefined) ?? []; const poor = ids.map((id) => w.countries[id]).filter(Boolean);
    if (!poor.length) return null;
    const c = rng.pickWeighted(poor, (x) => x.unrest + 10);
    const city = A.capitalOf(w, c);
    return createEvent(w, {
      category: 'social', type: 'protest.mass', severity: 3, causedBy: src.id,
      title: `Bread riots in ${city?.name ?? c.name}`,
      description: `Crowds ${rng.pick(['stormed markets', 'blocked the port', 'marched on the palace', 'looted grain depots'])} in ${city?.name ?? c.name} as food prices outran wages. ${rng.pick(['Troops fired over their heads.', 'The government promised subsidies by morning.', 'Three ministers resigned.'])}`,
      location: { cityId: city?.id, countryId: c.id }, actors: [ref('country', c.id)],
      effects: [fx('country', c.id, 'unrest', 8), fx('country', c.id, 'stability', -5), fx('country', c.id, 'approval', -6)], tags: ['protest', 'food', c.code],
    });
  },
  'food.aid': (w, rng, src) => {
    const ids = (src.data?.poor as ID[] | undefined) ?? []; const poor = ids.map((id) => w.countries[id]).filter(Boolean);
    const rich = Object.values(w.countries).filter((c) => !ids.includes(c.id)).sort((a, b) => b.gdp - a.gdp).slice(0, 3);
    if (!poor.length || !rich.length) return null;
    const donor = rng.pick(rich); const to = rng.pick(poor);
    A.setRelation(w, donor, to, 8);
    return createEvent(w, {
      category: 'diplomatic', type: 'aid', severity: 2, causedBy: src.id,
      title: `${donor.name} ships emergency grain to ${to.name}`,
      description: `${donor.name} released ${rng.int(2, 9)} million tonnes from strategic reserves for ${to.name} and its neighbours. ${rng.pick(['Critics at home called it charity abroad.', 'The gesture was noticed in every hungry capital.', 'Convoys were escorted by the navy.'])}`,
      location: { countryId: to.id }, actors: [ref('country', donor.id), ref('country', to.id)],
      effects: [fx('country', to.id, 'happiness', 2), fx('country', to.id, 'unrest', -2), fx('country', donor.id, 'approval', 1)], tags: ['aid', 'food', donor.code, to.code],
      data: { shocks: [{ commodityId: 'grain', pct: -0.03 }] as MarketShock[] },
    });
  },
  'food.migration': (w, rng, src) => {
    const ids = (src.data?.poor as ID[] | undefined) ?? []; const poor = ids.map((id) => w.countries[id]).filter(Boolean);
    if (!poor.length) return null;
    const from = rng.pickWeighted(poor, (x) => x.unrest + 10);
    const dest = from.neighbors.map((id) => w.countries[id]).filter((x) => x && !ids.includes(x.id) && !x.atWarWith.includes(from.id));
    if (!dest.length) return null;
    const to = rng.pickWeighted(dest, (x) => x.gdp / Math.max(1, x.population) * 1e6 + x.stability);
    const ev = A.migrationWave(w, rng, from, to, from.population * rng.float(0.003, 0.012), src.id);
    ev.description += ' Hunger, not war, drove them.';
    return ev;
  },
  'food.exportban': (w, rng, src) => {
    const ids = (src.data?.poor as ID[] | undefined) ?? [];
    const exporters = Object.values(w.countries).filter((c) => !ids.includes(c.id) && (c.resources.farmland ?? 50) > 60 && c.tradePartners.length);
    if (!exporters.length) return null;
    const c = rng.pickWeighted(exporters, (x) => (x.resources.farmland ?? 50) + (100 - x.freedom) / 2);
    return A.grainExportBan(w, rng, c, src.id);
  },
  'sea.migration': (w, rng, src) => {
    const c = c$(w, src.location.countryId); const displaced = (src.data?.displaced as number | undefined) ?? 0;
    if (!c || displaced < 200_000) return null;
    const dest = c.neighbors.map((id) => w.countries[id]).filter((x) => x && x.climateRisk < c.climateRisk - 10 && !x.atWarWith.includes(c.id));
    if (!dest.length) return null;
    const to = rng.pickWeighted(dest, (x) => x.stability + x.gdp / 20);
    const ev = A.migrationWave(w, rng, c, to, displaced * rng.float(0.3, 0.6), src.id);
    ev.description += ' They are the first climate migrants the border has seen.';
    return ev;
  },
  // ---- Summits with agendas ----
  // Calendar: a political festival winner can get banned by an unfree host; a fair's headline pair can form a venture or fall out.
  'festival.banned': (w, rng, src) => {
    const host = c$(w, src.data?.host as ID); const maker = src.data?.maker ? w.people[src.data.maker as ID] : undefined;
    if (!host || !maker || host.freedom >= 45 || !src.data?.political) return null;
    const home = w.countries[maker.countryId]; const film = src.data.film as string;
    maker.reputation = clamp(maker.reputation + 6, -100, 100); maker.fame = clamp(maker.fame + 6, 0, 100);
    maker.memories.push({ day: w.day, eventId: src.id, text: `${host.name} banned my film. It sold out everywhere else.`, weight: 0.6 });
    maker.history.push({ day: w.day, text: `Had ${film} banned in ${host.name}.` });
    if (home && home.id !== host.id) { host.relations[home.id] = clamp((host.relations[home.id] ?? 0) - 6, -100, 100); home.relations[host.id] = clamp((home.relations[host.id] ?? 0) - 4, -100, 100); }
    return createEvent(w, {
      category: 'cultural', type: 'festival.banned', severity: 2, causedBy: src.id,
      title: `${host.name} bans the festival winner`,
      description: `Days after the prize, ${host.name}'s censors pulled ${film} from every screen in the country, calling it "an insult to the state". ${maker.name} ${rng.pick(['called it the best review of the year.', 'left the country on the next flight.', 'read the ban aloud at a press conference.'])} ${home && home.id !== host.id ? `${home.name} summoned the ambassador.` : 'Cinemas quietly kept showing it.'}`,
      location: { countryId: host.id }, actors: [ref('country', host.id), ref('person', maker.id), ...(home && home.id !== host.id ? [ref('country', home.id)] : [])],
      effects: [fx('country', host.id, 'freedom', -1), fx('country', host.id, 'unrest', 2), ...(home && home.id !== host.id ? [fx('country', home.id, 'happiness', 1)] : [])], tags: ['culture', 'censorship', host.code],
    });
  },
  'festival.rights': (w, rng, src) => {
    const maker = src.data?.maker ? w.people[src.data.maker as ID] : undefined; if (!maker || !maker.alive) return null;
    const studios = Object.values(w.companies).filter((co) => co.alive && co.sector === 'media'); if (!studios.length) return null;
    const studio = rng.pickWeighted(studios, (co) => co.value + 1); const film = src.data?.film as string;
    studio.value *= 1.04; studio.growth += 1; maker.wealth += 4; maker.history.push({ day: w.day, text: `Sold ${film} to ${studio.name}.` });
    return createEvent(w, {
      category: 'economic', type: 'festival.rights', severity: 2, causedBy: src.id,
      title: `${studio.name} buys ${maker.lastName}'s festival winner`,
      description: `${studio.name} paid a record sum for the rights to ${film}. ${rng.pick(['Its shares rose on the news.', 'Analysts called the price a vanity purchase.', 'The director gets a cut of the sequel.'])}`,
      location: { countryId: studio.countryId, cityId: studio.cityId }, actors: [ref('company', studio.id), ref('person', maker.id)],
      effects: [fx('company', studio.id, 'reputation', 3)], tags: ['culture', 'media', 'business'], data: { shocks: [{ sector: 'media', pct: 0.01 }] },
    });
  },
  'fair.venture': (w, rng, src) => {
    const [a, b] = ((src.data?.deal as ID[] | undefined) ?? []).map((id) => w.companies[id]); if (!a || !b || !a.alive || !b.alive) return null;
    const ca = w.countries[a.countryId], cb = w.countries[b.countryId]; if (!ca || !cb) return null;
    const star = src.data?.star as string;
    const sour = ca.atWarWith.includes(cb.id) || (ca.relations[cb.id] ?? 0) < -40 || rng.bool(0.2);
    if (sour) {
      a.reputation = clamp(a.reputation - 4, -100, 100); b.reputation = clamp(b.reputation - 4, -100, 100);
      return createEvent(w, {
        category: 'economic', type: 'fair.collapse', severity: 2, causedBy: src.id, title: `${a.name}–${b.name} deal collapses`,
        description: `The venture announced at the trade fair fell apart before a single contract was signed. ${rng.pick([`${ca.name}'s regulators objected.`, 'Both sides blamed the other in the press.', 'The engineers never agreed on the standard.'])}`,
        location: { countryId: ca.id, cityId: a.cityId }, actors: [ref('company', a.id), ref('company', b.id)], effects: [fx('company', a.id, 'value', -2), fx('company', b.id, 'value', -2)], tags: ['business', 'trade'],
      });
    }
    a.value *= 1.05; b.value *= 1.05; a.growth += 1.5; b.growth += 1.5;
    if (ca.id !== cb.id) { ca.relations[cb.id] = clamp((ca.relations[cb.id] ?? 0) + 4, -100, 100); cb.relations[ca.id] = clamp((cb.relations[ca.id] ?? 0) + 4, -100, 100); if (!ca.tradePartners.includes(cb.id)) ca.tradePartners.push(cb.id); if (!cb.tradePartners.includes(ca.id)) cb.tradePartners.push(ca.id); }
    return createEvent(w, {
      category: 'economic', type: 'fair.venture', severity: 3, causedBy: src.id, title: `${a.name} and ${b.name} form a joint venture`,
      description: `The pair that dominated the trade fair signed a joint venture to build ${star ?? 'what the fair was talking about'} at scale, with plants in ${w.cities[a.cityId]?.name ?? ca.name} and ${w.cities[b.cityId]?.name ?? cb.name}. ${rng.pick(['Both stocks jumped.', 'Unions asked who gets the jobs.', 'Rivals announced a rival alliance within the week.'])}`,
      location: { countryId: ca.id, cityId: a.cityId }, actors: [ref('company', a.id), ref('company', b.id), ref('country', ca.id), ...(cb.id !== ca.id ? [ref('country', cb.id)] : [])],
      effects: [fx('company', a.id, 'value', 5), fx('company', b.id, 'value', 5), fx('country', ca.id, 'gdpGrowth', 0.1), fx('country', cb.id, 'gdpGrowth', 0.1)], tags: ['business', 'trade', ca.code, cb.code], data: { shocks: [{ sector: a.sector, pct: 0.015 }] },
    });
  },
  // Peace terms: a decisive victory can take a border region from the loser; annexed regions resist.
  'war.annex': (w, rng, src) => {
    const winner = c$(w, src.data?.winner as ID), loser = c$(w, src.data?.loser as ID); if (!winner || !loser) return null;
    if (winner.military < loser.military * 1.15 || (loser.regionIds ?? []).length < 2) return null;
    const regions = (loser.regionIds ?? []).map((id) => w.regions?.[id]).filter((r): r is NonNullable<typeof r> => !!r && !r.cityIds.includes(loser.capitalId));
    if (!regions.length) return null;
    const W = w.geography.width; const wx = (a: number, b: number) => { const d = Math.abs(a - b); return Math.min(d, W - d); };
    const dist = (r: typeof regions[number]) => Math.min(...r.cityIds.map((id) => { const ct = w.cities[id]; return Math.min(...winner.cityIds.map((wid) => { const wc = w.cities[wid]; return wx(ct.x, wc.x) ** 2 + (ct.y - wc.y) ** 2; })); }));
    const target = regions.sort((a, b) => dist(a) - dist(b))[0];
    return A.transferRegion(w, rng, target, winner, src.id, false, `Under the peace terms, ${loser.name} ceded ${target.name} to ${winner.name}`);
  },
  'annex.insurgency': (w, rng, src) => {
    const r = src.data?.regionId ? w.regions?.[src.data.regionId as ID] : undefined; const to = c$(w, src.data?.to as ID), from = c$(w, src.data?.from as ID);
    if (!r || !to || r.countryId !== to.id) return null;
    r.unrest = clamp(r.unrest + 10, 0, 100); const anchor = w.cities[r.cityIds[0]];
    if (from) { from.relations[to.id] = clamp((from.relations[to.id] ?? 0) - 5, -100, 100); }
    return createEvent(w, {
      category: 'military', type: 'annex.insurgency', severity: 3, causedBy: src.id, title: `Insurgency flares in annexed ${r.name}`,
      description: `${rng.pick(['Roadside bombs', 'A general strike and night-time sabotage', 'Armed men in the hills', 'A boycott of everything from the capital'])} greet ${to.name}'s administrators in ${r.name}. ${from ? `${from.name} denies arming them, unconvincingly.` : 'Nobody claims responsibility; everybody knows.'} ${rng.pick(['Curfew in ' + (anchor?.name ?? r.name) + '.', 'The governor sleeps in the barracks.', 'Refugees move both ways across the new line.'])}`,
      location: { countryId: to.id, cityId: anchor?.id, x: anchor?.x ?? to.centroid.x, y: anchor?.y ?? to.centroid.y }, actors: [ref('country', to.id), ...(from ? [ref('country', from.id)] : [])],
      effects: [fx('country', to.id, 'unrest', 4), fx('country', to.id, 'stability', -3), fx('country', to.id, 'military', 1)], tags: ['insurgency', 'region', to.code], data: { regionId: r.id, region: r.name, from: from?.id, to: to.id },
    });
  },
  // Regions: an autonomy demand is answered with a concession or a crackdown; crackdowns can end in secession along regional lines.
  'region.response': (w, rng, src) => {
    const c = c$(w, src.location.countryId); const r = src.data?.regionId ? w.regions?.[src.data.regionId as ID] : undefined;
    if (!c || !r || r.countryId !== c.id) return null;
    const anchor = w.cities[r.cityIds[0]];
    const concede = c.freedom > 55 ? rng.bool(0.7) : c.stability < 40 ? rng.bool(0.45) : rng.bool(0.2);
    const gov = r.governorId ? w.people[r.governorId] : undefined;
    if (concede) {
      r.autonomy = clamp(r.autonomy + 25, 0, 100); r.unrest = clamp(r.unrest - 25, 0, 100); r.history.push({ day: w.day, text: `Granted autonomy by ${c.name}.` });
      if (gov && src.data?.governorLed) { gov.fame = clamp(gov.fame + 8, 0, 100); gov.reputation = clamp(gov.reputation + 10, -100, 100); gov.history.push({ day: w.day, text: `Won self-rule for ${r.name}.` }); }
      return createEvent(w, {
        category: 'political', type: 'region.concession', severity: 2, causedBy: src.id, title: `${c.name} grants ${r.name} self-rule`,
        description: `A devolution law gives ${r.name} its own assembly, control of ${rng.pick(['schools and language', 'its tax revenue', 'policing', 'its ports and roads'])}. ${rng.pick(['Hardliners in the capital called it the beginning of the end.', 'The regional council met the same week.', 'Nationalists in the region said it was not enough — but they said it quietly.'])}`,
        location: { countryId: c.id, cityId: anchor?.id, x: anchor?.x ?? c.centroid.x, y: anchor?.y ?? c.centroid.y }, actors: [ref('country', c.id)],
        effects: [fx('country', c.id, 'stability', 3), fx('country', c.id, 'freedom', 1), fx('country', c.id, 'unrest', -2)], tags: ['region', 'autonomy', c.code], data: { regionId: r.id, region: r.name },
      });
    }
    r.unrest = clamp(r.unrest + 12, 0, 100); r.autonomy = clamp(r.autonomy - 10, 0, 100); r.history.push({ day: w.day, text: `Crackdown ordered by ${c.name}.` });
    let dismissed: string | undefined;
    if (gov && src.data?.governorLed && rng.bool(0.7)) { gov.title = undefined; gov.history.push({ day: w.day, text: `Dismissed as Governor of ${r.name} after the crackdown.` }); gov.memories.push({ day: w.day, text: `${c.name} sent soldiers and took my office. ${r.name} will remember.`, weight: 0.8 }); gov.objective = `win independence for ${r.name}`; gov.ideology = 'nationalist'; const leader = w.people[c.leaderId]; if (leader) relate(w, gov, leader, 'enemy', -0.8); r.governorId = undefined; appointGovernor(w, rng, r, true); dismissed = gov.name; }
    return createEvent(w, {
      category: 'political', type: 'region.crackdown', severity: 3, causedBy: src.id, title: `${c.name} sends troops into ${r.name}`,
      description: `${c.name} answered the autonomy demand with ${rng.pick(['a curfew and mass arrests', 'soldiers on every square', 'the dissolution of the regional council', 'a ban on the regional language in schools'])}. ${dismissed ? `Governor ${dismissed} was dismissed and marched out of the regional palace. ` : ''}${rng.pick(['The region went quiet, and angrier.', 'Videos from ' + (anchor?.name ?? r.name) + ' spread faster than the censors.', 'Neighbours called for restraint.'])}`,
      location: { countryId: c.id, cityId: anchor?.id, x: anchor?.x ?? c.centroid.x, y: anchor?.y ?? c.centroid.y }, actors: [ref('country', c.id), ...(dismissed && gov ? [ref('person', gov.id)] : [])],
      effects: [fx('country', c.id, 'freedom', -3), fx('country', c.id, 'unrest', 5), fx('country', c.id, 'approval', -3)], tags: ['region', 'crackdown', c.code], data: { regionId: r.id, region: r.name },
    });
  },
  'region.movement': (w, rng, src) => {
    const c = c$(w, src.location.countryId); const r = src.data?.regionId ? w.regions?.[src.data.regionId as ID] : undefined;
    if (!c || !r || r.countryId !== c.id) return null;
    if (c.movements.some((m) => w.organizations[m]?.alive && w.organizations[m]?.agenda === 'independence')) return null;
    const ev = A.createMovement(w, rng, c, src.id, false, 'nationalist', `${r.name} League`, 'independence');
    if (ev) { ev.title = `${r.name} League forms to fight for independence`; ev.data = { ...(ev.data ?? {}), regionId: r.id, cityId: r.cityIds[0] }; }
    return ev;
  },
  'region.secession': (w, rng, src) => {
    const c = c$(w, src.location.countryId); const r = src.data?.regionId ? w.regions?.[src.data.regionId as ID] : undefined;
    if (!c || !r || r.countryId !== c.id) return null;
    if (r.unrest < 70 || c.stability > 55) { if (r.unrest > 50 && rng.bool(0.5)) schedule(w, 'region.secession', src.id, rng.int(120, 300)); return null; }
    if (c.history.some((h) => /broke away/.test(h.text) && w.day - h.day < 3 * 365)) return null; // one lost region per three years: the state digs in after a split
    if (recentFounding(w, 730)) { if (rng.bool(0.5)) schedule(w, 'region.secession', src.id, rng.int(200, 400)); return null; } // the world digests one new border at a time
    const ev = A.createCountry(w, rng, c, src.id, false, undefined, r.id);
    if (ev) { c.history.push({ day: w.day, text: `${r.name} broke away.`, eventId: ev.id }); ev.title = `${r.name} breaks away from ${c.name}`; ev.description = `After ${rng.pick(['months of strikes', 'a referendum the capital refused to recognise', 'the regional assembly voted for independence and'])}, ${r.name} declared itself a sovereign state. ${ev.description}`; }
    return ev;
  },
  'summit.outcome': (w, rng, src) => {
    const topic = src.data?.topic as string | undefined; const host = c$(w, src.data?.host as ID);
    const guests = ((src.data?.guests as ID[] | undefined) ?? []).map((id) => w.countries[id]).filter(Boolean);
    if (!topic || !host || !guests.length) return null;
    const all = [host, ...guests];
    const avgRel = guests.reduce((s, g) => s + (host.relations[g.id] ?? 0), 0) / guests.length;
    const atWar = all.some((a) => all.some((b) => a.atWarWith.includes(b.id)));
    const success = !atWar && rng.next() < 0.45 + avgRel / 200 + (host.freedom > 60 ? 0.05 : 0);
    if (!success) {
      for (const g of guests) A.setRelation(w, host, g, -4);
      return createEvent(w, {
        category: 'diplomatic', type: 'summit.collapse', severity: 2, causedBy: src.id,
        title: `${topic.charAt(0).toUpperCase() + topic.slice(1)} talks collapse`,
        description: `Months after the ${host.name} summit, the ${topic} process ${rng.pick(['fell apart over money', 'died in committee', 'was vetoed by a single delegation', 'collapsed amid mutual accusations'])}. ${rng.pick(['Diplomats blamed each other.', 'Nobody expects a second round soon.', 'The host called it "a pause, not an end".'])}`,
        location: { countryId: host.id }, actors: all.map((c) => ref('country', c.id)), effects: [fx('country', host.id, 'approval', -2)], tags: ['diplomacy', 'summit', host.code],
      });
    }
    const effects: ReturnType<typeof fx>[] = []; let what = '';
    switch (topic) {
      case 'climate finance': for (const c of all) effects.push(fx('country', c.id, 'climateRisk', -2)); for (const c of all) if (c.gdp > 500) effects.push(fx('country', c.id, 'debt', 1)); what = 'a climate fund that the richer members will pay into'; break;
      case 'debt relief': { const poor = guests.slice().sort((a, b) => a.gdp / a.population - b.gdp / b.population)[0]; effects.push(fx('country', poor.id, 'debt', -12), fx('country', poor.id, 'happiness', 3), fx('country', host.id, 'approval', 1)); what = `debt relief for ${poor.name}`; break; }
      case 'trade tariffs': { const g = rng.pick(guests); if (!host.tradePartners.includes(g.id)) { host.tradePartners.push(g.id); g.tradePartners.push(host.id); } effects.push(fx('country', host.id, 'gdpGrowth', 0.3), fx('country', g.id, 'gdpGrowth', 0.3)); what = `a trade agreement between ${host.name} and ${g.name}`; break; }
      case 'AI safety': for (const c of all) effects.push(fx('country', c.id, 'technology', 1), fx('country', c.id, 'polarization', -1)); what = 'shared rules for advanced machine systems'; break;
      case 'nuclear non-proliferation': for (const c of all) effects.push(fx('country', c.id, 'military', -2), fx('country', c.id, 'stability', 1)); for (const g of guests) A.setRelation(w, host, g, 8); what = 'an arms-control protocol'; break;
      case 'migration': for (const c of all) effects.push(fx('country', c.id, 'happiness', 1), fx('country', c.id, 'unrest', -1)); what = 'a shared framework for refugees and border processing'; break;
      default: for (const g of guests) A.setRelation(w, host, g, 10); for (const c of all) effects.push(fx('country', c.id, 'stability', 1)); what = 'a regional security framework with a standing council'; break;
    }
    return createEvent(w, {
      category: 'diplomatic', type: 'summit.accord', severity: 3, causedBy: src.id,
      title: `${host.name} summit delivers: ${what.split(' ').slice(0, 5).join(' ')}${what.split(' ').length > 5 ? '…' : ''}`,
      description: `The ${topic} process begun in ${A.capitalOf(w, host)?.name ?? host.name} produced ${what}. ${guests.map((g) => g.name).join(', ')} and ${host.name} signed. ${rng.pick(['Implementation is the hard part.', 'Markets liked it.', 'Hardliners at home called it a sell-out.', 'The photo will be in the history books.'])}`,
      location: { countryId: host.id }, actors: all.map((c) => ref('country', c.id)), effects, tags: ['diplomacy', 'summit', 'accord', host.code], historic: topic === 'nuclear non-proliferation',
    });
  },
  // ---- Premise opening arcs (scheduled by generator/premise.ts) ----
  'premise.cold-peace.incident': (w, rng, src) => {
    const a = c$(w, src.data?.a as ID), b = c$(w, src.data?.b as ID);
    if (!a || !b || a.atWarWith.includes(b.id)) return null;
    return A.shiftTension(w, rng, a, b, 25, src.id, false, rng.pick(['a downed reconnaissance drone', 'a spy ring uncovered in the capital', 'a naval stand-off in contested waters', 'a defector with a briefcase']));
  },
  'premise.long-boom.bubble': (w, rng, src) => {
    const g = w.indexes['global'];
    schedule(w, 'premise.long-boom.pop', src.id, rng.int(150, 500));
    return createEvent(w, {
      category: 'economic', type: 'market.warning', severity: 3, causedBy: src.id,
      title: rng.pick(['Central banks warn of "irrational exuberance"', 'Bubble talk grows as valuations hit records', 'Regulators sound the alarm on runaway credit']),
      description: `After years of the boom, ${rng.pick(['household debt', 'corporate leverage', 'property prices', 'margin lending'])} has reached levels not seen in living memory. ${g ? `The global index stands at ${g.value.toFixed(0)}.` : ''} Most investors shrugged.`,
      location: {}, actors: [], effects: [], tags: ['markets', 'bubble'],
      data: { shocks: [{ pct: 0.03 }, { sector: 'finance', pct: 0.05 }] as MarketShock[] },
    });
  },
  'premise.long-boom.pop': (w, rng, src) => (rng.bool(0.65) ? A.economicShock(w, rng, null, 'crash', src.id) : null),
  'premise.age-of-unrest.protests': (w, rng, src) => {
    const c = Object.values(w.countries).sort((x, y) => y.unrest - x.unrest)[0];
    if (!c) return null;
    const city = A.capitalOf(w, c);
    return createEvent(w, {
      category: 'social', type: 'protest.mass', severity: 3, causedBy: src.id,
      title: `Hundreds of thousands march in ${city?.name ?? c.name}`,
      description: `The largest demonstration in a generation filled the streets of ${city?.name ?? c.name} demanding ${rng.pick(['jobs and dignity', "the government's resignation", 'an end to corruption', 'bread, peace and honest elections'])}. Similar marches are planned across ${c.name}.`,
      location: { cityId: city?.id, countryId: c.id }, actors: [ref('country', c.id)],
      effects: [fx('country', c.id, 'unrest', 8), fx('country', c.id, 'stability', -4), fx('country', c.id, 'approval', -5)], tags: ['protest', c.code],
    });
  },
  'premise.after-the-plague.scare': (w, rng, src) => {
    const c = rng.pick(Object.values(w.countries));
    return A.epidemic(w, rng, c, src.id, false, false);
  },
  'premise.machine-dawn.shock': (w, rng, src) => {
    const c = Object.values(w.countries).sort((x, y) => y.technology - x.technology)[0];
    if (!c) return null;
    const city = A.capitalOf(w, c);
    return createEvent(w, {
      category: 'economic', type: 'automation.shock', severity: 4, causedBy: src.id,
      title: `Machines replace ${rng.int(8, 20)}% of ${c.adjective} jobs in a single year`,
      description: `A wave of autonomous systems swept through ${c.name}'s ${rng.pick(['logistics', 'legal', 'manufacturing', 'financial'])} sector. ${city?.name ?? 'The capital'} saw its first "useless class" marches. Economists are split on whether this is the end of work or the beginning of leisure.`,
      location: { cityId: city?.id, countryId: c.id }, actors: [ref('country', c.id)],
      effects: [fx('country', c.id, 'unemployment', 5), fx('country', c.id, 'polarization', 8), fx('country', c.id, 'gdpGrowth', 1), fx('country', c.id, 'happiness', -4)], tags: ['automation', 'jobs', c.code], historic: true,
      data: { shocks: [{ sector: 'technology', pct: 0.1 }, { sector: 'manufacturing', pct: -0.06 }] as MarketShock[] },
    });
  },
  'premise.patchwork.demands': (w, rng, src) => {
    const empire = Object.values(w.countries).sort((a, b) => b.area - a.area)[0]; if (!empire) return null;
    const regions = (empire.regionIds ?? []).map((id) => w.regions?.[id]).filter((r): r is NonNullable<typeof r> => !!r && !r.cityIds.includes(empire.capitalId) && !r.history.some((h) => /Demanded autonomy/.test(h.text) && w.day - h.day < 300));
    const r = regions.sort((a, b) => b.unrest - a.unrest)[0]; if (!r) return null;
    r.unrest = clamp(Math.max(r.unrest, 60) + 5, 0, 100); r.history.push({ day: w.day, text: 'Demanded autonomy.' });
    const gov = r.governorId ? w.people[r.governorId] : undefined; const anchor = w.cities[r.cityIds[0]];
    if (gov) { gov.fame = clamp(gov.fame + 10, 0, 100); gov.history.push({ day: w.day, text: `Led ${r.name}'s demand for autonomy.` }); }
    return createEvent(w, {
      category: 'political', type: 'region.autonomy', severity: 3, causedBy: src.id, title: `${r.name} demands autonomy from ${empire.name}`,
      description: `${gov ? `Governor ${gov.name} and the regional council` : 'The regional council'} of ${r.name} sent the empire's capital a list: ${rng.pick(['schools in their own language', 'a share of the mines', 'an end to conscription', 'a court of their own'])}, and a date. ${rng.pick([`In ${anchor?.name ?? r.name} the old flag came out of the attics.`, 'Other regions are watching the answer.', 'The garrison was doubled overnight.'])}`,
      location: { countryId: empire.id, cityId: anchor?.id, x: anchor?.x ?? empire.centroid.x, y: anchor?.y ?? empire.centroid.y }, actors: [ref('country', empire.id), ...(gov ? [ref('person', gov.id)] : [])],
      effects: [fx('country', empire.id, 'unrest', 4), fx('country', empire.id, 'stability', -3)], tags: ['region', 'autonomy', 'premise', empire.code], data: { regionId: r.id, region: r.name, governorLed: !!gov },
    });
  },
  'premise.fractured-map.talks': (w, rng, src) => {
    const a = Object.values(w.countries).find((x) => x.atWarWith.length);
    const b = a ? w.countries[a.atWarWith[0]] : undefined;
    if (!a || !b) return null;
    const host = rng.pick(Object.values(w.countries).filter((x) => !x.atWarWith.length && x.id !== a.id && x.id !== b.id));
    if (rng.bool(0.5)) schedule(w, 'premise.fractured-map.ceasefire', src.id, rng.int(10, 40), { a: a.id, b: b.id });
    return createEvent(w, {
      category: 'diplomatic', type: 'summit', severity: 3, causedBy: src.id,
      title: `${host?.name ?? 'Neutral'} hosts peace talks between ${a.name} and ${b.name}`,
      description: `Delegations from ${a.name} and ${b.name} sat at the same table for the first time since the borders were redrawn. ${rng.pick(['Neither side smiled for the cameras.', 'Talks ran late into the night.', 'A ceasefire is on the table; recognition is not.'])}`,
      location: host ? { countryId: host.id } : {}, actors: [ref('country', a.id), ref('country', b.id), ...(host ? [ref('country', host.id)] : [])],
      effects: [fx('country', a.id, 'stability', 1), fx('country', b.id, 'stability', 1)], tags: ['diplomacy', 'talks'],
    });
  },
  'premise.fractured-map.ceasefire': (w, rng, src, payload) => {
    const a = c$(w, payload.a as ID), b = c$(w, payload.b as ID);
    if (!a || !b || !a.atWarWith.includes(b.id)) return null;
    return A.endWar(w, rng, a, b, src.id, false, 'stalemate');
  },
  'premise.gilded-age.scandal': (w, rng, src) => {
    const tycoon = Object.values(w.people).filter((p) => p.alive && (p.profession === 'entrepreneur' || p.profession === 'executive')).sort((x, y) => y.wealth - x.wealth)[0];
    if (!tycoon) return null;
    return A.scandal(w, rng, tycoon, src.id, false, rng.pick(['buying a senate seat', 'a private island of untaxed billions', 'bribing regulators on three continents']));
  },
  'premise.quiet-century.omen': (w, rng, src) => {
    const c = rng.pick(Object.values(w.countries));
    return A.resourceDiscovery(w, rng, c, rng.pick(['lithium', 'rare earths', 'oil', 'gold']), src.id);
  },
  // ---- Relationship-driven chains ----
  'scandal.rival-pounce': (w, rng, src) => {
    const p = src.actors.find((a) => a.kind === 'person'); const person = p ? w.people[p.id] : undefined;
    if (!person || !person.alive) return null;
    const rivals = person.relationships.filter((r) => r.strength < -0.25 && w.people[r.target.id]?.alive).map((r) => w.people[r.target.id]);
    if (!rivals.length) return null;
    const rival = rng.pickWeighted(rivals, (x) => x.influence + x.personality.ambition * 30);
    relate(w, rival, person, 'rival', -0.15);
    rival.history.push({ day: w.day, text: `Publicly attacked ${person.name} over the scandal.` });
    const c = w.countries[person.countryId];
    const isLeader = c?.leaderId === person.id;
    return createEvent(w, {
      category: 'political', type: 'rival.attack', severity: isLeader ? 3 : 2, causedBy: src.id,
      title: `${rival.name} turns the knife: "${person.name} must go"`,
      description: `${rival.name}, a long-time ${rival.profession} rival of ${person.name}, ${rng.pick(['called for a full investigation', 'released a statement demanding resignation', 'went on every channel that would have them', 'published a scathing open letter'])}. ${rng.pick(['The feud is now out in the open.', 'Insiders say the two have not spoken in years.', 'Allies of both are choosing sides.'])}`,
      location: { cityId: rival.cityId }, actors: [ref('person', rival.id), ref('person', person.id)],
      effects: [fx('person', rival.id, 'influence', 4), fx('person', rival.id, 'fame', 6), fx('person', person.id, 'reputation', -8), ...(isLeader && c ? [fx('country', c.id, 'approval', -3)] : [])],
      tags: ['scandal', 'rivalry', 'feud'],
    });
  },
  'scandal.allies-rally': (w, rng, src) => {
    const p = src.actors.find((a) => a.kind === 'person'); const person = p ? w.people[p.id] : undefined;
    if (!person || !person.alive) return null;
    const allies = person.relationships.filter((r) => r.strength > 0.35 && r.type !== 'family' && r.type !== 'partner' && w.people[r.target.id]?.alive).map((r) => w.people[r.target.id]);
    if (!allies.length) return null;
    const ally = rng.pickWeighted(allies, (x) => x.fame + x.influence);
    relate(w, ally, person, 'ally', 0.1);
    ally.history.push({ day: w.day, text: `Stood by ${person.name} during the scandal.` });
    person.memories.push({ day: w.day, text: `${ally.name} stood by me when it counted.`, weight: 0.6 });
    const c = w.countries[person.countryId];
    const isLeader = c?.leaderId === person.id;
    return createEvent(w, {
      category: 'political', type: 'ally.rally', severity: 2, causedBy: src.id,
      title: `${ally.name} stands by ${person.name}`,
      description: `${ally.name} ${rng.pick(['dismissed the accusations as a smear', 'appeared alongside the embattled figure', 'rallied supporters in a fiery speech', 'called the coverage "a coordinated hit"'])}. ${allies.length > 1 ? `${allies.length - 1} other ${allies.length > 2 ? 'allies have' : 'ally has'} also spoken out.` : 'Whether it is enough remains to be seen.'}`,
      location: { cityId: ally.cityId }, actors: [ref('person', ally.id), ref('person', person.id)],
      effects: [fx('person', person.id, 'reputation', 5), fx('person', ally.id, 'fame', 3), ...(isLeader && c ? [fx('country', c.id, 'approval', 2)] : [])],
      tags: ['scandal', 'loyalty'],
    });
  },
  'downfall.rival-rises': (w, rng, src) => {
    const p = src.actors.find((a) => a.kind === 'person'); const person = p ? w.people[p.id] : undefined;
    if (!person) return null;
    const rivals = person.relationships.filter((r) => r.strength < -0.3 && w.people[r.target.id]?.alive).map((r) => w.people[r.target.id]);
    if (!rivals.length) return null;
    const rival = rng.pickWeighted(rivals, (x) => x.personality.ambition * 50 + x.influence);
    rival.history.push({ day: w.day, text: `Rose to prominence after the fall of rival ${person.name}.` });
    rival.objective = rival.profession === 'politician' ? 'reach the top office' : rival.objective;
    return createEvent(w, {
      category: 'personal', type: 'rival.ascends', severity: 2, causedBy: src.id,
      title: `${rival.name} fills the void left by ${person.name}`,
      description: `With ${person.name} out of the picture, ${rival.name} has ${rng.pick(['absorbed their network', 'been courted by their former backers', 'claimed the mantle', 'quietly taken over the room'])}. ${rng.pick(['Old grudges, it seems, pay off.', 'The rivalry ends with a clear winner.', 'Some call it opportunism; others call it politics.'])}`,
      location: { cityId: rival.cityId }, actors: [ref('person', rival.id), ref('person', person.id)],
      effects: [fx('person', rival.id, 'influence', 10), fx('person', rival.id, 'fame', 8), fx('person', rival.id, 'wealth%', 8)],
      tags: ['rivalry', 'rise'],
    });
  },
  'leader.mentor-endorses': (w, rng, src) => {
    const c = c$(w, src.actors.find((a) => a.kind === 'country')?.id);
    const leader = c ? w.people[c.leaderId] : undefined;
    if (!c || !leader || !leader.alive) return null;
    const mentorRel = leader.relationships.find((r) => r.type === 'mentor' && r.strength > 0 && w.people[r.target.id]?.alive)
      ?? leader.relationships.find((r) => r.type === 'ally' && r.strength > 0.6 && w.people[r.target.id]?.alive && w.people[r.target.id].birthDay < leader.birthDay - 10 * 365);
    const mentor = mentorRel ? w.people[mentorRel.target.id] : undefined;
    if (!mentor) return null;
    relate(w, mentor, leader, 'mentor', 0.15);
    mentor.history.push({ day: w.day, text: `Endorsed protégé ${leader.name} as ${leader.title} of ${c.name}.` });
    return createEvent(w, {
      category: 'political', type: 'mentor.endorsement', severity: 2, causedBy: src.id,
      title: `${mentor.name} blesses protégé ${leader.name}`,
      description: `${mentor.name}, who ${rng.pick(['guided', 'first recruited', 'shaped the career of'])} ${leader.name}, offered a public endorsement: "${rng.pick(['I taught them everything, and they surpassed me.', 'The country is in the right hands.', 'This is the moment we prepared for.'])}" The gesture ${rng.pick(['reassured the old guard', 'unified rival factions', 'was widely read as a passing of the torch'])}.`,
      location: { cityId: mentor.cityId }, actors: [ref('person', mentor.id), ref('person', leader.id), ref('country', c.id)],
      effects: [fx('country', c.id, 'approval', 4), fx('country', c.id, 'stability', 2), fx('person', mentor.id, 'influence', 3)],
      tags: ['mentor', 'endorsement', c.code],
    });
  },
  'leader.rival-opposition': (w, rng, src) => {
    const c = c$(w, src.actors.find((a) => a.kind === 'country')?.id);
    const leader = c ? w.people[c.leaderId] : undefined;
    if (!c || !leader || !leader.alive) return null;
    const rivals = leader.relationships.filter((r) => r.strength < -0.3 && r.type !== 'family' && w.people[r.target.id]?.alive && w.people[r.target.id].countryId === c.id).map((r) => w.people[r.target.id]);
    if (!rivals.length) return null;
    const rival = rng.pickWeighted(rivals, (x) => x.influence + x.fame);
    if (c.freedom < 35 && rng.bool(0.5)) {
      rival.history.push({ day: w.day, text: `Arrested on the orders of rival ${leader.name}.` });
      relate(w, rival, leader, 'enemy', -0.3);
      return createEvent(w, {
        category: 'political', type: 'purge', severity: 3, causedBy: src.id,
        title: `${leader.name} moves against old rival ${rival.name}`,
        description: `Within weeks of taking power, ${leader.name} had ${rival.name} ${rng.pick(['detained on corruption charges', 'stripped of every office', 'placed under house arrest', 'barred from public life'])}. ${rng.pick(['Human-rights groups cried foul.', 'The two have loathed each other for years.', 'The message to other critics was unmistakable.'])}`,
        location: { cityId: rival.cityId }, actors: [ref('person', leader.id), ref('person', rival.id), ref('country', c.id)],
        effects: [fx('person', rival.id, 'influence', -25), fx('person', rival.id, 'fame', 6), fx('country', c.id, 'freedom', -4), fx('country', c.id, 'unrest', 3)],
        tags: ['purge', 'rivalry', c.code],
      });
    }
    rival.objective = rival.profession === 'politician' ? 'reach the top office' : rival.objective;
    rival.history.push({ day: w.day, text: `Became the face of the opposition to ${leader.name}.` });
    return createEvent(w, {
      category: 'political', type: 'opposition.leader', severity: 2, causedBy: src.id,
      title: `${rival.name} emerges as ${leader.name}'s chief opponent`,
      description: `The ${rival.profession} ${rival.name}, whose rivalry with ${leader.name} goes back years, ${rng.pick(['rallied the opposition', 'launched a movement to unseat the new leader', 'vowed to make life "very difficult" for the government'])}. Polls suggest ${rng.pick(['a growing following', 'the country is split', 'voters are listening'])}.`,
      location: { cityId: rival.cityId }, actors: [ref('person', rival.id), ref('person', leader.id), ref('country', c.id)],
      effects: [fx('person', rival.id, 'influence', 8), fx('person', rival.id, 'fame', 10), fx('country', c.id, 'approval', -3), fx('country', c.id, 'polarization', 3)],
      tags: ['opposition', 'rivalry', c.code],
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
  'movement.growth': (w, rng, src, payload) => {
    const o = src.actors.find((a) => a.kind === 'organization'); const org = o ? w.organizations[o.id] : undefined;
    const c = c$(w, org?.countryId ?? undefined);
    if (!org || !c || !org.alive) return null;
    org.support = clamp(org.support + rng.float(-6, 10) + c.unrest / 12, 0, 100);
    // Movements keep growing (or fading) for a few rounds before they either surge or dissolve.
    const round = (payload.round as number | undefined) ?? 0;
    if (org.support <= 45 && round < 3) { schedule(w, 'movement.growth', src.id, rng.int(60, 200), { round: round + 1 }); return null; }
    if (org.support <= 45) { if (org.support < 8) { org.alive = false; org.history.push({ day: w.day, text: 'Dissolved for lack of support.' }); } return null; }
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
    if (rng.bool(0.5) && !recentFounding(w, 730)) return A.createCountry(w, rng, c, src.id, false);
    return createEvent(w, { category: 'political', type: 'referendum.blocked', severity: 3, causedBy: src.id, title: `${c.name} bans independence referendum`, description: `The ${c.adjective} government declared the separatist vote illegal and deployed police to polling stations. ${o.name} vowed to continue.`, location: { countryId: c.id }, actors: [ref('country', c.id), ref('organization', o.id)], effects: [fx('country', c.id, 'unrest', 10), fx('country', c.id, 'freedom', -5), fx('organization', o.id, 'support', 5)], tags: ['secession', c.code] });
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
    const hasDividend = c.history.some((h) => h.text === 'Universal dividend introduced.');
    if (roll < 0.35 || (hasDividend && roll < 0.7 && rng.bool(0.5))) return A.createMovement(w, rng, c, src.id, false, 'socialist', undefined, 'tax the machines and share the gains');
    if (roll < 0.7 && hasDividend) return null; // already paying one; no second dividend
    if (roll < 0.7) c.history.push({ day: w.day, text: 'Universal dividend introduced.', eventId: src.id });
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
  'election.honeymoon': (w: World, rng: RNG, src: WorldEvent) => {
    const c = c$(w, src.actors.find((a) => a.kind === 'country')?.id); const leader = c ? w.people[c.leaderId] : undefined;
    if (!c || !leader) return null;
    const promise = rng.pick(['a 100-day reform program', 'an anti-corruption commission', 'a national infrastructure plan', 'tax relief for families', 'a green industrial strategy', 'a crackdown on crime']);
    return createEvent(w, { category: 'political', type: 'policy', severity: 2, causedBy: src.id, title: `${leader.name} launches ${promise}`, description: `Fresh from victory, ${leader.name} used the honeymoon to announce ${promise}. ${rng.pick(['Approval ticked up.', 'The opposition called it theatre.', 'Markets liked what they heard.'])}`, location: { countryId: c.id }, actors: [ref('person', leader.id), ref('country', c.id)], effects: [fx('country', c.id, 'approval', 4), fx('country', c.id, 'stability', 2), fx('country', c.id, 'debt', 2)], tags: ['policy', 'election', c.code], data: { policy: promise } });
  },
  'election.disputed': (w: World, rng: RNG, src: WorldEvent) => {
    const c = c$(w, src.actors.find((a) => a.kind === 'country')?.id);
    if (!c || c.corruption < 60) return null;
    const city = A.capitalOf(w, c);
    return createEvent(w, { category: 'social', type: 'protest.mass', severity: 3, causedBy: src.id, title: `Crowds in ${city.name} reject "stolen" election`, description: `Opposition supporters flooded ${city.name} claiming the vote was rigged. International observers reported ${rng.pick(['ballot-box stuffing', 'blocked polling stations', 'a suspiciously fast count', 'intimidation of monitors'])}.`, location: { cityId: city.id }, actors: [ref('country', c.id)], effects: [fx('country', c.id, 'unrest', 8), fx('country', c.id, 'approval', -6), fx('country', c.id, 'polarization', 6)], tags: ['protest', 'election', c.code] });
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
  { match: (e) => e.type === 'leader.election', rule: 'election.honeymoon', delay: [10, 60], p: 0.8 },
  { match: (e) => e.type === 'election.incumbent', rule: 'election.disputed', delay: [2, 12], p: 0.7 },
  { match: (e) => e.type === 'tech.breakthrough' && e.severity >= 4, rule: 'tech.startups', delay: [30, 150], p: 0.8 },
  { match: (e) => e.type.startsWith('disaster.') && e.severity >= 4, rule: 'disaster.reconstruction', delay: [60, 150], p: 0.85 },
  { match: (e) => e.type === 'company.bankrupt' && e.severity >= 3, rule: 'bankrupt.assets', delay: [10, 60], p: 0.7 },
  { match: (e) => e.type === 'health.pandemic', rule: 'pandemic.lockdown-protests', delay: [40, 120], p: 0.9 },
  { match: (e) => e.type === 'summit' && !!e.data?.topic, rule: 'summit.outcome', delay: [20, 90], p: 0.9 },
  { match: (e) => e.type === 'festival.film' && !!e.data?.political, rule: 'festival.banned', delay: [1, 12], p: 0.7 },
  { match: (e) => e.type === 'war.ended' && !!e.data?.winner, rule: 'war.annex', delay: [5, 30], p: 0.45 },
  { match: (e) => e.type === 'region.annexed', rule: 'annex.insurgency', delay: [30, 200], p: 0.6 },
  { match: (e) => e.type === 'region.autonomy', rule: 'region.response', delay: [15, 90], p: 0.9 },
  { match: (e) => e.type === 'region.autonomy', rule: 'region.movement', delay: [5, 40], p: 0.5 },
  { match: (e) => e.type === 'region.crackdown', rule: 'region.secession', delay: [60, 240], p: 0.4 },
  { match: (e) => e.type === 'festival.film' && !!e.data?.maker, rule: 'festival.rights', delay: [10, 45], p: 0.55 },
  { match: (e) => e.type === 'trade.fair' && (e.data?.deal as unknown[] | undefined)?.length === 2, rule: 'fair.venture', delay: [10, 45], p: 0.8 },
  { match: (e) => e.type === 'food.crisis', rule: 'food.riots', delay: [5, 30], p: 0.8 },
  { match: (e) => e.type === 'food.crisis', rule: 'food.aid', delay: [10, 40], p: 0.7 },
  { match: (e) => e.type === 'food.crisis', rule: 'food.migration', delay: [20, 70], p: 0.6 },
  { match: (e) => e.type === 'food.crisis', rule: 'food.exportban', delay: [3, 25], p: 0.45 },
  { match: (e) => e.type === 'sea.rise', rule: 'sea.migration', delay: [15, 60], p: 0.6 },
  { match: (e) => e.type === 'scandal', rule: 'scandal.rival-pounce', delay: [1, 6], p: 0.45 },
  { match: (e) => e.type === 'scandal', rule: 'scandal.allies-rally', delay: [2, 8], p: 0.7 },
  { match: (e) => e.type === 'downfall', rule: 'downfall.rival-rises', delay: [10, 60], p: 0.5 },
  { match: (e) => e.type.startsWith('leader.') && e.type !== 'leader.succession', rule: 'leader.mentor-endorses', delay: [2, 15], p: 0.8 },
  { match: (e) => e.type.startsWith('leader.'), rule: 'leader.rival-opposition', delay: [15, 90], p: 0.6 },
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
