/**
 * Converts the country grid into smooth vector outlines (one or more closed
 * polygons per country) using boundary-edge tracing + Chaikin smoothing.
 */
import type { Geography } from '@/engine/types';

export type Polygon = number[]; // flat [x0, y0, x1, y1, ...] in grid units
export interface Shapes { byCountry: Map<number, Polygon[]>; }

export function buildContours(geo: Geography): Shapes {
  const { width: W, height: H, cells } = geo;
  const edgesByRegion = new Map<number, Map<string, [number, number, number, number]>>();
  const add = (r: number, x0: number, y0: number, x1: number, y1: number) => {
    let m = edgesByRegion.get(r); if (!m) { m = new Map(); edgesByRegion.set(r, m); }
    m.set(`${x0},${y0}`, [x0, y0, x1, y1]);
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const r = cells[y * W + x];
      if (r < 0) continue;
      // Directed edges clockwise around the cell (screen coords, y down): top L→R, right T→B, bottom R→L, left B→T
      const top = y > 0 ? cells[(y - 1) * W + x] : -1;
      const bottom = y < H - 1 ? cells[(y + 1) * W + x] : -1;
      const right = x < W - 1 ? cells[y * W + x + 1] : -2; // -2: seam, always an edge
      const left = x > 0 ? cells[y * W + x - 1] : -2;
      if (top !== r) add(r, x, y, x + 1, y);
      if (right !== r) add(r, x + 1, y, x + 1, y + 1);
      if (bottom !== r) add(r, x + 1, y + 1, x, y + 1);
      if (left !== r) add(r, x, y + 1, x, y);
    }
  }
  const byCountry = new Map<number, Polygon[]>();
  for (const [r, edges] of edgesByRegion) {
    const polys: Polygon[] = [];
    // Multiple edges can start at the same point (touching corners) — the Map keeps the last; acceptable for rendering.
    const remaining = new Map(edges);
    while (remaining.size) {
      const first = remaining.values().next().value as [number, number, number, number];
      const loop: number[] = [first[0], first[1]];
      let cur = first;
      remaining.delete(`${cur[0]},${cur[1]}`);
      let guard = 0;
      while (guard++ < 100000) {
        const next = remaining.get(`${cur[2]},${cur[3]}`);
        if (!next) break;
        loop.push(next[0], next[1]);
        remaining.delete(`${next[0]},${next[1]}`);
        cur = next;
      }
      if (loop.length >= 8) polys.push(smooth(simplify(loop), 2));
    }
    polys.sort((a, b) => b.length - a.length);
    byCountry.set(r, polys);
  }
  return { byCountry };
}

/** Remove collinear points to reduce vertex count before smoothing. */
function simplify(p: number[]): number[] {
  const out: number[] = [];
  const n = p.length / 2;
  for (let i = 0; i < n; i++) {
    const px = p[((i - 1 + n) % n) * 2], py = p[((i - 1 + n) % n) * 2 + 1];
    const cx = p[i * 2], cy = p[i * 2 + 1];
    const nx = p[((i + 1) % n) * 2], ny = p[((i + 1) % n) * 2 + 1];
    if ((cx - px) * (ny - cy) - (cy - py) * (nx - cx) === 0 && ((nx - px) !== 0 || (ny - py) !== 0)) continue;
    out.push(cx, cy);
  }
  return out.length >= 6 ? out : p;
}

/** Chaikin corner cutting for closed polygons. */
function smooth(p: number[], iterations: number): number[] {
  let pts = p;
  for (let it = 0; it < iterations; it++) {
    const n = pts.length / 2;
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const ax = pts[i * 2], ay = pts[i * 2 + 1];
      const bx = pts[((i + 1) % n) * 2], by = pts[((i + 1) % n) * 2 + 1];
      out.push(ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25, ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75);
    }
    pts = out;
  }
  return pts;
}

export function polygonArea(p: number[]): number {
  let a = 0; const n = p.length / 2;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; a += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1]; }
  return Math.abs(a) / 2;
}
