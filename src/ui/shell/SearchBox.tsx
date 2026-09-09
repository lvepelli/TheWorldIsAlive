import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '@/state/store';
import type { EntityRef } from '@/engine/types';
import { useT } from '../i18n';
import { personTitle } from '../format';
import { renderEvent } from '@/engine/i18n/render';

interface Hit { ref: EntityRef; name: string; sub: string; x?: number; y?: number; zoom?: number }

/** Global search across countries, regions, cities, people, companies, organizations and events. */
export function SearchBox(): React.ReactElement {
  const t = useT(); const world = useGame((s) => s.world)!; const version = useGame((s) => s.version);
  const select = useGame((s) => s.select); const focusOn = useGame((s) => s.focusOn); const setScreen = useGame((s) => s.setScreen);
  const [q, setQ] = useState(''); const [open, setOpen] = useState(false); const [cursor, setCursor] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  const hits = useMemo<Hit[]>(() => {
    const s = q.trim().toLowerCase(); if (s.length < 2) return [];
    const out: Hit[] = []; const m = (n: string) => n.toLowerCase().includes(s);
    for (const c of Object.values(world.countries)) if (m(c.name)) out.push({ ref: { kind: 'country', id: c.id }, name: c.name, sub: t('entity.country'), x: c.centroid.x, y: c.centroid.y, zoom: 2.2 });
    for (const r of Object.values(world.regions ?? {})) if (m(r.name)) { const ct = world.cities[r.cityIds[0]]; out.push({ ref: { kind: 'region', id: r.id }, name: r.name, sub: `${t('entity.region')} · ${world.countries[r.countryId]?.name ?? ''}`, x: ct?.x, y: ct?.y, zoom: 3 }); }
    for (const c of Object.values(world.cities)) if (m(c.name)) out.push({ ref: { kind: 'city', id: c.id }, name: c.name, sub: `${t('entity.city')} · ${world.countries[c.countryId]?.name ?? ''}`, x: c.x, y: c.y, zoom: 4 });
    for (const p of Object.values(world.people)) if (p.alive && m(p.name)) out.push({ ref: { kind: 'person', id: p.id }, name: p.name, sub: `${personTitle(p)} · ${world.countries[p.countryId]?.name ?? ''}` });
    for (const c of Object.values(world.companies)) if (c.alive && m(c.name)) out.push({ ref: { kind: 'company', id: c.id }, name: c.name, sub: `${t('entity.company')} · ${world.countries[c.countryId]?.name ?? ''}` });
    for (const o of Object.values(world.organizations)) if (o.alive && m(o.name)) out.push({ ref: { kind: 'organization', id: o.id }, name: o.name, sub: t(`org.type.${o.type}`) });
    if (out.length < 12) for (let i = world.events.length - 1; i >= 0 && out.length < 16; i--) { const e = world.events[i]; const r = renderEvent(e, world); if (m(r.title) || m(e.title)) out.push({ ref: { kind: 'event', id: e.id }, name: r.title, sub: t('entity.event'), x: e.location.x, y: e.location.y, zoom: 2.4 }); }
    return out.slice(0, 14);
  }, [q, world, version, t]);
  const go = (h: Hit) => { select(h.ref); if (h.x !== undefined && h.y !== undefined) { focusOn(h.x, h.y, h.zoom); } setScreen('world'); setOpen(false); setQ(''); };
  return (
    <div className="search" ref={box} role="search">
      <input className="input" value={q} placeholder={t('topbar.search')} aria-label={t('common.search')} data-testid="search" onChange={(e) => { setQ(e.target.value); setOpen(true); setCursor(0); }} onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(hits.length - 1, c + 1)); } if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); } if (e.key === 'Enter' && hits[cursor]) go(hits[cursor]); if (e.key === 'Escape') setOpen(false); }} />
      {open && q.trim().length >= 2 && (
        <div className="search-results" role="listbox">
          {hits.length === 0 && <div className="dim" style={{ padding: 8 }}>{t('common.noResults')}</div>}
          {hits.map((h, i) => <button key={`${h.ref.kind}-${h.ref.id}`} role="option" aria-selected={i === cursor} className={`search-hit ${i === cursor ? 'active' : ''}`} onMouseEnter={() => setCursor(i)} onClick={() => go(h)}><span className="name">{h.name}</span><span className="dim">{h.sub}</span></button>)}
        </div>
      )}
    </div>
  );
}
