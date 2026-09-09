import React, { useMemo, useState } from 'react';
import { useGame } from '@/state/store';
import type { Country, City, Region, Person, Company, Organization, MediaOutlet, WorldEvent, EntityRef, World } from '@/engine/types';
import { Flag } from './Flag';
import { Avatar } from './Avatar';
import { Stat, barColor } from './Stat';
import { EntityRow } from './EntityRow';
import { EventCard } from './EventCard';
import { Sparkline, LineChart } from './Sparkline';
import { RelationGraph } from './RelationGraph';
import { Post } from '../screens/SocialScreen';
import { fmtMoneyB, fmtPop, fmtPct, catVar, sevLabel, titleCase, govLabel, profLabel, sectorLabel, ideoLabel, relLabel, orgTypeLabel, resLabel, relationBucket, relationColor, trendArrow, trendColor } from '../format';
import { tradeLinks, tradeShare } from '@/engine/simulation/trade';
import { regionsOf, regionOf, regionStats } from '@/engine/generator/regions';
import { ageOf, formatDate, daysAgo, yearOf } from '@/engine/time';
import { pctChange } from '@/engine/simulation/markets';
import { sentimentFor } from '@/engine/simulation/information';
import { countryPower } from '@/engine/simulation/systems';
import { countConsequences } from '../screens/HistoryScreen';
import { SUGGESTED_QUESTIONS, rememberConversation } from '@/engine/ai/dialogue';
import { looksSpanish, spanishToEnglish } from '@/engine/godmode/es';
import { getLang } from '@/engine/i18n/lang';
import { dialogueProvider } from '@/engine/ai';
import { renderEvent } from '@/engine/i18n/render';
import { useT } from '../i18n';
import { Breadcrumbs } from '../shell/Breadcrumbs';

export function Inspector(): React.ReactElement {
  const t = useT();
  const selection = useGame((s) => s.selection); const select = useGame((s) => s.select); const back = useGame((s) => s.back); const stack = useGame((s) => s.selectionStack);
  const world = useGame((s) => s.world); const version = useGame((s) => s.version); void version;
  const open = !!selection && !!world;
  const sheetRef = React.useRef<HTMLElement>(null);
  const wasOpen = React.useRef(false);
  React.useEffect(() => {
    if (open && !wasOpen.current) { const opener = document.activeElement as HTMLElement | null; sheetRef.current?.focus({ preventScroll: true }); (sheetRef.current as HTMLElement & { __opener?: HTMLElement | null }).__opener = opener; }
    if (!open && wasOpen.current) { const el = sheetRef.current as (HTMLElement & { __opener?: HTMLElement | null }) | null; if (el?.__opener && document.contains(el.__opener)) el.__opener.focus({ preventScroll: true }); }
    wasOpen.current = open;
  }, [open]);
  const drag = React.useRef<{ y0: number; dy: number } | null>(null);
  const onDown = (e: React.PointerEvent) => { if (window.innerWidth >= 900 || e.pointerType === 'mouse') return; drag.current = { y0: e.clientY, dy: 0 }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); };
  const onMove = (e: React.PointerEvent) => { const d = drag.current; if (!d || !sheetRef.current) return; d.dy = Math.max(0, e.clientY - d.y0); sheetRef.current.style.transition = 'none'; sheetRef.current.style.transform = `translateY(${d.dy}px)`; };
  const onUp = () => { const d = drag.current; const el = sheetRef.current; drag.current = null; if (!d || !el) return; el.style.transition = ''; el.style.transform = ''; if (d.dy > 90) select(null); };
  if (!open) return <aside ref={sheetRef} className="inspector" aria-hidden tabIndex={-1} />;
  return (
    <aside ref={sheetRef} className="inspector open" role="region" aria-label={t(`entity.${selection!.kind}`)} tabIndex={-1} data-testid="inspector" data-kind={selection!.kind}>
      <div className="grabber" onClick={() => select(null)} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} style={{ touchAction: 'none', width: 80, padding: '6px 0', background: 'none' }}><div style={{ width: 40, height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.2)', margin: '0 auto' }} /></div>
      <div className="inspector-head" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} style={{ touchAction: 'pan-x' }}>
        {stack.length > 0 ? <button className="btn ghost sm" onClick={back} aria-label={t('common.back')} data-testid="inspector-back">←</button> : null}
        <span className="kicker grow" data-testid="inspector-kind">{t(`entity.${selection!.kind}`)}</span>
        <button className="btn ghost sm" onClick={() => select(null)} aria-label={t('common.close')} data-testid="inspector-close">✕</button>
      </div>
      <Breadcrumbs refx={selection!} />
      <div className="inspector-body"><Body refx={selection!} world={world!} /></div>
    </aside>
  );
}

function Body({ refx, world }: { refx: EntityRef; world: World }): React.ReactElement {
  switch (refx.kind) {
    case 'country': { const c = world.countries[refx.id]; return c ? <CountryView c={c} /> : <Missing />; }
    case 'city': { const c = world.cities[refx.id]; return c ? <CityView c={c} /> : <Missing />; }
    case 'region': { const r = world.regions?.[refx.id]; return r ? <RegionView r={r} /> : <Missing />; }
    case 'person': { const p = world.people[refx.id]; return p ? <PersonView p={p} /> : <Missing />; }
    case 'company': { const c = world.companies[refx.id]; return c ? <CompanyView c={c} /> : <Missing />; }
    case 'organization': { const o = world.organizations[refx.id]; return o ? <OrgView o={o} /> : <Missing />; }
    case 'outlet': { const o = world.outlets[refx.id]; return o ? <OutletView o={o} /> : <Missing />; }
    case 'event': { const e = world.events.find((x) => x.id === refx.id); return e ? <EventView ev={e} /> : <Missing />; }
  }
}

function Missing(): React.ReactElement { const t = useT(); return <div className="dim">{t('common.unknown')}</div>; }
function useRecentEvents(pred: (e: WorldEvent) => boolean, n = 6): WorldEvent[] {
  const world = useGame((s) => s.world)!; const version = useGame((s) => s.version);
  return useMemo(() => { const out: WorldEvent[] = []; for (let i = world.events.length - 1; i >= 0 && out.length < n; i--) if (pred(world.events[i])) out.push(world.events[i]); return out; }, [world, version, pred, n]);
}
function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }): React.ReactElement { return <div><div className="section-title">{title}{right}</div>{children}</div>; }
function Tabs<T extends string>({ tabs, tab, setTab }: { tabs: { id: T; label: string }[]; tab: T; setTab: (x: T) => void }): React.ReactElement {
  return <div className="tabs" role="tablist">{tabs.map((x) => <button key={x.id} role="tab" aria-selected={tab === x.id} className={tab === x.id ? 'active' : ''} data-tab={x.id} onClick={() => setTab(x.id)}>{x.label}</button>)}</div>;
}
function GodShortcut({ presetId, params, label }: { presetId: string; params: Record<string, string>; label: string }): React.ReactElement {
  const setScreen = useGame((s) => s.setScreen); const setPrefill = useGame((s) => s.setGodPrefill); const select = useGame((s) => s.select);
  return <button className="btn sm" style={{ borderColor: 'rgba(240,179,90,0.4)', color: 'var(--accent)' }} onClick={() => { setPrefill({ presetId, params }); setScreen('god'); if (window.innerWidth < 900) select(null); }}>✦ {label}</button>;
}
function Events({ list, empty }: { list: WorldEvent[]; empty?: string }): React.ReactElement { const t = useT(); return <div className="list">{list.map((e) => <EventCard key={e.id} ev={e} compact />)}{!list.length && <div className="dim">{empty ?? t('common.empty')}</div>}</div>; }
function HistoryList({ items, startYear }: { items: { day: number; text: string; eventId?: string }[]; startYear: number }): React.ReactElement {
  const select = useGame((s) => s.select); const t = useT();
  return <div className="list">{items.slice().reverse().slice(0, 14).map((h, i) => <div key={i} className="row" style={{ fontSize: 13, alignItems: 'flex-start' }}><span className="mono dim" style={{ width: 92, flexShrink: 0 }}>{formatDate(h.day, startYear, 'short')}</span><span className={h.eventId ? 'link' : ''} onClick={() => h.eventId && select({ kind: 'event', id: h.eventId })}>{h.text}</span></div>)}{!items.length && <div className="dim">{t('common.empty')}</div>}</div>;
}

// ---------------------------------------------------------------------------
type CTab = 'summary' | 'economy' | 'politics' | 'regions' | 'companies' | 'diplomacy' | 'society' | 'people' | 'history' | 'events';
function CountryView({ c }: { c: Country }): React.ReactElement {
  const t = useT(); const world = useGame((s) => s.world)!; const version = useGame((s) => s.version); const focusOn = useGame((s) => s.focusOn); const setScreen = useGame((s) => s.setScreen); const setOverlay = useGame((s) => s.setOverlay); const setLinks = useGame((s) => s.setLinks);
  const [tab, setTab] = useState<CTab>('summary');
  const leader = world.people[c.leaderId];
  const rank = useMemo(() => Object.values(world.countries).map((x) => ({ id: x.id, p: countryPower(x) })).sort((a, b) => b.p - a.p).findIndex((x) => x.id === c.id) + 1, [world, version, c.id]);
  const companies = useMemo(() => Object.values(world.companies).filter((x) => x.alive && x.countryId === c.id).sort((a, b) => b.value - a.value), [world, version, c.id]);
  const people = useMemo(() => Object.values(world.people).filter((p) => p.alive && p.countryId === c.id).sort((a, b) => b.influence - a.influence).slice(0, 12), [world, version, c.id]);
  const orgs = useMemo(() => Object.values(world.organizations).filter((o) => o.alive && o.countryId === c.id), [world, version, c.id]);
  const events = useRecentEvents((e) => e.location.countryId === c.id || e.actors.some((a) => a.kind === 'country' && a.id === c.id), 12);
  const idx = world.indexes[c.id];
  const tabs: { id: CTab; label: string }[] = (['summary', 'economy', 'politics', 'regions', 'companies', 'diplomacy', 'society', 'people', 'history', 'events'] as CTab[]).map((id) => ({ id, label: t(`tab.${id}`) }));
  return (
    <>
      <div className="hero">
        <Flag spec={c.flag} size="lg" />
        <div className="grow"><div className="title">{c.name}</div><div className="dim" style={{ fontSize: 12 }}>{govLabel(c.government)} · {ideoLabel(c.ideology)} · {t('stat.powerRank', { n: rank })}</div></div>
        <button className="btn icon sm" title={t('common.focus')} aria-label={t('common.focus')} onClick={() => { focusOn(c.centroid.x, c.centroid.y, 2.2); setScreen('world'); }}>◎</button>
      </div>
      {c.atWarWith.length > 0 && <div className="card" style={{ borderColor: 'rgba(255,77,77,0.5)', color: '#ffb3b3' }}>⚔ {t('country.atWar', { names: c.atWarWith.map((id) => world.countries[id]?.name).filter(Boolean).join(', ') })}</div>}
      <Tabs tabs={tabs} tab={tab} setTab={setTab} />
      {tab === 'summary' && <>
        <div className="stat-grid"><Stat k={t('stat.population')} v={fmtPop(c.population)} /><Stat k={t('stat.gdp')} v={fmtMoneyB(c.gdp)} sub={fmtPct(c.gdpGrowth)} /><Stat k={t('stat.stability')} v={c.stability.toFixed(0)} bar={c.stability} color={barColor(c.stability)} /><Stat k={t('stat.happiness')} v={c.happiness.toFixed(0)} bar={c.happiness} color={barColor(c.happiness)} /><Stat k={t('stat.approval')} v={`${c.approval.toFixed(0)}%`} bar={c.approval} /><Stat k={t('stat.unrest')} v={c.unrest.toFixed(0)} bar={c.unrest} color={barColor(100 - c.unrest)} /></div>
        {leader && <Section title={t('country.leader')}><EntityRow refx={{ kind: 'person', id: leader.id }} name={leader.name} sub={`${leader.title ?? profLabel(leader.profession)} · ${ideoLabel(leader.ideology)} · ${t('stat.approval').toLowerCase()} ${c.approval.toFixed(0)}%`} /><div className="dim" style={{ fontSize: 12, marginTop: 4 }}>{c.electionEvery ? `${t('country.electionsEvery', { n: c.electionEvery })} · ${t('country.nextElection', { year: c.nextElectionYear })}` : t('country.noElections')} · {t('country.capital').toLowerCase()} {world.cities[c.capitalId]?.name} · {t('country.language')} {c.culture.language}</div></Section>}
        <RelationChips c={c} />
        {companies.length > 0 && <Section title={t('country.topCompanies')}><div className="list">{companies.slice(0, 3).map((co) => <EntityRow key={co.id} refx={{ kind: 'company', id: co.id }} name={co.name} sub={sectorLabel(co.sector)} right={fmtMoneyB(co.value)} />)}</div></Section>}
        <Section title={t('country.recentEvents')}><Events list={events.slice(0, 4)} /></Section>
        <Section title={t('nav.god')}><div className="chips"><GodShortcut presetId="start-war" params={{ a: c.id }} label={t('god.group.conflict')} /><GodShortcut presetId="election" params={{ a: c.id }} label={t('politics.elections')} /><GodShortcut presetId="crisis" params={{ a: c.id }} label={t('cat.economic')} /><GodShortcut presetId="boom" params={{ a: c.id }} label={t('stat.growth')} /></div></Section>
      </>}
      {tab === 'economy' && <CountryEconomy c={c} companies={companies} idx={idx} />}
      {tab === 'politics' && <>
        <div className="stat-grid"><Stat k={t('country.government')} v={govLabel(c.government)} /><Stat k={t('country.ideology')} v={ideoLabel(c.ideology)} /><Stat k={t('stat.approval')} v={`${c.approval.toFixed(0)}%`} bar={c.approval} /><Stat k={t('stat.polarization')} v={c.polarization.toFixed(0)} bar={c.polarization} color={barColor(100 - c.polarization)} /><Stat k={t('stat.freedom')} v={c.freedom.toFixed(0)} bar={c.freedom} /><Stat k={t('stat.corruption')} v={c.corruption.toFixed(0)} bar={c.corruption} color={barColor(100 - c.corruption)} /></div>
        {leader && <Section title={t('country.leader')}><EntityRow refx={{ kind: 'person', id: leader.id }} name={leader.name} sub={`${leader.title ?? profLabel(leader.profession)} · ${ideoLabel(leader.ideology)}`} /></Section>}
        <div className="dim" style={{ fontSize: 12 }}>{c.electionEvery ? `${t('country.electionsEvery', { n: c.electionEvery })} · ${t('country.nextElection', { year: c.nextElectionYear })}` : t('country.noElections')}</div>
        {orgs.filter((o) => o.type === 'party' || o.type === 'movement').length > 0 && <Section title={t('country.movements')}><div className="list">{orgs.filter((o) => o.type === 'party' || o.type === 'movement').sort((a, b) => b.support - a.support).slice(0, 8).map((o) => <EntityRow key={o.id} refx={{ kind: 'organization', id: o.id }} name={o.name} sub={`${orgTypeLabel(o.type)}${o.ideology ? ` · ${ideoLabel(o.ideology)}` : ''}`} right={`${o.support.toFixed(0)}%`} />)}</div></Section>}
        <Section title={t('nav.god')}><div className="chips"><GodShortcut presetId="election" params={{ a: c.id }} label={t('politics.elections')} /><GodShortcut presetId="coup" params={{ a: c.id }} label={t('god.group.politics')} /><GodShortcut presetId="movement" params={{ a: c.id }} label={t('org.type.movement')} /></div></Section>
      </>}
      {tab === 'regions' && <RegionsList c={c} />}
      {tab === 'companies' && <Section title={t('tab.companies')} right={<span className="dim mono">{companies.length}</span>}><div className="list">{companies.slice(0, 30).map((co) => { const ch = pctChange(co.priceHistory, Math.min(co.priceHistory.length - 1, 30)); return <EntityRow key={co.id} refx={{ kind: 'company', id: co.id }} name={co.name} sub={`${sectorLabel(co.sector)} · ${fmtPop(co.employees)} ${t('stat.employees').toLowerCase()}`} right={<span className="trend" style={{ color: trendColor(ch) }}>{fmtMoneyB(co.value)} {trendArrow(ch)}</span>} />; })}{!companies.length && <div className="dim">{t('common.empty')}</div>}</div></Section>}
      {tab === 'diplomacy' && <>
        <div className="row"><button className="btn ghost sm" onClick={() => { setOverlay('diplomacy'); setLinks('all'); focusOn(c.centroid.x, c.centroid.y, 1.6); setScreen('world'); }}>{t('diplomacy.network', { name: c.name })}</button></div>
        <RelationGroups c={c} />
        <RelationGraph center={{ kind: 'country', id: c.id }} />
      </>}
      {tab === 'society' && <>
        <div className="stat-grid"><Stat k={t('stat.happiness')} v={c.happiness.toFixed(0)} bar={c.happiness} color={barColor(c.happiness)} /><Stat k={t('stat.unrest')} v={c.unrest.toFixed(0)} bar={c.unrest} color={barColor(100 - c.unrest)} /><Stat k={t('stat.polarization')} v={c.polarization.toFixed(0)} bar={c.polarization} /><Stat k={t('stat.freedom')} v={c.freedom.toFixed(0)} bar={c.freedom} /><Stat k={t('stat.technology')} v={c.technology.toFixed(0)} bar={c.technology} color="var(--data)" /><Stat k={t('stat.climateRisk')} v={c.climateRisk.toFixed(0)} bar={c.climateRisk} color={barColor(100 - c.climateRisk)} /></div>
        <div className="chips">{c.culture.values.map((v) => <span key={v} className="chip">{v}</span>)}<span className="chip dim">{c.culture.language}</span></div>
        {orgs.filter((o) => o.type === 'religion').length > 0 && <Section title={t('country.faiths')}><div className="list">{orgs.filter((o) => o.type === 'religion').map((o) => <EntityRow key={o.id} refx={{ kind: 'organization', id: o.id }} name={o.name} sub={orgTypeLabel(o.type)} right={`${o.support.toFixed(0)}%`} />)}</div></Section>}
        {orgs.filter((o) => o.type === 'movement' || o.type === 'union').length > 0 && <Section title={t('country.movements')}><div className="list">{orgs.filter((o) => o.type === 'movement' || o.type === 'union').sort((a, b) => b.support - a.support).map((o) => <EntityRow key={o.id} refx={{ kind: 'organization', id: o.id }} name={o.name} sub={o.agenda} right={`${o.support.toFixed(0)}%`} />)}</div></Section>}
      </>}
      {tab === 'people' && <div className="list">{people.map((p) => <EntityRow key={p.id} refx={{ kind: 'person', id: p.id }} name={p.name} sub={`${p.title ?? profLabel(p.profession)} · ${t('stat.influence').toLowerCase()} ${p.influence.toFixed(0)}`} />)}</div>}
      {tab === 'history' && <HistoryList items={c.history} startYear={world.meta.startYear} />}
      {tab === 'events' && <Events list={events} />}
    </>
  );
}

function RelationChips({ c }: { c: Country }): React.ReactElement | null {
  const t = useT(); const world = useGame((s) => s.world)!; const select = useGame((s) => s.select);
  const allies = c.alliances.map((id) => world.countries[id]).filter(Boolean); const enemies = Object.entries(c.relations).filter(([id, r]) => r <= -60 && world.countries[id]).map(([id]) => world.countries[id]);
  if (!allies.length && !enemies.length) return null;
  return <div className="row wrap" style={{ gap: 6 }}>{allies.slice(0, 4).map((o) => <button key={o.id} className="rel-chip clickable" style={{ color: 'var(--ok)', borderColor: 'rgba(88,214,141,0.4)' }} onClick={() => select({ kind: 'country', id: o.id })}>🤝 {o.name}</button>)}{enemies.slice(0, 4).map((o) => <button key={o.id} className="rel-chip clickable" style={{ color: 'var(--bad)', borderColor: 'rgba(255,93,93,0.4)' }} onClick={() => select({ kind: 'country', id: o.id })}>⚔ {o.name}</button>)}<span className="dim" style={{ fontSize: 11, alignSelf: 'center' }}>{t('country.allies')} / {t('country.enemies')}</span></div>;
}

function RelationGroups({ c }: { c: Country }): React.ReactElement {
  const t = useT(); const world = useGame((s) => s.world)!; const version = useGame((s) => s.version);
  const groups = useMemo(() => {
    const trade = new Set(tradeLinks(world, c).map((l) => l.partner.id));
    const rel = Object.entries(c.relations).map(([oid, score]) => { const o = world.countries[oid]; return o ? { o, score, b: relationBucket(score, c.atWarWith.includes(oid), c.alliances.includes(oid), trade.has(oid)) } : null; }).filter((x): x is NonNullable<typeof x> => !!x);
    return ['war', 'ally', 'enemy', 'rival', 'friendly', 'trade', 'neutral'].map((key) => ({ key, list: rel.filter((r) => r.b === key).sort((a, b) => Math.abs(b.score) - Math.abs(a.score)) })).filter((g) => g.list.length);
  }, [c, world, version]);
  return <>{groups.map((g) => <Section key={g.key} title={t(`crel.${g.key}`)} right={<span className="dim mono">{g.list.length}</span>}><div className="list">{g.list.slice(0, 8).map((r) => <EntityRow key={r.o.id} refx={{ kind: 'country', id: r.o.id }} name={r.o.name} sub={govLabel(r.o.government)} right={<span className="mono" style={{ color: relationColor(r.b) }}>{r.score > 0 ? '+' : ''}{r.score.toFixed(0)}</span>} />)}</div></Section>)}</>;
}

function CountryEconomy({ c, companies, idx }: { c: Country; companies: Company[]; idx?: { history: number[]; value: number } }): React.ReactElement {
  const t = useT(); const world = useGame((s) => s.world)!; const version = useGame((s) => s.version);
  const links = useMemo(() => tradeLinks(world, c).slice(0, 5), [world, version, c]);
  const share = tradeShare(world, c); const gdpPc = (c.gdp * 1e9) / Math.max(1, c.population);
  const income = c.gdp * (0.28 + c.technology / 500); const spending = income * (1 + Math.max(0, 2 - c.gdpGrowth) * 0.04 + (c.atWarWith.length ? 0.12 : 0));
  const volume = links.reduce((s, l) => s + l.volume, 0); const exports = volume * (0.45 + (c.technology - 50) / 400); const imports = volume - exports;
  const sectors = useMemo(() => { const m = new Map<string, number>(); for (const co of companies) m.set(co.sector, (m.get(co.sector) ?? 0) + co.value); return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4); }, [companies]);
  const resources = Object.entries(c.resources).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const mk = idx ? pctChange(idx.history, Math.min(idx.history.length - 1, 30)) : 0;
  const confidence = Math.round((c.stability * 0.4 + c.approval * 0.2 + (50 + c.gdpGrowth * 8) * 0.4));
  return (
    <>
      <div className="stat-grid"><Stat k={t('stat.gdp')} v={fmtMoneyB(c.gdp)} sub={`${trendArrow(c.gdpGrowth - 1.5, 0.3)} ${fmtPct(c.gdpGrowth)}`} /><Stat k={t('stat.gdpPc')} v={`$${(gdpPc / 1000).toFixed(1)}k`} /><Stat k={t('stat.growth')} v={fmtPct(c.gdpGrowth)} color={trendColor(c.gdpGrowth - 1.5, 0.3)} /><Stat k={t('stat.inflation')} v={`${c.inflation.toFixed(1)}%`} color={c.inflation > 8 ? 'var(--bad)' : undefined} /><Stat k={t('stat.unemployment')} v={`${c.unemployment.toFixed(1)}%`} color={c.unemployment > 12 ? 'var(--bad)' : undefined} /><Stat k={t('stat.debt')} v={`${c.debt.toFixed(0)}%`} bar={Math.min(100, c.debt / 2)} color={barColor(100 - Math.min(100, c.debt / 2))} /></div>
      <dl className="kv"><dt>{t('stat.income')}</dt><dd className="mono">{fmtMoneyB(income)}</dd><dt>{t('stat.spending')}</dt><dd className="mono" style={{ color: spending > income ? 'var(--warn)' : 'var(--ok)' }}>{fmtMoneyB(spending)}</dd><dt>{t('stat.exports')}</dt><dd className="mono">{fmtMoneyB(exports)}</dd><dt>{t('stat.imports')}</dt><dd className="mono">{fmtMoneyB(imports)}</dd><dt>{t('stat.balance')}</dt><dd className="mono" style={{ color: trendColor(exports - imports, 1) }}>{trendArrow(exports - imports, 1)} {fmtMoneyB(Math.abs(exports - imports))}</dd><dt>{t('stat.trade')}</dt><dd>{t('stat.tradeShare', { pct: (share * 100).toFixed(0) })}</dd><dt>{t('stat.confidence')}</dt><dd className="mono" style={{ color: barColor(confidence) }}>{confidence}</dd></dl>
      <div className="dim" style={{ fontSize: 11 }}>{t('stat.approx')}</div>
      {idx && <Section title={t('stat.marketIndex')} right={<span className="trend" style={{ color: trendColor(mk) }}>{trendArrow(mk)} {fmtPct(mk)} · {t('stat.trend30')}</span>}><Sparkline data={idx.history.slice(-90)} width={360} height={44} /></Section>}
      <Section title={t('stat.industries')}><div className="chips">{sectors.map(([s, v]) => <span key={s} className="chip">{sectorLabel(s)} <span className="dim">{fmtMoneyB(v)}</span></span>)}{!sectors.length && <span className="dim">{t('common.empty')}</span>}</div></Section>
      <Section title={t('stat.resources')}><div className="chips">{resources.map(([r, v]) => <span key={r} className="chip">{resLabel(r)} <span className="mono dim">{v.toFixed(0)}</span></span>)}</div></Section>
      <Section title={t('country.partners')}>{links.length ? <div className="list">{links.map(({ partner, volume: v }) => <EntityRow key={partner.id} refx={{ kind: 'country', id: partner.id }} name={partner.name} sub={`${fmtMoneyB(v)} ${t('common.perYear')}${c.atWarWith.includes(partner.id) ? ' · ⚔' : c.alliances.includes(partner.id) ? ` · ${t('crel.ally')}` : ''}`} />)}</div> : <div className="dim">{t('country.noTrade')}{c.tradePartners.length ? ` — ${t('country.tradeCut')}` : ''}.</div>}</Section>
      {companies.length > 0 && <Section title={t('country.topCompanies')}><div className="list">{companies.slice(0, 5).map((co) => <EntityRow key={co.id} refx={{ kind: 'company', id: co.id }} name={co.name} sub={sectorLabel(co.sector)} right={fmtMoneyB(co.value)} />)}</div></Section>}
    </>
  );
}

function RegionsList({ c }: { c: Country }): React.ReactElement {
  const t = useT(); const world = useGame((s) => s.world)!; const focusOn = useGame((s) => s.focusOn); const setScreen = useGame((s) => s.setScreen); const setOverlay = useGame((s) => s.setOverlay);
  const regions = regionsOf(world, c).sort((x, y) => y.unrest - x.unrest);
  return (
    <Section title={t('tab.regions')} right={<span className="row" style={{ gap: 8 }}><span className="dim mono">{regions.length}</span><button className="btn ghost sm" onClick={() => { setOverlay('regions'); focusOn(c.centroid.x, c.centroid.y, 2.2); setScreen('world'); }}>{t('country.showRegions')}</button></span>}>
      <div className="dim" style={{ fontSize: 12, marginBottom: 6 }}>{t('country.regionsIntro')}</div>
      <div className="list">{regions.map((r) => { const cap = r.cityIds.includes(c.capitalId); const gov = r.governorId ? world.people[r.governorId] : undefined; const mood = r.unrest > 60 ? 'angry' : r.unrest > 35 ? 'restless' : 'calm'; return (
        <div key={r.id} className="entity-row" onClick={() => useGame.getState().select({ kind: 'region', id: r.id })} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') useGame.getState().select({ kind: 'region', id: r.id }); }}>
          <div className="grow"><div>{r.name}{cap && <span className="tag" style={{ color: 'var(--accent)' }}>{t('common.capital')}</span>}{r.autonomy >= 50 && <span className="tag">{t('region.autonomous')}</span>}</div><div className="dim" style={{ fontSize: 12 }}>{r.cityIds.length} {t('stat.citiesN')} · {fmtPop(regionStats(world, r).population)} · {t(`region.mood.${mood}`)}{gov ? ` · ${gov.name}` : ''}</div></div>
          <div style={{ minWidth: 72, textAlign: 'right' }}><div className="mono" style={{ fontSize: 12, color: barColor(100 - r.unrest) }}>{t('stat.unrest').toLowerCase()} {r.unrest.toFixed(0)}</div><div className="bar" style={{ marginTop: 4 }}><i style={{ width: `${r.unrest}%`, background: barColor(100 - r.unrest) }} /></div></div>
        </div>); })}</div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
function RegionView({ r }: { r: Region }): React.ReactElement {
  const t = useT(); const world = useGame((s) => s.world)!; const focusOn = useGame((s) => s.focusOn); const setScreen = useGame((s) => s.setScreen); const version = useGame((s) => s.version);
  const country = world.countries[r.countryId]; const gov = r.governorId ? world.people[r.governorId] : undefined;
  const cities = r.cityIds.map((id) => world.cities[id]).filter(Boolean).sort((a, b) => b.population - a.population);
  const stats = regionStats(world, r); const isCapital = !!country && r.cityIds.includes(country.capitalId);
  const events = useMemo(() => world.events.filter((e) => e.data?.regionId === r.id || (e.location.cityId && r.cityIds.includes(e.location.cityId) && e.severity >= 3)).slice(-8).reverse(), [world, version, r.id]);
  const companies = useMemo(() => Object.values(world.companies).filter((x) => x.alive && r.cityIds.includes(x.cityId)).sort((a, b) => b.value - a.value).slice(0, 5), [world, version, r.id]);
  const movements = useMemo(() => Object.values(world.organizations).filter((o) => o.alive && o.countryId === r.countryId && o.agenda === 'independence' && o.name.toLowerCase().includes(r.name.toLowerCase().split(' ')[0])), [world, version, r]);
  const centre = cities.length ? { x: cities.reduce((s, c) => s + c.x, 0) / cities.length, y: cities.reduce((s, c) => s + c.y, 0) / cities.length } : country?.centroid ?? { x: 0, y: 0 };
  const mood = r.unrest > 60 ? 'angry' : r.unrest > 35 ? 'restless' : 'calm';
  const relation = r.unrest > 60 ? 'hostile' : r.unrest > 35 || r.autonomy < 10 && r.identity > 0.5 ? 'tense' : 'loyal';
  const faith = useMemo(() => Object.values(world.organizations).filter((o) => o.alive && o.type === 'religion' && o.countryId === r.countryId).sort((a, b) => b.support - a.support)[0], [world, version, r.countryId]);
  return (
    <>
      <div className="hero">
        <span className="avatar" style={{ background: 'rgba(240,179,90,0.15)', color: 'var(--accent)', width: 40, height: 40, fontSize: 18 }}>▦</span>
        <div className="grow"><div className="title">{r.name} {isCapital && <span className="tag" style={{ color: 'var(--accent)' }}>{t('region.capitalRegion')}</span>} {r.autonomy >= 50 && <span className="tag">{t('region.autonomous')}</span>}</div><div className="dim" style={{ fontSize: 12 }}>{t('region.of', { country: country?.name ?? '?' })} · {cities.length} {t('stat.citiesN')} · {t(`region.mood.${mood}`)}</div></div>
        <button className="btn icon sm" title={t('common.focus')} aria-label={t('common.focus')} onClick={() => { useGame.getState().setOverlay('regions'); focusOn(centre.x, centre.y, 3); setScreen('world'); }}>◎</button>
      </div>
      <div className="stat-grid"><Stat k={t('stat.population')} v={fmtPop(stats.population)} /><Stat k={t('stat.prosperity')} v={stats.prosperity.toFixed(0)} bar={stats.prosperity} /><Stat k={t('stat.unrest')} v={r.unrest.toFixed(0)} bar={r.unrest} color={barColor(100 - r.unrest)} /><Stat k={t('stat.identity')} v={`${(r.identity * 100).toFixed(0)}%`} bar={r.identity * 100} /><Stat k={t('stat.autonomy')} v={r.autonomy.toFixed(0)} bar={r.autonomy} /><Stat k={t('region.relation')} v={t(`region.relation.${relation}`)} color={relation === 'hostile' ? 'var(--bad)' : relation === 'tense' ? 'var(--warn)' : 'var(--ok)'} /></div>
      {country && <EntityRow refx={{ kind: 'country', id: country.id }} name={country.name} sub={`${govLabel(country.government)} · ${t('stat.stability').toLowerCase()} ${country.stability.toFixed(0)}`} />}
      {gov && <Section title={t('region.governor')}><EntityRow refx={{ kind: 'person', id: gov.id }} name={gov.name} sub={`${ideoLabel(gov.ideology)} · ${t('region.wants', { objective: gov.objective })}`} /></Section>}
      {faith && <div className="dim" style={{ fontSize: 12 }}>{t('tab.religion')}: <span className="link" onClick={() => useGame.getState().select({ kind: 'organization', id: faith.id })}>{faith.name}</span> · {country?.culture.language}</div>}
      <Section title={t('region.cities')}><div className="list">{cities.map((c) => <EntityRow key={c.id} refx={{ kind: 'city', id: c.id }} name={c.name} sub={`${fmtPop(c.population)} · ${t('stat.prosperity').toLowerCase()} ${c.prosperity.toFixed(0)}${c.capital ? ` · ${t('common.capital')}` : ''}`} />)}</div></Section>
      {companies.length > 0 && <Section title={t('tab.companies')}><div className="list">{companies.map((co) => <EntityRow key={co.id} refx={{ kind: 'company', id: co.id }} name={co.name} sub={sectorLabel(co.sector)} right={fmtMoneyB(co.value)} />)}</div></Section>}
      {movements.length > 0 && <Section title={t('region.movements')}><div className="list">{movements.map((o) => <EntityRow key={o.id} refx={{ kind: 'organization', id: o.id }} name={o.name} sub={o.agenda} right={`${o.support.toFixed(0)}%`} />)}</div></Section>}
      {r.history.length > 0 && <Section title={t('region.story')}><HistoryList items={r.history} startYear={world.meta.startYear} /></Section>}
      <Section title={t('region.eventsHere')}><Events list={events} /></Section>
    </>
  );
}

function CityView({ c }: { c: City }): React.ReactElement {
  const t = useT(); const world = useGame((s) => s.world)!; const focusOn = useGame((s) => s.focusOn); const setScreen = useGame((s) => s.setScreen);
  const country = world.countries[c.countryId]; const region = regionOf(world, c.id);
  const people = Object.values(world.people).filter((p) => p.alive && p.cityId === c.id).sort((a, b) => b.fame - a.fame).slice(0, 6);
  const companies = Object.values(world.companies).filter((x) => x.alive && x.cityId === c.id).sort((a, b) => b.value - a.value).slice(0, 5);
  const events = useRecentEvents((e) => e.location.cityId === c.id);
  return (
    <>
      <div className="hero"><span className="avatar" style={{ background: 'rgba(143,211,255,0.15)', color: 'var(--data)', width: 40, height: 40 }}>◉</span><div className="grow"><div className="title">{c.name} {c.capital && <span className="tag" style={{ color: 'var(--accent)' }}>{t('common.capital')}</span>}</div><div className="dim" style={{ fontSize: 12 }}>{country?.name}{region ? <> · <span className="link" onClick={() => useGame.getState().select({ kind: 'region', id: region.id })}>{region.name}</span></> : ''} · {c.coastal ? t('common.coastal') : t('common.inland')} · {c.specialties.map(sectorLabel).join(', ')}</div></div><button className="btn icon sm" aria-label={t('common.focus')} onClick={() => { focusOn(c.x, c.y, 4); setScreen('world'); }}>◎</button></div>
      <div className="stat-grid"><Stat k={t('stat.population')} v={fmtPop(c.population)} /><Stat k={t('stat.prosperity')} v={c.prosperity.toFixed(0)} bar={c.prosperity} /><Stat k={t('stat.unrest')} v={c.unrest.toFixed(0)} bar={c.unrest} color={barColor(100 - c.unrest)} /></div>
      {country && <EntityRow refx={{ kind: 'country', id: country.id }} name={country.name} sub={`${govLabel(country.government)} · ${t('stat.stability').toLowerCase()} ${country.stability.toFixed(0)}`} />}
      {people.length > 0 && <Section title={t('city.peopleHere')}><div className="list">{people.map((p) => <EntityRow key={p.id} refx={{ kind: 'person', id: p.id }} name={p.name} sub={p.title ?? profLabel(p.profession)} />)}</div></Section>}
      {companies.length > 0 && <Section title={t('city.companiesHere')}><div className="list">{companies.map((co) => <EntityRow key={co.id} refx={{ kind: 'company', id: co.id }} name={co.name} sub={sectorLabel(co.sector)} right={fmtMoneyB(co.value)} />)}</div></Section>}
      <Section title={t('country.recentEvents')}><Events list={events} /></Section>
    </>
  );
}

// ---------------------------------------------------------------------------
type PTab = 'summary' | 'relations' | 'career' | 'events' | 'opinion';
function PersonView({ p }: { p: Person }): React.ReactElement {
  const t = useT(); const world = useGame((s) => s.world)!; const version = useGame((s) => s.version);
  const country = world.countries[p.countryId]; const city = world.cities[p.cityId];
  const affil = p.affiliations.map((id) => (world.companies[id] ? { kind: 'company' as const, id, name: world.companies[id].name, sub: sectorLabel(world.companies[id].sector) } : world.organizations[id] ? { kind: 'organization' as const, id, name: world.organizations[id].name, sub: orgTypeLabel(world.organizations[id].type) } : null)).filter(Boolean) as { kind: 'company' | 'organization'; id: string; name: string; sub: string }[];
  const events = useRecentEvents((e) => e.actors.some((a) => a.kind === 'person' && a.id === p.id), 10);
  const posts = useMemo(() => world.social.filter((s) => s.authorId === p.id).slice(-4).reverse(), [world, version, p.id]);
  const sentiment = useMemo(() => sentimentFor(world, p.id), [world, version, p.id]);
  const [tab, setTab] = useState<PTab>('summary');
  const isLeader = country?.leaderId === p.id; const company = Object.values(world.companies).find((c) => c.ceoId === p.id && c.alive);
  const region = regionOf(world, p.cityId);
  const tabs: { id: PTab; label: string }[] = [{ id: 'summary', label: t('tab.summary') }, { id: 'relations', label: t('tab.relations') }, { id: 'career', label: t('tab.career') }, { id: 'events', label: t('tab.events') }, { id: 'opinion', label: t('tab.opinion') }];
  return (
    <>
      <div className="hero"><Avatar name={p.name} id={p.id} size="lg" alive={p.alive} /><div className="grow"><div className="title">{p.name} {!p.alive && <span className="tag" style={{ color: 'var(--bad)' }}>{t('common.dead')}</span>}{p.retired && <span className="tag dim">{t('common.retired')}</span>}</div><div className="dim" style={{ fontSize: 12 }}>{p.title ?? profLabel(p.profession)} · {ageOf(p.birthDay, world.day)} {t('common.age')} · {country?.name}</div></div></div>
      <Tabs tabs={tabs} tab={tab} setTab={setTab} />
      {tab === 'summary' && <>
        <div className="stat-grid"><Stat k={t('stat.influence')} v={p.influence.toFixed(0)} bar={p.influence} color="var(--cat-political)" /><Stat k={t('stat.fame')} v={p.fame.toFixed(0)} bar={p.fame} color="var(--cat-cultural)" /><Stat k={t('stat.wealth')} v={p.wealth >= 1000 ? `$${(p.wealth / 1000).toFixed(1)}B` : `$${p.wealth.toFixed(1)}M`} /><Stat k={t('stat.reputation')} v={p.reputation.toFixed(0)} bar={(p.reputation + 100) / 2} color={p.reputation < -20 ? 'var(--bad)' : p.reputation > 20 ? 'var(--ok)' : 'var(--warn)'} /></div>
        <dl className="kv"><dt>{t('person.position')}</dt><dd>{isLeader ? t('person.leaderOf', { country: country?.name ?? '' }) : p.title ?? (company ? `${t('company.ceo')} · ${company.name}` : profLabel(p.profession))}</dd><dt>{t('person.objective')}</dt><dd>{p.objective}{p.history.some((h) => h.text.startsWith('Persuaded by an interviewer')) ? ` ✦ ${t('person.tookToHeart')}` : ''}</dd><dt>{t('country.ideology')}</dt><dd>{ideoLabel(p.ideology)} · {p.traits.join(', ')}</dd></dl>
        <Section title={t('person.ties')}><div className="list">{country && <EntityRow refx={{ kind: 'country', id: country.id }} name={country.name} sub={isLeader ? t('person.leaderOf', { country: country.name }) : t('person.citizen')} />}{region && <EntityRow refx={{ kind: 'region', id: region.id }} name={region.name} sub={t('entity.region')} />}{city && <EntityRow refx={{ kind: 'city', id: city.id }} name={city.name} sub={t('city.livesHere')} />}{affil.map((a) => <EntityRow key={a.id} refx={{ kind: a.kind, id: a.id }} name={a.name} sub={a.sub} />)}</div></Section>
        <Dialogue p={p} />
        <Section title={t('nav.god')}><div className="chips"><GodShortcut presetId="scandal" params={{ p: p.id }} label={t('cat.political')} /><GodShortcut presetId="remove-figure" params={{ p: p.id }} label={t('common.dismiss')} />{country && !isLeader && <GodShortcut presetId="figure" params={{ a: country.id }} label={t('rel.rival')} />}</div></Section>
      </>}
      {tab === 'relations' && <>
        <div className="list">{p.relationships.slice(0, 14).map((r) => { const o = world.people[r.target.id]; if (!o) return null; const col = r.strength > 0.3 ? 'var(--ok)' : r.strength < -0.3 ? 'var(--bad)' : 'var(--text-3)'; return <EntityRow key={r.target.id} refx={{ kind: 'person', id: o.id }} name={o.name} sub={`${relLabel(r.type)} · ${o.title ?? profLabel(o.profession)}`} right={<span className="mono" style={{ color: col }}>{r.strength > 0 ? '+' : ''}{(r.strength * 100).toFixed(0)}</span>} />; })}{!p.relationships.length && <div className="dim">{t('person.noRelations')}</div>}</div>
        <RelationGraph center={{ kind: 'person', id: p.id }} />
      </>}
      {tab === 'career' && <><Section title={t('person.lifeStory')}><HistoryList items={p.history} startYear={world.meta.startYear} /></Section>{p.memories.length > 0 && <Section title={t('person.memories')}><div className="dim" style={{ fontSize: 12 }}>{p.memories.slice(-5).reverse().map((m) => m.text).join(' · ')}</div></Section>}</>}
      {tab === 'events' && <Events list={events} />}
      {tab === 'opinion' && <>
        <div className="stat-grid"><Stat k={t('person.publicOpinion')} v={`${sentiment >= 0 ? '+' : ''}${(sentiment * 100).toFixed(0)}`} bar={(sentiment + 1) * 50} color={sentiment < -0.2 ? 'var(--bad)' : sentiment > 0.2 ? 'var(--ok)' : 'var(--warn)'} /><Stat k={t('stat.reputation')} v={p.reputation.toFixed(0)} bar={(p.reputation + 100) / 2} /></div>
        {p.profession === 'journalist' && (() => { const arts = world.news.filter((n) => n.authorId === p.id).slice(-5).reverse(); return arts.length ? <Section title={t('news.byline', { name: p.firstName })}><div className="list">{arts.map((a) => <div key={a.id} className="card clickable" onClick={() => useGame.getState().select({ kind: 'event', id: a.eventId })}><div style={{ fontFamily: 'var(--font-serif)', fontWeight: 700 }}>{a.headline}</div><div className="dim" style={{ fontSize: 11 }}>{daysAgo(a.day, world.day)}</div></div>)}</div></Section> : null; })()}
        {posts.length > 0 && <Section title={t('social.feed')}><div className="panel-solid" style={{ overflow: 'hidden' }}>{posts.map((s) => <Post key={s.id} post={s} />)}</div></Section>}
        {!posts.length && <div className="dim">{t('common.empty')}</div>}
      </>}
    </>
  );
}

// ---------------------------------------------------------------------------
type CoTab = 'summary' | 'finance' | 'network' | 'events';
function CompanyView({ c }: { c: Company }): React.ReactElement {
  const t = useT(); const world = useGame((s) => s.world)!; const version = useGame((s) => s.version);
  const ceo = world.people[c.ceoId]; const founder = c.founderId ? world.people[c.founderId] : undefined; const country = world.countries[c.countryId]; const city = world.cities[c.cityId];
  const events = useRecentEvents((e) => e.actors.some((a) => a.kind === 'company' && a.id === c.id), 10);
  const rivals = useMemo(() => Object.values(world.companies).filter((x) => x.alive && x.sector === c.sector && x.id !== c.id).sort((a, b) => b.value - a.value).slice(0, 4), [world, version, c]);
  const partners = useMemo(() => { const ids = new Set<string>(); for (const e of world.events) if ((e.type === 'partnership' || e.type === 'fair.venture' || e.type === 'merger') && e.actors.some((a) => a.kind === 'company' && a.id === c.id)) for (const a of e.actors) if (a.kind === 'company' && a.id !== c.id) ids.add(a.id); return Array.from(ids).map((id) => world.companies[id]).filter((x) => x && x.alive).slice(0, 5); }, [world, version, c.id]);
  const rank = useMemo(() => Object.values(world.companies).filter((x) => x.alive).sort((a, b) => b.value - a.value).findIndex((x) => x.id === c.id) + 1, [world, version, c.id]);
  const ch7 = pctChange(c.priceHistory, Math.min(c.priceHistory.length - 1, 7)); const ch30 = pctChange(c.priceHistory, Math.min(c.priceHistory.length - 1, 30));
  const techLevel = Math.round(((country?.technology ?? 50) * 0.6 + (c.sector === 'technology' || c.sector === 'biotech' || c.sector === 'aerospace' ? 30 : 15) + Math.max(0, c.growth) * 2));
  const govRel = country ? (c.value > 500 && country.corruption > 55 ? 'close' : c.reputation < -20 ? 'hostile' : 'normal') : 'normal';
  const [tab, setTab] = useState<CoTab>('summary');
  const tabs: { id: CoTab; label: string }[] = [{ id: 'summary', label: t('tab.summary') }, { id: 'finance', label: t('tab.finance') }, { id: 'network', label: t('tab.network') }, { id: 'events', label: t('tab.events') }];
  return (
    <>
      <div className="hero"><span className="avatar lg" style={{ background: 'rgba(96,165,250,0.18)', color: '#9cc4ff', fontSize: 13 }}>{c.ticker}</span><div className="grow"><div className="title">{c.name} {!c.alive && <span className="tag" style={{ color: 'var(--bad)' }}>{t('company.bankrupt')}</span>}</div><div className="dim" style={{ fontSize: 12 }}>{sectorLabel(c.sector)} · {city?.name}, {country?.name} · {t('company.rank', { n: rank })}</div></div></div>
      <p className="muted" style={{ fontSize: 13 }}>{c.description.charAt(0).toUpperCase() + c.description.slice(1)}.</p>
      <Tabs tabs={tabs} tab={tab} setTab={setTab} />
      {tab === 'summary' && <>
        <div className="stat-grid"><Stat k={t('stat.value')} v={fmtMoneyB(c.value)} sub={`${trendArrow(ch30)} ${fmtPct(ch30)} · ${t('stat.trend30')}`} /><Stat k={t('stat.revenueApprox')} v={fmtMoneyB(c.revenue)} /><Stat k={t('stat.employees')} v={fmtPop(c.employees)} /><Stat k={t('stat.reputation')} v={c.reputation.toFixed(0)} bar={(c.reputation + 100) / 2} color={c.reputation < -20 ? 'var(--bad)' : 'var(--ok)'} /><Stat k={t('company.techLevel')} v={String(Math.min(100, techLevel))} bar={Math.min(100, techLevel)} color="var(--data)" /><Stat k={t('company.trend')} v={`${trendArrow(ch7)} ${fmtPct(ch7)}`} color={trendColor(ch7)} /></div>
        <Section title={t('country.leader')}><div className="list">{ceo && <EntityRow refx={{ kind: 'person', id: ceo.id }} name={ceo.name} sub={t('company.ceo')} />}{founder && founder.id !== ceo?.id && <EntityRow refx={{ kind: 'person', id: founder.id }} name={founder.name} sub={t('stat.founded')} />}{country && <EntityRow refx={{ kind: 'country', id: country.id }} name={country.name} sub={`${t('company.hq')} · ${city?.name ?? ''}`} />}</div></Section>
        <dl className="kv"><dt>{t('company.government')}</dt><dd>{govRel === 'close' ? t('crel.friendly') : govRel === 'hostile' ? t('crel.rival') : t('crel.neutral')}</dd><dt>{t('stat.founded')}</dt><dd>{yearOf(c.founded, world.meta.startYear)}</dd></dl>
        <Section title={t('nav.god')}><div className="chips"><GodShortcut presetId="breakthrough" params={{ co: c.id }} label={t('cat.technological')} /><GodShortcut presetId="bankrupt" params={{ co: c.id }} label={t('company.bankrupt')} /></div></Section>
      </>}
      {tab === 'finance' && <>
        <LineChart data={c.priceHistory} height={120} label={(v) => fmtMoneyB(v)} />
        <div className="stat-grid"><Stat k={t('stat.growth')} v={fmtPct(c.growth)} color={trendColor(c.growth)} /><Stat k={t('stat.volatility')} v={`${(c.volatility * 100).toFixed(0)}%`} /><Stat k={t('stat.revenue')} v={fmtMoneyB(c.revenue)} /><Stat k={t('company.impact')} v={fmtPct(ch30)} color={trendColor(ch30)} /></div>
        <div className="dim" style={{ fontSize: 11 }}>{t('stat.approx')}</div>
      </>}
      {tab === 'network' && <>
        {rivals.length > 0 && <Section title={t('company.competitors')}><div className="list">{rivals.map((r) => <EntityRow key={r.id} refx={{ kind: 'company', id: r.id }} name={r.name} sub={world.countries[r.countryId]?.name} right={fmtMoneyB(r.value)} />)}</div></Section>}
        {partners.length > 0 && <Section title={t('company.partners')}><div className="list">{partners.map((r) => <EntityRow key={r.id} refx={{ kind: 'company', id: r.id }} name={r.name} sub={sectorLabel(r.sector)} right={fmtMoneyB(r.value)} />)}</div></Section>}
        <RelationGraph center={{ kind: 'company', id: c.id }} />
      </>}
      {tab === 'events' && <><Section title={t('company.milestones')}><HistoryList items={events.map((e) => ({ day: e.day, text: renderEvent(e, world).title, eventId: e.id })).reverse()} startYear={world.meta.startYear} /></Section><Events list={events} /></>}
    </>
  );
}

function OrgView({ o }: { o: Organization }): React.ReactElement {
  const t = useT(); const world = useGame((s) => s.world)!;
  const leader = o.leaderId ? world.people[o.leaderId] : undefined; const country = o.countryId ? world.countries[o.countryId] : undefined;
  const events = useRecentEvents((e) => e.actors.some((a) => a.kind === 'organization' && a.id === o.id), 8);
  const members = o.memberIds.map((id) => world.countries[id] ? { kind: 'country' as const, id, name: world.countries[id].name } : world.people[id] ? { kind: 'person' as const, id, name: world.people[id].name } : null).filter(Boolean) as { kind: 'country' | 'person'; id: string; name: string }[];
  const [tab, setTab] = useState<'summary' | 'network'>('summary');
  return (
    <>
      <div className="hero"><span className="avatar lg" style={{ background: 'rgba(167,139,250,0.18)', color: '#c9b8ff' }}>⌘</span><div className="grow"><div className="title">{o.name} {!o.alive && <span className="tag" style={{ color: 'var(--bad)' }}>†</span>}</div><div className="dim" style={{ fontSize: 12 }}>{orgTypeLabel(o.type)}{o.ideology ? ` · ${ideoLabel(o.ideology)}` : ''} · {country?.name ?? t('org.type.international')}</div></div></div>
      <p className="muted" style={{ fontSize: 13 }}>{t('org.agenda')}: <b>{o.agenda}</b></p>
      <Tabs tabs={[{ id: 'summary' as const, label: t('tab.summary') }, { id: 'network' as const, label: t('tab.network') }]} tab={tab} setTab={setTab} />
      {tab === 'network' && <RelationGraph center={{ kind: 'organization', id: o.id }} />}
      {tab === 'summary' && <>
        <div className="stat-grid"><Stat k={t('stat.influence')} v={o.influence.toFixed(0)} bar={o.influence} color="var(--cat-political)" /><Stat k={t('stat.support')} v={`${o.support.toFixed(0)}%`} bar={o.support} /><Stat k={t('stat.founded')} v={String(yearOf(o.founded, world.meta.startYear))} /></div>
        <Section title={t('org.leader')}><div className="list">{leader && <EntityRow refx={{ kind: 'person', id: leader.id }} name={leader.name} sub={t('org.leader')} />}{country && <EntityRow refx={{ kind: 'country', id: country.id }} name={country.name} sub={t('org.based')} />}{members.filter((m) => m.id !== o.leaderId).slice(0, 8).map((m) => <EntityRow key={m.id} refx={{ kind: m.kind, id: m.id }} name={m.name} sub={t('rel.member')} />)}</div></Section>
        <Section title={t('tab.events')}><Events list={events} /></Section>
      </>}
    </>
  );
}

function OutletView({ o }: { o: MediaOutlet }): React.ReactElement {
  const t = useT(); const world = useGame((s) => s.world)!; const version = useGame((s) => s.version); const select = useGame((s) => s.select);
  const articles = useMemo(() => world.news.filter((n) => n.outletId === o.id).slice(-8).reverse(), [world, version, o.id]);
  const country = o.countryId ? world.countries[o.countryId] : undefined;
  return (
    <>
      <div className="hero"><span className="avatar lg" style={{ background: o.color, color: '#111', fontFamily: 'var(--font-serif)' }}>N</span><div className="grow"><div className="outlet-name" style={{ fontSize: 18 }}>{o.name}</div><div className="dim" style={{ fontSize: 12 }}>“{o.motto}” · {t(`news.bias.${o.bias}`)} · {country?.name ?? t('org.type.international')}</div></div></div>
      <div className="stat-grid"><Stat k={t('stat.population')} v={`${o.audience.toFixed(1)}M`} /><Stat k={t('stat.reputation')} v={o.credibility.toFixed(0)} bar={o.credibility} /><Stat k={t('panel.news')} v={String(world.news.filter((n) => n.outletId === o.id).length)} /></div>
      <Section title={t('panel.news')}><div className="list">{articles.map((a) => <div key={a.id} className="card clickable" onClick={() => select({ kind: 'event', id: a.eventId })}><div style={{ fontFamily: 'var(--font-serif)', fontWeight: 700 }}>{a.headline}</div><div className="dim" style={{ fontSize: 11 }}>{daysAgo(a.day, world.day)}</div></div>)}</div></Section>
    </>
  );
}

// ---------------------------------------------------------------------------
const ECON_FIELDS = new Set(['gdp', 'gdpGrowth', 'inflation', 'unemployment', 'debt', 'value', 'revenue', 'growth', 'prosperity', 'population']);
function EventView({ ev }: { ev: WorldEvent }): React.ReactElement {
  const t = useT(); const world = useGame((s) => s.world)!; const version = useGame((s) => s.version); const select = useGame((s) => s.select); const focusOn = useGame((s) => s.focusOn); const setScreen = useGame((s) => s.setScreen);
  const chain = useMemo(() => { const up: WorldEvent[] = []; let cur = ev; let guard = 0; while (typeof cur.causedBy === 'string' && cur.causedBy.startsWith('ev_') && guard++ < 12) { const p = world.events.find((e) => e.id === cur.causedBy); if (!p) break; up.unshift(p); cur = p; } return up; }, [world, version, ev]);
  const consequences = useMemo(() => ev.consequences.map((id) => world.events.find((e) => e.id === id)).filter(Boolean) as WorldEvent[], [world, version, ev]);
  const later = useMemo(() => consequences.flatMap((c) => c.consequences.map((id) => world.events.find((e) => e.id === id)).filter(Boolean) as WorldEvent[]).slice(0, 6), [consequences, world, version]);
  const pendingCount = world.pending.filter((p) => p.sourceEventId === ev.id).length;
  const articles = useMemo(() => world.news.filter((n) => n.eventId === ev.id).slice(0, 5), [world, version, ev.id]);
  const posts = useMemo(() => world.social.filter((s) => s.eventId === ev.id && !s.replyTo).sort((a, b) => b.likes - a.likes).slice(0, 4), [world, version, ev.id]);
  const total = countConsequences(world, ev.id);
  const r = renderEvent(ev, world);
  const nameOf = (x: EntityRef): string => { const e = x.kind === 'person' ? world.people[x.id] : x.kind === 'country' ? world.countries[x.id] : x.kind === 'company' ? world.companies[x.id] : x.kind === 'organization' ? world.organizations[x.id] : x.kind === 'city' ? world.cities[x.id] : x.kind === 'region' ? world.regions?.[x.id] : undefined; return (e as { name?: string } | undefined)?.name ?? '?'; };
  const econ = ev.effects.filter((e) => ECON_FIELDS.has(e.field)); const pol = ev.effects.filter((e) => !ECON_FIELDS.has(e.field));
  const [tab, setTab] = useState<'chain' | 'impact' | 'reactions'>('chain');
  const importance = ev.severity >= 5 || total >= 8 ? 5 : ev.severity >= 4 || total >= 4 ? 4 : ev.historic || total >= 2 ? 3 : ev.severity;
  const region = ev.data?.regionId ? world.regions?.[ev.data.regionId as string] : ev.location.cityId ? world.regions?.[world.cities[ev.location.cityId]?.regionId ?? ''] : undefined;
  const Node = ({ e, current }: { e: WorldEvent; current?: boolean }) => <div className={`node ${current ? 'current' : ''}`} style={{ ['--c' as string]: catVar(e.category) }} onClick={() => !current && select({ kind: 'event', id: e.id })}><span className={`sev sev-${e.severity}`} role="img" aria-label={sevLabel(e.severity)} title={sevLabel(e.severity)} /><span className={current ? 'grow' : 'grow ellipsis'}>{renderEvent(e, world).title}</span>{!current && <span className="dim mono" style={{ fontSize: 10 }}>{formatDate(e.day, world.meta.startYear, 'short')}</span>}</div>;
  return (
    <>
      <div className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
        <div style={{ width: 4, alignSelf: 'stretch', borderRadius: 4, background: catVar(ev.category), boxShadow: `0 0 12px ${catVar(ev.category)}` }} />
        <div className="grow">
          <div className="row" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-3)' }}><span className={`sev sev-${ev.severity}`} role="img" aria-label={sevLabel(ev.severity)} title={sevLabel(ev.severity)} /><span style={{ color: catVar(ev.category) }}>{t(`cat.${ev.category}`)}</span><span>· {sevLabel(ev.severity)}</span>{ev.playerIntervention && <span className="player-badge">✦</span>}</div>
          <div className="title" style={{ marginTop: 4, lineHeight: 1.25 }}>{r.title}</div>
        </div>
        <button className="btn icon sm" title={t('common.focus')} aria-label={t('common.focus')} onClick={() => { focusOn(ev.location.x, ev.location.y, 2.6); setScreen('world'); }}>◎</button>
      </div>
      <p style={{ fontSize: 14, lineHeight: 1.5 }}>{r.description}</p>
      <dl className="kv">
        <dt>{t('events.date')}</dt><dd>{formatDate(ev.day, world.meta.startYear)} <span className="dim">· {daysAgo(ev.day, world.day)}</span></dd>
        <dt>{t('events.place')}</dt><dd>{ev.location.countryId && <span className="link" onClick={() => select({ kind: 'country', id: ev.location.countryId! })}>{world.countries[ev.location.countryId]?.name}</span>}{region && <> › <span className="link" onClick={() => select({ kind: 'region', id: region.id })}>{region.name}</span></>}{ev.location.cityId && <> › <span className="link" onClick={() => select({ kind: 'city', id: ev.location.cityId! })}>{world.cities[ev.location.cityId]?.name}</span></>}</dd>
        <dt>{t('events.actors')}</dt><dd className="row wrap" style={{ gap: 4 }}>{ev.actors.map((a) => <button key={a.kind + a.id} className="rel-chip clickable" onClick={() => select(a)}>{nameOf(a)} <span className="dim">{t(`entity.${a.kind}`).toLowerCase()}</span></button>)}</dd>
        <dt>{t('events.significance')}</dt><dd><span className={`sev sev-${importance}`} role="img" aria-label={sevLabel(importance)} /> {sevLabel(importance)}{ev.historic ? ` · ${t('events.historic')}` : ''} · {t('history.downstream', { n: total })}</dd>
      </dl>
      <Tabs tabs={[{ id: 'chain' as const, label: t('tab.chain') }, { id: 'impact' as const, label: t('events.effects') }, { id: 'reactions' as const, label: t('events.social') }]} tab={tab} setTab={setTab} />
      {tab === 'chain' && <>
        <Section title={t('events.why')}>
          <div className="chain" data-testid="chain">
            {chain.length === 0 && <div className="dim" style={{ fontSize: 12 }}>{ev.causedBy === 'player' ? `✦ ${t('events.divine')}` : t('events.noCause')}</div>}
            {chain.map((c) => <React.Fragment key={c.id}><Node e={c} /><div className="arrow">↓</div></React.Fragment>)}
            <Node e={ev} current />
          </div>
        </Section>
        <Section title={t('events.then')}>
          <div className="chain">
            {consequences.length === 0 && pendingCount === 0 && <div className="dim" style={{ fontSize: 12 }}>{t('events.noConsequences')}</div>}
            {consequences.map((c) => <React.Fragment key={c.id}><div className="arrow">↓</div><Node e={c} /></React.Fragment>)}
            {pendingCount > 0 && <div className="arrow dim">… {pendingCount}</div>}
          </div>
          {later.length > 0 && <><div className="kicker" style={{ marginTop: 6 }}>{t('events.later')}</div><Events list={later} /></>}
        </Section>
      </>}
      {tab === 'impact' && <>
        <Section title={t('events.impact.economy')}><div className="chips">{econ.length ? econ.slice(0, 10).map((e, i) => <span key={i} className="chip" style={{ color: e.delta >= 0 ? 'var(--ok)' : 'var(--bad)' }}>{nameOf(e.target)} · {t(`stat.${e.field}`) === `stat.${e.field}` ? e.field : t(`stat.${e.field}`)} {e.delta >= 0 ? '+' : ''}{e.delta.toFixed(1)}</span>) : <span className="dim">—</span>}</div></Section>
        <Section title={t('events.impact.politics')}><div className="chips">{pol.length ? pol.slice(0, 12).map((e, i) => <span key={i} className="chip" style={{ color: e.delta >= 0 ? 'var(--ok)' : 'var(--bad)' }}>{nameOf(e.target)} · {t(`stat.${e.field}`) === `stat.${e.field}` ? e.field : t(`stat.${e.field}`)} {e.delta >= 0 ? '+' : ''}{e.delta.toFixed(1)}</span>) : <span className="dim">—</span>}</div></Section>
        {ev.tags.length > 0 && <div className="chips">{ev.tags.map((x) => <span key={x} className="chip dim">#{x}</span>)}</div>}
        <RelationGraph center={{ kind: 'event', id: ev.id }} />
      </>}
      {tab === 'reactions' && <>
        {articles.length > 0 && <Section title={t('events.news')}><div className="list">{articles.map((a) => { const o = world.outlets[a.outletId]; return <div key={a.id} className="card clickable" onClick={() => select({ kind: 'outlet', id: a.outletId })}><div className="row" style={{ fontSize: 11 }}><span className="outlet-dot" style={{ background: o?.color }} /><span className="outlet-name">{o?.name}</span><span className="dim">· {t(`news.bias.${o?.bias ?? 'independent'}`)}</span></div><div style={{ fontFamily: 'var(--font-serif)', fontWeight: 700, marginTop: 2 }}>{a.headline}</div></div>; })}</div></Section>}
        {posts.length > 0 && <Section title={t('events.social')}><div className="panel-solid" style={{ overflow: 'hidden' }}>{posts.map((s) => <Post key={s.id} post={s} />)}</div></Section>}
        {!articles.length && !posts.length && <div className="dim">{t('common.empty')}</div>}
      </>}
    </>
  );
}

const SUGGESTED_ES = ['¿Qué quieres?', '¿Cómo está tu región?', '¿Qué opinas de tu país?', '¿Qué ha pasado últimamente?', '¿En quién confías?', '¿A qué tienes miedo?', 'Háblame de ti.', 'Deberías hacer las paces.'];
function Dialogue({ p }: { p: Person }): React.ReactElement {
  const t = useT(); const world = useGame((s) => s.world)!;
  const [log, setLog] = useState<{ q: string; a: string }[]>([]); const [q, setQ] = useState('');
  const ask = async (question: string) => { if (!question.trim()) return; const engineQ = looksSpanish(question) ? spanishToEnglish(question) : question; const a = await dialogueProvider.answer(world, p, engineQ); const r = rememberConversation(world, p, question, a); useGame.getState().bump(); setLog((l) => [...l.slice(-5), { q: question, a: r.persuaded ? `${a}\n✦ ${p.firstName} ${t('person.tookToHeart')}: ${r.persuaded}` : a }]); setQ(''); };
  return (
    <Section title={t('tab.dialogue')}>
      <div className="chips scroll" style={{ marginBottom: 6 }}>{(getLang() === 'es' ? SUGGESTED_ES : SUGGESTED_QUESTIONS).map((s) => <button key={s} className="chip clickable" onClick={() => void ask(s)}>{s}</button>)}</div>
      <div className="row"><input className="input" style={{ minHeight: 36 }} placeholder={t('person.ask', { name: p.firstName })} data-testid="ask" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void ask(q); }} /><button className="btn sm" onClick={() => void ask(q)}>{t('person.askBtn')}</button></div>
      {log.length > 0 && <div className="list" style={{ marginTop: 8 }}>{log.slice().reverse().map((x, i) => <div key={i} className="card" data-testid="answer"><div className="dim" style={{ fontSize: 12 }}>{x.q}</div><div style={{ fontSize: 13, marginTop: 3, fontStyle: 'italic', whiteSpace: 'pre-line' }}>“{x.a}”</div></div>)}</div>}
    </Section>
  );
}
export { titleCase };
