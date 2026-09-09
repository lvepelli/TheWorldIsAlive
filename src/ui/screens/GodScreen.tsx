import React, { useEffect, useMemo, useState } from 'react';
import { useGame } from '@/state/store';
import { GOD_PRESETS, type GodPreset } from '@/engine/godmode/presets';
import { localGodInterpreter, type GodPlan } from '@/engine/godmode/interpreter';
import { formatDate } from '@/engine/time';
import { renderEvent } from '@/engine/i18n/render';
import { getLang } from '@/engine/i18n/lang';
import { catLabel, catVar, sevLabel } from '../format';
import { useT } from '../i18n';
import { audio } from '../audio';
import { UI_GOD_GROUPS, type UiGodGroup, uiGroupOf, uiGroupLabel, presetLabel, presetDescription, paramLabel, optionLabel } from '../godmode/labels';

type W = NonNullable<ReturnType<typeof useGame.getState>['world']>;

/** Example commands that name real entities from the current world, so "Inspire me" always makes sense. */
function examplesFor(world: W): string[] {
  const cs = Object.values(world.countries); const byGdp = cs.slice().sort((a, b) => b.gdp - a.gdp);
  const a = byGdp[0], b = byGdp[1] ?? byGdp[0], weak = cs.slice().sort((x, y) => x.stability - y.stability)[0];
  const people = Object.values(world.people).filter((p) => p.alive).sort((x, y) => y.fame - x.fame);
  const star = people[0]; const cos = Object.values(world.companies).filter((c) => c.alive).sort((x, y) => y.value - x.value);
  const co = cos[0]; const city = world.cities[a.capitalId];
  const region = (weak.regionIds ?? []).map((id) => world.regions?.[id]).filter((r) => r && !r.cityIds.includes(weak.capitalId)).sort((x, y) => (y?.unrest ?? 0) - (x?.unrest ?? 0))[0];
  if (getLang() === 'es') return [
    `Una pequeña empresa de ${a.name} descubre una batería que almacena veinte veces más energía.`,
    `Un meteorito golpea ${city?.name ?? a.name}.`,
    `${a.name} y ${b.name} firman una alianza histórica.`,
    `Una joven activista llamada Mira Vale funda un movimiento que arrasa en ${weak.name}.`,
    'Estalla una pandemia global.',
    `${b.name} organiza un festival de cine.`,
    `Dentro de dos semanas, ${a.name} organiza una feria comercial.`,
    ...(region ? [`${region.name} declara la independencia.`, `Convoca un referéndum en ${region.name}.`] : []),
    `La economía de ${a.name} colapsa en una crisis.`,
    star ? `${star.name} se ve envuelto en un enorme escándalo.` : `Un escándalo sacude al gobierno de ${a.name}.`,
    people[1] && people[2] ? `${people[1].name} y ${people[2].name} se convierten en rivales acérrimos.` : `${weak.name} convoca elecciones anticipadas.`,
    people[3] && people[4] ? `${people[3].name} se enamora de ${people[4].name}.` : `El pueblo de ${weak.name} acude a las urnas.`,
    `Dentro de tres meses, ${a.name} declara la guerra a ${b.name}.`,
    `El año que viene, una pandemia empieza en ${weak.name}.`,
    co ? `${co.name} inventa un reactor de fusión que funciona.` : `Científicos de ${a.name} descubren vida en otro planeta.`,
    `${weak.name} estalla en revolución.`,
    `Se descubre petróleo en ${b.name}.`,
    `Refugiados huyen de ${weak.name} hacia ${a.name}.`,
  ];
  return [
    `A small ${a.adjective} battery company discovers a battery that stores twenty times more energy than current technology.`,
    `A meteor strikes ${city?.name ?? a.name}.`,
    `${a.name} and ${b.name} sign a historic alliance.`,
    `A young activist named Mira Vale starts a movement that sweeps ${weak.name}.`,
    'A global pandemic begins.',
    `${b.name} hosts a film festival.`,
    `In 2 weeks, ${a.name} hosts a trade fair.`,
    ...(region ? [`${region.name} declares independence.`, `Hold a referendum in ${region.name}.`] : []),
    `The economy of ${a.name} collapses into crisis.`,
    star ? `${star.name} is caught in a huge scandal.` : `A scandal engulfs the government of ${a.name}.`,
    people[1] && people[2] ? `${people[1].name} and ${people[2].name} become bitter rivals.` : `${weak.name} calls a snap election.`,
    people[3] && people[4] ? `${people[3].name} falls in love with ${people[4].name}.` : `The people of ${weak.name} go to the polls.`,
    `In 3 months, ${a.name} declares war on ${b.name}.`,
    `Next year, a pandemic begins in ${weak.name}.`,
    co ? `${co.name} invents a working fusion reactor.` : `${a.adjective} scientists discover life on another world.`,
    `${weak.name} erupts in revolution.`,
    `Oil is discovered in ${b.name}.`,
    `Refugees flee ${weak.name} for ${a.name}.`,
  ];
}

const MAGS = [0.6, 1, 1.6, 2.4] as const;
const DELAYS = [0, 14, 90, 365] as const;

export function GodScreen(): React.ReactElement {
  const t = useT();
  const world = useGame((s) => s.world)!;
  const version = useGame((s) => s.version);
  const runPlan = useGame((s) => s.runGodPlan);
  const select = useGame((s) => s.select);
  const setScreen = useGame((s) => s.setScreen);
  const focusOn = useGame((s) => s.focusOn);
  const prefill = useGame((s) => s.godPrefill);
  const setPrefill = useGame((s) => s.setGodPrefill);
  const setGodPick = useGame((s) => s.setGodPick);
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<GodPlan | null>(null);
  const [preset, setPreset] = useState<GodPreset | null>(null);
  const [params, setParams] = useState<Record<string, string>>({});
  const [magnitude, setMagnitude] = useState<number>(1);
  const [delay, setDelay] = useState<number>(0);
  const [group, setGroup] = useState<UiGodGroup | 'all'>('all');
  const [result, setResult] = useState<{ ok: boolean; message: string; eventId?: string } | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => { if (prefill) { if (prefill.presetId) { const p = GOD_PRESETS.find((x) => x.id === prefill.presetId); if (p) { setPreset(p); setParams(prefill.params ?? {}); } } if (prefill.text) setText(prefill.text); setPrefill(null); } }, [prefill, setPrefill]);
  useEffect(() => { if (!text.trim()) { setPreview(null); return; } const h = setTimeout(() => { try { setPreview(localGodInterpreter.interpret(world, text)); } catch { setPreview(null); } }, 200); return () => clearTimeout(h); }, [text, world]);

  const countries = useMemo(() => Object.values(world.countries).sort((a, b) => a.name.localeCompare(b.name)), [world, version]);
  const companies = useMemo(() => Object.values(world.companies).filter((c) => c.alive).sort((a, b) => b.value - a.value), [world, version]);
  const people = useMemo(() => Object.values(world.people).filter((p) => p.alive).sort((a, b) => b.fame - a.fame).slice(0, 200), [world, version]);
  const ql = q.trim().toLowerCase();
  const presets = GOD_PRESETS.filter((p) => (group === 'all' || uiGroupOf(p) === group) && (!ql || presetLabel(p).toLowerCase().includes(ql) || presetDescription(p).toLowerCase().includes(ql) || p.label.toLowerCase().includes(ql)));
  const counts = useMemo(() => { const m: Record<string, number> = {}; for (const p of GOD_PRESETS) m[uiGroupOf(p)] = (m[uiGroupOf(p)] ?? 0) + 1; return m; }, []);

  const execute = (plan: GodPlan, raw: string) => {
    const res = runPlan(plan, raw);
    if (!res) return;
    setResult({ ok: res.ok, message: res.message, eventId: res.event?.id });
    if (res.ok && res.event) { focusOn(res.event.location.x, res.event.location.y, 2.2); setText(''); setPreview(null); }
    else audio.play('alert');
  };
  const runPreset = () => {
    if (!preset) return;
    const label = `${presetLabel(preset)}${describeParams(preset, params, world)}`;
    execute({ action: preset.id, params, interpretation: label, confidence: 1, targets: [], magnitude: magnitude !== 1 ? magnitude : undefined, delayDays: delay || undefined }, label);
    setPreset(null); setParams({}); setMagnitude(1); setDelay(0);
  };
  const previewSev = preset ? Math.max(1, Math.min(5, Math.round(preset.severity + (magnitude > 1.5 ? 1 : magnitude < 0.8 ? -1 : 0)))) : 0;
  const delayLabel = (d: number) => t(`god.delay.${d}`);

  return (
    <div className="screen" data-testid="god-screen">
      <div className="screen-inner">
        <div className="god-hero">
          <div className="kicker" style={{ color: 'var(--accent)' }}>✦ {t('god.hero')}</div>
          <h2 className="god-title">{t('god.title')}</h2>
          <p className="muted" style={{ margin: '6px 0 12px', maxWidth: 560 }}>{t('god.sub')}</p>
          <textarea data-testid="god-input" className="input god-input" placeholder={t('god.placeholder', { a: countries[0]?.name ?? '', b: countries[1]?.name ?? '' })} value={text} onChange={(e) => setText(e.target.value)} rows={2} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && preview) execute(preview, text); }} />
          <div className="dim" style={{ fontSize: 11, marginTop: 4 }}>{t('god.freeHint')} · {t('god.ctrlEnter')}</div>
          {preview && (
            <div className="card" style={{ marginTop: 8, borderColor: 'rgba(240,179,90,0.35)' }} data-testid="god-preview">
              <div className="kicker">{t('god.understands')}</div>
              <div style={{ fontSize: 13, marginTop: 2, whiteSpace: 'pre-line' }}>{preview.interpretation}</div>
              <div className="row" style={{ marginTop: 4 }}><div className="bar grow"><i style={{ width: `${preview.confidence * 100}%`, background: 'var(--accent)' }} /></div><span className="dim mono" style={{ fontSize: 11 }}>{(preview.confidence * 100).toFixed(0)}% {t('god.confidence')}</span></div>
              {t(`god.eff.${preview.action}`) !== `god.eff.${preview.action}` && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}><b>{t('god.effectsNow')}:</b> {t(`god.eff.${preview.action}`)}</div>}
            </div>
          )}
          <div className="row wrap" style={{ marginTop: 10 }}>
            <button data-testid="god-execute" className="btn primary" disabled={!preview} onClick={() => preview && execute(preview, text)}>{t('god.makeItSo')}</button>
            <button className="btn ghost" data-testid="god-inspire" onClick={() => { const ex = examplesFor(world); setText(ex[Math.floor(Math.random() * ex.length)]); }}>{t('god.inspire')}</button>
            <button className="btn ghost" title={t('god.surpriseTip')} onClick={() => { const p = GOD_PRESETS[Math.floor(Math.random() * GOD_PRESETS.length)]; const label = `${t('god.surprise')} → ${presetLabel(p)}`; execute({ action: p.id, params: {}, interpretation: label, confidence: 1, targets: [] }, label); }}>🎲 {t('god.surprise')}</button>
          </div>
          {result && (
            <div className="card" style={{ marginTop: 10, borderColor: result.ok ? 'rgba(88,214,141,0.4)' : 'rgba(255,93,93,0.4)' }} data-testid="god-result">
              <div style={{ fontWeight: 700, color: result.ok ? 'var(--ok)' : 'var(--bad)' }}>{result.ok ? (/will feel it in|omen|scheduled/i.test(result.message) ? t('god.written') : t('god.done')) : t('god.resisted')}</div>
              <div className="muted" style={{ fontSize: 13 }}>{result.eventId ? renderEvent(world.events.find((e) => e.id === result.eventId)!, world).title : result.message}</div>
              {result.eventId && <div className="row" style={{ marginTop: 6 }}><button className="btn sm" onClick={() => select({ kind: 'event', id: result.eventId! })}>{t('god.inspect')}</button><button className="btn sm ghost" onClick={() => setScreen('world')}>{t('god.watchMap')}</button></div>}
            </div>
          )}
        </div>

        <div className="screen-header"><div><div className="kicker">{t('god.presets')}</div><h3 className="title">{group === 'all' ? t('god.cat.all') : uiGroupLabel(group)}</h3></div><input className="input" style={{ width: 200, minHeight: 34 }} placeholder={t('god.search')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="chips scroll" data-testid="god-groups">
          <button className={`chip clickable ${group === 'all' ? 'active' : ''}`} onClick={() => setGroup('all')}>{t('god.cat.all')} <span className="dim">{GOD_PRESETS.length}</span></button>
          {UI_GOD_GROUPS.map((g) => <button key={g} data-god-group={g} className={`chip clickable ${group === g ? 'active' : ''}`} onClick={() => setGroup(g)}>{uiGroupLabel(g)} <span className="dim">{counts[g] ?? 0}</span></button>)}
        </div>
        <div className="preset-grid">
          {presets.map((p) => <button key={p.id} data-preset={p.id} className={`preset ${preset?.id === p.id ? 'selected' : ''}`} onClick={() => { setPreset(p); setParams({}); setMagnitude(1); setDelay(0); audio.play('click'); }}><span className="ico">{p.icon}</span><span className="lbl">{presetLabel(p)}</span><span className="dsc">{presetDescription(p)}</span></button>)}
          {!presets.length && <div className="dim">{t('common.noResults')}</div>}
        </div>

        {preset && (
          <div className="panel-solid" style={{ padding: 14, borderColor: 'rgba(240,179,90,0.4)' }} data-testid="god-config">
            <div className="row between"><div><div className="kicker">{t('god.configure')} · {uiGroupLabel(uiGroupOf(preset))}</div><div className="title">{preset.icon} {presetLabel(preset)}</div></div><span className={`sev sev-${previewSev}`} title={sevLabel(previewSev)} /></div>
            <p className="muted" style={{ margin: '6px 0 10px' }}>{presetDescription(preset)}</p>
            <div className="kicker" style={{ marginBottom: 4 }}>{t('god.target')}</div>
            <div className="grid-2">
              {preset.params.map((prm) => (
                <div key={prm.key} className="field">
                  <label>{paramLabel(preset, prm)}</label>
                  {(prm.type === 'country' || prm.type === 'country2') && <div className="row"><select className="select grow" value={params[prm.key] ?? ''} onChange={(e) => setParams({ ...params, [prm.key]: e.target.value })}><option value="">{prm.optional ? t('god.noneWorld') : t('god.random')}</option>{countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><button className="btn sm ghost" title={t('god.pickOnMap')} onClick={() => { setGodPick({ presetId: preset.id, key: prm.key, params }); setScreen('world'); }}>🗺</button></div>}
                  {prm.type === 'company' && <select className="select" value={params[prm.key] ?? ''} onChange={(e) => setParams({ ...params, [prm.key]: e.target.value })}><option value="">{t('god.random')}</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name} ({world.countries[c.countryId]?.name})</option>)}</select>}
                  {(prm.type === 'person' || prm.type === 'person2') && <select className="select" value={params[prm.key] ?? ''} onChange={(e) => setParams({ ...params, [prm.key]: e.target.value })}><option value="">{prm.type === 'person2' ? t('god.fittingMatch') : t('god.randomFamous')}</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.title ?? p.profession}, {world.countries[p.countryId]?.name}</option>)}</select>}
                  {(prm.type === 'sector' || prm.type === 'government' || prm.type === 'choice' || prm.type === 'profession') && <select className="select" value={params[prm.key] ?? prm.options?.[0].value ?? ''} onChange={(e) => setParams({ ...params, [prm.key]: e.target.value })}>{prm.options?.map((o) => <option key={o.value} value={o.value}>{optionLabel(prm, o)}</option>)}</select>}
                  {prm.type === 'text' && prm.key !== 'region' && <input className="input" value={params[prm.key] ?? ''} onChange={(e) => setParams({ ...params, [prm.key]: e.target.value })} placeholder={prm.optional ? t('god.optional') : ''} />}
                  {prm.type === 'text' && prm.key === 'region' && (() => { const owner = world.countries[(preset.id === 'annex' ? params.b : params.a) ?? '']; const names = owner ? (owner.regionIds ?? []).map((id) => world.regions?.[id]).filter(Boolean).map((r) => r!.name) : Object.values(world.regions ?? {}).map((r) => r.name).slice(0, 200); return <><input className="input" list={`regions-${preset.id}`} value={params[prm.key] ?? ''} onChange={(e) => setParams({ ...params, [prm.key]: e.target.value })} placeholder={t('god.optional')} /><datalist id={`regions-${preset.id}`}>{names.map((n) => <option key={n} value={n} />)}</datalist><span className="dim" style={{ fontSize: 11 }}>{t('god.regionHint')}</span></>; })()}
                </div>
              ))}
              {!preset.params.length && <div className="dim">{t('god.noConfig')}</div>}
            </div>
            <div className="grid-2" style={{ marginTop: 10 }}>
              <div className="field"><label>{t('god.magnitude')}</label><div className="row wrap">{MAGS.map((m) => <button key={m} className={`chip clickable ${magnitude === m ? 'active' : ''}`} onClick={() => setMagnitude(m)}>{t(`god.mag.${m}`)}</button>)}</div></div>
              <div className="field"><label>{t('god.delay')}</label><div className="row wrap">{DELAYS.map((d) => <button key={d} className={`chip clickable ${delay === d ? 'active' : ''}`} onClick={() => setDelay(d)}>{delayLabel(d)}</button>)}</div></div>
            </div>
            <div className="card" style={{ marginTop: 10 }}>
              <div className="kicker">{t('god.previewTitle')}</div>
              <div className="row" style={{ marginTop: 4, gap: 8 }}><span className="dim" style={{ fontSize: 12 }}>{t('god.previewSev')}:</span><span className={`sev sev-${previewSev}`} /><b style={{ fontSize: 12 }}>{sevLabel(previewSev)}</b>{delay > 0 && <span className="dim" style={{ fontSize: 12 }}>· {t('god.willFire', { when: delayLabel(delay).toLowerCase() })}</span>}</div>
              <div style={{ fontSize: 13, marginTop: 6 }}><b>{t('god.immediate')}:</b> <span className="muted">{t(`god.eff.${preset.id}`) !== `god.eff.${preset.id}` ? t(`god.eff.${preset.id}`) : presetDescription(preset)}</span></div>
              <div style={{ fontSize: 13, marginTop: 4 }}><b>{t('god.possible')}:</b> <span className="muted">{possibleFor(preset, t)}</span></div>
            </div>
            <div className="row" style={{ marginTop: 12 }}><button data-testid="god-run-preset" className="btn primary" onClick={runPreset}>✦ {t('god.execute')}</button><button className="btn ghost" onClick={() => setPreset(null)}>{t('common.cancel')}</button></div>
          </div>
        )}

        <div className="panel-solid" style={{ padding: 12 }}>
          <div className="section-title">{t('god.interventions')} <span className="dim">{world.interventions.length}</span></div>
          <div className="list">
            {world.interventions.slice(-8).reverse().map((i) => { const ev = world.events.find((e) => e.id === i.eventId); return (
              <div key={i.id} className="card clickable" onClick={() => ev && select({ kind: 'event', id: ev.id })}>
                <div className="row"><span className="player-badge">✦</span><span className="kicker">{formatDate(i.day, world.meta.startYear)}</span>{ev && <span className="kicker" style={{ color: catVar(ev.category) }}>{catLabel(ev.category)}</span>}<span className="grow" /><span className="dim mono" style={{ fontSize: 11 }}>{t('god.consequences', { n: ev?.consequences.length ?? 0 })}</span></div>
                <div style={{ fontWeight: 600, marginTop: 2 }}>{ev ? renderEvent(ev, world).title : i.command}</div>
              </div>); })}
            {!world.interventions.length && <div className="dim">{t('god.untouched')}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Downstream possibilities, derived from the engine's consequence chains for the preset's event family. */
function possibleFor(p: GodPreset, t: (k: string) => string): string {
  const g = uiGroupOf(p);
  const key = g === 'war' ? 'war' : g === 'economy' || g === 'companies' ? 'economy' : g === 'environment' || g === 'global' ? 'disaster' : g === 'people' ? 'society' : g === 'regions' ? 'politics' : g;
  return t(`alerts.possible.${key}`);
}

function describeParams(p: GodPreset, params: Record<string, string>, world: ReturnType<typeof useGame.getState>['world']): string {
  if (!world) return '';
  const parts: string[] = [];
  for (const prm of p.params) { const v = params[prm.key]; if (!v) continue; const name = world.countries[v]?.name ?? world.companies[v]?.name ?? world.people[v]?.name ?? v; parts.push(`${paramLabel(p, prm).replace(/ \(.*\)/, '')}: ${name}`); }
  return parts.length ? ` — ${parts.join(', ')}` : '';
}
