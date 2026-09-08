import React from 'react';

export function Sparkline({ data, width = 80, height = 24, color, fill = true }: { data: number[]; width?: number; height?: number; color?: string; fill?: boolean }): React.ReactElement {
  if (data.length < 2) return <svg className="spark" width={width} height={height} />;
  const min = Math.min(...data), max = Math.max(...data); const span = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * width, height - ((v - min) / span) * (height - 2) - 1]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const up = data[data.length - 1] >= data[0];
  const c = color ?? (up ? 'var(--ok)' : 'var(--bad)');
  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {fill && <path d={`${d} L${width},${height} L0,${height} Z`} fill={c} opacity="0.12" />}
      <path d={d} fill="none" stroke={c} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

/** Larger chart with gridlines and a min/max label */
export function LineChart({ data, height = 140, color = 'var(--data)', label }: { data: number[]; height?: number; color?: string; label?: (v: number) => string }): React.ReactElement {
  const w = 600;
  if (data.length < 2) return <div className="dim">No data yet.</div>;
  const min = Math.min(...data), max = Math.max(...data); const span = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, height - 12 - ((v - min) / span) * (height - 24)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const f = label ?? ((v: number) => v.toFixed(0));
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      {[0.25, 0.5, 0.75].map((t) => <line key={t} x1="0" x2={w} y1={height - 12 - t * (height - 24)} y2={height - 12 - t * (height - 24)} stroke="rgba(143,211,255,0.08)" />)}
      <path d={`${d} L${w},${height} L0,${height} Z`} fill={color} opacity="0.1" />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <text x="4" y="10" fill="var(--text-3)" fontSize="10" fontFamily="var(--font-mono)">{f(max)}</text>
      <text x="4" y={height - 2} fill="var(--text-3)" fontSize="10" fontFamily="var(--font-mono)">{f(min)}</text>
    </svg>
  );
}
