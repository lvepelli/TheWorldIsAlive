import React from 'react';

export function Stat({ k, v, bar, color, sub }: { k: string; v: React.ReactNode; bar?: number; color?: string; sub?: string }): React.ReactElement {
  return (
    <div className="stat">
      <span className="k">{k}</span>
      <span className="v" style={{ color }}>{v}</span>
      {bar !== undefined && <div className="bar"><i style={{ width: `${Math.max(0, Math.min(100, bar))}%`, background: color ?? barColor(bar) }} /></div>}
      {sub && <span className="dim" style={{ fontSize: 11 }}>{sub}</span>}
    </div>
  );
}
export function barColor(v: number): string { return v < 30 ? 'var(--bad)' : v < 55 ? 'var(--warn)' : 'var(--ok)'; }
