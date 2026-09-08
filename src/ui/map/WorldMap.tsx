import React, { useEffect, useRef, useState } from 'react';
import { MapRenderer } from './renderer';
import { useGame } from '@/state/store';
import type { EntityRef } from '@/engine/types';

/**
 * Interactive world map. Pointer-based pan, pinch zoom, wheel zoom, tap-to-select.
 * The render loop runs independently of React re-renders.
 */
export function WorldMap(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<MapRenderer | null>(null);
  const [hover, setHover] = useState<EntityRef | null>(null);
  const hoverRef = useRef<EntityRef | null>(null);
  const world = useGame((s) => s.world);
  const version = useGame((s) => s.version);
  const overlay = useGame((s) => s.overlay);
  const selection = useGame((s) => s.selection);
  const focus = useGame((s) => s.focus);
  const select = useGame((s) => s.select);
  const stateRef = useRef({ overlay, selection, version });
  stateRef.current = { overlay, selection, version };
  const target = useRef<{ x: number; y: number; scale: number } | null>(null);
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Renderer lifecycle
  useEffect(() => {
    const canvas = canvasRef.current!;
    const r = new MapRenderer(canvas);
    rendererRef.current = r;
    const resize = () => { const rect = canvas.parentElement!.getBoundingClientRect(); r.resize(rect.width, rect.height, window.devicePixelRatio || 1); if (!initialized.current && world) { r.camera = { x: r.W / 2, y: r.H / 2, scale: r.fitScale() }; } };
    const initialized = { current: false };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(canvas.parentElement!);
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const st = useGame.getState();
      if (st.world) {
        r.setWorld(st.world, st.version);
        if (!initialized.current) { r.camera = { x: r.W / 2, y: r.H / 2, scale: r.fitScale() * 2.4 }; target.current = { x: r.W / 2, y: r.H / 2, scale: r.fitScale() }; initialized.current = true; }
        // camera easing toward target
        const tg = target.current;
        if (tg) {
          const c = r.camera; let dx = tg.x - c.x; const W = r.W; if (dx > W / 2) dx -= W; if (dx < -W / 2) dx += W;
          c.x += dx * 0.1; c.y += (tg.y - c.y) * 0.1; c.scale += (tg.scale - c.scale) * 0.08;
          if (Math.abs(dx) < 0.05 && Math.abs(tg.y - c.y) < 0.05 && Math.abs(tg.scale - c.scale) < 0.01) target.current = null;
        }
        r.render({ overlay: stateRef.current.overlay, selection: stateRef.current.selection, hover: hoverRef.current, now, reducedMotion: reduced });
      }
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Focus requests
  useEffect(() => {
    const r = rendererRef.current; if (!r || !focus) return;
    target.current = { x: focus.x, y: focus.y, scale: focus.zoom ? r.fitScale() * focus.zoom : Math.max(r.camera.scale, r.fitScale() * 2) };
  }, [focus]);

  // Pointer interaction
  useEffect(() => {
    const canvas = canvasRef.current!; const r = rendererRef.current!;
    const pointers = new Map<number, { x: number; y: number }>();
    let last: { x: number; y: number } | null = null;
    let pinch: { dist: number; scale: number; cx: number; cy: number } | null = null;
    let down: { x: number; y: number; t: number } | null = null;
    let moved = false;
    let lastTap = 0;
    const pos = (e: PointerEvent) => { const rect = canvas.getBoundingClientRect(); return { x: e.clientX - rect.left, y: e.clientY - rect.top }; };
    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      const p = pos(e); pointers.set(e.pointerId, p);
      target.current = null;
      if (pointers.size === 1) { last = p; down = { ...p, t: performance.now() }; moved = false; }
      if (pointers.size === 2) { const [a, b] = Array.from(pointers.values()); pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale: r.camera.scale, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; last = null; }
    };
    const onMove = (e: PointerEvent) => {
      const p = pos(e);
      if (!pointers.has(e.pointerId)) {
        // hover (mouse only)
        if (e.pointerType === 'mouse') { const h = r.hitTest(p.x, p.y); const prev = hoverRef.current; if ((h?.id ?? null) !== (prev?.id ?? null)) { hoverRef.current = h; setHover(h); canvas.style.cursor = h ? 'pointer' : 'grab'; } }
        return;
      }
      pointers.set(e.pointerId, p);
      if (pointers.size === 2 && pinch) {
        const [a, b] = Array.from(pointers.values()); const d = Math.hypot(a.x - b.x, a.y - b.y);
        const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        zoomAt(cx, cy, (pinch.scale * (d / pinch.dist)) / r.camera.scale);
        // pan with pinch center
        r.camera.x -= (cx - pinch.cx) / r.camera.scale; r.camera.y -= (cy - pinch.cy) / r.camera.scale; pinch.cx = cx; pinch.cy = cy;
        moved = true;
      } else if (pointers.size === 1 && last) {
        const dx = p.x - last.x, dy = p.y - last.y;
        if (Math.abs(p.x - (down?.x ?? p.x)) > 6 || Math.abs(p.y - (down?.y ?? p.y)) > 6) moved = true;
        r.camera.x -= dx / r.camera.scale; r.camera.y -= dy / r.camera.scale; last = p;
      }
    };
    const onUp = (e: PointerEvent) => {
      const p = pos(e); pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 1) { last = Array.from(pointers.values())[0]; }
      if (pointers.size === 0) {
        last = null;
        if (down && !moved && performance.now() - down.t < 500) {
          const now = performance.now();
          if (now - lastTap < 320) { zoomAt(p.x, p.y, 1.8); lastTap = 0; }
          else { lastTap = now; const hit = r.hitTest(p.x, p.y); select(hit); if (hit) { const [gx, gy] = r.screenToWorld(p.x, p.y); if (window.innerWidth < 900) target.current = { x: gx, y: gy + (r.height * 0.22) / r.camera.scale, scale: r.camera.scale }; } }
        }
        down = null;
      }
    };
    const zoomAt = (sx: number, sy: number, factor: number) => {
      const [gx, gy] = r.screenToWorld(sx, sy);
      r.camera.scale = Math.max(r.minScale(), Math.min(r.maxScale(), r.camera.scale * factor));
      const [gx2, gy2] = r.screenToWorld(sx, sy);
      r.camera.x += gx - gx2; r.camera.y += gy - gy2;
    };
    const onWheel = (e: WheelEvent) => { e.preventDefault(); target.current = null; const p = { x: e.clientX - canvas.getBoundingClientRect().left, y: e.clientY - canvas.getBoundingClientRect().top }; zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0016)); };
    const onLeave = () => { hoverRef.current = null; setHover(null); };
    canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false }); canvas.addEventListener('pointerleave', onLeave);
    return () => { canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onUp); canvas.removeEventListener('wheel', onWheel); canvas.removeEventListener('pointerleave', onLeave); };
  }, [select]);

  const hoverName = hover && world ? (hover.kind === 'city' ? world.cities[hover.id]?.name : world.countries[hover.id]?.name) : null;
  return (
    <>
      <canvas ref={canvasRef} className="map-canvas" aria-label="World map" role="img" />
      {hoverName && <div className="hide-mobile" style={{ position: 'absolute', left: 12, bottom: 96, pointerEvents: 'none', fontSize: 12, color: 'var(--text-2)', background: 'rgba(6,8,15,0.7)', padding: '3px 8px', borderRadius: 4, zIndex: 6 }}>{hoverName}</div>}
    </>
  );
}
