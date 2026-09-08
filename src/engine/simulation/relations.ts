/**
 * Relationship dynamics: events shift the strength of ties between people and
 * flip their type when they cross thresholds (ally → enemy, rival → ally).
 */
import type { World, Person, Relationship } from '../types';

export function shiftRelationships(world: World, personId: string, delta: number, only?: (r: Relationship, other: Person) => boolean): void {
  const p = world.people[personId]; if (!p) return;
  for (const r of p.relationships) {
    const o = world.people[r.target.id]; if (!o) continue;
    if (only && !only(r, o)) continue;
    r.strength = Math.max(-1, Math.min(1, r.strength + delta));
    normalize(r);
    const back = o.relationships.find((x) => x.target.id === personId);
    if (back) { back.strength = Math.max(-1, Math.min(1, back.strength + delta)); normalize(back); }
  }
}

function normalize(r: Relationship): void {
  if (r.type === 'family') return;
  if (r.strength < -0.45 && (r.type === 'ally' || r.type === 'friend' || r.type === 'partner')) r.type = 'enemy';
  else if (r.strength > 0.45 && (r.type === 'enemy' || r.type === 'rival')) r.type = 'ally';
}

/** Relationship between two specific people (creates one if missing). */
export function relate(world: World, a: Person, b: Person, type: Relationship['type'], delta: number): void {
  if (a.id === b.id) return;
  let r = a.relationships.find((x) => x.target.id === b.id);
  if (!r) { r = { target: { kind: 'person', id: b.id }, type, strength: 0, since: world.day }; a.relationships.push(r); }
  let back = b.relationships.find((x) => x.target.id === a.id);
  if (!back) { back = { target: { kind: 'person', id: a.id }, type, strength: 0, since: world.day }; b.relationships.push(back); }
  r.strength = Math.max(-1, Math.min(1, r.strength + delta)); back.strength = Math.max(-1, Math.min(1, back.strength + delta));
  normalize(r); normalize(back);
  if (a.relationships.length > 14) a.relationships.splice(0, a.relationships.length - 14);
  if (b.relationships.length > 14) b.relationships.splice(0, b.relationships.length - 14);
}
