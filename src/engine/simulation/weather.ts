/**
 * Weather fronts shared by the engine and the map. Storm cells drift eastward
 * along two latitude bands; their position is a pure function of the simulation
 * day (plus an optional sub-day phase for smooth animation), so the disaster
 * spawner and the renderer agree on where the weather is.
 */
import type { World, Country } from '../types';

export interface StormCell { x: number; y: number; rx: number; ry: number; /** 0..1 */ strength: number; under?: Country; }

const CELLS = 5;

/** Season factor 0..1 for a grid row: storms are strongest in the tropics in the second half of the year and in mid-latitudes in winter. */
export function seasonFactor(world: World, y: number): number {
  const H = world.geography.height;
  const dayOfYear = world.day % 365; const phase = dayOfYear / 365; // 0 = January
  const tropical = 1 - Math.min(1, Math.abs(y / H - 0.5) / 0.25); // 1 at the equator band
  const hurricaneSeason = 0.55 + 0.45 * Math.sin((phase - 0.4) * Math.PI * 2); // peaks around September
  const winterStorms = 0.55 + 0.45 * Math.cos(phase * Math.PI * 2);            // peaks around January
  return tropical * hurricaneSeason + (1 - tropical) * winterStorms;
}

/** Storm cells for the given day. `subDay` in [0,1) interpolates motion between ticks (renderer only). */
export function stormCells(world: World, subDay = 0): StormCell[] {
  const geo = world.geography; const W = geo.width, H = geo.height;
  const d = world.day + subDay;
  const out: StormCell[] = [];
  for (let i = 0; i < CELLS; i++) {
    const speed = 1.6 + (i % 2) * 0.9; // grid units per day, eastward
    const x = (((i * 71.3 + 20) + d * speed) % W + W) % W;
    const band = i % 2 === 0 ? 0.36 : 0.62;
    const y = H * band + Math.sin(d * 0.02 + i * 2) * 6 + ((i * 13) % 9);
    const cx = Math.floor(x), cy = Math.max(0, Math.min(H - 1, Math.floor(y)));
    const r = geo.cells[cy * W + cx]; const under = r >= 0 ? world.countries[geo.countryOrder[r]] : undefined;
    const risk = under ? under.climateRisk / 100 : 0.25;
    const strength = Math.min(1, (0.3 + risk * 0.7) * (0.6 + 0.6 * seasonFactor(world, y)));
    out.push({ x, y, rx: 11 + (i % 3) * 5, ry: 6 + (i % 2) * 3, strength, under });
  }
  return out;
}

/** Countries currently under a storm cell (for the disaster spawner). */
export function stormBound(world: World): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of stormCells(world)) if (s.under) m.set(s.under.id, Math.max(m.get(s.under.id) ?? 0, s.strength));
  return m;
}
