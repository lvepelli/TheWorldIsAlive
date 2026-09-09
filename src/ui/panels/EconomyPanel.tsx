import React, { useMemo, useState } from 'react';
import { useGame } from '@/state/store';
import { useT } from '../i18n';
import { Drawer } from '../shell/Drawer';
import { fmtMoneyB, fmtPct, trendArrow, trendColor } from '../format';
import { pctChange } from '@/engine/simulation/markets';
import { Sparkline } from '../components/Sparkline';
import type { Country } from '@/engine/types';

type Col = 'name' | 'gdp' | 'growth' | 'debt' | 'unemployment' | 'inflation' | 'market' | 'top';

/** World economy: a sortable comparison table plus global index and commodities. */
export function EconomyPanel(): React.ReactElement {
  const t = useT(); const world = useGame((s) => s.world)!; const version = useGame((s) => s.version); const select = useGame((s) => s.select); const focusOn = useGame((s) => s.focusOn);
  const [col, setCol] = useState<Col>('gdp'); const [asc, setAsc] = useState(false);
  const rows = useMemo(() => Object.values(world.countries).map((c) => {
    const idx = world.indexes[c.id]; const mk = idx ? pctChange(idx.history, Math.min(idx.history.length - 1, 30)) : 0;
    const top = Object.values(world.companies).filter((x) => x.alive && x.countryId === c.id).sort((a, b) => b.value - a.value)[0];
    return { c, mk, top };
  }), [world, version]);
  const sorted = useMemo(() => { const v = (r: typeof rows[number]) => col === 'name' ? r.c.name : col === 'gdp' ? r.c.gdp : col === 'growth' ? r.c.gdpGrowth : col === 'debt' ? r.c.debt : col === 'unemployment' ? r.c.unemployment : col === 'inflation' ? r.c.inflation : col === 'market' ? r.mk : (r.top?.value ?? 0); return rows.slice().sort((a, b) => { const x = v(a), y = v(b); const d = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y)); return asc ? d : -d; }); }, [rows, col, asc]);
  const g = world.indexes.global; const gch = g ? pctChange(g.history, Math.min(g.history.length - 1, 30)) : 0;
  const worldGdp = rows.reduce((s, r) => s + r.c.gdp, 0);
  const H = ({ id, label, num }: { id: Col; label: string; num?: boolean }) => <th className={`${num ? 'num' : ''} ${col === id ? 'sorted' : ''}`} onClick={() => { if (col === id) setAsc(!asc); else { setCol(id); setAsc(id === 'name'); } }} aria-sort={col === id ? (asc ? 'ascending' : 'descending') : 'none'}>{label}{col === id ? (asc ? ' ▲' : ' ▼') : ''}</th>;
  const open = (c: Country) => { select({ kind: 'country', id: c.id }); focusOn(c.centroid.x, c.centroid.y, 2.2); };
  return (
    <Drawer title={t('panel.economy')} sub={t('panel.economy.sub')} wide>
      <div className="econ-head">
        <div className="card grow"><div className="kicker">{t('economy.global')}</div><div className="row"><span className="title">{g?.value.toFixed(0) ?? '—'}</span><span className="trend" style={{ color: trendColor(gch) }}>{trendArrow(gch)} {fmtPct(gch)} · {t('stat.trend30')}</span></div>{g && <Sparkline data={g.history.slice(-90)} width={220} height={36} />}</div>
        <div className="card grow"><div className="kicker">{t('economy.worldGdp')}</div><div className="title">{fmtMoneyB(worldGdp)}</div><div className="dim" style={{ fontSize: 11 }}>{t('stat.approx')}</div></div>
        <div className="card grow"><div className="kicker">{t('economy.commodities')}</div><div className="row wrap" style={{ gap: 8 }}>{Object.values(world.commodities).slice(0, 8).map((cm) => { const ch = pctChange(cm.history, Math.min(cm.history.length - 1, 30)); return <span key={cm.id} className="rel-chip" title={cm.name}><span>{t(`com.${cm.id}`) === `com.${cm.id}` ? cm.name : t(`com.${cm.id}`)}</span><span className="trend" style={{ color: trendColor(ch) }}>{trendArrow(ch)} {Math.abs(ch).toFixed(0)}%</span></span>; })}</div></div>
      </div>
      <div className="table-wrap"><table className="table">
        <thead><tr><H id="name" label={t('economy.table.country')} /><H id="gdp" label={t('economy.table.gdp')} num /><H id="growth" label={t('economy.table.growth')} num /><H id="debt" label={t('economy.table.debt')} num /><H id="unemployment" label={t('economy.table.unemployment')} num /><H id="inflation" label={t('economy.table.inflation')} num /><H id="market" label={t('economy.table.market')} num /><H id="top" label={t('economy.table.topCompany')} /></tr></thead>
        <tbody>{sorted.map(({ c, mk, top }) => (
          <tr key={c.id} className="clickable" onClick={() => open(c)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') open(c); }}>
            <td>{c.name}{c.atWarWith.length ? ' ⚔' : ''}</td><td className="num">{fmtMoneyB(c.gdp)}</td><td className="num" style={{ color: trendColor(c.gdpGrowth - 0.5, 0.5) }}>{fmtPct(c.gdpGrowth)}</td><td className="num" style={{ color: c.debt > 120 ? 'var(--bad)' : c.debt > 90 ? 'var(--warn)' : undefined }}>{c.debt.toFixed(0)}%</td><td className="num">{c.unemployment.toFixed(1)}%</td><td className="num" style={{ color: c.inflation > 8 ? 'var(--bad)' : undefined }}>{c.inflation.toFixed(1)}%</td><td className="num" style={{ color: trendColor(mk) }}>{trendArrow(mk)} {fmtPct(mk)}</td><td>{top ? <button className="link" onClick={(e) => { e.stopPropagation(); select({ kind: 'company', id: top.id }); }}>{top.name}</button> : '—'}</td>
          </tr>))}</tbody>
      </table></div>
    </Drawer>
  );
}
