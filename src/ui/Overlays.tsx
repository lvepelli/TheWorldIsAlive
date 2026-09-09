import React, { useEffect } from 'react';
import { useGame } from '@/state/store';
import { catVar, sevLabel } from './format';
import { renderEvent } from '@/engine/i18n/render';
import { useT, useLang } from './i18n';

const KICKERS_EN: Record<string, string> = {
  'war.declared': 'WAR DECLARED', 'war.ended': 'PEACE', 'government.collapse': 'GOVERNMENT COLLAPSED', 'leader.coup': "COUP D'ÉTAT", 'leader.revolution': 'REVOLUTION', 'economy.crash': 'MARKET CRASH', 'economy.crisis': 'ECONOMIC CRISIS',
  'economy.boom': 'ECONOMIC BOOM', 'disaster.meteor': 'IMPACT EVENT', 'health.pandemic': 'GLOBAL PANDEMIC', 'tech.breakthrough': 'BREAKTHROUGH', 'country.founded': 'A NATION IS BORN', 'death.assassination': 'ASSASSINATION', 'region.annexed': 'ANNEXATION',
  discovery: 'DISCOVERY', 'space.milestone': 'A GIANT LEAP', vaccine: 'THE CURE', 'government.reform': 'NEW ORDER', 'region.referendum.yes': 'SELF-RULE',
};
const KICKERS_ES: Record<string, string> = {
  'war.declared': 'GUERRA DECLARADA', 'war.ended': 'PAZ', 'government.collapse': 'CAE EL GOBIERNO', 'leader.coup': 'GOLPE DE ESTADO', 'leader.revolution': 'REVOLUCIÓN', 'economy.crash': 'CRAC BURSÁTIL', 'economy.crisis': 'CRISIS ECONÓMICA',
  'economy.boom': 'BONANZA ECONÓMICA', 'disaster.meteor': 'IMPACTO', 'health.pandemic': 'PANDEMIA MUNDIAL', 'tech.breakthrough': 'AVANCE', 'country.founded': 'NACE UNA NACIÓN', 'death.assassination': 'ASESINATO', 'region.annexed': 'ANEXIÓN',
  discovery: 'DESCUBRIMIENTO', 'space.milestone': 'UN GRAN SALTO', vaccine: 'LA CURA', 'government.reform': 'NUEVO ORDEN', 'region.referendum.yes': 'AUTOGOBIERNO',
};

export function Cinematic(): React.ReactElement | null {
  const t = useT(); const lang = useLang(); const world = useGame((s) => s.world)!;
  const ev = useGame((s) => s.cinematic); const dismiss = useGame((s) => s.dismissCinematic); const select = useGame((s) => s.select);
  useEffect(() => { if (!ev) return; const id = setTimeout(dismiss, 5200); return () => clearTimeout(id); }, [ev, dismiss]);
  if (!ev) return null;
  const K = lang === 'es' ? KICKERS_ES : KICKERS_EN;
  const kicker = K[ev.type] ?? (ev.type.startsWith('disaster.') ? (lang === 'es' ? 'DESASTRE' : 'DISASTER') : t(`cat.${ev.category}`).toUpperCase());
  const color = ev.playerIntervention ? 'var(--accent)' : catVar(ev.category);
  const r = renderEvent(ev, world);
  return (
    <div className="cinematic" style={{ ['--c' as string]: color }} onClick={dismiss} role="dialog" aria-label={r.title}>
      <div className="bars" />
      <div className="inner">
        <div className="kicker">{ev.playerIntervention ? `✦ ${t('events.divine').toUpperCase()} · ` : ''}{kicker}</div>
        <div className="big">{r.title}</div>
        <div className="line" />
        <div className="sub">{r.description.split('. ').slice(0, 2).join('. ')}{r.description.includes('. ') ? '.' : ''}</div>
        <div className="hint">{t('cinematic.tap').toUpperCase()} · <span className="link" onClick={(e) => { e.stopPropagation(); dismiss(); select({ kind: 'event', id: ev.id }); }}>{t('common.open').toUpperCase()}</span></div>
      </div>
    </div>
  );
}

export function Toasts(): React.ReactElement {
  const t = useT(); const world = useGame((s) => s.world)!;
  const toasts = useGame((s) => s.toasts); const select = useGame((s) => s.select); const dismiss = useGame((s) => s.dismissToast);
  const screen = useGame((s) => s.screen); const selection = useGame((s) => s.selection);
  return (
    <div className={`toasts ${screen !== 'world' && !selection ? 'docked' : ''}`} aria-live="polite">
      {toasts.map((x) => { const r = renderEvent(x.event, world); return (
        <div key={x.id} className="toast" style={{ ['--c' as string]: x.event.playerIntervention ? 'var(--accent)' : catVar(x.event.category) }} onClick={() => { dismiss(x.id); select({ kind: 'event', id: x.event.id }); }}>
          <div className="rail" />
          <div><div className="s">{t(`cat.${x.event.category}`)} · {sevLabel(x.event.severity)}</div><div className="t">{r.title}</div></div>
          <button className="btn ghost sm" onClick={(e) => { e.stopPropagation(); dismiss(x.id); }} aria-label={t('common.dismiss')}>✕</button>
        </div>); })}
    </div>
  );
}
