import React, { useMemo } from 'react';
import { useGame } from '@/state/store';
import { useT } from '../i18n';
import { Drawer } from '../shell/Drawer';
import { EntityRow } from '../components/EntityRow';
import { EventCard } from '../components/EventCard';

export function TechnologyPanel(): React.ReactElement {
  const t = useT(); const world = useGame((s) => s.world)!; const version = useGame((s) => s.version); const setOverlay = useGame((s) => s.setOverlay);
  const ranking = useMemo(() => Object.values(world.countries).sort((a, b) => b.technology - a.technology), [world, version]);
  const recent = useMemo(() => world.events.filter((e) => e.type === 'tech.breakthrough' || e.type === 'discovery' || e.type === 'space.milestone' || e.type === 'tech.strategic').slice(-8).reverse(), [world, version]);
  return (
    <Drawer title={t('panel.technology')} actions={<button className="btn ghost sm" onClick={() => { setOverlay('tech'); useGame.getState().setScreen('world'); }}>{t('common.focus')}</button>}>
      <div className="section-title">{t('technology.breakthroughs')}</div>
      <div className="list">{recent.map((e) => <EventCard key={e.id} ev={e} compact />)}</div>
      <div className="section-title">{t('technology.ranking')}</div>
      <div className="list">{ranking.map((c, i) => <EntityRow key={c.id} refx={{ kind: 'country', id: c.id }} name={`${i + 1}. ${c.name}`} sub={`${t('stat.freedom')} ${c.freedom.toFixed(0)} · ${t('stat.growth')} ${c.gdpGrowth.toFixed(1)}%`} right={<span className="mono" style={{ color: 'var(--data)' }}>{c.technology.toFixed(0)}</span>} />)}</div>
    </Drawer>
  );
}
