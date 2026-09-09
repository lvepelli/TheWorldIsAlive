import React, { useMemo, useState } from 'react';
import { useGame } from '@/state/store';
import { daysAgo } from '@/engine/time';
import { fmtNum } from '../format';

export function NewsScreen(): React.ReactElement {
  const world = useGame((s) => s.world)!;
  const version = useGame((s) => s.version);
  const select = useGame((s) => s.select);
  const [outlet, setOutlet] = useState<string>('all');
  const [limit, setLimit] = useState(40);
  const outlets = useMemo(() => Object.values(world.outlets).sort((a, b) => b.audience - a.audience), [world]);
  const articles = useMemo(() => world.news.filter((n) => outlet === 'all' || (outlet === 'editorials' ? n.editorial : n.outletId === outlet)).slice(-limit).reverse(), [world, version, outlet, limit]);
  const lead = articles.find((a) => (world.events.find((e) => e.id === a.eventId)?.severity ?? 0) >= 4) ?? articles[0];
  return (
    <div className="screen">
      <div className="screen-inner">
        <div className="screen-header">
          <div><div className="kicker">Global media</div><h2 className="screen-title">Newsroom</h2></div>
          <div className="dim mono">{outlets.length} outlets · {world.news.length} stories</div>
        </div>
        <div className="chips scroll">
          <button className={`chip clickable ${outlet === 'all' ? 'active' : ''}`} onClick={() => setOutlet('all')}>All outlets</button>
          <button className={`chip clickable ${outlet === 'editorials' ? 'active' : ''}`} onClick={() => setOutlet('editorials')} title="Weekly opinion pieces, one per outlet, spun through its bias">Editorials</button>
          {outlets.map((o) => <button key={o.id} className={`chip clickable ${outlet === o.id ? 'active' : ''}`} onClick={() => setOutlet(o.id)}><span className="outlet-dot" style={{ background: o.color }} />{o.name}</button>)}
        </div>
        {outlet !== 'all' && (() => { const o = world.outlets[outlet]; return o ? (
          <div className="panel-solid row" style={{ padding: 12, gap: 12 }}>
            <span className="outlet-dot" style={{ background: o.color, width: 22, height: 22 }} />
            <div className="grow"><div className="outlet-name">{o.name}</div><div className="dim" style={{ fontSize: 12 }}>“{o.motto}” · {o.bias} · {o.style} · audience {fmtNum(o.audience * 1e6)} · credibility {o.credibility.toFixed(0)} · {o.countryId ? world.countries[o.countryId]?.name : 'International'}</div></div>
            <button className="btn sm" onClick={() => select({ kind: 'outlet', id: o.id })}>Profile</button>
          </div>
        ) : null; })()}
        <div className="grid-2">
          {articles.map((a) => {
            const o = world.outlets[a.outletId]; const ev = world.events.find((e) => e.id === a.eventId);
            const cls = o?.style === 'tabloid' ? 'tabloid' : o?.style === 'wire' ? 'wire' : '';
            return (
              <article key={a.id} className={`article ${cls} ${a === lead ? 'lead' : ''}`} onClick={() => ev && select({ kind: 'event', id: ev.id })}>
                <div className="outlet-mast"><span className="outlet-dot" style={{ background: o?.color }} /><span className="outlet-name" style={{ fontSize: 13 }}>{o?.name}</span><span className="dim" style={{ fontSize: 11 }}>· {daysAgo(a.day, world.day)}</span>{a.editorial && <span className="tag" style={{ color: 'var(--accent)' }}>editorial</span>}{a.tone === 'alarmist' && <span className="tag" style={{ color: 'var(--bad)' }}>alarm</span>}</div>
                <div className="headline">{a.headline}</div>
                <div className="body">{a.body}</div>
                <div className="byline">{a.authorId && world.people[a.authorId] && <span className="link" onClick={(e) => { e.stopPropagation(); select({ kind: 'person', id: a.authorId! }); }}>by {world.people[a.authorId].name}</span>}<span>Reach {fmtNum(a.reach * 1e6)}</span><span>Tone: {a.tone}</span>{ev && <span style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}>{ev.category}</span>}</div>
              </article>
            );
          })}
        </div>
        {!articles.length && <div className="dim">The presses are quiet. Advance time.</div>}
        {articles.length >= limit && <button className="btn" onClick={() => setLimit(limit + 40)}>Older stories</button>}
      </div>
    </div>
  );
}
