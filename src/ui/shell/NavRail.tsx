import React from 'react';
import { useGame, type Screen } from '@/state/store';
import { useT } from '../i18n';

export const NAV_GROUPS: { id: string; items: { id: Screen; ico: string }[] }[] = [
  { id: 'world', items: [{ id: 'world', ico: '🌍' }, { id: 'events', ico: '⚡' }, { id: 'calendar', ico: '📅' }] },
  { id: 'entities', items: [{ id: 'countries', ico: '🏳' }, { id: 'regions', ico: '▦' }, { id: 'people', ico: '👤' }, { id: 'companies', ico: '🏢' }] },
  { id: 'systems', items: [{ id: 'economy', ico: '◈' }, { id: 'politics', ico: '🏛' }, { id: 'diplomacy', ico: '🤝' }, { id: 'technology', ico: '⚗' }, { id: 'society', ico: '✊' }, { id: 'religions', ico: '☼' }] },
  { id: 'media', items: [{ id: 'news', ico: '📰' }, { id: 'social', ico: '💬' }, { id: 'history', ico: '📜' }] },
  { id: 'tools', items: [{ id: 'god', ico: '✦' }] },
];

/** Left navigation rail (desktop). Sections open as a contextual drawer over the map; the map stays visible. */
export function NavRail(): React.ReactElement {
  const t = useT(); const screen = useGame((s) => s.screen); const setScreen = useGame((s) => s.setScreen);
  return (
    <nav className="nav-rail" aria-label={t('topbar.menu')}>
      {NAV_GROUPS.map((g) => (
        <div key={g.id} className="rail-group" role="group" aria-label={t(`nav.group.${g.id}`)}>
          {g.items.map((n) => <button key={n.id} className={`${screen === n.id ? 'active' : ''} ${n.id === 'god' ? 'god' : ''}`} onClick={() => setScreen(screen === n.id && n.id !== 'world' ? 'world' : n.id)} aria-label={t(`nav.${n.id}`)} title={t(`nav.${n.id}`)} data-nav={n.id}><span className="ico" aria-hidden>{n.ico}</span><span className="lbl">{t(`nav.${n.id}`)}</span></button>)}
        </div>
      ))}
    </nav>
  );
}
