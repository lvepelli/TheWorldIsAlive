import React, { useEffect, useMemo, useState } from 'react';
import { useGame } from '@/state/store';
import { useT } from '../i18n';
import { Drawer } from '../shell/Drawer';
import { EntityRow } from '../components/EntityRow';
import { EventCard } from '../components/EventCard';
import { relationBucket, relationColor } from '../format';
import { tradeLinks } from '@/engine/simulation/trade';

/** Diplomacy: pick a nation, see its network grouped by relation; the map highlights all its links. */
export function DiplomacyPanel(): React.ReactElement {
  const t = useT(); const world = useGame((s) => s.world)!; const version = useGame((s) => s.version);
  const setOverlay = useGame((s) => s.setOverlay); const setLinks = useGame((s) => s.setLinks); const focusOn = useGame((s) => s.focusOn);
  const cs = useMemo(() => Object.values(world.countries).sort((a, b) => b.gdp - a.gdp), [world, version]);
  const [id, setId] = useState<string>(cs[0]?.id ?? '');
  useEffect(() => { setOverlay('diplomacy'); setLinks('all'); return () => { setOverlay('political'); setLinks('auto'); }; }, [setOverlay, setLinks]);
  const c = world.countries[id];
  const wars = cs.filter((x) => x.atWarWith.length).length / 2;
  const groups = useMemo(() => {
    if (!c) return [] as { key: string; list: { o: typeof c; b: string; score: number }[] }[];
    const trade = new Set(tradeLinks(world, c).map((l) => l.partner.id));
    const rel = Object.entries(c.relations).map(([oid, score]) => { const o = world.countries[oid]; return o ? { o, score, b: relationBucket(score, c.atWarWith.includes(oid), c.alliances.includes(oid), trade.has(oid)) } : null; }).filter((x): x is NonNullable<typeof x> => !!x);
    const order = ['war', 'ally', 'enemy', 'rival', 'friendly', 'trade', 'neutral'];
    return order.map((key) => ({ key, list: rel.filter((r) => r.b === key).sort((a, b) => Math.abs(b.score) - Math.abs(a.score)) })).filter((g) => g.list.length);
  }, [c, world, version]);
  const summits = useMemo(() => world.events.filter((e) => e.type === 'summit' || e.type === 'summit.accord' || e.type === 'summit.collapse').slice(-4).reverse(), [world, version]);
  return (
    <Drawer title={t('panel.diplomacy')} sub={`${t('panel.diplomacy.sub')} · ${Math.round(wars)} ${t('diplomacy.wars').toLowerCase()}`} wide>
      <div className="row wrap" style={{ gap: 8 }}>
        <select className="select" value={id} onChange={(e) => { setId(e.target.value); const o = world.countries[e.target.value]; if (o) focusOn(o.centroid.x, o.centroid.y, 1.6); }} aria-label={t('entity.country')}>{cs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        {c && <button className="btn ghost sm" onClick={() => useGame.getState().select({ kind: 'country', id: c.id })}>{t('common.open')}</button>}
      </div>
      {!c && <div className="dim">{t('diplomacy.pick')}</div>}
      {c && groups.map((g) => (
        <div key={g.key}>
          <div className="section-title"><span className="rel-chip" style={{ color: relationColor(g.key), borderColor: relationColor(g.key) }}>{t(`crel.${g.key}`)}</span><span className="dim mono">{g.list.length}</span></div>
          <div className="list">{g.list.map((r) => <EntityRow key={r.o.id} refx={{ kind: 'country', id: r.o.id }} name={r.o.name} sub={`${r.o.atWarWith.length ? '⚔ ' : ''}${r.o.alliances.length} ${t('country.allies').toLowerCase()} · ${r.o.neighbors.includes(c.id) ? t('country.neighbors').toLowerCase() : ''}`} right={<span className="mono" style={{ color: relationColor(r.b) }}>{r.score > 0 ? '+' : ''}{r.score.toFixed(0)}</span>} />)}</div>
        </div>
      ))}
      {summits.length > 0 && <><div className="section-title">{t('diplomacy.summits')}</div><div className="list">{summits.map((e) => <EventCard key={e.id} ev={e} compact />)}</div></>}
    </Drawer>
  );
}
