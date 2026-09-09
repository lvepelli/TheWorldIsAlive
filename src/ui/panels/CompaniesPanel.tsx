import React, { useMemo, useState } from 'react';
import { useGame } from '@/state/store';
import { useT } from '../i18n';
import { Drawer } from '../shell/Drawer';
import { EntityRow } from '../components/EntityRow';
import { ListControls, useListState, useSorted, type SortOpt } from './ListPanel';
import { fmtMoneyB, sectorLabel, trendArrow, trendColor } from '../format';
import { pctChange } from '@/engine/simulation/markets';
import { SECTORS, type Company, type Sector } from '@/engine/types';

export function CompaniesPanel(): React.ReactElement {
  const t = useT(); const world = useGame((s) => s.world)!; const version = useGame((s) => s.version);
  const st = useListState('value'); const [sector, setSector] = useState<Sector | 'all'>('all');
  const items = useMemo(() => Object.values(world.companies).filter((c) => c.alive && (sector === 'all' || c.sector === sector)), [world, version, sector]);
  const sorts = useMemo<SortOpt<Company>[]>(() => [
    { id: 'value', label: t('sort.value'), by: (c) => c.value }, { id: 'revenue', label: t('sort.revenue'), by: (c) => c.revenue }, { id: 'employees', label: t('sort.employees'), by: (c) => c.employees }, { id: 'growth', label: t('sort.growth'), by: (c) => c.growth }, { id: 'reputation', label: t('sort.reputation'), by: (c) => c.reputation }, { id: 'name', label: t('sort.name'), by: (c) => c.name, desc: false },
  ], [t]);
  const list = useSorted(items, sorts, st.sort, st.query, (c) => `${c.name} ${c.ticker} ${world.countries[c.countryId]?.name ?? ''} ${c.sector}`).slice(0, 200);
  return (
    <Drawer title={t('panel.companies')} sub={`${items.length} ${t('stat.companiesN')}`}>
      <ListControls items={list} sorts={sorts} {...st} />
      <div className="chips scroll"><button className={`chip clickable ${sector === 'all' ? 'active' : ''}`} onClick={() => setSector('all')}>{t('common.all')}</button>{SECTORS.map((s) => <button key={s} className={`chip clickable ${sector === s ? 'active' : ''}`} onClick={() => setSector(s)}>{sectorLabel(s)}</button>)}</div>
      <div className="list">{list.map((c) => { const ch = pctChange(c.priceHistory ?? [], Math.min((c.priceHistory?.length ?? 1) - 1, 30)); return <EntityRow key={c.id} refx={{ kind: 'company', id: c.id }} name={c.name} sub={`${sectorLabel(c.sector)} · ${world.countries[c.countryId]?.name ?? ''} · ${fmtMoneyB(c.value)}`} right={<span className="trend" style={{ color: trendColor(ch) }}>{trendArrow(ch)} {Math.abs(ch).toFixed(1)} %</span>} />; })}</div>
    </Drawer>
  );
}
