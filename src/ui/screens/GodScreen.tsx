import React, { useEffect, useMemo, useState } from 'react';
import { useGame } from '@/state/store';
import { GOD_PRESETS, GOD_GROUPS, type GodPreset } from '@/engine/godmode/presets';
import { localGodInterpreter, type GodPlan } from '@/engine/godmode/interpreter';
import { formatDate } from '@/engine/time';
import { catVar } from '../format';
import { audio } from '../audio';

/** Example commands that name real entities from the current world, so "Inspire me" always makes sense. */
function examplesFor(world: NonNullable<ReturnType<typeof useGame.getState>['world']>): string[] {
  const cs = Object.values(world.countries); const byGdp = cs.slice().sort((a, b) => b.gdp - a.gdp);
  const a = byGdp[0], b = byGdp[1] ?? byGdp[0], weak = cs.slice().sort((x, y) => x.stability - y.stability)[0];
  const people = Object.values(world.people).filter((p) => p.alive).sort((x, y) => y.fame - x.fame);
  const star = people[0]; const cos = Object.values(world.companies).filter((c) => c.alive).sort((x, y) => y.value - x.value);
  const co = cos[0]; const city = world.cities[a.capitalId];
  return [
    `A small ${a.adjective} battery company discovers a battery that stores twenty times more energy than current technology.`,
    `A meteor strikes ${city?.name ?? a.name}.`,
    `${a.name} and ${b.name} sign a historic alliance.`,
    `A young activist named Mira Vale starts a movement that sweeps ${weak.name}.`,
    'A global pandemic begins.',
    `The economy of ${a.name} collapses into crisis.`,
    star ? `${star.name} is caught in a huge scandal.` : `A scandal engulfs the government of ${a.name}.`,
    people[1] && people[2] ? `${people[1].name} and ${people[2].name} become bitter rivals.` : `${weak.name} calls a snap election.`,
    people[3] && people[4] ? `${people[3].name} falls in love with ${people[4].name}.` : `The people of ${weak.name} go to the polls.`,
    `${cs.find((c) => !c.electionEvery)?.name ?? weak.name} holds its first free election.`,
    `In 3 months, ${a.name} declares war on ${b.name}.`,
    `Next year, a pandemic begins in ${weak.name}.`,
    co ? `${co.name} invents a working fusion reactor.` : `${a.adjective} scientists discover life on another world.`,
    `${weak.name} erupts in revolution.`,
    `Oil is discovered in ${b.name}.`,
    `Refugees flee ${weak.name} for ${a.name}.`,
    `${b.name} declares war on ${a.name}.`,
  ];
}

export function GodScreen(): React.ReactElement {
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
  const [group, setGroup] = useState<GodPreset['group'] | 'all'>('all');
  const [result, setResult] = useState<{ ok: boolean; message: string; eventId?: string } | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => { if (prefill) { if (prefill.presetId) { const p = GOD_PRESETS.find((x) => x.id === prefill.presetId); if (p) { setPreset(p); setParams(prefill.params ?? {}); } } if (prefill.text) setText(prefill.text); setPrefill(null); } }, [prefill, setPrefill]);
  useEffect(() => { if (!text.trim()) { setPreview(null); return; } const t = setTimeout(() => { try { setPreview(localGodInterpreter.interpret(world, text)); } catch { setPreview(null); } }, 200); return () => clearTimeout(t); }, [text, world]);

  const countries = useMemo(() => Object.values(world.countries).sort((a, b) => a.name.localeCompare(b.name)), [world, version]);
  const companies = useMemo(() => Object.values(world.companies).filter((c) => c.alive).sort((a, b) => b.value - a.value), [world, version]);
  const people = useMemo(() => Object.values(world.people).filter((p) => p.alive).sort((a, b) => b.fame - a.fame).slice(0, 200), [world, version]);
  const presets = GOD_PRESETS.filter((p) => (group === 'all' || p.group === group) && (!q || p.label.toLowerCase().includes(q.toLowerCase()) || p.description.toLowerCase().includes(q.toLowerCase())));

  const execute = (plan: GodPlan, raw: string) => {
    const res = runPlan(plan, raw);
    if (!res) return;
    setResult({ ok: res.ok, message: res.message, eventId: res.event?.id });
    if (res.ok && res.event) { focusOn(res.event.location.x, res.event.location.y, 2.2); setText(''); setPreview(null); }
    else audio.play('alert');
  };
  const runPreset = () => { if (!preset) return; execute({ action: preset.id, params, interpretation: `${preset.label}${describeParams(preset, params, world)}`, confidence: 1, targets: [] }, `${preset.label}${describeParams(preset, params, world)}`); setPreset(null); setParams({}); };

  return (
    <div className="screen">
      <div className="screen-inner">
        <div className="god-hero">
          <div className="kicker" style={{ color: 'var(--accent)' }}>✦ You are watching history. Now write it.</div>
          <h2 className="god-title">God Mode</h2>
          <p className="muted" style={{ margin: '6px 0 14px', maxWidth: 560 }}>Describe what you want to happen. The world will interpret it, make it real, and let the consequences unfold across politics, markets, media and people.</p>
          <textarea className="input god-input" placeholder="Describe what you want to happen…" value={text} onChange={(e) => setText(e.target.value)} rows={2} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && preview) execute(preview, text); }} />
          {preview && (
            <div className="card" style={{ marginTop: 8, borderColor: 'rgba(240,179,90,0.35)' }}>
              <div className="kicker">The world understands</div>
              <div style={{ fontSize: 13, marginTop: 2 }}>{preview.interpretation}</div>
              <div className="row" style={{ marginTop: 4 }}><div className="bar grow"><i style={{ width: `${preview.confidence * 100}%`, background: 'var(--accent)' }} /></div><span className="dim mono" style={{ fontSize: 11 }}>{(preview.confidence * 100).toFixed(0)}% confidence</span></div>
            </div>
          )}
          <div className="row wrap" style={{ marginTop: 10 }}>
            <button className="btn primary" disabled={!preview} onClick={() => preview && execute(preview, text)}>✦ Make it so</button>
            <button className="btn ghost" onClick={() => { const ex = examplesFor(world); setText(ex[Math.floor(Math.random() * ex.length)]); }}>Inspire me</button>
            <button className="btn ghost" title="Execute a random preset on random targets" onClick={() => { const p = GOD_PRESETS[Math.floor(Math.random() * GOD_PRESETS.length)]; execute({ action: p.id, params: {}, interpretation: `Surprise: ${p.label}`, confidence: 1, targets: [] }, `Surprise me → ${p.label}`); }}>🎲 Surprise me</button>
          </div>
          {result && (
            <div className="card" style={{ marginTop: 10, borderColor: result.ok ? 'rgba(88,214,141,0.4)' : 'rgba(255,93,93,0.4)' }}>
              <div style={{ fontWeight: 700, color: result.ok ? 'var(--ok)' : 'var(--bad)' }}>{result.ok ? 'It is done.' : 'The world resisted.'}</div>
              <div className="muted" style={{ fontSize: 13 }}>{result.message}</div>
              {result.eventId && <div className="row" style={{ marginTop: 6 }}><button className="btn sm" onClick={() => select({ kind: 'event', id: result.eventId! })}>Inspect event</button><button className="btn sm ghost" onClick={() => setScreen('world')}>Watch on map</button></div>}
            </div>
          )}
        </div>

        <div className="screen-header"><div><div className="kicker">Interventions</div><h3 className="title">Presets</h3></div><input className="input" style={{ width: 200, minHeight: 34 }} placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="chips scroll"><button className={`chip clickable ${group === 'all' ? 'active' : ''}`} onClick={() => setGroup('all')}>All</button>{GOD_GROUPS.map((g) => <button key={g.id} className={`chip clickable ${group === g.id ? 'active' : ''}`} onClick={() => setGroup(g.id)}>{g.label}</button>)}</div>
        <div className="preset-grid">
          {presets.map((p) => <button key={p.id} className={`preset ${preset?.id === p.id ? 'selected' : ''}`} onClick={() => { setPreset(p); setParams({}); audio.play('click'); }}><span className="ico">{p.icon}</span><span className="lbl">{p.label}</span><span className="dsc">{p.description}</span></button>)}
        </div>

        {preset && (
          <div className="panel-solid" style={{ padding: 14, borderColor: 'rgba(240,179,90,0.4)' }}>
            <div className="row between"><div><div className="kicker">Configure</div><div className="title">{preset.icon} {preset.label}</div></div><span className={`sev sev-${preset.severity}`} /></div>
            <p className="muted" style={{ margin: '6px 0 10px' }}>{preset.description}</p>
            <div className="grid-2">
              {preset.params.map((prm) => (
                <div key={prm.key} className="field">
                  <label>{prm.label}</label>
                  {(prm.type === 'country' || prm.type === 'country2') && <div className="row"><select className="select grow" value={params[prm.key] ?? ''} onChange={(e) => setParams({ ...params, [prm.key]: e.target.value })}><option value="">{prm.optional ? '— none / world —' : '— random —'}</option>{countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><button className="btn icon" title="Pick on the map" aria-label="Pick on the map" onClick={() => { setGodPick({ presetId: preset.id, key: prm.key, params }); setScreen('world'); }}>◎</button></div>}
                  {prm.type === 'company' && <select className="select" value={params[prm.key] ?? ''} onChange={(e) => setParams({ ...params, [prm.key]: e.target.value })}><option value="">— random —</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name} ({world.countries[c.countryId]?.name})</option>)}</select>}
                  {(prm.type === 'person' || prm.type === 'person2') && <select className="select" value={params[prm.key] ?? ''} onChange={(e) => setParams({ ...params, [prm.key]: e.target.value })}><option value="">{prm.type === 'person2' ? '— a fitting match —' : '— random famous person —'}</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.title ?? p.profession}, {world.countries[p.countryId]?.name}</option>)}</select>}
                  {(prm.type === 'sector' || prm.type === 'government' || prm.type === 'choice' || prm.type === 'profession') && <select className="select" value={params[prm.key] ?? prm.options?.[0].value ?? ''} onChange={(e) => setParams({ ...params, [prm.key]: e.target.value })}>{prm.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>}
                  {prm.type === 'text' && <input className="input" value={params[prm.key] ?? ''} onChange={(e) => setParams({ ...params, [prm.key]: e.target.value })} placeholder={prm.optional ? 'optional' : ''} />}
                </div>
              ))}
              {!preset.params.length && <div className="dim">No configuration needed.</div>}
            </div>
            <div className="row" style={{ marginTop: 12 }}><button className="btn primary" onClick={runPreset}>✦ Execute</button><button className="btn ghost" onClick={() => setPreset(null)}>Cancel</button></div>
          </div>
        )}

        <div className="panel-solid" style={{ padding: 12 }}>
          <div className="section-title">Your interventions <span className="dim">{world.interventions.length}</span></div>
          <div className="list">
            {world.interventions.slice(-8).reverse().map((i) => { const ev = world.events.find((e) => e.id === i.eventId); return (
              <div key={i.id} className="card clickable" onClick={() => ev && select({ kind: 'event', id: ev.id })}>
                <div className="row"><span className="player-badge">✦</span><span className="kicker">{formatDate(i.day, world.meta.startYear)}</span>{ev && <span className="kicker" style={{ color: catVar(ev.category) }}>{ev.category}</span>}<span className="grow" /><span className="dim mono" style={{ fontSize: 11 }}>{ev?.consequences.length ?? 0} consequences</span></div>
                <div style={{ fontWeight: 600, marginTop: 2 }}>{ev?.title ?? i.command}</div>
              </div>); })}
            {!world.interventions.length && <div className="dim">The world is untouched. So far.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function describeParams(p: GodPreset, params: Record<string, string>, world: ReturnType<typeof useGame.getState>['world']): string {
  if (!world) return '';
  const parts: string[] = [];
  for (const prm of p.params) { const v = params[prm.key]; if (!v) continue; const name = world.countries[v]?.name ?? world.companies[v]?.name ?? world.people[v]?.name ?? v; parts.push(`${prm.label.replace(/ \(.*\)/, '')}: ${name}`); }
  return parts.length ? ` — ${parts.join(', ')}` : '';
}
