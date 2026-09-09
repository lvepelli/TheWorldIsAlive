import React, { useMemo } from 'react';
import { useGame } from '@/state/store';
import { useT } from '../i18n';
import { Drawer } from '../shell/Drawer';
import { EntityRow } from '../components/EntityRow';
import { ListControls, useListState, useSorted, type SortOpt } from './ListPanel';
import { regionStats } from '@/engine/generator/regions';
import { fmtPop } from '../format';
import type { Region } from '@/engine/types';

export function RegionsPanel(): React.ReactElement {
  const t = useT(); const world = useGame((s) => s.world)!; const version = useGame((s) => s.version); const setOverlay = useGame((s) => s.setOverlay);
  const st = useListState('unrest');
  const items = useMemo(() => Object.values(world.regions ?? {}).filter((r) => world.countries[r.countryId]), [world, version]);
  const sorts = useMemo<SortOpt<Region>[]>(() => [
    { id: 'unrest', label: t('sort.unrest'), by: (r) => r.unrest }, { id: 'autonomy', label: t('sort.autonomy'), by: (r) => r.autonomy }, { id: 'identity', label: t('sort.identity'), by: (r) => r.identity },
    { id: 'population', label: t('sort.population'), by: (r) => regionStats(world, r).population }, { id: 'name', label: t('sort.name'), by: (r) => r.name, desc: false },
  ], [t, world]);
  const list = useSorted(items, sorts, st.sort, st.query, (r) => `${r.name} ${world.countries[r.countryId]?.name ?? ''}`);
  return (
    <Drawer title={t('panel.regions')} sub={`${items.length} ${t('stat.regionsN')}`} actions={<button className="btn ghost sm" onClick={() => { setOverlay('regions'); useGame.getState().setScreen('world'); }}>{t('common.focus')}</button>}>
      <ListControls items={list} sorts={sorts} {...st} />
      <div className="list">{list.map((r) => { const c = world.countries[r.countryId]; const mood = r.unrest > 60 ? 'angry' : r.unrest > 35 ? 'restless' : 'calm'; return <EntityRow key={r.id} refx={{ kind: 'region', id: r.id }} name={r.name} sub={`${c?.name ?? ''} · ${fmtPop(regionStats(world, r).population)} · ${t(`region.mood.${mood}`)}${r.autonomy >= 50 ? ` · ${t('region.autonomous')}` : ''}`} right={<span className="mono" style={{ color: r.unrest > 60 ? 'var(--bad)' : r.unrest > 35 ? 'var(--warn)' : 'var(--ok)' }}>{r.unrest.toFixed(0)}</span>} />; })}</div>
    </Drawer>
  );
}
