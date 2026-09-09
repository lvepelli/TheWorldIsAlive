/**
 * Spontaneous event spawning. Each rule declares a weight that depends on the
 * current state of the world, so unstable countries riot, rich countries
 * innovate, and rivals clash. Events are produced through shared actions.
 */
import { RNG, clamp } from '../rng';
import type { World, Country, WorldEvent, Sector } from '../types';
import { SECTORS } from '../types';
import * as A from './actions';
import { relate } from '../simulation/relations';
import { makePerson, makeOrg } from '../generator/world';
import { stormBound, seasonFactor } from '../simulation/weather';
import { createEvent, fx, ref } from './engine';

export interface SpawnRule {
  id: string;
  weight: (w: World, rng: RNG) => number;
  run: (w: World, rng: RNG) => WorldEvent | null;
}

const countries = (w: World) => Object.values(w.countries);
const pickCountry = (w: World, rng: RNG, weight: (c: Country) => number) => rng.pickWeighted(countries(w), weight);
const livePeople = (w: World) => Object.values(w.people).filter((p) => p.alive && !p.retired);
const liveCompanies = (w: World) => Object.values(w.companies).filter((c) => c.alive);

const TECH_FIELDS = ['battery', 'fusion', 'quantum computing', 'gene editing', 'artificial intelligence', 'room-temperature superconductor', 'carbon capture', 'desalination', 'neural interface', 'orbital manufacturing', 'synthetic fuel', 'longevity', 'robotics', 'photonic chip', 'lab-grown organ', 'weather control', 'solid-state hydrogen', 'universal translator', 'bio-concrete', 'swarm drone', 'atmospheric water harvesting', 'DNA data storage', 'graphene manufacturing', 'geothermal drilling'];

export const SPAWN_RULES: SpawnRule[] = [
  {
    id: 'protest',
    weight: (w) => countries(w).reduce((s, c) => s + Math.max(0, c.unrest - 25) / 60, 0.3),
    run: (w, rng) => {
      const c = pickCountry(w, rng, (x) => Math.max(0.05, x.unrest - 15));
      const city = A.pickCity(w, rng, c);
      const big = c.unrest > 55;
      const mv = c.movements.map((id) => w.organizations[id]).filter((o) => o?.alive);
      const org = mv.length ? rng.pick(mv) : undefined;
      const cause = rng.pick(['soaring food prices', 'a disputed election', 'police brutality', 'corruption in the cabinet', 'unpaid wages', 'a controversial new law', 'water shortages', 'youth unemployment', 'a pension reform', 'rent hikes', 'a banned protest song', 'the arrest of a popular blogger', 'fuel rationing', 'a stadium being built instead of a hospital', 'surveillance cameras on every corner']);
      return createEvent(w, {
        category: 'social', type: big ? 'protest.mass' : 'protest', severity: big ? 3 : 2,
        title: big ? `Hundreds of thousands march in ${city.name}` : `Protests erupt in ${city.name} over ${cause}`,
        description: `${big ? 'The largest demonstration in a generation' : 'Crowds'} filled the streets of ${city.name} demanding action on ${cause}. ${org ? `${org.name} called for the rallies.` : ''} ${rng.pick(['Police used tear gas.', 'The march stayed peaceful.', 'Several ministers cancelled travel.', 'Shops closed early across the city.'])}`,
        location: { cityId: city.id }, actors: [ref('country', c.id), ref('city', city.id), ...(org ? [ref('organization', org.id)] : [])],
        effects: [fx('country', c.id, 'approval', big ? -5 : -2), fx('country', c.id, 'stability', big ? -4 : -1), fx('city', city.id, 'unrest', 5), ...(org ? [fx('organization', org.id, 'support', 2), fx('organization', org.id, 'influence', 3)] : [])],
        tags: ['protest', 'unrest', c.code], data: { cause },
      });
    },
  },
  {
    id: 'scandal',
    weight: (w) => 0.5 + countries(w).reduce((s, c) => s + c.corruption / 400, 0),
    run: (w, rng) => {
      const pool = livePeople(w).filter((p) => p.fame > 25);
      if (!pool.length) return null;
      const p = rng.pickWeighted(pool, (x) => x.fame * (1.2 - x.personality.integrity) * (w.countries[x.countryId]?.freedom ?? 50) / 50);
      return A.scandal(w, rng, p);
    },
  },
  {
    id: 'tech.breakthrough',
    weight: (w) => 0.22 + countries(w).reduce((s, c) => s + c.technology / 1400, 0),
    run: (w, rng) => {
      const c = pickCountry(w, rng, (x) => x.technology ** 2 / 100);
      const cos = A.companiesOf(w, c.id).filter((x) => ['technology', 'biotech', 'energy', 'aerospace', 'health'].includes(x.sector));
      const co = cos.length && rng.bool(0.7) ? rng.pick(cos) : null;
      const mag = rng.next() < 0.08 ? 2 : rng.next() < 0.4 ? 1 : 0.5;
      return A.techBreakthrough(w, rng, co, c, rng.pick(TECH_FIELDS), 'simulation', false, mag);
    },
  },
  {
    id: 'company.founded',
    weight: (w) => 0.6,
    run: (w, rng) => {
      const c = pickCountry(w, rng, (x) => x.gdp ** 0.7 * (x.freedom / 50));
      return A.foundCompany(w, rng, c, rng.pick(SECTORS));
    },
  },
  {
    id: 'company.bankrupt',
    weight: (w) => 0.15 + countries(w).filter((c) => c.gdpGrowth < -1).length * 0.1,
    run: (w, rng) => {
      const pool = liveCompanies(w).filter((c) => c.growth < 0 || c.value < c.priceHistory[0] * 0.5);
      if (!pool.length) return null;
      return A.bankruptCompany(w, rng, rng.pickWeighted(pool, (c) => 1 + Math.max(0, -c.growth)));
    },
  },
  {
    id: 'corporate.launch',
    weight: () => 0.7,
    run: (w, rng) => {
      const pool = liveCompanies(w).filter((c) => c.value > 1);
      if (!pool.length) return null;
      const co = rng.pickWeighted(pool, (c) => Math.sqrt(c.value));
      const c = w.countries[co.countryId];
      const good = rng.bool(0.6);
      const products: Record<Sector, string[]> = {
        energy: ['a modular reactor', 'a home battery', 'a hydrogen turbine'], technology: ['a new AI assistant', 'a foldable device', 'a satellite internet service'], finance: ['a digital currency', 'a credit platform', 'a sovereign wealth fund partnership'],
        manufacturing: ['a humanoid factory robot', 'an electric truck', 'a 3D-printed housing system'], agriculture: ['a drought-proof grain', 'a lab-grown meat line', 'an automated vertical farm'], defense: ['a drone swarm', 'a hypersonic interceptor', 'an autonomous submarine'],
        media: ['a streaming service', 'an immersive news format', 'an AI-generated series'], health: ['a cancer screening test', 'a robotic surgeon', 'a telehealth network'], transport: ['an autonomous taxi fleet', 'a maglev line', 'an electric cargo ship'],
        retail: ['drone delivery', 'a subscription marketplace', 'cashierless megastores'], mining: ['a deep-sea harvester', 'a lithium refinery', 'an asteroid survey mission'], biotech: ['a gene therapy', 'a longevity drug', 'a universal vaccine candidate'],
        aerospace: ['a reusable heavy rocket', 'a lunar cargo lander', 'a supersonic airliner'], construction: ['a self-healing concrete', 'a floating city module', 'a hyper-fast tunneling machine'],
      };
      const prod = rng.pick(products[co.sector]);
      return createEvent(w, {
        category: 'corporate', type: good ? 'product.launch' : 'product.failure', severity: co.value > 100 ? 3 : 2,
        title: good ? `${co.name} unveils ${prod}` : `${co.name}'s ${prod.replace(/^(a|an) /, '')} flops`,
        description: good ? `${co.name} revealed ${prod} at a packed event in ${w.cities[co.cityId]?.name}. Pre-orders ${rng.pick(['crashed the website', 'exceeded projections', 'came in strong'])}.` : `${co.name}'s much-hyped ${prod} suffered ${rng.pick(['a public demo failure', 'a recall', 'devastating reviews', 'a safety investigation'])}. Analysts are cutting targets.`,
        location: { cityId: co.cityId }, actors: [ref('company', co.id), ref('person', co.ceoId), ref('country', c.id)],
        effects: [fx('company', co.id, 'value%', good ? rng.float(4, 15) : rng.float(-18, -5)), fx('company', co.id, 'reputation', good ? 5 : -8), fx('person', co.ceoId, 'fame', good ? 3 : 2)],
        tags: ['corporate', co.sector, c.code], data: { product: prod, good },
      });
    },
  },
  {
    id: 'disaster',
    weight: (w) => 0.25 + countries(w).reduce((s, c) => s + c.climateRisk / 3000, 0),
    run: (w, rng) => {
      // Storms strike where the weather is: countries under a front are far likelier to get hurricanes and floods.
      const fronts = stormBound(w);
      const stormy = rng.next() < 0.5 && fronts.size > 0;
      const isDry = (x: Country) => !fronts.has(x.id) && seasonFactor(w, x.centroid.y) < 0.45;
      const c = stormy ? pickCountry(w, rng, (x) => (fronts.get(x.id) ?? 0) * 40 + x.climateRisk * 0.2) : pickCountry(w, rng, (x) => x.climateRisk + 10 + (isDry(x) ? 20 : 0));
      if (stormy && fronts.has(c.id)) return A.disaster(w, rng, c, rng.pickWeighted(['hurricane', 'flood'] as const, (k) => (k === 'hurricane' ? 3 : 2)), 'simulation', false, rng.float(0.7, 1.4) * (0.7 + (fronts.get(c.id) ?? 0.5)));
      const dry = isDry(c) ? 2.2 : 1;
      const kind = rng.pickWeighted(['earthquake', 'flood', 'hurricane', 'drought', 'wildfire', 'volcano', 'tsunami'] as const, (k) => ({ earthquake: 2, flood: 3, hurricane: 2.5, drought: 2 * dry, wildfire: 2 * dry, volcano: 0.5, tsunami: 0.6 })[k]);
      return A.disaster(w, rng, c, kind, 'simulation', false, rng.next() < 0.1 ? 1.6 : rng.float(0.6, 1.2));
    },
  },
  {
    id: 'border.clash',
    weight: (w) => countries(w).reduce((s, c) => s + c.neighbors.filter((n) => (c.relations[n] ?? 0) < -40 && !c.atWarWith.includes(n)).length * 0.12, 0),
    run: (w, rng) => {
      const pairs = countries(w).flatMap((c) => c.neighbors.filter((n) => c.id < n && (c.relations[n] ?? 0) < -40 && !c.atWarWith.includes(n)).map((n) => [c, w.countries[n]] as const));
      if (!pairs.length) return null;
      const [a, b] = rng.pick(pairs);
      A.setRelation(w, a, b, -10);
      return createEvent(w, {
        category: 'military', type: 'border.clash', severity: 3,
        title: `Deadly border clash between ${a.name} and ${b.name}`,
        description: `Troops exchanged fire along the ${a.name}–${b.name} frontier, leaving ${rng.int(3, 60)} dead. Each side blames the other. ${rng.pick(['Reservists have been called up.', 'An emergency session of the alliance council was requested.', 'Both capitals recalled their ambassadors.'])}`,
        location: { countryId: a.id }, actors: [ref('country', a.id), ref('country', b.id)],
        effects: [fx('country', a.id, 'stability', -2), fx('country', b.id, 'stability', -2), fx('country', a.id, 'military', 1), fx('country', b.id, 'military', 1)], tags: ['conflict', 'tension', a.code, b.code],
      });
    },
  },
  {
    id: 'war.declared',
    weight: (w) => countries(w).reduce((s, c) => s + c.neighbors.filter((n) => (c.relations[n] ?? 0) < -70 && !c.atWarWith.includes(n)).length * 0.04 * (c.government === 'military-junta' || c.government === 'autocracy' ? 2 : 1), 0),
    run: (w, rng) => {
      const pairs = countries(w).flatMap((c) => c.neighbors.filter((n) => (c.relations[n] ?? 0) < -70 && !c.atWarWith.includes(n)).map((n) => [c, w.countries[n]] as const));
      if (!pairs.length) return null;
      const [a, b] = rng.pickWeighted(pairs, ([x]) => x.military + (leaderAgg(w, x) * 40));
      return A.declareWar(w, rng, a, b);
    },
  },
  {
    id: 'battle',
    weight: (w) => countries(w).reduce((s, c) => s + c.atWarWith.length, 0) * 0.35,
    run: (w, rng) => {
      const wars = countries(w).flatMap((c) => c.atWarWith.filter((n) => c.id < n).map((n) => [c, w.countries[n]] as const));
      if (!wars.length) return null;
      const [a, b] = rng.pick(wars);
      const aWin = rng.next() < a.military / (a.military + b.military);
      const win = aWin ? a : b, lose = aWin ? b : a;
      const city = A.pickCity(w, rng, lose);
      return createEvent(w, {
        category: 'military', type: 'battle', severity: 3,
        title: `${win.adjective} forces ${rng.pick(['break through', 'seize ground', 'win a bloody battle'])} near ${city.name}`,
        description: `Heavy fighting around ${city.name} ended with ${win.name} in control of ${rng.pick(['the highway junction', 'the river crossing', 'the industrial zone', 'the airfield'])}. Casualty estimates run into the ${rng.pick(['hundreds', 'thousands'])}.`,
        location: { cityId: city.id }, actors: [ref('country', a.id), ref('country', b.id), ref('city', city.id)],
        effects: [fx('country', lose.id, 'stability', -4), fx('country', lose.id, 'military', -3), fx('country', win.id, 'military', -1), fx('country', lose.id, 'approval', -3), fx('country', win.id, 'approval', 2), fx('city', city.id, 'prosperity', -8), fx('city', city.id, 'population%', -rng.float(0.5, 3))],
        tags: ['war', 'battle', a.code, b.code], data: { winner: win.id, loser: lose.id },
      });
    },
  },
  {
    id: 'war.ended',
    weight: (w) => countries(w).reduce((s, c) => s + c.atWarWith.length, 0) * 0.03,
    run: (w, rng) => {
      const wars = countries(w).flatMap((c) => c.atWarWith.filter((n) => c.id < n).map((n) => [c, w.countries[n]] as const));
      if (!wars.length) return null;
      const [a, b] = rng.pick(wars);
      return A.endWar(w, rng, a, b);
    },
  },
  {
    id: 'diplomacy',
    weight: () => 0.6,
    run: (w, rng) => {
      const a = pickCountry(w, rng, (x) => x.gdp ** 0.5);
      const others = countries(w).filter((x) => x.id !== a.id && !a.atWarWith.includes(x.id));
      if (!others.length) return null;
      const b = rng.pickWeighted(others, (x) => 1 + (a.neighbors.includes(x.id) ? 3 : 0));
      const rel = a.relations[b.id] ?? 0;
      if (rel > 50 && !a.alliances.includes(b.id) && rng.bool(0.4)) return A.formAlliance(w, rng, a, b);
      if (rel < -20 && a.alliances.includes(b.id) && rng.bool(0.5)) return A.breakAlliance(w, rng, a, b);
      const worsening = rng.next() < 0.5 + (a.ideology !== b.ideology ? 0.15 : -0.15) + A.leaderOf(w, a)!.personality.aggression * 0.2 - 0.1;
      return A.shiftTension(w, rng, a, b, worsening ? rng.float(8, 30) : -rng.float(8, 30));
    },
  },
  {
    id: 'cyberattack',
    weight: (w) => 0.3 + countries(w).reduce((s, c) => s + c.technology / 1500, 0),
    run: (w, rng) => {
      const target = pickCountry(w, rng, (x) => x.technology + x.gdp / 20);
      const suspects = countries(w).filter((x) => x.id !== target.id && (target.relations[x.id] ?? 0) < 0);
      const suspect = suspects.length && rng.bool(0.7) ? rng.pick(suspects) : null;
      const crim = Object.values(w.organizations).filter((o) => o.alive && o.type === 'criminal');
      const org = !suspect && crim.length ? rng.pick(crim) : null;
      const what = rng.pick(['the power grid', 'the central bank', 'hospital networks', 'the election commission', 'a major port', 'the tax authority', 'satellite communications']);
      if (suspect) A.setRelation(w, target, suspect, -12);
      return createEvent(w, {
        category: 'technological', type: 'cyberattack', severity: what === 'the power grid' || what === 'the central bank' ? 3 : 2,
        title: `Cyberattack cripples ${what} in ${target.name}`,
        description: `${what.charAt(0).toUpperCase() + what.slice(1)} went dark for hours across ${target.name}. Investigators ${suspect ? `point to ${suspect.adjective} state hackers` : org ? `blame the ${org.name}` : 'have no leads'}. ${rng.pick(['Backup systems held.', 'Losses are estimated in the billions.', 'Officials call it an act of war.'])}`,
        location: { countryId: target.id }, actors: [ref('country', target.id), ...(suspect ? [ref('country', suspect.id)] : []), ...(org ? [ref('organization', org.id)] : [])],
        effects: [fx('country', target.id, 'stability', -3), fx('country', target.id, 'gdpGrowth', -0.4), ...(org ? [fx('organization', org.id, 'influence', 5)] : [])], tags: ['cyber', 'security', target.code], data: { suspect: suspect?.id },
      });
    },
  },
  {
    id: 'discovery',
    weight: () => 0.35,
    run: (w, rng) => {
      const c = pickCountry(w, rng, (x) => x.technology);
      const sci = A.peopleOf(w, c.id, 'scientist')[0];
      if (!sci) return null;
      const options = ['a biosignature on an icy moon', 'a new class of antibiotic', 'a 12,000-year-old sunken city', 'a fifth fundamental force candidate', 'a reversible aging mechanism in mice', 'a habitable exoplanet 40 light-years away', 'a way to read dreams from brain scans', 'a new form of matter', 'an ancient library beneath a desert', 'a bacterium that eats plastic in hours', 'a lost species of hominin, still alive', 'a mathematical proof that took 300 years', 'a room-temperature quantum memory', 'evidence of a ninth planet', 'a coral that survives boiling seas'];
      const recent = w.events.slice(-150).filter((e) => e.type === 'discovery').map((e) => e.data?.what);
      const fresh = options.filter((o) => !recent.includes(o));
      const what = rng.pick(fresh.length ? fresh : options);
      const sev = what.includes('biosignature') || what.includes('fundamental') || what.includes('aging') ? 4 : 3;
      return createEvent(w, {
        category: 'scientific', type: 'discovery', severity: sev as 3 | 4,
        title: `${c.adjective} scientists discover ${what.split(' ').slice(0, 5).join(' ')}`,
        description: `A team led by ${sci.name} announced the discovery of ${what}. ${rng.pick(['Peer review is pending, but the data looks solid.', 'The finding was published simultaneously in three journals.', 'Skeptics urge caution; supporters say it rewrites textbooks.'])}`,
        location: { cityId: sci.cityId }, actors: [ref('person', sci.id), ref('country', c.id)],
        effects: [fx('person', sci.id, 'fame', 20), fx('person', sci.id, 'influence', 8), fx('country', c.id, 'technology', 1.5)], tags: ['science', 'discovery', c.code], historic: sev >= 4, data: { what },
      });
    },
  },
  {
    id: 'culture',
    weight: () => 0.6,
    run: (w, rng) => {
      const pool = livePeople(w).filter((p) => ['artist', 'celebrity', 'athlete'].includes(p.profession));
      if (!pool.length) return null;
      const p = rng.pickWeighted(pool, (x) => x.fame + 10);
      const c = w.countries[p.countryId];
      const what = { artist: rng.pick(['premieres a film that sells out worldwide', 'unveils an installation that divides critics', 'releases an album that tops every chart', 'burns their own work in protest']), celebrity: rng.pick(['announces a run for office', 'launches a fashion empire', 'is booed off stage after political remarks', 'hosts a charity gala raising record sums']), athlete: rng.pick(['wins the world championship', 'breaks a decades-old record', 'is stripped of a title for doping', 'retires in tears after a final victory']) }[p.profession as 'artist' | 'celebrity' | 'athlete'];
      const negative = /booed|stripped|burns/.test(what);
      return createEvent(w, {
        category: 'cultural', type: 'culture.moment', severity: p.fame > 70 ? 3 : 2,
        title: `${p.name} ${what}`,
        description: `${p.name}, the ${c.adjective} ${p.profession}, ${what}. ${rng.pick(['Social media exploded.', 'The moment was watched by hundreds of millions.', 'Sponsors reacted within hours.', 'Fans gathered in the streets of ' + (w.cities[p.cityId]?.name ?? 'the capital') + '.'])}`,
        location: { cityId: p.cityId }, actors: [ref('person', p.id), ref('country', c.id)],
        effects: [fx('person', p.id, 'fame', 8), fx('person', p.id, 'reputation', negative ? -15 : 8), fx('person', p.id, 'wealth%', negative ? -10 : 15), fx('country', c.id, 'happiness', negative ? 0 : 1)], tags: ['culture', p.profession, c.code],
      });
    },
  },
  {
    id: 'crime',
    weight: (w) => 0.3 + Object.values(w.organizations).filter((o) => o.alive && o.type === 'criminal').length * 0.15,
    run: (w, rng) => {
      const crim = Object.values(w.organizations).filter((o) => o.alive && o.type === 'criminal');
      if (!crim.length) return null;
      const org = rng.pick(crim);
      const c = w.countries[org.countryId ?? ''];
      if (!c) return null;
      const city = A.pickCity(w, rng, c);
      const what = rng.pick(['a $400M gold heist', 'the assassination of a prosecutor', 'a ransomware hit on the port', 'a shootout with police', 'a corruption ring reaching the cabinet', 'a mass jailbreak']);
      return createEvent(w, {
        category: 'criminal', type: 'crime.major', severity: what.includes('cabinet') ? 3 : 2,
        title: `${org.name} linked to ${what} in ${city.name}`,
        description: `Authorities in ${c.name} tied ${what} to the ${org.name}. ${rng.pick(['Arrests are expected.', 'The syndicate denies involvement.', 'Witnesses have gone into hiding.', 'A reward has been offered.'])}`,
        location: { cityId: city.id }, actors: [ref('organization', org.id), ref('country', c.id), ref('city', city.id)],
        effects: [fx('organization', org.id, 'influence', 4), fx('country', c.id, 'stability', -1.5), fx('country', c.id, 'corruption', 1.5), fx('city', city.id, 'unrest', 3)], tags: ['crime', c.code],
      });
    },
  },
  {
    id: 'movement.founded',
    weight: (w) => 0.2 + countries(w).reduce((s, c) => s + (c.unrest > 35 || c.polarization > 60 ? 0.1 : 0), 0),
    run: (w, rng) => A.createMovement(w, rng, pickCountry(w, rng, (x) => x.unrest + x.polarization / 2)),
  },
  {
    id: 'epidemic',
    weight: () => 0.12,
    run: (w, rng) => A.epidemic(w, rng, pickCountry(w, rng, (x) => 110 - x.technology)),
  },
  {
    id: 'resource.discovery',
    weight: () => 0.15,
    run: (w, rng) => A.resourceDiscovery(w, rng, pickCountry(w, rng, () => 1), rng.pick(['oil', 'minerals', 'rareEarth', 'water'])),
  },
  {
    id: 'economy.shock',
    weight: (w) => 0.15,
    run: (w, rng) => {
      const c = pickCountry(w, rng, (x) => x.gdp ** 0.5);
      const kind: 'boom' | 'crash' | 'crisis' = c.gdpGrowth > 3 && rng.bool(0.5) ? 'boom' : c.debt > 120 || c.inflation > 12 ? 'crisis' : rng.pick(['boom', 'crash', 'crisis'] as const);
      return A.economicShock(w, rng, c, kind);
    },
  },
  {
    id: 'person.rise',
    weight: () => 0.4,
    run: (w, rng) => A.createPublicFigure(w, rng, pickCountry(w, rng, (x) => x.population ** 0.5), rng.pick(['entrepreneur', 'activist', 'artist', 'scientist', 'celebrity', 'journalist', 'politician'])),
  },
  {
    id: 'summit',
    weight: () => 0.25,
    run: (w, rng) => {
      const host = pickCountry(w, rng, (x) => x.gdp);
      const guests = rng.sample(countries(w).filter((x) => x.id !== host.id && !host.atWarWith.includes(x.id)), 3);
      if (guests.length < 2) return null;
      for (const g of guests) A.setRelation(w, host, g, 6);
      const topic = rng.pick(['climate finance', 'AI safety', 'trade tariffs', 'nuclear non-proliferation', 'migration', 'a regional security framework', 'debt relief']);
      return createEvent(w, {
        category: 'diplomatic', type: 'summit', severity: 2,
        title: `${host.name} hosts summit on ${topic}`,
        description: `Leaders of ${guests.map((g) => g.name).join(', ')} met in ${A.capitalOf(w, host).name} for talks on ${topic}. ${rng.pick(['A joint declaration was signed.', 'Talks ended without agreement.', 'A working group was formed.', 'One delegation walked out.'])}`,
        location: { countryId: host.id }, actors: [ref('country', host.id), ...guests.map((g) => ref('country', g.id))], effects: [fx('country', host.id, 'approval', 2)], tags: ['diplomacy', 'summit', host.code],
        data: { topic, host: host.id, guests: guests.map((g) => g.id) },
      });
    },
  },
  {
    id: 'strike',
    weight: (w) => 0.2 + countries(w).filter((c) => c.inflation > 8 || c.unemployment > 12).length * 0.1,
    run: (w, rng) => {
      const c = pickCountry(w, rng, (x) => x.inflation + x.unemployment);
      const unions = Object.values(w.organizations).filter((o) => o.alive && o.type === 'union' && o.countryId === c.id);
      const u = unions[0];
      const sector = rng.pick(['transport', 'health', 'energy', 'manufacturing'] as Sector[]);
      return createEvent(w, {
        category: 'economic', type: 'strike', severity: 2,
        title: `Nationwide ${sector} strike paralyzes ${c.name}`,
        description: `${u ? `${u.name} called` : 'Workers called'} a general strike across the ${sector} sector demanding wage increases to match ${c.inflation.toFixed(0)}% inflation. ${rng.pick(['Trains stopped.', 'Hospitals ran on skeleton crews.', 'The government threatened emergency laws.'])}`,
        location: { countryId: c.id }, actors: [ref('country', c.id), ...(u ? [ref('organization', u.id)] : [])],
        effects: [fx('country', c.id, 'gdpGrowth', -0.4), fx('country', c.id, 'unrest', 3), fx('country', c.id, 'approval', -2), ...(u ? [fx('organization', u.id, 'influence', 4)] : [])], tags: ['strike', 'labor', sector, c.code],
      });
    },
  },
  {
    id: 'assassination',
    weight: (w) => 0.03 + countries(w).reduce((s, c) => s + (c.stability < 35 ? 0.03 : 0) + c.atWarWith.length * 0.01, 0),
    run: (w, rng) => {
      const pool = livePeople(w).filter((p) => p.fame > 40 && (p.profession === 'politician' || p.profession === 'journalist' || p.profession === 'activist'));
      if (!pool.length) return null;
      const p = rng.pickWeighted(pool, (x) => 100 - (w.countries[x.countryId]?.stability ?? 50) + x.influence / 3);
      return A.killPerson(w, rng, p, 'assassination');
    },
  },
];

SPAWN_RULES.push(
  {
    id: 'space.milestone',
    weight: (w) => countries(w).reduce((s, c) => s + (c.technology > 70 ? 0.06 : 0), 0) + liveCompanies(w).filter((c) => c.sector === 'aerospace' && c.value > 20).length * 0.04,
    run: (w, rng) => {
      const aero = liveCompanies(w).filter((c) => c.sector === 'aerospace' && c.value > 20);
      const co = aero.length && rng.bool(0.6) ? rng.pickWeighted(aero, (c) => c.value) : null;
      const c = co ? w.countries[co.countryId] : pickCountry(w, rng, (x) => Math.max(0, x.technology - 60) ** 2);
      const done = new Set(w.events.filter((e) => e.type === 'space.milestone').map((e) => String(e.data?.milestone)));
      const ladder = ['first reusable orbital station module', 'first crewed lunar base', 'first asteroid mining sample return', 'first human on Mars', 'first permanent Mars settlement'];
      const milestone = ladder.find((m) => !done.has(m)) ?? 'a new deep-space mission';
      const sev = milestone.includes('Mars') ? 5 : 4;
      return createEvent(w, {
        category: 'scientific', type: 'space.milestone', severity: sev as 4 | 5,
        title: `${co ? co.name : c.name} achieves ${milestone}`,
        description: `${co ? `${co.name}'s` : `The ${c.adjective}`} mission succeeded: ${milestone}. Crowds watched the broadcast in ${A.capitalOf(w, c).name}; ${rng.pick(['rival programs vowed to catch up', 'the crew radioed a message for "all of humanity"', 'engineers wept on the live feed'])}.`,
        location: co ? { cityId: co.cityId } : { countryId: c.id }, actors: [...(co ? [ref('company', co.id), ref('person', co.ceoId)] : []), ref('country', c.id)],
        effects: [fx('country', c.id, 'approval', 6), fx('country', c.id, 'happiness', 4), fx('country', c.id, 'technology', 2), ...(co ? [fx('company', co.id, 'value%', 20), fx('person', co.ceoId, 'fame', 20)] : [])],
        tags: ['space', 'science', c.code], historic: true, data: { milestone, shocks: [{ sector: 'aerospace', pct: 0.08 }] },
      });
    },
  },
  {
    id: 'espionage',
    weight: (w) => 0.15 + liveCompanies(w).filter((c) => c.value > 100).length * 0.01,
    run: (w, rng) => {
      const big = liveCompanies(w).filter((c) => c.value > 50);
      if (big.length < 2) return null;
      const victim = rng.pickWeighted(big, (c) => c.value);
      const thieves = big.filter((c) => c.sector === victim.sector && c.id !== victim.id && c.countryId !== victim.countryId);
      if (!thieves.length) return null;
      const thief = rng.pick(thieves);
      const a = w.countries[victim.countryId], b = w.countries[thief.countryId];
      A.setRelation(w, a, b, -10);
      return createEvent(w, {
        category: 'corporate', type: 'espionage', severity: 3,
        title: `${thief.name} accused of stealing ${victim.name} secrets`,
        description: `Prosecutors in ${a.name} charged engineers linked to ${thief.name} with exfiltrating ${rng.pick(['chip designs', 'drug formulas', 'battery chemistry', 'source code', 'reactor blueprints'])} from ${victim.name}. ${b.name} called the charges "economic warfare".`,
        location: { cityId: victim.cityId }, actors: [ref('company', victim.id), ref('company', thief.id), ref('country', a.id), ref('country', b.id)],
        effects: [fx('company', victim.id, 'value%', -6), fx('company', thief.id, 'value%', 4), fx('company', thief.id, 'reputation', -15), fx('country', a.id, 'stability', -1)], tags: ['espionage', 'corporate', a.code, b.code],
      });
    },
  },
  {
    id: 'secession.movement',
    weight: (w) => countries(w).reduce((s, c) => s + (c.polarization > 60 && c.stability < 50 && c.cityIds.length >= 3 && !c.movements.some((m) => w.organizations[m]?.agenda === 'independence') ? 0.08 : 0), 0),
    run: (w, rng) => {
      const c = pickCountry(w, rng, (x) => (x.polarization > 60 && x.stability < 50 && x.cityIds.length >= 3 ? x.polarization : 0));
      if (c.cityIds.length < 3) return null;
      const city = w.cities[c.cityIds[c.cityIds.length - 1]];
      const ev = A.createMovement(w, rng, c, 'simulation', false, 'nationalist', `${city.name} Independence Front`, 'independence');
      ev.title = `${city.name} independence movement rises in ${c.name}`;
      ev.description = `Separatists in ${city.name} say the ${c.adjective} state no longer represents them. ${rng.pick(['A referendum is demanded.', 'Regional flags are appearing everywhere.', 'The capital calls them extremists.'])}`;
      ev.data = { cityId: city.id };
      return ev;
    },
  },
);

/** Countries hit by an automation shock in the last year. */
function recentShocks(w: World): Set<string> { const out = new Set<string>(); for (let i = w.events.length - 1; i >= 0; i--) { const e = w.events[i]; if (w.day - e.day > 365) break; if (e.type === 'automation.shock' && e.location.countryId) out.add(e.location.countryId); } return out; }

SPAWN_RULES.push({
  id: 'automation.shock',
  // One shock per country per year: the same economy does not get 'disrupted' every few weeks.
  weight: (w) => { const recent = recentShocks(w); return countries(w).reduce((s, c) => s + (c.technology > 78 && !recent.has(c.id) ? (c.technology - 78) / 120 : 0), 0); },
  run: (w, rng) => {
    const recent = recentShocks(w);
    const c = pickCountry(w, rng, (x) => (recent.has(x.id) ? 0 : Math.max(0, x.technology - 78)));
    if (c.technology <= 78 || recent.has(c.id)) return null;
    const cos = A.companiesOf(w, c.id).filter((x) => x.sector === 'technology');
    const co = cos.length ? rng.pickWeighted(cos, (x) => x.value) : null;
    const sector = rng.pick(['transport', 'retail', 'manufacturing', 'finance', 'media'] as const);
    return createEvent(w, {
      category: 'technological', type: 'automation.shock', severity: 3,
      title: `Automation wave wipes out ${sector} jobs in ${c.name}`,
      description: `${co ? `${co.name}'s` : 'A new generation of'} autonomous systems replaced an estimated ${rng.int(2, 9)}% of the ${c.adjective} ${sector} workforce in a single year. Productivity soared; so did anger.`,
      location: { countryId: c.id }, actors: [ref('country', c.id), ...(co ? [ref('company', co.id)] : [])],
      effects: [fx('country', c.id, 'unemployment', rng.float(1.5, 4)), fx('country', c.id, 'gdpGrowth', 1), fx('country', c.id, 'polarization', 5), fx('country', c.id, 'unrest', 5), ...(co ? [fx('company', co.id, 'value%', 8), fx('company', co.id, 'reputation', -10)] : [])],
      tags: ['automation', 'ai', sector, c.code], data: { sector, shocks: [{ sector, countryId: c.id, pct: -0.04 }, { sector: 'technology', countryId: c.id, pct: 0.03 }] },
    });
  },
});

SPAWN_RULES.push({
  id: 'feud',
  weight: (w) => 0.25,
  run: (w, rng) => {
    const pool = livePeople(w).filter((p) => p.fame > 35 && p.relationships.some((r) => r.strength < -0.5 && w.people[r.target.id]?.alive));
    if (!pool.length) return null;
    const a = rng.pickWeighted(pool, (p) => p.fame + p.personality.aggression * 30);
    const rel = rng.pick(a.relationships.filter((r) => r.strength < -0.5 && w.people[r.target.id]?.alive));
    const b = w.people[rel.target.id];
    const c = w.countries[a.countryId];
    const what = rng.pick(['a televised shouting match', 'a leaked voice message', 'dueling op-eds', 'a lawsuit', 'a public accusation of betrayal', 'a boycott campaign']);
    rel.strength = Math.max(-1, rel.strength - 0.1);
    return createEvent(w, {
      category: 'personal', type: 'feud', severity: a.fame > 70 && b.fame > 70 ? 3 : 2,
      title: `${a.name} and ${b.name} feud goes public`,
      description: `The long-running enmity between ${a.name} and ${b.name} erupted into ${what}. ${rng.pick(['Neither is backing down.', 'Allies are being forced to pick sides.', `${c?.adjective ?? 'The'} public cannot look away.`])}`,
      location: { cityId: a.cityId }, actors: [ref('person', a.id), ref('person', b.id)],
      effects: [fx('person', a.id, 'fame', 6), fx('person', b.id, 'fame', 6), fx('person', a.id, 'reputation', -4), fx('person', b.id, 'reputation', -4), ...(c ? [fx('country', c.id, 'polarization', 1)] : [])],
      tags: ['feud', 'people', ...(c ? [c.code] : [])],
    });
  },
});

SPAWN_RULES.push({
  id: 'partner.breakup',
  weight: () => 0.12,
  run: (w, rng) => {
    const pool = livePeople(w).filter((p) => p.fame > 12 && p.relationships.some((r) => r.type === 'partner' && w.people[r.target.id]?.alive));
    if (!pool.length) return null;
    // Recent scandals, feuds and downfalls strain partnerships the most.
    const strained = new Set(w.events.slice(-400).filter((e) => /scandal|feud|downfall|purge/.test(e.type)).flatMap((e) => e.actors.filter((a) => a.kind === 'person').map((a) => a.id)));
    const a = rng.pickWeighted(pool, (p) => (strained.has(p.id) ? 6 : 1) + p.personality.ambition * 2);
    const rel = a.relationships.find((r) => r.type === 'partner' && w.people[r.target.id]?.alive)!;
    const b = w.people[rel.target.id];
    if (!strained.has(a.id) && rng.next() > 0.35) return null;
    a.relationships = a.relationships.filter((r) => r !== rel);
    b.relationships = b.relationships.filter((r) => r.target.id !== a.id);
    relate(w, a, b, rng.bool(0.4) ? 'enemy' : 'friend', rng.bool(0.4) ? -0.6 : 0.1);
    a.history.push({ day: w.day, text: `Separated from ${b.name}.` }); b.history.push({ day: w.day, text: `Separated from ${a.name}.` });
    const c = w.countries[a.countryId];
    const famous = a.fame > 60 || b.fame > 60;
    return createEvent(w, {
      category: 'personal', type: 'breakup', severity: famous ? 2 : 1,
      title: `${a.name} and ${b.name} split`,
      description: `${famous ? 'After weeks of speculation, ' : ''}${a.name} and ${b.name} confirmed they have separated${strained.has(a.id) ? `, citing "the pressure of recent events"` : ''}. ${rng.pick(['Neither will comment further.', 'Lawyers are reportedly involved.', 'Friends say the split was amicable.', 'A joint statement asked for privacy.'])}`,
      location: { cityId: a.cityId }, actors: [ref('person', a.id), ref('person', b.id)],
      effects: [fx('person', a.id, 'fame', famous ? 3 : 1), fx('person', a.id, 'wealth%', -8)],
      tags: ['personal', 'breakup', ...(c ? [c.code] : [])],
    });
  },
});

SPAWN_RULES.push({
  id: 'funder.withdraws',
  weight: () => 0.14,
  run: (w, rng) => {
    const pool = livePeople(w).filter((p) => p.relationships.some((r) => r.type === 'funder' && w.people[r.target.id]?.alive));
    if (!pool.length) return null;
    const a = rng.pickWeighted(pool, (p) => 1 + Math.max(0, -p.reputation) / 20 + (p.affiliations.length ? 1 : 0));
    const rel = a.relationships.find((r) => r.type === 'funder' && w.people[r.target.id]?.alive)!;
    const funder = w.people[rel.target.id];
    // Backers walk when reputation sours or the relationship has cooled.
    if (a.reputation > 10 && rel.strength > 0.2 && rng.next() > 0.25) return null;
    const co = a.affiliations.map((id) => w.companies[id]).find((x) => x && x.alive);
    a.relationships = a.relationships.filter((r) => r !== rel);
    relate(w, a, funder, 'rival', -0.5);
    a.history.push({ day: w.day, text: `Lost the backing of ${funder.name}.` }); funder.history.push({ day: w.day, text: `Pulled funding from ${a.name}.` });
    const c = w.countries[a.countryId];
    return createEvent(w, {
      category: co ? 'corporate' : 'personal', type: 'funder.withdraws', severity: co && co.value > 5000 ? 3 : 2,
      title: co ? `${funder.name} pulls backing from ${co.name}` : `${funder.name} cuts off ${a.name}`,
      description: `${funder.name}, long the money behind ${a.name}, ${rng.pick(['sold their stake', 'declined to join the next round', 'withdrew all support', 'ended the arrangement in a two-line letter'])}${a.reputation < 0 ? ' amid concerns about reputational damage' : ''}. ${co ? `${co.name} must now find new capital.` : `${a.name} is said to be furious.`}`,
      location: { cityId: a.cityId }, actors: [ref('person', funder.id), ref('person', a.id), ...(co ? [ref('company', co.id)] : [])],
      effects: [...(co ? [fx('company', co.id, 'value%', -10), fx('company', co.id, 'reputation', -6)] : []), fx('person', a.id, 'wealth%', -12), fx('person', a.id, 'influence', -4)],
      tags: ['funding', 'personal', ...(c ? [c.code] : [])],
    });
  },
});

SPAWN_RULES.push({
  id: 'religion.tide',
  weight: (w) => Object.values(w.organizations).filter((o) => o.alive && o.type === 'religion').length * 0.05,
  run: (w, rng) => {
    const orgs = Object.values(w.organizations).filter((o) => o.alive && o.type === 'religion' && o.countryId);
    if (!orgs.length) return null;
    const org = rng.pickWeighted(orgs, (o) => 5 + o.support);
    const c = w.countries[org.countryId!]; const leader = org.leaderId ? w.people[org.leaderId] : undefined;
    if (!c) return null;
    // Faith grows in hard times and in unfree states; it ebbs in prosperous, secular ones.
    const hardTimes = c.happiness < 45 || c.unrest > 40 || c.atWarWith.length > 0;
    const up = rng.next() < (hardTimes ? 0.7 : 0.35) + (c.freedom < 40 ? 0.1 : 0);
    const delta = rng.float(3, 9) * (up ? 1 : -1);
    org.support = clamp(org.support + delta, 1, 100);
    if (up) org.influence = clamp(org.influence + 2, 0, 100);
    return createEvent(w, {
      category: 'cultural', type: up ? 'religion.revival' : 'religion.decline', severity: org.support > 40 ? 3 : 2,
      title: up ? `Revival: "${org.name}" ${rng.pick(['fills the squares', 'sweeps the countryside', 'wins the young'])} of ${c.name}` : `"${org.name}" loses its grip on ${c.name}`,
      description: up ? `${hardTimes ? `With ${c.name} ${c.atWarWith.length ? 'at war' : 'in turmoil'}, ` : ''}${org.name} reports ${rng.pick(['record gatherings', 'a wave of conversions', 'temples that cannot hold the crowds'])}. ${leader ? `${leader.name} preached to ${rng.int(20, 400)},000 people this week.` : ''} Support stands near ${org.support.toFixed(0)}%.`
        : `Attendance at ${org.name} ${rng.pick(['has collapsed among the under-30s', 'is falling for the third year', 'thins as prosperity spreads'])}. ${leader ? `${leader.name} blamed "${rng.pick(['the machines', 'foreign influence', 'moral decay', 'our own complacency'])}".` : ''}`,
      location: { countryId: c.id }, actors: [ref('organization', org.id), ...(leader ? [ref('person', leader.id)] : []), ref('country', c.id)],
      effects: up ? [fx('country', c.id, 'polarization', 2), fx('country', c.id, 'happiness', hardTimes ? 1 : 0)] : [fx('country', c.id, 'polarization', -1)],
      tags: ['religion', 'culture', c.code],
    });
  },
});

SPAWN_RULES.push({
  id: 'religion.schism',
  weight: (w) => Object.values(w.organizations).filter((o) => o.alive && o.type === 'religion' && o.support > 20).length * 0.04,
  run: (w, rng) => {
    const orgs = Object.values(w.organizations).filter((o) => o.alive && o.type === 'religion' && o.support > 20 && o.countryId);
    if (!orgs.length) return null;
    const org = rng.pickWeighted(orgs, (o) => o.support);
    const c = w.countries[org.countryId!]; if (!c) return null;
    const fam = A.familyOf(w, c);
    const old = org.leaderId ? w.people[org.leaderId] : undefined;
    const rebel = makePerson(w, rng, fam, c, A.pickCity(w, rng, c), 'religious-leader', 1);
    const issue = rng.pick(['the succession', 'whether machines have souls', 'the true date of the prophecy', 'money and who keeps it', 'a doctrine of purity', 'cooperation with the state']);
    const splinter = makeOrg(w, rng, fam, c, 'religion', `${rng.pick(['Reformed', 'True', 'Orthodox', 'New', 'Free'])} ${org.name}`, rebel.id, org.ideology, org.agenda);
    splinter.founded = w.day; splinter.support = clamp(org.support * rng.float(0.3, 0.5), 1, 100); splinter.influence = clamp(org.influence * 0.5, 0, 100);
    org.support = clamp(org.support - splinter.support, 1, 100);
    rebel.affiliations.push(splinter.id); rebel.fame = clamp(40 + org.support / 2, 20, 90); rebel.objective = `lead the faithful away from ${org.name}`;
    if (old) { relate(w, rebel, old, 'enemy', -0.8); old.history.push({ day: w.day, text: `Lost part of ${org.name} to a schism led by ${rebel.name}.` }); }
    rebel.history.push({ day: w.day, text: `Broke with ${org.name} over ${issue} and founded ${splinter.name}.` });
    org.history.push({ day: w.day, text: `Schism: ${splinter.name} broke away over ${issue}.` });
    return createEvent(w, {
      category: 'cultural', type: 'religion.schism', severity: org.support + splinter.support > 45 ? 4 : 3,
      title: `Schism splits "${org.name}" in ${c.name}`,
      description: `A bitter dispute over ${issue} has torn ${org.name} in two. ${rebel.name} walked out with roughly ${splinter.support.toFixed(0)}% of the faithful to found ${splinter.name}. ${old ? `${old.name} called the breakaway "${rng.pick(['a heresy', 'a betrayal', 'a passing fever'])}".` : ''} ${rng.pick(['Families are split down the middle.', 'Street clashes were reported in two cities.', 'Both sides claim the holy sites.'])}`,
      location: { cityId: rebel.cityId, countryId: c.id }, actors: [ref('organization', org.id), ref('organization', splinter.id), ref('person', rebel.id), ...(old ? [ref('person', old.id)] : []), ref('country', c.id)],
      effects: [fx('country', c.id, 'polarization', 7), fx('country', c.id, 'unrest', 3), fx('country', c.id, 'stability', -2)],
      tags: ['religion', 'schism', c.code], historic: org.support + splinter.support > 45,
    });
  },
});

SPAWN_RULES.push({
  id: 'mentor.turns',
  weight: () => 0.1,
  run: (w, rng) => {
    // A mentor whose protégé has outgrown them, and who is ambitious enough to mind, turns on them.
    const pool = livePeople(w).filter((p) => p.relationships.some((r) => r.type === 'mentor' && r.strength > 0 && w.people[r.target.id]?.alive));
    const pairs = pool.flatMap((protege) => protege.relationships.filter((r) => r.type === 'mentor' && r.strength > 0 && w.people[r.target.id]?.alive).map((r) => ({ protege, mentor: w.people[r.target.id], rel: r })));
    const ripe = pairs.filter(({ protege, mentor }) => (protege.fame > mentor.fame + 15 || protege.influence > mentor.influence + 15) && mentor.personality.ambition > 0.55);
    if (!ripe.length) return null;
    const { protege, mentor } = rng.pickWeighted(ripe, ({ protege: a, mentor: m }) => a.fame + m.personality.ambition * 40);
    protege.relationships = protege.relationships.filter((r) => r.target.id !== mentor.id);
    mentor.relationships = mentor.relationships.filter((r) => r.target.id !== protege.id);
    relate(w, mentor, protege, 'rival', -0.6);
    mentor.history.push({ day: w.day, text: `Publicly disowned former protégé ${protege.name}.` });
    protege.history.push({ day: w.day, text: `Was disowned by mentor ${mentor.name}.` });
    protege.memories.push({ day: w.day, text: `${mentor.name}, who taught me everything, turned on me in public.`, weight: 0.7 });
    const c = w.countries[protege.countryId];
    return createEvent(w, {
      category: 'personal', type: 'mentor.turns', severity: protege.fame > 60 ? 3 : 2,
      title: `${mentor.name} turns on protégé ${protege.name}`,
      description: `${mentor.name}, long credited with ${protege.name}'s rise, ${rng.pick(['called them "a creation that forgot its creator"', 'published a memoir settling every score', 'endorsed their rival', 'told an interviewer the student "learned nothing that mattered"'])}. ${rng.pick(['The rupture stunned their circle.', 'Friends had seen it coming for years.', `${protege.firstName} has not responded.`])}`,
      location: { cityId: mentor.cityId }, actors: [ref('person', mentor.id), ref('person', protege.id)],
      effects: [fx('person', mentor.id, 'fame', 5), fx('person', protege.id, 'reputation', -4), fx('person', protege.id, 'fame', 3)],
      tags: ['mentor', 'feud', 'people', ...(c ? [c.code] : [])],
    });
  },
});

SPAWN_RULES.push({
  id: 'water.dispute',
  weight: (w) => countries(w).reduce((s, c) => s + ((c.resources.water ?? 50) < 35 ? 0.08 : 0), 0),
  run: (w, rng) => {
    // Water wars: a thirsty country eyes a water-rich neighbour's rivers; dams and diversions poison relations.
    const thirsty = countries(w).filter((c) => (c.resources.water ?? 50) < 35 && c.neighbors.some((n) => (w.countries[n]?.resources.water ?? 50) > (c.resources.water ?? 50) + 25));
    if (!thirsty.length) return null;
    const a = rng.pickWeighted(thirsty, (c) => 60 - (c.resources.water ?? 50) + c.unrest / 4);
    const rich = a.neighbors.map((n) => w.countries[n]).filter((b) => b && (b.resources.water ?? 50) > (a.resources.water ?? 50) + 25 && !a.atWarWith.includes(b.id));
    if (!rich.length) return null;
    const b = rng.pickWeighted(rich, (x) => x.resources.water ?? 50);
    const what = rng.pick([`${b.name}'s new dam`, 'a river diversion upstream', 'the shrinking shared aquifer', 'irrigation canals cut across the border']);
    return A.shiftTension(w, rng, a, b, rng.int(14, 28), 'simulation', false, `a water dispute over ${what}`);
  },
});

function leaderAgg(w: World, c: Country): number { return w.people[c.leaderId]?.personality.aggression ?? 0.5; }

/** Roll for spontaneous events for this day. */
export function spawnDailyEvents(world: World, rng: RNG): WorldEvent[] {
  const out: WorldEvent[] = [];
  const nCountries = Object.keys(world.countries).length;
  // Expected events per day scales gently with world size; early days are richer so the first minutes feel alive.
  const boost = world.day < 20 ? 1.8 : 1;
  let expected = (0.55 + nCountries / 60) * boost;
  const weights = SPAWN_RULES.map((r) => Math.max(0, r.weight(world, rng)));
  while (expected > 0) {
    if (rng.next() < Math.min(1, expected)) {
      const rule = rng.pickWeighted(SPAWN_RULES, (r) => weights[SPAWN_RULES.indexOf(r)]);
      try {
        const ev = rule.run(world, rng);
        if (ev) out.push(ev);
      } catch (err) {
        console.warn('[spawn] rule failed', rule.id, err);
      }
    }
    expected -= 1;
  }
  return out;
}
