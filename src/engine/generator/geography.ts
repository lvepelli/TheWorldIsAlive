/**
 * Procedural geography: continents from layered noise, then countries grown
 * as organic regions across the land mask. Purely deterministic from the seed.
 */
import { Noise2D, RNG } from '../rng';

export interface RawGeography {
  width: number;
  height: number;
  elevation: Float32Array;   // 0..1 (sea level ~0.5)
  moisture: Float32Array;
  land: Uint8Array;          // 1 = land
  region: Int16Array;        // country index per cell (-1 water)
  regionCount: number;
  regionCells: number[][];   // cells per region index
  regionArea: number[];
  regionCentroid: { x: number; y: number }[];
  regionNeighbors: Set<number>[];
  regionCoastal: number[];   // count of coastal cells per region
  coastal: Uint8Array;       // 1 if land cell adjacent to water
}

export function generateGeography(seed: string, width = 240, height = 120, targetCountries = 30): RawGeography {
  const rng = new RNG(seed + ':geo');
  const noise = new Noise2D(seed);
  const n = width * height;
  const elevation = new Float32Array(n);
  const moisture = new Float32Array(n);
  const land = new Uint8Array(n);

  // Continental blobs: several soft centers add mass to the elevation field.
  const blobs = Array.from({ length: rng.int(4, 7) }, () => ({
    x: rng.float(0.08, 0.92) * width,
    y: rng.float(0.15, 0.85) * height,
    rx: rng.float(0.10, 0.22) * width,
    ry: rng.float(0.18, 0.4) * height,
    w: rng.float(0.6, 1.0),
  }));
  const freq = 3.2 / width;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      let mass = 0;
      for (const b of blobs) {
        // wrap x horizontally so continents can cross the antimeridian
        let dx = Math.abs(x - b.x); dx = Math.min(dx, width - dx);
        const dy = y - b.y;
        const d = (dx * dx) / (b.rx * b.rx) + (dy * dy) / (b.ry * b.ry);
        mass += b.w * Math.exp(-d * 1.4);
      }
      const nx = x * freq, ny = y * freq;
      // Wrap-continuous sampling: blend the sample at x with the sample one world-width to the left,
      // weighted by x/width, so column 0 and column W agree and the antimeridian has no seam.
      const wx = x / width; const nxL = (x - width) * freq;
      const f = (1 - wx) * noise.fbm(nx + 10, ny + 10, 6, 2.1, 0.52) + wx * noise.fbm(nxL + 10, ny + 10, 6, 2.1, 0.52);   // -0.5..0.5-ish
      const ridges = 1 - Math.abs((1 - wx) * noise.fbm(nx * 2.3 + 40, ny * 2.3 + 40, 4) + wx * noise.fbm(nxL * 2.3 + 40, ny * 2.3 + 40, 4));
      const lat = Math.abs(y / height - 0.5) * 2; // 0 equator, 1 pole
      const polar = lat > 0.86 ? (lat - 0.86) / 0.14 : 0;
      let e = 0.27 + mass * 0.45 + f * 0.9 + ridges * 0.08 - polar * 0.6;
      elevation[i] = Math.max(0, Math.min(1, e));
      moisture[i] = 0.5 + ((1 - wx) * noise.fbm(nx * 1.7 + 200, ny * 1.7 + 200, 4) + wx * noise.fbm(nxL * 1.7 + 200, ny * 1.7 + 200, 4)) * 0.9;
    }
  }
  const SEA = 0.5;
  for (let i = 0; i < n; i++) land[i] = elevation[i] > SEA ? 1 : 0;

  // Remove islands too tiny to hold a country; keep a few as decoration (they count as water for regions)
  const comp = new Int32Array(n).fill(-1);
  const compSize: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!land[i] || comp[i] !== -1) continue;
    const id = compSize.length;
    const stack = [i]; comp[i] = id; let size = 0;
    while (stack.length) {
      const c = stack.pop()!; size++;
      for (const nb of neighbors4(c, width, height)) {
        if (land[nb] && comp[nb] === -1) { comp[nb] = id; stack.push(nb); }
      }
    }
    compSize.push(size);
  }
  for (let i = 0; i < n; i++) if (land[i] && compSize[comp[i]] < 12) land[i] = 0;

  const landCells: number[] = [];
  for (let i = 0; i < n; i++) if (land[i]) landCells.push(i);
  // Safety: ensure enough land
  if (landCells.length < n * 0.12) {
    // Lower the sea level gradually
    let sea = SEA;
    while (landCells.length < n * 0.15 && sea > 0.3) {
      sea -= 0.02; landCells.length = 0;
      for (let i = 0; i < n; i++) { land[i] = elevation[i] > sea ? 1 : 0; if (land[i]) landCells.push(i); }
    }
  }

  // Coastal flag
  const coastal = new Uint8Array(n);
  for (const i of landCells) {
    for (const nb of neighbors8(i, width, height)) if (!land[nb]) { coastal[i] = 1; break; }
  }

  // Country seeds with Poisson-ish spacing, then multi-source weighted growth
  const region = new Int16Array(n).fill(-1);
  const seeds: number[] = [];
  const minDist = Math.sqrt((landCells.length / targetCountries)) * 0.75;
  let attempts = 0;
  while (seeds.length < targetCountries && attempts < 5000) {
    attempts++;
    const c = rng.pick(landCells);
    const cx = c % width, cy = Math.floor(c / width);
    let ok = true;
    for (const s of seeds) {
      const sx = s % width, sy = Math.floor(s / width);
      let dx = Math.abs(cx - sx); dx = Math.min(dx, width - dx);
      if (Math.hypot(dx, cy - sy) < minDist) { ok = false; break; }
    }
    if (ok) seeds.push(c);
  }
  // Growth: each region has a speed; use a priority queue (bucketed by cost)
  const cost = new Float32Array(n).fill(Infinity);
  const speed = seeds.map(() => rng.float(0.6, 1.6));
  type Item = { cell: number; r: number; c: number };
  const heap: Item[] = [];
  const push = (it: Item) => { heap.push(it); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p].c <= heap[i].c) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = (): Item => { const top = heap[0]; const last = heap.pop()!; if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, rr = l + 1; let m = i; if (l < heap.length && heap[l].c < heap[m].c) m = l; if (rr < heap.length && heap[rr].c < heap[m].c) m = rr; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  seeds.forEach((s, r) => { cost[s] = 0; push({ cell: s, r, c: 0 }); });
  while (heap.length) {
    const it = pop();
    if (region[it.cell] !== -1) continue;
    region[it.cell] = it.r;
    for (const nb of neighbors4(it.cell, width, height)) {
      if (!land[nb] || region[nb] !== -1) continue;
      const terrain = 1 + Math.max(0, elevation[nb] - 0.7) * 6; // mountains slow growth → natural borders
      const c = it.c + (terrain * (0.7 + rng.next() * 0.6)) / speed[it.r];
      if (c < cost[nb]) { cost[nb] = c; push({ cell: nb, r: it.r, c }); }
    }
  }
  // Any land unreachable (separate landmass without seed) → assign to nearest seed via BFS from water? Simpler: assign to closest seed by distance
  for (const i of landCells) {
    if (region[i] === -1) {
      const cx = i % width, cy = Math.floor(i / width);
      let best = 0, bd = Infinity;
      seeds.forEach((s, r) => { const sx = s % width, sy = Math.floor(s / width); let dx = Math.abs(cx - sx); dx = Math.min(dx, width - dx); const d = Math.hypot(dx, cy - sy); if (d < bd) { bd = d; best = r; } });
      region[i] = best;
    }
  }
  // Merge tiny regions into their largest neighbor
  let regionCount = seeds.length;
  const areaOf = () => { const a = new Array(regionCount).fill(0); for (const i of landCells) a[region[i]]++; return a; };
  for (let pass = 0; pass < 3; pass++) {
    const areas = areaOf();
    for (let r = 0; r < regionCount; r++) {
      if (areas[r] > 0 && areas[r] < 14) {
        const counts = new Map<number, number>();
        for (const i of landCells) if (region[i] === r) for (const nb of neighbors4(i, width, height)) { const o = region[nb]; if (o >= 0 && o !== r) counts.set(o, (counts.get(o) ?? 0) + 1); }
        let target = -1, bc = -1; counts.forEach((c, o) => { if (c > bc) { bc = c; target = o; } });
        if (target >= 0) for (const i of landCells) if (region[i] === r) region[i] = target;
      }
    }
  }
  // Compact region indexes
  const remap = new Map<number, number>();
  for (const i of landCells) { const r = region[i]; if (!remap.has(r)) remap.set(r, remap.size); }
  for (const i of landCells) region[i] = remap.get(region[i])!;
  regionCount = remap.size;

  const regionCells: number[][] = Array.from({ length: regionCount }, () => []);
  for (const i of landCells) regionCells[region[i]].push(i);
  const regionArea = regionCells.map((c) => c.length);
  const regionCentroid = regionCells.map((cells) => {
    // circular mean on x to handle wrap
    let sx = 0, cx = 0, sy = 0;
    for (const i of cells) { const a = ((i % width) / width) * Math.PI * 2; sx += Math.sin(a); cx += Math.cos(a); sy += Math.floor(i / width); }
    let ang = Math.atan2(sx / cells.length, cx / cells.length); if (ang < 0) ang += Math.PI * 2;
    return { x: (ang / (Math.PI * 2)) * width, y: sy / cells.length };
  });
  const regionNeighbors: Set<number>[] = Array.from({ length: regionCount }, () => new Set());
  const regionCoastal = new Array(regionCount).fill(0);
  for (const i of landCells) {
    const r = region[i];
    if (coastal[i]) regionCoastal[r]++;
    for (const nb of neighbors4(i, width, height)) { const o = region[nb]; if (o >= 0 && o !== r) regionNeighbors[r].add(o); }
  }
  // Sea neighbors: regions within short water distance count as maritime neighbors (relations only)
  return { width, height, elevation, moisture, land, region, regionCount, regionCells, regionArea, regionCentroid, regionNeighbors, regionCoastal, coastal };
}

export function neighbors4(i: number, w: number, h: number): number[] {
  const x = i % w, y = Math.floor(i / w);
  const out: number[] = [];
  out.push(y * w + ((x + 1) % w));
  out.push(y * w + ((x - 1 + w) % w));
  if (y > 0) out.push((y - 1) * w + x);
  if (y < h - 1) out.push((y + 1) * w + x);
  return out;
}
export function neighbors8(i: number, w: number, h: number): number[] {
  const x = i % w, y = Math.floor(i / w);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const ny = y + dy; if (ny < 0 || ny >= h) continue;
    out.push(ny * w + ((x + dx + w) % w));
  }
  return out;
}
