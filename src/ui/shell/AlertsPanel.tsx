import React, { useMemo, useState } from 'react';
import { useGame } from '@/state/store';
import { useT } from '../i18n';
import { Drawer } from './Drawer';
import { renderEvent } from '@/engine/i18n/render';
import { formatDate } from '@/engine/time';
import { catVar, sevLabel } from '../format';

const GROUP_OF: Record<string, string> = { military: 'war', diplomatic: 'war', economic: 'economy', corporate: 'economy', political: 'politics', scientific: 'science', technological: 'science', social: 'society', cultural: 'society', religious: 'society', personal: 'society', criminal: 'society', environmental: 'disaster', disaster: 'disaster', health: 'disaster' };
const ICON: Record<string, string> = { war: '⚔', economy: '📉', politics: '👑', science: '🧬', society: '✊', disaster: '🌪', other: '•' };

/** Grouped notifications: critical first, dismiss / open / mark read, filter. */
export function AlertsPanel(): React.ReactElement {
  const t = useT(); const world = useGame((s) => s.world)!; const alerts = useGame((s) => s.alerts);
  const markRead = useGame((s) => s.markAlertRead); const dismiss = useGame((s) => s.dismissAlert); const select = useGame((s) => s.select); const focusOn = useGame((s) => s.focusOn);
  const [filter, setFilter] = useState<'all' | 'critical' | 'unread'>('all');
  const groups = useMemo(() => {
    const list = alerts.filter((a) => filter === 'all' || (filter === 'critical' ? a.severity >= 4 : !a.read));
    const by = new Map<string, typeof list>();
    for (const a of list) { const g = GROUP_OF[a.category] ?? 'other'; if (!by.has(g)) by.set(g, []); by.get(g)!.push(a); }
    return Array.from(by.entries()).sort((a, b) => Math.max(...b[1].map((x) => x.severity)) - Math.max(...a[1].map((x) => x.severity)));
  }, [alerts, filter]);
  const unread = alerts.filter((a) => !a.read).length;
  return (
    <Drawer title={t('alerts.title')} sub={unread ? t('alerts.unread', { n: unread }) : undefined} actions={<button className="btn ghost sm" onClick={() => markRead('all')}>{t('common.markAllRead')}</button>}>
      <div className="chips scroll">{(['all', 'critical', 'unread'] as const).map((f) => <button key={f} className={`chip clickable ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>{t(`alerts.filter.${f}`)}</button>)}</div>
      {groups.length === 0 && <div className="dim">{t('alerts.empty')}</div>}
      {groups.map(([g, list]) => (
        <div key={g} className="alert-group">
          <div className="section-title">{ICON[g]} {t(`alerts.group.${g}`)} <span className="dim mono">{list.length}</span></div>
          <div className="list">
            {list.map((a) => { const ev = world.events.find((e) => e.id === a.eventId); if (!ev) return null; const r = renderEvent(ev, world); return (
              <div key={a.id} className={`alert-row ${a.read ? 'read' : ''} sev-${a.severity}`} style={{ ['--c' as string]: catVar(ev.category) }}>
                <div className="grow" role="button" tabIndex={0} onClick={() => { markRead(a.id); select({ kind: 'event', id: ev.id }); }} onKeyDown={(e) => { if (e.key === 'Enter') { markRead(a.id); select({ kind: 'event', id: ev.id }); } }}>
                  <div className="kicker"><span style={{ color: 'var(--c)' }}>{t(`cat.${ev.category}`)}</span> · {sevLabel(ev.severity)} · {formatDate(ev.day, world.meta.startYear, 'short')}</div>
                  <div className={`title-sm ${a.read ? '' : 'unread'}`}>{r.title}</div>
                </div>
                <div className="row" style={{ gap: 4 }}>
                  <button className="icon-btn sm" title={t('common.focus')} aria-label={t('common.focus')} onClick={() => { markRead(a.id); focusOn(ev.location.x, ev.location.y, 2.4); useGame.getState().setScreen('world'); }}>◎</button>
                  <button className="icon-btn sm" title={t('common.dismiss')} aria-label={t('common.dismiss')} onClick={() => dismiss(a.id)}>✕</button>
                </div>
              </div>); })}
          </div>
        </div>
      ))}
    </Drawer>
  );
}
