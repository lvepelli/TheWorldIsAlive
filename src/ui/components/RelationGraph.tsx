import React, { useEffect, useMemo, useRef } from 'react';
import type { EntityRef, World } from '@/engine/types';
import { useGame } from '@/state/store';
import { hueFor } from '../format';

interface Node { ref: EntityRef; label: string; x: number; y: number; vx: number; vy: number; hue: number; size: number; }
interface Edge { a: number; b: number; w: number; color: string; }

/** Builds a small ego-network around an entity from relationships, affiliations, alliances and events. */
export function buildGraph(world: World, center: EntityRef): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []; const edges: Edge[] = []; const idx = new Map<string, number>();
  const add = (ref: EntityRef, label: string, size = 6): number => { const k = ref.kind + ref.id; let i = idx.get(k); if (i === undefined) { i = nodes.length; idx.set(k, i); nodes.push({ ref, label, x: Math.random() * 100 - 50, y: Math.random() * 100 - 50, vx: 0, vy: 0, hue: hueFor(ref.id), size }); } return i; };
  const link = (a: number, b: number, w: number, color: string) => { if (a !== b) edges.push({ a, b, w, color }); };
  const nameOf = (ref: EntityRef): string => { const e = ref.kind === 'person' ? world.people[ref.id] : ref.kind === 'country' ? world.countries[ref.id] : ref.kind === 'company' ? world.companies[ref.id] : ref.kind === 'organization' ? world.organizations[ref.id] : ref.kind === 'city' ? world.cities[ref.id] : ref.kind === 'outlet' ? world.outlets[ref.id] : undefined; return (e as { name?: string } | undefined)?.name ?? '?'; };
  const c0 = add(center, nameOf(center), 12);
  if (center.kind === 'country') {
    const c = world.countries[center.id];
    for (const a of c.alliances) link(c0, add({ kind: 'country', id: a }, nameOf({ kind: 'country', id: a }), 8), 1, 'rgba(240,179,90,0.7)');
    for (const a of c.atWarWith) link(c0, add({ kind: 'country', id: a }, nameOf({ kind: 'country', id: a }), 8), 1, 'rgba(255,77,77,0.8)');
    for (const a of c.neighbors) if (!c.alliances.includes(a) && !c.atWarWith.includes(a)) link(c0, add({ kind: 'country', id: a }, nameOf({ kind: 'country', id: a }), 7), 0.4, (c.relations[a] ?? 0) < -30 ? 'rgba(255,140,60,0.5)' : 'rgba(143,211,255,0.3)');
    link(c0, add({ kind: 'person', id: c.leaderId }, nameOf({ kind: 'person', id: c.leaderId }), 8), 1, 'rgba(167,139,250,0.7)');
    for (const m of c.movements.slice(0, 3)) if (world.organizations[m]?.alive) link(c0, add({ kind: 'organization', id: m }, nameOf({ kind: 'organization', id: m }), 6), 0.6, 'rgba(251,146,60,0.6)');
    for (const co of Object.values(world.companies).filter((x) => x.alive && x.countryId === c.id).sort((a, b) => b.value - a.value).slice(0, 4)) link(c0, add({ kind: 'company', id: co.id }, co.name, 6), 0.5, 'rgba(96,165,250,0.5)');
  } else if (center.kind === 'person') {
    const p = world.people[center.id];
    link(c0, add({ kind: 'country', id: p.countryId }, nameOf({ kind: 'country', id: p.countryId }), 8), 0.6, 'rgba(143,211,255,0.4)');
    for (const a of p.affiliations) { const ref: EntityRef = world.companies[a] ? { kind: 'company', id: a } : { kind: 'organization', id: a }; link(c0, add(ref, nameOf(ref), 7), 0.8, 'rgba(96,165,250,0.6)'); }
    for (const r of p.relationships.slice(0, 8)) link(c0, add(r.target, nameOf(r.target), 6), 0.6, r.strength < 0 ? 'rgba(255,77,77,0.6)' : 'rgba(88,214,141,0.6)');
    // people who share events
    const shared = new Map<string, number>();
    for (const ev of world.events.slice(-400)) if (ev.actors.some((a) => a.kind === 'person' && a.id === p.id)) for (const a of ev.actors) if (a.kind === 'person' && a.id !== p.id) shared.set(a.id, (shared.get(a.id) ?? 0) + 1);
    for (const [id, n] of Array.from(shared.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6)) link(c0, add({ kind: 'person', id }, nameOf({ kind: 'person', id }), 6), Math.min(1, n / 3), 'rgba(196,181,253,0.5)');
  } else if (center.kind === 'company') {
    const co = world.companies[center.id];
    link(c0, add({ kind: 'person', id: co.ceoId }, nameOf({ kind: 'person', id: co.ceoId }), 8), 1, 'rgba(167,139,250,0.7)');
    link(c0, add({ kind: 'country', id: co.countryId }, nameOf({ kind: 'country', id: co.countryId }), 8), 0.6, 'rgba(143,211,255,0.4)');
    for (const r of Object.values(world.companies).filter((x) => x.alive && x.sector === co.sector && x.id !== co.id).sort((a, b) => b.value - a.value).slice(0, 5)) link(c0, add({ kind: 'company', id: r.id }, r.name, 6), 0.4, 'rgba(255,140,60,0.4)');
  } else if (center.kind === 'organization') {
    const o = world.organizations[center.id];
    if (o.leaderId) link(c0, add({ kind: 'person', id: o.leaderId }, nameOf({ kind: 'person', id: o.leaderId }), 8), 1, 'rgba(167,139,250,0.7)');
    if (o.countryId) link(c0, add({ kind: 'country', id: o.countryId }, nameOf({ kind: 'country', id: o.countryId }), 8), 0.6, 'rgba(143,211,255,0.4)');
    for (const m of o.memberIds.slice(0, 8)) { const ref: EntityRef = world.countries[m] ? { kind: 'country', id: m } : { kind: 'person', id: m }; if (m !== o.leaderId) link(c0, add(ref, nameOf(ref), 6), 0.6, 'rgba(240,179,90,0.5)'); }
  } else if (center.kind === 'event') {
    const ev = world.events.find((e) => e.id === center.id);
    if (ev) {
      for (const a of ev.actors) link(c0, add(a, nameOf(a), 7), 0.8, 'rgba(143,211,255,0.5)');
      for (const c of ev.consequences) { const e2 = world.events.find((x) => x.id === c); if (e2) link(c0, add({ kind: 'event', id: c }, e2.title, 6), 0.8, 'rgba(240,179,90,0.6)'); }
      if (typeof ev.causedBy === 'string' && ev.causedBy.startsWith('ev_')) { const e2 = world.events.find((x) => x.id === ev.causedBy); if (e2) link(add({ kind: 'event', id: e2.id }, e2.title, 6), c0, 0.8, 'rgba(240,179,90,0.6)'); }
    }
  }
  return { nodes, edges };
}

export function RelationGraph({ center }: { center: EntityRef }): React.ReactElement {
  const ref = useRef<HTMLCanvasElement>(null);
  const world = useGame((s) => s.world)!;
  const select = useGame((s) => s.select);
  useEffect(() => {
    const canvas = ref.current!; const ctx = canvas.getContext('2d')!;
    const { nodes, edges } = buildGraph(world, center);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect(); canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
    const W = rect.width, H = rect.height;
    nodes[0].x = 0; nodes[0].y = 0;
    let frame = 0; let raf = 0;
    const step = () => {
      // simple force layout
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) { const a = nodes[i], b = nodes[j]; let dx = b.x - a.x, dy = b.y - a.y; const d2 = dx * dx + dy * dy + 0.01; const f = 900 / d2; dx *= f; dy *= f; a.vx -= dx; a.vy -= dy; b.vx += dx; b.vy += dy; }
      for (const e of edges) { const a = nodes[e.a], b = nodes[e.b]; const dx = b.x - a.x, dy = b.y - a.y; const d = Math.hypot(dx, dy) || 1; const target = 70 + (1 - e.w) * 40; const f = (d - target) * 0.02; a.vx += (dx / d) * f; a.vy += (dy / d) * f; b.vx -= (dx / d) * f; b.vy -= (dy / d) * f; }
      for (let i = 1; i < nodes.length; i++) { const n = nodes[i]; n.vx += -n.x * 0.002; n.vy += -n.y * 0.002; n.vx *= 0.82; n.vy *= 0.82; n.x += n.vx; n.y += n.vy; }
      nodes[0].x = 0; nodes[0].y = 0;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      const sx = (x: number) => W / 2 + x, sy = (y: number) => H / 2 + y;
      for (const e of edges) { const a = nodes[e.a], b = nodes[e.b]; ctx.strokeStyle = e.color; ctx.lineWidth = 1 + e.w; ctx.beginPath(); ctx.moveTo(sx(a.x), sy(a.y)); ctx.lineTo(sx(b.x), sy(b.y)); ctx.stroke(); }
      ctx.textAlign = 'center'; ctx.font = '11px Inter, system-ui, sans-serif';
      for (const n of nodes) { const x = sx(n.x), y = sy(n.y); const g = ctx.createRadialGradient(x, y, 0, x, y, n.size * 2.2); g.addColorStop(0, `hsla(${n.hue},80%,70%,0.9)`); g.addColorStop(1, `hsla(${n.hue},80%,60%,0)`); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, n.size * 2.2, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = n === nodes[0] ? '#ffd27a' : `hsl(${n.hue},70%,75%)`; ctx.beginPath(); ctx.arc(x, y, n.size * 0.6, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(230,237,247,0.9)'; ctx.strokeStyle = 'rgba(4,6,12,0.8)'; ctx.lineWidth = 3; const label = n.label.length > 22 ? n.label.slice(0, 21) + '…' : n.label; ctx.strokeText(label, x, y + n.size + 12); ctx.fillText(label, x, y + n.size + 12); }
      if (frame++ < 240) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    const onClick = (e: MouseEvent) => { const r = canvas.getBoundingClientRect(); const mx = e.clientX - r.left - W / 2, my = e.clientY - r.top - H / 2; let best: Node | null = null, bd = 18; for (const n of nodes) { const d = Math.hypot(n.x - mx, n.y - my); if (d < bd) { bd = d; best = n; } } if (best && best !== nodes[0]) select(best.ref); };
    canvas.addEventListener('click', onClick);
    return () => { cancelAnimationFrame(raf); canvas.removeEventListener('click', onClick); };
  }, [world, center.kind, center.id, select, center]);
  const textual = useMemo(() => { const g = buildGraph(world, center); const centreLabel = g.nodes[0]?.label ?? 'this entity'; const lines = g.edges.slice(0, 40).map((e) => `${g.nodes[e.a]?.label} and ${g.nodes[e.b]?.label}: ${e.w > 0.66 ? 'strong tie' : e.w > 0.33 ? 'tie' : 'weak tie'}`); return `Relationship graph around ${centreLabel}: ${g.nodes.length} nodes, ${g.edges.length} ties. ${lines.join('; ')}${g.edges.length > 40 ? '; and more' : ''}.`; }, [world, center.kind, center.id]);
  return <><canvas ref={ref} className="graph" aria-label="Relationship graph" aria-describedby={`graph-text-${center.id}`} /><div id={`graph-text-${center.id}`} className="sr-only">{textual}</div></>;
}
