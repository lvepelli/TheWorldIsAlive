import React, { useMemo, useState } from 'react';
import { useGame } from '@/state/store';
import { useT } from '../i18n';
import { Drawer } from '../shell/Drawer';
import { formatDate, toDate, yearOf } from '@/engine/time';
import { DAYS_PER_YEAR, type EntityRef } from '@/engine/types';
import { RNG } from '@/engine/rng';

interface Item { day: number; label: string; ico: string; ref?: EntityRef; kind: string }
const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

/** Upcoming scheduled world events derived from the engine's own schedules (no separate calendar state). */
export function CalendarPanel(): React.ReactElement {
  const t = useT(); const world = useGame((s) => s.world)!; const version = useGame((s) => s.version); const select = useGame((s) => s.select);
  const [tab, setTab] = useState<'today' | 'month' | 'year' | 'upcoming'>('upcoming');
  const items = useMemo<Item[]>(() => {
    const out: Item[] = []; const y0 = world.meta.startYear; const year = yearOf(world.day, y0); const today = toDate(world.day, y0);
    const dayOf = (yr: number, doy: number) => (yr - y0) * DAYS_PER_YEAR + doy;
    const yearly = (doy: number, label: string, ico: string, kind: string, every = 1) => { for (let yr = year; yr <= year + 2; yr++) { if (every > 1 && yr % every !== 0) continue; const d = dayOf(yr, doy); if (d >= world.day - 1) out.push({ day: d, label, ico, kind }); } };
    yearly(MONTH_START[4], t('calendar.festival'), '🎬', 'festival'); yearly(MONTH_START[9], t('calendar.fair'), '🏗', 'fair'); yearly(MONTH_START[11], t('calendar.conference'), '🌍', 'conference'); yearly(3, t('calendar.harvest'), '🌾', 'harvest'); yearly(3, t('calendar.prizes'), '🏅', 'prizes'); yearly(3, t('calendar.games'), '🏟', 'games', 4);
    for (const c of Object.values(world.countries)) {
      if (!c.electionEvery) continue;
      const ey = c.nextElectionYear; if (ey < year) continue;
      out.push({ day: dayOf(ey, 3), label: t('calendar.election', { country: c.name }), ico: '🗳', ref: { kind: 'country', id: c.id }, kind: 'election' });
      out.push({ day: dayOf(ey, 20), label: t('calendar.regionalElections', { country: c.name }), ico: '▦', ref: { kind: 'country', id: c.id }, kind: 'regional' });
      const camp = dayOf(ey - 1, MONTH_START[8]); if (camp >= world.day - 1) out.push({ day: camp, label: t('calendar.campaign', { country: c.name }), ico: '📣', ref: { kind: 'country', id: c.id }, kind: 'campaign' });
    }
    for (const f of Object.values(world.organizations)) { if (!f.alive || f.type !== 'religion' || f.support <= 15) continue; const m = RNG.hash(f.id)[0] % 12; for (let yr = year; yr <= year + 1; yr++) { const d = dayOf(yr, MONTH_START[m]); if (d >= world.day - 1) out.push({ day: d, label: t('calendar.holyDays', { faith: f.name }), ico: '☼', ref: { kind: 'organization', id: f.id }, kind: 'holy' }); } }
    for (const p of world.pending) {
      const src = world.events.find((e) => e.id === p.sourceEventId);
      if (p.ruleId === 'region.referendum.result') out.push({ day: p.dueDay, label: t('calendar.referendum', { region: String(src?.data?.region ?? '?') }), ico: '🗳', ref: src ? { kind: 'event', id: src.id } : undefined, kind: 'referendum' });
      if (p.ruleId === 'god.scheduled') out.push({ day: p.dueDay, label: t('calendar.scheduled', { what: String(p.payload?.text ?? src?.title ?? '') }), ico: '✦', ref: src ? { kind: 'event', id: src.id } : undefined, kind: 'god' });
    }
    for (const c of Object.values(world.countries)) if (c.stability < 30 && c.unrest > 55) out.push({ day: world.day + 30, label: t('calendar.transition', { country: c.name }), ico: '⚠', ref: { kind: 'country', id: c.id }, kind: 'transition' });
    void today;
    return out.sort((a, b) => a.day - b.day);
  }, [world, version, t]);
  const today = toDate(world.day, world.meta.startYear);
  const shown = items.filter((i) => {
    const d = toDate(i.day, world.meta.startYear);
    if (tab === 'today') return i.day === world.day || i.day === world.day - 1;
    if (tab === 'month') return d.year === today.year && d.month === today.month && i.day >= world.day - 1;
    if (tab === 'year') return d.year === today.year && i.day >= world.day - 1;
    return i.day >= world.day - 1 && i.day <= world.day + 120;
  });
  const rel = (d: number) => { const n = d - world.day; if (n <= 0) return t('common.today'); if (n < 45) return t('calendar.inDays', { n }); return t('calendar.inMonths', { n: Math.round(n / 30) }); };
  return (
    <Drawer title={t('calendar.title')} sub={formatDate(world.day, world.meta.startYear)} wide>
      <div className="tabs">{(['today', 'month', 'year', 'upcoming'] as const).map((k) => <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{t(`calendar.${k}`)}</button>)}</div>
      {shown.length === 0 && <div className="dim">{t('calendar.empty')}</div>}
      <div className="list">{shown.map((i, k) => <div key={k} className={`entity-row ${i.ref ? 'clickable' : ''}`} onClick={() => i.ref && select(i.ref)} role={i.ref ? 'button' : undefined} tabIndex={i.ref ? 0 : undefined}><span className="avatar" style={{ background: 'rgba(255,255,255,0.05)' }}>{i.ico}</span><div className="grow"><div>{i.label}</div><div className="dim" style={{ fontSize: 12 }}>{formatDate(i.day, world.meta.startYear)}</div></div><span className="mono dim" style={{ fontSize: 11 }}>{rel(i.day)}</span></div>)}</div>
    </Drawer>
  );
}
