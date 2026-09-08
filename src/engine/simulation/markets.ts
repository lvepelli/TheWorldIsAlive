/**
 * Markets: company valuations, national and global indexes, commodities.
 * Daily random walk shaped by fundamentals and world events.
 */
import { RNG, clamp } from '../rng';
import type { World, Sector, ID } from '../types';

export const COMMODITY_DEFS = [
  { id: 'oil', name: 'Crude Oil', price: 78, unit: '$/bbl', volatility: 0.022 },
  { id: 'gas', name: 'Natural Gas', price: 3.4, unit: '$/MMBtu', volatility: 0.03 },
  { id: 'grain', name: 'Grain', price: 265, unit: '$/t', volatility: 0.015 },
  { id: 'copper', name: 'Copper', price: 9400, unit: '$/t', volatility: 0.016 },
  { id: 'lithium', name: 'Lithium', price: 21000, unit: '$/t', volatility: 0.03 },
  { id: 'gold', name: 'Gold', price: 2350, unit: '$/oz', volatility: 0.01 },
  { id: 'rareEarth', name: 'Rare Earths', price: 58, unit: '$/kg', volatility: 0.025 },
  { id: 'compute', name: 'Compute Credits', price: 1.9, unit: '$/PFLOPh', volatility: 0.028 },
];

export const HISTORY_LEN = 120;

export function fillMarkets(world: World, rng: RNG): void {
  for (const d of COMMODITY_DEFS) {
    const p = d.price * rng.float(0.8, 1.25);
    world.commodities[d.id] = { id: d.id, name: d.name, price: p, unit: d.unit, history: [p], volatility: d.volatility };
  }
  world.indexes['global'] = { id: 'global', name: 'World Composite', countryId: null, value: 1000, history: [1000] };
  for (const c of Object.values(world.countries)) {
    if (c.gdp < 60) continue;
    world.indexes[c.id] = { id: c.id, name: `${c.code} ${rng.pick(['100', '50', 'Index', 'Composite', '30'])}`, countryId: c.id, value: 1000, history: [1000] };
  }
}

/** Sector sensitivity to commodities and macro factors */
const SECTOR_COMMODITY: Partial<Record<Sector, { id: string; beta: number }[]>> = {
  energy: [{ id: 'oil', beta: 0.6 }, { id: 'gas', beta: 0.3 }],
  mining: [{ id: 'copper', beta: 0.5 }, { id: 'lithium', beta: 0.3 }, { id: 'rareEarth', beta: 0.3 }],
  agriculture: [{ id: 'grain', beta: 0.6 }],
  technology: [{ id: 'compute', beta: 0.35 }, { id: 'rareEarth', beta: -0.1 }],
  transport: [{ id: 'oil', beta: -0.35 }],
  manufacturing: [{ id: 'copper', beta: -0.2 }, { id: 'oil', beta: -0.15 }],
  aerospace: [{ id: 'compute', beta: 0.15 }],
};

export interface MarketShock { sector?: Sector; countryId?: ID; companyId?: ID; commodityId?: string; pct: number; }

/** Daily market tick. `shocks` are event-driven impulses applied on top of the drift. */
export function tickMarkets(world: World, rng: RNG, shocks: MarketShock[]): void {
  // Commodities
  const commodityMove: Record<string, number> = {};
  for (const c of Object.values(world.commodities)) {
    let move = rng.gauss(0, c.volatility) + (c.price > COMMODITY_DEFS.find((d) => d.id === c.id)!.price * 2 ? -0.004 : 0);
    for (const s of shocks) if (s.commodityId === c.id) move += s.pct;
    c.price = Math.max(c.price * 0.05, c.price * (1 + move));
    commodityMove[c.id] = move;
    pushHistory(c.history, c.price);
  }
  // Global sentiment
  let globalMood = rng.gauss(0.0002, 0.006);
  for (const s of shocks) if (!s.sector && !s.countryId && !s.companyId && !s.commodityId) globalMood += s.pct;
  // Companies
  const countryReturn: Record<ID, { sum: number; w: number }> = {};
  for (const co of Object.values(world.companies)) {
    if (!co.alive) continue;
    const country = world.countries[co.countryId];
    const fundamentals = (co.growth / 100) / 252 + ((country?.gdpGrowth ?? 1) / 100) / 365 - ((country?.inflation ?? 2) - 3) / 100 / 365 * 0.5;
    let move = fundamentals + globalMood + rng.gauss(0, co.volatility * 0.02);
    const sens = SECTOR_COMMODITY[co.sector];
    if (sens) for (const s of sens) move += (commodityMove[s.id] ?? 0) * s.beta;
    if (country) {
      move += -(country.unrest - 20) / 100 * 0.0015 - (country.atWarWith.length ? 0.002 : 0);
      // Valuation gravity: a company cannot outgrow its home economy forever.
      const ceiling = Math.max(5, country.gdp * 0.25);
      if (co.value > ceiling) move -= Math.log(co.value / ceiling) * 0.02;
      // Revenue anchor: price/sales far above 12 decays.
      const ps = co.value / Math.max(0.01, co.revenue);
      if (ps > 12) move -= Math.log(ps / 12) * 0.002;
    }
    for (const s of shocks) {
      if (s.companyId && s.companyId === co.id) move += s.pct;
      else if (s.sector && s.sector === co.sector && (!s.countryId || s.countryId === co.countryId)) move += s.pct * (s.countryId ? 1 : 0.6);
      else if (s.countryId && !s.sector && !s.companyId && s.countryId === co.countryId) move += s.pct;
    }
    move = clamp(move, -0.5, 0.8);
    co.value = Math.max(0.01, co.value * (1 + move));
    pushHistory(co.priceHistory, co.value);
    // growth expectations mean-revert toward a sector baseline
    const baseline = co.sector === 'technology' || co.sector === 'biotech' || co.sector === 'aerospace' ? 5 : 2.5;
    co.growth += rng.gauss(0, 0.05) + (baseline - co.growth) * 0.01;
    const cr = (countryReturn[co.countryId] ??= { sum: 0, w: 0 });
    cr.sum += move * co.value; cr.w += co.value;
  }
  // Indexes
  let gsum = 0, gw = 0;
  for (const idx of Object.values(world.indexes)) {
    if (!idx.countryId) continue;
    const cr = countryReturn[idx.countryId];
    const r = cr && cr.w > 0 ? cr.sum / cr.w : globalMood;
    idx.value = Math.max(1, idx.value * (1 + r));
    pushHistory(idx.history, idx.value);
    const w = world.countries[idx.countryId]?.gdp ?? 1;
    gsum += r * w; gw += w;
  }
  const g = world.indexes['global'];
  if (g) { g.value = Math.max(1, g.value * (1 + (gw ? gsum / gw : globalMood))); pushHistory(g.history, g.value); }
}

function pushHistory(h: number[], v: number): void {
  h.push(Math.round(v * 1000) / 1000);
  if (h.length > HISTORY_LEN) h.splice(0, h.length - HISTORY_LEN);
}

export function pctChange(h: number[], days = 1): number {
  if (h.length < 2) return 0;
  const a = h[Math.max(0, h.length - 1 - days)], b = h[h.length - 1];
  return a ? ((b - a) / a) * 100 : 0;
}
