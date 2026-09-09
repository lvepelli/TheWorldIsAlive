import React, { useEffect } from 'react';
import { useGame } from '@/state/store';
import { catVar } from './format';

const KICKERS: Record<string, string> = {
  'war.declared': 'WAR DECLARED', 'war.ended': 'PEACE', 'government.collapse': 'GOVERNMENT COLLAPSED', 'leader.coup': 'COUP D\'ÉTAT', 'leader.revolution': 'REVOLUTION', 'economy.crash': 'MARKET CRASH', 'economy.crisis': 'ECONOMIC CRISIS',
  'economy.boom': 'ECONOMIC BOOM', 'economy.energy-crisis': 'ENERGY CRISIS', 'disaster.meteor': 'IMPACT EVENT', 'health.pandemic': 'GLOBAL PANDEMIC', 'tech.breakthrough': 'BREAKTHROUGH', 'country.founded': 'A NATION IS BORN', 'death.assassination': 'ASSASSINATION',
  'region.destabilized': 'REGION IN CHAOS', 'tech.acceleration': 'GOLDEN AGE', discovery: 'DISCOVERY', 'space.milestone': 'A GIANT LEAP', vaccine: 'THE CURE', 'government.reform': 'NEW ORDER',
};

export function Cinematic(): React.ReactElement | null {
  const ev = useGame((s) => s.cinematic);
  const dismiss = useGame((s) => s.dismissCinematic);
  const select = useGame((s) => s.select);
  useEffect(() => { if (!ev) return; const t = setTimeout(dismiss, 5200); return () => clearTimeout(t); }, [ev, dismiss]);
  if (!ev) return null;
  const kicker = KICKERS[ev.type] ?? (ev.type.startsWith('disaster.') ? 'DISASTER' : ev.category.toUpperCase());
  const color = ev.playerIntervention ? 'var(--accent)' : catVar(ev.category);
  return (
    <div className="cinematic" style={{ ['--c' as string]: color }} onClick={dismiss} role="dialog" aria-label={ev.title}>
      <div className="bars" />
      <div className="inner">
        <div className="kicker">{ev.playerIntervention ? '✦ DIVINE INTERVENTION · ' : ''}{kicker}</div>
        <div className="big">{ev.title}</div>
        <div className="line" />
        <div className="sub">{ev.description.split('. ').slice(0, 2).join('. ')}{ev.description.includes('. ') ? '.' : ''}</div>
        <div className="hint">TAP TO CONTINUE · <span className="link" onClick={(e) => { e.stopPropagation(); dismiss(); select({ kind: 'event', id: ev.id }); }}>INSPECT</span></div>
      </div>
    </div>
  );
}

export function Toasts(): React.ReactElement {
  const toasts = useGame((s) => s.toasts);
  const select = useGame((s) => s.select);
  const dismiss = useGame((s) => s.dismissToast);
  const screen = useGame((s) => s.screen);
  // On phones, list screens keep their headers readable: toasts dock above the bottom nav instead of covering the top.
  return (
    <div className={`toasts ${screen !== 'world' ? 'docked' : ''}`} aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast" style={{ ['--c' as string]: t.event.playerIntervention ? 'var(--accent)' : catVar(t.event.category) }} onClick={() => { dismiss(t.id); select({ kind: 'event', id: t.event.id }); }}>
          <div className="rail" />
          <div><div className="s">{t.event.category} · severity {t.event.severity}</div><div className="t">{t.event.title}</div></div>
          <button className="btn ghost sm" onClick={(e) => { e.stopPropagation(); dismiss(t.id); }} aria-label="Dismiss">✕</button>
        </div>
      ))}
    </div>
  );
}
