import React, { useMemo } from 'react';
import { WorldMap } from '../map/WorldMap';
import { useGame } from '@/state/store';
import { useT } from '../i18n';
import { MapModes, MAP_MODES } from '../shell/MapModes';
import { renderEvent } from '@/engine/i18n/render';
import { catVar, sevLabel } from '../format';

/** Map-first surface: the map, a one-time welcome, the God-pick banner, and a compact bottom bar (map modes, links, ticker). */
export function WorldScreen(): React.ReactElement {
  return (
    <div className="map-root">
      <WorldMap />
      <div className="hud-top"><Onboarding /><PickBanner /></div>
      <HudBottom />
    </div>
  );
}

function Onboarding(): React.ReactElement | null {
  const t = useT(); const onboarded = useGame((s) => s.onboarded); const setOnboarded = useGame((s) => s.setOnboarded); const setScreen = useGame((s) => s.setScreen); const world = useGame((s) => s.world)!;
  if (onboarded) return null;
  return (
    <div className="panel welcome" role="note">
      <div className="kicker" style={{ color: 'var(--accent)' }}>{world.meta.name} · {world.meta.startYear}</div>
      <div className="title" style={{ fontSize: 15 }}>{t('onboard.title')}</div>
      {world.meta.premise && <div style={{ fontSize: 13, marginTop: 4 }}><b style={{ color: 'var(--accent)' }}>{world.meta.premise.title}.</b> {world.meta.premise.blurb}</div>}
      <div style={{ fontSize: 13, marginTop: 4 }}>{t('onboard.body')}</div>
      <div className="row" style={{ marginTop: 8 }}><button className="btn sm primary" onClick={() => { setOnboarded(); setScreen('god'); }}>✦ {t('nav.god')}</button><button className="btn sm ghost" data-testid="onboard-ok" onClick={setOnboarded}>{t('onboard.ok')}</button></div>
    </div>
  );
}

function PickBanner(): React.ReactElement | null {
  const t = useT(); const pick = useGame((s) => s.godPick); const setGodPick = useGame((s) => s.setGodPick); const setScreen = useGame((s) => s.setScreen);
  if (!pick) return null;
  return <div className="panel pick-banner"><span style={{ color: 'var(--accent)', fontWeight: 700 }}>✦ {t('god.tapCountry', { label: pick.key })}</span><button className="btn sm ghost" onClick={() => { setGodPick(null); setScreen('god'); }}>{t('common.cancel')}</button></div>;
}

function HudBottom(): React.ReactElement {
  const t = useT(); const world = useGame((s) => s.world)!; const version = useGame((s) => s.version); const select = useGame((s) => s.select);
  const links = useGame((s) => s.links); const setLinks = useGame((s) => s.setLinks); const overlay = useGame((s) => s.overlay);
  const items = useMemo(() => world.events.slice(-14).reverse().filter((e) => e.severity >= 2), [world, version]);
  const mode = MAP_MODES.find((m) => m.overlay === overlay)?.id ?? 'political';
  return (
    <div className="hud-bottom">
      <div className="hud-row">
        <MapModes />
        <button className={`btn ghost sm hide-mobile ${links !== 'none' ? 'active' : ''}`} title={t('map.links')} aria-label={t('map.links')} onClick={() => setLinks(links === 'auto' ? 'all' : links === 'all' ? 'none' : 'auto')}>{t(`map.links.${links}`)}</button>
        <span className="map-hint hide-mobile dim">{t(`map.hint.${mode}`)}</span>
      </div>
      <div className="panel ticker" aria-live="polite">
        <span className="kicker" style={{ color: 'var(--bad)' }}>LIVE</span>
        <div className="grow" style={{ overflow: 'hidden' }}>
          <div className="ticker-track" style={{ animationDuration: `${Math.max(30, items.length * 9)}s` }}>
            {[...items, ...items].map((e, i) => { const r = renderEvent(e, world); return (
              <span key={e.id + i} className="item clickable" onClick={() => select({ kind: 'event', id: e.id })}>
                <span className={`sev sev-${e.severity}`} role="img" aria-label={sevLabel(e.severity)} title={sevLabel(e.severity)} /><span style={{ color: catVar(e.category), textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.1em' }}>{t(`cat.${e.category}`)}</span><span>{r.title}</span>
              </span>); })}
          </div>
        </div>
      </div>
    </div>
  );
}
