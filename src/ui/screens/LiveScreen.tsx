import React, { useMemo, useState } from 'react';
import { useGame } from '@/state/store';
import { EVENT_CATEGORIES, type EventCategory } from '@/engine/types';
import { EventCard } from '../components/EventCard';
import { catVar } from '../format';

export function LiveScreen(): React.ReactElement {
  const world = useGame((s) => s.world)!;
  const version = useGame((s) => s.version);
  const [cat, setCat] = useState<EventCategory | 'all'>('all');
  const [minSev, setMinSev] = useState(1);
  const [limit, setLimit] = useState(60);
  const events = useMemo(() => world.events.filter((e) => (cat === 'all' || e.category === cat) && e.severity >= minSev).slice(-limit).reverse(), [world, version, cat, minSev, limit]);
  const today = world.events.filter((e) => e.day === world.day).length;
  const summary = world.summaries[world.summaries.length - 1];
  return (
    <div className="screen">
      <div className="screen-inner">
        <div className="screen-header">
          <div><div className="kicker" style={{ color: 'var(--bad)' }}>● LIVE</div><h2 className="screen-title">Global event stream</h2></div>
          <div className="dim mono">{today} today · {world.events.length} total</div>
        </div>
        {summary && (
          <div className="panel-solid" style={{ padding: 12 }}>
            <div className="kicker">{summary.title}</div>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: 'var(--text-2)', fontSize: 13 }}>{summary.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
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
