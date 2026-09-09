import React, { useMemo, useState } from 'react';
import { useGame } from '@/state/store';
import { EventCard } from '../components/EventCard';
import { toDate, monthName, formatDate } from '@/engine/time';
import { renderEvent } from '@/engine/i18n/render';
import { getLang } from '@/engine/i18n/lang';
import { t as tt } from '@/i18n';
import { EVENT_CATEGORIES, type EventCategory, type WorldEvent, type World } from '@/engine/types';
import { catLabel, catVar, sevLabel } from '../format';
import { useT } from '../i18n';

type Tab = 'timeline' | 'sagas' | 'borders' | 'interventions' | 'summaries';
const TABS: Tab[] = ['timeline', 'sagas', 'borders', 'interventions', 'summaries'];

export function HistoryScreen(): React.ReactElement {
  const t = useT();
  const world = useGame((s) => s.world)!;
  const version = useGame((s) => s.version);
  const select = useGame((s) => s.select);
  const [tab, setTab] = useState<Tab>('timeline');
  const [copied, setCopied] = useState(false);
  const [cat, setCat] = useState<EventCategory | 'all'>('all');
  const [country, setCountry] = useState('all');
  const [year, setYear] = useState<number | 'all'>('all');
  const [onlyHistoric, setOnlyHistoric] = useState(true);
  const years = useMemo(() => { const s = new Set<number>(); for (const e of world.events) s.add(toDate(e.day, world.meta.startYear).year); return Array.from(s).sort((a, b) => b - a); }, [world, version]);
  const grouped = useMemo(() => {
    const evs = world.events.filter((e) => (!onlyHistoric || e.historic || e.severity >= 3) && (cat === 'all' || e.category === cat) && (country === 'all' || e.location.countryId === country || e.actors.some((a) => a.kind === 'country' && a.id === country)) && (year === 'all' || toDate(e.day, world.meta.startYear).year === year)).slice(-400).reverse();
    const groups: { key: string; label: string; events: typeof evs }[] = [];
    for (const e of evs) { const d = toDate(e.day, world.meta.startYear); const key = `${d.year}-${d.month}`; let g = groups[groups.length - 1]; if (!g || g.key !== key) { g = { key, label: `${monthName(d.month)} ${d.year}`, events: [] }; groups.push(g); } g.events.push(e); }
    return groups;
  }, [world, version, cat, country, year, onlyHistoric]);
  const borderEvents = useMemo(() => world.events.filter((e) => e.type === 'country.founded' || e.type === 'region.annexed' || e.type === 'region.concession').reverse(), [world, version]);
  const sagas = useMemo(() => {
    const childOf = new Set<string>(); for (const e of world.events) for (const c of e.consequences) childOf.add(c);
    return world.events.filter((e) => !childOf.has(e.id) && e.consequences.length > 0).map((root) => { const chain = collectChain(world, root.id); return { root, chain, size: chain.length, span: Math.max(...chain.map((x) => x.day)) - root.day, sev: Math.max(...chain.map((x) => x.severity)) }; }).filter((s) => s.size >= 3).sort((a, b) => b.sev * 100 + b.size - (a.sev * 100 + a.size)).slice(0, 40);
  }, [world, version]);
  const tabLabel = (x: Tab) => x === 'interventions' ? `${t('history.tab.interventions')} (${world.interventions.length})` : x === 'sagas' ? `${t('history.tab.sagas')} (${sagas.length})` : x === 'borders' ? `${t('history.tab.borders')} (${borderEvents.length})` : t(`history.tab.${x}`);
  const exportChronicle = () => {
    const md = buildChronicle(world, sagas);
    const nav = navigator as Navigator & { share?: (d: { title: string; text: string }) => Promise<void> };
    const copy = () => navigator.clipboard?.writeText(md).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => prompt(t('history.copyPrompt'), md));
    if (nav.share && window.innerWidth < 900) void nav.share.call(navigator, { title: t('history.chronicle', { name: world.meta.name }), text: md }).catch(copy); else void copy();
  };
  return (
    <div className="screen" data-testid="history-screen">
      <div className="screen-inner">
        <div className="screen-header"><div><div className="kicker">{t('history.chronicle', { name: world.meta.name })}</div><h2 className="screen-title">{t('history.title')}</h2></div><div className="row"><span className="dim mono hide-mobile">{t('history.seed')} {world.meta.seed}</span><button className="btn sm" onClick={exportChronicle}>{copied ? t('history.copied') : `📜 ${t('history.export')}`}</button></div></div>
        <div className="tabs" role="tablist">
          {TABS.map((x) => <button key={x} role="tab" aria-selected={tab === x} data-tab={x} className={`tab ${tab === x ? 'active' : ''}`} onClick={() => setTab(x)}>{tabLabel(x)}</button>)}
        </div>
        {tab === 'timeline' && (
          <>
            <div className="row wrap">
              <select className="select" style={{ width: 'auto' }} value={year} onChange={(e) => setYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}><option value="all">{t('history.allYears')}</option>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
              <select className="select" style={{ width: 'auto', maxWidth: 180 }} value={country} onChange={(e) => setCountry(e.target.value)}><option value="all">{t('history.allCountries')}</option>{Object.values(world.countries).sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              <label className="chip clickable"><input type="checkbox" checked={onlyHistoric} onChange={(e) => setOnlyHistoric(e.target.checked)} /> {t('history.majorOnly')}</label>
            </div>
            <div className="chips scroll"><button className={`chip clickable ${cat === 'all' ? 'active' : ''}`} onClick={() => setCat('all')}>{t('common.all')}</button>{EVENT_CATEGORIES.map((c) => <button key={c} className={`chip clickable ${cat === c ? 'active' : ''}`} onClick={() => setCat(c)} style={{ color: cat === c ? undefined : catVar(c) }}>{catLabel(c)}</button>)}</div>
            {grouped.map((g) => (
              <div key={g.key} className="col">
                <div className="kicker" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 4, marginTop: 6 }}>{g.label}</div>
                <div className="list">{g.events.map((e) => <EventCard key={e.id} ev={e} compact />)}</div>
              </div>
            ))}
            {!grouped.length && <div className="dim">{t('history.empty')}</div>}
          </>
        )}
        {tab === 'sagas' && (
          <div className="list">
            <p className="muted" style={{ fontSize: 13 }}>{t('history.sagasIntro')}</p>
            {sagas.map((s) => (
              <div key={s.root.id} className="card">
                <div className="row"><span className={`sev sev-${s.sev}`} role="img" aria-label={sevLabel(s.sev)} title={sevLabel(s.sev)} /><span className="kicker" style={{ color: catVar(s.root.category) }}>{sagaTitle(world, s.root, s.chain)}</span><span className="grow" /><span className="dim mono" style={{ fontSize: 11 }}>{t('history.saga.events', { n: s.size, days: s.span })}{s.root.playerIntervention ? ` · ${t('history.yours')}` : ''}</span></div>
                <div className="chain" style={{ marginTop: 6 }}>
                  {s.chain.slice(0, 7).map((e, i) => <div key={e.id} className={`node ${i === 0 ? 'current' : ''}`} style={{ ['--c' as string]: catVar(e.category) }} onClick={() => select({ kind: 'event', id: e.id })}><span className={`sev sev-${e.severity}`} role="img" aria-label={sevLabel(e.severity)} title={sevLabel(e.severity)} /><span className="grow ellipsis">{renderEvent(e, world).title}</span><span className="dim mono" style={{ fontSize: 10 }}>{formatDate(e.day, world.meta.startYear, 'short')}</span></div>)}
                  {s.chain.length > 7 && <div className="arrow">{t('history.more', { n: s.chain.length - 7 })}</div>}
                </div>
              </div>
            ))}
            {!sagas.length && <div className="dim">{t('history.sagasEmpty')}</div>}
          </div>
        )}
        {tab === 'borders' && (
          <div className="list">
            <div className="dim" style={{ fontSize: 12, marginBottom: 6 }}>{t('history.borders.sub', { nations: Object.keys(world.countries).length, founded: borderEvents.filter((e) => e.type === 'country.founded').length, annexed: borderEvents.filter((e) => e.type === 'region.annexed').length, devolved: borderEvents.filter((e) => e.type === 'region.concession').length })}</div>
            {borderEvents.map((e) => { const kind = e.type === 'country.founded' ? t('history.newNation') : e.type === 'region.annexed' ? t('history.annexation') : t('history.devolution'); const colour = e.type === 'country.founded' ? 'var(--accent)' : e.type === 'region.annexed' ? 'var(--bad)' : 'var(--ok)'; const r = renderEvent(e, world); return (
              <div key={e.id} className="card clickable" onClick={() => select({ kind: 'event', id: e.id })}>
                <div className="row"><span className="kicker" style={{ color: colour }}>{formatDate(e.day, world.meta.startYear)} · {kind}</span>{e.playerIntervention && <span className="player-badge" title={t('common.yourDoing')}>✦</span>}</div>
                <div style={{ fontWeight: 700, marginTop: 4 }}>{r.title}</div>
                <div className="dim" style={{ fontSize: 12 }}>{r.description.slice(0, 160)}{r.description.length > 160 ? '…' : ''}</div>
              </div>); })}
            {!borderEvents.length && <div className="dim">{t('history.borders.empty')}</div>}
          </div>
        )}
        {tab === 'interventions' && (
          <div className="list">
            {world.interventions.slice().reverse().map((i) => { const ev = world.events.find((e) => e.id === i.eventId); const cons = ev ? countConsequences(world, ev.id) : 0; return (
              <div key={i.id} className="card clickable" onClick={() => ev && select({ kind: 'event', id: ev.id })}>
                <div className="row"><span className="player-badge">✦</span><span className="kicker">{formatDate(i.day, world.meta.startYear)} · {t('history.divine')}</span></div>
                <div style={{ fontWeight: 700, marginTop: 4 }}>{ev ? renderEvent(ev, world).title : i.command}</div>
                <div className="dim" style={{ fontSize: 12 }}>“{i.command}”</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{i.interpretation}</div>
                <div className="mono dim" style={{ fontSize: 11, marginTop: 4 }}>→ {t('history.downstream', { n: cons })}</div>
              </div>); })}
            {!world.interventions.length && <div className="dim">{t('history.noInterventions')}</div>}
          </div>
        )}
        {tab === 'summaries' && (
          <div className="list">
            {world.summaries.slice().reverse().map((s, i) => <div key={i} className="card"><div className="kicker">{t(`history.summary.${s.period}`)} · {formatDate(s.day, world.meta.startYear)}</div><div style={{ fontWeight: 700, margin: '4px 0' }}>{s.title}</div><ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-2)', fontSize: 13 }}>{s.lines.map((l, j) => <li key={j}>{l}</li>)}</ul></div>)}
            {!world.summaries.length && <div className="dim">{t('common.empty')}</div>}
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

/** Markdown chronicle of the world: premise, year reviews, sagas, historic events, interventions. Localized headings; event titles via the renderer. */
export function buildChronicle(world: World, sagas: { root: WorldEvent; chain: WorldEvent[] }[]): string {
  const y = world.meta.startYear; const L: string[] = [];
  const title = (e: WorldEvent) => renderEvent(e, world).title;
  L.push(`# ${world.meta.name}`, '', tt('history.md.intro', { seed: world.meta.seed, from: formatDate(0, y), to: formatDate(world.day, y) }), '');
  if (world.meta.premise) L.push(`**${world.meta.premise.title}.** ${world.meta.premise.blurb}`, '');
  const years = world.summaries.filter((s) => s.period === 'year');
  if (years.length) { L.push(`## ${tt('history.md.years')}`, ''); for (const s of years) { L.push(`### ${s.title}`, ''); for (const line of s.lines) L.push(`- ${line}`); L.push(''); } }
  { const moves = world.events.filter((e) => e.type === 'country.founded' || e.type === 'region.annexed' || e.type === 'region.concession'); if (moves.length) { L.push(`## ${tt('history.md.borders')}`, ''); for (const e of moves) L.push(`- ${formatDate(e.day, y, 'short')} — ${title(e)}${e.playerIntervention ? ' ✦' : ''}`); L.push(''); } }
  if (sagas.length) { L.push(`## ${tt('history.md.sagas')}`, ''); for (const sg of sagas.slice(0, 12)) { L.push(`### ${sagaTitle(world, sg.root, sg.chain)}`, ''); for (const e of sg.chain.slice(0, 10)) L.push(`- ${formatDate(e.day, y, 'short')} — ${title(e)}`); if (sg.chain.length > 10) L.push(`- ${tt('history.md.andMore', { n: sg.chain.length - 10 })}`); L.push(''); } }
  const historic = world.events.filter((e) => e.historic && e.severity >= 4);
  if (historic.length) { L.push(`## ${tt('history.md.historic')}`, ''); for (const e of historic.slice(-40)) L.push(`- ${formatDate(e.day, y, 'short')} — ${title(e)}${e.playerIntervention ? ' ✦' : ''}`); L.push(''); }
  if (world.interventions.length) { L.push(`## ${tt('history.md.interventions')}`, ''); for (const i of world.interventions.slice(-30)) L.push(`- ${formatDate(i.day, y, 'short')} — ${i.interpretation ?? i.command}`); L.push(''); }
  const swayed = Object.values(world.people).map((p) => ({ p, h: p.history.filter((x) => x.text.startsWith('Persuaded by an interviewer') || x.text.startsWith('Steered ') || x.text.startsWith('Ended the war')) })).filter((x) => x.h.length);
  if (swayed.length) { L.push(`## ${tt('history.md.conversations')}`, ''); for (const { p, h } of swayed.slice(0, 20)) for (const e of h) L.push(`- ${formatDate(e.day, y, 'short')} — ${p.name}: ${e.text}`); L.push(''); }
  const cs = Object.values(world.countries).sort((a, b) => b.gdp - a.gdp);
  L.push(`## ${tt('history.md.today')}`, '', tt('history.md.todayLine', { n: cs.length, pop: (cs.reduce((a, c) => a + c.population, 0) / 1e9).toFixed(1), top: cs[0]?.name ?? '?', weak: cs.slice().sort((a, b) => a.stability - b.stability)[0]?.name ?? '?' }), '');
  return L.join('\n');
}

/** Root plus all downstream events (breadth-first, chronological), capped for display. */
export function collectChain(world: { events: WorldEvent[] }, rootId: string): WorldEvent[] {
  const byId = new Map(world.events.map((e) => [e.id, e] as const));
  const out: WorldEvent[] = []; const seen = new Set<string>(); const queue = [rootId];
  while (queue.length && out.length < 60) { const id = queue.shift()!; if (seen.has(id)) continue; seen.add(id); const e = byId.get(id); if (!e) continue; out.push(e); queue.push(...e.consequences); }
  return out.sort((a, b) => a.day - b.day);
}

type SagaWorld = { countries: Record<string, { name: string }>; people?: Record<string, { lastName: string }> };
type SagaRoot = { type: string; title: string; description?: string; location: { countryId?: string }; actors: { kind: string; id: string }[]; data?: Record<string, unknown> };

export function sagaTitle(world: SagaWorld, root: SagaRoot, chain: { type: string }[]): string {
  if (getLang() === 'es') return sagaTitleEs(world, root, chain);
  const c = root.location.countryId ? world.countries[root.location.countryId]?.name : undefined;
  const types = new Set(chain.map((e) => e.type));
  const sq = (s: string) => s.replace('  ', ' ').trim();
  if (root.type === 'war.declared') return sq(`The ${c ?? ''} war`);
  if (root.type === 'tech.breakthrough') return `The breakthrough that reshaped ${c ?? 'the world'}`;
  if (root.type === 'scandal') { const people = root.actors.filter((a) => a.kind === 'person'); const who = people[0] ? world.people?.[people[0].id]?.lastName : undefined; if (types.has('rival.ascends')) return `The fall of ${who ?? 'a name'}, the rise of a rival`; if (types.has('downfall') || types.has('leader.resignation')) return who ? `The ${who} affair` : 'A scandal and a fall'; if (types.has('rival.attack') && types.has('ally.rally')) return who ? `${who} against the world` : 'A scandal, rivals and allies'; return who ? `${who} survives the storm` : 'A scandal survived'; }
  if (root.type === 'premise.opening') return root.title;
  if (root.type === 'region.annexed') return `The annexation of ${(root.data?.region as string | undefined) ?? 'a region'}`;
  if (root.type === 'region.autonomy') { const rn = root.data?.region as string | undefined; if (types.has('region.referendum')) return `The ${rn ?? 'regional'} referendum`; return Array.from(types).some((x) => x.startsWith('country.')) ? `The birth of ${rn ?? 'a new nation'}` : types.has('region.crackdown') ? `The ${rn ?? 'regional'} crackdown` : `The ${rn ?? 'regional'} question`; }
  if (root.type === 'festival.film') return types.has('festival.banned') ? `The film ${c ?? 'a state'} banned` : sq(`The ${c ?? ''} film festival`);
  if (root.type === 'trade.fair') return types.has('fair.venture') ? sq(`The venture born at the ${c ?? ''} fair`) : sq(`The ${c ?? ''} trade fair`);
  if (root.type === 'summit') return types.has('summit.accord') ? sq(`The ${c ?? ''} accord`) : types.has('summit.collapse') ? `The talks that failed in ${c ?? '?'}` : sq(`The ${c ?? ''} summit`);
  if (root.type === 'tension.rise') { const water = /water dispute/.test(root.description ?? ''); return types.has('war.declared') ? (water ? 'The water war' : `The road to war in ${c ?? '?'}`) : water ? 'Rivers and grudges' : `Tensions around ${c ?? '?'}`; }
  if (root.type === 'sea.rise') return types.has('migration.wave') ? `The sea takes ${c ?? 'a coast'}` : `High water in ${c ?? '?'}`;
  if (root.type === 'food.crisis') return types.has('protest.mass') ? 'The hungry year' : 'When bread cost too much';
  if (root.type === 'feud') return 'A feud for the ages';
  if (root.type === 'election.called') return types.has('leader.election') ? sq(`The ${c ?? ''} upset`) : `${c ?? 'A nation'} votes`;
  if (root.type.startsWith('leader.') && (types.has('purge') || types.has('opposition.leader'))) return types.has('purge') ? `The purge in ${c ?? '?'}` : `${c ?? 'A nation'} divided`;
  if (root.type === 'protest.mass') return types.has('leader.revolution') ? sq(`The ${c ?? ''} revolution`) : `Unrest in ${c ?? 'the streets'}`;
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

const DIS_ES: Record<string, string> = { earthquake: 'terremoto', flood: 'inundación', hurricane: 'huracán', drought: 'sequía', wildfire: 'incendio', volcano: 'volcán', tsunami: 'tsunami', meteor: 'meteorito' };
const ECON_ES: Record<string, string> = { boom: 'auge', crisis: 'crisis', crash: 'crac', recession: 'recesión', recovery: 'recuperación', energy: 'crisis energética', bubble: 'burbuja' };
function sagaTitleEs(world: SagaWorld, root: SagaRoot, chain: { type: string }[]): string {
  const c = root.location.countryId ? world.countries[root.location.countryId]?.name : undefined;
  const types = new Set(chain.map((e) => e.type));
  const en = (s: string) => (c ? `${s} en ${c}` : s);
  if (root.type === 'war.declared') return c ? `La guerra de ${c}` : 'La guerra';
  if (root.type === 'tech.breakthrough') return `El avance que cambió ${c ?? 'el mundo'}`;
  if (root.type === 'scandal') { const people = root.actors.filter((a) => a.kind === 'person'); const who = people[0] ? world.people?.[people[0].id]?.lastName : undefined; if (types.has('rival.ascends')) return `La caída de ${who ?? 'un nombre'}, el ascenso de un rival`; if (types.has('downfall') || types.has('leader.resignation')) return who ? `El caso ${who}` : 'Un escándalo y una caída'; if (types.has('rival.attack') && types.has('ally.rally')) return who ? `${who} contra el mundo` : 'Escándalo, rivales y aliados'; return who ? `${who} sobrevive a la tormenta` : 'Un escándalo superado'; }
  if (root.type === 'premise.opening') return renderRootTitle(root, world);
  if (root.type === 'region.annexed') return `La anexión de ${(root.data?.region as string | undefined) ?? 'una región'}`;
  if (root.type === 'region.autonomy') { const rn = root.data?.region as string | undefined; if (types.has('region.referendum')) return `El referéndum de ${rn ?? 'la región'}`; return Array.from(types).some((x) => x.startsWith('country.')) ? `El nacimiento de ${rn ?? 'una nueva nación'}` : types.has('region.crackdown') ? `La represión en ${rn ?? 'la región'}` : `La cuestión de ${rn ?? 'la región'}`; }
  if (root.type === 'festival.film') return types.has('festival.banned') ? `La película que ${c ?? 'un estado'} prohibió` : `El festival de cine de ${c ?? 'la temporada'}`;
  if (root.type === 'trade.fair') return types.has('fair.venture') ? `La alianza nacida en la feria de ${c ?? 'este año'}` : `La feria comercial de ${c ?? 'este año'}`;
  if (root.type === 'summit') return types.has('summit.accord') ? `El acuerdo de ${c ?? 'la cumbre'}` : types.has('summit.collapse') ? `Las conversaciones que fracasaron en ${c ?? '?'}` : `La cumbre de ${c ?? 'este año'}`;
  if (root.type === 'tension.rise') { const water = /water dispute/.test(root.description ?? ''); return types.has('war.declared') ? (water ? 'La guerra del agua' : `El camino a la guerra en ${c ?? '?'}`) : water ? 'Ríos y rencores' : `Tensiones en torno a ${c ?? '?'}`; }
  if (root.type === 'sea.rise') return types.has('migration.wave') ? `El mar se lleva ${c ?? 'una costa'}` : `Aguas altas en ${c ?? '?'}`;
  if (root.type === 'food.crisis') return types.has('protest.mass') ? 'El año del hambre' : 'Cuando el pan costó demasiado';
  if (root.type === 'feud') return 'Una rivalidad para la historia';
  if (root.type === 'election.called') return types.has('leader.election') ? `La sorpresa electoral de ${c ?? 'la nación'}` : `${c ?? 'Una nación'} vota`;
  if (root.type.startsWith('leader.') && (types.has('purge') || types.has('opposition.leader'))) return types.has('purge') ? `La purga en ${c ?? '?'}` : `${c ?? 'Una nación'} dividida`;
  if (root.type === 'protest.mass') return types.has('leader.revolution') ? `La revolución de ${c ?? 'la calle'}` : `Disturbios en ${c ?? 'las calles'}`;
  if (root.type.startsWith('disaster.')) return en(`Tras el ${DIS_ES[root.type.split('.')[1]] ?? 'desastre'}`);
  if (root.type === 'health.epidemic' || root.type === 'health.pandemic') return types.has('vaccine') ? 'La plaga y la cura' : 'El brote';
  if (root.type === 'government.collapse') return `La caída de ${c ?? 'un estado'}`;
  if (root.type === 'company.founded') return types.has('startup.success') ? 'Del garaje al gigante' : 'Historia de una startup';
  if (root.type === 'movement.founded') return `Un movimiento surge en ${c ?? '?'}`;
  if (root.type === 'country.founded') return 'Nacimiento de una nación';
  if (root.type.startsWith('economy.')) return `${cap(ECON_ES[root.type.split('.')[1]] ?? root.type.split('.')[1])} en ${c ?? 'el mundo'}`;
  if (root.type === 'space.milestone') return 'La carrera espacial';
  if (root.type === 'leader.coup') return `El golpe en ${c ?? '?'}`;
  return renderRootTitle(root, world);
}
function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }
function renderRootTitle(root: SagaRoot, world: SagaWorld): string {
  const w = world as unknown as World; const ev = root as unknown as WorldEvent;
  return ev.id && w.events ? renderEvent(ev, w).title : root.title;
}
