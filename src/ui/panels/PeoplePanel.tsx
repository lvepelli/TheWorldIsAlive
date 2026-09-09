import React, { useMemo, useState } from 'react';
import { useGame } from '@/state/store';
import { useT } from '../i18n';
import { Drawer } from '../shell/Drawer';
import { EntityRow } from '../components/EntityRow';
import { ListControls, useListState, useSorted, type SortOpt } from './ListPanel';
import { profLabel , personTitle } from '../format';
import type { Person, Profession } from '@/engine/types';

type ProfFilter = Profession | 'all' | 'governor' | 'leader';
const PROFS: ProfFilter[] = ['all', 'leader', 'politician', 'governor', 'entrepreneur', 'executive', 'scientist', 'journalist', 'activist', 'general', 'celebrity', 'artist', 'diplomat', 'religious-leader', 'criminal', 'athlete', 'engineer'];

export function PeoplePanel(): React.ReactElement {
  const t = useT(); const world = useGame((s) => s.world)!; const version = useGame((s) => s.version);
  const st = useListState('influence'); const [prof, setProf] = useState<ProfFilter>('all'); const [dead, setDead] = useState(false);
  const leaders = useMemo(() => new Set(Object.values(world.countries).map((c) => c.leaderId)), [world, version]);
  const items = useMemo(() => Object.values(world.people).filter((p) => (dead || p.alive) && (prof === 'all' || (prof === 'governor' ? !!p.title?.startsWith('Governor of') : prof === 'leader' ? leaders.has(p.id) : p.profession === prof))), [world, version, prof, dead, leaders]);
  const sorts = useMemo<SortOpt<Person>[]>(() => [
    { id: 'influence', label: t('sort.influence'), by: (p) => p.influence }, { id: 'fame', label: t('sort.fame'), by: (p) => p.fame }, { id: 'wealth', label: t('sort.wealth'), by: (p) => p.wealth }, { id: 'reputation', label: t('sort.reputation'), by: (p) => p.reputation }, { id: 'name', label: t('sort.name'), by: (p) => p.name, desc: false },
  ], [t]);
  const list = useSorted(items, sorts, st.sort, st.query, (p) => `${p.name} ${p.title ?? ''} ${world.countries[p.countryId]?.name ?? ''}`).slice(0, 200);
  return (
    <Drawer title={t('panel.people')} sub={`${items.length}`}>
      <ListControls items={list} sorts={sorts} {...st}><label className="chip clickable"><input type="checkbox" checked={dead} onChange={(e) => setDead(e.target.checked)} /> {t('common.dead')}</label></ListControls>
      <div className="chips scroll">{PROFS.map((p) => <button key={p} className={`chip clickable ${prof === p ? 'active' : ''}`} onClick={() => setProf(p)}>{p === 'all' ? t('common.all') : p === 'leader' ? t('politics.leaders') : p === 'governor' ? t('prof.governor') : profLabel(p)}</button>)}</div>
      <div className="list">{list.map((p) => <EntityRow key={p.id} refx={{ kind: 'person', id: p.id }} name={p.name} sub={`${personTitle(p)} · ${world.countries[p.countryId]?.name ?? ''}${!p.alive ? ` · ${t('common.dead')}` : ''}`} right={<span className="mono dim">{p.influence.toFixed(0)}</span>} />)}</div>
    </Drawer>
  );
}
