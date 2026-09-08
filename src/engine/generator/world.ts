/**
 * World generation orchestrator. Produces a fully populated World from a seed.
 */
import { RNG, clamp } from '../rng';
import { generateGeography } from './geography';
import {
  SECTORS, SAVE_VERSION, type World, type Country, type City, type Person, type Company, type Organization, type MediaOutlet,
  type GovernmentType, type Ideology, type Sector, type Profession, type FlagSpec, type OutletBias, type OrgType, type Personality, type ID,
} from '../types';
import { nextId } from '../ids';
import { DAYS_PER_YEAR } from '../types';
import * as N from '../names';
import { fillMarkets } from '../simulation/markets';

const GOVS: GovernmentType[] = ['democracy', 'republic', 'monarchy', 'technocracy', 'autocracy', 'military-junta', 'theocracy', 'federation', 'oligarchy', 'council'];
const IDEOS: Ideology[] = ['liberal', 'conservative', 'socialist', 'nationalist', 'technocratic', 'green', 'libertarian', 'populist', 'traditionalist', 'progressive'];
const VALUES = ['honor', 'innovation', 'tradition', 'community', 'liberty', 'order', 'faith', 'ambition', 'harmony', 'resilience', 'craft', 'hospitality', 'secrecy', 'openness', 'thrift'];
const TRAITS = ['visionary', 'ruthless', 'charming', 'reclusive', 'idealistic', 'pragmatic', 'volatile', 'disciplined', 'eccentric', 'calculating', 'generous', 'paranoid', 'brilliant', 'stubborn', 'diplomatic', 'reckless', 'devout', 'cynical', 'loyal', 'restless'];

export interface GenerateOptions {
  seed: string;
  name?: string;
  startYear?: number;
  countries?: number;
}

export function generateWorld(opts: GenerateOptions): World {
  const seed = opts.seed;
  const rng = new RNG(seed);
  const startYear = opts.startYear ?? 2040;
  const geo = generateGeography(seed, 240, 120, opts.countries ?? 32);

  const world: World = {
    meta: { seed, name: opts.name ?? worldName(rng.fork('wname')), createdAt: Date.now(), version: SAVE_VERSION, startYear },
    day: 0,
    countries: {}, cities: {}, people: {}, companies: {}, organizations: {}, outlets: {},
    events: [], news: [], social: [], pending: [], indexes: {}, commodities: {}, interventions: [], summaries: [], trending: [],
    geography: { width: geo.width, height: geo.height, cells: Array.from(geo.region), elevation: Array.from(geo.elevation, (v) => Math.round(v * 1000) / 1000), moisture: Array.from(geo.moisture, (v) => Math.round(v * 100) / 100), countryOrder: [] },
    stats: { eventsGenerated: 0, ticks: 0, lastYearlyDay: 0, lastMonthlyDay: 0, lastWeeklyDay: 0 },
    rngState: [0, 0, 0, 0],
    counters: {},
  };

  // ---- Countries -----------------------------------------------------------
  const families = N.familyById('latin');
  const famList = ['latin', 'nordic', 'east', 'african', 'anglo', 'slavic', 'arabic'];
  const usedNames = new Set<string>();
  const countryFamily: Record<ID, string> = {};
  const hueStep = 360 / geo.regionCount;
  const hueOffset = rng.float(0, 360);
  for (let r = 0; r < geo.regionCount; r++) {
    const crng = rng.fork('country' + r);
    // Family by geography (latitude bands) for coherence, with randomness
    const cy = geo.regionCentroid[r].y / geo.height;
    const famChoice = crng.bool(0.6)
      ? (cy < 0.3 ? crng.pick(['nordic', 'slavic', 'anglo']) : cy < 0.6 ? crng.pick(['latin', 'east', 'arabic', 'anglo']) : crng.pick(['african', 'latin', 'east']))
      : crng.pick(famList);
    const fam = N.familyById(famChoice);
    let nm = N.countryName(crng, fam);
    let guard = 0;
    while (usedNames.has(nm.name) && guard++ < 20) nm = N.countryName(crng, fam);
    usedNames.add(nm.name);
    const id = nextId(world, 'c');
    countryFamily[id] = famChoice;
    const area = geo.regionArea[r];
    const gov = crng.pickWeighted(GOVS, (g) => ({ democracy: 4, republic: 4, monarchy: 1.5, technocracy: 1, autocracy: 2, 'military-junta': 0.8, theocracy: 0.7, federation: 2, oligarchy: 1, council: 0.8 })[g]);
    const ideology = crng.pick(IDEOS);
    const hue = (hueOffset + r * hueStep + crng.float(-8, 8)) % 360;
    const tech = clamp(crng.gauss(55, 18), 15, 95);
    const popDensity = crng.float(0.15, 1.6) * (0.5 + geo.moisture[geo.regionCells[r][0]]);
    const population = Math.round(area * popDensity * 1_000_000 * crng.float(0.6, 1.4));
    const gdpPerCapita = (tech / 100) ** 1.6 * crng.float(6, 70) * 1000; // USD
    const gdp = Math.round((population * gdpPerCapita) / 1e9); // billions
    const c: Country = {
      id, kind: 'country', name: nm.name, adjective: nm.adjective, code: nm.code, hue, color: `hsl(${hue.toFixed(0)} 60% 55%)`,
      flag: makeFlag(crng, hue), capitalId: '', cityIds: [], leaderId: '', government: gov, ideology,
      population, gdp: Math.max(3, gdp), gdpGrowth: crng.float(-1, 5), inflation: crng.float(0.5, 9), unemployment: crng.float(3, 18),
      happiness: clamp(crng.gauss(58, 14), 15, 92), stability: clamp(crng.gauss(62, 16), 12, 95), approval: clamp(crng.gauss(50, 14), 10, 90),
      military: clamp(crng.gauss(40, 22) * (gdp > 500 ? 1.3 : 1), 3, 98), technology: tech, corruption: clamp(crng.gauss(40, 20), 3, 95),
      freedom: gov === 'autocracy' || gov === 'military-junta' || gov === 'theocracy' ? clamp(crng.gauss(30, 15), 3, 60) : clamp(crng.gauss(65, 15), 20, 97),
      polarization: clamp(crng.gauss(45, 18), 5, 92), unrest: clamp(crng.gauss(20, 12), 0, 70),
      resources: { oil: clamp(crng.gauss(35, 28), 0, 100), minerals: clamp(crng.gauss(45, 25), 0, 100), farmland: clamp(crng.gauss(50, 22), 0, 100), water: clamp(crng.gauss(55, 22), 0, 100), rareEarth: clamp(crng.gauss(20, 22), 0, 100) },
      climateRisk: clamp(crng.gauss(40, 22), 3, 97), debt: clamp(crng.gauss(70, 35), 5, 220),
      electionEvery: gov === 'democracy' || gov === 'republic' || gov === 'federation' ? crng.pick([4, 4, 5, 6]) : gov === 'council' || gov === 'technocracy' ? 6 : 0,
      nextElectionYear: 0,
      centroid: geo.regionCentroid[r], area, neighbors: [], relations: {}, alliances: [], atWarWith: [], tradePartners: [], movements: [],
      founded: -crng.int(30, 400) * DAYS_PER_YEAR,
      culture: { language: fam.id === 'latin' ? N.makeWord(crng, fam, 2) : N.makeWord(crng, fam, 2), values: crng.sample(VALUES, 3), religionShare: clamp(crng.gauss(45, 25), 2, 98) },
      history: [],
    };
    c.nextElectionYear = c.electionEvery ? startYear + crng.int(0, c.electionEvery - 1) : 0;
    world.countries[id] = c;
    world.geography.countryOrder.push(id);
  }
  // Neighbors
  const order = world.geography.countryOrder;
  for (let r = 0; r < geo.regionCount; r++) {
    world.countries[order[r]].neighbors = Array.from(geo.regionNeighbors[r]).map((o) => order[o]);
  }

  // ---- Cities --------------------------------------------------------------
  for (let r = 0; r < geo.regionCount; r++) {
    const country = world.countries[order[r]];
    const crng = rng.fork('cities' + r);
    const fam = N.familyById(countryFamily[country.id]);
    const cells = geo.regionCells[r];
    const nCities = clamp(Math.round(2 + Math.sqrt(cells.length) / 1.6 + crng.int(0, 2)), 2, 9);
    const chosen: number[] = [];
    const minD = Math.max(2.5, Math.sqrt(cells.length / nCities) * 0.9);
    let tries = 0;
    while (chosen.length < nCities && tries++ < 400) {
      const cell = crng.pickWeighted(cells, (i) => (geo.coastal[i] ? 2.2 : 1) * (1 - Math.max(0, geo.elevation[i] - 0.75) * 3) * (0.4 + geo.moisture[i]));
      const x = cell % geo.width, y = Math.floor(cell / geo.width);
      if (chosen.some((o) => { let dx = Math.abs(o % geo.width - x); dx = Math.min(dx, geo.width - dx); return Math.hypot(dx, Math.floor(o / geo.width) - y) < minD; })) continue;
      chosen.push(cell);
    }
    if (!chosen.length) chosen.push(cells[Math.floor(cells.length / 2)]);
    let remaining = country.population;
    const used = new Set<string>();
    chosen.forEach((cell, idx) => {
      const id = nextId(world, 'city');
      let name = N.cityName(crng, fam); let g = 0;
      while (used.has(name) && g++ < 10) name = N.cityName(crng, fam);
      used.add(name);
      const share = idx === 0 ? crng.float(0.12, 0.28) : crng.float(0.03, 0.12);
      const pop = Math.round(country.population * share);
      remaining -= pop;
      const city: City = {
        id, kind: 'city', name, countryId: country.id, x: (cell % geo.width) + 0.5, y: Math.floor(cell / geo.width) + 0.5,
        population: pop, capital: idx === 0, coastal: !!geo.coastal[cell], prosperity: clamp(country.technology * 0.6 + crng.gauss(20, 12), 5, 98),
        unrest: clamp(country.unrest + crng.gauss(0, 8), 0, 100), specialties: crng.sample(SECTORS, 2),
      };
      world.cities[id] = city;
      country.cityIds.push(id);
      if (idx === 0) country.capitalId = id;
    });
  }

  // ---- International relations ---------------------------------------------
  const relRng = rng.fork('relations');
  const ids = Object.keys(world.countries);
  for (const a of ids) for (const b of ids) {
    if (a >= b) continue;
    const A = world.countries[a], B = world.countries[b];
    const neighbor = A.neighbors.includes(b);
    let rel = relRng.gauss(neighbor ? 5 : 10, neighbor ? 40 : 25);
    if (A.ideology === B.ideology) rel += 15;
    if (A.government === B.government) rel += 8;
    if ((A.freedom > 60) !== (B.freedom > 60)) rel -= 12;
    rel = clamp(rel, -85, 90);
    A.relations[b] = rel; B.relations[a] = rel;
  }
  // Alliances: cluster high-relation pairs
  for (const a of ids) {
    const A = world.countries[a];
    for (const b of ids) {
      if (a === b) continue;
      if (A.relations[b] > 55 && relRng.bool(0.5) && !A.alliances.includes(b)) { A.alliances.push(b); world.countries[b].alliances.push(a); }
      if (A.relations[b] > 20 && relRng.bool(0.45) && !A.tradePartners.includes(b)) { A.tradePartners.push(b); world.countries[b].tradePartners.push(a); }
    }
  }
  // One or two smoldering conflicts to make the world feel alive from minute one
  const hostile = ids.flatMap((a) => world.countries[a].neighbors.filter((b) => a < b && world.countries[a].relations[b] < -45).map((b) => [a, b] as const));
  relRng.shuffle(hostile);
  for (const [a, b] of hostile.slice(0, relRng.int(0, 1))) {
    world.countries[a].atWarWith.push(b); world.countries[b].atWarWith.push(a);
    world.countries[a].relations[b] = -95; world.countries[b].relations[a] = -95;
  }

  // ---- People -----------------------------------------------------------------
  const peopleRng = rng.fork('people');
  for (const country of Object.values(world.countries)) {
    const fam = N.familyById(countryFamily[country.id]);
    const capital = world.cities[country.capitalId];
    // Leader
    const leader = makePerson(world, peopleRng, fam, country, capital, 'politician', 1);
    leader.title = leaderTitle(country.government);
    leader.influence = clamp(50 + country.gdp / 60 + peopleRng.gauss(10, 10), 40, 98);
    leader.fame = clamp(leader.influence + peopleRng.gauss(0, 10), 30, 99);
    leader.objective = peopleRng.pick(['consolidate power', 'win the next election', 'modernize the economy', 'secure the borders', 'expand national influence', 'reform the state', 'survive a brewing scandal']);
    leader.history.push({ day: -peopleRng.int(1, 8) * DAYS_PER_YEAR, text: `Became ${leader.title} of ${country.name}.` });
    country.leaderId = leader.id;
    // Supporting cast per country scaled by size
    const nPeople = clamp(Math.round(4 + country.population / 25_000_000 + country.gdp / 250), 4, 14);
    const profs: Profession[] = ['scientist', 'journalist', 'entrepreneur', 'activist', 'general', 'celebrity', 'criminal', 'artist', 'executive', 'diplomat', 'athlete', 'engineer', 'politician', 'religious-leader', 'citizen'];
    for (let i = 0; i < nPeople; i++) {
      const prof = peopleRng.pickWeighted(profs, (p) => ({ scientist: 2, journalist: 2, entrepreneur: 2.5, activist: 1.5, general: 1, celebrity: 1.5, criminal: 0.8, artist: 1, executive: 1.5, diplomat: 1, athlete: 0.8, engineer: 1, politician: 2, 'religious-leader': 0.5, citizen: 1.2 })[p]);
      const city = world.cities[peopleRng.pick(country.cityIds)];
      makePerson(world, peopleRng, fam, country, city, prof, i < 3 ? 1 : 2);
    }
  }

  // ---- Companies --------------------------------------------------------------
  const compRng = rng.fork('companies');
  for (const country of Object.values(world.countries)) {
    const fam = N.familyById(countryFamily[country.id]);
    const nComp = clamp(Math.round(2 + country.gdp / 180 + compRng.int(0, 2)), 2, 9);
    for (let i = 0; i < nComp; i++) {
      const city = world.cities[compRng.pickWeighted(country.cityIds, (id) => world.cities[id].population)];
      const sector = compRng.pickWeighted(SECTORS, (s) => (city.specialties.includes(s) ? 3 : 1) * (s === 'energy' && country.resources.oil > 60 ? 2 : 1) * (s === 'mining' && country.resources.minerals > 60 ? 2 : 1));
      makeCompany(world, compRng, fam, country, city, sector, i === 0 ? country.gdp * compRng.float(0.05, 0.15) : country.gdp * compRng.float(0.005, 0.06));
    }
  }

  // ---- Organizations ------------------------------------------------------------
  const orgRng = rng.fork('orgs');
  for (const country of Object.values(world.countries)) {
    const fam = N.familyById(countryFamily[country.id]);
    // Government org
    makeOrg(world, orgRng, fam, country, 'government', `${country.name} Government`, country.leaderId, country.ideology, 'govern the nation');
    // Ruling party + opposition (if elections)
    if (country.electionEvery) {
      makeOrg(world, orgRng, fam, country, 'party', N.orgName(orgRng, fam, 'party', country.adjective), country.leaderId, country.ideology, 'retain power');
      const oppIdeo = orgRng.pick(IDEOS.filter((i) => i !== country.ideology));
      const opp = Object.values(world.people).find((p) => p.countryId === country.id && p.profession === 'politician' && p.id !== country.leaderId);
      const o = makeOrg(world, orgRng, fam, country, 'party', N.orgName(orgRng, fam, 'party', country.adjective), opp?.id ?? null, oppIdeo, 'win the next election');
      if (opp) { opp.ideology = oppIdeo; opp.affiliations.push(o.id); opp.objective = 'win the next election'; }
    }
    // Movements/research/military/others
    const n = orgRng.int(1, 3);
    const types: OrgType[] = ['movement', 'research', 'military', 'ngo', 'criminal', 'religion', 'union'];
    for (let i = 0; i < n; i++) {
      const orgWeights: Record<string, number> = { movement: 3, research: 2, military: 1.2, ngo: 1.5, criminal: country.corruption > 55 ? 2 : 0.6, religion: country.culture.religionShare > 60 ? 2 : 0.5, union: 1 };
      const t = orgRng.pickWeighted(types, (x) => orgWeights[x] ?? 1);
      const leader = Object.values(world.people).find((p) => p.countryId === country.id && !p.affiliations.length && p.profession !== 'politician');
      const org = makeOrg(world, orgRng, fam, country, t, N.orgName(orgRng, fam, t, country.adjective), leader?.id ?? null, t === 'movement' ? orgRng.pick(IDEOS) : undefined, agendaFor(orgRng, t));
      if (leader) leader.affiliations.push(org.id);
      if (t === 'movement') country.movements.push(org.id);
    }
  }
  // International alliances as organizations
  const seen = new Set<string>();
  for (const c of Object.values(world.countries)) {
    if (c.alliances.length >= 2 && !seen.has(c.id)) {
      const members = [c.id, ...c.alliances].filter((id) => !seen.has(id));
      if (members.length < 3) continue;
      members.forEach((m) => seen.add(m));
      const fam = N.familyById(countryFamily[c.id]);
      const org = makeOrg(world, orgRng, fam, null, 'alliance', N.orgName(orgRng, fam, 'alliance'), c.leaderId, undefined, 'collective security and trade');
      org.memberIds = members;
      org.influence = clamp(members.reduce((s, m) => s + world.countries[m].military, 0) / members.length + 10, 10, 99);
    }
  }

  // ---- Media outlets ----------------------------------------------------------
  const mediaRng = rng.fork('media');
  const biasList: OutletBias[] = ['establishment', 'opposition', 'sensational', 'business', 'independent', 'state'];
  for (const country of Object.values(world.countries)) {
    const fam = N.familyById(countryFamily[country.id]);
    const n = country.gdp > 400 ? 2 : 1;
    const picks = mediaRng.sample(biasList.filter((b) => (b === 'state' ? country.freedom < 55 : true)), n);
    for (const bias of picks) makeOutlet(world, mediaRng, fam, country, bias);
  }
  for (let i = 0; i < 3; i++) makeOutlet(world, mediaRng, N.familyById('anglo'), null, 'international');
  // sensational global tabloid
  const tab = makeOutlet(world, mediaRng, N.familyById('anglo'), null, 'sensational');
  tab.name = mediaRng.pick(['The Daily Flash', 'Planet Pulse', 'Global Shock', 'Hyperwire']);

  // ---- Relationships between people ---------------------------------------------
  const relRng2 = rng.fork('people-relations');
  const allPeople = Object.values(world.people);
  const byCountry = new Map<ID, Person[]>();
  for (const p of allPeople) { const arr = byCountry.get(p.countryId) ?? []; arr.push(p); byCountry.set(p.countryId, arr); }
  const link = (a: Person, b: Person, type: import('../types').Relationship['type'], strength: number, mutualType = type) => {
    if (a.id === b.id || a.relationships.some((r) => r.target.id === b.id)) return;
    a.relationships.push({ target: { kind: 'person', id: b.id }, type, strength, since: world.day - relRng2.int(1, 20) * DAYS_PER_YEAR });
    b.relationships.push({ target: { kind: 'person', id: a.id }, type: mutualType, strength, since: a.relationships[a.relationships.length - 1].since });
  };
  for (const [cid, people] of byCountry) {
    const c = world.countries[cid];
    const leader = world.people[c.leaderId];
    for (const p of people) {
      // Rivals: same profession, similar influence
      const rivals = people.filter((o) => o.id !== p.id && o.profession === p.profession);
      if (rivals.length && relRng2.bool(0.5)) link(p, relRng2.pick(rivals), 'rival', -relRng2.float(0.3, 0.9));
      // Allies / friends across professions
      if (relRng2.bool(0.6)) link(p, relRng2.pick(people), relRng2.bool(0.5) ? 'ally' : 'friend', relRng2.float(0.3, 0.9));
      // Mentors: older person of related profession
      const elders = people.filter((o) => o.id !== p.id && o.birthDay < p.birthDay - 15 * DAYS_PER_YEAR);
      if (elders.length && relRng2.bool(0.35)) link(p, relRng2.pick(elders), 'mentor', relRng2.float(0.4, 0.9), 'friend');
      // Family: share a last name occasionally
      const fam = people.filter((o) => o.id !== p.id && o.lastName === p.lastName);
      for (const f of fam) link(p, f, 'family', relRng2.float(0.2, 0.9));
      // Leader ties: politicians are allies or enemies of the leader
      if (leader && p.profession === 'politician' && p.id !== leader.id) link(p, leader, p.ideology === leader.ideology ? 'ally' : 'enemy', p.ideology === leader.ideology ? relRng2.float(0.3, 0.8) : -relRng2.float(0.3, 0.9));
      // Funders: entrepreneurs funded by executives
      if (p.profession === 'entrepreneur') { const ex = people.filter((o) => o.profession === 'executive'); if (ex.length && relRng2.bool(0.5)) link(p, relRng2.pick(ex), 'funder', relRng2.float(0.3, 0.8), 'partner'); }
    }
  }
  // A few cross-border ties among the famous
  const famous = allPeople.filter((p) => p.fame > 50);
  for (let i = 0; i < famous.length / 3; i++) { const a = relRng2.pick(famous), b = relRng2.pick(famous); if (a.countryId !== b.countryId) link(a, b, relRng2.bool(0.6) ? 'friend' : 'rival', relRng2.float(-0.8, 0.8)); }

  // ---- Markets ------------------------------------------------------------------
  fillMarkets(world, rng.fork('markets'));

  world.rngState = rng.state();
  return world;
}

function worldName(rng: RNG): string {
  const a = ['Aeon', 'Meridian', 'Vantara', 'Solis', 'Orbis', 'Halcyon', 'Tessera', 'Kairos', 'Lumen', 'Verdant', 'Ashen', 'Cobalt', 'Ember', 'Zenith', 'Auric'];
  const b = ['Reach', 'Concord', 'Horizon', 'Epoch', 'Continuum', 'Crown', 'Dominion', 'Passage', 'Threshold', 'Dawn', 'Circuit', 'Tide'];
  return `${rng.pick(a)} ${rng.pick(b)}`;
}

function makeFlag(rng: RNG, hue: number): FlagSpec {
  const layouts: FlagSpec['layout'][] = ['tricolor-v', 'tricolor-h', 'bicolor-h', 'cross', 'diagonal', 'canton', 'emblem', 'stripes'];
  const h2 = (hue + rng.pick([30, 150, 180, 210, 330])) % 360;
  const neutrals = ['#f4f1e8', '#141414', '#e8c547', '#f4f1e8'];
  const colors = [`hsl(${hue} 65% 45%)`, rng.pick(neutrals), `hsl(${h2} 60% 40%)`];
  return { layout: rng.pick(layouts), colors: rng.shuffle(colors), emblem: rng.bool(0.5) ? rng.pick(['star', 'circle', 'diamond', 'crescent', 'triangle', 'ring']) : undefined };
}

export function leaderTitle(g: GovernmentType): string {
  return { democracy: 'President', republic: 'Prime Minister', monarchy: 'Monarch', technocracy: 'Director-General', autocracy: 'Supreme Leader', 'military-junta': 'Marshal', theocracy: 'High Cleric', federation: 'Chancellor', oligarchy: 'Chairman', council: 'First Councillor' }[g];
}

function agendaFor(rng: RNG, t: OrgType): string {
  const a: Record<OrgType, string[]> = {
    government: ['govern the nation'], party: ['win power'],
    movement: ['overthrow the corrupt elite', 'demand climate action', 'restore traditional values', 'expand civil liberties', 'end foreign influence', 'workers first', 'digital sovereignty'],
    research: ['fusion energy', 'longevity medicine', 'artificial general intelligence', 'quantum computing', 'climate engineering', 'orbital manufacturing', 'neural interfaces'],
    military: ['national defense', 'territorial expansion', 'internal security'],
    ngo: ['humanitarian relief', 'press freedom', 'anti-corruption', 'refugee support', 'disease eradication'],
    criminal: ['smuggling and extortion', 'cybercrime', 'narcotics', 'arms trafficking', 'political corruption'],
    religion: ['spiritual revival', 'moral order', 'charity and community'],
    union: ['higher wages', 'worker safety', 'nationalization'],
    alliance: ['collective security'],
  };
  return rng.pick(a[t]);
}

function makePersonality(rng: RNG): Personality {
  return { ambition: rng.float(0.1, 1), charisma: rng.float(0.1, 1), integrity: rng.float(0.05, 1), aggression: rng.float(0, 1), openness: rng.float(0, 1), caution: rng.float(0, 1) };
}

export function makePerson(world: World, rng: RNG, fam: N.LanguageFamily, country: Country, city: City, profession: Profession, tier: 1 | 2 | 3, opts: Partial<Person> = {}): Person {
  const gender: 'm' | 'f' | 'x' = rng.bool(0.03) ? 'x' : rng.bool(0.5) ? 'm' : 'f';
  const nm = N.personName(rng, fam, gender);
  const id = nextId(world, 'p');
  const ageYears = profession === 'athlete' ? rng.int(19, 34) : profession === 'politician' ? rng.int(36, 74) : profession === 'general' ? rng.int(45, 68) : rng.int(24, 68);
  const baseInfluence: Record<Profession, number> = { politician: 40, scientist: 25, journalist: 30, entrepreneur: 35, activist: 25, general: 45, celebrity: 40, criminal: 20, artist: 25, executive: 40, diplomat: 35, athlete: 30, engineer: 15, citizen: 5, 'religious-leader': 35 };
  const p: Person = {
    id, kind: 'person', name: `${nm.first} ${nm.last}`, firstName: nm.first, lastName: nm.last, gender,
    birthDay: world.day - ageYears * DAYS_PER_YEAR - rng.int(0, 364), countryId: country.id, cityId: city.id, profession,
    influence: clamp(baseInfluence[profession] + rng.gauss(0, 12), 1, 95),
    wealth: Math.max(0.01, Math.round(wealthFor(rng, profession) * 100) / 100),
    fame: clamp(baseInfluence[profession] * 0.9 + rng.gauss(0, 15), 0, 95),
    reputation: clamp(rng.gauss(10, 25), -80, 80),
    personality: makePersonality(rng), ideology: rng.bool(0.5) ? country.ideology : rng.pick(IDEOS), traits: rng.sample(TRAITS, 2),
    affiliations: [], relationships: [], memories: [], history: [],
    objective: objectiveFor(rng, profession), alive: true, retired: false,
    socialHandle: N.handleFor(nm.first, nm.last, rng), socialActivity: clamp(rng.float(0.1, 1) * (profession === 'journalist' || profession === 'celebrity' || profession === 'activist' ? 1.4 : 1), 0.05, 1),
    tier, ...opts,
  };
  world.people[id] = p;
  return p;
}

function wealthFor(rng: RNG, prof: Profession): number {
  const base: Record<Profession, [number, number]> = { politician: [0.5, 20], scientist: [0.2, 3], journalist: [0.1, 2], entrepreneur: [1, 400], activist: [0.05, 1], general: [0.5, 8], celebrity: [2, 150], criminal: [1, 120], artist: [0.1, 30], executive: [5, 300], diplomat: [0.5, 6], athlete: [1, 80], engineer: [0.2, 4], citizen: [0.02, 0.5], 'religious-leader': [0.1, 10] };
  const [lo, hi] = base[prof];
  return lo * Math.pow(hi / lo, rng.next() ** 1.6);
}
function objectiveFor(rng: RNG, prof: Profession): string {
  const o: Record<Profession, string[]> = {
    politician: ['reach the top office', 'pass a landmark reform', 'destroy a rival', 'build a dynasty'],
    scientist: ['publish a breakthrough', 'secure funding for a moonshot', 'win the highest prize', 'prove a controversial theory'],
    journalist: ['expose a major scandal', 'build a media empire', 'win international recognition', 'bring down a corrupt official'],
    entrepreneur: ['build a trillion-value company', 'disrupt an entire industry', 'take the company public', 'reach orbit'],
    activist: ['force a policy change', 'mobilize a million people', 'end an injustice', 'topple a government'],
    general: ['modernize the armed forces', 'win a decisive campaign', 'gain political power', 'prevent a coup'],
    celebrity: ['stay relevant', 'launch a global brand', 'enter politics', 'reinvent their image'],
    criminal: ['control the market', 'go legitimate', 'eliminate rivals', 'buy political protection'],
    artist: ['create a defining masterpiece', 'gain global fame', 'provoke the establishment'],
    executive: ['double the company value', 'seize the CEO seat', 'engineer a mega-merger'],
    diplomat: ['broker a historic peace', 'form a new alliance', 'isolate a rival state'],
    athlete: ['win the world title', 'become a national icon', 'retire on top'],
    engineer: ['ship an impossible project', 'found a startup', 'solve an unsolved problem'],
    citizen: ['make ends meet', 'go viral', 'start a movement', 'find a better life abroad'],
    'religious-leader': ['grow the faith', 'influence the government', 'reform the doctrine'],
  };
  return rng.pick(o[prof]);
}

export function makeCompany(world: World, rng: RNG, fam: N.LanguageFamily, country: Country, city: City, sector: Sector, value: number, founder?: Person): Company {
  const id = nextId(world, 'co');
  const ceo = founder ?? makePerson(world, rng, fam, country, city, 'executive', 2);
  const nm = N.companyName(rng, fam, sector, founder?.lastName);
  const v = Math.max(0.05, Math.round(value * 100) / 100);
  const c: Company = {
    id, kind: 'company', name: nm.name, ticker: uniqueTicker(world, nm.ticker), countryId: country.id, cityId: city.id, sector,
    value: v, revenue: Math.round(v * rng.float(0.2, 0.8) * 100) / 100, employees: Math.round(v * rng.float(400, 4000)),
    growth: rng.float(-4, 14), volatility: rng.float(0.1, 0.6) * (sector === 'technology' || sector === 'biotech' ? 1.4 : 1), reputation: clamp(rng.gauss(15, 25), -80, 90),
    ceoId: ceo.id, founderId: founder?.id, founded: founder ? world.day : world.day - rng.int(3, 90) * DAYS_PER_YEAR, alive: true, priceHistory: [v],
    description: describeCompany(rng, sector), publicListed: v > 1 && rng.bool(0.8),
  };
  ceo.affiliations.push(id);
  ceo.title = founder ? 'Founder & CEO' : 'CEO';
  ceo.wealth = Math.max(ceo.wealth, v * rng.float(0.02, 0.2) * 1000);
  ceo.history.push({ day: c.founded, text: `${founder ? 'Founded' : 'Became CEO of'} ${c.name}.` });
  world.companies[id] = c;
  return c;
}

function uniqueTicker(world: World, t: string): string {
  const used = new Set(Object.values(world.companies).map((c) => c.ticker));
  if (!used.has(t)) return t;
  for (let i = 1; i < 100; i++) { const cand = t.slice(0, 3) + i; if (!used.has(cand)) return cand; }
  return t + Math.random().toString(36).slice(2, 4).toUpperCase();
}

function describeCompany(rng: RNG, sector: Sector): string {
  const d: Record<Sector, string[]> = {
    energy: ['grid-scale storage and renewable generation', 'oil, gas and next-generation fuels', 'nuclear and fusion power development'],
    technology: ['cloud infrastructure and artificial intelligence', 'consumer devices and operating systems', 'cybersecurity and networking'],
    finance: ['investment banking and asset management', 'digital payments and consumer credit', 'insurance and sovereign lending'],
    manufacturing: ['industrial robotics and precision machinery', 'vehicles and mobility platforms', 'consumer electronics assembly'],
    agriculture: ['industrial farming and food processing', 'vertical farming and crop genetics', 'global grain trading'],
    defense: ['missiles, drones and air defense', 'naval systems and armored vehicles', 'military intelligence software'],
    media: ['streaming, film and games', 'news, publishing and advertising', 'social platforms and creator tools'],
    health: ['hospital networks and diagnostics', 'medical devices and telehealth', 'pharmaceutical distribution'],
    transport: ['air and rail transport', 'container shipping and ports', 'autonomous freight'],
    retail: ['e-commerce and logistics', 'supermarkets and consumer goods', 'luxury brands'],
    mining: ['copper, lithium and rare earth extraction', 'gold and diamond mining', 'deep-sea mineral recovery'],
    biotech: ['gene therapy and longevity research', 'synthetic biology', 'vaccine platforms'],
    aerospace: ['orbital launch and satellite constellations', 'aircraft manufacturing', 'lunar and asteroid mining ventures'],
    construction: ['megaprojects and infrastructure', 'housing and smart cities', 'engineering services'],
  };
  return rng.pick(d[sector]);
}

export function makeOrg(world: World, rng: RNG, fam: N.LanguageFamily, country: Country | null, type: OrgType, name: string, leaderId: ID | null, ideology: Ideology | undefined, agenda: string): Organization {
  const id = nextId(world, 'org');
  const o: Organization = {
    id, kind: 'organization', name, type, countryId: country?.id ?? null, leaderId, memberIds: leaderId ? [leaderId] : [],
    influence: clamp(rng.gauss(type === 'government' ? 80 : type === 'party' ? 45 : 30, 15), 3, 99),
    support: clamp(rng.gauss(type === 'government' ? (country?.approval ?? 50) : 30, 15), 2, 95),
    ideology, agenda, founded: world.day - rng.int(1, 60) * DAYS_PER_YEAR, alive: true, history: [],
  };
  world.organizations[id] = o;
  return o;
}

export function makeOutlet(world: World, rng: RNG, fam: N.LanguageFamily, country: Country | null, bias: OutletBias): MediaOutlet {
  const id = nextId(world, 'm');
  const cred: Record<OutletBias, number> = { establishment: 65, opposition: 55, sensational: 30, business: 70, international: 75, independent: 68, state: 35 };
  const styles: Record<OutletBias, MediaOutlet['style']> = { establishment: 'broadsheet', opposition: 'digital', sensational: 'tabloid', business: 'wire', international: 'tv', independent: 'digital', state: 'tv' };
  const mottos = ['Truth, first.', 'The world as it is.', 'Never look away.', 'Facts. Fast.', 'Beyond the headline.', 'Voices that matter.', 'Every angle.', 'Trusted since the beginning.', 'What they don\'t want you to know.', 'Markets. Money. Power.'];
  const o: MediaOutlet = {
    id, kind: 'outlet', name: N.outletName(rng, fam, country?.name ?? 'World', bias), countryId: country?.id ?? null, bias,
    credibility: clamp(cred[bias] + rng.gauss(0, 10), 5, 98), audience: Math.round(rng.float(0.5, country ? country.population / 4_000_000 + 2 : 60) * 10) / 10,
    style: styles[bias], color: `hsl(${rng.int(0, 360)} 55% 55%)`, motto: rng.pick(mottos),
  };
  world.outlets[id] = o;
  return o;
}
