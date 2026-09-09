/**
 * Regional grievance. Each month a region's unrest drifts toward what its country's mood, its identity and the
 * prosperity gap to the rest of the country sustain (autonomy eases it). High unrest in a distinct region becomes
 * an autonomy demand — the root of concession / crackdown / secession chains in consequences.ts.
 */
import { RNG, clamp } from '../rng';
import type { World, WorldEvent, Region } from '../types';
import { createEvent, fx, ref } from '../events/engine';
import { regionsOf } from '../generator/regions';
import { appointGovernor } from '../generator/world';

export function regionsTick(world: World, rng: RNG): WorldEvent[] {
  const out: WorldEvent[] = [];
  if (!world.regions) return out;
  for (const c of Object.values(world.countries)) {
    const regions = regionsOf(world, c);
    for (const r of regions) { const gov0 = r.governorId ? world.people[r.governorId] : undefined; if (!gov0 || !gov0.alive || gov0.retired || gov0.countryId !== c.id) { if (gov0 && gov0.title === `Governor of ${r.name}`) gov0.title = undefined; appointGovernor(world, rng, r, r.unrest < 40); } }
    if (regions.length < 2) continue;
    const prosperityOf = (r: Region) => r.cityIds.reduce((s, id) => s + (world.cities[id]?.prosperity ?? 50), 0) / Math.max(1, r.cityIds.length);
    const countryProsperity = c.cityIds.reduce((s, id) => s + (world.cities[id]?.prosperity ?? 50), 0) / Math.max(1, c.cityIds.length);
    for (const r of regions) {
      const gov = r.governorId ? world.people[r.governorId] : undefined;
      const gap = Math.max(0, countryProsperity - prosperityOf(r));
      const target = c.unrest * 0.7 + r.identity * 50 + gap * 0.8 + Math.max(0, c.polarization - 50) * 0.25 - r.autonomy * 0.3 + (c.atWarWith.length ? 5 : 0);
      r.unrest = clamp(r.unrest + (target - r.unrest) * 0.08 + rng.gauss(0, 2), 0, 100);
      if (r.identity > 0.45 && rng.bool(0.025)) r.unrest = clamp(r.unrest + rng.float(8, 18), 0, 100); // a slight from the capital: a language law, a closed mine, a cancelled railway
      for (const id of r.cityIds) { const ct = world.cities[id]; if (ct) ct.unrest = clamp(ct.unrest + (r.unrest - ct.unrest) * 0.03, 0, 100); }
      const lastDemand = r.history.length ? r.history[r.history.length - 1].day : -9999;
      const isCapitalRegion = r.cityIds.includes(c.capitalId);
      if (!isCapitalRegion && r.unrest > 55 && r.identity > 0.4 && world.day - lastDemand > 365 && rng.bool(0.3)) {
        r.history.push({ day: world.day, text: 'Demanded autonomy.' });
        const anchor = world.cities[r.cityIds[0]];
        const leads = !!gov && (/autonomy|fair share|heard/.test(gov.objective) || gov.ideology === 'nationalist' || rng.bool(0.3));
        if (gov && leads) { gov.fame = clamp(gov.fame + 10, 0, 100); gov.influence = clamp(gov.influence + 5, 0, 100); gov.history.push({ day: world.day, text: `Led ${r.name}'s demand for autonomy.` }); gov.memories.push({ day: world.day, text: `I stood in front of the crowd in ${anchor?.name ?? r.name} and asked for self-rule.`, weight: 0.7 }); }
        out.push(createEvent(world, {
          category: 'political', type: 'region.autonomy', severity: r.unrest > 80 ? 3 : 2,
          title: `${r.name} demands autonomy from ${c.name}`,
          description: `${gov && leads ? `Governor ${gov.name} and ${rng.pick(['tens of thousands', 'a general strike', 'the regional council'])}` : rng.pick(['Tens of thousands', 'A general strike', 'Regional councillors', 'A petition signed by half the region'])} in ${anchor?.name ?? r.name} demanded self-rule for ${r.name}, citing ${rng.pick(['neglect by the capital', 'a language nobody in the capital speaks', 'taxes that flow one way', 'decades of broken promises'])}. ${rng.pick([`${c.name}'s government called it a matter for the courts.`, 'The regional flag flew from the town hall.', 'The capital sent negotiators — and police.'])}`,
          location: { countryId: c.id, cityId: anchor?.id, x: anchor?.x ?? c.centroid.x, y: anchor?.y ?? c.centroid.y }, actors: [ref('country', c.id), ...(gov && leads ? [ref('person', gov.id)] : [])],
          effects: [fx('country', c.id, 'unrest', 2), fx('country', c.id, 'stability', -1)], tags: ['region', 'autonomy', c.code], data: { regionId: r.id, region: r.name, governorLed: !!(gov && leads) },
        }));
      }
    }
  }
  return out;
}
