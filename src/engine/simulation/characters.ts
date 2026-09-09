/**
 * Character simulation. Important people pursue objectives, age, gain and
 * lose influence, found companies, run for office, die and retire.
 */
import { RNG, clamp } from '../rng';
import type { World, Person, WorldEvent, Sector } from '../types';
import { DAYS_PER_YEAR, SECTORS } from '../types';
import * as A from '../events/actions';
import { createEvent, fx, ref } from '../events/engine';
import { relate } from './relations';
import { makePerson } from '../generator/world';

export function monthlyCharacters(world: World, rng: RNG): WorldEvent[] {
  const out: WorldEvent[] = [];
  // Corporate succession: companies whose CEO died, retired or moved on get a new one.
  for (const co of Object.values(world.companies)) {
    if (!co.alive) continue;
    const ceo = world.people[co.ceoId];
    if (ceo && ceo.alive && !ceo.retired && ceo.affiliations.includes(co.id) && (ceo.profession === 'executive' || ceo.profession === 'entrepreneur' || ceo.profession === 'scientist' || ceo.profession === 'engineer')) continue;
    const c = world.countries[co.countryId]; if (!c) continue;
    const cands = Object.values(world.people).filter((p) => p.alive && !p.retired && p.countryId === c.id && p.profession === 'executive' && !p.affiliations.some((id) => world.companies[id]?.alive && world.companies[id].ceoId === p.id));
    const next = cands.length ? rng.pickWeighted(cands, (p) => p.influence + 10) : A.peopleOf(world, c.id, 'executive')[0] ?? null;
    // The runner-up remembers being passed over: a rivalry that can surface later (feuds, scandal pile-ons, funders).
    const passedOver = next ? cands.filter((p) => p.id !== next.id).sort((a, b) => b.influence - a.influence)[0] : undefined;
    if (passedOver && next && rng.bool(0.6)) { relate(world, passedOver, next, 'rival', -0.5); passedOver.history.push({ day: world.day, text: `Passed over for the top job at ${co.name} in favour of ${next.name}.` }); passedOver.objective = `prove the board of ${co.name} wrong`; }
    const fam = A.familyOf(world, c);
    const newCeo = next ?? makePerson(world, rng, fam, c, world.cities[co.cityId] ?? A.capitalOf(world, c), 'executive', 2);
    co.ceoId = newCeo.id; if (!newCeo.affiliations.includes(co.id)) newCeo.affiliations.push(co.id); newCeo.title = 'CEO'; newCeo.tier = Math.min(newCeo.tier, 2) as 1 | 2 | 3;
    newCeo.history.push({ day: world.day, text: `Became CEO of ${co.name}.` });
    const why = ceo ? (!ceo.alive ? `the death of ${ceo.name}` : ceo.retired ? `the retirement of ${ceo.name}` : `${ceo.name}'s departure`) : 'a leadership vacuum';
    const snub = passedOver && passedOver.relationships.some((r) => r.target.id === newCeo.id && r.strength < 0) ? ` ${passedOver.name}, widely seen as the heir apparent, ${rng.pick(['left the building without comment', 'is said to be furious', 'was not in the room when the vote was taken'])}.` : '';
    out.push(createEvent(world, { category: 'corporate', type: 'ceo.change', severity: co.value > 100 ? 3 : 2, title: `${newCeo.name} takes the helm at ${co.name}`, description: `Following ${why}, the board of ${co.name} named ${newCeo.name} chief executive. ${rng.pick(['Investors reacted cautiously.', 'The share price jumped on the news.', 'Insiders describe a bruising succession fight.'])}` + snub, location: { cityId: co.cityId }, actors: [ref('company', co.id), ref('person', newCeo.id), ...(ceo ? [ref('person', ceo.id)] : [])], effects: [fx('person', newCeo.id, 'influence', 8), fx('person', newCeo.id, 'fame', 6), fx('company', co.id, 'value%', rng.float(-5, 5))], tags: ['corporate', co.sector, c.code] }));
  }
  const people = Object.values(world.people).filter((p) => p.alive);
  for (const p of people) {
    const c = world.countries[p.countryId];
    if (!c) continue;
    const age = (world.day - p.birthDay) / DAYS_PER_YEAR;
    // Mortality: rises steeply past 70
    const mort = (age < 50 ? 0.0002 : age < 70 ? 0.001 : age < 85 ? 0.006 : 0.03) / 12 * (c.atWarWith.length ? 1.5 : 1);
    if (rng.next() < mort) { out.push(A.killPerson(world, rng, p, rng.bool(0.85) ? 'natural' : 'accident')); continue; }
    // Retirement
    if (!p.retired && age > 68 && c.leaderId !== p.id && rng.next() < 0.02) {
      p.retired = true; p.influence *= 0.5;
      p.history.push({ day: world.day, text: 'Retired from public life.' });
      if (p.fame > 50) out.push(createEvent(world, { category: 'personal', type: 'retirement', severity: 2, title: `${p.name} retires`, description: `After a long career as a ${p.profession}, ${p.name} announced retirement at ${Math.floor(age)}.`, location: { cityId: p.cityId }, actors: [ref('person', p.id)], effects: [], tags: ['people', c.code] }));
      continue;
    }
    if (p.retired) continue;
    // Drift: influence follows fame & reputation; fame decays; wealth grows with influence
    p.influence = clamp(p.influence + (p.fame * 0.45 + p.reputation * 0.15 + (c.leaderId === p.id ? 20 + c.stability * 0.15 + (c.gdp > 1000 ? 8 : 0) : 0) - p.influence) * 0.05 + rng.gauss(0, 1), 0, 100);
    p.fame = clamp(p.fame - 0.4 + p.socialActivity * 0.3 + rng.gauss(0, 0.8), 0, 100);
    p.reputation = clamp(p.reputation - p.reputation * 0.02 + rng.gauss(0, 1), -100, 100);
    p.wealth = Math.max(0.01, p.wealth * (1 + (p.influence / 100 * 0.01 + (c.gdpGrowth / 100) / 12) + rng.gauss(0, 0.01)));
    // Personal life: partnerships and children (rare, low severity, but they make people feel real)
    const partner = p.relationships.find((r) => r.type === 'partner' && world.people[r.target.id]?.alive);
    if (!partner && age > 24 && age < 60 && rng.next() < 0.006) {
      const cands = Object.values(world.people).filter((o) => o.alive && o.id !== p.id && o.countryId === p.countryId && Math.abs(o.birthDay - p.birthDay) < 15 * DAYS_PER_YEAR && !o.relationships.some((r) => r.type === 'partner'));
      if (cands.length) {
        const o = rng.pickWeighted(cands, (x) => 1 + (p.relationships.some((r) => r.target.id === x.id && r.strength > 0.3) ? 4 : 0) + x.fame / 50);
        relate(world, p, o, 'partner', 0.8);
        const famous = p.fame > 55 || o.fame > 55;
        p.history.push({ day: world.day, text: `Began a partnership with ${o.name}.` }); o.history.push({ day: world.day, text: `Began a partnership with ${p.name}.` });
        out.push(createEvent(world, { category: 'personal', type: 'partnership', severity: famous ? 2 : 1, title: `${p.name} and ${o.name} ${rng.pick(['marry', 'go public as a couple', 'announce their engagement'])}`, description: `${famous ? 'Gossip columns exploded when' : 'Friends confirmed that'} ${p.name} (${p.profession.replace('-', ' ')}) and ${o.name} (${o.profession.replace('-', ' ')}) ${rng.pick(['tied the knot in a private ceremony', 'were seen together in ' + (world.cities[p.cityId]?.name ?? 'the capital'), 'made it official'])}.`, location: { cityId: p.cityId }, actors: [ref('person', p.id), ref('person', o.id)], effects: [fx('person', p.id, 'fame', famous ? 4 : 1), fx('person', o.id, 'fame', famous ? 4 : 1)], tags: ['personal', c.code] }));
        continue;
      }
    } else if (partner && age < 50 && rng.next() < 0.004) {
      const o = world.people[partner.target.id];
      p.history.push({ day: world.day, text: `Welcomed a child with ${o.name}.` });
      out.push(createEvent(world, { category: 'personal', type: 'birth', severity: p.fame > 60 ? 2 : 1, title: `${p.name} and ${o.name} welcome a child`, description: `${p.name} announced the birth of a ${rng.pick(['daughter', 'son'])}, ${rng.pick(['taking a rare break from public life', 'promising "a quieter year"', 'sharing a single photo that broke the feed'])}.`, location: { cityId: p.cityId }, actors: [ref('person', p.id), ref('person', o.id)], effects: [fx('person', p.id, 'reputation', 3)], tags: ['personal', c.code] }));
      continue;
    }
    // Tier-1 characters pursue objectives; tier-2 do so rarely
    const drive = (p.tier === 1 ? 0.06 : 0.02) * (0.5 + p.personality.ambition);
    if (rng.next() > drive) continue;
    const ev = pursueObjective(world, rng, p);
    if (ev) out.push(ev);
  }
  return out;
}

function pursueObjective(world: World, rng: RNG, p: Person): WorldEvent | null {
  const c = world.countries[p.countryId];
  switch (p.profession) {
    case 'entrepreneur':
    case 'engineer':
    case 'scientist': {
      // Tycoon arc: the very rich buy influence, then sometimes run for office.
      if (p.profession === 'entrepreneur' && p.wealth > 3000) {
        const parties = Object.values(world.organizations).filter((o) => o.alive && o.countryId === c.id && (o.type === 'party' || o.type === 'movement'));
        if (parties.length && rng.bool(0.35)) {
          const party = rng.pickWeighted(parties, (o) => (o.ideology === p.ideology ? 3 : 1));
          party.support = clamp(party.support + 4, 0, 100); party.influence = clamp(party.influence + 6, 0, 100);
          if (!p.affiliations.includes(party.id)) p.affiliations.push(party.id);
          return createEvent(world, { category: 'political', type: 'donation', severity: 2, title: `${p.name} pours a fortune into ${party.name}`, description: `The ${c.adjective} billionaire ${p.name} announced $${Math.round(p.wealth * 0.02)}M in funding for ${party.name}, calling it "an investment in the country's future". Critics called it buying a government.`, location: { cityId: p.cityId }, actors: [ref('person', p.id), ref('organization', party.id), ref('country', c.id)], effects: [fx('person', p.id, 'influence', 8), fx('person', p.id, 'reputation', -4), fx('country', c.id, 'corruption', 1.5), fx('country', c.id, 'polarization', 2)], tags: ['money', 'politics', c.code] });
        }
        if (p.personality.ambition > 0.7 && p.influence > 55 && rng.bool(0.2)) {
          p.profession = 'politician'; p.objective = 'reach the top office'; p.tier = 1;
          return createEvent(world, { category: 'political', type: 'career.politics', severity: 3, title: `Tycoon ${p.name} runs for office in ${c.name}`, description: `${p.name} traded the boardroom for the campaign trail, promising to "run the country like a company". Rivals warn of a plutocracy; supporters call it competence.`, location: { cityId: p.cityId }, actors: [ref('person', p.id), ref('country', c.id)], effects: [fx('person', p.id, 'fame', 15), fx('person', p.id, 'influence', 10), fx('country', c.id, 'polarization', 4)], tags: ['politics', 'tycoon', c.code] });
        }
      }
      if (p.affiliations.length === 0 && rng.bool(p.profession === 'entrepreneur' ? 0.6 : 0.25)) {
        const sector: Sector = p.profession === 'scientist' ? rng.pick(['biotech', 'technology', 'energy', 'aerospace']) : rng.pick(SECTORS);
        const ev = A.foundCompany(world, rng, c, sector, 'simulation', false, p);
        p.objective = rng.pick(['take the company public', 'reach a billion in value', 'ship the product that changes everything']);
        return ev;
      }
      const co = p.affiliations.map((id) => world.companies[id]).find((x) => x?.alive);
      if (co && co.value > 50 && p.objective !== 'dominate the industry' && rng.bool(0.5)) p.objective = 'dominate the industry';
      if (co && rng.bool(0.15)) { const ev = A.techBreakthrough(world, rng, co, c, rng.pick(['battery', 'AI model', 'drug', 'chip', 'reactor', 'material']), 'simulation', false, rng.bool(0.15) ? 1 : 0.5); if (rng.bool(0.5)) p.objective = rng.pick(['turn the breakthrough into an empire', 'win the highest prize', 'keep the discovery out of military hands']); return ev; }
      return null;
    }
    case 'politician': {
      if (c.leaderId === p.id) {
        // Leaders' goals shift with their standing
        if (c.approval < 35 && p.objective !== 'survive the next election') p.objective = c.electionEvery ? 'survive the next election' : 'crush the opposition before it grows';
        else if (c.approval > 65 && rng.bool(0.3)) p.objective = rng.pick(['secure a legacy', 'expand national influence', 'reshape the constitution']);
        // Leaders enact policies
        const policy = rng.pick(['tax cut', 'infrastructure program', 'security law', 'press regulation', 'green transition plan', 'military modernization', 'anti-corruption drive', 'welfare expansion']);
        const effects = {
          'tax cut': [fx('country', c.id, 'gdpGrowth', 0.6), fx('country', c.id, 'debt', 4), fx('country', c.id, 'approval', 3)],
          'infrastructure program': [fx('country', c.id, 'gdpGrowth', 0.8), fx('country', c.id, 'debt', 5), fx('country', c.id, 'happiness', 2)],
          'security law': [fx('country', c.id, 'freedom', -6), fx('country', c.id, 'stability', 4), fx('country', c.id, 'unrest', 2)],
          'press regulation': [fx('country', c.id, 'freedom', -8), fx('country', c.id, 'corruption', 3), fx('country', c.id, 'approval', -3)],
          'green transition plan': [fx('country', c.id, 'climateRisk', -3), fx('country', c.id, 'technology', 1), fx('country', c.id, 'debt', 3)],
          'military modernization': [fx('country', c.id, 'military', 6), fx('country', c.id, 'debt', 5)],
          'anti-corruption drive': [fx('country', c.id, 'corruption', -8), fx('country', c.id, 'approval', 4), fx('country', c.id, 'stability', -2)],
          'welfare expansion': [fx('country', c.id, 'happiness', 5), fx('country', c.id, 'debt', 6), fx('country', c.id, 'approval', 4)],
        }[policy];
        return createEvent(world, {
          category: 'political', type: 'policy', severity: 2, title: `${c.name} launches ${policy}`,
          description: `${p.title ?? 'Leader'} ${p.name} signed a sweeping ${policy} into law. ${rng.pick(['Opposition parties vowed to repeal it.', 'Markets reacted calmly.', 'Supporters celebrated in the capital.', 'Analysts call it a gamble.'])}`,
          location: { countryId: c.id }, actors: [ref('person', p.id), ref('country', c.id)], effects, tags: ['policy', 'politics', c.code], data: { policy },
        });
      }
      // Challengers attack the leader when approval is low
      if (c.approval < 40 && rng.bool(0.5)) {
        p.influence = clamp(p.influence + 5, 0, 100); p.fame = clamp(p.fame + 5, 0, 100);
        return createEvent(world, {
          category: 'political', type: 'opposition.attack', severity: 1, title: `${p.name} demands resignation of ${world.people[c.leaderId]?.name ?? 'the government'}`,
          description: `Opposition figure ${p.name} launched a blistering attack on the ${c.adjective} government, calling it "${rng.pick(['a failure of historic proportions', 'corrupt to the bone', 'asleep at the wheel', 'a danger to the nation'])}".`,
          location: { cityId: p.cityId }, actors: [ref('person', p.id), ref('country', c.id)], effects: [fx('country', c.id, 'approval', -1.5), fx('country', c.id, 'polarization', 1)], tags: ['politics', c.code],
        });
      }
      return null;
    }
    case 'journalist': {
      const targets = Object.values(world.people).filter((t) => t.alive && t.id !== p.id && t.fame > 30 && (t.countryId === p.countryId || t.fame > 70));
      if (!targets.length || c.freedom < 25) return null;
      const t = rng.pickWeighted(targets, (x) => x.fame * (1.3 - x.personality.integrity));
      if (rng.next() < 0.5 * (1.2 - t.personality.integrity)) return A.scandal(world, rng, t);
      return null;
    }
    case 'activist': {
      if (p.affiliations.length === 0 && rng.bool(0.5)) return A.createMovement(world, rng, c, 'simulation', false, p.ideology);
      const org = p.affiliations.map((id) => world.organizations[id]).find((o) => o?.alive && o.type === 'movement');
      if (!org) return null;
      const city = A.pickCity(world, rng, c);
      return createEvent(world, {
        category: 'social', type: 'protest', severity: org.support > 40 ? 3 : 2, title: `${p.name} leads ${org.name} rally in ${city.name}`,
        description: `${p.name} addressed ${rng.pick(['a packed square', 'tens of thousands', 'a defiant crowd'])} in ${city.name}: "${rng.pick(['They cannot ignore us forever.', 'This is only the beginning.', 'History is on our side.', 'We will not be silenced.'])}"`,
        location: { cityId: city.id }, actors: [ref('person', p.id), ref('organization', org.id), ref('country', c.id)], effects: [fx('organization', org.id, 'support', 3), fx('person', p.id, 'fame', 4), fx('country', c.id, 'unrest', 1)], tags: ['protest', 'movement', c.code],
      });
    }
    case 'general': {
      if (c.stability < 35 && p.personality.ambition > 0.6 && rng.bool(0.25)) return A.changeLeader(world, rng, c, 'coup', 'simulation', false, p);
      return null;
    }
    case 'celebrity':
    case 'artist':
    case 'athlete': {
      if (p.personality.ambition > 0.7 && p.fame > 60 && rng.bool(0.15)) {
        p.profession = 'politician'; p.objective = 'reach the top office';
        return createEvent(world, { category: 'political', type: 'career.politics', severity: 2, title: `${p.name} enters politics`, description: `The ${c.adjective} ${p.profession === 'politician' ? 'star' : p.profession} announced a bid for office, promising to "${rng.pick(['drain the swamp', 'give the country back to the people', 'make things work again'])}".`, location: { cityId: p.cityId }, actors: [ref('person', p.id), ref('country', c.id)], effects: [fx('person', p.id, 'influence', 10), fx('country', c.id, 'polarization', 2)], tags: ['politics', 'celebrity', c.code] });
      }
      return null;
    }
    case 'executive': {
      const co = p.affiliations.map((id) => world.companies[id]).find((x) => x?.alive && x.ceoId === p.id);
      if (!co) return null;
      const targets = Object.values(world.companies).filter((x) => x.alive && x.id !== co.id && x.sector === co.sector && x.value < co.value * 0.4 && x.value > 0.5);
      if (targets.length && rng.bool(0.3)) {
        const t = rng.pick(targets);
        t.alive = false; co.value += t.value * 1.1; co.employees += t.employees; co.revenue += t.revenue;
        const tceo = world.people[t.ceoId]; if (tceo) { tceo.wealth += t.value * 100; tceo.title = 'Former CEO'; }
        return createEvent(world, { category: 'corporate', type: 'merger', severity: co.value > 100 ? 3 : 2, title: `${co.name} acquires ${t.name} for $${(t.value * 1.1).toFixed(1)}B`, description: `${p.name} sealed the deal to absorb ${t.name}, consolidating the ${co.sector} sector. Regulators ${rng.pick(['waved it through', 'are reviewing the deal', 'expressed concern about competition'])}.`, location: { cityId: co.cityId }, actors: [ref('company', co.id), ref('company', t.id), ref('person', p.id)], effects: [fx('company', co.id, 'value%', 3), fx('person', p.id, 'influence', 4)], tags: ['merger', co.sector, c.code] });
      }
      return null;
    }
    case 'criminal': {
      const org = p.affiliations.map((id) => world.organizations[id]).find((o) => o?.alive && o.type === 'criminal');
      if (rng.bool(0.3)) {
        const target = Object.values(world.people).filter((t) => t.alive && t.countryId === c.id && t.profession === 'politician');
        if (!target.length) return null;
        const t = rng.pick(target);
        return createEvent(world, { category: 'criminal', type: 'corruption', severity: 2, title: `${t.name} accused of ties to ${org?.name ?? 'organized crime'}`, description: `Leaked recordings appear to show ${t.name} negotiating with ${p.name}, a known figure in the ${c.adjective} underworld.`, location: { cityId: t.cityId }, actors: [ref('person', t.id), ref('person', p.id), ...(org ? [ref('organization', org.id)] : [])], effects: [fx('person', t.id, 'reputation', -20), fx('country', c.id, 'corruption', 2), fx('person', p.id, 'influence', 3)], tags: ['crime', 'corruption', c.code] });
      }
      return null;
    }
    case 'diplomat': {
      const hostile = Object.values(world.countries).filter((o) => o.id !== c.id && (c.relations[o.id] ?? 0) < -20);
      if (hostile.length && rng.bool(0.5)) { const o = rng.pick(hostile); p.influence = clamp(p.influence + 4, 0, 100); return A.shiftTension(world, rng, c, o, -rng.float(8, 20), 'simulation', false, `Shuttle diplomacy by ${p.name}`); }
      return null;
    }
    case 'religious-leader': {
      const org = p.affiliations.map((id) => world.organizations[id]).find((o) => o?.alive);
      if (org && rng.bool(0.4)) { org.support = clamp(org.support + 3, 0, 100); return createEvent(world, { category: 'cultural', type: 'sermon', severity: 1, title: `${p.name} draws record crowds in ${world.cities[p.cityId]?.name}`, description: `${p.name} preached to a vast gathering, calling for ${org.agenda}. The government ${rng.pick(['took note', 'sent observers', 'welcomed the message', 'looked nervous'])}.`, location: { cityId: p.cityId }, actors: [ref('person', p.id), ref('organization', org.id)], effects: [fx('person', p.id, 'influence', 2), fx('organization', org.id, 'influence', 2)], tags: ['religion', 'culture', c.code] }); }
      return null;
    }
    case 'citizen': {
      if (rng.bool(0.3)) {
        p.fame = clamp(p.fame + 25, 0, 100); p.socialActivity = 1;
        return createEvent(world, { category: 'cultural', type: 'viral', severity: 1, title: `${p.name} goes viral`, description: `An ordinary ${c.adjective} citizen, ${p.name}, became an overnight sensation after ${rng.pick(['a video confronting a minister', 'a heartbreaking post about rent', 'an absurd dance', 'exposing a local scam', 'a speech at a town hall'])}.`, location: { cityId: p.cityId }, actors: [ref('person', p.id)], effects: [fx('person', p.id, 'influence', 8)], tags: ['viral', 'culture', c.code] });
      }
      return null;
    }
    default:
      return null;
  }
}
