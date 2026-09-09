import React, { useMemo, useState } from 'react';
import { useGame } from '@/state/store';
import { EventCard } from '../components/EventCard';
import { toDate, MONTHS, formatDate } from '@/engine/time';
import { EVENT_CATEGORIES, type EventCategory, type WorldEvent, type World } from '@/engine/types';
import { catVar } from '../format';

export function HistoryScreen(): React.ReactElement {
  const world = useGame((s) => s.world)!;
  const version = useGame((s) => s.version);
  const select = useGame((s) => s.select);
  const [tab, setTab] = useState<'timeline' | 'sagas' | 'interventions' | 'summaries'>('timeline');
  const [copied, setCopied] = useState(false);
  const [cat, setCat] = useState<EventCategory | 'all'>('all');
  const [country, setCountry] = useState('all');
  const [year, setYear] = useState<number | 'all'>('all');
  const [onlyHistoric, setOnlyHistoric] = useState(true);
  const years = useMemo(() => { const s = new Set<number>(); for (const e of world.events) s.add(toDate(e.day, world.meta.startYear).year); return Array.from(s).sort((a, b) => b - a); }, [world, version]);
  const grouped = useMemo(() => {
    const evs = world.events.filter((e) => (!onlyHistoric || e.historic || e.severity >= 3) && (cat === 'all' || e.category === cat) && (country === 'all' || e.location.countryId === country || e.actors.some((a) => a.kind === 'country' && a.id === country)) && (year === 'all' || toDate(e.day, world.meta.startYear).year === year)).slice(-400).reverse();
    const groups: { key: string; label: string; events: typeof evs }[] = [];
    for (const e of evs) { const d = toDate(e.day, world.meta.startYear); const key = `${d.year}-${d.month}`; let g = groups[groups.length - 1]; if (!g || g.key !== key) { g = { key, label: `${MONTHS[d.month]} ${d.year}`, events: [] }; groups.push(g); } g.events.push(e); }
    return groups;
  }, [world, version, cat, country, year, onlyHistoric]);
  const sagas = useMemo(() => {
    const childOf = new Set<string>(); for (const e of world.events) for (const c of e.consequences) childOf.add(c);
    return world.events.filter((e) => !childOf.has(e.id) && e.consequences.length > 0).map((root) => { const chain = collectChain(world, root.id); return { root, chain, size: chain.length, span: Math.max(...chain.map((x) => x.day)) - root.day, sev: Math.max(...chain.map((x) => x.severity)) }; }).filter((s) => s.size >= 3).sort((a, b) => b.sev * 100 + b.size - (a.sev * 100 + a.size)).slice(0, 40);
  }, [world, version]);
  return (
    <div className="screen">
      <div className="screen-inner">
        <div className="screen-header"><div><div className="kicker">Chronicle of {world.meta.name}</div><h2 className="screen-title">History</h2></div><div className="row"><span className="dim mono hide-mobile">seed {world.meta.seed}</span><button className="btn sm" title="Copy or share the chronicle as Markdown" onClick={() => { const md = buildChronicle(world, sagas); const nav = navigator as Navigator & { share?: (d: { title: string; text: string }) => Promise<void> }; const copy = () => navigator.clipboard?.writeText(md).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => prompt('Copy the chronicle', md)); if (nav.share && window.innerWidth < 900) void nav.share.call(navigator, { title: `Chronicle of ${world.meta.name}`, text: md }).catch(copy); else void copy(); }}>{copied ? '✓ Copied' : '📜 Export chronicle'}</button></div></div>
        <div className="row">
          {(['timeline', 'sagas', 'interventions', 'summaries'] as const).map((t) => <button key={t} className={`chip clickable ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t === 'interventions' ? `Your interventions (${world.interventions.length})` : t === 'sagas' ? `Sagas (${sagas.length})` : t[0].toUpperCase() + t.slice(1)}</button>)}
        </div>
        {tab === 'timeline' && (
          <>
            <div className="row wrap">
              <select className="select" style={{ width: 'auto' }} value={year} onChange={(e) => setYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}><option value="all">All years</option>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
              <select className="select" style={{ width: 'auto', maxWidth: 180 }} value={country} onChange={(e) => setCountry(e.target.value)}><option value="all">All countries</option>{Object.values(world.countries).sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              <label className="chip clickable"><input type="checkbox" checked={onlyHistoric} onChange={(e) => setOnlyHistoric(e.target.checked)} /> major only</label>
            </div>
            <div className="chips scroll"><button className={`chip clickable ${cat === 'all' ? 'active' : ''}`} onClick={() => setCat('all')}>All</button>{EVENT_CATEGORIES.map((c) => <button key={c} className={`chip clickable ${cat === c ? 'active' : ''}`} onClick={() => setCat(c)} style={{ color: cat === c ? undefined : catVar(c) }}>{c}</button>)}</div>
            {grouped.map((g) => (
              <div key={g.key} className="col">
                <div className="kicker" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 4, marginTop: 6 }}>{g.label}</div>
                <div className="list">{g.events.map((e) => <EventCard key={e.id} ev={e} compact />)}</div>
              </div>
            ))}
            {!grouped.length && <div className="dim">History has not been written yet.</div>}
          </>
        )}
        {tab === 'sagas' && (
          <div className="list">
            <p className="muted" style={{ fontSize: 13 }}>Stories the world wrote by itself: an event and everything it set in motion. Tap any step to inspect it.</p>
            {sagas.map((s) => (
              <div key={s.root.id} className="card">
                <div className="row"><span className={`sev sev-${s.sev}`} /><span className="kicker" style={{ color: catVar(s.root.category) }}>{sagaTitle(world, s.root, s.chain)}</span><span className="grow" /><span className="dim mono" style={{ fontSize: 11 }}>{s.size} events · {s.span}d{s.root.playerIntervention ? ' · ✦ yours' : ''}</span></div>
                <div className="chain" style={{ marginTop: 6 }}>
                  {s.chain.slice(0, 7).map((e, i) => <div key={e.id} className={`node ${i === 0 ? 'current' : ''}`} style={{ ['--c' as string]: catVar(e.category) }} onClick={() => select({ kind: 'event', id: e.id })}><span className={`sev sev-${e.severity}`} /><span className="grow ellipsis">{e.title}</span><span className="dim mono" style={{ fontSize: 10 }}>{formatDate(e.day, world.meta.startYear, 'short')}</span></div>)}
                  {s.chain.length > 7 && <div className="arrow">… {s.chain.length - 7} more</div>}
                </div>
              </div>
            ))}
            {!sagas.length && <div className="dim">No sagas yet. Give the world time, or start one in God Mode.</div>}
          </div>
        )}
        {tab === 'interventions' && (
          <div className="list">
            {world.interventions.slice().reverse().map((i) => { const ev = world.events.find((e) => e.id === i.eventId); const cons = ev ? countConsequences(world, ev.id) : 0; return (
              <div key={i.id} className="card clickable" onClick={() => ev && select({ kind: 'event', id: ev.id })}>
                <div className="row"><span className="player-badge">✦</span><span className="kicker">{formatDate(i.day, world.meta.startYear)} · Divine intervention</span></div>
                <div style={{ fontWeight: 700, marginTop: 4 }}>{ev?.title ?? i.command}</div>
                <div className="dim" style={{ fontSize: 12 }}>“{i.command}”</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{i.interpretation}</div>
                <div className="mono dim" style={{ fontSize: 11, marginTop: 4 }}>→ {cons} downstream consequence{cons === 1 ? '' : 's'} so far</div>
              </div>); })}
            {!world.interventions.length && <div className="dim">You have not intervened yet. Open God Mode to change history.</div>}
          </div>
        )}
        {tab === 'summaries' && (
          <div className="list">
            {world.summaries.slice().reverse().map((s, i) => <div key={i} className="card"><div className="kicker">{s.period} · {formatDate(s.day, world.meta.startYear)}</div><div style={{ fontWeight: 700, margin: '4px 0' }}>{s.title}</div><ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-2)', fontSize: 13 }}>{s.lines.map((l, j) => <li key={j}>{l}</li>)}</ul></div>)}
          </div>
        )}
      </div>
    </div>
  );
}

export function countConsequences(world: { events: { id: string; consequences: string[] }[] }, id: string, seen = new Set<string>()): number {
  const ev = world.events.find((e) => e.id === id); if (!ev) return 0;
  let n = 0;
  for (const c of ev.consequences) { if (seen.has(c)) continue; seen.add(c); n += 1 + countConsequences(world, c, seen); }
  return n;
}

/** Root plus all downstream events (breadth-first, chronological), capped for display. */
/** Markdown chronicle of the world: premise, year reviews, sagas, historic events, interventions. */
export function buildChronicle(world: World, sagas: { root: WorldEvent; chain: WorldEvent[] }[]): string {
  const y = world.meta.startYear; const L: string[] = [];
  L.push(`# ${world.meta.name}`, '', `*A world simulated by The World Is Alive. Seed \`${world.meta.seed}\`, ${formatDate(0, y)} – ${formatDate(world.day, y)}.*`, '');
  if (world.meta.premise) L.push(`**${world.meta.premise.title}.** ${world.meta.premise.blurb}`, '');
  const years = world.summaries.filter((s) => s.period === 'year');
  if (years.length) { L.push('## The years', ''); for (const s of years) { L.push(`### ${s.title}`, ''); for (const line of s.lines) L.push(`- ${line}`); L.push(''); } }
  if (sagas.length) { L.push('## Sagas', ''); for (const sg of sagas.slice(0, 12)) { L.push(`### ${sagaTitle(world, sg.root, sg.chain)}`, ''); for (const e of sg.chain.slice(0, 10)) L.push(`- ${formatDate(e.day, y, 'short')} — ${e.title}`); if (sg.chain.length > 10) L.push(`- … and ${sg.chain.length - 10} more`); L.push(''); } }
  const historic = world.events.filter((e) => e.historic && e.severity >= 4);
  if (historic.length) { L.push('## Historic events', ''); for (const e of historic.slice(-40)) L.push(`- ${formatDate(e.day, y, 'short')} — ${e.title}${e.playerIntervention ? ' ✦' : ''}`); L.push(''); }
  if (world.interventions.length) { L.push('## Divine interventions', ''); for (const i of world.interventions.slice(-30)) L.push(`- ${formatDate(i.day, y, 'short')} — ${i.interpretation ?? i.command}`); L.push(''); }
  const cs = Object.values(world.countries).sort((a, b) => b.gdp - a.gdp);
  L.push('## The world today', '', `${cs.length} nations, ${(cs.reduce((a, c) => a + c.population, 0) / 1e9).toFixed(1)} billion people. Largest economy: ${cs[0]?.name}. Most fragile: ${cs.slice().sort((a, b) => a.stability - b.stability)[0]?.name}.`, '');
  return L.join('\n');
}

export function collectChain(world: { events: WorldEvent[] }, rootId: string): WorldEvent[] {
  const byId = new Map(world.events.map((e) => [e.id, e] as const));
  const out: WorldEvent[] = []; const seen = new Set<string>(); const queue = [rootId];
  while (queue.length && out.length < 60) { const id = queue.shift()!; if (seen.has(id)) continue; seen.add(id); const e = byId.get(id); if (!e) continue; out.push(e); queue.push(...e.consequences); }
  return out.sort((a, b) => a.day - b.day);
}

function sagaTitle(world: { countries: Record<string, { name: string }> }, root: { type: string; title: string; location: { countryId?: string }; actors: { kind: string; id: string }[] }, chain: { type: string }[]): string {
  const c = root.location.countryId ? world.countries[root.location.countryId]?.name : undefined;
  const types = new Set(chain.map((e) => e.type));
  if (root.type === 'war.declared') return `The ${c ?? ''} war`.replace('  ', ' ');
  if (root.type === 'tech.breakthrough') return `The breakthrough that reshaped ${c ?? 'the world'}`;
  if (root.type === 'scandal') { const people = root.actors.filter((a) => a.kind === 'person'); const who = people[0] ? (world as { people?: Record<string, { lastName: string }> }).people?.[people[0].id]?.lastName : undefined; if (types.has('rival.ascends')) return `The fall of ${who ?? 'a name'}, the rise of a rival`; if (types.has('downfall') || types.has('leader.resignation')) return who ? `The ${who} affair` : 'A scandal and a fall'; if (types.has('rival.attack') && types.has('ally.rally')) return who ? `${who} against the world` : 'A scandal, rivals and allies'; return who ? `${who} survives the storm` : 'A scandal survived'; }
  if (root.type === 'premise.opening') return root.title;
  if (root.type === 'feud') return 'A feud for the ages';
  if (root.type === 'election.called') return types.has('leader.election') ? `The ${c ?? ''} upset`.replace('  ', ' ') : `${c ?? 'A nation'} votes`;
  if (root.type.startsWith('leader.') && (types.has('purge') || types.has('opposition.leader'))) return types.has('purge') ? `The purge in ${c ?? '?'}` : `${c ?? 'A nation'} divided`;
  if (root.type === 'protest.mass') return types.has('leader.revolution') ? `The ${c ?? ''} revolution`.replace('  ', ' ') : `Unrest in ${c ?? 'the streets'}`;
  if (root.type.startsWith('disaster.')) return `After the ${root.type.split('.')[1]} in ${c ?? '?'}`;
  if (root.type === 'health.epidemic' || root.type === 'health.pandemic') return types.has('vaccine') ? 'The plague and the cure' : 'The outbreak';
  if (root.type === 'government.collapse') return `The fall of ${c ?? 'a state'}`;
  if (root.type === 'company.founded') return types.has('startup.success') ? 'From garage to giant' : 'A startup story';
  if (root.type === 'movement.founded') return `A movement rises in ${c ?? '?'}`;
  if (root.type === 'country.founded') return 'Birth of a nation';
  if (root.type.startsWith('economy.')) return `The ${root.type.split('.')[1]} of ${c ?? 'the world'}`;
  if (root.type === 'space.milestone') return 'The space race';
  if (root.type === 'leader.coup') return `The coup in ${c ?? '?'}`;
  return root.title;
}
