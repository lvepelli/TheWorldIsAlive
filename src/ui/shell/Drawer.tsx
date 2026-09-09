import React from 'react';
import { useGame } from '@/state/store';
import { useT } from '../i18n';

/** Contextual drawer that hosts a section panel to the right of the map (desktop) or as a full-height sheet (mobile). */
export function Drawer({ title, sub, wide, children, actions }: { title: string; sub?: string; wide?: boolean; children: React.ReactNode; actions?: React.ReactNode }): React.ReactElement {
  const t = useT(); const setScreen = useGame((s) => s.setScreen);
  return (
    <section className={`drawer ${wide ? 'wide' : ''}`} aria-label={title} data-testid="drawer">
      <div className="drawer-head">
        <div className="grow"><div className="drawer-title">{title}</div>{sub && <div className="drawer-sub">{sub}</div>}</div>
        {actions}
        <button className="icon-btn" onClick={() => setScreen('world')} aria-label={t('common.close')} title={t('common.close')} data-testid="drawer-close">✕</button>
      </div>
      <div className="drawer-body">{children}</div>
    </section>
  );
}
