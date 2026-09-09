import React, { useMemo, useState } from 'react';
import { useGame } from '@/state/store';
import { useT } from '../i18n';
import { Drawer } from '../shell/Drawer';
import { EventCard } from '../components/EventCard';
import { EVENT_CATEGORIES, type EventCategory } from '@/engine/types';
import { toDate } from '@/engine/time';
import { collectChain, sagaTitle } from '../screens/HistoryScreen';
import { renderEvent } from '@/engine/i18n/render';
import { catVar, sevLabel } from '../format';

/** Structured event feed: what just happened, developing stories, and a filterable timeline. */
export function EventsPanel(): React.ReactElement {
  const t = useT(); const world = useGame((s) => s.world)!; const version = useGame((s) => s.version); const select = useGame((s) => s.select);
  const [cat, setCat] = useState<EventCategory | 'all'>('all'); const [minSev, setMinSev] = useState(1); const [country, setCountry] = useState('all'); const [region, setRegion] = useState('all'); const [year, setYear] = useState<number | 'all'>('all'); const [q, setQ] = useState(''); const [historic, setHistoric] = useState(false);
  const countries = useMemo(() => Object.values(world.countries).sort((a, b) => a.name.localeCompare(b.name)), [world, version]);
  const regions = useMemo(() => Object.values(world.regions ?? {}).filter((r) => country === 'all' || r.countryId === country).sort((a, b) => a.name.localeCompare(b.name)), [world, version, country]);
  const years = useMemo(() => { const s = new Set<number>(); for (const e of world.events) s.add(toDate(e.day, world.meta.startYear).year); return Array.from(s).sort((a, b) => b - a); }, [world, version]);
  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const nameOf = (kind: string, id: string) => kind === 'person' ? world.people[id]?.name : kind === 'company' ? world.companies[id]?.name : kind === 'organization' ? world.organizations[id]?.name : kind === 'country' ? world.countries[id]?.name : '';
    return world.events.filter((e) => (cat === 'all' || e.category === cat) && e.severity >= minSev && (!historic || e.historic || e.severity >= 4)
      && (country === 'all' || e.location.countryId === country || e.actors.some((a) => a.kind === 'country' && a.id === country))
      && (region === 'all' || e.data?.regionId === region || (e.location.cityId && world.cities[e.location.cityId]?.regionId === region))
      && (year === 'all' || toDate(e.day, world.meta.startYear).year === year)
      && (!ql || e.title.toLowerCase().includes(ql) || renderEvent(e, world).title.toLowerCase().includes(ql) || e.actors.some((a) => (nameOf(a.kind, a.id) ?? '').toLowerCase().includes(ql)))).slice(-300).reverse();
  }, [world, version, cat, minSev, country, region, year, q, historic]);
  const developing = useMemo(() => {
    const recent = world.events.slice(-150).filter((e) => world.day - e.day < 40);
    const seen = new Set<string>(); const out: { root: typeof recent[number]; latest: typeof recent[number]; size: number }[] = [];
    for (const e of recent.slice().reverse()) { const chain = collectChain(world, e.id); const root = chain[0]; if (chain.length < 3 || seen.has(root.id)) continue; seen.add(root.id); out.push({ root, latest: e, size: chain.length }); if (out.length >= 5) break; }
    return out;
  }, [world, version]);
  const justNow = useMemo(() => world.events.slice(-6).reverse(), [world, version]);
  return (
    <Drawer title={t('panel.events')} sub={t('panel.events.sub')} wide>
      <div className="section-title">{t('events.what')}</div>
      <div className="list">{justNow.map((e) => <EventCard key={e.id} ev={e} compact />)}</div>
      {developing.length > 0 && <>
        <div className="section-title">{t('events.developing')}</div>
        <div className="story-grid">{developing.map((d) => <button key={d.root.id} className="story-card" onClick={() => select({ kind: 'event', id: d.latest.id })} style={{ ['--c' as string]: catVar(d.latest.category) }}><div className="story-title">{sagaTitle(world, d.root, [d.root])}</div><div className="story-latest">{renderEvent(d.latest, world).title}</div><div className="story-meta">{t('events.chainOf', { n: d.size })}</div></button>)}</div>
      </>}
      <div className="section-title">{t('events.timeline')} <span className="dim mono">{t('events.count', { n: filtered.length })}</span></div>
      <div className="row wrap" style={{ gap: 6 }}>
        <select className="select" value={cat} onChange={(e) => setCat(e.target.value as EventCategory | 'all')} aria-label={t('events.filter.category')}><option value="all">{t('events.filter.category')}: {t('common.all')}</option>{EVENT_CATEGORIES.map((c) => <option key={c} value={c}>{t(`cat.${c}`)}</option>)}</select>
        <select className="select" value={minSev} onChange={(e) => setMinSev(Number(e.target.value))} aria-label={t('events.filter.severity')}>{[1, 2, 3, 4, 5].map((s) => <option key={s} value={s}>{t('events.filter.severity')}: {sevLabel(s)}+</option>)}</select>
        <select className="select" value={country} onChange={(e) => { setCountry(e.target.value); setRegion('all'); }} aria-label={t('events.filter.country')}><option value="all">{t('events.filter.country')}: {t('common.all')}</option>{countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select className="select" value={region} onChange={(e) => setRegion(e.target.value)} aria-label={t('events.filter.region')}><option value="all">{t('events.filter.region')}: {t('common.all')}</option>{regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
        <select className="select" value={String(year)} onChange={(e) => setYear(e.target.value === 'all' ? 'all' : Number(e.target.value))} aria-label={t('events.filter.year')}><option value="all">{t('events.filter.year')}: {t('common.all')}</option>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
        <input className="input" style={{ minWidth: 160 }} placeholder={t('events.filter.text')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('events.filter.text')} />
        <label className="chip clickable"><input type="checkbox" checked={historic} onChange={(e) => setHistoric(e.target.checked)} /> {t('events.filter.historic')}</label>
      </div>
      <div className="list">{filtered.slice(0, 120).map((e) => <EventCard key={e.id} ev={e} compact />)}</div>
    </Drawer>
  );
}
