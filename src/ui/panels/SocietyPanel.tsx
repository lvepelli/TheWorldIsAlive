import React, { useMemo } from 'react';
import { useGame } from '@/state/store';
import { useT } from '../i18n';
import { Drawer } from '../shell/Drawer';
import { EntityRow } from '../components/EntityRow';
import { orgTypeLabel, ideoLabel } from '../format';

export function SocietyPanel(): React.ReactElement {
  const t = useT(); const world = useGame((s) => s.world)!; const version = useGame((s) => s.version); const setOverlay = useGame((s) => s.setOverlay);
  const movements = useMemo(() => Object.values(world.organizations).filter((o) => o.alive && (o.type === 'movement' || o.type === 'party' || o.type === 'union')).sort((a, b) => b.support - a.support).slice(0, 40), [world, version]);
  const restless = useMemo(() => Object.values(world.countries).sort((a, b) => b.unrest - a.unrest).slice(0, 8), [world, version]);
  const happy = useMemo(() => Object.values(world.countries).sort((a, b) => b.happiness - a.happiness).slice(0, 5), [world, version]);
  return (
    <Drawer title={t('panel.society')} actions={<button className="btn ghost sm" onClick={() => { setOverlay('happiness'); useGame.getState().setScreen('world'); }}>{t('common.focus')}</button>}>
      <div className="section-title">{t('society.unrest')}</div>
      <div className="list">{restless.map((c) => <EntityRow key={c.id} refx={{ kind: 'country', id: c.id }} name={c.name} sub={`${t('stat.polarization')} ${c.polarization.toFixed(0)} · ${t('stat.happiness')} ${c.happiness.toFixed(0)}`} right={<span className="mono" style={{ color: c.unrest > 50 ? 'var(--bad)' : c.unrest > 30 ? 'var(--warn)' : 'var(--ok)' }}>{c.unrest.toFixed(0)}</span>} />)}</div>
      <div className="section-title">{t('society.happiness')}</div>
      <div className="list">{happy.map((c) => <EntityRow key={c.id} refx={{ kind: 'country', id: c.id }} name={c.name} sub={`${t('stat.freedom')} ${c.freedom.toFixed(0)}`} right={<span className="mono" style={{ color: 'var(--ok)' }}>{c.happiness.toFixed(0)}</span>} />)}</div>
      <div className="section-title">{t('society.movements')}</div>
      <div className="list">{movements.map((o) => <EntityRow key={o.id} refx={{ kind: 'organization', id: o.id }} name={o.name} sub={`${orgTypeLabel(o.type)}${o.ideology ? ` · ${ideoLabel(o.ideology)}` : ''} · ${o.countryId ? world.countries[o.countryId]?.name ?? '' : t('org.type.international')}`} right={<span className="mono">{o.support.toFixed(0)}%</span>} />)}</div>
    </Drawer>
  );
}
