import React, { useMemo } from 'react';
import { useGame } from '@/state/store';
import { useT } from '../i18n';
import { Drawer } from '../shell/Drawer';
import { EntityRow } from '../components/EntityRow';
import { EventCard } from '../components/EventCard';

export function ReligionsPanel(): React.ReactElement {
  const t = useT(); const world = useGame((s) => s.world)!; const version = useGame((s) => s.version); const setOverlay = useGame((s) => s.setOverlay);
  const faiths = useMemo(() => Object.values(world.organizations).filter((o) => o.type === 'religion').sort((a, b) => Number(b.alive) - Number(a.alive) || b.support - a.support), [world, version]);
  const recent = useMemo(() => world.events.filter((e) => e.type.startsWith('religion.') || e.type === 'sermon').slice(-6).reverse(), [world, version]);
  return (
    <Drawer title={t('panel.religions')} actions={<button className="btn ghost sm" onClick={() => { setOverlay('religion'); useGame.getState().setScreen('world'); }}>{t('common.focus')}</button>}>
      <div className="section-title">{t('religion.faiths')}</div>
      <div className="list">{faiths.map((o) => { const l = o.leaderId ? world.people[o.leaderId] : undefined; return <EntityRow key={o.id} refx={{ kind: 'organization', id: o.id }} name={o.name} sub={`${o.countryId ? world.countries[o.countryId]?.name ?? '' : t('org.type.international')}${l ? ` · ${l.name}` : ''}${!o.alive ? ` · †` : ''}`} right={<span className="mono">{o.support.toFixed(0)}% <span className="dim">{t('religion.followers')}</span></span>} />; })}</div>
      {recent.length > 0 && <><div className="section-title">{t('country.recentEvents')}</div><div className="list">{recent.map((e) => <EventCard key={e.id} ev={e} compact />)}</div></>}
    </Drawer>
  );
}
