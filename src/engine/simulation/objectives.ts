/**
 * Objectives as behaviour. A character's `objective` is free text (generated, or
 * adopted after a persuasive interview); these helpers turn recognisable goals
 * into actions: leaders make peace, call votes, reform or resign; CEOs pivot
 * their companies; researchers chase the implied field. Keep the regex tables
 * human-readable — any code that sets an objective string steers the world.
 */
import { RNG, clamp } from '../rng';
import type { World, Person, WorldEvent, Sector, Company, Country } from '../types';
import * as A from '../events/actions';
import { createEvent, fx, ref } from '../events/engine';
import { yearOf } from '../time';

/** A CEO whose objective names a new field pivots the company toward it (60%/attempt); returns the pivot event or null. */
export function pivotForObjective(world: World, rng: RNG, p: Person, co: Company): WorldEvent | null {
  const c = world.countries[p.countryId]; if (!c) return null;
  const goal = p.objective.toLowerCase();
  const PIVOTS: [RegExp, Sector, string][] = [[/\b(cure|vaccine|disease|health|medicine|cancer|aging)\b/, 'biotech', 'drug'], [/\b(space|rocket|mars|orbit|satellite)\b/, 'aerospace', 'rocket'], [/\b(green|solar|clean|climate|renewable|fusion|battery|batteries)\b/, 'energy', 'battery'], [/\b(ai|robot|automation|software|chip|quantum|computer)\b/, 'technology', 'AI model'], [/\b(weapon|defen[cs]e|drone|missile)\b/, 'defense', 'drone'], [/\b(car|vehicle|train|transport|ship)\b/, 'transport', 'vehicle'], [/\b(farm|food|crop|agricultur)\b/, 'agriculture', 'crop'], [/\b(bank|finance|payment|money)\b/, 'finance', 'payment system']];
  const pivot = PIVOTS.find(([re]) => re.test(goal));
  if (!pivot || co.sector === pivot[1]) return null;
  // A persuaded chief pivots readily; a generated ambition only sometimes, and never against the company's own name.
  const persuaded = p.history.some((h) => h.text.startsWith('Persuaded by an interviewer') && world.day - h.day < 240);
  if (co.name.toLowerCase().includes(co.sector) || /\b(bio|pharma|bank|motors|mining|energy|foods|media|steel)\b/i.test(co.name) && !persuaded) return null;
  if (!rng.bool(persuaded ? 0.8 : 0.25)) return null;
  const from = co.sector; co.sector = pivot[1];
  p.history.push({ day: world.day, text: `Steered ${co.name} into ${pivot[1]}.` });
  const ev = createEvent(world, { category: 'corporate', type: 'company.pivot', severity: co.value > 500 ? 3 : 2, title: `${co.name} bets the company on ${pivot[1]}`, description: `${p.name} announced that ${co.name} is leaving ${from} behind to pursue "${p.objective}". ${rng.pick(['Investors were split.', 'The share price whipsawed.', 'Half the engineering staff cheered; the other half updated their résumés.'])}`, location: { cityId: co.cityId, countryId: c.id }, actors: [ref('company', co.id), ref('person', p.id)], effects: [fx('company', co.id, 'value%', rng.float(-15, 10)), fx('company', co.id, 'reputation', 4)], tags: ['pivot', 'corporate', c.code], data: { shocks: [{ sector: pivot[1], pct: 0.02 }] } });
  if (rng.bool(0.5)) A.techBreakthrough(world, rng, co, c, pivot[2], ev.id, false, 0.8);
  return ev;
}

/** Research field implied by an objective ("cure cancer" → drug, "reach Mars" → rocket), or undefined. */
export function fieldFromObjective(objective: string): string | undefined {
  const g = objective.toLowerCase();
  const table: [RegExp, string][] = [[/\b(cure|vaccine|disease|medicine|cancer|aging|health)\b/, 'drug'], [/\b(space|rocket|mars|orbit|satellite)\b/, 'rocket'], [/\b(solar|clean|climate|renewable|fusion|battery|batteries|energy)\b/, 'battery'], [/\b(ai|robot|automation|software|quantum|computer)\b/, 'AI model'], [/\b(chip|semiconductor|processor)\b/, 'chip'], [/\b(material|alloy|graphene)\b/, 'material'], [/\b(reactor|nuclear)\b/, 'reactor'], [/\b(drone|weapon|missile)\b/, 'drone']];
  return table.find(([re]) => re.test(g))?.[1];
}

/** Objective-driven actions for any sitting leader (politician, general or activist alike). */
export function leaderActsOnObjective(world: World, rng: RNG, p: Person, c: Country): WorldEvent | null {
    // Objectives drive actions: a leader talked (or pushed) into peace, elections, reform or resignation acts on it.
    const goal = p.objective.toLowerCase();
    const fresh = p.history.some((h) => h.text.startsWith('Persuaded by an interviewer') && world.day - h.day < 240);
    const act = fresh ? 0.8 : 0.5; // a freshly persuaded leader follows through more reliably
    if (/\b(peace|ceasefire|end the war|stop the war|truce)\b/.test(goal) && c.atWarWith.length && rng.bool(act)) {
      const enemy = world.countries[c.atWarWith[0]];
      if (enemy) { const ev = A.endWar(world, rng, c, enemy, 'simulation', false, 'stalemate'); if (ev) { ev.description += ` ${p.name} had made peace a personal objective.`; p.history.push({ day: world.day, text: `Ended the war with ${enemy.name}.` }); p.objective = 'secure a legacy'; return ev; } }
    }
    if (/\b(peace|reconcil|detente|détente|talks)\b/.test(goal) && !c.atWarWith.length && rng.bool(act * 0.8)) {
      const worst = Object.entries(c.relations).sort((a, b) => a[1] - b[1])[0]; const other = worst && worst[1] < -20 ? world.countries[worst[0]] : undefined;
      if (other) { const ev = A.shiftTension(world, rng, c, other, -25, 'simulation', false, `an olive branch from ${p.name}`); p.objective = 'secure a legacy'; return ev; }
    }
    if (/\b(call|hold|allow|free|first|early|snap|let the people|give the people)\b[^.]*\b(election|elections|vote|polls)\b|\bgo to the polls\b|\bdemand new elections\b/.test(goal) && !/\b(win|survive)\b/.test(goal) && rng.bool(act)) {
      if (!c.electionEvery) c.electionEvery = 5;
      c.nextElectionYear = yearOf(world.day, world.meta.startYear);
      p.objective = 'survive the next election';
      return createEvent(world, { category: 'political', type: 'election.called', severity: 3, title: `${p.name} calls an election in ${c.name}`, description: `${p.name} announced a national vote, ${rng.pick(['to the surprise of the cabinet', 'after weeks of private persuasion', 'saying the people deserve a say'])}. Campaigning begins immediately.`, location: { countryId: c.id }, actors: [ref('person', p.id), ref('country', c.id)], effects: [fx('country', c.id, 'polarization', 4), fx('country', c.id, 'freedom', c.freedom < 40 ? 8 : 0)], tags: ['election', 'politics', c.code] });
    }
    if (/\b(resign|step down|retire|hand over)\b/.test(goal) && rng.bool(act)) { const ev = A.changeLeader(world, rng, c, 'resignation'); ev.description += ` ${p.name} had spoken openly of stepping down.`; return ev; }
    if (/\b(reform|free the press|democra|liberal|rights|open up)\b/.test(goal) && c.freedom < 75 && rng.bool(act)) {
      p.objective = 'secure a legacy';
      return createEvent(world, { category: 'political', type: 'policy', severity: 3, title: `${c.name} loosens the state's grip: reform package passes`, description: `${p.name} pushed through ${rng.pick(['a press-freedom law', 'an amnesty for political prisoners', 'independent courts', 'a bill of rights'])}, calling it "${rng.pick(['overdue', 'the beginning', 'what I promised'])}". Hardliners are furious.`, location: { countryId: c.id }, actors: [ref('person', p.id), ref('country', c.id)], effects: [fx('country', c.id, 'freedom', 10), fx('country', c.id, 'approval', 4), fx('country', c.id, 'stability', -2), fx('country', c.id, 'polarization', 3)], tags: ['reform', 'politics', c.code] });
    }
    return null;
}


/**
 * Regionalists: a character whose objective is to free / win autonomy or independence for a region
 * (ousted governors, separatist governors) founds a liberation movement there or rallies the one that exists.
 * Returns an event when they act; `force` skips the monthly dice (used by tests and God Mode).
 */
export function regionalistActsOnObjective(world: World, rng: RNG, p: Person, force = false): WorldEvent | null {
  const m = p.objective.match(/^(?:free|liberate|win (?:autonomy|independence|self-rule) for)\s+(.+?)(?:\s+from\s+(.+))?$/i);
  if (!m) return null;
  const name = m[1].trim().toLowerCase();
  const region = Object.values(world.regions ?? {}).find((r) => r.name.toLowerCase() === name); if (!region) return null;
  const c = world.countries[region.countryId]; if (!c || c.leaderId === p.id) return null;
  if (!force && !rng.bool(0.12 + p.personality.ambition * 0.1)) return null;
  const anchor = world.cities[region.cityIds[0]];
  const existing = c.movements.map((id) => world.organizations[id]).find((o) => o && o.alive && o.agenda === 'independence' && o.name.toLowerCase().includes(name.split(' ')[0]));
  if (existing) {
    existing.support = clamp(existing.support + 3 + p.influence * 0.05, 0, 100); region.unrest = clamp(region.unrest + 4, 0, 100);
    if (!p.affiliations.includes(existing.id)) p.affiliations.push(existing.id);
    if (!existing.leaderId || !world.people[existing.leaderId]?.alive) existing.leaderId = p.id;
    if (!force && !rng.bool(0.5)) return null;
    p.history.push({ day: world.day, text: `Rallied ${region.name} behind ${existing.name}.` });
    return createEvent(world, {
      category: 'social', type: 'region.rally', severity: 2, title: `${p.name} rallies ${region.name} for ${existing.name}`,
      description: `${p.name} ${rng.pick(['filled the main square of', 'marched through', 'spoke from a balcony in'])} ${anchor?.name ?? region.name}, ${rng.pick(['promising that the region would decide its own future', 'calling the capital "a foreign power"', 'reading out the names of those arrested last time'])}. ${c.name}'s government ${rng.pick(['called it sedition.', 'sent more police.', 'pretended not to notice.'])}`,
      location: { countryId: c.id, cityId: anchor?.id, x: anchor?.x ?? c.centroid.x, y: anchor?.y ?? c.centroid.y }, actors: [ref('person', p.id), ref('organization', existing.id), ref('country', c.id)],
      effects: [fx('country', c.id, 'unrest', 2)], tags: ['region', 'rally', c.code], data: { regionId: region.id, region: region.name },
    });
  }
  const ev = A.createMovement(world, rng, c, 'simulation', false, 'nationalist', `${region.name} ${rng.pick(['Liberation Front', 'League', 'Assembly', 'Free Movement'])}`, 'independence');
  const orgRef = ev.actors.find((a) => a.kind === 'organization'); const org = orgRef ? world.organizations[orgRef.id] : undefined;
  if (org && ev.type !== 'movement.merged') {
    org.leaderId = p.id; if (!p.affiliations.includes(org.id)) p.affiliations.push(org.id); p.influence = clamp(p.influence + 5, 0, 100); p.fame = clamp(p.fame + 8, 0, 100);
    p.history.push({ day: world.day, text: `Founded ${org.name}.` }); region.unrest = clamp(region.unrest + 6, 0, 100);
    ev.title = `${p.name} founds ${org.name}`; ev.description = `${p.name}, ${p.title ?? (p.history.some((h) => /Governor/.test(h.text)) ? `once governor of ${region.name}` : 'a regional politician')}, launched ${org.name} in ${anchor?.name ?? region.name} with one demand: ${/independence|free|liberate/i.test(p.objective) ? 'independence' : 'self-rule'} for ${region.name}. ${rng.pick(['The first rally overflowed the square.', 'The capital banned the flag within a day.', 'Old party colleagues quietly signed up.'])}`;
    if (!ev.actors.some((a) => a.kind === 'person' && a.id === p.id)) ev.actors.unshift(ref('person', p.id));
    ev.data = { ...(ev.data ?? {}), regionId: region.id, region: region.name };
  }
  return ev;
}
