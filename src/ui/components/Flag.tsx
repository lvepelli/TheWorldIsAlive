import React from 'react';
import type { FlagSpec } from '@/engine/types';

export function Flag({ spec, size = 'sm' }: { spec: FlagSpec; size?: 'sm' | 'lg' }): React.ReactElement {
  const [a, b, c] = spec.colors;
  const emblem = spec.emblem ? <Emblem kind={spec.emblem} color={c} /> : null;
  let body: React.ReactNode;
  switch (spec.layout) {
    case 'tricolor-v': body = <><rect width="20" height="40" fill={a} /><rect x="20" width="20" height="40" fill={b} /><rect x="40" width="20" height="40" fill={c} />{emblem}</>; break;
    case 'tricolor-h': body = <><rect width="60" height="14" fill={a} /><rect y="13" width="60" height="14" fill={b} /><rect y="26" width="60" height="14" fill={c} />{emblem}</>; break;
    case 'bicolor-h': body = <><rect width="60" height="20" fill={a} /><rect y="20" width="60" height="20" fill={b} />{emblem}</>; break;
    case 'cross': body = <><rect width="60" height="40" fill={a} /><rect x="18" width="8" height="40" fill={b} /><rect y="16" width="60" height="8" fill={b} /></>; break;
    case 'diagonal': body = <><rect width="60" height="40" fill={a} /><polygon points="0,40 60,0 60,40" fill={b} /><polygon points="0,40 60,0 60,12 18,40" fill={c} />{emblem}</>; break;
    case 'canton': body = <><rect width="60" height="40" fill={a} /><rect width="26" height="20" fill={b} /><circle cx="13" cy="10" r="5" fill={c} /></>; break;
    case 'emblem': body = <><rect width="60" height="40" fill={a} /><circle cx="30" cy="20" r="11" fill={b} />{spec.emblem ? <Emblem kind={spec.emblem} color={c} /> : <circle cx="30" cy="20" r="5" fill={c} />}</>; break;
    default: body = <><rect width="60" height="40" fill={a} />{[0, 1, 2, 3, 4].map((i) => <rect key={i} y={i * 8 + 4} width="60" height="4" fill={i % 2 ? b : c} />)}</>;
  }
  return <span className={`flag ${size === 'lg' ? 'lg' : ''}`}><svg viewBox="0 0 60 40" preserveAspectRatio="none">{body}</svg></span>;
}

function Emblem({ kind, color }: { kind: NonNullable<FlagSpec['emblem']>; color: string }): React.ReactElement {
  switch (kind) {
    case 'star': return <polygon points="30,11 32.5,17.5 39.5,17.5 34,21.5 36,28.5 30,24.5 24,28.5 26,21.5 20.5,17.5 27.5,17.5" fill={color} />;
    case 'circle': return <circle cx="30" cy="20" r="7" fill={color} />;
    case 'diamond': return <polygon points="30,11 38,20 30,29 22,20" fill={color} />;
    case 'crescent': return <><circle cx="30" cy="20" r="8" fill={color} /><circle cx="33" cy="19" r="7" fill="rgba(0,0,0,0.0)" /><circle cx="33.5" cy="19" r="6.5" fill="var(--flag-bg, #000)" opacity="0" /></>;
    case 'triangle': return <polygon points="30,11 38,28 22,28" fill={color} />;
    default: return <circle cx="30" cy="20" r="7" fill="none" stroke={color} strokeWidth="3" />;
  }
}
