import React, { useEffect, useRef } from 'react';
import { generateGeography } from '@/engine/generator/geography';

/** Tiny live preview of the continents a seed will produce. Debounced; purely cosmetic. */
export function SeedPreview({ seed }: { seed: string }): React.ReactElement {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    let cancelled = false;
    const t = setTimeout(() => {
      try {
        const geo = generateGeography(seed || 'preview', 120, 60, 16);
        if (cancelled) return;
        const g = canvas.getContext('2d')!; const W = geo.width, H = geo.height;
        canvas.width = W * 2; canvas.height = H * 2;
        g.fillStyle = '#0a1020'; g.fillRect(0, 0, canvas.width, canvas.height);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const i = y * W + x; if (!geo.land[i]) continue;
          const r = geo.region[i]; const hue = (r * 47) % 360;
          g.fillStyle = `hsl(${hue} 45% ${geo.coastal[i] ? 46 : 36}%)`; g.fillRect(x * 2, y * 2, 2, 2);
        }
        const v = g.createRadialGradient(W, H, H * 0.4, W, H, W); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(6,8,15,0.75)');
        g.fillStyle = v; g.fillRect(0, 0, canvas.width, canvas.height);
      } catch { /* preview is optional */ }
    }, 220);
    return () => { cancelled = true; clearTimeout(t); };
  }, [seed]);
  return <canvas ref={ref} aria-hidden style={{ width: '100%', maxWidth: 360, aspectRatio: '2 / 1', borderRadius: 999, boxShadow: '0 0 60px rgba(143,211,255,0.2), inset 0 0 30px rgba(0,0,0,0.6)', imageRendering: 'auto', border: '1px solid rgba(143,211,255,0.2)' }} />;
}
