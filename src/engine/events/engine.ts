/**
 * Event engine: creates events, applies structured effects to entities,
 * records causality and schedules consequences.
 */
import { tidy } from '../text';
import { clamp } from '../rng';
import type { World, WorldEvent, EntityRef, EffectDelta, Severity, EventCategory, ID, Country, City, Person, Company, Organization } from '../types';
import { nextId } from '../ids';

export interface EventDraft {
  category: EventCategory;
  type: string;
  title: string;
  description: string;
  severity: Severity;
  location?: { countryId?: ID; cityId?: ID; x?: number; y?: number };
  actors?: EntityRef[];
  causedBy?: ID | 'simulation' | 'player';
  effects?: EffectDelta[];
  tags?: string[];
  mediaRelevance?: number;
  socialRelevance?: number;
  historic?: boolean;
  playerIntervention?: boolean;
  data?: Record<string, unknown>;
  relatedEvents?: ID[];
}

export const MAX_EVENTS = 3000;

export function resolveLocation(world: World, loc?: EventDraft['location']): WorldEvent['location'] {
  if (loc?.x !== undefined && loc?.y !== undefined) return { countryId: loc.countryId, cityId: loc.cityId, x: loc.x, y: loc.y };
  if (loc?.cityId && world.cities[loc.cityId]) { const c = world.cities[loc.cityId]; return { countryId: c.countryId, cityId: c.id, x: c.x, y: c.y }; }
  if (loc?.countryId && world.countries[loc.countryId]) {
    const c = world.countries[loc.countryId];
    const cap = world.cities[c.capitalId];
    return { countryId: c.id, cityId: cap?.id, x: cap?.x ?? c.centroid.x, y: cap?.y ?? c.centroid.y };
  }
  return { x: world.geography.width / 2, y: world.geography.height / 2 };
}

export function createEvent(world: World, draft: EventDraft): WorldEvent {
  const ev: WorldEvent = {
    id: nextId(world, 'ev'), kind: 'event', day: world.day, category: draft.category, type: draft.type, title: tidy(draft.title), description: tidy(draft.description),
    severity: draft.severity, location: resolveLocation(world, draft.location), actors: draft.actors ?? [], causedBy: draft.causedBy ?? 'simulation',
    consequences: [], relatedEvents: draft.relatedEvents ?? [], affectedEntities: [], effects: draft.effects ?? [], tags: draft.tags ?? [],
    mediaRelevance: draft.mediaRelevance ?? Math.min(1, draft.severity / 5 + 0.1), socialRelevance: draft.socialRelevance ?? Math.min(1, draft.severity / 5),
    historic: draft.historic ?? draft.severity >= 4, playerIntervention: draft.playerIntervention, data: draft.data,
  };
  // Apply effects
  for (const e of ev.effects) applyEffect(world, e, ev);
  const affected = new Map<string, EntityRef>();
  for (const e of ev.effects) affected.set(e.target.kind + e.target.id, e.target);
  for (const a of ev.actors) affected.set(a.kind + a.id, a);
  ev.affectedEntities = Array.from(affected.values());
  // Causality links
  if (typeof ev.causedBy === 'string' && ev.causedBy.startsWith('ev_')) {
    const parent = world.events.find((x) => x.id === ev.causedBy);
    if (parent) parent.consequences.push(ev.id);
  }
  world.events.push(ev);
  world.stats.eventsGenerated++;
  if (world.events.length > MAX_EVENTS) {
    // Keep historic events forever; drop the oldest non-historic ones (minor first) down to 90% of the cap.
    const target = Math.floor(MAX_EVENTS * 0.9);
    let toRemove = world.events.length - target;
    const keep: WorldEvent[] = [];
    for (let pass = 0; pass < 2 && toRemove > 0; pass++) {
      const src = pass === 0 ? world.events : keep.splice(0);
      for (const e of src) {
        const droppable = !e.historic && world.day - e.day > 180 && (pass === 0 ? e.severity <= 2 : e.severity <= 3);
        if (toRemove > 0 && droppable) { toRemove--; continue; }
        keep.push(e);
      }
    }
    world.events = keep;
  }
  // Entity histories
  const recordable = ev.severity >= 2;
  if (recordable) {
    for (const ref of ev.affectedEntities) {
      const ent = getEntity(world, ref);
      if (ent && 'history' in ent && Array.isArray((ent as { history: unknown[] }).history)) {
        const h = (ent as { history: { day: number; text: string; eventId?: ID }[] }).history;
        h.push({ day: ev.day, text: ev.title, eventId: ev.id });
        if (h.length > 60) h.splice(0, h.length - 60);
      }
      if (ref.kind === 'person') {
        const p = world.people[ref.id];
        if (p) { p.memories.push({ day: ev.day, eventId: ev.id, text: ev.title, weight: ev.severity / 5 }); if (p.memories.length > 30) p.memories.splice(0, p.memories.length - 30); }
      }
    }
  }
  return ev;
}

export function getEntity(world: World, ref: EntityRef): Country | City | import('../types').Region | Person | Company | Organization | WorldEvent | import('../types').MediaOutlet | undefined {
  switch (ref.kind) {
    case 'country': return world.countries[ref.id];
    case 'city': return world.cities[ref.id];
    case 'region': return world.regions?.[ref.id];
    case 'person': return world.people[ref.id];
    case 'company': return world.companies[ref.id];
    case 'organization': return world.organizations[ref.id];
    case 'outlet': return world.outlets[ref.id];
    case 'event': return world.events.find((e) => e.id === ref.id);
  }
}

export function entityName(world: World, ref: EntityRef): string {
  const e = getEntity(world, ref);
  if (!e) return '?';
  return 'title' in e && e.kind === 'event' ? e.title : (e as { name: string }).name;
}

const BOUNDS: Record<string, [number, number]> = {
  stability: [0, 100], happiness: [0, 100], approval: [0, 100], unrest: [0, 100], military: [0, 100], technology: [0, 100], corruption: [0, 100],
  freedom: [0, 100], polarization: [0, 100], influence: [0, 100], fame: [0, 100], reputation: [-100, 100], support: [0, 100], prosperity: [0, 100],
  unemployment: [0, 60], inflation: [-5, 300], gdpGrowth: [-30, 30], climateRisk: [0, 100], debt: [0, 400],
};

/** Applies a numeric delta to an entity field; multiplicative for money-like fields when field ends with '%'. */
export function applyEffect(world: World, e: EffectDelta, ev?: WorldEvent): void {
  const ent = getEntity(world, e.target) as Record<string, unknown> | undefined;
  if (!ent) return;
  const pctMode = e.field.endsWith('%');
  const field = pctMode ? e.field.slice(0, -1) : e.field;
  const cur = ent[field];
  if (typeof cur !== 'number' || !isFinite(cur)) return;
  let delta = e.delta;
  // Diminishing returns for valuation boosts on companies that already dwarf their home economy.
  if (pctMode && field === 'value' && delta > 0 && e.target.kind === 'company') {
    const co = world.companies[e.target.id]; const c = co ? world.countries[co.countryId] : undefined;
    if (co && c) { const ceiling = Math.max(5, c.gdp * 0.2); if (co.value > ceiling) delta /= 1 + Math.log(co.value / ceiling) * 3; }
  }
  let next = pctMode ? cur * (1 + delta / 100) : cur + delta;
  const b = BOUNDS[field];
  if (b) next = clamp(next, b[0], b[1]);
  if (field === 'value' || field === 'wealth' || field === 'gdp' || field === 'population' || field === 'revenue') next = Math.max(field === 'population' ? 1000 : 0.01, next);
  ent[field] = next;
}

export function schedule(world: World, ruleId: string, sourceEventId: ID, delayDays: number, payload?: Record<string, unknown>): void {
  world.pending.push({ dueDay: world.day + Math.max(1, Math.round(delayDays)), ruleId, sourceEventId, payload });
}

export function ref(kind: EntityRef['kind'], id: ID): EntityRef { return { kind, id }; }
export function fx(kind: EntityRef['kind'], id: ID, field: string, delta: number, note?: string): EffectDelta { return { target: { kind, id }, field, delta, note }; }
