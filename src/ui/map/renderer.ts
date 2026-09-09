/**
 * Canvas 2D renderer for the living world map.
 * Static layers (ocean, land, tints) are pre-rendered to an offscreen canvas;
 * dynamic layers (borders, cities, routes, events, labels) are drawn per frame.
 */
import type { World, Country, City, WorldEvent, EntityRef, ID } from '@/engine/types';
import { tradeVolume, tradeShare } from '@/engine/simulation/trade';
import { stormCells } from '@/engine/simulation/weather';
import { buildContours, type Shapes, polygonArea } from './contours';
import type { MapOverlay } from '@/state/store';
import { clamp } from '@/engine/rng';

export interface Camera { x: number; y: number; scale: number; }
export type LinkMode = 'auto' | 'all' | 'none';
export interface RenderOptions { overlay: MapOverlay; selection: EntityRef | null; hover: EntityRef | null; now: number; reducedMotion: boolean; links: LinkMode; }

export const CATEGORY_COLORS: Record<string, string> = {
  political: '#a78bfa', economic: '#2dd4bf', corporate: '#60a5fa', scientific: '#6ee7b7', technological: '#22d3ee', military: '#f87171', environmental: '#4ade80',
  cultural: '#f472b6', social: '#fb923c', personal: '#c4b5fd', criminal: '#e11d48', diplomatic: '#facc15', health: '#a3e635',
};

const PX = 6; // static raster pixels per grid cell

export class MapRenderer {
  private ctx: CanvasRenderingContext2D;
  private world: World | null = null;
  private shapes: Shapes | null = null;
  staticCanvas: HTMLCanvasElement | null = null;
  private staticOverlay: MapOverlay | null = null;
  private staticVersion = -1;
  private countryIndex = new Map<ID, number>();
  private labelCache = new Map<ID, { x: number; y: number; size: number }>();
  private citySprites = new Map<string, HTMLCanvasElement>();
  private dpr = 1;
  width = 0; height = 0;
  camera: Camera = { x: 120, y: 60, scale: 4 };
  private recentEvents: WorldEvent[] = [];
  private nightCenterX = 0; // grid x of the darkest longitude (updated by drawNight)
  private recentVersion = -1;
  private shapeVersionKey = '';

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
  }

  /** Population-weighted center of the inhabited world (circular mean on x so it respects the wrap). */
  homeCenter(): { x: number; y: number } {
    const w = this.world; if (!w) return { x: 120, y: 60 };
    let sx = 0, cx = 0, sy = 0, tot = 0;
    for (const c of Object.values(w.cities)) { const a = (c.x / this.W) * Math.PI * 2; sx += Math.sin(a) * c.population; cx += Math.cos(a) * c.population; sy += c.y * c.population; tot += c.population; }
    if (!tot) return { x: this.W / 2, y: this.H / 2 };
    let ang = Math.atan2(sx / tot, cx / tot); if (ang < 0) ang += Math.PI * 2;
    return { x: (ang / (Math.PI * 2)) * this.W, y: sy / tot };
  }

  get W(): number { return this.world?.geography.width ?? 240; }
  get H(): number { return this.world?.geography.height ?? 120; }

  resize(w: number, h: number, dpr: number): void {
    this.dpr = Math.min(2, dpr);
    this.width = w; this.height = h;
    this.canvas.width = Math.round(w * this.dpr); this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`; this.canvas.style.height = `${h}px`;
  }

  fitScale(): number { return Math.max(this.width / this.W, this.height / this.H) * 0.98; }
  minScale(): number { return Math.min(this.width / this.W, this.height / this.H) * 0.85; }
  maxScale(): number { return this.fitScale() * 12; }

  setWorld(world: World, version: number): void {
    const key = `${world.meta.seed}:${world.geography.countryOrder.length}`;
    if (this.world !== world || key !== this.shapeVersionKey) {
      this.world = world;
      this.shapes = buildContours(world.geography);
      this.shapeVersionKey = key;
      this.countryIndex.clear();
      world.geography.countryOrder.forEach((id, i) => this.countryIndex.set(id, i));
      this.labelCache.clear();
      this.staticVersion = -1;
      this.recentVersion = -1;
    }
    if (version !== this.recentVersion) {
      this.recentVersion = version;
      this.recentEvents = world.events.filter((e) => world.day - e.day <= 20 && e.severity >= 2).slice(-80);
    }
  }

  worldToScreen(gx: number, gy: number): [number, number] {
    return [(gx - this.camera.x) * this.camera.scale + this.width / 2, (gy - this.camera.y) * this.camera.scale + this.height / 2];
  }
  screenToWorld(sx: number, sy: number): [number, number] {
    return [(sx - this.width / 2) / this.camera.scale + this.camera.x, (sy - this.height / 2) / this.camera.scale + this.camera.y];
  }
  /** Wrap x into [0, W) */
  wrapX(x: number): number { const W = this.W; return ((x % W) + W) % W; }

  clampCamera(): void {
    const c = this.camera;
    c.scale = clamp(c.scale, this.minScale(), this.maxScale());
    c.x = this.wrapX(c.x);
    const halfH = this.height / 2 / c.scale;
    c.y = clamp(c.y, Math.min(halfH, this.H / 2), Math.max(this.H - halfH, this.H / 2));
  }

  hitTest(sx: number, sy: number): EntityRef | null {
    if (!this.world) return null;
    const [gx0, gy] = this.screenToWorld(sx, sy);
    const gx = this.wrapX(gx0);
    // Cities first (within ~14 screen px)
    const radius = 14 / this.camera.scale;
    let best: City | null = null, bd = radius;
    for (const city of Object.values(this.world.cities)) {
      let dx = Math.abs(city.x - gx); dx = Math.min(dx, this.W - dx);
      const d = Math.hypot(dx, city.y - gy);
      const r = Math.max(bd, this.cityRadius(city) / this.camera.scale + 2 / this.camera.scale);
      if (d < r && (!best || d < bd)) { best = city; bd = d; }
    }
    if (best) return { kind: 'city', id: best.id };
    const cx = Math.floor(gx), cy = Math.floor(gy);
    if (cy < 0 || cy >= this.H) return null;
    const r = this.world.geography.cells[cy * this.W + cx];
    if (r < 0) return null;
    const id = this.world.geography.countryOrder[r];
    return id && this.world.countries[id] ? { kind: 'country', id } : null;
  }

  private cityRadius(city: City): number {
    return clamp(1.2 + Math.log10(Math.max(1, city.population / 100_000)) * 1.6, 1.5, 7) * (city.capital ? 1.25 : 1);
  }

  // ---------------------------------------------------------------------------
  // STATIC LAYER
  // ---------------------------------------------------------------------------
  private buildStatic(overlay: MapOverlay): void {
    const world = this.world!; const W = this.W, H = this.H;
    const c = this.staticCanvas ?? document.createElement('canvas');
    c.width = W * PX; c.height = H * PX;
    const g = c.getContext('2d')!;
    // Ocean
    // Tileable ocean: flat base with a latitude gradient only (no x variation, so wrap copies join seamlessly).
    const grad = g.createLinearGradient(0, 0, 0, c.height);
    grad.addColorStop(0, '#070b16'); grad.addColorStop(0.5, '#0b1322'); grad.addColorStop(1, '#070b16');
    g.fillStyle = grad; g.fillRect(0, 0, c.width, c.height);
    // Subtle depth: darker far from land
    // Graticule
    g.strokeStyle = 'rgba(143,211,255,0.045)'; g.lineWidth = 1;
    for (let x = 0; x <= W; x += 20) { g.beginPath(); g.moveTo(x * PX, 0); g.lineTo(x * PX, c.height); g.stroke(); }
    for (let y = 0; y <= H; y += 20) { g.beginPath(); g.moveTo(0, y * PX); g.lineTo(c.width, y * PX); g.stroke(); }
    // Coast glow: wide soft strokes under land
    g.save(); g.lineJoin = 'round';
    for (const [r, polys] of this.shapes!.byCountry) {
      void r;
      for (const p of polys) { this.tracePoly(g, p, PX); g.strokeStyle = 'rgba(143,211,255,0.06)'; g.lineWidth = PX * 3; g.stroke(); g.strokeStyle = 'rgba(143,211,255,0.09)'; g.lineWidth = PX * 1.2; g.stroke(); }
    }
    g.restore();
    // Dark outer halo (drawn before fills so strokes along the wrap seam are covered by land)
    g.save(); g.lineJoin = 'round';
    for (const [, polys] of this.shapes!.byCountry) for (const p of polys) { this.tracePoly(g, p, PX); g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = PX * 0.9; g.stroke(); }
    g.restore();
    // Land fills
    for (const [r, polys] of this.shapes!.byCountry) {
      const id = world.geography.countryOrder[r]; const country = world.countries[id]; if (!country) continue;
      const fill = this.fillFor(country, overlay);
      for (const p of polys) { this.tracePoly(g, p, PX); g.fillStyle = fill; g.fill(); }
    }
    // Elevation / biome texture: painted at 1px per cell and upscaled with bilinear smoothing, clipped to land.
    try {
      const t = document.createElement('canvas'); t.width = W; t.height = H;
      const tg = t.getContext('2d')!;
      const img = tg.createImageData(W, H);
      const el = world.geography.elevation, mo = world.geography.moisture, cells = world.geography.cells;
      for (let i = 0; i < W * H; i++) {
        const o = i * 4;
        if (cells[i] < 0) { img.data[o + 3] = 0; continue; }
        const e = el[i], m = mo[i];
        const lat = Math.abs(i / W / H - 0.5) * 2;
        let r = 40, gg = 120, b = 70, a = 0.16; // temperate green
        if (m < 0.38) { r = 200; gg = 160; b = 90; a = 0.14; } // arid
        if (e > 0.72) { r = 120; gg = 105; b = 85; a = 0.14; } // highlands
        if (e > 0.86) { r = 230; gg = 230; b = 240; a = 0.1 + (e - 0.86) * 1.4; } // peaks/snow
        if (lat > 0.8) { r = 220; gg = 235; b = 250; a = 0.22; } // polar
        img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = Math.round(clamp(a, 0, 0.6) * 255);
      }
      tg.putImageData(img, 0, 0);
      g.save();
      g.beginPath();
      for (const [, polys] of this.shapes!.byCountry) for (const p of polys) { g.moveTo(p[0] * PX, p[1] * PX); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i] * PX, p[i + 1] * PX); g.closePath(); }
      g.clip();
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(t, 0, 0, c.width, c.height); g.restore();
    } catch { /* texture optional */ }
    this.staticCanvas = c; this.staticOverlay = overlay;
  }

  private fillFor(c: Country, overlay: MapOverlay): string {
    switch (overlay) {
      case 'political': return `hsl(${c.hue.toFixed(0)} 28% 17%)`;
      case 'stability': return ramp(c.stability / 100, [340, 40, 150]);
      case 'economy': { const pc = (c.gdp * 1e9) / Math.max(1, c.population); return ramp(clamp(Math.log10(pc + 1) / 5.2, 0, 1), [220, 200, 170]); }
      case 'tension': { const worst = Math.max(0, ...Object.values(c.relations).map((r) => -r)) / 100; const war = c.atWarWith.length ? 1 : 0; return ramp(1 - Math.max(worst, war), [0, 30, 150]); }
      case 'happiness': return ramp(c.happiness / 100, [270, 320, 45]);
      case 'tech': return ramp(c.technology / 100, [230, 200, 185]);
      case 'climate': return ramp(1 - c.climateRisk / 100, [15, 45, 170]);
      case 'trade': { const share = tradeShare(this.world!, c); return ramp(clamp(Math.sqrt(share / 0.6), 0, 1), [215, 185, 140]); }
    }
  }

  private tracePoly(g: CanvasRenderingContext2D, p: number[], s: number, ox = 0, oy = 0): void {
    g.beginPath();
    g.moveTo((p[0] + ox) * s, (p[1] + oy) * s);
    for (let i = 2; i < p.length; i += 2) g.lineTo((p[i] + ox) * s, (p[i + 1] + oy) * s);
    g.closePath();
  }

  // ---------------------------------------------------------------------------
  // FRAME
  // ---------------------------------------------------------------------------
  render(opts: RenderOptions): void {
    const g = this.ctx; const world = this.world;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#06080f'; g.fillRect(0, 0, this.width, this.height);
    if (!world || !this.shapes) return;
    if (!this.staticCanvas || this.staticOverlay !== opts.overlay || this.staticVersion !== this.recentVersion && opts.overlay !== 'political') { this.buildStatic(opts.overlay); this.staticVersion = this.recentVersion; }
    this.clampCamera();
    const cam = this.camera; const W = this.W;
    // Offsets for wrap copies that are visible
    const halfW = this.width / 2 / cam.scale;
    const offsets: number[] = [];
    for (const k of [-1, 0, 1]) { const left = k * W, right = (k + 1) * W; if (right > cam.x - halfW && left < cam.x + halfW) offsets.push(k * W); }
    // Static
    g.imageSmoothingEnabled = true;
    for (const ox of offsets) {
      const [sx, sy] = this.worldToScreen(ox, 0);
      g.drawImage(this.staticCanvas!, sx, sy, W * cam.scale, this.H * cam.scale);
    }
    const t = opts.now / 1000;
    if (!(window as unknown as { __twiaNoNight?: boolean }).__twiaNoNight) this.drawNight(world, offsets, opts.now, opts.reducedMotion);
    const selCountry = opts.selection?.kind === 'country' ? opts.selection.id : opts.selection?.kind === 'city' ? world.cities[opts.selection.id]?.countryId : null;
    const hoverCountry = opts.hover?.kind === 'country' ? opts.hover.id : null;
    // Borders + war highlighting. Clip out a hairline at each wrap seam so the artificial
    // polygon edges along the antimeridian are never stroked.
    g.save(); g.lineJoin = 'round';
    g.beginPath(); g.rect(0, 0, this.width, this.height);
    for (const k of [-1, 0, 1, 2]) { const [sx] = this.worldToScreen(k * W, 0); if (sx > -4 && sx < this.width + 4) g.rect(sx - 1.5, 0, 3, this.height); }
    g.clip('evenodd');
    for (const ox of offsets) {
      g.setTransform(this.dpr * cam.scale, 0, 0, this.dpr * cam.scale, this.dpr * ((ox - cam.x) * cam.scale + this.width / 2), this.dpr * ((0 - cam.y) * cam.scale + this.height / 2));
      for (const [r, polys] of this.shapes.byCountry) {
        const id = world.geography.countryOrder[r]; const c = world.countries[id]; if (!c) continue;
        const atWar = c.atWarWith.length > 0;
        const isSel = id === selCountry, isHover = id === hoverCountry;
        for (const p of polys) {
          this.tracePoly(g, p, 1);
          if (atWar) { const pulse = opts.reducedMotion ? 0.5 : 0.45 + 0.35 * Math.sin(t * 3 + r); g.strokeStyle = `rgba(255,77,77,${pulse})`; g.lineWidth = 2.2 / cam.scale; g.stroke(); g.fillStyle = `rgba(255,60,60,${0.06 + 0.05 * Math.sin(t * 3 + r)})`; g.fill(); }
          if (isSel) { g.fillStyle = 'rgba(240,179,90,0.16)'; g.fill(); g.strokeStyle = 'rgba(255,210,122,0.95)'; g.lineWidth = 2 / cam.scale; g.stroke(); }
          else if (isHover) { g.fillStyle = 'rgba(143,211,255,0.08)'; g.fill(); g.strokeStyle = 'rgba(143,211,255,0.8)'; g.lineWidth = 1.5 / cam.scale; g.stroke(); }
          else { g.strokeStyle = c.stability < 30 ? 'rgba(255,140,60,0.55)' : 'rgba(143,211,255,0.32)'; g.lineWidth = 0.9 / cam.scale; g.stroke(); }
        }
      }
    }
    g.restore();
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // Links: alliances (faint gold), trade for selected, wars (red)
    if (opts.links !== 'none') this.drawLinks(world, offsets, t, selCountry, opts.reducedMotion, opts.links === 'all');
    this.drawClouds(offsets, t, opts.reducedMotion);
    this.drawWeather(world, offsets, t, opts.reducedMotion);
    this.drawZones(world, offsets, t, opts.reducedMotion);
    this.drawFronts(world, offsets, t, opts.reducedMotion);
    this.drawFlows(world, offsets, t, opts.reducedMotion);
    // Cities
    this.drawCities(world, offsets, t, opts);
    // Events
    this.drawEvents(world, offsets, t, opts.reducedMotion);
    // Labels
    this.drawLabels(world, offsets, selCountry);
    // Screen-space vignette (drawn last so it never shows raster seams)
    const v = g.createRadialGradient(this.width / 2, this.height / 2, Math.min(this.width, this.height) * 0.35, this.width / 2, this.height / 2, Math.max(this.width, this.height) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = v; g.fillRect(0, 0, this.width, this.height);
  }

  /** Day/night terminator: a soft shadow band that circles the planet as simulated days pass. */
  private drawNight(world: World, offsets: number[], nowMs: number, reduced: boolean): void {
    const g = this.ctx; const cam = this.camera; const W = this.W;
    // One rotation per simulated day; interpolate with wall-clock so it glides between ticks.
    const phase = reduced ? 0.25 : ((world.day * 0.37 + (nowMs / 60000)) % 1);
    const centerX = phase * W; // sub-solar longitude in grid units
    this.nightCenterX = this.wrapX(centerX + W / 2);
    void offsets;
    {
      for (const k of [-2, -1, 0, 1, 2]) {
        const nightCenter = centerX + W / 2 + k * W;
        const [sx] = this.worldToScreen(nightCenter, 0);
        const half = (W / 2) * cam.scale;
        if (sx + half < 0 || sx - half > this.width) continue;
        const grad = g.createLinearGradient(sx - half, 0, sx + half, 0);
        grad.addColorStop(0, 'rgba(2,4,12,0)'); grad.addColorStop(0.28, 'rgba(2,4,12,0.34)'); grad.addColorStop(0.5, 'rgba(2,4,12,0.42)'); grad.addColorStop(0.72, 'rgba(2,4,12,0.34)'); grad.addColorStop(1, 'rgba(2,4,12,0)');
        g.fillStyle = grad; g.fillRect(sx - half, 0, half * 2, this.height);
      }
    }
  }

  private capitalPos(world: World, c: Country): [number, number] { const cap = world.cities[c.capitalId]; return cap ? [cap.x, cap.y] : [c.centroid.x, c.centroid.y]; }

  private arc(g: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number): void {
    // shortest-wrap delta
    let dx = bx - ax; const W = this.W; if (dx > W / 2) dx -= W; if (dx < -W / 2) dx += W;
    const ex = ax + dx, ey = by;
    const mx = (ax + ex) / 2, my = (ay + ey) / 2;
    const len = Math.hypot(dx, ey - ay);
    const nx = -(ey - ay) / (len || 1), ny = dx / (len || 1);
    const bulge = Math.min(14, len * 0.25);
    const [sx, sy] = this.worldToScreen(ax, ay); const [tx, ty] = this.worldToScreen(ex, ey); const [cx, cy] = this.worldToScreen(mx + nx * bulge, my + ny * bulge);
    g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(cx, cy, tx, ty);
  }

  private drawLinks(world: World, offsets: number[], t: number, sel: ID | null | undefined, reduced: boolean, all: boolean): void {
    const g = this.ctx; const countries = Object.values(world.countries);
    g.save(); g.lineCap = 'round';
    for (const ox of offsets) {
      const shift = (c: Country): [number, number] => { const [x, y] = this.capitalPos(world, c); return [x + ox, y]; };
      // alliances
      const drawn = new Set<string>();
      for (const c of countries) {
        for (const a of c.alliances) { const key = c.id < a ? c.id + a : a + c.id; if (drawn.has(key)) continue; drawn.add(key); const o = world.countries[a]; if (!o) continue; const [ax, ay] = shift(c); const [bx, by] = this.capitalPos(world, o); this.arc(g, ax, ay, bx, by); const hot = sel === c.id || sel === a; g.strokeStyle = hot ? 'rgba(255,210,122,0.85)' : 'rgba(240,179,90,0.16)'; g.lineWidth = hot ? 1.6 : 0.9; g.stroke(); }
        if (sel === c.id || all) for (const tp of c.tradePartners) { if (all && c.id > tp) continue; const o = world.countries[tp]; if (!o || c.alliances.includes(tp)) continue; const [ax, ay] = shift(c); const [bx, by] = this.capitalPos(world, o); const vol = tradeVolume(world, c, o); if (vol <= 0) continue; const wgt = Math.min(1, Math.log10(1 + vol) / 4); this.arc(g, ax, ay, bx, by); g.strokeStyle = sel === c.id ? `rgba(143,211,255,${0.3 + wgt * 0.5})` : `rgba(143,211,255,${0.08 + wgt * 0.18})`; g.lineWidth = 0.6 + wgt * 2.4; g.setLineDash([4, 6]); g.lineDashOffset = reduced ? 0 : -t * (12 + wgt * 24); g.stroke(); g.setLineDash([]); }
        for (const w of c.atWarWith) { if (c.id > w) continue; const o = world.countries[w]; if (!o) continue; const [ax, ay] = shift(c); const [bx, by] = this.capitalPos(world, o); this.arc(g, ax, ay, bx, by); g.strokeStyle = `rgba(255,77,77,${0.5 + 0.3 * Math.sin(t * 4)})`; g.lineWidth = 2; g.setLineDash([6, 5]); g.lineDashOffset = reduced ? 0 : -t * 30; g.stroke(); g.setLineDash([]); }
      }
    }
    g.restore();
  }

  /** Slow drifting cloud shadows: a handful of soft blobs on fixed wrap-around tracks. Purely atmospheric. */
  private drawClouds(offsets: number[], t: number, reduced: boolean): void {
    const g = this.ctx; const W = this.W, H = this.H; const cam = this.camera;
    if (cam.scale > this.fitScale() * 4) return; // hidden when zoomed far in
    const CLOUDS = 9;
    for (let i = 0; i < CLOUDS; i++) {
      const speed = 0.6 + (i % 3) * 0.35; // grid units per minute
      const x = ((i * 53.7) + (reduced ? 0 : (t / 60) * speed * 60)) % W;
      const y = 12 + ((i * 37.1) % (H - 24)) + Math.sin(t * 0.05 + i) * 3;
      const rx = (14 + (i % 4) * 6) * cam.scale, ry = (7 + (i % 3) * 4) * cam.scale;
      for (const ox of offsets) {
        const [sx, sy] = this.worldToScreen(x + ox, y);
        if (sx + rx < 0 || sx - rx > this.width || sy + ry < 0 || sy - ry > this.height) continue;
        const grad = g.createRadialGradient(sx, sy, 0, sx, sy, 1);
        grad.addColorStop(0, 'rgba(255,255,255,0.055)'); grad.addColorStop(0.55, 'rgba(255,255,255,0.03)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.save(); g.translate(sx, sy); g.scale(rx, ry); g.translate(-sx, -sy); g.fillStyle = grad; g.beginPath(); g.arc(sx, sy, 1, 0, Math.PI * 2); g.fill(); g.restore();
      }
    }
  }

  /** Weather fronts: the engine's storm cells (simulation-time positions, wall-clock sub-day glide), darkening and flickering over stressed land. */
  private drawWeather(world: World, offsets: number[], t: number, reduced: boolean): void {
    const g = this.ctx; const cam = this.camera;
    const sub = reduced ? 0 : (t / 20) % 1; // glides a day's worth of motion over ~20 s of wall-clock
    for (const [i, cell] of stormCells(world, sub).entries()) {
      const rx = cell.rx * cam.scale, ry = cell.ry * cam.scale; const strength = cell.strength;
      for (const ox of offsets) {
        const [sx, sy] = this.worldToScreen(cell.x + ox, cell.y);
        if (sx + rx < 0 || sx - rx > this.width || sy + ry < 0 || sy - ry > this.height) continue;
        const grad = g.createRadialGradient(sx, sy, 0, sx, sy, 1);
        grad.addColorStop(0, `rgba(20,26,48,${0.4 * strength})`); grad.addColorStop(0.6, `rgba(20,26,48,${0.2 * strength})`); grad.addColorStop(1, 'rgba(20,26,48,0)');
        g.save(); g.translate(sx, sy); g.scale(rx, ry); g.translate(-sx, -sy); g.fillStyle = grad; g.beginPath(); g.arc(sx, sy, 1, 0, Math.PI * 2); g.fill(); g.restore();
        if (!reduced && strength > 0.45) {
          const ph = (t * (0.5 + strength) + i * 1.9) % 3;
          if (ph < 0.12) {
            const fx = sx + Math.sin(i * 7 + Math.floor(t)) * rx * 0.4, fy = sy + Math.cos(i * 5 + Math.floor(t)) * ry * 0.4;
            const fl = g.createRadialGradient(fx, fy, 0, fx, fy, rx * 0.5);
            fl.addColorStop(0, `rgba(220,230,255,${0.6 * (1 - ph / 0.12)})`); fl.addColorStop(1, 'rgba(220,230,255,0)');
            g.fillStyle = fl; g.beginPath(); g.arc(fx, fy, rx * 0.5, 0, Math.PI * 2); g.fill();
          }
        }
      }
    }
  }

  /** Decaying impact zones for disasters, epidemics and battles (last 60 days). */
  private drawZones(world: World, offsets: number[], t: number, reduced: boolean): void {
    const g = this.ctx; const cam = this.camera;
    const zones = world.events.filter((e) => world.day - e.day <= 60 && (e.type.startsWith('disaster.') || e.type.startsWith('health.') || e.type === 'battle' || e.type === 'crackdown')).slice(-24);
    for (const ev of zones) {
      const life = 1 - (world.day - ev.day) / 60;
      const kind = ev.type.startsWith('health.') ? 'health' : ev.type === 'battle' || ev.type === 'crackdown' ? 'war' : 'disaster';
      const col = kind === 'health' ? '163,230,53' : kind === 'war' ? '255,77,77' : /meteor|volcano|wildfire|drought/.test(ev.type) ? '255,140,60' : '96,180,255';
      const radius = (3 + ev.severity * 2.2) * (kind === 'health' && ev.data?.pandemic ? 3 : 1) * cam.scale;
      for (const ox of offsets) {
        const [sx, sy] = this.worldToScreen(ev.location.x + ox, ev.location.y);
        if (sx < -radius || sx > this.width + radius || sy < -radius || sy > this.height + radius) continue;
        const pulse = reduced ? 1 : 0.9 + 0.1 * Math.sin(t * 2 + ev.location.y);
        const grad = g.createRadialGradient(sx, sy, 0, sx, sy, radius * pulse);
        grad.addColorStop(0, `rgba(${col},${0.28 * life})`); grad.addColorStop(0.6, `rgba(${col},${0.12 * life})`); grad.addColorStop(1, `rgba(${col},0)`);
        g.fillStyle = grad; g.beginPath(); g.arc(sx, sy, radius * pulse, 0, Math.PI * 2); g.fill();
        if (kind === 'disaster' && ev.severity >= 4) { g.strokeStyle = `rgba(${col},${0.35 * life})`; g.lineWidth = 1; g.setLineDash([3, 5]); g.beginPath(); g.arc(sx, sy, radius * 0.7, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); }
      }
    }
  }

  /** Shared border segments between two country indexes (grid coords), cached per pair. */
  private frontCache = new Map<string, number[][]>();
  private frontsFor(world: World, ra: number, rb: number): number[][] {
    const key = `${ra}:${rb}:${world.geography.countryOrder.length}`;
    const hit = this.frontCache.get(key); if (hit) return hit;
    const geo = world.geography; const W = geo.width, H = geo.height; const cells = geo.cells;
    const segs: number[][] = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = cells[y * W + x]; if (c !== ra) continue;
      const right = cells[y * W + ((x + 1) % W)];
      if (right === rb) segs.push([x + 1, y, x + 1, y + 1]);
      if (x === 0 && cells[y * W + W - 1] === rb) segs.push([0, y, 0, y + 1]);
      if (y + 1 < H && cells[(y + 1) * W + x] === rb) segs.push([x, y + 1, x + 1, y + 1]);
      if (y > 0 && cells[(y - 1) * W + x] === rb) segs.push([x, y, x + 1, y]);
      const left = cells[y * W + ((x - 1 + W) % W)];
      if (left === rb) segs.push([x, y, x, y + 1]);
    }
    if (this.frontCache.size > 64) this.frontCache.clear();
    this.frontCache.set(key, segs);
    return segs;
  }

  /** Active war fronts: burning, flickering lines along borders shared by countries at war. */
  private drawFronts(world: World, offsets: number[], t: number, reduced: boolean): void {
    const g = this.ctx; const cam = this.camera;
    const order = world.geography.countryOrder;
    const idx = new Map<ID, number>(); order.forEach((id, i) => idx.set(id, i));
    const pairs: [number, number][] = [];
    for (const c of Object.values(world.countries)) {
      const ra = idx.get(c.id); if (ra === undefined) continue;
      for (const e of c.atWarWith) { const rb = idx.get(e); if (rb === undefined || rb < ra) continue; if (c.neighbors.includes(e)) pairs.push([ra, rb]); }
    }
    if (!pairs.length) return;
    g.save(); g.lineCap = 'round';
    for (const [ra, rb] of pairs) {
      const segs = this.frontsFor(world, ra, rb); if (!segs.length) continue;
      const flicker = reduced ? 0.75 : 0.6 + 0.25 * Math.sin(t * 5 + ra * 1.7);
      for (const ox of offsets) {
        g.setTransform(this.dpr * cam.scale, 0, 0, this.dpr * cam.scale, this.dpr * ((ox - cam.x) * cam.scale + this.width / 2), this.dpr * ((0 - cam.y) * cam.scale + this.height / 2));
        // Ember glow under the line
        g.strokeStyle = `rgba(255,120,40,${0.3 * flicker})`; g.lineWidth = 9 / cam.scale;
        g.beginPath(); for (const [x1, y1, x2, y2] of segs) { g.moveTo(x1, y1); g.lineTo(x2, y2); } g.stroke();
        // Marching hot line
        g.strokeStyle = `rgba(255,220,120,${0.85 * flicker})`; g.lineWidth = 1.6 / cam.scale;
        g.setLineDash([2.5, 2]); g.lineDashOffset = reduced ? 0 : -t * 6;
        g.beginPath(); for (const [x1, y1, x2, y2] of segs) { g.moveTo(x1, y1); g.lineTo(x2, y2); } g.stroke();
        g.setLineDash([]);
        // Sparks: a few flickering points along the front, deterministic per segment
        if (!reduced && cam.scale > 2.5) {
          g.fillStyle = 'rgba(255,240,200,0.9)';
          for (let i = 0; i < segs.length; i += 3) {
            const [x1, y1, x2, y2] = segs[i];
            const ph = (t * 1.3 + i * 0.37) % 1; if (ph > 0.35) continue;
            const r = (1 - ph / 0.35) * 1.2 / cam.scale;
            g.beginPath(); g.arc((x1 + x2) / 2, (y1 + y2) / 2 - ph * 3, r, 0, Math.PI * 2); g.fill();
          }
        }
      }
    }
    g.restore();
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  /** Animated particle flows for migration waves (last 40 days). */
  private drawFlows(world: World, offsets: number[], t: number, reduced: boolean): void {
    const g = this.ctx;
    const flows = world.events.filter((e) => e.type === 'migration.wave' && world.day - e.day <= 40).slice(-6);
    if (!flows.length) return;
    for (const ev of flows) {
      const [fromRef, toRef] = ev.actors;
      const from = fromRef && world.countries[fromRef.id], to = toRef && world.countries[toRef.id];
      if (!from || !to) continue;
      const age = 1 - (world.day - ev.day) / 40;
      const [ax, ay] = this.capitalPos(world, from); const [bx, by] = this.capitalPos(world, to);
      let dx = bx - ax; const W = this.W; if (dx > W / 2) dx -= W; if (dx < -W / 2) dx += W;
      const n = 14;
      for (const ox of offsets) {
        for (let i = 0; i < n; i++) {
          const phase = reduced ? i / n : ((t * 0.25 + i / n + ev.location.x * 0.01) % 1);
          const wob = Math.sin(phase * Math.PI) * 3 * (i % 2 ? 1 : -1);
          const px = ax + ox + dx * phase, py = ay + (by - ay) * phase + wob * 0.3;
          const [sx, sy] = this.worldToScreen(px, py);
          if (sx < -10 || sx > this.width + 10) continue;
          g.fillStyle = `rgba(251,146,60,${(0.25 + 0.6 * Math.sin(phase * Math.PI)) * age})`;
          g.beginPath(); g.arc(sx, sy, 1.6, 0, Math.PI * 2); g.fill();
        }
      }
    }
  }

  private sprite(kind: 'city' | 'capital', r: number, warm: number): HTMLCanvasElement {
    const key = `${kind}:${r.toFixed(1)}:${warm.toFixed(1)}`;
    let s = this.citySprites.get(key);
    if (s) return s;
    const size = Math.ceil(r * 8) + 4; s = document.createElement('canvas'); s.width = s.height = size;
    const g = s.getContext('2d')!; const c = size / 2;
    const col = warm > 0.5 ? '255,214,140' : '160,215,255';
    const grad = g.createRadialGradient(c, c, 0, c, c, r * 4);
    grad.addColorStop(0, `rgba(${col},0.95)`); grad.addColorStop(0.18, `rgba(${col},0.55)`); grad.addColorStop(0.5, `rgba(${col},0.12)`); grad.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = grad; g.fillRect(0, 0, size, size);
    g.fillStyle = '#fff8e6'; g.beginPath(); g.arc(c, c, Math.max(1.2, r * 0.6), 0, Math.PI * 2); g.fill();
    if (kind === 'capital') { g.strokeStyle = `rgba(${col},0.9)`; g.lineWidth = 1.2; g.beginPath(); g.arc(c, c, r * 1.4, 0, Math.PI * 2); g.stroke(); }
    this.citySprites.set(key, s);
    return s;
  }

  private drawCities(world: World, offsets: number[], t: number, opts: RenderOptions): void {
    const g = this.ctx; const cam = this.camera;
    const zoomFactor = clamp(cam.scale / this.fitScale(), 0.8, 3);
    const selCity = opts.selection?.kind === 'city' ? opts.selection.id : null;
    for (const ox of offsets) {
      for (const city of Object.values(world.cities)) {
        const [sx, sy] = this.worldToScreen(city.x + ox, city.y);
        if (sx < -40 || sx > this.width + 40 || sy < -40 || sy > this.height + 40) continue;
        let r = this.cityRadius(city) * Math.sqrt(zoomFactor) * 0.9;
        if (city.unrest > 55 && !opts.reducedMotion) r *= 1 + 0.15 * Math.sin(t * 6 + city.x);
        // Lights come on at night: cities near the dark longitude glow larger and brighter.
        let dn = Math.abs(city.x - this.nightCenterX); dn = Math.min(dn, this.W - dn);
        const night = clamp(1 - dn / (this.W * 0.3), 0, 1);
        r *= 1 + 0.45 * night;
        g.globalAlpha = 0.62 + 0.38 * night;
        const warm = city.prosperity / 100;
        const spr = this.sprite(city.capital ? 'capital' : 'city', Math.round(r * 2) / 2, Math.round(warm * 2) / 2);
        g.drawImage(spr, sx - spr.width / 2, sy - spr.height / 2);
        g.globalAlpha = 1;
        if (city.unrest > 55) { g.strokeStyle = `rgba(255,120,60,${0.3 + 0.3 * Math.sin(t * 6 + city.y)})`; g.lineWidth = 1; g.beginPath(); g.arc(sx, sy, r * 1.8, 0, Math.PI * 2); g.stroke(); }
        if (selCity === city.id) { g.strokeStyle = 'rgba(255,210,122,0.95)'; g.lineWidth = 2; g.beginPath(); g.arc(sx, sy, r * 2.2 + 3 + Math.sin(t * 4) * 1.5, 0, Math.PI * 2); g.stroke(); }
      }
    }
  }

  private drawEvents(world: World, offsets: number[], t: number, reduced: boolean): void {
    const g = this.ctx;
    for (const ev of this.recentEvents) {
      const age = world.day - ev.day; // 0..20
      const life = 1 - age / (ev.severity >= 4 ? 20 : 10);
      if (life <= 0) continue;
      const col = ev.playerIntervention ? '#ffd27a' : CATEGORY_COLORS[ev.category] ?? '#8fd3ff';
      for (const ox of offsets) {
        const [sx, sy] = this.worldToScreen(ev.location.x + ox, ev.location.y);
        if (sx < -60 || sx > this.width + 60 || sy < -60 || sy > this.height + 60) continue;
        const base = 6 + ev.severity * 5;
        const phase = reduced ? 0.5 : ((t * (0.6 + ev.severity * 0.15) + ev.location.x) % 1);
        const r = base * (0.3 + phase) * (0.6 + life * 0.4);
        g.strokeStyle = hexA(col, (1 - phase) * 0.9 * life); g.lineWidth = ev.severity >= 4 ? 2 : 1.2;
        g.beginPath(); g.arc(sx, sy, r, 0, Math.PI * 2); g.stroke();
        if (ev.severity >= 4) { const p2 = (phase + 0.5) % 1; g.strokeStyle = hexA(col, (1 - p2) * 0.7 * life); g.beginPath(); g.arc(sx, sy, base * (0.3 + p2), 0, Math.PI * 2); g.stroke(); }
        g.fillStyle = hexA(col, 0.9 * life); g.beginPath(); g.arc(sx, sy, ev.severity >= 4 ? 3 : 2, 0, Math.PI * 2); g.fill();
      }
    }
  }

  private drawLabels(world: World, offsets: number[], sel: ID | null | undefined): void {
    const g = this.ctx; const cam = this.camera; const fit = this.fitScale(); const z = cam.scale / fit;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const ox of offsets) {
      for (const c of Object.values(world.countries)) {
        let lab = this.labelCache.get(c.id);
        if (!lab) { const r = this.countryIndex.get(c.id); const polys = r !== undefined ? this.shapes!.byCountry.get(r) : undefined; const big = polys?.[0]; const area = big ? polygonArea(big) : c.area; lab = { x: c.centroid.x, y: c.centroid.y, size: clamp(Math.sqrt(area) * 0.9, 7, 22) }; if (big) { let sx = 0, sy = 0; const n = big.length / 2; for (let i = 0; i < big.length; i += 2) { sx += big[i]; sy += big[i + 1]; } lab.x = sx / n; lab.y = sy / n; } this.labelCache.set(c.id, lab); }
        const px = lab.size * Math.sqrt(z);
        if (px < 6.5 && sel !== c.id) continue;
        const [sx, sy] = this.worldToScreen(lab.x + ox, lab.y);
        if (sx < -100 || sx > this.width + 100 || sy < -30 || sy > this.height + 30) continue;
        const font = clamp(px, 9, 20);
        g.font = `700 ${font}px Inter, system-ui, sans-serif`;
        const text = c.name.toUpperCase();
        g.lineWidth = 3; g.strokeStyle = 'rgba(4,6,12,0.8)'; g.lineJoin = 'round';
        g.letterSpacing = '0.14em';
        g.strokeText(text, sx, sy);
        g.fillStyle = sel === c.id ? '#ffd27a' : c.atWarWith.length ? 'rgba(255,170,170,0.95)' : 'rgba(220,232,245,0.85)';
        g.fillText(text, sx, sy);
        g.letterSpacing = '0px';
      }
      if (z > 1.8) {
        g.font = `500 ${clamp(9 * Math.sqrt(z / 2), 9, 13)}px Inter, system-ui, sans-serif`;
        for (const city of Object.values(world.cities)) {
          if (!city.capital && z < 3.2) continue;
          if (!city.capital && city.population < 800_000 && z < 5) continue;
          const [sx, sy] = this.worldToScreen(city.x + ox, city.y);
          if (sx < -60 || sx > this.width + 60 || sy < -20 || sy > this.height + 20) continue;
          const r = this.cityRadius(city) * Math.sqrt(clamp(cam.scale / fit, 0.8, 3));
          g.textAlign = 'left'; g.lineWidth = 3; g.strokeStyle = 'rgba(4,6,12,0.85)';
          g.strokeText(city.name, sx + r + 4, sy); g.fillStyle = city.capital ? 'rgba(255,240,210,0.95)' : 'rgba(200,215,235,0.8)'; g.fillText(city.name, sx + r + 4, sy);
          g.textAlign = 'center';
        }
      }
    }
  }
}

function ramp(v: number, hues: [number, number, number]): string {
  const t = clamp(v, 0, 1);
  const h = t < 0.5 ? hues[0] + (hues[1] - hues[0]) * (t / 0.5) : hues[1] + (hues[2] - hues[1]) * ((t - 0.5) / 0.5);
  return `hsl(${h.toFixed(0)} 45% ${(14 + t * 14).toFixed(0)}%)`;
}
function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16); const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${clamp(a, 0, 1).toFixed(3)})`;
}
