import React, { useMemo } from 'react';
import { useGame } from '@/state/store';
import { useT } from '../i18n';
import { Drawer } from '../shell/Drawer';
import { EntityRow } from '../components/EntityRow';
import { govLabel, ideoLabel , personTitle } from '../format';
import { yearOf } from '@/engine/time';

/** Politics: who rules where, upcoming votes, fragile states, recent political events. */
export function PoliticsPanel(): React.ReactElement {
  const t = useT(); const world = useGame((s) => s.world)!; const version = useGame((s) => s.version); const select = useGame((s) => s.select);
  const year = yearOf(world.day, world.meta.startYear);
  const cs = useMemo(() => Object.values(world.countries).sort((a, b) => b.gdp - a.gdp), [world, version]);
  const elections = cs.filter((c) => c.electionEvery).map((c) => ({ c, in: c.nextElectionYear - year })).sort((a, b) => a.in - b.in).slice(0, 10);
  const fragile = cs.slice().sort((a, b) => a.stability - b.stability).slice(0, 6);
  const govCount = cs.reduce<Record<string, number>>((m, c) => { m[c.government] = (m[c.government] ?? 0) + 1; return m; }, {});
  return (
    <Drawer title={t('panel.politics')}>
      <div className="row wrap" style={{ gap: 6 }}>{Object.entries(govCount).sort((a, b) => b[1] - a[1]).map(([g, n]) => <span key={g} className="rel-chip">{govLabel(g)} <b className="mono">{n}</b></span>)}</div>
      <div className="section-title">{t('politics.elections')}</div>
      <div className="list">{elections.map(({ c, in: n }) => <EntityRow key={c.id} refx={{ kind: 'country', id: c.id }} name={c.name} sub={`${govLabel(c.government)} · ${t('country.electionsEvery', { n: c.electionEvery })}`} right={<span className="mono">{n <= 0 ? t('calendar.thisMonth') : c.nextElectionYear}</span>} />)}</div>
      <div className="section-title">{t('politics.upheaval')}</div>
      <div className="list">{fragile.map((c) => <EntityRow key={c.id} refx={{ kind: 'country', id: c.id }} name={c.name} sub={`${govLabel(c.government)} · ${t('stat.unrest')} ${c.unrest.toFixed(0)} · ${t('stat.approval')} ${c.approval.toFixed(0)}%`} right={<span className="mono" style={{ color: 'var(--bad)' }}>{c.stability.toFixed(0)}</span>} />)}</div>
      <div className="section-title">{t('politics.leaders')}</div>
      <div className="list">{cs.map((c) => { const l = world.people[c.leaderId]; if (!l) return null; return <div key={c.id} className="entity-row" onClick={() => select({ kind: 'person', id: l.id })} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') select({ kind: 'person', id: l.id }); }}><div className="grow"><div>{l.name} <span className="dim">· {c.name}</span></div><div className="dim" style={{ fontSize: 12 }}>{l.title ? personTitle(l) : govLabel(c.government)} · {ideoLabel(l.ideology)} · {t('stat.approval')} {c.approval.toFixed(0)}%</div></div></div>; })}</div>
    </Drawer>
  );
}
