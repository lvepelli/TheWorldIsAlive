/**
 * Slow-moving simulation systems. These run weekly / monthly / yearly and
 * shape the numbers that the event engine reacts to.
 */
import { tradeShare } from './trade';
import { pctChange } from './markets';
import { RNG, clamp } from '../rng';
import type { World, Country, WorldEvent } from '../types';
import { DAYS_PER_YEAR } from '../types';
import { yearOf } from '../time';
import * as A from '../events/actions';
import { createEvent, fx, ref } from '../events/engine';

// ---------------------------------------------------------------------------
// WEEKLY: population, economy drift, unrest dynamics
// ---------------------------------------------------------------------------
export function weeklyTick(world: World, rng: RNG): void {
  // Food-price crisis: when grain has spiked over two months (droughts, floods, war), the poor go hungry first.
  const grain = world.commodities.grain;
  if (grain && grain.history.length > 60) {
    const rise = pctChange(grain.history, 60);
    const recent = world.events.slice(-600).some((e) => e.type === 'food.crisis' && world.day - e.day < 120);
    if (rise > 25 && !recent) {
      const cs = Object.values(world.countries).map((c) => ({ c, pc: (c.gdp * 1e9) / Math.max(1, c.population) })).sort((a, b) => a.pc - b.pc);
      const poor = cs.slice(0, Math.max(3, Math.floor(cs.length / 3))).map((x) => x.c);
      createEvent(world, {
        category: 'economic', type: 'food.crisis', severity: rise > 45 ? 4 : 3,
        title: `Food prices spiral: grain up ${rise.toFixed(0)}% in two months`,
        description: `Bread lines returned to ${poor.slice(0, 3).map((c) => c.name).join(', ')} as grain hit ${grain.price.toFixed(0)} ${grain.unit}. ${rng.pick(['Governments blamed speculators.', 'Export bans spread from capital to capital.', 'Aid agencies warned of famine in the poorest regions.'])}`,
        location: { countryId: poor[0].id }, actors: poor.slice(0, 4).map((c) => ref('country', c.id)),
        effects: poor.flatMap((c) => [fx('country', c.id, 'happiness', -3), fx('country', c.id, 'unrest', 4), fx('country', c.id, 'inflation', 1.5)]),
        tags: ['food', 'crisis', 'economy'], historic: rise > 45, data: { rise, poor: poor.map((c) => c.id), shocks: [{ sector: 'agriculture', pct: 0.05 }, { sector: 'retail', pct: -0.03 }] },
      });
    }
  }
  const wk = 7 / DAYS_PER_YEAR;
  for (const c of Object.values(world.countries)) {
    // Population growth: base fertility minus development, plus happiness effect
    const growth = (0.018 - c.technology / 100 * 0.014 + (c.happiness - 50) / 100 * 0.004 - (c.atWarWith.length ? 0.01 : 0)) * wk;
    c.population = Math.max(10_000, Math.round(c.population * (1 + growth)));
    for (const id of c.cityIds) { const city = world.cities[id]; if (city) city.population = Math.max(1000, Math.round(city.population * (1 + growth * (city.prosperity > 50 ? 1.3 : 0.8)))); }
    // GDP compounding
    c.gdp = Math.max(1, c.gdp * (1 + (c.gdpGrowth / 100) * wk));
    // Growth mean-reverts toward a potential determined by tech, stability and freedom
    const trade = tradeShare(world, c); // open, well-connected economies grow faster; losing partners hurts
    const potential = 1 + (c.technology - 50) / 40 + (c.stability - 50) / 60 + (c.freedom - 50) / 100 - (c.corruption - 40) / 80 - (c.atWarWith.length ? 3 : 0) - Math.max(0, c.debt - 100) / 80 + (Math.min(0.5, trade) - 0.25) * 2;
    c.gdpGrowth += (potential - c.gdpGrowth) * 0.04 + rng.gauss(0, 0.12);
    c.gdpGrowth = clamp(c.gdpGrowth, -25, 25);
    // Inflation follows growth and debt; unemployment follows growth inversely
    c.inflation += ((2 + Math.max(0, c.gdpGrowth) * 0.4 + Math.max(0, c.debt - 90) / 30 + (c.atWarWith.length ? 3 : 0)) - c.inflation) * 0.05 + rng.gauss(0, 0.15);
    c.inflation = clamp(c.inflation, -3, 200);
    c.unemployment += ((8 - c.gdpGrowth * 1.2 + (c.stability < 40 ? 4 : 0)) - c.unemployment) * 0.05 + rng.gauss(0, 0.1);
    c.unemployment = clamp(c.unemployment, 1, 55);
    c.debt += (-(c.gdpGrowth - 2) * 0.05 + (c.atWarWith.length ? 0.6 : 0)) + rng.gauss(0, 0.05);
    c.debt = clamp(c.debt, 0, 400);
    // Happiness follows economy, freedom, stability and war
    const targetHappy = 50 + (c.gdpGrowth * 2) - (c.unemployment - 8) * 1.2 - Math.max(0, c.inflation - 4) * 1.2 + (c.freedom - 50) / 4 + (c.stability - 50) / 5 - (c.atWarWith.length ? 12 : 0) - (c.corruption - 40) / 6;
    c.happiness += (clamp(targetHappy, 5, 95) - c.happiness) * 0.06;
    // Unrest grows when unhappy and polarized, decays when content
    const targetUnrest = clamp((60 - c.happiness) * 1.2 + (c.polarization - 40) / 2 + (50 - c.approval) / 3 - (c.freedom < 35 ? 8 : 0), 0, 100);
    c.unrest += (targetUnrest - c.unrest) * 0.05 + rng.gauss(0, 0.6);
    c.unrest = clamp(c.unrest, 0, 100);
    // Stability drifts toward a mix of approval, low unrest, and institutional strength
    const targetStab = clamp(60 + (c.approval - 50) / 3 - (c.unrest - 20) / 2 - (c.corruption - 40) / 5 + (c.electionEvery ? 4 : -2) - c.atWarWith.length * 8, 5, 98);
    c.stability += (targetStab - c.stability) * 0.03;
    // Approval decays slowly toward happiness
    c.approval += ((c.happiness * 0.7 + 15) - c.approval) * 0.03 + rng.gauss(0, 0.5);
    c.approval = clamp(c.approval, 2, 98);
    // Polarization slowly relaxes unless unrest is high
    // Polarization mean-reverts toward what unrest, freedom and inequality of mood can sustain; events push it, calm heals it.
    const targetPol = clamp(30 + (c.unrest - 20) * 0.6 + (c.freedom > 60 ? 6 : 0) - (c.happiness - 50) * 0.3 + (c.atWarWith.length ? 8 : 0), 5, 95);
    c.polarization += (targetPol - c.polarization) * 0.04 + rng.gauss(0, 0.3);
    c.polarization = clamp(c.polarization, 3, 97);
    // Cities follow the country
    for (const id of c.cityIds) {
      const city = world.cities[id]; if (!city) continue;
      city.unrest += (c.unrest - city.unrest) * 0.1 + rng.gauss(0, 0.5); city.unrest = clamp(city.unrest, 0, 100);
      city.prosperity += (clamp(c.technology * 0.5 + c.gdpGrowth * 3 + 20, 5, 98) - city.prosperity) * 0.03; city.prosperity = clamp(city.prosperity, 1, 100);
    }
  }
  // Companies: revenue & employees track value slowly, reputation decays toward zero
  for (const co of Object.values(world.companies)) {
    if (!co.alive) continue;
    co.revenue = Math.max(0.01, co.revenue * (1 + (co.growth / 100) * (7 / DAYS_PER_YEAR)) + (co.value * 0.25 - co.revenue) * 0.003);
    co.employees = Math.max(5, Math.round(co.employees + (co.value * 1500 - co.employees) * 0.01));
    co.reputation += -co.reputation * 0.01;
  }
}

// ---------------------------------------------------------------------------
// MONTHLY: politics, geopolitics, technology, society, organizations
// ---------------------------------------------------------------------------
export function monthlyTick(world: World, rng: RNG): WorldEvent[] {
  const out: WorldEvent[] = [];
  const year = yearOf(world.day, world.meta.startYear);
  // Movement support drifts toward what the country's mood can sustain; unrest feeds it, calm starves it.
  for (const o of Object.values(world.organizations)) {
    if (!o.alive || o.type !== 'movement' || !o.countryId) continue;
    const c = world.countries[o.countryId]; if (!c) continue;
    const target = 6 + c.unrest * 0.45 + c.polarization * 0.15 - (c.happiness - 50) * 0.25;
    o.support = clamp(o.support + (target - o.support) * 0.06 + rng.gauss(0, 1.5), 0, 100);
    if (o.support < 3 && rng.bool(0.3)) { o.alive = false; o.history.push({ day: world.day, text: 'Faded away.' }); }
  }
  for (const c of Object.values(world.countries)) {
    // Technology progress: investment scales with GDP per capita and freedom
    const gdpPc = (c.gdp * 1e9) / Math.max(1, c.population);
    c.technology = clamp(c.technology + (0.02 + Math.min(0.12, gdpPc / 400_000) + (c.freedom > 60 ? 0.02 : 0)) - (c.atWarWith.length ? 0.03 : 0), 1, 100);
    // Military slowly tracks GDP & threat
    const threat = c.neighbors.reduce((s, n) => s + ((c.relations[n] ?? 0) < -30 ? 1 : 0), 0) + c.atWarWith.length * 2;
    c.military = clamp(c.military + (threat * 0.4 + Math.log10(c.gdp + 1) * 0.15 - 0.5) * 0.4, 1, 100);
    // Corruption drifts: freedom reduces it, unrest & low stability raise it
    c.corruption = clamp(c.corruption + (-(c.freedom - 50) / 100 + (50 - c.stability) / 150) * 0.5 + rng.gauss(0, 0.3), 1, 99);
    // Climate risk creeps up
    c.climateRisk = clamp(c.climateRisk + 0.05 + rng.gauss(0, 0.1), 0, 100);
    // Relations drift: allies/traders converge, rivals diverge slightly, everything relaxes toward ideology-based baseline
    for (const [oid, rel] of Object.entries(c.relations)) {
      const o = world.countries[oid]; if (!o) { delete c.relations[oid]; continue; }
      let target = (c.ideology === o.ideology ? 15 : -5) + (c.alliances.includes(oid) ? 40 : 0) + (c.tradePartners.includes(oid) ? 15 : 0) + ((c.freedom > 60) === (o.freedom > 60) ? 8 : -10);
      if (c.atWarWith.includes(oid)) target = -100;
      c.relations[oid] = clamp(rel + (target - rel) * 0.03 + rng.gauss(0, 1.5), -100, 100);
    }
    // Elections
    if (c.electionEvery && year >= c.nextElectionYear && world.day % 30 < 7) {
      c.nextElectionYear = year + c.electionEvery;
      const incumbent = world.people[c.leaderId];
      // A surging movement fields its leader as the main challenger.
      const movement = Object.values(world.organizations).filter((o) => o.alive && o.type === 'movement' && o.countryId === c.id && o.support > 30 && o.leaderId && world.people[o.leaderId]?.alive && o.leaderId !== c.leaderId).sort((a, b) => b.support - a.support)[0];
      const winProb = clamp(c.approval / 100 + (incumbent?.personality.charisma ?? 0.5) * 0.15 - 0.1 + (c.corruption > 70 ? 0.15 : 0) - (movement ? (movement.support - 30) / 150 : 0), 0.05, 0.95);
      if (rng.next() < winProb) {
        c.approval = clamp(c.approval + 5, 0, 100);
        out.push(createEvent(world, {
          category: 'political', type: 'election.incumbent', severity: 2, title: `${incumbent?.name ?? 'Incumbent'} re-elected in ${c.name}`,
          description: `${c.adjective} voters returned ${incumbent?.name ?? 'the incumbent'} to office with ${(winProb * 60 + 20).toFixed(0)}% of the vote. ${c.corruption > 70 ? 'International observers questioned the count.' : 'Turnout was ' + rng.pick(['high', 'moderate', 'record-breaking']) + '.'}`,
          location: { countryId: c.id }, actors: [ref('country', c.id), ...(incumbent ? [ref('person', incumbent.id)] : [])], effects: [fx('country', c.id, 'stability', 3), fx('country', c.id, 'polarization', 2)], tags: ['election', 'politics', c.code],
        }));
      } else {
        const challenger = movement && rng.bool(0.7) ? world.people[movement.leaderId!] : undefined;
        const ev = A.changeLeader(world, rng, c, 'election', 'simulation', false, challenger);
        if (challenger && movement) { movement.influence = clamp(movement.influence + 20, 0, 100); movement.history.push({ day: world.day, text: `${challenger.name} won the ${year} election on the movement's platform.` }); ev.description += ` The victory caps the rise of ${movement.name}, which began as a protest movement.`; ev.tags.push('movement'); }
        out.push(ev);
      }
    }
    // Coup / collapse risk for very unstable states
    // Upheaval: a state at the edge collapses or suffers a coup, but not twice within two years — transitional regimes get a chance.
    const recentUpheaval = c.history.some((h) => /Government collapsed|Coup\.|Revolution\./.test(h.text) && world.day - h.day < 730);
    if (c.stability < 25 && !recentUpheaval && rng.next() < 0.06) out.push(c.military > 40 && rng.bool(0.6) ? A.changeLeader(world, rng, c, 'coup') : A.collapseGovernment(world, rng, c));
    else if (c.unrest > 75 && c.stability < 40 && rng.next() < 0.08) out.push(A.changeLeader(world, rng, c, 'revolution'));
  }
  // Organizations: support tracks agenda relevance
  for (const o of Object.values(world.organizations)) {
    if (!o.alive) continue;
    const c = o.countryId ? world.countries[o.countryId] : undefined;
    if (o.type === 'movement' && c) { o.support = clamp(o.support + (c.unrest - 30) / 40 + rng.gauss(0, 1.5) - 0.3, 0, 100); o.influence = clamp(o.influence + (o.support - o.influence) * 0.1, 0, 100); if (o.support < 2 && rng.bool(0.2)) { o.alive = false; if (c) c.movements = c.movements.filter((m) => m !== o.id); } }
    if (o.type === 'government' && c) { o.support = c.approval; o.influence = clamp(c.stability * 0.8 + 20, 0, 100); }
    if (o.type === 'party' && c) { o.support = clamp(o.support + rng.gauss(0, 2) + (o.leaderId === c.leaderId ? (c.approval - 50) / 20 : (50 - c.approval) / 20), 2, 90); }
    if (o.type === 'criminal' && c) { o.influence = clamp(o.influence + (c.corruption - 45) / 30 + rng.gauss(0, 1), 1, 100); }
    if (o.type === 'research' && c) { o.influence = clamp(o.influence + (c.technology - 50) / 60 + rng.gauss(0, 0.5), 1, 100); }
  }
  return out;
}

// ---------------------------------------------------------------------------
// YEARLY
// ---------------------------------------------------------------------------
export function yearlyTick(world: World, rng: RNG): WorldEvent[] {
  const out: WorldEvent[] = [];
  const year = yearOf(world.day, world.meta.startYear);
  // Global climate pressure event every few years
  if (rng.bool(0.35)) {
    const worst = Object.values(world.countries).sort((a, b) => b.climateRisk - a.climateRisk).slice(0, 3);
    for (const c of worst) c.resources.water = clamp(c.resources.water - 4, 0, 100);
    out.push(createEvent(world, {
      category: 'environmental', type: 'climate.report', severity: 3, title: `${year} climate report: ${worst.map((c) => c.name).join(', ')} most at risk`,
      description: `The annual global assessment warns that ${worst[0]?.name} faces severe water and food stress within the decade. Emissions ${rng.pick(['fell slightly', 'rose again', 'plateaued'])} last year.`,
      actors: worst.map((c) => ref('country', c.id)), effects: worst.map((c) => fx('country', c.id, 'climateRisk', 2)), tags: ['climate', 'environment', 'global'],
    }));
  }
  // Harvest report: farmland, water, climate stress and this year's droughts and floods decide each country's yield;
  // the world's shortfall or surplus moves grain, and the worst- and best-fed nations feel it.
  {
    const cs = Object.values(world.countries);
    const yearEvents = world.events.filter((e) => world.day - e.day < 365 && e.type.startsWith('disaster.'));
    const results = cs.map((c) => {
      const drought = yearEvents.some((e) => e.type === 'disaster.drought' && e.location.countryId === c.id);
      const flood = yearEvents.some((e) => e.type === 'disaster.flood' && e.location.countryId === c.id);
      const potential = (c.resources.farmland ?? 50) / 100 * (0.5 + (c.resources.water ?? 50) / 200);
      const actual = potential * (1 - c.climateRisk / 300) * (drought ? 0.6 : 1) * (flood ? 0.85 : 1) * (0.85 + rng.next() * 0.3) * (1 + c.technology / 500);
      return { c, ratio: actual / Math.max(0.05, potential), weight: c.population };
    });
    const totalW = results.reduce((s, r) => s + r.weight, 0);
    const worldRatio = results.reduce((s, r) => s + r.ratio * r.weight, 0) / Math.max(1, totalW);
    const poor = results.filter((r) => r.ratio < 0.72).sort((a, b) => a.ratio - b.ratio);
    const bumper = results.filter((r) => r.ratio > 1.12).sort((a, b) => b.ratio - a.ratio);
    const grainPct = clamp((1 - worldRatio) * 0.6, -0.12, 0.25);
    out.push(createEvent(world, {
      category: 'economic', type: 'harvest.report', severity: poor.length >= 4 || grainPct > 0.12 ? 3 : 2,
      title: worldRatio < 0.85 ? `${year} harvest: the world's granaries fall short` : worldRatio > 1.05 ? `${year} harvest: a bumper year` : `${year} harvest: an ordinary year`,
      description: `${poor.length ? `Poor harvests in ${poor.slice(0, 3).map((r) => r.c.name).join(', ')}${poor.length > 3 ? ` and ${poor.length - 3} more` : ''}.` : 'No major shortfalls.'} ${bumper.length ? `Bumper crops in ${bumper.slice(0, 2).map((r) => r.c.name).join(' and ')}.` : ''} World output ${worldRatio < 1 ? `${((1 - worldRatio) * 100).toFixed(0)}% below` : `${((worldRatio - 1) * 100).toFixed(0)}% above`} expectations; grain ${grainPct > 0 ? 'firmed' : 'eased'}.`,
      location: poor[0] ? { countryId: poor[0].c.id } : {}, actors: [...poor.slice(0, 3), ...bumper.slice(0, 2)].map((r) => ref('country', r.c.id)),
      effects: [...poor.map((r) => fx('country', r.c.id, 'happiness', -2)), ...poor.map((r) => fx('country', r.c.id, 'unrest', 2)), ...bumper.map((r) => fx('country', r.c.id, 'happiness', 2))],
      tags: ['harvest', 'food', 'economy'], data: { worldRatio, yields: Object.fromEntries(results.map((r) => [r.c.id, Math.round(r.ratio * 100) / 100])), shocks: [{ commodityId: 'grain', pct: grainPct }, { sector: 'agriculture', pct: grainPct > 0 ? 0.03 : -0.01 }] },
    }));
  }
  // World Games every four years: a global cultural moment with a host and a champion.
  if (year % 4 === 0) {
    const cs = Object.values(world.countries);
    const host = rng.pickWeighted(cs, (c) => c.gdp + c.stability * 5);
    const athletes = Object.values(world.people).filter((p) => p.alive && !p.retired && p.profession === 'athlete');
    const champ = athletes.length ? rng.pickWeighted(athletes, (p) => p.fame + 10) : undefined;
    const winner = champ ? world.countries[champ.countryId] : rng.pickWeighted(cs, (c) => c.population);
    if (champ) { champ.fame = clamp(champ.fame + 25, 0, 100); champ.wealth += 5; champ.history.push({ day: world.day, text: `Became champion of the ${year} World Games in ${world.cities[host.capitalId]?.name}.` }); }
    out.push(createEvent(world, {
      category: 'cultural', type: 'world.games', severity: 3, title: `${year} World Games in ${world.cities[host.capitalId]?.name ?? host.name}: ${winner.name} triumphs`,
      description: `Billions watched the ${year} World Games hosted by ${host.name}. ${champ ? `${champ.name} became the face of the games with a stunning victory, ` : ''}${winner.name} topped the medal table. ${rng.pick(["The opening ceremony cost more than a small country's budget.", 'Politics stayed at the door, mostly.', 'A doping scandal shadowed the final week.', 'The host city gained a new stadium and a large debt.'])}`,
      location: { countryId: host.id }, actors: [ref('country', host.id), ref('country', winner.id), ...(champ ? [ref('person', champ.id)] : [])],
      effects: [fx('country', host.id, 'happiness', 4), fx('country', host.id, 'debt', 2), fx('country', winner.id, 'happiness', 5), fx('country', winner.id, 'approval', 2)], tags: ['culture', 'sports', host.code, winner.code],
    }));
  }
  // The Laurels: yearly prizes for art and science, a stage for characters to become famous on.
  {
    const cs = Object.values(world.countries);
    const artists = Object.values(world.people).filter((p) => p.alive && !p.retired && p.profession === 'artist');
    const scientists = Object.values(world.people).filter((p) => p.alive && !p.retired && (p.profession === 'scientist' || p.profession === 'engineer'));
    const artLaureate = artists.length ? rng.pickWeighted(artists, (p) => p.fame + p.personality.openness * 30 + 5) : undefined;
    const sciLaureate = scientists.length ? rng.pickWeighted(scientists, (p) => p.fame + p.influence + 5) : undefined;
    if (artLaureate || sciLaureate) {
      const seat = rng.pickWeighted(cs, (c) => c.technology + c.freedom);
      const works = ['a novel about the machines', 'a symphony written for drones', 'a mural the size of a district', 'a film shot entirely at night', 'a cycle of poems about the border', 'a game played by a whole city'];
      const feats = ['work on room-temperature superconductors', 'a cure that reached patients within a year', 'mapping the ocean floor with swarms', 'a theory of turbulence', 'the first synthetic ecosystem', 'quantum error correction at scale'];
      for (const [p, what] of [[artLaureate, rng.pick(works)], [sciLaureate, rng.pick(feats)]] as [typeof artLaureate, string][]) {
        if (!p) continue;
        p.fame = clamp(p.fame + 20, 0, 100); p.wealth += 2; p.influence = clamp(p.influence + 6, 0, 100);
        p.history.push({ day: world.day, text: `Won the ${year} Laurel Prize for ${what}.` });
      }
      out.push(createEvent(world, {
        category: 'cultural', type: 'prize.laurels', severity: (artLaureate?.fame ?? 0) > 70 || (sciLaureate?.fame ?? 0) > 70 ? 3 : 2,
        title: `${year} Laurel Prizes: ${[artLaureate?.name, sciLaureate?.name].filter(Boolean).join(' and ')} honoured`,
        description: `At the ceremony in ${world.cities[seat.capitalId]?.name ?? seat.name}, ${artLaureate ? `${artLaureate.name} (${world.countries[artLaureate.countryId]?.adjective ?? ''} artist) took the arts laurel` : ''}${artLaureate && sciLaureate ? ' and ' : ''}${sciLaureate ? `${sciLaureate.name} (${world.countries[sciLaureate.countryId]?.adjective ?? ''} ${sciLaureate.profession}) took the science laurel` : ''}. ${rng.pick(['The speeches were political.', 'A protester interrupted the ceremony.', 'The after-party made more headlines than the prizes.', 'Bookmakers had picked neither.'])}`,
        location: { countryId: seat.id }, actors: [...(artLaureate ? [ref('person', artLaureate.id)] : []), ...(sciLaureate ? [ref('person', sciLaureate.id)] : []), ref('country', seat.id)],
        effects: [...(artLaureate ? [fx('country', artLaureate.countryId, 'happiness', 1)] : []), ...(sciLaureate ? [fx('country', sciLaureate.countryId, 'technology', 1)] : [])],
        tags: ['culture', 'prize', seat.code],
      }));
    }
  }
  return out;
}

export function countryPower(c: Country): number {
  return c.gdp ** 0.6 * 2 + c.military * 3 + c.technology * 2 + Math.sqrt(c.population / 1e6) * 4;
}
