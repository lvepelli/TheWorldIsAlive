import React, { useEffect, useState } from 'react';
import { useGame, type Screen } from '@/state/store';
import { startLoop } from '@/state/loop';
import { WorldScreen } from './screens/WorldScreen';
import { LiveScreen } from './screens/LiveScreen';
import { NewsScreen } from './screens/NewsScreen';
import { SocialScreen } from './screens/SocialScreen';
import { MarketsScreen } from './screens/MarketsScreen';
import { PeopleScreen } from './screens/PeopleScreen';
import { OrgsScreen } from './screens/OrgsScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { GodScreen } from './screens/GodScreen';
import { Inspector } from './components/Inspector';
import { Intro } from './Intro';
import { Cinematic, Toasts } from './Overlays';
import { Modal } from './components/Modal';
import { SaveManager } from './screens/SaveManager';
import { InstallButton } from './components/InstallButton';
import { audio } from './audio';

const NAV: { id: Screen; label: string; ico: string }[] = [
  { id: 'world', label: 'World', ico: '🌍' }, { id: 'live', label: 'Live', ico: '⚡' }, { id: 'news', label: 'News', ico: '📰' }, { id: 'social', label: 'Social', ico: '💬' },
  { id: 'markets', label: 'Markets', ico: '📈' }, { id: 'people', label: 'People', ico: '👤' }, { id: 'orgs', label: 'Orgs', ico: '🏛' }, { id: 'history', label: 'History', ico: '📜' }, { id: 'god', label: 'God', ico: '✦' },
];
const MOBILE_PRIMARY: Screen[] = ['world', 'live', 'news', 'god'];

export function App(): React.ReactElement {
  const phase = useGame((s) => s.phase);
  const screen = useGame((s) => s.screen);
  const setScreen = useGame((s) => s.setScreen);
  const selection = useGame((s) => s.selection);
  const settings = useGame((s) => s.settings);
  const [more, setMore] = useState(false);
  const [saves, setSaves] = useState(false);
  useEffect(() => startLoop(), []);
  useEffect(() => { audio.setEnabled(settings.audio); }, [settings.audio]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA' || (e.target as HTMLElement)?.tagName === 'SELECT') return;
      const st = useGame.getState(); if (st.phase !== 'playing') return;
      if (e.key === ' ') { e.preventDefault(); st.setSpeed(st.speed === 0 ? 1 : 0); }
      if (e.key === '1') st.setSpeed(1); if (e.key === '2') st.setSpeed(5); if (e.key === '3') st.setSpeed(20); if (e.key === '4') st.setSpeed(100);
      if (e.key === 'Escape') { if (st.cinematic) st.dismissCinematic(); else st.select(null); }
      if (e.key === 'g') st.setScreen('god'); if (e.key === 'w') st.setScreen('world'); if (e.key === 'l') st.setScreen('live');
      if (e.key.toLowerCase() === 'd' && e.shiftKey) st.setSetting('debug', !st.settings.debug);
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, []);
  if (phase !== 'playing') return <Intro />;
  return (
    <ErrorBoundary>
      <div className={`app ${selection ? 'with-inspector' : ''}`}>
        <nav className="side-nav" aria-label="Main">
          <div className="brand" title="THE WORLD IS ALIVE">TWIA</div>
          {NAV.map((n) => <button key={n.id} className={`${screen === n.id ? 'active' : ''} ${n.id === 'god' ? 'god' : ''}`} onClick={() => setScreen(n.id)} aria-label={n.label}><span className="ico">{n.ico}</span>{n.label}</button>)}
          <div className="spacer" />
          <button onClick={() => useGame.getState().setSetting('debug', !settings.debug)} title="Debug (Shift+D)"><span className="ico">🛠</span>debug</button>
        </nav>
        <main className="app-main">
          <ScreenView screen={screen} />
          <Inspector />
        </main>
        <nav className="bottom-nav" aria-label="Main">
          {NAV.filter((n) => MOBILE_PRIMARY.includes(n.id)).map((n) => <button key={n.id} className={`${screen === n.id ? 'active' : ''} ${n.id === 'god' ? 'god' : ''}`} onClick={() => { setScreen(n.id); if (n.id === 'world') useGame.getState().select(null); }} aria-label={n.label}><span className="ico">{n.ico}</span>{n.label}</button>)}
          <button className={!MOBILE_PRIMARY.includes(screen) ? 'active' : ''} onClick={() => setMore(true)} aria-label="More"><span className="ico">☰</span>More</button>
        </nav>
        {more && (
          <Modal title="More" onClose={() => setMore(false)}>
            <div className="grid-3">{NAV.filter((n) => !MOBILE_PRIMARY.includes(n.id)).map((n) => <button key={n.id} className={`btn ${screen === n.id ? 'primary' : ''}`} onClick={() => { setScreen(n.id); setMore(false); }}>{n.ico} {n.label}</button>)}</div>
            <div className="divider" />
            <div className="row wrap"><button className="btn" onClick={() => { setMore(false); setSaves(true); }}>💾 Save / load / export</button><InstallButton /></div>
            <div className="row wrap">
              <label className="chip clickable"><input type="checkbox" checked={settings.audio} onChange={(e) => useGame.getState().setSetting('audio', e.target.checked)} /> audio</label>
              <label className="chip clickable"><input type="checkbox" checked={settings.cinematics} onChange={(e) => useGame.getState().setSetting('cinematics', e.target.checked)} /> cinematics</label>
              <label className="chip clickable"><input type="checkbox" checked={settings.debug} onChange={(e) => useGame.getState().setSetting('debug', e.target.checked)} /> debug</label>
            </div>
          </Modal>
        )}
        {saves && <Modal title="Saves" onClose={() => setSaves(false)}><SaveManager onDone={() => setSaves(false)} /></Modal>}
        <Toasts />
        <Cinematic />
        {settings.debug && <Debug />}
      </div>
    </ErrorBoundary>
  );
}

function ScreenView({ screen }: { screen: Screen }): React.ReactElement {
  switch (screen) {
    case 'world': return <WorldScreen />;
    case 'live': return <LiveScreen />;
    case 'news': return <NewsScreen />;
    case 'social': return <SocialScreen />;
    case 'markets': return <MarketsScreen />;
    case 'people': return <PeopleScreen />;
    case 'orgs': return <OrgsScreen />;
    case 'history': return <HistoryScreen />;
    case 'god': return <GodScreen />;
  }
}

function Debug(): React.ReactElement {
  const world = useGame((s) => s.world)!; const perf = useGame((s) => s.perf); const version = useGame((s) => s.version); const speed = useGame((s) => s.speed);
  const [fps, setFps] = useState(0);
  useEffect(() => { let frames = 0, last = performance.now(), raf = 0; const loop = (t: number) => { frames++; if (t - last > 1000) { setFps(frames); frames = 0; last = t; } raf = requestAnimationFrame(loop); }; raf = requestAnimationFrame(loop); return () => cancelAnimationFrame(raf); }, []);
  return (
    <div className="debug">
      <div>seed {world.meta.seed} · day {world.day} · v{version}</div>
      <div>speed {speed}× · tps {perf.tps} · fps {fps}</div>
      <div>{Object.keys(world.countries).length}c {Object.keys(world.cities).length}ci {Object.keys(world.people).length}p {Object.keys(world.companies).length}co {Object.keys(world.organizations).length}o</div>
      <div>events {world.events.length} · pending {world.pending.length} · news {world.news.length} · social {world.social.length}</div>
      <div style={{ pointerEvents: 'auto' }}><button className="link" onClick={() => { if (confirm('Reset simulation to a fresh world with the same seed?')) void useGame.getState().newWorld(world.meta.seed); }}>reset</button></div>
    </div>
  );
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) { console.error('UI crashed', error, info); }
  render() {
    if (this.state.error) return (
      <div className="intro"><div className="intro-inner"><div className="logo">Something broke</div><p className="muted">{this.state.error.message}</p><div className="row"><button className="btn primary" onClick={() => this.setState({ error: null })}>Try to continue</button><button className="btn" onClick={() => { useGame.getState().toIntro(); this.setState({ error: null }); }}>Back to title</button></div></div></div>
    );
    return this.props.children;
  }
}
