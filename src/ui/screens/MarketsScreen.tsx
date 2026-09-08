import React, { useMemo, useState } from 'react';
import { useGame } from '@/state/store';
import { pctChange } from '@/engine/simulation/markets';
import { SECTORS, type Sector } from '@/engine/types';
import { Sparkline, LineChart } from '../components/Sparkline';
import { fmtMoneyB, fmtPct } from '../format';

export function MarketsScreen(): React.ReactElement {
  const world = useGame((s) => s.world)!;
  const version = useGame((s) => s.version);
  const select = useGame((s) => s.select);
  const [sector, setSector] = useState<Sector | 'all'>('all');
  const [sort, setSort] = useState<'value' | 'change' | 'name'>('value');
  const [country, setCountry] = useState<string>('all');
  const g = world.indexes.global;
  const companies = useMemo(() => {
    let cs = Object.values(world.companies).filter((c) => c.alive && c.publicListed && (sector === 'all' || c.sector === sector) && (country === 'all' || c.countryId === country));
    if (sort === 'value') cs = cs.sort((a, b) => b.value - a.value);
    else if (sort === 'change') cs = cs.sort((a, b) => pctChange(b.priceHistory, 7) - pctChange(a.priceHistory, 7));
    else cs = cs.sort((a, b) => a.name.localeCompare(b.name));
    return cs.slice(0, 80);
  }, [world, version, sector, sort, country]);
  const movers = useMemo(() => { const cs = Object.values(world.companies).filter((c) => c.alive && c.priceHistory.length > 5).map((c) => ({ c, ch: pctChange(c.priceHistory, 7) })).sort((a, b) => b.ch - a.ch); return { up: cs.slice(0, 3), down: cs.slice(-3).reverse() }; }, [world, version]);
  const indexes = Object.values(world.indexes).filter((i) => i.countryId).sort((a, b) => (world.countries[b.countryId!]?.gdp ?? 0) - (world.countries[a.countryId!]?.gdp ?? 0));
  const totalCap = Object.values(world.companies).filter((c) => c.alive).reduce((s, c) => s + c.value, 0);
  return (
    <div className="screen">
      <div className="screen-inner">
        <div className="screen-header">
          <div><div className="kicker">Capital</div><h2 className="screen-title">Markets</h2></div>
          <div className="dim mono">total cap {fmtMoneyB(totalCap)}</div>
        </div>
        <div className="ticker-tape">
          {Object.values(world.commodities).map((c) => { const ch = pctChange(c.history, 1); return <span key={c.id}>{c.name} <b>{c.price >= 100 ? c.price.toFixed(0) : c.price.toFixed(2)}</b> <span className={ch >= 0 ? 'up' : 'down'}>{fmtPct(ch)}</span></span>; })}
        </div>
        {g && (
          <div className="panel-solid" style={{ padding: 12 }}>
            <div className="row between"><div><div className="kicker">World Composite</div><div className="title mono">{g.value.toFixed(1)} <span className={pctChange(g.history, 1) >= 0 ? 'up' : 'down'} style={{ fontSize: 13 }}>{fmtPct(pctChange(g.history, 1))} today</span> <span className={pctChange(g.history, 30) >= 0 ? 'up' : 'down'} style={{ fontSize: 13 }}>{fmtPct(pctChange(g.history, 30))} 30d</span></div></div></div>
            <LineChart data={g.history} height={150} />
          </div>
        )}
        <div className="grid-2">
          <div className="panel-solid" style={{ padding: 12 }}>
            <div className="section-title">Top movers (7d)</div>
            <div className="list">
              {movers.up.map(({ c, ch }) => <div key={c.id} className="row clickable" onClick={() => select({ kind: 'company', id: c.id })}><span className="grow ellipsis">{c.name}</span><span className="up mono">{fmtPct(ch)}</span></div>)}
              {movers.down.map(({ c, ch }) => <div key={c.id} className="row clickable" onClick={() => select({ kind: 'company', id: c.id })}><span className="grow ellipsis">{c.name}</span><span className="down mono">{fmtPct(ch)}</span></div>)}
            </div>
          </div>
          <div className="panel-solid" style={{ padding: 12 }}>
            <div className="section-title">National indexes</div>
            <div className="list">
              {indexes.slice(0, 8).map((i) => { const ch = pctChange(i.history, 7); return <div key={i.id} className="row clickable" onClick={() => select({ kind: 'country', id: i.countryId! })}><span className="grow ellipsis">{i.name} <span className="dim">{world.countries[i.countryId!]?.name}</span></span><Sparkline data={i.history.slice(-40)} width={60} height={18} /><span className={`mono ${ch >= 0 ? 'up' : 'down'}`} style={{ width: 60, textAlign: 'right' }}>{fmtPct(ch)}</span></div>; })}
            </div>
          </div>
        </div>
        <div className="panel-solid" style={{ padding: 12 }}>
          <div className="section-title">Commodities</div>
          <div className="grid-3">
            {Object.values(world.commodities).map((c) => { const ch = pctChange(c.history, 7); return <div key={c.id} className="card"><div className="kicker">{c.name}</div><div className="row between"><span className="mono" style={{ fontSize: 16, fontWeight: 700 }}>{c.price >= 100 ? c.price.toFixed(0) : c.price.toFixed(2)} <span className="dim" style={{ fontSize: 10 }}>{c.unit}</span></span><span className={`mono ${ch >= 0 ? 'up' : 'down'}`}>{fmtPct(ch)}</span></div><Sparkline data={c.history.slice(-60)} width={200} height={28} /></div>; })}
          </div>
        </div>
        <div className="panel-solid" style={{ padding: 12 }}>
          <div className="section-title">Listed companies</div>
          <div className="row wrap" style={{ marginBottom: 8 }}>
            <select className="select" style={{ width: 'auto' }} value={sector} onChange={(e) => setSector(e.target.value as Sector | 'all')}><option value="all">All sectors</option>{SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            <select className="select" style={{ width: 'auto', maxWidth: 180 }} value={country} onChange={(e) => setCountry(e.target.value)}><option value="all">All countries</option>{Object.values(world.countries).sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <select className="select" style={{ width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value as 'value')}><option value="value">By value</option><option value="change">By 7d change</option><option value="name">By name</option></select>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Company</th><th className="hide-mobile">Sector</th><th className="num">Value</th><th className="num">7d</th><th className="hide-mobile">Trend</th></tr></thead>
              <tbody>
                {companies.map((c) => { const ch = pctChange(c.priceHistory, 7); return (
                  <tr key={c.id} className="clickable" onClick={() => select({ kind: 'company', id: c.id })}>
                    <td><div className="ellipsis" style={{ maxWidth: 220 }}><b>{c.name}</b> <span className="dim mono" style={{ fontSize: 11 }}>{c.ticker}</span></div><div className="dim" style={{ fontSize: 11 }}>{world.countries[c.countryId]?.name}</div></td>
                    <td className="hide-mobile">{c.sector}</td>
                    <td className="num">{fmtMoneyB(c.value)}</td>
                    <td className={`num ${ch >= 0 ? 'up' : 'down'}`}>{fmtPct(ch)}</td>
                    <td className="hide-mobile"><Sparkline data={c.priceHistory.slice(-40)} width={90} height={22} /></td>
                  </tr>); })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
