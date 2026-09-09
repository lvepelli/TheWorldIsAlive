import React, { useEffect, useState } from 'react';
import { useGame, randomSeed } from '@/state/store';
import { SaveManager } from './screens/SaveManager';
import { SeedPreview } from './components/SeedPreview';
import { premiseFor, FEATURED_SEEDS, PREMISES } from '@/engine/generator/premise';
import { InstallButton } from './components/InstallButton';
import { LANGS } from '@/i18n';
import { useT } from './i18n';

const STEP_KEYS = ['gen.continents', 'gen.borders', 'gen.cities', 'gen.people', 'gen.companies', 'gen.press', 'gen.markets', 'gen.history'];

export function Intro(): React.ReactElement {
  const t = useT(); const settings = useGame((s) => s.settings); const setSetting = useGame((s) => s.setSetting);
  const phase = useGame((s) => s.phase); const newWorld = useGame((s) => s.newWorld); const genSteps = useGame((s) => s.genSteps);
  const refreshSaves = useGame((s) => s.refreshSaves); const saves = useGame((s) => s.saves); const loadWorld = useGame((s) => s.loadWorld);
  const [seed, setSeed] = useState(''); const [showSaves, setShowSaves] = useState(false); const [error, setError] = useState<string | null>(null);
  useEffect(() => { void refreshSaves(); }, [refreshSaves]);
  useEffect(() => {
    try { const params = new URLSearchParams(window.location.search); const s = params.get('seed'); if (s && phase === 'intro' && !sessionStorage.getItem('twia:deeplinked')) { sessionStorage.setItem('twia:deeplinked', '1'); setSeed(s); void newWorld(s); } } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const autosave = saves.find((s) => s.slot === 'autosave');
  const go = async (s?: string) => { setError(null); try { await newWorld(s); } catch (e) { setError((e as Error).message); } };
  return (
    <div className="intro">
      <div className="intro-inner">
        <div className="row" style={{ justifyContent: 'flex-end', width: '100%' }} role="radiogroup" aria-label={t('intro.language')}>{LANGS.map((l) => <button key={l.id} className={`chip clickable ${settings.lang === l.id ? 'active' : ''}`} role="radio" aria-checked={settings.lang === l.id} data-testid={`lang-${l.id}`} onClick={() => setSetting('lang', l.id)}>{l.label}</button>)}</div>
        {phase === 'generating' || showSaves ? <div className="orb" aria-hidden /> : <><SeedPreview seed={seed || 'the-world-is-alive'} /><div className="premise-tag">{premiseFor(seed || 'the-world-is-alive').title}</div></>}
        <h1 className="logo">The World<br />Is Alive<small>{t('app.subtitle').toUpperCase()}</small></h1>
        {phase === 'generating' ? (
          <div className="gen-steps" aria-live="polite">
            {STEP_KEYS.map((k, i) => { const done = genSteps.length > i + 1 || genSteps.length === STEP_KEYS.length; const active = genSteps.length === i + 1 && !done; return <div key={k} className={done ? 'done' : active ? 'active' : ''}><span>{done ? '✓' : active ? '…' : '·'}</span> {t(k)}</div>; })}
          </div>
        ) : showSaves ? (
          <div style={{ width: '100%' }}><SaveManager onDone={() => setShowSaves(false)} /><button className="btn ghost" style={{ marginTop: 10 }} onClick={() => setShowSaves(false)}>← {t('common.back')}</button></div>
        ) : (
          <>
            <p className="muted" style={{ maxWidth: 420 }}>{t('intro.tagline')}</p>
            <div className="col" style={{ width: '100%', gap: 10 }}>
              {autosave && <button className="btn primary" style={{ minHeight: 48 }} data-testid="continue" onClick={() => void loadWorld('autosave')}>▶ {autosave.name}, {autosave.date}</button>}
              <button className={`btn ${autosave ? '' : 'primary'}`} style={{ minHeight: 48 }} data-testid="generate" onClick={() => void go()}>{t('intro.generate')}</button>
              <div className="row"><input className="input" placeholder={t('intro.seed')} value={seed} onChange={(e) => setSeed(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void go(seed); }} aria-label={t('intro.seed')} data-testid="seed" /><button className="btn" data-testid="use-seed" onClick={() => void go(seed)}>{t('intro.useSeed')}</button></div>
              <div className="chips scroll" aria-label={t('intro.featured')} style={{ justifyContent: 'safe center' }}>{FEATURED_SEEDS.map((f) => { const pr = PREMISES.find((x) => x.id === f.premise); return <button key={f.seed} className={`chip clickable ${seed === f.seed ? 'active' : ''}`} title={pr?.blurb} onClick={() => setSeed(f.seed)}>{pr?.title ?? f.premise}</button>; })}</div>
              <div className="row" style={{ justifyContent: 'center' }}><button className="btn ghost" onClick={() => setSeed(randomSeed())}>🎲 {t('intro.random')}</button><button className="btn ghost" onClick={() => setShowSaves(true)}>💾 {t('intro.saves')}</button></div>
              {error && <div className="card" style={{ color: 'var(--bad)' }}>{error}</div>}
            </div>
            <InstallButton />
            <p className="dim" style={{ fontSize: 11 }}>{t('intro.offline')}</p>
          </>
        )}
      </div>
    </div>
  );
}
