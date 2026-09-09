/**
 * Tick orchestrator. One call = one simulated day. Heavy systems run on
 * weekly / monthly / yearly cadences to keep fast-forward cheap.
 */
import { RNG } from '../rng';
import type { World, WorldEvent } from '../types';
import { spawnDailyEvents } from '../events/spawn';
import { react, resolvePending, collectShocks } from '../events/consequences';
import { tickMarkets } from './markets';
import { weeklyTick, monthlyTick, yearlyTick } from './systems';
import { calendarTick } from './calendar';
import { monthlyCharacters } from './characters';
import { generateNews, generateSocial, generateEditorials, updateTrending } from './information';
import { anniversaries } from './anniversaries';
import { summarize } from './summary';
import { toDate } from '../time';

export interface TickResult { day: number; events: WorldEvent[]; }

export function tickDay(world: World, rng: RNG): TickResult {
  world.day += 1;
  world.stats.ticks += 1;
  const before = world.events.length;
  const produced: WorldEvent[] = [];

  // 1. Scheduled consequences of earlier events
  produced.push(...resolvePending(world, rng));
  // 2. Spontaneous events
  produced.push(...spawnDailyEvents(world, rng));
  produced.push(...anniversaries(world, rng));
  // 3. Slow systems
  if (world.day - world.stats.lastWeeklyDay >= 7) { weeklyTick(world, rng); generateEditorials(world, rng); world.stats.lastWeeklyDay = world.day; }
  if (world.day - world.stats.lastMonthlyDay >= 30) {
    produced.push(...monthlyTick(world, rng));
    produced.push(...calendarTick(world, rng));
    produced.push(...monthlyCharacters(world, rng));
    world.stats.lastMonthlyDay = world.day;
    world.summaries.push(summarize(world, 'month'));
  }
  if (world.day - world.stats.lastYearlyDay >= 365) { produced.push(...yearlyTick(world, rng)); world.stats.lastYearlyDay = world.day; world.summaries.push(summarize(world, 'year')); compact(world); }
  // Any event created inside actions (e.g. nested succession) that we did not capture
  const all = world.events.slice(before);
  for (const ev of all) if (!produced.includes(ev)) produced.push(ev);
  // 4. Reactions: schedule consequences for everything new today
  for (const ev of all) react(world, rng, ev);
  // 5. Markets react
  tickMarkets(world, rng, collectShocks(all));
  // 6. Information layer
  generateNews(world, rng, all);
  generateSocial(world, rng, all);
  if (world.day % 2 === 0) updateTrending(world);
  if (world.summaries.length > 80) world.summaries.splice(0, world.summaries.length - 80);
  world.rngState = rng.state();
  return { day: world.day, events: all };
}

export function isNewYear(world: World): boolean { return toDate(world.day, world.meta.startYear).dayOfYear === 0; }

/** Yearly compaction keeps save files small: strips detail that the UI never shows for stale entities. */
export function compact(world: World): void {
  const cutoff = world.day - 365;
  for (const e of world.events) if (e.day < cutoff && !e.historic) { if (e.effects.length) e.effects = []; if (e.affectedEntities.length > 3) e.affectedEntities = e.affectedEntities.slice(0, 3); if (e.tags.length > 3) e.tags = e.tags.slice(0, 3); if (e.description.length > 220) e.description = e.description.slice(0, 217) + '…'; }
  for (const co of Object.values(world.companies)) if (!co.alive && co.priceHistory.length > 2) co.priceHistory = co.priceHistory.slice(-2);
  for (const p of Object.values(world.people)) {
    if (p.alive) { if (p.history.length > 30) p.history = p.history.slice(-30); if (p.memories.length > 12) p.memories = p.memories.slice(-12); continue; }
    if (p.memories.length) p.memories = [];
    if (p.relationships.length > 4) p.relationships = p.relationships.slice(0, 4);
    if (p.history.length > 12) p.history = p.history.slice(-12);
  }
  for (const o of Object.values(world.organizations)) if (!o.alive && o.history.length > 6) o.history = o.history.slice(-6);
}
