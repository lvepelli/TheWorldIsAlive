/**
 * World premises: a starting situation chosen deterministically from the seed.
 * Applied at the end of generation so every world opens with its own tension.
 */
import { RNG, clamp } from '../rng';
import type { World, Country } from '../types';
import { createEvent, ref } from '../events/engine';

export interface Premise { id: string; title: string; blurb: string; apply: (world: World, rng: RNG) => void; }

const all = (w: World): Country[] => Object.values(w.countries);
const byGdp = (w: World): Country[] => all(w).slice().sort((a, b) => b.gdp - a.gdp);

export const PREMISES: Premise[] = [
  { id: 'cold-peace', title: 'The Cold Peace', blurb: 'Two blocs face each other across a frozen border. Nobody has fired a shot. Yet.', apply: (w, rng) => {
    const [a, b] = byGdp(w); if (!a || !b) return;
    for (const c of all(w)) c.military = clamp(c.military + 8, 0, 100);
    const blocA = new Set([a.id, ...a.alliances]), blocB = new Set([b.id, ...b.alliances]);
    for (const c of all(w)) { if (blocA.has(c.id) && blocB.has(c.id)) continue; if (!blocA.has(c.id) && !blocB.has(c.id) && rng.bool(0.5)) (rng.bool(0.5) ? blocA : blocB).add(c.id); }
    for (const x of all(w)) for (const y of all(w)) { if (x.id >= y.id) continue; const cross = (blocA.has(x.id) && blocB.has(y.id)) || (blocB.has(x.id) && blocA.has(y.id)); if (cross) { x.relations[y.id] = Math.min(x.relations[y.id] ?? 0, -55); y.relations[x.id] = x.relations[y.id]; } }
    a.relations[b.id] = -80; b.relations[a.id] = -80;
    for (const c of all(w)) { if (c.id === a.id) continue; if (blocA.has(c.id) && !a.alliances.includes(c.id) && rng.bool(0.6)) { a.alliances.push(c.id); c.alliances.push(a.id); } }
    for (const c of all(w)) { if (c.id === b.id) continue; if (blocB.has(c.id) && !b.alliances.includes(c.id) && rng.bool(0.6)) { b.alliances.push(c.id); c.alliances.push(b.id); } }
  } },
  { id: 'long-boom', title: 'The Long Boom', blurb: 'A decade of growth has made everyone rich, confident, and careless.', apply: (w) => {
    for (const c of all(w)) { c.gdpGrowth += 1.5; c.happiness = clamp(c.happiness + 8, 0, 100); c.unemployment = clamp(c.unemployment - 2, 1, 40); c.inflation += 1.5; c.debt = clamp(c.debt + 15, 0, 300); c.approval = clamp(c.approval + 6, 0, 100); }
    for (const co of Object.values(w.companies)) co.value *= 1.3;
  } },
  { id: 'age-of-unrest', title: 'The Age of Unrest', blurb: 'Streets fill faster than parliaments. Every government is one bad week from a crisis.', apply: (w) => {
    for (const c of all(w)) { c.unrest = clamp(c.unrest + 18, 0, 100); c.stability = clamp(c.stability - 12, 0, 100); c.polarization = clamp(c.polarization + 15, 0, 100); c.approval = clamp(c.approval - 10, 0, 100); }
  } },
  { id: 'after-the-plague', title: 'After the Plague', blurb: 'A pandemic has just burned out. The living are fewer, wary, and very good at medicine.', apply: (w) => {
    for (const c of all(w)) { c.population = Math.round(c.population * 0.94); c.happiness = clamp(c.happiness - 10, 0, 100); c.technology = clamp(c.technology + 4, 0, 100); c.gdpGrowth -= 0.8; c.debt = clamp(c.debt + 20, 0, 300); }
    for (const co of Object.values(w.companies)) if (co.sector === 'biotech' || co.sector === 'health') co.value *= 1.6;
  } },
  { id: 'machine-dawn', title: 'The Machine Dawn', blurb: 'Machines think. Factories empty. The richest nations are about to find out what work was for.', apply: (w) => {
    for (const c of byGdp(w).slice(0, 8)) { c.technology = clamp(c.technology + 15, 0, 100); c.unemployment = clamp(c.unemployment + 4, 0, 40); c.polarization = clamp(c.polarization + 8, 0, 100); }
    for (const co of Object.values(w.companies)) if (co.sector === 'technology' || co.sector === 'aerospace') co.value *= 1.8;
  } },
  { id: 'fractured-map', title: 'The Fractured Map', blurb: 'Old empires have broken. Borders are new, disputed, and hot.', apply: (w, rng) => {
    const cs = all(w); const pairs: [Country, Country][] = [];
    for (const a of cs) for (const id of a.neighbors) { const b = w.countries[id]; if (b && a.id < b.id) pairs.push([a, b]); }
    rng.shuffle(pairs);
    let wars = 0;
    for (const [a, b] of pairs) { if (wars >= 3) break; if (a.atWarWith.length || b.atWarWith.length) continue; a.relations[b.id] = -90; b.relations[a.id] = -90; a.atWarWith.push(b.id); b.atWarWith.push(a.id); wars++; }
    for (const [a, b] of pairs.slice(0, 10)) { a.relations[b.id] = Math.min(a.relations[b.id] ?? 0, -40); b.relations[a.id] = a.relations[b.id]; }
    for (const c of cs) c.military = clamp(c.military + 6, 0, 100);
  } },
  { id: 'gilded-age', title: 'The Gilded Age', blurb: 'Fortunes are vast, taxes are optional, and the tycoons pick the presidents.', apply: (w) => {
    for (const c of all(w)) { c.corruption = clamp(c.corruption + 15, 0, 100); c.polarization = clamp(c.polarization + 6, 0, 100); c.gdp *= 1.1; }
    for (const co of Object.values(w.companies)) co.value *= 1.5;
    for (const p of Object.values(w.people)) if (p.profession === 'entrepreneur' || p.profession === 'executive') { p.wealth *= 2; p.influence = clamp(p.influence + 10, 0, 100); }
  } },
  { id: 'quiet-century', title: 'The Quiet Century', blurb: 'Nothing much has happened for a long time. History has a way of correcting that.', apply: (w) => {
    for (const c of all(w)) { c.stability = clamp(c.stability + 8, 0, 100); c.unrest = clamp(c.unrest - 5, 0, 100); c.military = clamp(c.military - 5, 0, 100); }
  } },
];

/** Deterministic premise for a seed (cheap: no world needed). */
export function premiseFor(seed: string): Premise {
  const r = new RNG(seed).fork('premise');
  return r.pick(PREMISES);
}

/** Opening arcs: each premise seeds one or two scheduled follow-ups (rules live in events/consequences.ts). */
const ARCS: Record<string, { rule: string; delay: [number, number] }[]> = {
  'cold-peace': [{ rule: 'premise.cold-peace.incident', delay: [20, 70] }],
  'long-boom': [{ rule: 'premise.long-boom.bubble', delay: [30, 120] }],
  'age-of-unrest': [{ rule: 'premise.age-of-unrest.protests', delay: [5, 25] }],
  'after-the-plague': [{ rule: 'premise.after-the-plague.scare', delay: [40, 160] }],
  'machine-dawn': [{ rule: 'premise.machine-dawn.shock', delay: [15, 60] }],
  'fractured-map': [{ rule: 'premise.fractured-map.talks', delay: [30, 120] }],
  'gilded-age': [{ rule: 'premise.gilded-age.scandal', delay: [20, 90] }],
  'quiet-century': [{ rule: 'premise.quiet-century.omen', delay: [60, 200] }],
};

export function applyPremise(world: World, seed: string): Premise {
  const p = premiseFor(seed);
  const rng = new RNG(seed).fork('premise-apply');
  p.apply(world, rng);
  world.meta.premise = { id: p.id, title: p.title, blurb: p.blurb };
  const [a, b] = byGdp(world);
  const opening = createEvent(world, {
    category: 'political', type: 'premise.opening', severity: 3, historic: true,
    title: p.title, description: `${p.blurb} The year is ${world.meta.startYear}; the world is ${world.meta.name}.`,
    location: a ? { countryId: a.id } : {}, actors: [a, b].filter(Boolean).map((c) => ref('country', c.id)), effects: [],
    tags: ['premise', p.id], data: { premise: p.id, a: a?.id, b: b?.id },
  });
  for (const arc of ARCS[p.id] ?? []) world.pending.push({ dueDay: rng.int(arc.delay[0], arc.delay[1]), ruleId: arc.rule, sourceEventId: opening.id });
  return p;
}

/** Curated seeds, one per premise, shown on the intro as "featured worlds". Keep in sync with PREMISES order (see tests). */
export const FEATURED_SEEDS: { seed: string; premise: string }[] = [
  { seed: 'amber-tide-6', premise: 'cold-peace' },
  { seed: 'amber-harbor-16', premise: 'long-boom' },
  { seed: 'amber-summit-7', premise: 'age-of-unrest' },
  { seed: 'amber-meridian-2', premise: 'after-the-plague' },
  { seed: 'amber-orchard-13', premise: 'machine-dawn' },
  { seed: 'amber-citadel-1', premise: 'fractured-map' },
  { seed: 'amber-lantern-2', premise: 'gilded-age' },
  { seed: 'amber-canyon-2', premise: 'quiet-century' },
];
