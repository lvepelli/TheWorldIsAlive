import React, { useMemo } from 'react';
import { useGame } from '@/state/store';
import { useT } from '../i18n';
import { Drawer } from '../shell/Drawer';
import { EntityRow } from '../components/EntityRow';
import { ListControls, useListState, useSorted, type SortOpt } from './ListPanel';
import { countryPower } from '@/engine/simulation/systems';
import { fmtMoneyB, fmtPop, govLabel } from '../format';
import type { Country } from '@/engine/types';

export function CountriesPanel(): React.ReactElement {
  const t = useT(); const world = useGame((s) => s.world)!; const version = useGame((s) => s.version);
  const st = useListState('power');
  const items = useMemo(() => Object.values(world.countries), [world, version]);
  const sorts = useMemo<SortOpt<Country>[]>(() => [
    { id: 'power', label: t('sort.power'), by: (c) => countryPower(c) }, { id: 'gdp', label: t('sort.gdp'), by: (c) => c.gdp }, { id: 'population', label: t('sort.population'), by: (c) => c.population },
    { id: 'stability', label: t('sort.stability'), by: (c) => c.stability }, { id: 'unrest', label: t('sort.unrest'), by: (c) => c.unrest }, { id: 'name', label: t('sort.name'), by: (c) => c.name, desc: false },
  ], [t]);
  const list = useSorted(items, sorts, st.sort, st.query, (c) => `${c.name} ${c.government} ${c.ideology}`);
  return (
    <Drawer title={t('panel.countries')} sub={t('panel.countries.sub', { n: items.length })}>
      <ListControls items={list} sorts={sorts} {...st} />
      <div className="list">{list.map((c) => <EntityRow key={c.id} refx={{ kind: 'country', id: c.id }} name={c.name} sub={`${govLabel(c.government)} · ${fmtPop(c.population)} · ${fmtMoneyB(c.gdp)}${c.atWarWith.length ? ' · ⚔' : ''}`} right={<span className="mono" style={{ color: c.stability < 35 ? 'var(--bad)' : c.stability < 55 ? 'var(--warn)' : 'var(--ok)' }}>{c.stability.toFixed(0)}</span>} />)}</div>
    </Drawer>
  );
}
