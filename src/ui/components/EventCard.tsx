import React from 'react';
import type { WorldEvent } from '@/engine/types';
import { useGame } from '@/state/store';
import { catVar, sevLabel } from '../format';
import { daysAgo, formatDate } from '@/engine/time';

export function EventCard({ ev, compact = false }: { ev: WorldEvent; compact?: boolean }): React.ReactElement {
  const select = useGame((s) => s.select);
  const world = useGame((s) => s.world)!;
  const country = ev.location.countryId ? world.countries[ev.location.countryId] : undefined;
  return (
    <div className={`event-card sev-${ev.severity} ${ev.playerIntervention ? 'player' : ''}`} style={{ ['--c' as string]: catVar(ev.category) }} onClick={() => select({ kind: 'event', id: ev.id })} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select({ kind: 'event', id: ev.id }); } }} role="button" tabIndex={0}>
      <div className="rail" />
      <div className="grow">
        <div className="meta">
          <span className={`sev sev-${ev.severity}`} title={sevLabel(ev.severity)} />
          <span className="cat" style={{ ['--c' as string]: catVar(ev.category) }}>{ev.category}</span>
          {country && <span className="ellipsis">· {country.name}</span>}
          <span className="grow" />
          <span className="mono" title={formatDate(ev.day, world.meta.startYear)}>{daysAgo(ev.day, world.day)}</span>
          {ev.playerIntervention && <span className="player-badge" title="Divine intervention">✦</span>}
        </div>
        <div className="head">{ev.title}</div>
        {!compact && <div className="desc">{ev.description}</div>}
        {!compact && (ev.consequences.length > 0 || (typeof ev.causedBy === 'string' && ev.causedBy.startsWith('ev_'))) && (
          <div className="meta" style={{ marginTop: 6 }}>
            {typeof ev.causedBy === 'string' && ev.causedBy.startsWith('ev_') && <span>↳ consequence</span>}
            {ev.consequences.length > 0 && <span>→ {ev.consequences.length} consequence{ev.consequences.length > 1 ? 's' : ''}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
