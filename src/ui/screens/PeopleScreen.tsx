import React, { useMemo, useState } from 'react';
import { useGame } from '@/state/store';
import { EntityRow } from '../components/EntityRow';
import { ageOf } from '@/engine/time';
import { titleCase } from '../format';
import type { Profession } from '@/engine/types';

const PROFS: (Profession | 'all')[] = ['all', 'politician', 'entrepreneur', 'scientist', 'journalist', 'activist', 'executive', 'general', 'celebrity', 'artist', 'criminal', 'diplomat', 'athlete', 'engineer', 'religious-leader', 'citizen'];

export function PeopleScreen(): React.ReactElement {
  const world = useGame((s) => s.world)!;
  const version = useGame((s) => s.version);
  const [q, setQ] = useState('');
  const [prof, setProf] = useState<Profession | 'all'>('all');
  const [sort, setSort] = useState<'influence' | 'fame' | 'wealth' | 'reputation'>('influence');
  const [showDead, setShowDead] = useState(false);
  const [limit, setLimit] = useState(60);
  const people = useMemo(() => {
    const lq = q.trim().toLowerCase();
    return Object.values(world.people)
      .filter((p) => (showDead || p.alive) && (prof === 'all' || p.profession === prof) && (!lq || p.name.toLowerCase().includes(lq) || world.countries[p.countryId]?.name.toLowerCase().includes(lq) || p.title?.toLowerCase().includes(lq)))
      .sort((a, b) => b[sort] - a[sort]).slice(0, limit);
  }, [world, version, q, prof, sort, showDead, limit]);
  const leaders = useMemo(() => Object.values(world.countries).map((c) => world.people[c.leaderId]).filter(Boolean).sort((a, b) => b.influence - a.influence).slice(0, 6), [world, version]);
  return (
    <div className="screen">
      <div className="screen-inner">
        <div className="screen-header"><div><div className="kicker">Who matters</div><h2 className="screen-title">People</h2></div><div className="dim mono">{Object.values(world.people).filter((p) => p.alive).length} living figures</div></div>
        <div className="panel-solid" style={{ padding: 12 }}>
          <div className="section-title">Most powerful leaders</div>
          <div className="grid-3">{leaders.map((p) => <EntityRow key={p.id} refx={{ kind: 'person', id: p.id }} name={p.name} sub={`${p.title} · ${world.countries[p.countryId]?.name}`} right={<span>{p.influence.toFixed(0)}</span>} />)}</div>
        </div>
        <div className="row wrap">
          <input className="input" style={{ flex: 1, minWidth: 160 }} placeholder="Search people, countries, titles…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="select" style={{ width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value as 'influence')}><option value="influence">Influence</option><option value="fame">Fame</option><option value="wealth">Wealth</option><option value="reputation">Reputation</option></select>
          <label className="chip clickable"><input type="checkbox" checked={showDead} onChange={(e) => setShowDead(e.target.checked)} /> include deceased</label>
        </div>
        <div className="chips scroll">{PROFS.map((p) => <button key={p} className={`chip clickable ${prof === p ? 'active' : ''}`} onClick={() => setProf(p)}>{titleCase(p)}</button>)}</div>
        <div className="panel-solid list" style={{ padding: 6 }}>
          {people.map((p) => <EntityRow key={p.id} refx={{ kind: 'person', id: p.id }} name={`${p.name}${p.alive ? '' : ' †'}`} sub={`${p.title ? p.title + ' · ' : ''}${titleCase(p.profession)} · ${world.countries[p.countryId]?.name ?? '?'} · ${ageOf(p.birthDay, world.day)}y`} right={<><div>{sort === 'wealth' ? `$${p.wealth.toFixed(0)}M` : p[sort].toFixed(0)}</div><div className="dim" style={{ fontSize: 10 }}>{sort}</div></>} />)}
          {!people.length && <div className="dim" style={{ padding: 12 }}>Nobody matches.</div>}
        </div>
        {people.length >= limit && <button className="btn" onClick={() => setLimit(limit + 60)}>Show more</button>}
      </div>
    </div>
  );
}
