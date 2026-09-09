import React from 'react';
import type { EntityRef } from '@/engine/types';
import { useGame } from '@/state/store';
import { Avatar } from './Avatar';
import { Flag } from './Flag';

export function EntityRow({ refx, name, sub, right, icon }: { refx: EntityRef; name: string; sub?: string; right?: React.ReactNode; icon?: React.ReactNode }): React.ReactElement {
  const select = useGame((s) => s.select);
  const world = useGame((s) => s.world)!;
  let lead = icon;
  if (!lead) {
    if (refx.kind === 'person') { const p = world.people[refx.id]; lead = p ? <Avatar name={p.name} id={p.id} alive={p.alive} /> : null; }
    else if (refx.kind === 'country') { const c = world.countries[refx.id]; lead = c ? <Flag spec={c.flag} /> : null; }
    else if (refx.kind === 'region') lead = <span className="avatar" style={{ background: 'rgba(240,179,90,0.15)', color: 'var(--accent)' }}>▦</span>;
    else if (refx.kind === 'city') lead = <span className="avatar" style={{ background: 'rgba(143,211,255,0.15)', color: 'var(--data)' }}>◉</span>;
    else if (refx.kind === 'company') lead = <span className="avatar" style={{ background: 'rgba(96,165,250,0.18)', color: '#9cc4ff', fontSize: 10 }}>{world.companies[refx.id]?.ticker.slice(0, 4)}</span>;
    else if (refx.kind === 'organization') lead = <span className="avatar" style={{ background: 'rgba(167,139,250,0.18)', color: '#c9b8ff' }}>⌘</span>;
    else if (refx.kind === 'outlet') lead = <span className="avatar" style={{ background: world.outlets[refx.id]?.color ?? '#888', color: '#111', fontFamily: 'var(--font-serif)' }}>N</span>;
  }
  return (
    <div className="entity-row" onClick={() => select(refx)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(refx); } }} role="button" tabIndex={0}>
      {lead}
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="name ellipsis">{name}</div>
        {sub && <div className="sub ellipsis">{sub}</div>}
      </div>
      {right && <div className="mono" style={{ fontSize: 12, textAlign: 'right' }}>{right}</div>}
    </div>
  );
}
