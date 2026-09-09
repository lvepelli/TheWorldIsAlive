import React, { useMemo, useState } from 'react';
import { WorldMap } from '../map/WorldMap';
import { useGame, type MapOverlay, type Speed } from '@/state/store';
import { formatDate } from '@/engine/time';
import { catVar } from '../format';
import { audio } from '../audio';
import { Modal } from '../components/Modal';
import { SaveManager } from './SaveManager';

const OVERLAYS: { id: MapOverlay; label: string }[] = [
  { id: 'political', label: 'Political' }, { id: 'stability', label: 'Stability' }, { id: 'economy', label: 'Wealth' }, { id: 'tension', label: 'Tension' }, { id: 'happiness', label: 'Mood' }, { id: 'tech', label: 'Tech' }, { id: 'trade', label: 'Trade' }, { id: 'climate', label: 'Climate' },
];

export function WorldScreen(): React.ReactElement {
  return (
    <div className="map-root">
      <WorldMap />
      <HudTop />
      <HudBottom />
    </div>
  );
}

function HudTop(): React.ReactElement {
  const world = useGame((s) => s.world)!;
  const version = useGame((s) => s.version);
  const speed = useGame((s) => s.speed);
  const setSpeed = useGame((s) => s.setSpeed);
  const advance = useGame((s) => s.advance);
  const settings = useGame((s) => s.settings);
  const setSetting = useGame((s) => s.setSetting);
  const [menu, setMenu] = useState(false);
  const [saves, setSaves] = useState(false);
  void version;
  const speeds: { s: Speed; l: string }[] = [{ s: 0, l: '❚❚' }, { s: 1, l: '1×' }, { s: 5, l: '5×' }, { s: 20, l: '20×' }, { s: 100, l: '≫' }];
  return (
    <div className="hud-top">
      <div className="panel clock">
        <div className="col" style={{ gap: 0 }}>
          <span className="kicker ellipsis" style={{ maxWidth: 140 }}>{world.meta.name}</span>
          <span className="date">{formatDate(world.day, world.meta.startYear, 'short')}</span>
        </div>
        <div className="speeds">{speeds.map((x) => <button key={x.s} className={speed === x.s ? 'active' : ''} onClick={() => setSpeed(x.s)} aria-label={`Speed ${x.l}`}>{x.l}</button>)}</div>
        <button className="btn ghost sm hide-mobile" onClick={() => setMenu(true)} aria-label="Advance time">Advance ▾</button>
        <button className="btn ghost sm hide-desktop" onClick={() => setMenu(true)} aria-label="Advance time">▾</button>
      </div>
      <div className="grow" />
      <div className="row hide-mobile" style={{ gap: 6 }}>
        <button className="btn icon panel" title={settings.audio ? 'Mute' : 'Enable audio'} onClick={() => { setSetting('audio', !settings.audio); audio.play('click'); }} aria-label="Toggle audio">{settings.audio ? '🔊' : '🔇'}</button>
        <button className="btn icon panel" title="Saves" onClick={() => setSaves(true)} aria-label="Save and load">💾</button>
        <button className="btn icon panel" title="Copy a link to this world's seed" onClick={() => { const url = `${location.origin}${location.pathname}?seed=${encodeURIComponent(world.meta.seed)}`; navigator.clipboard?.writeText(url).then(() => alert(`Link copied:\n${url}`)).catch(() => prompt('Copy this link', url)); }} aria-label="Share seed">🔗</button>
      </div>
      {menu && (
        <Modal title="Advance time" onClose={() => setMenu(false)}>
          <p className="muted">Fast-forward the simulation. Larger jumps run instantly; events, news and markets will catch up.</p>
          <div className="grid-3">
            {[['1 day', 1], ['1 week', 7], ['1 month', 30], ['3 months', 90], ['1 year', 365], ['5 years', 1825]].map(([l, d]) => (
              <button key={l} className="btn" onClick={() => { setMenu(false); setTimeout(() => advance(d as number), 30); }}>{l}</button>
            ))}
          </div>
        </Modal>
      )}
      {saves && <Modal title="Saves" onClose={() => setSaves(false)}><SaveManager onDone={() => setSaves(false)} /></Modal>}
    </div>
  );
}

function Onboarding(): React.ReactElement | null {
  const onboarded = useGame((s) => s.onboarded);
  const setOnboarded = useGame((s) => s.setOnboarded);
  const setScreen = useGame((s) => s.setScreen);
  const world = useGame((s) => s.world)!;
  if (onboarded) return null;
  const cs = Object.values(world.countries); const pop = cs.reduce((a, c) => a + c.population, 0); const wars = cs.reduce((a, c) => a + c.atWarWith.length, 0) / 2;
  const biggest = cs.slice().sort((a, b) => b.gdp - a.gdp)[0]; const fragile = cs.slice().sort((a, b) => a.stability - b.stability)[0];
  return (
    <div className="panel" style={{ padding: '10px 12px', borderColor: 'rgba(240,179,90,0.4)', maxWidth: 520, alignSelf: 'flex-start' }} role="note">
      <div className="kicker" style={{ color: 'var(--accent)' }}>{world.meta.name} · year {world.meta.startYear}</div>
      <div className="row wrap" style={{ gap: 12, margin: '4px 0 6px', fontSize: 12 }}><span><b className="mono">{cs.length}</b> nations</span><span><b className="mono">{(pop / 1e9).toFixed(1)}B</b> people</span><span><b className="mono">{wars}</b> war{wars === 1 ? '' : 's'}</span><span>Superpower: <b>{biggest?.name}</b></span><span>Most fragile: <b>{fragile?.name}</b></span></div>
      {world.meta.premise && <div style={{ fontSize: 13, marginTop: 2 }}><b style={{ color: 'var(--accent)' }}>{world.meta.premise.title}.</b> {world.meta.premise.blurb}</div>}
      <div style={{ fontSize: 13, marginTop: 4 }}>Tap a glowing city or a nation to inspect it. Time runs at the top. Talk to anyone in their profile — advice can change their mind. When you are ready to make history, open <b>✦ God Mode</b>.</div>
      <div className="row" style={{ marginTop: 8 }}><button className="btn sm primary" onClick={() => { setOnboarded(); setScreen('god'); }}>Open God Mode</button><button className="btn sm ghost" onClick={setOnboarded}>Got it</button></div>
    </div>
  );
}

function PickBanner(): React.ReactElement | null {
  const pick = useGame((s) => s.godPick); const setGodPick = useGame((s) => s.setGodPick); const setScreen = useGame((s) => s.setScreen);
  if (!pick) return null;
  return <div className="panel" style={{ padding: '8px 12px', borderColor: 'rgba(240,179,90,0.6)', alignSelf: 'center', display: 'flex', gap: 10, alignItems: 'center' }}><span style={{ color: 'var(--accent)', fontWeight: 700 }}>✦ Tap a nation on the map</span><button className="btn sm ghost" onClick={() => { setGodPick(null); setScreen('god'); }}>Cancel</button></div>;
}

function HudBottom(): React.ReactElement {
  const overlay = useGame((s) => s.overlay);
  const setOverlay = useGame((s) => s.setOverlay);
  const links = useGame((s) => s.links);
  const setLinks = useGame((s) => s.setLinks);
  const last = useGame((s) => s.lastDayEvents);
  const select = useGame((s) => s.select);
  const world = useGame((s) => s.world)!;
  const version = useGame((s) => s.version);
  const items = useMemo(() => (last.length ? last : world.events.slice(-6)).slice(-8).reverse(), [last, world, version]);
  const wars = Object.values(world.countries).reduce((s, c) => s + c.atWarWith.length, 0) / 2;
  return (
    <div className="hud-bottom">
      <PickBanner />
      <Onboarding />
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', gap: 6 }}>
        <div className="panel overlay-picker" role="tablist" aria-label="Map overlay" style={{ overflowX: 'auto', maxWidth: '100%' }}>
          {OVERLAYS.map((o) => <button key={o.id} className={overlay === o.id ? 'active' : ''} onClick={() => setOverlay(o.id)} role="tab" aria-selected={overlay === o.id}>{o.label}</button>)}
          <span style={{ width: 1, background: 'var(--line)', margin: '0 2px' }} />
          <button className={links !== 'none' ? 'active' : ''} title="Toggle alliance/trade/war links" onClick={() => setLinks(links === 'auto' ? 'all' : links === 'all' ? 'none' : 'auto')} aria-label="Links mode">{links === 'auto' ? 'Links' : links === 'all' ? 'All links' : 'No links'}</button>
        </div>
        <div className="panel map-legend hide-mobile">
          <span>{Object.keys(world.countries).length} nations</span><span>·</span><span>{wars} war{wars === 1 ? '' : 's'}</span><span>·</span><span>{world.events.length} events</span>
        </div>
      </div>
      <div className="panel ticker" aria-live="polite">
        <span className="kicker" style={{ color: 'var(--bad)' }}>LIVE</span>
        <div className="grow" style={{ overflow: 'hidden' }}>
          <div className="ticker-track" style={{ animationDuration: `${Math.max(30, items.length * 9)}s` }}>
            {[...items, ...items].map((e, i) => (
              <span key={e.id + i} className="item clickable" onClick={() => select({ kind: 'event', id: e.id })}>
                <span className={`sev sev-${e.severity}`} /><span style={{ color: catVar(e.category), textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.1em' }}>{e.category}</span><span>{e.title}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
