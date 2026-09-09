import React from 'react';
import type { WorldEvent } from '@/engine/types';
import { useGame } from '@/state/store';
import { catVar, sevLabel } from '../format';
import { daysAgo, formatDate } from '@/engine/time';
import { renderEvent } from '@/engine/i18n/render';
import { useT } from '../i18n';

export function EventCard({ ev, compact = false }: { ev: WorldEvent; compact?: boolean }): React.ReactElement {
  const t = useT(); const select = useGame((s) => s.select); const world = useGame((s) => s.world)!;
  const country = ev.location.countryId ? world.countries[ev.location.countryId] : undefined;
  const r = renderEvent(ev, world);
  const open = () => select({ kind: 'event', id: ev.id });
  return (
    <div className={`event-card sev-${ev.severity} ${ev.playerIntervention ? 'player' : ''}`} style={{ ['--c' as string]: catVar(ev.category) }} onClick={open} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }} role="button" tabIndex={0} data-testid="event-card">
      <div className="rail" />
      <div className="grow">
        <div className="meta">
          <span className={`sev sev-${ev.severity}`} role="img" aria-label={sevLabel(ev.severity)} title={sevLabel(ev.severity)} />
          <span className="cat" style={{ ['--c' as string]: catVar(ev.category) }}>{t(`cat.${ev.category}`)}</span>
          {country && <span className="ellipsis">· {country.name}</span>}
          <span className="grow" />
          <span className="mono" title={formatDate(ev.day, world.meta.startYear)}>{daysAgo(ev.day, world.day)}</span>
          {ev.playerIntervention && <span className="player-badge" title={t('events.divine')}>✦</span>}
        </div>
        <div className="head">{r.title}</div>
        {!compact && <div className="desc">{r.description}</div>}
        {!compact && (ev.consequences.length > 0 || (typeof ev.causedBy === 'string' && ev.causedBy.startsWith('ev_'))) && (
          <div className="meta" style={{ marginTop: 6 }}>
            {typeof ev.causedBy === 'string' && ev.causedBy.startsWith('ev_') && <span>↳ {t('events.cause').toLowerCase()}</span>}
            {ev.consequences.length > 0 && <span>→ {ev.consequences.length} {t('events.consequences').toLowerCase()}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
