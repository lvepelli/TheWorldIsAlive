/**
 * World actions: reusable, event-producing mutations of the world.
 * Used by both the simulation rules and God Mode so that every change is
 * recorded as an event with causality.
 */
import { RNG, clamp } from '../rng';
import type { World, Country, Person, Company, Organization, ID, Sector, Ideology, GovernmentType, Profession, WorldEvent, EntityRef } from '../types';
import { DAYS_PER_YEAR } from '../types';
import { createEvent, fx, ref, type EventDraft } from './engine';
import { makePerson, makeCompany, makeOrg, leaderTitle } from '../generator/world';
import * as N from '../names';
import { yearOf } from '../time';
import { shiftRelationships, relate } from '../simulation/relations';

type Cause = ID | 'simulation' | 'player';
const IDEOS: Ideology[] = ['liberal', 'conservative', 'socialist', 'nationalist', 'technocratic', 'green', 'libertarian', 'populist', 'traditionalist', 'progressive'];

export function familyOf(world: World, country: Country): N.LanguageFamily {
  // Derive a stable family from the country's name so new people fit in.
  const fams = ['latin', 'nordic', 'east', 'african', 'anglo', 'slavic', 'arabic'];
  const h = RNG.hash(country.name)[0] % fams.length;
  return N.familyById(fams[h]);
}

export function leaderOf(world: World, c: Country): Person | undefined { return world.people[c.leaderId]; }
export function capitalOf(world: World, c: Country) { return world.cities[c.capitalId]; }
export function pickCity(world: World, rng: RNG, c: Country) { return world.cities[rng.pickWeighted(c.cityIds, (id) => world.cities[id].population)]; }
export function peopleOf(world: World, countryId: ID, prof?: Profession): Person[] {
  return Object.values(world.people).filter((p) => p.alive && !p.retired && p.countryId === countryId && (!prof || p.profession === prof));
}
export function companiesOf(world: World, countryId: ID): Company[] { return Object.values(world.companies).filter((c) => c.alive && c.countryId === countryId); }

function base(cause: Cause, player: boolean): Pick<EventDraft, 'causedBy' | 'playerIntervention'> { return { causedBy: cause, playerIntervention: player || undefined }; }

// ---------------------------------------------------------------------------
// GEOPOLITICS
// ---------------------------------------------------------------------------
export function declareWar(world: World, rng: RNG, a: Country, b: Country, cause: Cause = 'simulation', player = false, reason?: string): WorldEvent | null {
  if (a.atWarWith.includes(b.id)) return null;
  a.atWarWith.push(b.id); b.atWarWith.push(a.id);
  a.relations[b.id] = -100; b.relations[a.id] = -100;
  a.alliances = a.alliances.filter((x) => x !== b.id); b.alliances = b.alliances.filter((x) => x !== a.id);
  a.tradePartners = a.tradePartners.filter((x) => x !== b.id); b.tradePartners = b.tradePartners.filter((x) => x !== a.id);
  const la = leaderOf(world, a), lb = leaderOf(world, b);
  const why = reason ?? rng.pick(['a disputed border region', 'the seizure of a merchant convoy', 'alleged support for insurgents', 'a contested resource field', 'the collapse of peace talks', 'a cross-border missile incident', 'the assassination of a diplomat', 'a dam that cut off a shared river', 'the expulsion of ethnic kin', 'a decades-old humiliation the new leader vowed to avenge']);
  return createEvent(world, {
    category: 'military', type: 'war.declared', severity: 5, ...base(cause, player),
    title: `${a.name} declares war on ${b.name}`,
    description: `${la?.title ?? 'The leader'} ${la?.name ?? ''} of ${a.name} announced a state of war against ${b.name}, citing ${why}. ${lb ? `${lb.name} vowed that ${b.name} would "answer with everything it has."` : ''} Markets across the region fell sharply within hours.`,
    location: { countryId: a.id }, actors: [ref('country', a.id), ref('country', b.id), ...(la ? [ref('person', la.id)] : []), ...(lb ? [ref('person', lb.id)] : [])],
    effects: [
      fx('country', a.id, 'stability', -8), fx('country', b.id, 'stability', -10), fx('country', a.id, 'unrest', 6), fx('country', b.id, 'unrest', 8),
      fx('country', a.id, 'gdpGrowth', -1.5), fx('country', b.id, 'gdpGrowth', -2.5), fx('country', a.id, 'approval', rng.float(-8, 10)), fx('country', b.id, 'approval', 6),
    ],
    tags: ['war', 'conflict', a.code, b.code], historic: true, data: { attacker: a.id, defender: b.id },
  });
}

export function endWar(world: World, rng: RNG, a: Country, b: Country, cause: Cause = 'simulation', player = false, outcome?: 'a' | 'b' | 'stalemate'): WorldEvent | null {
  if (!a.atWarWith.includes(b.id)) return null;
  a.atWarWith = a.atWarWith.filter((x) => x !== b.id); b.atWarWith = b.atWarWith.filter((x) => x !== a.id);
  const res = outcome ?? (a.military > b.military * 1.3 ? 'a' : b.military > a.military * 1.3 ? 'b' : rng.pick(['a', 'b', 'stalemate', 'stalemate']));
  a.relations[b.id] = -40; b.relations[a.id] = -40;
  const winner = res === 'a' ? a : res === 'b' ? b : null;
  const loser = res === 'a' ? b : res === 'b' ? a : null;
  const effects = [fx('country', a.id, 'stability', 6), fx('country', b.id, 'stability', 6), fx('country', a.id, 'unrest', -5), fx('country', b.id, 'unrest', -5)];
  if (winner && loser) {
    effects.push(fx('country', winner.id, 'approval', 12), fx('country', loser.id, 'approval', -15), fx('country', winner.id, 'military', 4), fx('country', loser.id, 'military', -8), fx('country', loser.id, 'stability', -6));
  }
  return createEvent(world, {
    category: 'diplomatic', type: 'war.ended', severity: 4, ...base(cause, player),
    title: winner ? `${winner.name} prevails as war with ${loser!.name} ends` : `Ceasefire ends the ${a.name}–${b.name} war`,
    description: winner
      ? `After ${rng.pick(['months', 'a brutal campaign', 'a war of attrition'])}, ${loser!.name} accepted terms. ${winner.name} emerges strengthened, but the human cost on both sides is enormous.`
      : `Negotiators announced a ceasefire between ${a.name} and ${b.name}. Neither side achieved its objectives; both leaders declared victory to their own populations.`,
    location: { countryId: (winner ?? a).id }, actors: [ref('country', a.id), ref('country', b.id)], effects, tags: ['peace', 'war', a.code, b.code], historic: true,
    data: { outcome: res },
  });
}

export function setRelation(world: World, a: Country, b: Country, delta: number): void {
  a.relations[b.id] = clamp((a.relations[b.id] ?? 0) + delta, -100, 100);
  b.relations[a.id] = a.relations[b.id];
}

export function formAlliance(world: World, rng: RNG, a: Country, b: Country, cause: Cause = 'simulation', player = false): WorldEvent | null {
  if (a.alliances.includes(b.id)) return null;
  a.alliances.push(b.id); b.alliances.push(a.id);
  setRelation(world, a, b, 30);
  if (!a.tradePartners.includes(b.id)) { a.tradePartners.push(b.id); b.tradePartners.push(a.id); }
  return createEvent(world, {
    category: 'diplomatic', type: 'alliance.formed', severity: 3, ...base(cause, player),
    title: `${a.name} and ${b.name} sign a mutual defense pact`,
    description: `Leaders of ${a.name} and ${b.name} signed a treaty committing both nations to collective defense and expanded trade. Analysts see it as ${rng.pick(['a response to regional tensions', 'a realignment of the balance of power', 'a long-expected formalization of close ties'])}.`,
    location: { countryId: a.id }, actors: [ref('country', a.id), ref('country', b.id)],
    effects: [fx('country', a.id, 'stability', 3), fx('country', b.id, 'stability', 3), fx('country', a.id, 'military', 2), fx('country', b.id, 'military', 2)],
    tags: ['alliance', 'diplomacy', a.code, b.code],
  });
}

export function breakAlliance(world: World, rng: RNG, a: Country, b: Country, cause: Cause = 'simulation', player = false): WorldEvent | null {
  if (!a.alliances.includes(b.id)) return null;
  a.alliances = a.alliances.filter((x) => x !== b.id); b.alliances = b.alliances.filter((x) => x !== a.id);
  setRelation(world, a, b, -45);
  return createEvent(world, {
    category: 'diplomatic', type: 'alliance.broken', severity: 3, ...base(cause, player),
    title: `${a.name} withdraws from its alliance with ${b.name}`,
    description: `Citing ${rng.pick(['betrayal over trade policy', 'espionage revelations', 'irreconcilable differences on security', 'domestic pressure'])}, ${a.name} terminated its defense pact with ${b.name}. Embassies were placed on alert.`,
    location: { countryId: a.id }, actors: [ref('country', a.id), ref('country', b.id)],
    effects: [fx('country', a.id, 'stability', -3), fx('country', b.id, 'stability', -4)], tags: ['diplomacy', 'tension', a.code, b.code],
  });
}

export function shiftTension(world: World, rng: RNG, a: Country, b: Country, delta: number, cause: Cause = 'simulation', player = false, reason?: string): WorldEvent {
  setRelation(world, a, b, -delta);
  const rising = delta > 0;
  return createEvent(world, {
    category: 'diplomatic', type: rising ? 'tension.rise' : 'tension.fall', severity: Math.abs(delta) > 30 ? 3 : 2, ...base(cause, player),
    title: rising ? `Tensions flare between ${a.name} and ${b.name}` : `${a.name} and ${b.name} move toward détente`,
    description: rising
      ? `${reason ?? rng.pick(['A naval standoff', 'A diplomatic expulsion', 'A leaked intelligence memo', 'A border incident', 'Sanctions on a strategic industry'])} has sharply worsened relations between ${a.name} and ${b.name}. Both foreign ministries issued warnings.`
      : `${reason ?? rng.pick(['A surprise summit', 'A prisoner exchange', 'A trade concession', 'Back-channel talks'])} has eased hostility between ${a.name} and ${b.name}, raising hopes for lasting cooperation.`,
    location: { countryId: a.id }, actors: [ref('country', a.id), ref('country', b.id)],
    effects: rising ? [fx('country', a.id, 'stability', -2), fx('country', b.id, 'stability', -2)] : [fx('country', a.id, 'stability', 2), fx('country', b.id, 'stability', 2)],
    tags: ['diplomacy', rising ? 'tension' : 'peace', a.code, b.code],
  });
}

// ---------------------------------------------------------------------------
// POLITICS
// ---------------------------------------------------------------------------
export function changeLeader(world: World, rng: RNG, c: Country, how: 'election' | 'coup' | 'succession' | 'resignation' | 'revolution' | 'appointment', cause: Cause = 'simulation', player = false, successor?: Person): WorldEvent {
  const old = leaderOf(world, c);
  const fam = familyOf(world, c);
  let next = successor;
  if (!next) {
    const candidates = peopleOf(world, c.id, 'politician').filter((p) => p.id !== c.leaderId);
    if (how === 'coup') { const gen = peopleOf(world, c.id, 'general'); if (gen.length) next = rng.pickWeighted(gen, (p) => p.influence + p.personality.ambition * 40); }
    if (how === 'revolution') { const act = peopleOf(world, c.id, 'activist'); if (act.length && rng.bool(0.6)) next = rng.pickWeighted(act, (p) => p.influence + p.fame); }
    if (!next && candidates.length && rng.bool(0.75)) next = rng.pickWeighted(candidates, (p) => p.influence + p.fame * 0.5);
    if (!next) next = makePerson(world, rng, fam, c, capitalOf(world, c), 'politician', 1);
  }
  if (old) {
    old.title = how === 'coup' || how === 'revolution' ? 'Former leader (deposed)' : 'Former leader';
    old.influence = clamp(old.influence * (how === 'election' ? 0.6 : 0.3), 1, 100);
    old.history.push({ day: world.day, text: `Lost power in ${c.name} (${how}).` });
    if (how === 'coup' && rng.bool(0.3)) { old.alive = false; old.history.push({ day: world.day, text: 'Killed during the coup.' }); }
  }
  if (how === 'coup') { c.government = 'military-junta'; c.freedom = clamp(c.freedom - 25, 0, 100); c.electionEvery = 0; }
  if (how === 'coup' || how === 'revolution') c.history.push({ day: world.day, text: how === 'coup' ? 'Coup.' : 'Revolution.' });
  if (how === 'revolution') { c.government = rng.pick(['republic', 'democracy', 'council', 'autocracy']); c.electionEvery = c.government === 'autocracy' ? 0 : 5; c.nextElectionYear = yearOf(world.day, world.meta.startYear) + c.electionEvery; }
  const wasActivist = next.profession === 'activist';
  if (old) shiftRelationships(world, old.id, how === 'coup' || how === 'revolution' ? -0.3 : -0.1, (r) => r.type !== 'family');
  shiftRelationships(world, next.id, 0.2, (r) => r.strength > 0);
  if (old && (how === 'coup' || how === 'revolution')) relate(world, old, next, 'enemy', -0.8);
  next.profession = 'politician';
  next.title = leaderTitle(c.government);
  next.influence = clamp(Math.max(next.influence, 55) + 10, 0, 98);
  next.fame = clamp(next.fame + 25, 0, 99);
  next.tier = 1;
  c.leaderId = next.id;
  c.ideology = next.ideology;
  c.approval = how === 'election' ? clamp(52 + rng.gauss(0, 8), 20, 80) : how === 'revolution' ? clamp(60 + rng.gauss(0, 10), 30, 85) : clamp(35 + rng.gauss(0, 12), 10, 70);
  next.history.push({ day: world.day, text: `Became ${next.title} of ${c.name} by ${how}.` });
  const gov = Object.values(world.organizations).find((o) => o.type === 'government' && o.countryId === c.id);
  if (gov) gov.leaderId = next.id;
  const titles: Record<typeof how, string> = {
    election: `${next.name} wins the ${c.adjective} election`, coup: `Coup in ${c.name}: ${next.name} seizes power`, succession: `${next.name} succeeds as ${next.title} of ${c.name}`,
    resignation: `${old?.name ?? 'Leader'} resigns; ${next.name} takes over ${c.name}`, revolution: `Revolution topples the government of ${c.name}`, appointment: `${next.name} appointed ${next.title} of ${c.name}`,
  };
  const desc: Record<typeof how, string> = {
    election: `Voters in ${c.name} handed ${next.name} (${next.ideology}) a mandate after a ${rng.pick(['bitter', 'closely fought', 'surprisingly calm', 'chaotic'])} campaign. ${old ? `Outgoing ${old.title} ${old.name} conceded ${rng.pick(['gracefully', 'late in the night', 'without mentioning the winner by name'])}.` : ''}`,
    coup: `Armored units surrounded government buildings in ${capitalOf(world, c)?.name} before dawn. ${next.name} appeared on state television to announce a "transitional council". ${old ? `The fate of ${old.name} is ${old.alive ? 'unknown' : 'confirmed: killed during the assault'}.` : ''}`,
    succession: `Following the departure of ${old?.name ?? 'the previous leader'}, ${next.name} assumed the office of ${next.title} under constitutional succession rules.`,
    resignation: `Under mounting pressure, ${old?.name ?? 'the leader'} resigned. ${next.name} pledged "stability and renewal" in a first address.`,
    revolution: `After weeks of mass protest, the government of ${c.name} fell. ${next.name}, a ${wasActivist ? 'protest leader' : 'reform politician'}, was proclaimed ${next.title} by a transitional assembly. The world watches to see whether the new order will hold.`,
    appointment: `${next.name} was appointed ${next.title} of ${c.name}.`,
  };
  const effects = [fx('person', next.id, 'influence', 15)];
  if (how === 'coup') effects.push(fx('country', c.id, 'stability', -20), fx('country', c.id, 'unrest', 15), fx('country', c.id, 'gdpGrowth', -2), fx('country', c.id, 'corruption', 10));
  if (how === 'revolution') effects.push(fx('country', c.id, 'stability', -15), fx('country', c.id, 'unrest', -20), fx('country', c.id, 'freedom', 15), fx('country', c.id, 'corruption', -10));
  if (how === 'election') effects.push(fx('country', c.id, 'stability', 3), fx('country', c.id, 'unrest', -4), fx('country', c.id, 'polarization', -3));
  const sev = how === 'coup' || how === 'revolution' ? 5 : how === 'election' ? 3 : 3;
  return createEvent(world, {
    category: 'political', type: `leader.${how}`, severity: sev as 3 | 5, ...base(cause, player), title: titles[how], description: desc[how],
    location: { countryId: c.id }, actors: [ref('country', c.id), ref('person', next.id), ...(old ? [ref('person', old.id)] : [])], effects,
    tags: ['politics', how, c.code], historic: sev >= 4,
  });
}

export function collapseGovernment(world: World, rng: RNG, c: Country, cause: Cause = 'simulation', player = false): WorldEvent {
  const old = leaderOf(world, c);
  c.stability = clamp(Math.max(15, c.stability - 30), 0, 100); // a transitional council restores basic order
  c.history.push({ day: world.day, text: 'Government collapsed.' });
  c.unrest = clamp(c.unrest + 25, 0, 100);
  c.gdpGrowth -= 4;
  c.government = 'council';
  c.electionEvery = 0;
  if (old) { old.influence = clamp(old.influence * 0.3, 0, 100); old.title = 'Former leader (ousted)'; old.history.push({ day: world.day, text: `Ousted as the government of ${c.name} collapsed.` }); }
  const fam = familyOf(world, c);
  const next = makePerson(world, rng, fam, c, capitalOf(world, c), 'politician', 1);
  next.title = 'Interim Council Chair';
  next.influence = 50;
  c.leaderId = next.id;
  next.history.push({ day: world.day, text: `Named interim leader after the collapse of the ${c.adjective} government.` });
  return createEvent(world, {
    category: 'political', type: 'government.collapse', severity: 5, ...base(cause, player),
    title: `Government of ${c.name} collapses`,
    description: `The ${c.adjective} state has effectively ceased to function. Ministries are empty, security forces are split, and ${next.name} now chairs an interim council with uncertain authority. Neighbors are moving troops to the border.`,
    location: { countryId: c.id }, actors: [ref('country', c.id), ref('person', next.id), ...(old ? [ref('person', old.id)] : [])],
    effects: c.neighbors.map((n) => fx('country', n, 'stability', -3)), tags: ['collapse', 'politics', 'crisis', c.code], historic: true,
  });
}

export function changeGovernment(world: World, rng: RNG, c: Country, gov: GovernmentType, cause: Cause = 'simulation', player = false): WorldEvent {
  const prev = c.government;
  c.government = gov;
  c.electionEvery = gov === 'democracy' || gov === 'republic' || gov === 'federation' ? 4 : gov === 'council' || gov === 'technocracy' ? 6 : 0;
  c.nextElectionYear = c.electionEvery ? yearOf(world.day, world.meta.startYear) + c.electionEvery : 0;
  const leader = leaderOf(world, c); if (leader) leader.title = leaderTitle(gov);
  const freer = ['democracy', 'republic', 'federation', 'council'].includes(gov);
  return createEvent(world, {
    category: 'political', type: 'government.reform', severity: 4, ...base(cause, player),
    title: `${c.name} becomes a ${gov.replace('-', ' ')}`,
    description: `A sweeping constitutional transformation has converted ${c.name} from a ${prev.replace('-', ' ')} into a ${gov.replace('-', ' ')}. ${freer ? 'Civil liberties are expected to expand.' : 'Opposition groups fear a crackdown.'}`,
    location: { countryId: c.id }, actors: [ref('country', c.id)],
    effects: [fx('country', c.id, 'freedom', freer ? 20 : -25), fx('country', c.id, 'stability', -8), fx('country', c.id, 'polarization', 8)], tags: ['politics', 'reform', c.code], historic: true,
  });
}

export function createMovement(world: World, rng: RNG, c: Country, cause: Cause = 'simulation', player = false, ideology?: Ideology, name?: string, agenda?: string): WorldEvent {
  const fam = familyOf(world, c);
  const ideo = ideology ?? rng.pick(IDEOS);
  // A country sustains only a handful of movements; new energy folds into the strongest existing one unless a god insists.
  const existing = c.movements.map((id) => world.organizations[id]).filter((o) => o && o.alive);
  if (!player && !name && existing.length >= 4) {
    const org = rng.pickWeighted(existing, (o) => o.support + 5);
    const gain = clamp(4 + c.unrest * 0.1 + rng.gauss(0, 2), 1, 12);
    org.support = clamp(org.support + gain, 0, 100);
    const leader = org.leaderId ? world.people[org.leaderId] : undefined;
    return createEvent(world, {
      category: 'social', type: 'movement.merged', severity: 1, ...base(cause, player),
      title: `${org.name} absorbs a rival ${ideo} current in ${c.name}`,
      description: `Rather than found yet another group, activists in ${c.name} threw in with ${org.name}${leader ? ` under ${leader.name}` : ''}. Support rose by about ${gain.toFixed(0)} points.`,
      location: { countryId: c.id }, actors: [ref('organization', org.id), ref('country', c.id), ...(leader ? [ref('person', leader.id)] : [])], effects: [], tags: ['movement', c.code],
    });
  }
  const leaderCands = peopleOf(world, c.id).filter((p) => ['activist', 'journalist', 'artist', 'citizen', 'religious-leader'].includes(p.profession) && p.affiliations.length === 0);
  const leader = leaderCands.length ? rng.pick(leaderCands) : makePerson(world, rng, fam, c, pickCity(world, rng, c), 'activist', 2);
  const org = makeOrg(world, rng, fam, c, 'movement', name ?? N.orgName(rng, fam, 'movement', c.adjective), leader.id, ideo, agenda ?? rng.pick(['demand new elections', 'fight corruption', 'protect the climate', 'restore national pride', 'end inequality', 'defend digital freedom']));
  org.founded = world.day; org.support = clamp(8 + c.unrest * 0.3 + rng.gauss(0, 5), 3, 60);
  leader.affiliations.push(org.id); leader.objective = org.agenda; leader.tier = 1;
  c.movements.push(org.id);
  return createEvent(world, {
    category: 'social', type: 'movement.founded', severity: 2, ...base(cause, player),
    title: `${org.name} emerges in ${c.name}`,
    description: `Led by ${leader.name}, a new ${ideo} movement is rallying ${c.adjective} citizens around one demand: ${org.agenda}. Early rallies drew ${rng.pick(['thousands', 'tens of thousands', 'unexpectedly large crowds'])}.`,
    location: { cityId: leader.cityId }, actors: [ref('organization', org.id), ref('person', leader.id), ref('country', c.id)],
    effects: [fx('person', leader.id, 'influence', 10), fx('person', leader.id, 'fame', 15), fx('country', c.id, 'polarization', 3)], tags: ['movement', 'society', c.code],
  });
}

export function createCountry(world: World, rng: RNG, parent: Country, cause: Cause = 'simulation', player = false, name?: string): WorldEvent | null {
  // Split roughly half the cells (those farther from the capital) into a new country
  const geo = world.geography;
  const pIdx = geo.countryOrder.indexOf(parent.id);
  const cells: number[] = [];
  for (let i = 0; i < geo.cells.length; i++) if (geo.cells[i] === pIdx) cells.push(i);
  if (cells.length < 24 || parent.cityIds.length < 2) return null;
  const cap = capitalOf(world, parent);
  const far = cells.map((i) => { const x = i % geo.width, y = Math.floor(i / geo.width); let dx = Math.abs(x - cap.x); dx = Math.min(dx, geo.width - dx); return { i, d: Math.hypot(dx, y - cap.y) }; }).sort((a, b) => b.d - a.d);
  const take = new Set(far.slice(0, Math.floor(cells.length * rng.float(0.3, 0.45))).map((f) => f.i));
  // Ensure at least one city is inside
  const movedCities = parent.cityIds.filter((id) => { const c = world.cities[id]; return take.has(Math.floor(c.y) * geo.width + Math.floor(c.x)); });
  if (!movedCities.length) return null;
  const fam = familyOf(world, parent);
  const nm = name ? { name, adjective: N.adjectiveOf(name), code: name.slice(0, 3).toUpperCase() } : N.countryName(rng, fam);
  const nc: Country = {
    ...JSON.parse(JSON.stringify(parent)) as Country,
    id: `c_${Object.keys(world.countries).length + 1}_${rng.int(100, 999)}`, name: nm.name, adjective: nm.adjective, code: nm.code,
    hue: (parent.hue + 137) % 360, color: `hsl(${((parent.hue + 137) % 360).toFixed(0)} 60% 55%)`,
    cityIds: movedCities, capitalId: movedCities[0], leaderId: '', founded: world.day, history: [], movements: [], alliances: [], atWarWith: [], tradePartners: [parent.id],
    relations: {}, neighbors: [], area: take.size, government: rng.pick(['republic', 'democracy', 'council']), stability: 35, unrest: 30, approval: 60,
  };
  nc.flag = { ...nc.flag, colors: [nc.color, '#f4f1e8', `hsl(${(nc.hue + 180) % 360} 60% 40%)`] };
  const idx = geo.countryOrder.length;
  geo.countryOrder.push(nc.id);
  for (const i of take) geo.cells[i] = idx;
  for (const id of movedCities) { world.cities[id].countryId = nc.id; world.cities[id].capital = id === nc.capitalId; }
  parent.cityIds = parent.cityIds.filter((id) => !take.has(Math.floor(world.cities[id].y) * geo.width + Math.floor(world.cities[id].x)));
  if (!parent.cityIds.includes(parent.capitalId)) { parent.capitalId = parent.cityIds[0]; world.cities[parent.capitalId].capital = true; }
  const popShare = movedCities.reduce((s, id) => s + world.cities[id].population, 0) / Math.max(1, parent.population);
  nc.population = Math.round(parent.population * clamp(popShare * 1.5, 0.15, 0.6)); parent.population = Math.max(10_000, parent.population - nc.population);
  nc.gdp = Math.round(parent.gdp * 0.3); parent.gdp = Math.round(parent.gdp * 0.7); parent.area -= take.size;
  nc.centroid = { x: world.cities[nc.capitalId].x, y: world.cities[nc.capitalId].y };
  world.countries[nc.id] = nc;
  // relations & neighbors: recompute for both
  recomputeNeighbors(world);
  for (const other of Object.values(world.countries)) { if (other.id === nc.id) continue; nc.relations[other.id] = other.id === parent.id ? -30 : (parent.relations[other.id] ?? 0) * 0.5; other.relations[nc.id] = nc.relations[other.id]; }
  // people in moved cities
  for (const p of Object.values(world.people)) if (movedCities.includes(p.cityId)) { if (p.id === parent.leaderId) { p.cityId = parent.capitalId; continue; } p.countryId = nc.id; } // the sitting leader stays with the old capital
  for (const co of Object.values(world.companies)) if (movedCities.includes(co.cityId)) co.countryId = nc.id;
  const leader = makePerson(world, rng, fam, nc, world.cities[nc.capitalId], 'politician', 1);
  leader.title = leaderTitle(nc.government); leader.influence = 60; leader.fame = 70; nc.leaderId = leader.id;
  leader.history.push({ day: world.day, text: `Became the founding leader of ${nc.name}.` });
  makeOrg(world, rng, fam, nc, 'government', `${nc.name} Government`, leader.id, nc.ideology, 'build the new state');
  return createEvent(world, {
    category: 'political', type: 'country.founded', severity: 5, ...base(cause, player),
    title: `${nc.name} declares independence from ${parent.name}`,
    description: `A new nation has been born. ${leader.name} proclaimed the independence of ${nc.name} from ${world.cities[nc.capitalId].name}, taking ${movedCities.length} cities and ${(popShare * 100).toFixed(0)}% of the population. ${parent.name} has not recognized the declaration.`,
    location: { cityId: nc.capitalId }, actors: [ref('country', nc.id), ref('country', parent.id), ref('person', leader.id)],
    effects: [fx('country', parent.id, 'stability', -15), fx('country', parent.id, 'approval', -10)], tags: ['independence', 'politics', nc.code, parent.code], historic: true,
  });
}

export function recomputeNeighbors(world: World): void {
  const geo = world.geography; const W = geo.width, H = geo.height;
  const sets = new Map<number, Set<number>>();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; const r = geo.cells[i]; if (r < 0) continue;
    const check = (j: number) => { const o = geo.cells[j]; if (o >= 0 && o !== r) { if (!sets.has(r)) sets.set(r, new Set()); sets.get(r)!.add(o); } };
    check(y * W + ((x + 1) % W)); if (y < H - 1) check((y + 1) * W + x);
    check(y * W + ((x - 1 + W) % W)); if (y > 0) check((y - 1) * W + x);
  }
  geo.countryOrder.forEach((id, r) => { const c = world.countries[id]; if (c) c.neighbors = Array.from(sets.get(r) ?? []).map((o) => geo.countryOrder[o]).filter((x) => world.countries[x]); });
}

// ---------------------------------------------------------------------------
// ECONOMY & COMPANIES
// ---------------------------------------------------------------------------
export function foundCompany(world: World, rng: RNG, c: Country, sector: Sector, cause: Cause = 'simulation', player = false, founder?: Person, name?: string, description?: string): WorldEvent {
  const fam = familyOf(world, c);
  const city = pickCity(world, rng, c);
  let f = founder;
  if (!f) { const cands = peopleOf(world, c.id, 'entrepreneur').filter((p) => p.affiliations.length === 0); f = cands.length ? rng.pick(cands) : makePerson(world, rng, fam, c, city, 'entrepreneur', 2); }
  const co = makeCompany(world, rng, fam, c, city, sector, rng.float(0.05, 2), f);
  if (name) { co.name = name; co.ticker = name.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4) || co.ticker; }
  if (description) co.description = description;
  const descOverride = description;
  co.publicListed = false;
  return createEvent(world, {
    category: 'corporate', type: 'company.founded', severity: 1, ...base(cause, player),
    title: `${f.name} founds ${co.name}`,
    description: `A new ${sector} venture, ${co.name}, launched in ${city.name} focused on ${descOverride ?? co.description}. ${f.name} says the goal is to "${rng.pick(['change everything', 'do what the incumbents are afraid to', 'build the future, not the past', 'make this affordable for everyone'])}".`,
    location: { cityId: city.id }, actors: [ref('company', co.id), ref('person', f.id), ref('country', c.id)],
    effects: [fx('person', f.id, 'fame', 5)], tags: ['startup', sector, c.code],
  });
}

export function bankruptCompany(world: World, rng: RNG, co: Company, cause: Cause = 'simulation', player = false, reason?: string): WorldEvent | null {
  if (!co.alive) return null;
  co.alive = false;
  const c = world.countries[co.countryId];
  const ceo = world.people[co.ceoId];
  const lost = co.value;
  co.value = 0.01;
  if (ceo) { ceo.wealth = Math.max(0.05, ceo.wealth * 0.2); ceo.reputation = clamp(ceo.reputation - 30, -100, 100); ceo.history.push({ day: world.day, text: `Presided over the collapse of ${co.name}.` }); }
  const sev = lost > 200 ? 4 : lost > 30 ? 3 : 2;
  return createEvent(world, {
    category: 'corporate', type: 'company.bankrupt', severity: sev as 2 | 3 | 4, ...base(cause, player),
    title: `${co.name} collapses into bankruptcy`,
    description: `${reason ?? rng.pick(['Unable to refinance its debt', 'After a catastrophic product failure', 'Following months of accounting irregularities', 'Crushed by a price war'])}, ${co.name} filed for bankruptcy, wiping out $${lost.toFixed(1)}B in value and ${co.employees.toLocaleString()} jobs. ${ceo ? `CEO ${ceo.name} faces calls for an investigation.` : ''}`,
    location: { cityId: co.cityId }, actors: [ref('company', co.id), ...(ceo ? [ref('person', ceo.id)] : []), ref('country', co.countryId)],
    effects: [fx('country', co.countryId, 'unemployment', Math.min(3, co.employees / Math.max(1, c.population) * 100 * 4)), fx('country', co.countryId, 'gdpGrowth', -Math.min(1.5, lost / Math.max(1, c.gdp) * 5)), fx('country', co.countryId, 'unrest', 2)],
    tags: ['bankruptcy', co.sector, c.code], historic: sev >= 4,
  });
}

export function techBreakthrough(world: World, rng: RNG, co: Company | null, c: Country, field: string, cause: Cause = 'simulation', player = false, magnitude = 1, customTitle?: string, customDesc?: string): WorldEvent {
  const fam = familyOf(world, c);
  let sci = peopleOf(world, c.id, 'scientist')[0] ?? peopleOf(world, c.id, 'engineer')[0];
  if (!sci) sci = makePerson(world, rng, fam, c, pickCity(world, rng, c), 'scientist', 2);
  const sev = magnitude >= 2 ? 5 : magnitude >= 1 ? 4 : 3;
  const title = customTitle ?? (co ? `${co.name} unveils ${field} breakthrough` : `${c.adjective} scientists achieve ${field} breakthrough`);
  const desc = customDesc ?? `${co ? `Engineers at ${co.name}` : `A team led by ${sci.name}`} demonstrated a ${field} advance that experts call "${rng.pick(['a generational leap', 'the kind of result you see once a decade', 'genuinely hard to overstate', 'either fraudulent or historic'])}". Rivals are scrambling to verify the claims.`;
  const effects = [fx('country', c.id, 'technology', 3 * magnitude), fx('person', sci.id, 'fame', 25 * magnitude), fx('person', sci.id, 'influence', 12 * magnitude), fx('country', c.id, 'gdpGrowth', 0.5 * magnitude)];
  if (co) effects.push(fx('company', co.id, 'value%', 25 * magnitude + rng.float(0, 30)), fx('company', co.id, 'reputation', 15), fx('company', co.id, 'growth', 4 * magnitude));
  return createEvent(world, {
    category: 'technological', type: 'tech.breakthrough', severity: sev as 3 | 4 | 5, ...base(cause, player), title, description: desc,
    location: co ? { cityId: co.cityId } : { countryId: c.id }, actors: [...(co ? [ref('company', co.id)] : []), ref('person', sci.id), ref('country', c.id)], effects,
    tags: ['breakthrough', 'technology', field.toLowerCase().replace(/\s+/g, '-'), c.code, ...(co ? [co.sector] : [])], historic: sev >= 4, data: { field, magnitude, sector: co?.sector },
  });
}

export function economicShock(world: World, rng: RNG, c: Country | null, kind: 'boom' | 'crisis' | 'crash' | 'energy-crisis', cause: Cause = 'simulation', player = false): WorldEvent {
  const targets = c ? [c] : Object.values(world.countries);
  const effects = [];
  for (const t of targets) {
    if (kind === 'boom') effects.push(fx('country', t.id, 'gdpGrowth', c ? 4 : 2), fx('country', t.id, 'unemployment', -2.5), fx('country', t.id, 'happiness', 6), fx('country', t.id, 'approval', 5));
    if (kind === 'crisis') effects.push(fx('country', t.id, 'gdpGrowth', c ? -5 : -3), fx('country', t.id, 'unemployment', 4), fx('country', t.id, 'happiness', -8), fx('country', t.id, 'unrest', 8), fx('country', t.id, 'approval', -8), fx('country', t.id, 'debt', 10));
    if (kind === 'crash') effects.push(fx('country', t.id, 'gdpGrowth', c ? -2.5 : -1.5), fx('country', t.id, 'unrest', 4), fx('country', t.id, 'approval', -5));
    if (kind === 'energy-crisis') effects.push(fx('country', t.id, 'inflation', 5), fx('country', t.id, 'gdpGrowth', -2), fx('country', t.id, 'unrest', 6), fx('country', t.id, 'happiness', -6));
  }
  const scope = c ? c.name : 'the world';
  const titles = { boom: `Economic boom sweeps ${scope}`, crisis: `Economic crisis grips ${scope}`, crash: c ? `${c.adjective} markets crash` : 'Global market crash', 'energy-crisis': `Energy crisis hits ${scope}` };
  const descs = {
    boom: `Investment, hiring and consumer confidence are surging across ${scope}. Economists credit ${rng.pick(['a technology-driven productivity wave', 'cheap energy', 'a surge in exports', 'a burst of entrepreneurial activity'])}.`,
    crisis: `Banks are restricting credit, factories are idling and unemployment lines are growing across ${scope}. ${rng.pick(['A property bubble', 'A sovereign debt spiral', 'A collapse in commodity demand', 'A cascade of corporate defaults'])} triggered the downturn.`,
    crash: `Trading was halted repeatedly as indexes plunged. ${rng.pick(['Algorithmic selling', 'A liquidity crunch', 'Panic over leveraged positions', 'A sudden loss of confidence'])} turned a correction into a rout.`,
    'energy-crisis': `Fuel prices doubled within days across ${scope}. Rolling blackouts and rationing are being reported as governments scramble for supply.`,
  };
  return createEvent(world, {
    category: 'economic', type: `economy.${kind}`, severity: c ? (kind === 'boom' ? 3 : 4) : 5, ...base(cause, player), title: titles[kind], description: descs[kind],
    location: c ? { countryId: c.id } : undefined, actors: c ? [ref('country', c.id)] : [], effects, tags: ['economy', kind, ...(c ? [c.code] : ['global'])], historic: !c || kind !== 'boom',
    data: { kind, global: !c },
  });
}

// ---------------------------------------------------------------------------
// ENVIRONMENT & HEALTH
// ---------------------------------------------------------------------------
export function disaster(world: World, rng: RNG, c: Country, kind: 'earthquake' | 'flood' | 'hurricane' | 'drought' | 'wildfire' | 'volcano' | 'meteor' | 'tsunami', cause: Cause = 'simulation', player = false, magnitude = 1): WorldEvent {
  const city = pickCity(world, rng, c);
  const casualties = Math.round(rng.float(10, 2000) * magnitude * (kind === 'meteor' ? 50 : kind === 'earthquake' ? 3 : 1));
  const sev = magnitude >= 2 || kind === 'meteor' ? 5 : magnitude >= 1.2 ? 4 : 3;
  const dmg = { earthquake: 'levelled entire districts', flood: 'submerged low-lying neighborhoods', hurricane: 'tore through the coast', drought: 'withered crops across the interior', wildfire: 'consumed forests and suburbs', volcano: 'buried villages under ash', meteor: 'vaporized everything within a wide radius and shattered windows hundreds of kilometers away', tsunami: 'swept away the waterfront' }[kind];
  const titles = { earthquake: `Powerful earthquake strikes ${city.name}`, flood: `Catastrophic floods in ${c.name}`, hurricane: `Hurricane devastates ${city.name}`, drought: `Historic drought grips ${c.name}`, wildfire: `Wildfires rage across ${c.name}`, volcano: `Volcanic eruption near ${city.name}`, meteor: `Meteor strikes ${c.name}`, tsunami: `Tsunami hits ${city.name}` };
  return createEvent(world, {
    category: 'environmental', type: `disaster.${kind}`, severity: sev as 3 | 4 | 5, ...base(cause, player), title: titles[kind],
    description: `A ${kind === 'meteor' ? 'meteor' : kind} ${dmg} near ${city.name}. Authorities report at least ${casualties.toLocaleString()} casualties${kind === 'drought' ? ' from famine-related causes' : ''}. ${rng.pick(['International aid is being mobilized.', 'The government has declared a state of emergency.', 'Rescue teams are working through the night.', 'Communications are down across the region.'])}`,
    location: { cityId: city.id }, actors: [ref('country', c.id), ref('city', city.id)],
    effects: [fx('country', c.id, 'gdpGrowth', -1.5 * magnitude), fx('country', c.id, 'happiness', -6 * magnitude), fx('country', c.id, 'stability', -4 * magnitude), fx('country', c.id, 'unrest', 3 * magnitude), fx('city', city.id, 'prosperity', -10 * magnitude), fx('city', city.id, 'population', -casualties), fx('country', c.id, 'population', -casualties)],
    tags: ['disaster', kind, c.code], historic: sev >= 4, data: { kind, magnitude, casualties },
  });
}

export function epidemic(world: World, rng: RNG, c: Country, cause: Cause = 'simulation', player = false, pandemic = false): WorldEvent {
  const city = pickCity(world, rng, c);
  const name = `${rng.pick(['H', 'R', 'K', 'V', 'X'])}${rng.int(1, 9)}${rng.pick(['N', 'V', 'S'])}${rng.int(1, 9)}`;
  const targets = pandemic ? Object.values(world.countries) : [c];
  const effects = targets.flatMap((t) => [fx('country', t.id, 'happiness', pandemic ? -8 : -4), fx('country', t.id, 'gdpGrowth', pandemic ? -3 : -1), fx('country', t.id, 'population%', pandemic ? -0.4 : -0.05), fx('country', t.id, 'unrest', 3)]);
  return createEvent(world, {
    category: 'health', type: pandemic ? 'health.pandemic' : 'health.epidemic', severity: pandemic ? 5 : 3, ...base(cause, player),
    title: pandemic ? `Global pandemic declared as ${name} spreads worldwide` : `${name} outbreak spreads in ${city.name}`,
    description: pandemic ? `The ${name} pathogen, first detected in ${city.name}, has reached every continent. Borders are closing, hospitals are overwhelmed and economies are entering lockdown.` : `Health officials in ${c.name} confirmed a fast-spreading ${name} outbreak in ${city.name}. Travel restrictions are under consideration.`,
    location: { cityId: city.id }, actors: [ref('country', c.id), ref('city', city.id)], effects, tags: ['health', 'epidemic', c.code, ...(pandemic ? ['global', 'pandemic'] : [])], historic: pandemic, data: { pathogen: name, pandemic },
  });
}

// ---------------------------------------------------------------------------
// PEOPLE
// ---------------------------------------------------------------------------
export function scandal(world: World, rng: RNG, p: Person, cause: Cause = 'simulation', player = false, custom?: string): WorldEvent {
  const kinds: [string, string][] = [['embezzling public funds', 'embezzlement'], ['a secret offshore fortune', 'hidden offshore fortune'], ['falsified credentials', 'fake credentials'], ['an affair with a foreign agent', 'affair with foreign agent'], ['bribes from a defense contractor', 'defense bribes'], ['a cover-up of a fatal accident', 'fatal cover-up'], ['blackmail of a rival', 'blackmail'], ['leaked messages mocking supporters', 'leaked messages'], ['ties to a criminal syndicate', 'mafia ties'], ['plagiarism of a landmark work', 'plagiarism']];
  const kind = rng.pick(kinds);
  const what = custom ?? kind[0];
  const shortWhat = custom ? (custom.length > 32 ? custom.slice(0, 30) + '…' : custom) : kind[1];
  const journalists = Object.values(world.people).filter((j) => j.alive && j.profession === 'journalist');
  const j = journalists.length ? rng.pick(journalists) : undefined;
  const isLeader = Object.values(world.countries).some((c) => c.leaderId === p.id);
  const sev = isLeader ? 4 : p.fame > 60 ? 3 : 2;
  const c = world.countries[p.countryId];
  shiftRelationships(world, p.id, -0.25, (r) => r.type !== 'family');
  if (j) relate(world, p, j, 'enemy', -0.6);
  const effects = [fx('person', p.id, 'reputation', -35), fx('person', p.id, 'influence', -12), fx('person', p.id, 'fame', 10)];
  if (isLeader && c) effects.push(fx('country', c.id, 'approval', -12), fx('country', c.id, 'unrest', 4), fx('country', c.id, 'corruption', 3));
  if (j) effects.push(fx('person', j.id, 'fame', 12), fx('person', j.id, 'influence', 6));
  return createEvent(world, {
    category: 'political', type: 'scandal', severity: sev as 2 | 3 | 4, ...base(cause, player),
    title: `Scandal: ${p.name} accused of ${shortWhat}`,
    description: `${j ? `An investigation by ${j.name} revealed` : 'Leaked documents reveal'} that ${p.name}${p.title ? `, ${p.title},` : ''} was involved in ${what}. ${p.name} ${rng.pick(['denies everything', 'has gone silent', 'called the report "a political hit job"', 'promised to "clarify" the situation'])}.`,
    location: { cityId: p.cityId }, actors: [ref('person', p.id), ...(j ? [ref('person', j.id)] : []), ...(c ? [ref('country', c.id)] : [])], effects, tags: ['scandal', ...(c ? [c.code] : [])], historic: sev >= 4, data: { what },
  });
}

export function killPerson(world: World, rng: RNG, p: Person, how: 'assassination' | 'accident' | 'natural' | 'disappearance', cause: Cause = 'simulation', player = false): WorldEvent {
  p.alive = false;
  // A leader can lead a country other than the one on their record (e.g. their city seceded); find every throne they hold.
  const led = Object.values(world.countries).filter((x) => x.leaderId === p.id);
  const c = led[0] ?? world.countries[p.countryId];
  const isLeader = led.length > 0;
  p.history.push({ day: world.day, text: how === 'natural' ? 'Died.' : how === 'assassination' ? 'Assassinated.' : how === 'accident' ? 'Died in an accident.' : 'Disappeared.' });
  const sev = isLeader ? 5 : p.fame > 70 ? 4 : p.fame > 40 ? 3 : 2;
  const titles = { assassination: `${p.name} assassinated`, accident: `${p.name} killed in ${rng.pick(['a plane crash', 'a car accident', 'a helicopter crash', 'a fire'])}`, natural: `${p.name} dies at ${Math.floor((world.day - p.birthDay) / DAYS_PER_YEAR)}`, disappearance: `${p.name} vanishes without a trace` };
  const ev = createEvent(world, {
    category: how === 'assassination' ? 'criminal' : 'personal', type: `death.${how}`, severity: sev as 2 | 3 | 4 | 5, ...base(cause, player), title: titles[how],
    description: how === 'assassination' ? `${p.name}${p.title ? `, ${p.title},` : ''} was shot ${rng.pick(['during a public appearance', 'outside a private residence', 'in a motorcade attack', 'at a state dinner'])} in ${world.cities[p.cityId]?.name}. ${rng.pick(['No group has claimed responsibility.', 'Security forces have sealed the city.', 'A suspect was killed at the scene.'])}`
        : how === 'natural' ? `${p.name}, ${p.profession}${p.title ? ` and ${p.title}` : ''}, has died. Tributes ${p.reputation > 0 ? 'poured in from around the world' : 'were notably muted'}.`
        : how === 'accident' ? `${p.name} died suddenly. Investigators ${rng.bool(0.3) ? 'have not ruled out foul play' : 'described it as a tragic accident'}.`
        : `${p.name} has not been seen for days. ${rng.pick(['Family members suspect kidnapping.', 'Authorities are baffled.', 'Rumors of defection are circulating.'])}`,
    location: { cityId: p.cityId }, actors: [ref('person', p.id), ...(c ? [ref('country', c.id)] : [])],
    effects: isLeader ? [fx('country', c.id, 'stability', how === 'assassination' ? -18 : -8), fx('country', c.id, 'unrest', how === 'assassination' ? 12 : 3)] : [],
    tags: ['death', how, ...(c ? [c.code] : [])], historic: sev >= 4,
  });
  for (const x of led) changeLeader(world, rng, x, 'succession', ev.id);
  return ev;
}

export function createPublicFigure(world: World, rng: RNG, c: Country, profession: Profession, cause: Cause = 'simulation', player = false, name?: string): WorldEvent {
  const fam = familyOf(world, c);
  const p = makePerson(world, rng, fam, c, pickCity(world, rng, c), profession, 1);
  if (name) { const parts = name.split(' '); p.firstName = parts[0]; p.lastName = parts.slice(1).join(' ') || p.lastName; p.name = name; p.socialHandle = N.handleFor(p.firstName, p.lastName, rng); }
  p.fame = clamp(45 + rng.gauss(0, 10), 20, 90); p.influence = clamp(35 + rng.gauss(0, 10), 10, 80);
  return createEvent(world, {
    category: 'cultural', type: 'figure.rise', severity: 2, ...base(cause, player),
    title: `${p.name} bursts onto the ${c.adjective} scene`,
    description: `A ${profession.replace('-', ' ')} from ${world.cities[p.cityId]?.name}, ${p.name} has become a household name almost overnight after ${rng.pick(['a viral speech', 'an audacious stunt', 'a string of successes', 'an explosive interview', 'a breakout work'])}. Described as ${p.traits.join(' and ')}, ${p.firstName} says the ambition is to ${p.objective}.`,
    location: { cityId: p.cityId }, actors: [ref('person', p.id), ref('country', c.id)], effects: [], tags: ['people', profession, c.code],
  });
}

export function shiftOpinion(world: World, rng: RNG, c: Country, delta: number, cause: Cause = 'simulation', player = false, topic?: string): WorldEvent {
  const up = delta > 0;
  return createEvent(world, {
    category: 'social', type: up ? 'opinion.rally' : 'opinion.collapse', severity: Math.abs(delta) > 20 ? 3 : 2, ...base(cause, player),
    title: up ? `Public mood in ${c.name} swings behind the government` : `${c.adjective} public turns against the government`,
    description: up ? `${topic ?? rng.pick(['A wave of patriotic sentiment', 'A successful crisis response', 'A popular new program', 'Rising wages'])} has lifted support for ${leaderOf(world, c)?.name ?? 'the government'} across ${c.name}.` : `${topic ?? rng.pick(['Rising prices', 'A humiliating policy reversal', 'Perceived arrogance in the capital', 'A botched crisis response'])} has driven approval of ${leaderOf(world, c)?.name ?? 'the government'} to new lows across ${c.name}.`,
    location: { countryId: c.id }, actors: [ref('country', c.id)], effects: [fx('country', c.id, 'approval', delta), fx('country', c.id, 'unrest', up ? -delta / 3 : -delta / 3), fx('country', c.id, 'happiness', delta / 3)], tags: ['opinion', c.code],
  });
}

export function resourceDiscovery(world: World, rng: RNG, c: Country, resource: string, cause: Cause = 'simulation', player = false): WorldEvent {
  c.resources[resource] = clamp((c.resources[resource] ?? 0) + 35, 0, 100);
  const nice = { oil: 'oil and gas', minerals: 'copper and iron', farmland: 'fertile land', water: 'freshwater aquifers', rareEarth: 'rare earth' }[resource] ?? resource;
  return createEvent(world, {
    category: 'economic', type: 'resource.discovery', severity: 3, ...base(cause, player),
    title: `Massive ${nice} reserves discovered in ${c.name}`,
    description: `Geologists confirmed one of the largest ${nice} deposits ever found, located in ${c.adjective} territory. Foreign investors and rival governments are already circling.`,
    location: { countryId: c.id }, actors: [ref('country', c.id)], effects: [fx('country', c.id, 'gdpGrowth', 2), fx('country', c.id, 'corruption', 4)], tags: ['resources', resource, c.code], data: { resource },
  });
}

export function migrationWave(world: World, rng: RNG, from: Country, to: Country, size: number, cause: Cause = 'simulation', player = false): WorldEvent {
  const n = Math.round(size);
  from.population = Math.max(1000, from.population - n); to.population += n;
  return createEvent(world, {
    category: 'social', type: 'migration.wave', severity: n > 2_000_000 ? 4 : n > 300_000 ? 3 : 2, ...base(cause, player),
    title: `${n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + 'M' : (n / 1000).toFixed(0) + 'k'} people flee ${from.name} for ${to.name}`,
    description: `A mass movement of people is underway from ${from.name} into ${to.name}. Border towns are overwhelmed and ${to.adjective} politics is polarizing over the response.`,
    location: { countryId: to.id }, actors: [ref('country', from.id), ref('country', to.id)],
    effects: [fx('country', to.id, 'polarization', 6), fx('country', to.id, 'unrest', 3), fx('country', from.id, 'gdpGrowth', -0.5), fx('country', to.id, 'gdpGrowth', 0.3)], tags: ['migration', from.code, to.code], data: { size: n },
  });
}

export function createReligion(world: World, rng: RNG, c: Country, cause: Cause = 'simulation', player = false, name?: string): WorldEvent {
  const fam = familyOf(world, c);
  const leader = makePerson(world, rng, fam, c, pickCity(world, rng, c), 'religious-leader', 1);
  const org = makeOrg(world, rng, fam, c, 'religion', name ?? N.orgName(rng, fam, 'religion'), leader.id, undefined, rng.pick(['spiritual awakening', 'purification of society', 'unity of all peoples', 'preparation for what is coming']));
  org.founded = world.day; org.support = rng.float(3, 15);
  leader.affiliations.push(org.id); leader.fame = 55;
  return createEvent(world, {
    category: 'cultural', type: 'religion.founded', severity: 2, ...base(cause, player),
    title: `New belief movement "${org.name}" spreads in ${c.name}`,
    description: `Followers of ${leader.name} claim ${rng.pick(['a revelation', 'a scientific proof of the divine', 'contact with something beyond', 'the rediscovery of an ancient truth'])}. Membership is growing fast among ${rng.pick(['the young', 'the disillusioned', 'the wealthy', 'rural communities'])}.`,
    location: { cityId: leader.cityId }, actors: [ref('organization', org.id), ref('person', leader.id), ref('country', c.id)], effects: [fx('country', c.id, 'polarization', 4)], tags: ['religion', 'culture', c.code],
  });
}
