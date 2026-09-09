/**
 * Deterministic world summaries (daily / monthly / yearly).
 */
import { tidy } from '../text';
import { stormCells } from './weather';
import type { World, WorldSummary } from '../types';
import { formatDate, MONTHS, toDate } from '../time';
import { pctChange } from './markets';

export function summarize(world: World, period: 'day' | 'month' | 'year'): WorldSummary {
  const span = period === 'day' ? 1 : period === 'month' ? 30 : 365;
  const since = world.day - span;
  const evs = world.events.filter((e) => e.day > since && e.day <= world.day);
  const major = evs.filter((e) => e.severity >= 4).sort((a, b) => b.severity - a.severity);
  const lines: string[] = [];
  const dt = toDate(world.day, world.meta.startYear);
  const title = period === 'day' ? `Today in the world — ${formatDate(world.day, world.meta.startYear)}` : period === 'month' ? `This month: ${MONTHS[dt.month]} ${dt.year}` : `${dt.year - 1}: ${eraName(evs)}`;
  if (world.meta.premise && (period === 'day' ? world.day < 7 : period === 'month' ? world.day <= 31 : world.day <= 400)) lines.push(`${world.meta.premise.title}: ${world.meta.premise.blurb}`);
  if (period === 'day') {
    const fronts = stormCells(world).filter((c) => c.under && c.strength > 0.55);
    if (fronts.length) lines.push(`Storm fronts over ${fronts.slice(0, 2).map((c) => c.under!.name).join(' and ')}${fronts.length > 2 ? ' and elsewhere' : ''}; ${fronts[0].strength > 0.8 ? 'hurricane warnings issued' : 'flood risk rising'}.`);
  }
  if (!evs.length) lines.push('A quiet period. The world held its breath.');
  for (const e of major.slice(0, period === 'day' ? 2 : 5)) lines.push(`${e.title}.`);
  const wars = Object.values(world.countries).reduce((s, c) => s + c.atWarWith.length, 0) / 2;
  if (wars > 0) lines.push(`${wars} war${wars > 1 ? 's' : ''} currently raging.`);
  if (period !== 'day') {
    const g = world.indexes['global'];
    if (g) { const ch = pctChange(g.history, Math.min(g.history.length - 1, span)); lines.push(`Global markets ${ch >= 0 ? 'rose' : 'fell'} ${Math.abs(ch).toFixed(1)}%.`); }
    const countries = Object.values(world.countries);
    const unstable = countries.filter((c) => c.stability < 35);
    if (unstable.length) lines.push(`Fragile states: ${unstable.slice(0, 3).map((c) => c.name).join(', ')}.`);
    const restless = Object.values(world.regions ?? {}).filter((r) => r.unrest > 55 && world.countries[r.countryId] && !r.cityIds.includes(world.countries[r.countryId].capitalId)).sort((a, b) => b.unrest - a.unrest);
    if (restless.length) lines.push(`Restless regions: ${restless.slice(0, 3).map((r) => `${r.name} (${world.countries[r.countryId].name})`).join(', ')}${restless.length > 3 ? ` and ${restless.length - 3} more` : ''}.`);
    const rising = Object.values(world.people).filter((p) => p.alive).sort((a, b) => b.fame - a.fame).slice(0, 3);
    if (rising.length) lines.push(`Most talked about: ${rising.map((p) => p.name).join(', ')}.`);
    const top = Object.values(world.companies).filter((c) => c.alive && c.priceHistory.length > 2).map((c) => ({ c, ch: pctChange(c.priceHistory, Math.min(c.priceHistory.length - 1, span)) })).sort((a, b) => b.ch - a.ch);
    if (top.length) { lines.push(`Biggest corporate winner: ${top[0].c.name} (+${top[0].ch.toFixed(0)}%).`); const worst = top[top.length - 1]; if (worst.ch < 0) lines.push(`Biggest loser: ${worst.c.name} (${worst.ch.toFixed(0)}%).`); }
    const cats = new Map<string, number>(); for (const e of evs) cats.set(e.category, (cats.get(e.category) ?? 0) + 1);
    const topCat = Array.from(cats.entries()).sort((a, b) => b[1] - a[1])[0];
    if (topCat) lines.push(`${evs.length} events recorded, dominated by ${topCat[0]} news.`);
    const interventions = world.interventions.filter((i) => i.day > since);
    if (interventions.length) lines.push(`Divine interventions this period: ${interventions.length}.`);
  } else {
    const minor = evs.filter((e) => e.severity < 4).slice(0, 3);
    for (const e of minor) lines.push(e.title + '.');
  }
  return { period, day: world.day, title, lines };
}

/** Names a year by what dominated it, e.g. "The Year of Fire". */
export function eraName(evs: { category: string; type: string; severity: number }[]): string {
  const score: Record<string, number> = {};
  for (const e of evs) { const k = e.type === 'war.declared' || e.type === 'battle' ? 'war' : e.type.startsWith('disaster.') ? 'disaster' : e.type === 'tech.breakthrough' || e.type === 'discovery' || e.type === 'space.milestone' ? 'wonder' : e.type.startsWith('economy.') || e.type === 'company.bankrupt' ? 'money' : e.type.startsWith('leader.') || e.type === 'government.collapse' ? 'thrones' : e.type.startsWith('protest') || e.type.startsWith('movement') ? 'streets' : e.type.startsWith('health.') ? 'plague' : e.type === 'scandal' || e.type === 'feud' ? 'whispers' : 'quiet'; if (k !== 'quiet') score[k] = (score[k] ?? 0) + e.severity * e.severity; }
  const top = Object.entries(score).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'quiet';
  return { war: 'The Year of Fire', disaster: 'The Year the Earth Shook', wonder: 'The Year of Wonders', money: 'The Year of Ledgers', thrones: 'The Year of Falling Thrones', streets: 'The Year of the Streets', plague: 'The Year of Fever', whispers: 'The Year of Whispers', quiet: 'A Quiet Year' }[top] ?? 'A Year Like Any Other';
}
