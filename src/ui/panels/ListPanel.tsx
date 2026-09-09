import React, { useMemo, useState } from 'react';
import { useT } from '../i18n';

export interface SortOpt<T> { id: string; label: string; by: (x: T) => number | string; desc?: boolean }

/** Shared searchable, sortable list scaffold for entity panels. */
export function ListControls<T>({ items, sorts, query, setQuery, sort, setSort, children }: { items: T[]; sorts: SortOpt<T>[]; query: string; setQuery: (q: string) => void; sort: string; setSort: (s: string) => void; children?: React.ReactNode }): React.ReactElement {
  const t = useT();
  return (
    <div className="row wrap" style={{ gap: 8 }}>
      <input className="input grow" style={{ minWidth: 140 }} placeholder={t('common.search')} aria-label={t('common.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
      <select className="select" style={{ width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value)} aria-label={t('common.sort')}>{sorts.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
      {children}
      <span className="dim mono" style={{ fontSize: 11 }}>{items.length}</span>
    </div>
  );
}

export function useSorted<T>(items: T[], sorts: SortOpt<T>[], sortId: string, query: string, text: (x: T) => string): T[] {
  return useMemo(() => {
    const q = query.trim().toLowerCase(); const s = sorts.find((x) => x.id === sortId) ?? sorts[0];
    const list = q ? items.filter((x) => text(x).toLowerCase().includes(q)) : items.slice();
    list.sort((a, b) => { const va = s.by(a), vb = s.by(b); const r = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb)); return s.desc === false ? r : -r; });
    return list;
  }, [items, sorts, sortId, query, text]);
}

export function useListState(defaultSort: string): { query: string; setQuery: (q: string) => void; sort: string; setSort: (s: string) => void } {
  const [query, setQuery] = useState(''); const [sort, setSort] = useState(defaultSort);
  return { query, setQuery, sort, setSort };
}
