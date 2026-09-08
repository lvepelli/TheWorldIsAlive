import React, { useMemo, useState } from 'react';
import { useGame } from '@/state/store';
import { EventCard } from '../components/EventCard';
import { toDate, MONTHS, formatDate } from '@/engine/time';
import { EVENT_CATEGORIES, type EventCategory } from '@/engine/types';
import { catVar } from '../format';

export function HistoryScreen(): React.ReactElement {
  const world = useGame((s) => s.world)!;
  const version = useGame((s) => s.version);
  const select = useGame((s) => s.select);
  const [tab, setTab] = useState<'timeline' | 'interventions' | 'summaries'>('timeline');
  const [cat, setCat] = useState<EventCategory | 'all'>('all');
  const [country, setCountry] = useState('all');
  const [year, setYear] = useState<number | 'all'>('all');
  const [onlyHistoric, setOnlyHistoric] = useState(true);
  const years = useMemo(() => { const s = new Set<number>(); for (const e of world.events) s.add(toDate(e.day, world.meta.startYear).year); return Array.from(s).sort((a, b) => b - a); }, [world, version]);
  const grouped = useMemo(() => {
    const evs = world.events.filter((e) => (!onlyHistoric || e.historic || e.severity >= 3) && (cat === 'all' || e.category === cat) && (country === 'all' || e.location.countryId === country || e.actors.some((a) => a.kind === 'country' && a.id === country)) && (year === 'all' || toDate(e.day, world.meta.startYear).year === year)).slice(-400).reverse();
    const groups: { key: string; label: string; events: typeof evs }[] = [];
    for (const e of evs) { const d = toDate(e.day, world.meta.startYear); const key = `${d.year}-${d.month}`; let g = groups[groups.length - 1]; if (!g || g.key !== key) { g = { key, label: `${MONTHS[d.month]} ${d.year}`, events: [] }; groups.push(g); } g.events.push(e); }
    return groups;
  }, [world, version, cat, country, year, onlyHistoric]);
  return (
    <div className="screen">
      <div className="screen-inner">
        <div className="screen-header"><div><div className="kicker">Chronicle of {world.meta.name}</div><h2 className="screen-title">History</h2></div><div className="dim mono">seed {world.meta.seed}</div></div>
        <div className="row">
          {(['timeline', 'interventions', 'summaries'] as const).map((t) => <button key={t} className={`chip clickable ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t === 'interventions' ? `Your interventions (${world.interventions.length})` : t[0].toUpperCase() + t.slice(1)}</button>)}
        </div>
        {tab === 'timeline' && (
          <>
            <div className="row wrap">
              <select className="select" style={{ width: 'auto' }} value={year} onChange={(e) => setYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}><option value="all">All years</option>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
              <select className="select" style={{ width: 'auto', maxWidth: 180 }} value={country} onChange={(e) => setCountry(e.target.value)}><option value="all">All countries</option>{Object.values(world.countries).sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              <label className="chip clickable"><input type="checkbox" checked={onlyHistoric} onChange={(e) => setOnlyHistoric(e.target.checked)} /> major only</label>
            </div>
            <div className="chips scroll"><button className={`chip clickable ${cat === 'all' ? 'active' : ''}`} onClick={() => setCat('all')}>All</button>{EVENT_CATEGORIES.map((c) => <button key={c} className={`chip clickable ${cat === c ? 'active' : ''}`} onClick={() => setCat(c)} style={{ color: cat === c ? undefined : catVar(c) }}>{c}</button>)}</div>
            {grouped.map((g) => (
              <div key={g.key} className="col">
                <div className="kicker" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 4, marginTop: 6 }}>{g.label}</div>
                <div className="list">{g.events.map((e) => <EventCard key={e.id} ev={e} compact />)}</div>
              </div>
            ))}
            {!grouped.length && <div className="dim">History has not been written yet.</div>}
          </>
        )}
        {tab === 'interventions' && (
          <div className="list">
            {world.interventions.slice().reverse().map((i) => { const ev = world.events.find((e) => e.id === i.eventId); const cons = ev ? countConsequences(world, ev.id) : 0; return (
              <div key={i.id} className="card clickable" onClick={() => ev && select({ kind: 'event', id: ev.id })}>
                <div className="row"><span className="player-badge">✦</span><span className="kicker">{formatDate(i.day, world.meta.startYear)} · Divine intervention</span></div>
                <div style={{ fontWeight: 700, marginTop: 4 }}>{ev?.title ?? i.command}</div>
                <div className="dim" style={{ fontSize: 12 }}>“{i.command}”</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{i.interpretation}</div>
                <div className="mono dim" style={{ fontSize: 11, marginTop: 4 }}>→ {cons} downstream consequence{cons === 1 ? '' : 's'} so far</div>
              </div>); })}
            {!world.interventions.length && <div className="dim">You have not intervened yet. Open God Mode to change history.</div>}
          </div>
        )}
        {tab === 'summaries' && (
          <div className="list">
            {world.summaries.slice().reverse().map((s, i) => <div key={i} className="card"><div className="kicker">{s.period} · {formatDate(s.day, world.meta.startYear)}</div><div style={{ fontWeight: 700, margin: '4px 0' }}>{s.title}</div><ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-2)', fontSize: 13 }}>{s.lines.map((l, j) => <li key={j}>{l}</li>)}</ul></div>)}
          </div>
        )}
      </div>
    </div>
  );
}

export function countConsequences(world: { events: { id: string; consequences: string[] }[] }, id: string, seen = new Set<string>()): number {
  const ev = world.events.find((e) => e.id === id); if (!ev) return 0;
  let n = 0;
  for (const c of ev.consequences) { if (seen.has(c)) continue; seen.add(c); n += 1 + countConsequences(world, c, seen); }
  return n;
}
