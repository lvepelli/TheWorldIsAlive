import React, { useMemo, useState } from 'react';
import { useGame } from '@/state/store';
import { EVENT_CATEGORIES, type EventCategory, type WorldEvent } from '@/engine/types';
import { EventCard } from '../components/EventCard';
import { catVar } from '../format';
import { summarize } from '@/engine/simulation/summary';
import { collectChain, sagaTitle } from './HistoryScreen';

export function LiveScreen(): React.ReactElement {
  const world = useGame((s) => s.world)!;
  const version = useGame((s) => s.version);
  const [cat, setCat] = useState<EventCategory | 'all'>('all');
  const [minSev, setMinSev] = useState(1);
  const [limit, setLimit] = useState(60);
  const events = useMemo(() => world.events.filter((e) => (cat === 'all' || e.category === cat) && e.severity >= minSev).slice(-limit).reverse(), [world, version, cat, minSev, limit]);
  const today = world.events.filter((e) => e.day === world.day).length;
  const summary = useMemo(() => summarize(world, 'day'), [world, version]);
  const period = world.summaries[world.summaries.length - 1];
  const select = useGame((s) => s.select);
  // Developing stories: causal chains that are still producing events.
  const developing = useMemo(() => {
    const childOf = new Set<string>(); for (const e of world.events) for (const c of e.consequences) childOf.add(c);
    const out: { title: string; latest: WorldEvent; size: number }[] = [];
    for (let i = world.events.length - 1; i >= 0 && out.length < 6; i--) {
      const root = world.events[i];
      if (childOf.has(root.id) || root.consequences.length < 1) continue;
      const chain = collectChain(world, root.id);
      const latest = chain.reduce((a, b) => (b.day > a.day ? b : a), chain[0]);
      if (world.day - latest.day > 45 || latest.id === root.id) continue;
      out.push({ title: sagaTitle(world, root, chain), latest, size: chain.length });
    }
    return out;
  }, [world, version]);
  return (
    <div className="screen">
      <div className="screen-inner">
        <div className="screen-header">
          <div><div className="kicker" style={{ color: 'var(--bad)' }}>● LIVE</div><h2 className="screen-title">Global event stream</h2></div>
          <div className="dim mono">{today} today · {world.events.length} total</div>
        </div>
        <div className="grid-2">
          <div className="panel-solid" style={{ padding: 12 }}>
            <div className="kicker">{summary.title}</div>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: 'var(--text-2)', fontSize: 13 }}>{summary.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
          </div>
          {period && (
            <div className="panel-solid" style={{ padding: 12 }}>
              <div className="kicker">{period.title}</div>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: 'var(--text-2)', fontSize: 13 }}>{period.lines.slice(0, 6).map((l, i) => <li key={i}>{l}</li>)}</ul>
            </div>
          )}
        </div>
        {developing.length > 0 && (
          <div>
            <div className="kicker" style={{ marginBottom: 6 }}>Developing stories</div>
            <div className="chips scroll" style={{ gap: 8 }}>
              {developing.map((d) => (
                <button key={d.latest.id} className="story-card" onClick={() => select({ kind: 'event', id: d.latest.id })} style={{ ['--c' as string]: catVar(d.latest.category) }}>
                  <div className="story-title">{d.title}</div>
                  <div className="story-latest">{d.latest.title}</div>
                  <div className="story-meta">{d.size} events · {world.day - d.latest.day === 0 ? 'today' : `${world.day - d.latest.day}d ago`}</div>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="chips scroll">
          <button className={`chip clickable ${cat === 'all' ? 'active' : ''}`} onClick={() => setCat('all')}>All</button>
          {EVENT_CATEGORIES.map((c) => <button key={c} className={`chip clickable ${cat === c ? 'active' : ''}`} onClick={() => setCat(c)} style={{ color: cat === c ? undefined : catVar(c) }}>{c}</button>)}
        </div>
        <div className="row">
          <span className="kicker">Min severity</span>
          {[1, 2, 3, 4, 5].map((s) => <button key={s} className={`chip clickable ${minSev === s ? 'active' : ''}`} onClick={() => setMinSev(s)}><span className={`sev sev-${s}`} /> {s}</button>)}
        </div>
        <div className="list">
          {events.map((e) => <EventCard key={e.id} ev={e} />)}
          {!events.length && <div className="dim">No events match. Advance time to let the world move.</div>}
        </div>
        {events.length >= limit && <button className="btn" onClick={() => setLimit(limit + 80)}>Load older events</button>}
      </div>
    </div>
  );
}
