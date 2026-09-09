import React, { useMemo, useState } from 'react';
import { useGame } from '@/state/store';
import { EntityRow } from '../components/EntityRow';
import { titleCase, fmtMoneyB } from '../format';
import type { OrgType } from '@/engine/types';

const TYPES: (OrgType | 'all' | 'company' | 'outlet')[] = ['all', 'government', 'party', 'movement', 'company', 'research', 'military', 'alliance', 'ngo', 'union', 'religion', 'criminal', 'outlet'];

export function OrgsScreen(): React.ReactElement {
  const world = useGame((s) => s.world)!;
  const version = useGame((s) => s.version);
  const [type, setType] = useState<typeof TYPES[number]>('all');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(60);
  const orgs = useMemo(() => Object.values(world.organizations).filter((o) => o.alive && (type === 'all' || o.type === type) && (!q || o.name.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => b.influence - a.influence), [world, version, type, q]);
  const companies = useMemo(() => (type === 'all' || type === 'company') ? Object.values(world.companies).filter((c) => c.alive && (!q || c.name.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => b.value - a.value) : [], [world, version, type, q]);
  const outlets = useMemo(() => (type === 'all' || type === 'outlet') ? Object.values(world.outlets).filter((o) => !q || o.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.audience - a.audience) : [], [world, version, type, q]);
  return (
    <div className="screen">
      <div className="screen-inner">
        <div className="screen-header"><div><div className="kicker">Power structures</div><h2 className="screen-title">Organizations</h2></div><div className="dim mono">{orgs.length + companies.length + outlets.length} entities</div></div>
        <input className="input" placeholder="Search organizations, companies, outlets…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="chips scroll">{TYPES.map((t) => <button key={t} className={`chip clickable ${type === t ? 'active' : ''}`} onClick={() => setType(t)}>{titleCase(t)}</button>)}</div>
        {(type === 'all' || type === 'company') && companies.length > 0 && (
          <div className="panel-solid" style={{ padding: 6 }}>
            <div className="section-title" style={{ padding: '6px 10px 0' }}>Companies</div>
            <div className="list">{companies.slice(0, type === 'all' ? 10 : limit).map((c) => <EntityRow key={c.id} refx={{ kind: 'company', id: c.id }} name={c.name} sub={`${c.sector} · ${world.countries[c.countryId]?.name}`} right={fmtMoneyB(c.value)} />)}</div>
          </div>
        )}
        {orgs.length > 0 && (
          <div className="panel-solid" style={{ padding: 6 }}>
            <div className="section-title" style={{ padding: '6px 10px 0' }}>Organizations</div>
            <div className="list">{orgs.slice(0, limit).map((o) => <EntityRow key={o.id} refx={{ kind: 'organization', id: o.id }} name={o.name} sub={`${titleCase(o.type)} · ${o.countryId ? world.countries[o.countryId]?.name : 'International'} · ${o.agenda}`} right={(o.type === 'movement' || o.type === 'religion' || o.type === 'party') ? <><div style={{ color: o.support > 40 ? 'var(--ok)' : o.support < 10 ? 'var(--text-3)' : undefined }}>{o.support.toFixed(0)}%</div><div className="dim" style={{ fontSize: 10 }}>support</div></> : <><div>{o.influence.toFixed(0)}</div><div className="dim" style={{ fontSize: 10 }}>influence</div></>} />)}</div>
          </div>
        )}
        {(type === 'all' || type === 'outlet') && outlets.length > 0 && (
          <div className="panel-solid" style={{ padding: 6 }}>
            <div className="section-title" style={{ padding: '6px 10px 0' }}>Media outlets</div>
            <div className="list">{outlets.slice(0, type === 'all' ? 8 : limit).map((o) => <EntityRow key={o.id} refx={{ kind: 'outlet', id: o.id }} name={o.name} sub={`${o.bias} · ${o.countryId ? world.countries[o.countryId]?.name : 'International'}`} right={`${o.audience.toFixed(0)}M`} />)}</div>
          </div>
        )}
        {(orgs.length >= limit || companies.length >= limit) && <button className="btn" onClick={() => setLimit(limit + 60)}>Show more</button>}
      </div>
    </div>
  );
}
