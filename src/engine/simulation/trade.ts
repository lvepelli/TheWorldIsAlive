/**
 * Trade volume between partner countries, derived (not stored) from the
 * smaller economy, relations and war/sanction state. Feeds weekly growth and
 * the thickness of trade arcs on the map.
 */
import type { World, Country, ID } from '../types';

/** Annual trade volume in $B between two partners (0 when blocked). */
export function tradeVolume(world: World, a: Country, b: Country): number {
  if (!a.tradePartners.includes(b.id)) return 0;
  if (a.atWarWith.includes(b.id)) return 0;
  const rel = a.relations[b.id] ?? 0;
  if (rel < -60) return 0;
  const base = Math.min(a.gdp, b.gdp) * 0.04 + Math.sqrt(a.gdp * b.gdp) * 0.01;
  const neighbor = a.neighbors.includes(b.id) ? 1.5 : 1;
  const allied = a.alliances.includes(b.id) ? 1.3 : 1;
  const relFactor = 0.6 + Math.max(0, rel + 60) / 160; // 0.6 at -60 … 1.6 at +100
  const openness = 0.7 + ((a.freedom + b.freedom) / 200) * 0.6;
  return base * neighbor * allied * relFactor * openness;
}

/** All trade links of a country with their volume, largest first. */
export function tradeLinks(world: World, c: Country): { partner: Country; volume: number }[] {
  const out: { partner: Country; volume: number }[] = [];
  for (const id of c.tradePartners) { const p = world.countries[id]; if (!p) continue; const v = tradeVolume(world, c, p); if (v > 0) out.push({ partner: p, volume: v }); }
  return out.sort((x, y) => y.volume - x.volume);
}

/** Total trade as a share of GDP (0..~0.6). */
export function tradeShare(world: World, c: Country): number {
  const total = c.tradePartners.reduce((s, id) => { const p = world.countries[id]; return s + (p ? tradeVolume(world, c, p) : 0); }, 0);
  return Math.min(0.8, total / Math.max(1, c.gdp));
}

/** Largest trade partner id, if any. */
export function topPartner(world: World, c: Country): ID | undefined { return tradeLinks(world, c)[0]?.partner.id; }
