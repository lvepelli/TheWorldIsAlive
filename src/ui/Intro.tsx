import React, { useEffect, useState } from 'react';
import { useGame, randomSeed } from '@/state/store';
import { SaveManager } from './screens/SaveManager';
import { SeedPreview } from './components/SeedPreview';
import { InstallButton } from './components/InstallButton';

export function Intro(): React.ReactElement {
  const phase = useGame((s) => s.phase);
  const newWorld = useGame((s) => s.newWorld);
  const genSteps = useGame((s) => s.genSteps);
  const refreshSaves = useGame((s) => s.refreshSaves);
  const saves = useGame((s) => s.saves);
  const loadWorld = useGame((s) => s.loadWorld);
  const [seed, setSeed] = useState('');
  const [showSaves, setShowSaves] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void refreshSaves(); }, [refreshSaves]);
  // Deep link: ?seed=... starts a world immediately (shareable worlds).
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const s = params.get('seed');
      if (s && phase === 'intro' && !sessionStorage.getItem('twia:deeplinked')) { sessionStorage.setItem('twia:deeplinked', '1'); setSeed(s); void newWorld(s); }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const autosave = saves.find((s) => s.slot === 'autosave');
  const go = async (s?: string) => { setError(null); try { await newWorld(s); } catch (e) { setError((e as Error).message); } };
  const ALL_STEPS = ['Shaping continents', 'Drawing borders', 'Founding cities', 'Raising leaders and citizens', 'Incorporating companies', 'Printing newspapers', 'Opening markets', 'Setting history in motion'];
  return (
    <div className="intro">
      <div className="intro-inner">
        {phase === 'generating' || showSaves ? <div className="orb" aria-hidden /> : <SeedPreview seed={seed || 'the-world-is-alive'} />}
        <h1 className="logo">The World<br />Is Alive<small>A LIVING CIVILIZATION SIMULATOR</small></h1>
        {phase === 'generating' ? (
          <div className="gen-steps" aria-live="polite">
            {ALL_STEPS.map((s, i) => { const done = genSteps.length > i + 1 || genSteps.length === ALL_STEPS.length; const active = genSteps.length === i + 1 && !done; return <div key={s} className={done ? 'done' : active ? 'active' : ''}><span>{done ? '✓' : active ? '▸' : '·'}</span>{s}{active && '…'}</div>; })}
          </div>
        ) : showSaves ? (
          <div style={{ width: '100%' }}><SaveManager onDone={() => setShowSaves(false)} /><button className="btn ghost" style={{ marginTop: 10 }} onClick={() => setShowSaves(false)}>← Back</button></div>
        ) : (
          <>
            <p className="muted" style={{ maxWidth: 420 }}>Generate a world of nations, cities, leaders, companies and citizens. Watch history emerge from their collisions. Then intervene as a god and see what you cause.</p>
            <div className="col" style={{ width: '100%', gap: 10 }}>
              {autosave && <button className="btn primary" style={{ minHeight: 48 }} onClick={() => void loadWorld('autosave')}>▶ Continue — {autosave.name}, {autosave.date}</button>}
              <button className={`btn ${autosave ? '' : 'primary'}`} style={{ minHeight: 48 }} onClick={() => void go()}>✦ Generate new world</button>
              <div className="row"><input className="input" placeholder="Custom seed (optional)" value={seed} onChange={(e) => setSeed(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void go(seed); }} aria-label="World seed" /><button className="btn" style={{ whiteSpace: 'nowrap' }} onClick={() => void go(seed || randomSeed())} disabled={!seed.trim()}>Use seed</button></div>
              <div className="row" style={{ justifyContent: 'center' }}><button className="btn ghost" onClick={() => setSeed(randomSeed())}>🎲 Random seed</button><button className="btn ghost" onClick={() => setShowSaves(true)}>💾 Saves & import</button></div>
              {error && <div className="card" style={{ color: 'var(--bad)' }}>{error}</div>}
            </div>
            <InstallButton />
            <p className="dim" style={{ fontSize: 11 }}>Runs entirely in your browser. No account, no server. Works offline once loaded.</p>
          </>
        )}
      </div>
    </div>
  );
}
