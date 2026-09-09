import React, { useMemo, useState } from 'react';
import { useGame } from '@/state/store';
import type { Country, City, Person, Company, Organization, MediaOutlet, WorldEvent, EntityRef, World } from '@/engine/types';
import { Flag } from './Flag';
import { Avatar } from './Avatar';
import { Stat, barColor } from './Stat';
import { EntityRow } from './EntityRow';
import { EventCard } from './EventCard';
import { Sparkline, LineChart } from './Sparkline';
import { RelationGraph } from './RelationGraph';
import { Post } from '../screens/SocialScreen';
import { fmtMoneyB, fmtPop, fmtPct, catVar, sevLabel, titleCase } from '../format';
import { ageOf, formatDate, daysAgo } from '@/engine/time';
import { pctChange } from '@/engine/simulation/markets';
import { sentimentFor } from '@/engine/simulation/information';
import { countryPower } from '@/engine/simulation/systems';
import { countConsequences } from '../screens/HistoryScreen';
import { localDialogue, SUGGESTED_QUESTIONS } from '@/engine/ai/dialogue';

export function Inspector(): React.ReactElement {
  const selection = useGame((s) => s.selection);
  const select = useGame((s) => s.select);
  const back = useGame((s) => s.back);
  const stack = useGame((s) => s.selectionStack);
  const world = useGame((s) => s.world);
  const version = useGame((s) => s.version);
  void version;
  const open = !!selection && !!world;
  const sheetRef = React.useRef<HTMLElement>(null);
  const drag = React.useRef<{ y0: number; dy: number } | null>(null);
  // Swipe-down on the header/grabber dismisses the sheet on phones.
  const onDown = (e: React.PointerEvent) => { if (window.innerWidth >= 900 || e.pointerType === 'mouse') return; drag.current = { y0: e.clientY, dy: 0 }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); };
  const onMove = (e: React.PointerEvent) => { const d = drag.current; if (!d || !sheetRef.current) return; d.dy = Math.max(0, e.clientY - d.y0); sheetRef.current.style.transition = 'none'; sheetRef.current.style.transform = `translateY(${d.dy}px)`; };
  const onUp = () => { const d = drag.current; const el = sheetRef.current; drag.current = null; if (!d || !el) return; el.style.transition = ''; el.style.transform = ''; if (d.dy > 90) select(null); };
  return (
    <aside ref={sheetRef} className={`inspector ${open ? 'open' : ''}`} aria-hidden={!open}>
      <div className="grabber" onClick={() => select(null)} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} style={{ touchAction: 'none', width: 80, padding: '6px 0', background: 'none' }}><div style={{ width: 40, height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.2)', margin: '0 auto' }} /></div>
      <div className="inspector-head" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} style={{ touchAction: 'pan-x' }}>
        {stack.length > 0 ? <button className="btn ghost sm" onClick={back} aria-label="Back">←</button> : null}
        <span className="kicker grow">{selection ? selection.kind : ''}</span>
        <button className="btn ghost sm" onClick={() => select(null)} aria-label="Close">✕</button>
      </div>
      <div className="inspector-body">
        {open && selection && <Body refx={selection} world={world!} />}
      </div>
    </aside>
  );
}

function Body({ refx, world }: { refx: EntityRef; world: World }): React.ReactElement {
  switch (refx.kind) {
    case 'country': { const c = world.countries[refx.id]; return c ? <CountryView c={c} /> : <Missing />; }
    case 'city': { const c = world.cities[refx.id]; return c ? <CityView c={c} /> : <Missing />; }
    case 'person': { const p = world.people[refx.id]; return p ? <PersonView p={p} /> : <Missing />; }
    case 'company': { const c = world.companies[refx.id]; return c ? <CompanyView c={c} /> : <Missing />; }
    case 'organization': { const o = world.organizations[refx.id]; return o ? <OrgView o={o} /> : <Missing />; }
    case 'outlet': { const o = world.outlets[refx.id]; return o ? <OutletView o={o} /> : <Missing />; }
    case 'event': { const e = world.events.find((x) => x.id === refx.id); return e ? <EventView ev={e} /> : <Missing />; }
  }
}
function Missing(): React.ReactElement { return <div className="dim">This entity no longer exists in the record.</div>; }

function useRecentEvents(pred: (e: WorldEvent) => boolean, n = 6): WorldEvent[] {
  const world = useGame((s) => s.world)!; const version = useGame((s) => s.version);
  return useMemo(() => { const out: WorldEvent[] = []; for (let i = world.events.length - 1; i >= 0 && out.length < n; i--) if (pred(world.events[i])) out.push(world.events[i]); return out; }, [world, version, pred, n]);
}

function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }): React.ReactElement {
  return <div><div className="section-title">{title}{right}</div>{children}</div>;
}

function GodShortcut({ presetId, params, label }: { presetId: string; params: Record<string, string>; label: string }): React.ReactElement {
  const setScreen = useGame((s) => s.setScreen); const setPrefill = useGame((s) => s.setGodPrefill); const select = useGame((s) => s.select);
  return <button className="btn sm" style={{ borderColor: 'rgba(240,179,90,0.4)', color: 'var(--accent)' }} onClick={() => { setPrefill({ presetId, params }); setScreen('god'); if (window.innerWidth < 900) select(null); }}>✦ {label}</button>;
}

// ---------------------------------------------------------------------------
function CountryView({ c }: { c: Country }): React.ReactElement {
  const world = useGame((s) => s.world)!;
  const focusOn = useGame((s) => s.focusOn); const setScreen = useGame((s) => s.setScreen);
  const leader = world.people[c.leaderId];
  const cities = c.cityIds.map((id) => world.cities[id]).filter(Boolean).sort((a, b) => b.population - a.population);
  const companies = Object.values(world.companies).filter((x) => x.alive && x.countryId === c.id).sort((a, b) => b.value - a.value).slice(0, 5);
  const people = Object.values(world.people).filter((p) => p.alive && p.countryId === c.id && p.id !== c.leaderId).sort((a, b) => b.influence - a.influence).slice(0, 5);
  const orgs = Object.values(world.organizations).filter((o) => o.alive && o.countryId === c.id && o.type !== 'government').sort((a, b) => b.influence - a.influence).slice(0, 5);
  const events = useRecentEvents((e) => e.location.countryId === c.id || e.actors.some((a) => a.kind === 'country' && a.id === c.id));
  const rels = Object.entries(c.relations).map(([id, r]) => ({ c: world.countries[id], r })).filter((x) => x.c).sort((a, b) => b.r - a.r);
  const idx = world.indexes[c.id];
  const rank = Object.values(world.countries).map(countryPower).sort((a, b) => b - a).indexOf(countryPower(c)) + 1;
  const [tab, setTab] = useState<'overview' | 'relations' | 'graph'>('overview');
  return (
    <>
      <div className="row" style={{ gap: 12 }}>
        <Flag spec={c.flag} size="lg" />
        <div className="grow"><div className="title">{c.name}</div><div className="dim" style={{ fontSize: 12 }}>{titleCase(c.government)} · {c.ideology} · power rank #{rank}</div></div>
        <button className="btn icon sm" title="Focus on map" onClick={() => { focusOn(c.centroid.x, c.centroid.y, 2.2); setScreen('world'); }}>◎</button>
      </div>
      {c.atWarWith.length > 0 && <div className="card" style={{ borderColor: 'rgba(255,77,77,0.5)', color: '#ffb3b3' }}>⚔ At war with {c.atWarWith.map((id) => world.countries[id]?.name).join(', ')}</div>}
      <div className="row"><button className={`chip clickable ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>Overview</button><button className={`chip clickable ${tab === 'relations' ? 'active' : ''}`} onClick={() => setTab('relations')}>Relations</button><button className={`chip clickable ${tab === 'graph' ? 'active' : ''}`} onClick={() => setTab('graph')}>Network</button></div>
      {tab === 'graph' && <RelationGraph center={{ kind: 'country', id: c.id }} />}
      {tab === 'relations' && (
        <Section title="Foreign relations">
          <div className="list">{rels.map(({ c: o, r }) => <div key={o.id} className="entity-row" onClick={() => useGame.getState().select({ kind: 'country', id: o.id })}><Flag spec={o.flag} /><div className="grow"><div className="name">{o.name}</div><div className="sub">{c.atWarWith.includes(o.id) ? 'AT WAR' : c.alliances.includes(o.id) ? 'Ally' : c.tradePartners.includes(o.id) ? 'Trade partner' : c.neighbors.includes(o.id) ? 'Neighbor' : ''}</div></div><div className="bar" style={{ width: 70 }}><i style={{ width: `${(r + 100) / 2}%`, background: r < -40 ? 'var(--bad)' : r > 40 ? 'var(--ok)' : 'var(--warn)' }} /></div><span className="mono dim" style={{ width: 34, textAlign: 'right' }}>{r.toFixed(0)}</span></div>)}</div>
        </Section>
      )}
      {tab === 'overview' && (
        <>
          <div className="stat-grid">
            <Stat k="Population" v={fmtPop(c.population)} />
            <Stat k="GDP" v={fmtMoneyB(c.gdp)} sub={`${fmtPct(c.gdpGrowth)} growth`} />
            <Stat k="Stability" v={c.stability.toFixed(0)} bar={c.stability} />
            <Stat k="Happiness" v={c.happiness.toFixed(0)} bar={c.happiness} />
            <Stat k="Approval" v={c.approval.toFixed(0)} bar={c.approval} />
            <Stat k="Unrest" v={c.unrest.toFixed(0)} bar={c.unrest} color={c.unrest > 50 ? 'var(--bad)' : 'var(--warn)'} />
            <Stat k="Military" v={c.military.toFixed(0)} bar={c.military} color="var(--cat-military)" />
            <Stat k="Technology" v={c.technology.toFixed(0)} bar={c.technology} color="var(--cat-technological)" />
            <Stat k="Freedom" v={c.freedom.toFixed(0)} bar={c.freedom} />
            <Stat k="Corruption" v={c.corruption.toFixed(0)} bar={c.corruption} color="var(--bad)" />
            <Stat k="Inflation" v={fmtPct(c.inflation)} />
            <Stat k="Unemployment" v={`${c.unemployment.toFixed(1)}%`} />
            <Stat k="Debt / GDP" v={`${c.debt.toFixed(0)}%`} />
            <Stat k="Polarization" v={c.polarization.toFixed(0)} bar={c.polarization} color="var(--cat-social)" />
            <Stat k="Climate risk" v={c.climateRisk.toFixed(0)} bar={c.climateRisk} color="var(--cat-environmental)" />
          </div>
          {idx && <Section title={`${idx.name} · ${idx.value.toFixed(0)}`} right={<span className={pctChange(idx.history, 30) >= 0 ? 'up' : 'down'}>{fmtPct(pctChange(idx.history, 30))} 30d</span>}><Sparkline data={idx.history.slice(-90)} width={360} height={40} /></Section>}
          <Section title="Leadership">{leader && <EntityRow refx={{ kind: 'person', id: leader.id }} name={leader.name} sub={`${leader.title} · ${leader.ideology} · approval ${c.approval.toFixed(0)}%`} />}<div className="dim" style={{ fontSize: 12, padding: '0 10px' }}>{c.electionEvery ? `Elections every ${c.electionEvery} years · next ${c.nextElectionYear}` : 'No elections'} · culture values {c.culture.values.join(', ')}</div></Section>
          <Section title="Resources"><div className="chips">{Object.entries(c.resources).map(([k, v]) => <span key={k} className="chip">{titleCase(k)} <b style={{ color: barColor(v) }}>{v.toFixed(0)}</b></span>)}</div></Section>
          <Section title={`Cities (${cities.length})`}><div className="list">{cities.slice(0, 6).map((ct) => <EntityRow key={ct.id} refx={{ kind: 'city', id: ct.id }} name={`${ct.name}${ct.capital ? ' ★' : ''}`} sub={`${fmtPop(ct.population)} · prosperity ${ct.prosperity.toFixed(0)} · unrest ${ct.unrest.toFixed(0)}`} />)}</div></Section>
          {people.length > 0 && <Section title="Notable people"><div className="list">{people.map((p) => <EntityRow key={p.id} refx={{ kind: 'person', id: p.id }} name={p.name} sub={`${p.title ?? titleCase(p.profession)} · influence ${p.influence.toFixed(0)}`} />)}</div></Section>}
          {companies.length > 0 && <Section title="Largest companies"><div className="list">{companies.map((co) => <EntityRow key={co.id} refx={{ kind: 'company', id: co.id }} name={co.name} sub={co.sector} right={fmtMoneyB(co.value)} />)}</div></Section>}
          {orgs.length > 0 && <Section title="Organizations"><div className="list">{orgs.map((o) => <EntityRow key={o.id} refx={{ kind: 'organization', id: o.id }} name={o.name} sub={`${titleCase(o.type)} · support ${o.support.toFixed(0)}%`} />)}</div></Section>}
          <Section title="Divine interventions"><div className="chips"><GodShortcut presetId="start-war" params={{ a: c.id }} label="Start war" /><GodShortcut presetId="revolution" params={{ a: c.id }} label="Revolution" /><GodShortcut presetId="boom" params={{ a: c.id }} label="Boom" /><GodShortcut presetId="disaster" params={{ a: c.id }} label="Disaster" /><GodShortcut presetId="breakthrough" params={{ a: c.id }} label="Breakthrough" /></div></Section>
          <Section title="Recent history"><div className="list">{events.map((e) => <EventCard key={e.id} ev={e} compact />)}</div></Section>
        </>
      )}
    </>
  );
}

function CityView({ c }: { c: City }): React.ReactElement {
  const world = useGame((s) => s.world)!; const focusOn = useGame((s) => s.focusOn); const setScreen = useGame((s) => s.setScreen);
  const country = world.countries[c.countryId];
  const people = Object.values(world.people).filter((p) => p.alive && p.cityId === c.id).sort((a, b) => b.fame - a.fame).slice(0, 6);
  const companies = Object.values(world.companies).filter((x) => x.alive && x.cityId === c.id).sort((a, b) => b.value - a.value).slice(0, 5);
  const events = useRecentEvents((e) => e.location.cityId === c.id);
  return (
    <>
      <div className="row" style={{ gap: 12 }}><div className="grow"><div className="title">{c.name} {c.capital && <span className="tag" style={{ color: 'var(--accent)' }}>capital</span>}</div><div className="dim" style={{ fontSize: 12 }}>{country?.name} · {c.coastal ? 'coastal' : 'inland'} · {c.specialties.join(', ')}</div></div><button className="btn icon sm" onClick={() => { focusOn(c.x, c.y, 4); setScreen('world'); }}>◎</button></div>
      <div className="stat-grid"><Stat k="Population" v={fmtPop(c.population)} /><Stat k="Prosperity" v={c.prosperity.toFixed(0)} bar={c.prosperity} /><Stat k="Unrest" v={c.unrest.toFixed(0)} bar={c.unrest} color="var(--warn)" /></div>
      {country && <EntityRow refx={{ kind: 'country', id: country.id }} name={country.name} sub={`${titleCase(country.government)} · stability ${country.stability.toFixed(0)}`} />}
      {people.length > 0 && <Section title="People here"><div className="list">{people.map((p) => <EntityRow key={p.id} refx={{ kind: 'person', id: p.id }} name={p.name} sub={p.title ?? titleCase(p.profession)} />)}</div></Section>}
      {companies.length > 0 && <Section title="Headquartered here"><div className="list">{companies.map((co) => <EntityRow key={co.id} refx={{ kind: 'company', id: co.id }} name={co.name} sub={co.sector} right={fmtMoneyB(co.value)} />)}</div></Section>}
      <Section title="Recent events"><div className="list">{events.map((e) => <EventCard key={e.id} ev={e} compact />)}{!events.length && <div className="dim">Quiet, for now.</div>}</div></Section>
    </>
  );
}

function PersonView({ p }: { p: Person }): React.ReactElement {
  const world = useGame((s) => s.world)!; const version = useGame((s) => s.version);
  const country = world.countries[p.countryId]; const city = world.cities[p.cityId];
  const affil = p.affiliations.map((id) => (world.companies[id] ? { kind: 'company' as const, id, name: world.companies[id].name, sub: world.companies[id].sector } : world.organizations[id] ? { kind: 'organization' as const, id, name: world.organizations[id].name, sub: titleCase(world.organizations[id].type) } : null)).filter(Boolean) as { kind: 'company' | 'organization'; id: string; name: string; sub: string }[];
  const events = useRecentEvents((e) => e.actors.some((a) => a.kind === 'person' && a.id === p.id), 8);
  const posts = useMemo(() => world.social.filter((s) => s.authorId === p.id).slice(-4).reverse(), [world, version, p.id]);
  const sentiment = useMemo(() => sentimentFor(world, p.id), [world, version, p.id]);
  const [tab, setTab] = useState<'profile' | 'graph'>('profile');
  const isLeader = country?.leaderId === p.id;
  return (
    <>
      <div className="row" style={{ gap: 12 }}><Avatar name={p.name} id={p.id} size="lg" alive={p.alive} /><div className="grow"><div className="title">{p.name} {!p.alive && <span className="tag" style={{ color: 'var(--bad)' }}>deceased</span>}{p.retired && <span className="tag dim">retired</span>}</div><div className="dim" style={{ fontSize: 12 }}>{p.title ? `${p.title} · ` : ''}{titleCase(p.profession)} · {ageOf(p.birthDay, world.day)} · {country?.adjective}</div><div className="dim" style={{ fontSize: 12 }}>@{p.socialHandle}</div></div></div>
      <div className="row"><button className={`chip clickable ${tab === 'profile' ? 'active' : ''}`} onClick={() => setTab('profile')}>Profile</button><button className={`chip clickable ${tab === 'graph' ? 'active' : ''}`} onClick={() => setTab('graph')}>Network</button></div>
      {tab === 'graph' && <RelationGraph center={{ kind: 'person', id: p.id }} />}
      {tab === 'profile' && (
        <>
          <div className="stat-grid"><Stat k="Influence" v={p.influence.toFixed(0)} bar={p.influence} color="var(--cat-political)" /><Stat k="Fame" v={p.fame.toFixed(0)} bar={p.fame} color="var(--cat-cultural)" /><Stat k="Wealth" v={p.wealth >= 1000 ? `$${(p.wealth / 1000).toFixed(1)}B` : `$${p.wealth.toFixed(1)}M`} /><Stat k="Reputation" v={p.reputation.toFixed(0)} bar={(p.reputation + 100) / 2} color={p.reputation < -20 ? 'var(--bad)' : 'var(--ok)'} /><Stat k="Public sentiment" v={`${sentiment >= 0 ? '+' : ''}${(sentiment * 100).toFixed(0)}`} bar={(sentiment + 1) * 50} /><Stat k="Ideology" v={<span style={{ fontSize: 13 }}>{p.ideology}</span>} /></div>
          <Section title="Character"><div className="chips">{p.traits.map((t) => <span key={t} className="chip">{t}</span>)}<span className="chip">ambition {(p.personality.ambition * 100).toFixed(0)}</span><span className="chip">integrity {(p.personality.integrity * 100).toFixed(0)}</span><span className="chip">charisma {(p.personality.charisma * 100).toFixed(0)}</span></div><div className="muted" style={{ fontSize: 13, marginTop: 6 }}>Objective: <b>{p.objective}</b></div></Section>
          <Dialogue p={p} />
          <Section title="Ties"><div className="list">{country && <EntityRow refx={{ kind: 'country', id: country.id }} name={country.name} sub={isLeader ? 'Leads this nation' : 'Citizen'} />}{city && <EntityRow refx={{ kind: 'city', id: city.id }} name={city.name} sub="Lives here" />}{affil.map((a) => <EntityRow key={a.id} refx={{ kind: a.kind, id: a.id }} name={a.name} sub={a.sub} />)}</div></Section>
          {p.relationships.length > 0 && <Section title="Relationships"><div className="list">{p.relationships.slice(0, 8).map((r) => { const o = world.people[r.target.id]; if (!o) return null; return <EntityRow key={r.target.id} refx={{ kind: 'person', id: o.id }} name={o.name} sub={`${titleCase(r.type)} · ${o.title ?? titleCase(o.profession)}`} right={<span style={{ color: r.strength < 0 ? 'var(--bad)' : 'var(--ok)' }}>{r.strength > 0 ? '+' : ''}{(r.strength * 100).toFixed(0)}</span>} />; })}</div></Section>}
          <Section title="Divine interventions"><div className="chips"><GodShortcut presetId="scandal" params={{ p: p.id }} label="Scandal" /><GodShortcut presetId="remove-figure" params={{ p: p.id }} label="Remove" />{country && !isLeader && <GodShortcut presetId="figure" params={{ a: country.id }} label="New rival" />}</div></Section>
          {posts.length > 0 && <Section title="Latest posts"><div className="panel-solid" style={{ overflow: 'hidden' }}>{posts.map((s) => <Post key={s.id} post={s} />)}</div></Section>}
          <Section title="Life story"><div className="list">{p.history.slice().reverse().slice(0, 10).map((h, i) => <div key={i} className="row" style={{ fontSize: 13 }}><span className="mono dim" style={{ width: 92, flexShrink: 0 }}>{formatDate(h.day, world.meta.startYear, 'short')}</span><span className={h.eventId ? 'link' : ''} onClick={() => h.eventId && useGame.getState().select({ kind: 'event', id: h.eventId })}>{h.text}</span></div>)}</div></Section>
          {p.memories.length > 0 && <Section title="Memories"><div className="dim" style={{ fontSize: 12 }}>{p.memories.slice(-4).reverse().map((m) => m.text).join(' · ')}</div></Section>}
          <Section title="Events"><div className="list">{events.map((e) => <EventCard key={e.id} ev={e} compact />)}</div></Section>
        </>
      )}
    </>
  );
}

function CompanyView({ c }: { c: Company }): React.ReactElement {
  const world = useGame((s) => s.world)!;
  const ceo = world.people[c.ceoId]; const founder = c.founderId ? world.people[c.founderId] : undefined; const country = world.countries[c.countryId]; const city = world.cities[c.cityId];
  const events = useRecentEvents((e) => e.actors.some((a) => a.kind === 'company' && a.id === c.id), 8);
  const rivals = Object.values(world.companies).filter((x) => x.alive && x.sector === c.sector && x.id !== c.id).sort((a, b) => b.value - a.value).slice(0, 4);
  const [tab, setTab] = useState<'profile' | 'graph'>('profile');
  return (
    <>
      <div className="row" style={{ gap: 12 }}><span className="avatar lg" style={{ background: 'rgba(96,165,250,0.18)', color: '#9cc4ff', fontSize: 13 }}>{c.ticker}</span><div className="grow"><div className="title">{c.name} {!c.alive && <span className="tag" style={{ color: 'var(--bad)' }}>defunct</span>}</div><div className="dim" style={{ fontSize: 12 }}>{titleCase(c.sector)} · {city?.name}, {country?.name} · founded {formatDate(c.founded, world.meta.startYear, 'short').split(' ').pop()}</div></div></div>
      <p className="muted" style={{ fontSize: 13 }}>{c.description.charAt(0).toUpperCase() + c.description.slice(1)}.</p>
      <div className="row"><button className={`chip clickable ${tab === 'profile' ? 'active' : ''}`} onClick={() => setTab('profile')}>Profile</button><button className={`chip clickable ${tab === 'graph' ? 'active' : ''}`} onClick={() => setTab('graph')}>Network</button></div>
      {tab === 'graph' && <RelationGraph center={{ kind: 'company', id: c.id }} />}
      {tab === 'profile' && (
        <>
          <div className="stat-grid"><Stat k="Value" v={fmtMoneyB(c.value)} sub={`${fmtPct(pctChange(c.priceHistory, 7))} 7d · ${fmtPct(pctChange(c.priceHistory, 30))} 30d`} /><Stat k="Revenue" v={fmtMoneyB(c.revenue)} /><Stat k="Employees" v={fmtPop(c.employees)} /><Stat k="Growth" v={fmtPct(c.growth)} /><Stat k="Reputation" v={c.reputation.toFixed(0)} bar={(c.reputation + 100) / 2} /><Stat k="Listed" v={c.publicListed ? 'Public' : 'Private'} /></div>
          <LineChart data={c.priceHistory} height={110} label={(v) => fmtMoneyB(v)} />
          <Section title="Leadership"><div className="list">{ceo && <EntityRow refx={{ kind: 'person', id: ceo.id }} name={ceo.name} sub={ceo.title ?? 'CEO'} />}{founder && founder.id !== ceo?.id && <EntityRow refx={{ kind: 'person', id: founder.id }} name={founder.name} sub="Founder" />}{country && <EntityRow refx={{ kind: 'country', id: country.id }} name={country.name} sub="Home market" />}</div></Section>
          <Section title="Divine interventions"><div className="chips"><GodShortcut presetId="breakthrough" params={{ co: c.id }} label="Breakthrough" /><GodShortcut presetId="bankrupt" params={{ co: c.id }} label="Bankrupt" /></div></Section>
          {rivals.length > 0 && <Section title="Competitors"><div className="list">{rivals.map((r) => <EntityRow key={r.id} refx={{ kind: 'company', id: r.id }} name={r.name} sub={world.countries[r.countryId]?.name} right={fmtMoneyB(r.value)} />)}</div></Section>}
          <Section title="Events"><div className="list">{events.map((e) => <EventCard key={e.id} ev={e} compact />)}</div></Section>
        </>
      )}
    </>
  );
}

function OrgView({ o }: { o: Organization }): React.ReactElement {
  const world = useGame((s) => s.world)!;
  const leader = o.leaderId ? world.people[o.leaderId] : undefined; const country = o.countryId ? world.countries[o.countryId] : undefined;
  const events = useRecentEvents((e) => e.actors.some((a) => a.kind === 'organization' && a.id === o.id), 8);
  const members = o.memberIds.map((id) => world.countries[id] ? { kind: 'country' as const, id, name: world.countries[id].name } : world.people[id] ? { kind: 'person' as const, id, name: world.people[id].name } : null).filter(Boolean) as { kind: 'country' | 'person'; id: string; name: string }[];
  const [tab, setTab] = useState<'profile' | 'graph'>('profile');
  return (
    <>
      <div className="row" style={{ gap: 12 }}><span className="avatar lg" style={{ background: 'rgba(167,139,250,0.18)', color: '#c9b8ff' }}>⌘</span><div className="grow"><div className="title">{o.name} {!o.alive && <span className="tag" style={{ color: 'var(--bad)' }}>dissolved</span>}</div><div className="dim" style={{ fontSize: 12 }}>{titleCase(o.type)} · {country?.name ?? 'International'}{o.ideology ? ` · ${o.ideology}` : ''}</div></div></div>
      <p className="muted" style={{ fontSize: 13 }}>Agenda: <b>{o.agenda}</b></p>
      <div className="row"><button className={`chip clickable ${tab === 'profile' ? 'active' : ''}`} onClick={() => setTab('profile')}>Profile</button><button className={`chip clickable ${tab === 'graph' ? 'active' : ''}`} onClick={() => setTab('graph')}>Network</button></div>
      {tab === 'graph' && <RelationGraph center={{ kind: 'organization', id: o.id }} />}
      {tab === 'profile' && (
        <>
          <div className="stat-grid"><Stat k="Influence" v={o.influence.toFixed(0)} bar={o.influence} color="var(--cat-political)" /><Stat k="Support" v={`${o.support.toFixed(0)}%`} bar={o.support} /><Stat k="Founded" v={formatDate(o.founded, world.meta.startYear, 'short').split(' ').pop()} /></div>
          <Section title="Leadership & members"><div className="list">{leader && <EntityRow refx={{ kind: 'person', id: leader.id }} name={leader.name} sub="Leader" />}{country && <EntityRow refx={{ kind: 'country', id: country.id }} name={country.name} sub="Based in" />}{members.filter((m) => m.id !== o.leaderId).slice(0, 8).map((m) => <EntityRow key={m.id} refx={{ kind: m.kind, id: m.id }} name={m.name} sub="Member" />)}</div></Section>
          <Section title="Events"><div className="list">{events.map((e) => <EventCard key={e.id} ev={e} compact />)}{!events.length && <div className="dim">No recorded activity yet.</div>}</div></Section>
        </>
      )}
    </>
  );
}

function OutletView({ o }: { o: MediaOutlet }): React.ReactElement {
  const world = useGame((s) => s.world)!; const version = useGame((s) => s.version); const select = useGame((s) => s.select);
  const articles = useMemo(() => world.news.filter((n) => n.outletId === o.id).slice(-8).reverse(), [world, version, o.id]);
  return (
    <>
      <div className="row" style={{ gap: 12 }}><span className="avatar lg" style={{ background: o.color, color: '#111', fontFamily: 'var(--font-serif)' }}>N</span><div className="grow"><div className="outlet-name" style={{ fontSize: 18 }}>{o.name}</div><div className="dim" style={{ fontSize: 12 }}>“{o.motto}” · {o.bias} {o.style} · {o.countryId ? world.countries[o.countryId]?.name : 'International'}</div></div></div>
      <div className="stat-grid"><Stat k="Audience" v={`${o.audience.toFixed(1)}M`} /><Stat k="Credibility" v={o.credibility.toFixed(0)} bar={o.credibility} /><Stat k="Stories" v={world.news.filter((n) => n.outletId === o.id).length} /></div>
      <Section title="Editorial line"><p className="muted" style={{ fontSize: 13 }}>{biasBlurb(o.bias)}</p></Section>
      <Section title="Recent coverage"><div className="list">{articles.map((a) => <div key={a.id} className="card clickable" onClick={() => select({ kind: 'event', id: a.eventId })}><div style={{ fontFamily: 'var(--font-serif)', fontWeight: 700 }}>{a.headline}</div><div className="dim" style={{ fontSize: 11 }}>{daysAgo(a.day, world.day)} · {a.tone}</div></div>)}</div></Section>
    </>
  );
}
function biasBlurb(b: MediaOutlet['bias']): string {
  return { establishment: 'Close to institutions and official sources. Measured, sometimes deferential.', opposition: 'Hostile to the current government; every failure is a scandal.', sensational: 'Everything is BREAKING. Accuracy optional, engagement guaranteed.', business: 'Reads every event through markets, valuations and risk.', international: 'Global perspective, regional consequences, diplomatic sources.', independent: 'Verifies before publishing; skeptical of everyone.', state: 'The official voice. The leadership is always in control.' }[b];
}

function EventView({ ev }: { ev: WorldEvent }): React.ReactElement {
  const world = useGame((s) => s.world)!; const version = useGame((s) => s.version); const select = useGame((s) => s.select); const focusOn = useGame((s) => s.focusOn); const setScreen = useGame((s) => s.setScreen);
  const chain = useMemo(() => { const up: WorldEvent[] = []; let cur = ev; let guard = 0; while (typeof cur.causedBy === 'string' && cur.causedBy.startsWith('ev_') && guard++ < 12) { const p = world.events.find((e) => e.id === cur.causedBy); if (!p) break; up.unshift(p); cur = p; } return up; }, [world, version, ev]);
  const consequences = useMemo(() => ev.consequences.map((id) => world.events.find((e) => e.id === id)).filter(Boolean) as WorldEvent[], [world, version, ev]);
  const pendingCount = world.pending.filter((p) => p.sourceEventId === ev.id).length;
  const articles = useMemo(() => world.news.filter((n) => n.eventId === ev.id).slice(0, 5), [world, version, ev.id]);
  const posts = useMemo(() => world.social.filter((s) => s.eventId === ev.id && !s.replyTo).sort((a, b) => b.likes - a.likes).slice(0, 4), [world, version, ev.id]);
  const total = countConsequences(world, ev.id);
  const nameOf = (r: EntityRef): string => { const e = r.kind === 'person' ? world.people[r.id] : r.kind === 'country' ? world.countries[r.id] : r.kind === 'company' ? world.companies[r.id] : r.kind === 'organization' ? world.organizations[r.id] : r.kind === 'city' ? world.cities[r.id] : undefined; return (e as { name?: string } | undefined)?.name ?? r.id; };
  const [tab, setTab] = useState<'story' | 'graph'>('story');
  return (
    <>
      <div className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
        <div style={{ width: 4, alignSelf: 'stretch', borderRadius: 4, background: catVar(ev.category), boxShadow: `0 0 12px ${catVar(ev.category)}` }} />
        <div className="grow">
          <div className="row" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-3)' }}><span className={`sev sev-${ev.severity}`} /><span style={{ color: catVar(ev.category) }}>{ev.category}</span><span>· {sevLabel(ev.severity)}</span>{ev.playerIntervention && <span className="player-badge">✦ divine</span>}</div>
          <div className="title" style={{ marginTop: 4, lineHeight: 1.25 }}>{ev.title}</div>
          <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>{formatDate(ev.day, world.meta.startYear)}{ev.location.countryId && ` · ${world.countries[ev.location.countryId]?.name}`}{ev.location.cityId && `, ${world.cities[ev.location.cityId]?.name}`}</div>
        </div>
        <button className="btn icon sm" title="Focus on map" onClick={() => { focusOn(ev.location.x, ev.location.y, 2.6); setScreen('world'); }}>◎</button>
      </div>
      <p style={{ fontSize: 14, lineHeight: 1.5 }}>{ev.description}</p>
      <div className="row"><button className={`chip clickable ${tab === 'story' ? 'active' : ''}`} onClick={() => setTab('story')}>Story</button><button className={`chip clickable ${tab === 'graph' ? 'active' : ''}`} onClick={() => setTab('graph')}>Network</button></div>
      {tab === 'graph' && <RelationGraph center={{ kind: 'event', id: ev.id }} />}
      {tab === 'story' && (
        <>
          <Section title="Why did this happen?" right={<span className="dim">{total} downstream</span>}>
            <div className="chain">
              {chain.length === 0 && <div className="dim" style={{ fontSize: 12 }}>{ev.causedBy === 'player' ? '✦ Because you willed it.' : 'Emerged from the state of the world.'}</div>}
              {chain.map((c) => <React.Fragment key={c.id}><div className="node" style={{ ['--c' as string]: catVar(c.category) }} onClick={() => select({ kind: 'event', id: c.id })}><span className={`sev sev-${c.severity}`} /><span className="grow ellipsis">{c.title}</span><span className="dim mono" style={{ fontSize: 10 }}>{daysAgo(c.day, world.day)}</span></div><div className="arrow">↓ led to</div></React.Fragment>)}
              <div className="node current" style={{ ['--c' as string]: catVar(ev.category) }}><span className={`sev sev-${ev.severity}`} /><span className="grow">{ev.title}</span></div>
              {consequences.map((c) => <React.Fragment key={c.id}><div className="arrow">↓ caused</div><div className="node" style={{ ['--c' as string]: catVar(c.category) }} onClick={() => select({ kind: 'event', id: c.id })}><span className={`sev sev-${c.severity}`} /><span className="grow ellipsis">{c.title}</span><span className="dim mono" style={{ fontSize: 10 }}>{daysAgo(c.day, world.day)}</span></div></React.Fragment>)}
              {pendingCount > 0 && <div className="arrow">… {pendingCount} consequence{pendingCount > 1 ? 's' : ''} still unfolding</div>}
            </div>
          </Section>
          {ev.effects.length > 0 && <Section title="Immediate effects"><div className="chips">{ev.effects.slice(0, 12).map((e, i) => <span key={i} className="chip" style={{ color: e.delta >= 0 ? 'var(--ok)' : 'var(--bad)' }}>{nameOf(e.target)} {e.field.replace('%', '')} {e.delta >= 0 ? '+' : ''}{e.field.endsWith('%') ? `${e.delta.toFixed(0)}%` : e.delta.toFixed(1)}</span>)}</div></Section>}
          <Section title="Actors"><div className="list">{ev.actors.map((a) => <EntityRow key={a.kind + a.id} refx={a} name={nameOf(a)} sub={titleCase(a.kind)} />)}</div></Section>
          {articles.length > 0 && <Section title="Coverage"><div className="list">{articles.map((a) => { const o = world.outlets[a.outletId]; return <div key={a.id} className="card clickable" onClick={() => select({ kind: 'outlet', id: a.outletId })}><div className="row" style={{ fontSize: 11 }}><span className="outlet-dot" style={{ background: o?.color }} /><span className="outlet-name" style={{ fontSize: 12 }}>{o?.name}</span><span className="dim">· {a.tone}</span></div><div style={{ fontFamily: 'var(--font-serif)', fontWeight: 700, marginTop: 2 }}>{a.headline}</div></div>; })}</div></Section>}
          {posts.length > 0 && <Section title="Reactions"><div className="panel-solid" style={{ overflow: 'hidden' }}>{posts.map((s) => <Post key={s.id} post={s} />)}</div></Section>}
          {ev.tags.length > 0 && <div className="chips">{ev.tags.map((t) => <span key={t} className="chip dim">#{t}</span>)}</div>}
        </>
      )}
    </>
  );
}


function Dialogue({ p }: { p: Person }): React.ReactElement {
  const world = useGame((s) => s.world)!;
  const [log, setLog] = useState<{ q: string; a: string }[]>([]);
  const [q, setQ] = useState('');
  const ask = async (question: string) => { if (!question.trim()) return; const a = await localDialogue.answer(world, p, question); setLog((l) => [...l.slice(-5), { q: question, a }]); setQ(''); };
  return (
    <Section title="Talk to them">
      <div className="chips scroll" style={{ marginBottom: 6 }}>{SUGGESTED_QUESTIONS.map((s) => <button key={s} className="chip clickable" onClick={() => void ask(s)}>{s}</button>)}</div>
      <div className="row"><input className="input" style={{ minHeight: 36 }} placeholder={`Ask ${p.firstName} anything…`} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void ask(q); }} /><button className="btn sm" onClick={() => void ask(q)}>Ask</button></div>
      {log.length > 0 && <div className="list" style={{ marginTop: 8 }}>{log.slice().reverse().map((x, i) => <div key={i} className="card"><div className="dim" style={{ fontSize: 12 }}>You: {x.q}</div><div style={{ fontSize: 13, marginTop: 3, fontStyle: 'italic' }}>“{x.a}”</div></div>)}</div>}
    </Section>
  );
}
