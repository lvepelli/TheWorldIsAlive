import React, { useEffect, useState } from 'react';
import { useGame, type Screen } from '@/state/store';
import { startLoop } from '@/state/loop';
import { WorldScreen } from './screens/WorldScreen';
import { NewsScreen } from './screens/NewsScreen';
import { SocialScreen } from './screens/SocialScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { GodScreen } from './screens/GodScreen';
import { Inspector } from './components/Inspector';
import { Intro } from './Intro';
import { Cinematic, Toasts } from './Overlays';
import { audio } from './audio';
import { TopBar } from './shell/TopBar';
import { NavRail, NAV_GROUPS } from './shell/NavRail';
import { Drawer } from './shell/Drawer';
import { AlertsPanel } from './shell/AlertsPanel';
import { SettingsModal } from './shell/SettingsModal';
import { Modal } from './components/Modal';
import { useT } from './i18n';
import { CountriesPanel } from './panels/CountriesPanel';
import { RegionsPanel } from './panels/RegionsPanel';
import { PeoplePanel } from './panels/PeoplePanel';
import { CompaniesPanel } from './panels/CompaniesPanel';
import { EconomyPanel } from './panels/EconomyPanel';
import { PoliticsPanel } from './panels/PoliticsPanel';
import { DiplomacyPanel } from './panels/DiplomacyPanel';
import { TechnologyPanel } from './panels/TechnologyPanel';
import { SocietyPanel } from './panels/SocietyPanel';
import { ReligionsPanel } from './panels/ReligionsPanel';
import { CalendarPanel } from './panels/CalendarPanel';
import { EventsPanel } from './panels/EventsPanel';

const MOBILE_PRIMARY: Screen[] = ['world', 'events', 'news', 'god'];
const WIDE: Screen[] = ['economy', 'diplomacy', 'events', 'history', 'news', 'god', 'calendar'];

export function App(): React.ReactElement {
  const t = useT();
  const phase = useGame((s) => s.phase); const screen = useGame((s) => s.screen); const setScreen = useGame((s) => s.setScreen);
  const selection = useGame((s) => s.selection); const settings = useGame((s) => s.settings);
  const [more, setMore] = useState(false); const [menu, setMenu] = useState(false);
  useEffect(() => startLoop(), []);
  useEffect(() => { audio.setEnabled(settings.audio); }, [settings.audio]);
  useEffect(() => { const el = document.documentElement; el.toggleAttribute('data-large-text', settings.largeText); el.toggleAttribute('data-high-contrast', settings.highContrast); el.lang = settings.lang; }, [settings.largeText, settings.highContrast, settings.lang]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName; if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const st = useGame.getState(); if (st.phase !== 'playing') return;
      if (e.key === ' ') { e.preventDefault(); st.setSpeed(st.speed === 0 ? 1 : 0); }
      if (e.key === '1') st.setSpeed(1); if (e.key === '2') st.setSpeed(5); if (e.key === '3') st.setSpeed(20); if (e.key === '4') st.setSpeed(100);
      if (e.key === 'Escape') { if (st.cinematic) st.dismissCinematic(); else if (st.selection) st.select(null); else if (st.screen !== 'world') st.setScreen('world'); }
      if (e.key === 'g') st.setScreen('god'); if (e.key === 'w') st.setScreen('world'); if (e.key === 'e') st.setScreen('events');
      if (e.key.toLowerCase() === 'd' && e.shiftKey) st.setSetting('debug', !st.settings.debug);
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, []);
  if (phase !== 'playing') return <Intro />;
  const panelOpen = screen !== 'world';
  const wide = WIDE.includes(screen);
  return (
    <ErrorBoundary>
      <div className={`app ${selection ? 'with-inspector' : ''} ${panelOpen ? 'with-panel' : ''} ${wide ? 'panel-wide' : ''}`}>
        <TopBar onMenu={() => setMenu(true)} />
        <NavRail />
        <main className="app-main">
          <WorldScreen />
          {panelOpen && !selection && <div className="right-col" data-testid="panel-col"><SectionView screen={screen} /></div>}
          <Inspector />
        </main>
        <nav className="bottom-nav" aria-label={t('topbar.menu')}>
          {MOBILE_PRIMARY.map((id) => { const n = NAV_GROUPS.flatMap((g) => g.items).find((x) => x.id === id)!; return <button key={id} className={`${screen === id ? 'active' : ''} ${id === 'god' ? 'god' : ''}`} data-nav={id} onClick={() => { setScreen(id); if (id === 'world') useGame.getState().select(null); }} aria-label={t(`nav.${id}`)}><span className="ico">{n.ico}</span>{t(`nav.${id}`)}</button>; })}
          <button className={!MOBILE_PRIMARY.includes(screen) ? 'active' : ''} onClick={() => setMore(true)} aria-label={t('nav.more')} data-nav="more"><span className="ico">☰</span>{t('nav.more')}</button>
        </nav>
        {more && (
          <Modal title={t('nav.more')} onClose={() => setMore(false)}>
            {NAV_GROUPS.map((g) => <div key={g.id} style={{ marginBottom: 10 }}><div className="section-title">{t(`nav.group.${g.id}`)}</div><div className="grid-3">{g.items.map((n) => <button key={n.id} className={`btn ${screen === n.id ? 'primary' : ''}`} data-nav={n.id} onClick={() => { setScreen(n.id); setMore(false); }}>{n.ico} {t(`nav.${n.id}`)}</button>)}</div></div>)}
            <div className="divider" />
            <div className="row wrap"><button className="btn" onClick={() => { setMore(false); setScreen('alerts'); }}>🔔 {t('nav.alerts')}</button><button className="btn" data-testid="open-settings" onClick={() => { setMore(false); setMenu(true); }}>⚙ {t('nav.settings')}</button></div>
          </Modal>
        )}
        {menu && <SettingsModal onClose={() => setMenu(false)} />}
        <Toasts />
        <Cinematic />
        {settings.debug && <Debug />}
      </div>
    </ErrorBoundary>
  );
}

function SectionView({ screen }: { screen: Screen }): React.ReactElement | null {
  const t = useT();
  switch (screen) {
    case 'countries': return <CountriesPanel />;
    case 'regions': return <RegionsPanel />;
    case 'people': return <PeoplePanel />;
    case 'companies': return <CompaniesPanel />;
    case 'economy': return <EconomyPanel />;
    case 'politics': return <PoliticsPanel />;
    case 'diplomacy': return <DiplomacyPanel />;
    case 'technology': return <TechnologyPanel />;
    case 'society': return <SocietyPanel />;
    case 'religions': return <ReligionsPanel />;
    case 'calendar': return <CalendarPanel />;
    case 'events': return <EventsPanel />;
    case 'alerts': return <AlertsPanel />;
    case 'news': return <Drawer title={t('panel.news')} wide><NewsScreen /></Drawer>;
    case 'social': return <Drawer title={t('panel.social')}><SocialScreen /></Drawer>;
    case 'history': return <Drawer title={t('panel.history')} wide><HistoryScreen /></Drawer>;
    case 'god': return <Drawer title={t('panel.god')} wide><GodScreen /></Drawer>;
    default: return null;
  }
}

function Debug(): React.ReactElement {
  const t = useT(); const world = useGame((s) => s.world)!; const perf = useGame((s) => s.perf); const version = useGame((s) => s.version); const speed = useGame((s) => s.speed);
  const [fps, setFps] = useState(0);
  useEffect(() => { let frames = 0, last = performance.now(), raf = 0; const loop = (tm: number) => { frames++; if (tm - last > 1000) { setFps(frames); frames = 0; last = tm; } raf = requestAnimationFrame(loop); }; raf = requestAnimationFrame(loop); return () => cancelAnimationFrame(raf); }, []);
  return (
    <div className="debug">
      <div>seed {world.meta.seed} · day {world.day} · v{version}</div>
      <div>speed {speed}× · tps {perf.tps} · fps {fps}</div>
      <div>{Object.keys(world.countries).length}c {Object.keys(world.cities).length}ci {Object.keys(world.people).length}p {Object.keys(world.companies).length}co {Object.keys(world.organizations).length}o</div>
      <div>events {world.events.length} · pending {world.pending.length} · news {world.news.length} · social {world.social.length}</div>
      <div style={{ pointerEvents: 'auto' }}><button className="link" onClick={() => { if (confirm(t('settings.resetConfirm'))) void useGame.getState().newWorld(world.meta.seed); }}>{t('debug.reset')}</button></div>
    </div>
  );
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) { console.error('UI crashed', error, info); }
  render() {
    if (this.state.error) return (
      <div className="intro"><div className="intro-inner"><div className="logo">Error</div><p className="muted">{this.state.error.message}</p><div className="row"><button className="btn primary" onClick={() => this.setState({ error: null })}>↻</button><button className="btn" onClick={() => location.reload()}>⟳</button></div></div></div>
    );
    return this.props.children;
  }
}
