/**
 * Regions: every country with three or more cities is split into 2–4 regions by seeded k-means over its cities.
 * A region has an identity (how different it feels from the capital) and its own unrest, which the monthly
 * regions tick drifts; grievances become autonomy demands and, at worst, secession along regional lines.
 */
import { RNG, clamp } from '../rng';
import type { World, Country, Region, ID } from '../types';
import { nextId } from '../ids';

const SUFFIX_INLAND = ['Province', 'Highlands', 'Valley', 'Marches', 'Plateau', 'Basin', 'Uplands', 'Reach'];
const SUFFIX_COAST = ['Coast', 'Shore', 'Littoral', 'Bay', 'Sound'];
// Extra flavour per language family (same hash-derived family as `familyOf` in events/actions.ts), so a nordic country's regions
// read differently from an arabic or east-asian one.
const FAMILY_FLAVOUR: Record<string, { inland: string[]; coast: string[] }> = {
  latin: { inland: ['Serra', 'Campo', 'Alta'], coast: ['Costa', 'Riviera'] },
  nordic: { inland: ['Dales', 'Fells', 'Mark'], coast: ['Fjords', 'Skerries'] },
  east: { inland: ['Prefecture', 'Hills', 'Plain'], coast: ['Strait', 'Harbour'] },
  african: { inland: ['Savanna', 'Escarpment', 'District'], coast: ['Delta', 'Lagoon'] },
  anglo: { inland: ['Shire', 'Wold', 'Moor'], coast: ['Head', 'Estuary'] },
  slavic: { inland: ['Oblast', 'Krai', 'Steppe'], coast: ['Bank', 'Liman'] },
  arabic: { inland: ['Wadi', 'Jabal', 'Oasis'], coast: ['Sahel', 'Gulf'] },
};
const FAMILIES = ['latin', 'nordic', 'east', 'african', 'anglo', 'slavic', 'arabic'];

export function assignRegions(world: World, rng: RNG): void {
  world.regions ??= {};
  for (const c of Object.values(world.countries)) assignRegionsFor(world, rng.fork(`regions:${c.id}`), c);
}

/** (Re)build the regions of one country from its current cities. Existing regions of the country are replaced. */
export function assignRegionsFor(world: World, rng: RNG, c: Country): void {
  world.regions ??= {};
  for (const id of c.regionIds ?? []) delete world.regions[id];
  c.regionIds = [];
  const cities = c.cityIds.map((id) => world.cities[id]).filter(Boolean);
  if (!cities.length) return;
  const k = cities.length < 3 ? 1 : clamp(Math.round(cities.length / 3), 2, 4);
  const W = world.geography.width;
  const dx = (a: number, b: number) => { const d = Math.abs(a - b); return Math.min(d, W - d); };
  const dist2 = (ax: number, ay: number, bx: number, by: number) => dx(ax, bx) ** 2 + (ay - by) ** 2;
  // k-means seeded from the capital plus the cities farthest from the chosen centres
  const cap = world.cities[c.capitalId] ?? cities[0];
  const centres: { x: number; y: number }[] = [{ x: cap.x, y: cap.y }];
  while (centres.length < k) { const far = cities.slice().sort((a, b) => Math.min(...centres.map((m) => dist2(b.x, b.y, m.x, m.y))) - Math.min(...centres.map((m) => dist2(a.x, a.y, m.x, m.y))))[0]; centres.push({ x: far.x, y: far.y }); }
  let owner = cities.map(() => 0);
  for (let iter = 0; iter < 8; iter++) {
    owner = cities.map((ct) => { let best = 0, bd = Infinity; centres.forEach((m, i) => { const d = dist2(ct.x, ct.y, m.x, m.y); if (d < bd) { bd = d; best = i; } }); return best; });
    centres.forEach((m, i) => { const mine = cities.filter((_, j) => owner[j] === i); if (!mine.length) return; const unwrap = (x: number) => { let u = x; if (u - m.x > W / 2) u -= W; else if (m.x - u > W / 2) u += W; return u; }; m.x = ((mine.reduce((s, ct) => s + unwrap(ct.x), 0) / mine.length) + W) % W; m.y = mine.reduce((s, ct) => s + ct.y, 0) / mine.length; }); // means are taken across the world seam
  }
  const used = new Set<string>();
  for (let i = 0; i < k; i++) {
    const mine = cities.filter((_, j) => owner[j] === i); if (!mine.length) continue;
    const anchor = mine.slice().sort((a, b) => b.population - a.population)[0];
    const coastal = mine.filter((ct) => ct.coastal).length > mine.length / 2;
    const isCapitalRegion = mine.some((ct) => ct.id === c.capitalId);
    const flavour = FAMILY_FLAVOUR[FAMILIES[RNG.hash(c.name)[0] % FAMILIES.length]];
    const pool = coastal ? [...SUFFIX_COAST, ...flavour.coast, ...flavour.coast] : [...SUFFIX_INLAND, ...flavour.inland, ...flavour.inland];
    let name = isCapitalRegion ? `${anchor.name} ${rng.pick(['Metropolitan', 'Capital District', 'Heartland'])}` : `${anchor.name} ${rng.pick(pool)}`;
    while (used.has(name)) name += ' II'; used.add(name);
    const far = Math.sqrt(dist2(anchor.x, anchor.y, cap.x, cap.y)) / Math.max(1, Math.sqrt(c.area || 100));
    const identity = isCapitalRegion ? rng.float(0, 0.15) : clamp(0.25 + far * 0.35 + rng.float(-0.15, 0.25) + (coastal !== !!cap.coastal ? 0.1 : 0), 0.05, 0.95);
    const r: Region = { id: nextId(world, 'region'), kind: 'region', name, countryId: c.id, cityIds: mine.map((ct) => ct.id), identity, unrest: clamp(c.unrest + identity * 15 + rng.gauss(0, 6), 0, 100), autonomy: isCapitalRegion ? 0 : clamp(rng.gauss(15, 10), 0, 60), history: [] };
    world.regions[r.id] = r; c.regionIds.push(r.id);
    for (const ct of mine) ct.regionId = r.id;
  }
}

/** Population and average prosperity of a region's cities. */
export function regionStats(world: World, r: Region): { population: number; prosperity: number } {
  const cities = r.cityIds.map((id) => world.cities[id]).filter(Boolean);
  return { population: cities.reduce((s, ct) => s + ct.population, 0), prosperity: cities.length ? cities.reduce((s, ct) => s + ct.prosperity, 0) / cities.length : 50 };
}

export function regionOf(world: World, cityId: ID): Region | undefined { const r = world.cities[cityId]?.regionId; return r ? world.regions?.[r] : undefined; }
export function regionsOf(world: World, c: Country): Region[] { return (c.regionIds ?? []).map((id) => world.regions?.[id]).filter((r): r is Region => !!r); }
