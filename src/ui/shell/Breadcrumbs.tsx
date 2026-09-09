import React from 'react';
import { useGame } from '@/state/store';
import type { EntityRef, World } from '@/engine/types';
import { renderEvent } from '@/engine/i18n/render';
import { useT } from '../i18n';

/** World → country → region → city → entity trail for the selected entity. */
export function crumbsFor(world: World, ref: EntityRef): { ref?: EntityRef; label: string }[] {
  const out: { ref?: EntityRef; label: string }[] = [];
  const country = (id?: string) => { const c = id ? world.countries[id] : undefined; if (c) out.push({ ref: { kind: 'country', id: c.id }, label: c.name }); return c; };
  const region = (cityId?: string) => { const r = cityId ? world.regions?.[world.cities[cityId]?.regionId ?? ''] : undefined; if (r) out.push({ ref: { kind: 'region', id: r.id }, label: r.name }); return r; };
  const city = (id?: string) => { const c = id ? world.cities[id] : undefined; if (c) out.push({ ref: { kind: 'city', id: c.id }, label: c.name }); return c; };
  switch (ref.kind) {
    case 'country': { const c = world.countries[ref.id]; if (c) out.push({ label: c.name }); break; }
    case 'region': { const r = world.regions?.[ref.id]; if (r) { country(r.countryId); out.push({ label: r.name }); } break; }
    case 'city': { const c = world.cities[ref.id]; if (c) { country(c.countryId); region(c.id); out.push({ label: c.name }); } break; }
    case 'person': { const p = world.people[ref.id]; if (p) { country(p.countryId); region(p.cityId); city(p.cityId); out.push({ label: p.name }); } break; }
    case 'company': { const c = world.companies[ref.id]; if (c) { country(c.countryId); region(c.cityId); city(c.cityId); out.push({ label: c.name }); } break; }
    case 'organization': { const o = world.organizations[ref.id]; if (o) { if (o.countryId) country(o.countryId); out.push({ label: o.name }); } break; }
    case 'outlet': { const o = world.outlets[ref.id]; if (o) { if (o.countryId) country(o.countryId); out.push({ label: o.name }); } break; }
    case 'event': { const e = world.events.find((x) => x.id === ref.id); if (e) { country(e.location.countryId); if (e.location.cityId) { region(e.location.cityId); city(e.location.cityId); } { const title = renderEvent(e, world).title; out.push({ label: title.length > 40 ? title.slice(0, 38) + '…' : title }); } } break; }
  }
  return out;
}

export function Breadcrumbs({ refx }: { refx: EntityRef }): React.ReactElement | null {
  const t = useT(); const world = useGame((s) => s.world)!; const select = useGame((s) => s.select); const setScreen = useGame((s) => s.setScreen);
  const crumbs = crumbsFor(world, refx);
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      <button className="crumb" onClick={() => { select(null); setScreen('world'); }}>{t('breadcrumb.world')}</button>
      {crumbs.map((c, i) => <React.Fragment key={i}><span className="sep" aria-hidden>›</span>{c.ref ? <button className="crumb" onClick={() => select(c.ref!)}>{c.label}</button> : <span className="crumb current" aria-current="page">{c.label}</span>}</React.Fragment>)}
    </nav>
  );
}
