/**
 * Persistence: IndexedDB (via idb-keyval) with JSON export/import.
 * The `SaveStore` interface is the seam where a backend/database can later
 * replace local storage without touching the engine or UI.
 */
import { get, set, del, keys } from 'idb-keyval';
import type { World } from '../types';
import { SAVE_VERSION } from '../types';
import { formatDate } from '../time';

export interface SaveMeta { slot: string; name: string; seed: string; day: number; date: string; savedAt: number; events: number; countries: number; }

export interface SaveStore {
  list(): Promise<SaveMeta[]>;
  save(slot: string, world: World): Promise<SaveMeta>;
  load(slot: string): Promise<World | null>;
  remove(slot: string): Promise<void>;
}

const PREFIX = 'twia:save:';
const META = 'twia:meta:';

export class IndexedDBStore implements SaveStore {
  async list(): Promise<SaveMeta[]> {
    try {
      const ks = (await keys()) as string[];
      const metas: SaveMeta[] = [];
      for (const k of ks) if (typeof k === 'string' && k.startsWith(META)) { const m = await get<SaveMeta>(k); if (m) metas.push(m); }
      return metas.sort((a, b) => b.savedAt - a.savedAt);
    } catch { return []; }
  }
  async save(slot: string, world: World): Promise<SaveMeta> {
    const meta = metaFor(slot, world);
    await set(PREFIX + slot, serialize(world));
    await set(META + slot, meta);
    return meta;
  }
  async load(slot: string): Promise<World | null> {
    try { const raw = await get<string>(PREFIX + slot); return raw ? deserialize(raw) : null; } catch (e) { console.error('load failed', e); return null; }
  }
  async remove(slot: string): Promise<void> { await del(PREFIX + slot); await del(META + slot); }
}

/** In-memory fallback for environments without IndexedDB (tests, SSR, private mode failures). */
export class MemoryStore implements SaveStore {
  private data = new Map<string, string>();
  private metas = new Map<string, SaveMeta>();
  async list() { return Array.from(this.metas.values()).sort((a, b) => b.savedAt - a.savedAt); }
  async save(slot: string, world: World) { const m = metaFor(slot, world); this.data.set(slot, serialize(world)); this.metas.set(slot, m); return m; }
  async load(slot: string) { const r = this.data.get(slot); return r ? deserialize(r) : null; }
  async remove(slot: string) { this.data.delete(slot); this.metas.delete(slot); }
}

export function metaFor(slot: string, world: World): SaveMeta {
  return { slot, name: world.meta.name, seed: world.meta.seed, day: world.day, date: formatDate(world.day, world.meta.startYear), savedAt: Date.now(), events: world.events.length, countries: Object.keys(world.countries).length };
}

export function serialize(world: World): string { return JSON.stringify(world); }

/** Parse + validate a save. Throws with a readable message on corruption. */
export function deserialize(raw: string): World {
  let obj: unknown;
  try { obj = JSON.parse(raw); } catch { throw new Error('Save file is not valid JSON.'); }
  return validateWorld(obj);
}

export function validateWorld(obj: unknown): World {
  if (!obj || typeof obj !== 'object') throw new Error('Save is not an object.');
  const w = obj as Partial<World>;
  if (!w.meta || typeof w.meta.seed !== 'string') throw new Error('Save is missing world metadata.');
  if (typeof w.day !== 'number') throw new Error('Save is missing the simulation day.');
  if (!w.countries || !w.cities || !w.geography) throw new Error('Save is missing core world data.');
  if ((w.meta.version ?? 0) > SAVE_VERSION) throw new Error(`Save was made with a newer version (${w.meta.version}).`);
  // Fill defaults for optional collections so older saves keep working
  const out: World = {
    meta: { ...w.meta, version: SAVE_VERSION, startYear: w.meta.startYear ?? 2040, name: w.meta.name ?? 'Unnamed World', createdAt: w.meta.createdAt ?? Date.now() },
    day: w.day, countries: w.countries, cities: w.cities, people: w.people ?? {}, companies: w.companies ?? {}, organizations: w.organizations ?? {}, outlets: w.outlets ?? {},
    events: Array.isArray(w.events) ? w.events : [], news: Array.isArray(w.news) ? w.news : [], social: Array.isArray(w.social) ? w.social : [], pending: Array.isArray(w.pending) ? w.pending : [],
    indexes: w.indexes ?? {}, commodities: w.commodities ?? {}, interventions: w.interventions ?? [], summaries: w.summaries ?? [], trending: w.trending ?? [],
    geography: w.geography, stats: w.stats ?? { eventsGenerated: 0, ticks: 0, lastYearlyDay: 0, lastMonthlyDay: 0, lastWeeklyDay: 0 },
    rngState: Array.isArray(w.rngState) && w.rngState.length === 4 ? (w.rngState as World['rngState']) : [1, 2, 3, 4], counters: w.counters ?? {},
  };
  if (!Array.isArray(out.geography.cells) || out.geography.cells.length !== out.geography.width * out.geography.height) throw new Error('Geography data is corrupted.');
  for (const c of Object.values(out.countries)) { if (!out.countries[c.id]) throw new Error('Country index mismatch.'); c.relations ??= {}; c.alliances ??= []; c.atWarWith ??= []; c.neighbors ??= []; c.history ??= []; c.movements ??= []; c.tradePartners ??= []; }
  return out;
}

export function createStore(): SaveStore {
  try { if (typeof indexedDB !== 'undefined') return new IndexedDBStore(); } catch { /* fall through */ }
  return new MemoryStore();
}
