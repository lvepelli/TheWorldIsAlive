/**
 * Recurring calendar: a film festival every spring and a trade fair every autumn.
 * Both are stages — a festival makes an artist famous (and can get a film banned), a fair makes companies sign deals.
 * Called from the monthly tick; each fires once per calendar year (guarded by the event log).
 */
import { RNG, clamp } from '../rng';
import type { World, WorldEvent, Country, Company } from '../types';
import { toDate, yearOf } from '../time';
import { createEvent, fx, ref } from '../events/engine';
import { tradeLinks, tradeVolume } from './trade';

const FILMS = ['a film about the border', 'a three-hour silent epic', 'a comedy about the ministry', 'a documentary shot inside a mine', 'a love story set during the blackout', 'a thriller about a missing minister', 'an animated history of the republic', 'a film made entirely from drone footage'];
const FAIR_STARS = ['a self-charging freight drone', 'a desalination plant that fits in a container', 'a grain that grows on salt marsh', 'a modular reactor the size of a bus', 'an implant that translates in real time', 'a house printed in a day', 'a battery that ships as powder'];

function firedThisYear(world: World, type: string, year: number): boolean {
  for (let i = world.events.length - 1; i >= 0; i--) { const e = world.events[i]; if (world.day - e.day > 400) break; if (e.type === type && yearOf(e.day, world.meta.startYear) === year) return true; }
  return false;
}

export interface CalendarOptions { host?: Country; player?: boolean }

export function calendarTick(world: World, rng: RNG): WorldEvent[] {
  const out: WorldEvent[] = [];
  const date = toDate(world.day, world.meta.startYear); const year = date.year;
  if (!Object.keys(world.countries).length) return out;
  if (date.month >= 4 && date.month <= 5 && !firedThisYear(world, 'festival.film', year)) out.push(holdFestival(world, rng));
  if (date.month >= 9 && date.month <= 10 && !firedThisYear(world, 'trade.fair', year)) out.push(holdFair(world, rng));
  out.push(...holyDays(world, rng, date.month, year));
  return out;
}

/** Each living faith with real support has a holy season (a month fixed by its id); once a year its country fills with pilgrims. */
function holyDays(world: World, rng: RNG, month: number, year: number): WorldEvent[] {
  const out: WorldEvent[] = [];
  const faiths = Object.values(world.organizations).filter((o) => o.alive && o.type === 'religion' && o.countryId && o.support > 15);
  for (const f of faiths) {
    const holyMonth = RNG.hash(f.id)[0] % 12; if (month < holyMonth) continue; // the monthly tick can skip a calendar month, so fire on or after the holy month
    if (firedThisYearFor(world, 'religion.holiday', f.id, year)) continue;
    const c = world.countries[f.countryId!]; if (!c) continue;
    const city = world.cities[c.capitalId] ?? world.cities[c.cityIds[0]]; if (!city) continue;
    const pilgrims = Math.round(c.population * (f.support / 100) * rng.float(0.05, 0.2));
    const leader = f.leaderId ? world.people[f.leaderId] : undefined;
    const clash = c.polarization > 65 && rng.bool(0.25);
    if (clash) c.unrest = clamp(c.unrest + 2, 0, 100);
    out.push(createEvent(world, {
      category: 'cultural', type: clash ? 'religion.holiday.clash' : 'religion.holiday', severity: clash ? 3 : f.support > 40 ? 2 : 1,
      title: clash ? `Clashes mar the ${f.name} holy days in ${city.name}` : `${f.name} holy days fill ${city.name}`,
      description: clash
        ? `${fmtCount(pilgrims)} pilgrims came to ${city.name} for the ${f.name} holy days; ${rng.pick(['a counter-march', 'a blasphemous poster', 'a dispute over a shrine', 'a politician\'s speech'])} turned the last night into street fighting. ${leader ? `${leader.name} appealed for calm.` : 'The police blamed outsiders.'}`
        : `${fmtCount(pilgrims)} ${c.adjective} pilgrims filled ${city.name} for the ${f.name} holy days. ${leader ? `${leader.name} led the ${rng.pick(['vigil', 'procession', 'dawn prayer'])}. ` : ''}${rng.pick(['Shops closed; the trains did not.', 'The government declared two days off.', 'The capital\'s traffic gave up entirely.', 'Sceptics stayed home and complained online.'])}`,
      location: { countryId: c.id, cityId: city.id, x: city.x, y: city.y }, actors: [ref('organization', f.id), ref('country', c.id), ...(leader ? [ref('person', leader.id)] : [])],
      effects: clash ? [fx('country', c.id, 'unrest', 3), fx('country', c.id, 'polarization', 2)] : [fx('country', c.id, 'happiness', f.support > 40 ? 2 : 1), fx('country', c.id, 'unrest', -1)],
      tags: ['culture', 'religion', c.code], data: { orgId: f.id, pilgrims, shocks: clash ? [] : [{ sector: 'retail', pct: 0.005 }] },
    }));
  }
  return out;
}

function firedThisYearFor(world: World, type: string, orgId: string, year: number): boolean {
  for (let i = world.events.length - 1; i >= 0; i--) { const e = world.events[i]; if (world.day - e.day > 400) break; if ((e.type === type || e.type === `${type}.clash`) && e.data?.orgId === orgId && yearOf(e.day, world.meta.startYear) === year) return true; }
  return false;
}

function fmtCount(n: number): string { return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n); }

/** Spring film festival: a host city, a winning film and its maker. God Mode can call it for a chosen host. */
export function holdFestival(world: World, rng: RNG, opts: CalendarOptions = {}): WorldEvent {
  const year = yearOf(world.day, world.meta.startYear);
  {
    const cities = Object.values(world.cities).filter((ct) => world.countries[ct.countryId] && (!opts.host || ct.countryId === opts.host.id));
    const host = rng.pickWeighted(cities, (ct) => ct.prosperity + (world.countries[ct.countryId]?.freedom ?? 0) * 0.5 + (ct.coastal ? 15 : 0) + 5);
    const hc = world.countries[host.countryId];
    const artists = Object.values(world.people).filter((p) => p.alive && !p.retired && p.profession === 'artist');
    const maker = artists.length ? rng.pickWeighted(artists, (p) => p.fame + p.personality.openness * 20 + 5) : undefined;
    const film = rng.pick(FILMS);
    const makerCountry = maker ? world.countries[maker.countryId] : undefined;
    if (maker) { maker.fame = clamp(maker.fame + 15, 0, 100); maker.wealth += 1; maker.influence = clamp(maker.influence + 3, 0, 100); maker.history.push({ day: world.day, text: `Won the ${year} ${host.name} Film Festival with ${film}.` }); }
    const political = /border|ministry|minister|republic|blackout/.test(film);
    return createEvent(world, {
      category: 'cultural', type: 'festival.film', severity: (maker?.fame ?? 0) > 60 ? 3 : 2, causedBy: opts.player ? 'player' : 'simulation', playerIntervention: opts.player,
      title: `${host.name} Film Festival: ${maker ? `${maker.name} wins with ${film}` : 'a quiet year on the red carpet'}`,
      description: `${hc.name} hosted the ${year} ${host.name} Film Festival. ${maker ? `The top prize went to ${maker.name}${makerCountry ? ` of ${makerCountry.name}` : ''} for ${film}${political ? ', a work some delegations found uncomfortable' : ''}. ` : ''}${rng.pick(['The red carpet was longer than the films.', 'A jury member walked out on the second night.', 'Streaming services outbid each other in the lobby.', 'The closing party ran until dawn.'])}`,
      location: { countryId: hc.id, cityId: host.id, x: host.x, y: host.y },
      actors: [ref('country', hc.id), ...(maker ? [ref('person', maker.id)] : []), ...(makerCountry && makerCountry.id !== hc.id ? [ref('country', makerCountry.id)] : [])],
      effects: [fx('country', hc.id, 'happiness', 2), fx('city', host.id, 'prosperity', 1), ...(makerCountry ? [fx('country', makerCountry.id, 'happiness', 1)] : [])],
      tags: ['culture', 'film', hc.code], data: { host: hc.id, city: host.id, maker: maker?.id, film, political, shocks: [{ sector: 'media', pct: 0.015 }] },
    });
  }
}

/** Autumn trade fair: the biggest trading nation (or a chosen host) invites its partners; companies sign deals. */
export function holdFair(world: World, rng: RNG, opts: CalendarOptions = {}): WorldEvent {
  const year = yearOf(world.day, world.meta.startYear); const cs = Object.values(world.countries);
  {
    const host = opts.host ?? rng.pickWeighted(cs, (c) => Math.max(1, tradeLinks(world, c).reduce((s, l) => s + l.volume, 0)) + (c.atWarWith.length ? 0 : 50));
    const guests = tradeLinks(world, host).slice(0, 4).map((l) => l.partner).filter((g) => !g.atWarWith.includes(host.id));
    const capital = world.cities[host.capitalId];
    const companies = Object.values(world.companies).filter((co) => co.alive && (co.countryId === host.id || guests.some((g) => g.id === co.countryId)));
    const byCountry = new Map<string, Company>();
    for (const co of companies.sort((a, b) => b.value - a.value)) if (!byCountry.has(co.countryId)) byCountry.set(co.countryId, co);
    const deal = Array.from(byCountry.values()).slice(0, 2);
    const star = rng.pick(FAIR_STARS);
    const volume = guests.reduce((s, g) => s + tradeVolume(world, host, g), 0);
    for (const g of guests) { host.relations[g.id] = clamp((host.relations[g.id] ?? 0) + 3, -100, 100); g.relations[host.id] = clamp((g.relations[host.id] ?? 0) + 3, -100, 100); }
    return createEvent(world, {
      category: 'economic', type: 'trade.fair', severity: volume > 300 ? 3 : 2, causedBy: opts.player ? 'player' : 'simulation', playerIntervention: opts.player,
      title: `${capital?.name ?? host.name} Trade Fair opens with ${guests.length} partner nations`,
      description: `${host.name} opened the ${year} trade fair in ${capital?.name ?? 'the capital'}, with delegations from ${guests.map((g) => g.name).join(', ') || 'few partners'}. The talk of the halls was ${star}. ${deal.length === 2 ? `${deal[0].name} and ${deal[1].name} were seen in the same meeting rooms all week.` : rng.pick(['Order books filled by the second day.', 'Half the stands sold energy.', 'The host promised lower tariffs, again.'])}`,
      location: { countryId: host.id, cityId: capital?.id, x: capital?.x ?? host.centroid.x, y: capital?.y ?? host.centroid.y },
      actors: [ref('country', host.id), ...guests.map((g) => ref('country', g.id)), ...deal.map((co) => ref('company', co.id))],
      effects: [fx('country', host.id, 'gdpGrowth', 0.2), fx('country', host.id, 'happiness', 1), ...guests.map((g) => fx('country', g.id, 'gdpGrowth', 0.1))],
      tags: ['trade', 'economy', host.code, ...guests.map((g) => g.code)], data: { host: host.id, guests: guests.map((g) => g.id), deal: deal.map((co) => co.id), star, shocks: [{ sector: 'manufacturing', pct: 0.01 }, { sector: 'transport', pct: 0.01 }] },
    });
  }
}

export function fairHost(world: World, ev: WorldEvent): Country | undefined { return ev.data?.host ? world.countries[ev.data.host as string] : undefined; }
