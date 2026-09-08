import React from 'react';
import { initials, hueFor } from '../format';

export function Avatar({ name, id, size = 'sm', alive = true }: { name: string; id: string; size?: 'sm' | 'lg'; alive?: boolean }): React.ReactElement {
  const h = hueFor(id);
  return <span className={`avatar ${size === 'lg' ? 'lg' : ''}`} style={{ background: `linear-gradient(135deg, hsl(${h} 70% 70%), hsl(${(h + 40) % 360} 60% 50%))`, opacity: alive ? 1 : 0.45, filter: alive ? undefined : 'grayscale(1)' }}>{initials(name)}</span>;
}
