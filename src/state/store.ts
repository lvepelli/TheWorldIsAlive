/**
 * Global UI/game state (zustand). The World object itself is a mutable engine
 * structure kept outside React's immutability model for performance; `version`
 * is bumped whenever it changes so subscribed components re-render.
 */
import { create } from 'zustand';
import type { World, EntityRef, WorldEvent } from '@/engine/types';
import { RNG } from '@/engine/rng';
import { generateWorld } from '@/engine/generator/world';
import { tickDay } from '@/engine/simulation/tick';
import { createStore, serialize, deserialize, type SaveMeta } from '@/engine/persistence/storage';
import { executePlan } from '@/engine/godmode/execute';
import type { GodPlan } from '@/engine/godmode/interpreter';
import { godInterpreter, narrativeEnhancer } from '@/engine/ai';
import { audio } from '@/ui/audio';

export type Screen = 'world' | 'live' | 'news' | 'social' | 'markets' | 'people' | 'orgs' | 'history' | 'god';
export type Speed = 0 | 1 | 5 | 20 | 100;
export type MapOverlay = 'political' | 'stability' | 'economy' | 'tension' | 'happiness' | 'tech';
export type LinkMode = 'auto' | 'all' | 'none';
export type Phase = 'intro' | 'generating' | 'playing';

export interface Toast { id: string; event: WorldEvent; at: number; }
export interface Settings { audio: boolean; debug: boolean; cinematics: boolean; }

interface GameState {
  phase: Phase;
  world: World | null;
  rng: RNG | null;
  version: number;
  speed: Speed;
  screen: Screen;
  selection: EntityRef | null;
  selectionStack: EntityRef[];
  cinematic: WorldEvent | null;
  cinematicQueue: WorldEvent[];
  lastCinematicAt: number;
  toasts: Toast[];
  overlay: MapOverlay;
  links: LinkMode;
  onboarded: boolean;
  focus: { x: number; y: number; zoom?: number; nonce: number } | null;
  settings: Settings;
  saves: SaveMeta[];
  busy: string | null;
  genSteps: string[];
  perf: { tps: number; fps: number };
  lastDayEvents: WorldEvent[];
  godPrefill: { presetId?: string; params?: Record<string, string>; text?: string } | null;
  /** When set, the next tap on a country on the map fills this God preset parameter instead of opening the inspector. */
  godPick: { presetId: string; key: string; params: Record<string, string> } | null;

  newWorld: (seed?: string, name?: string) => Promise<void>;
  bump: () => void;
  setSpeed: (s: Speed) => void;
  advance: (days: number) => void;
  setScreen: (s: Screen) => void;
  select: (ref: EntityRef | null, push?: boolean) => void;
  back: () => void;
  setOverlay: (o: MapOverlay) => void;
  setLinks: (l: LinkMode) => void;
  setOnboarded: () => void;
  focusOn: (x: number, y: number, zoom?: number) => void;
  dismissCinematic: () => void;
  dismissToast: (id: string) => void;
  setSetting: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
  refreshSaves: () => Promise<void>;
  saveWorld: (slot?: string) => Promise<void>;
  loadWorld: (slot: string) => Promise<boolean>;
  deleteSave: (slot: string) => Promise<void>;
  exportSave: () => void;
  importSave: (file: File) => Promise<boolean>;
  runGodPlan: (plan: GodPlan, raw: string) => ReturnType<typeof executePlan> | null;
  runGodText: (text: string) => Promise<ReturnType<typeof executePlan> | null>;
  setGodPrefill: (p: GameState['godPrefill']) => void;
  setGodPick: (p: GameState['godPick']) => void;
  toIntro: () => void;
}

const store = createStore();
const AUTOSAVE_SLOT = 'autosave';
const SETTINGS_KEY = 'twia:settings';

function loadSettings(): Settings {
  try { const raw = localStorage.getItem(SETTINGS_KEY); if (raw) return { audio: false, debug: false, cinematics: true, ...JSON.parse(raw) }; } catch { /* ignore */ }
  return { audio: false, debug: false, cinematics: true };
}

let toastSeq = 0;

export const useGame = create<GameState>((set, get) => ({
  phase: 'intro', world: null, rng: null, version: 0, speed: 0, screen: 'world', selection: null, selectionStack: [], cinematic: null, cinematicQueue: [], lastCinematicAt: 0,
  toasts: [], overlay: 'political', links: 'auto', onboarded: (() => { try { return localStorage.getItem('twia:onboarded') === '1'; } catch { return false; } })(), focus: null, settings: loadSettings(), saves: [], busy: null, genSteps: [], perf: { tps: 0, fps: 0 }, lastDayEvents: [], godPrefill: null, godPick: null,

  async newWorld(seed, name) {
    const s = seed?.trim() || randomSeed();
    set({ phase: 'generating', genSteps: [], busy: 'Generating world', speed: 0, selection: null, selectionStack: [], cinematic: null, cinematicQueue: [], toasts: [] });
    const steps = ['Shaping continents', 'Drawing borders', 'Founding cities', 'Raising leaders and citizens', 'Incorporating companies', 'Printing newspapers', 'Opening markets', 'Setting history in motion'];
    for (let i = 0; i < 4; i++) { set({ genSteps: steps.slice(0, i + 1) }); await sleep(120); }
    let world: World;
    try { world = generateWorld({ seed: s, name }); } catch (e) { console.error(e); set({ phase: 'intro', busy: null }); throw e; }
    for (let i = 4; i < steps.length; i++) { set({ genSteps: steps.slice(0, i + 1) }); await sleep(90); }
    const rng = RNG.fromState(world.rngState);
    // Warm start: run the first days so the world already has a pulse.
    for (let i = 0; i < 3; i++) tickDay(world, rng);
    world.summaries.push({ period: 'day', day: world.day, title: 'The world awakens', lines: [`${Object.keys(world.countries).length} nations, ${(Object.values(world.countries).reduce((a, c) => a + c.population, 0) / 1e9).toFixed(1)} billion people.`, 'Everything from here on is history you witnessed.'] });
    set({ world, rng, phase: 'playing', busy: null, version: get().version + 1, speed: 1, screen: 'world', focus: null, lastDayEvents: world.events.slice(-6) });
    audio.play('reveal');
    void get().saveWorld(AUTOSAVE_SLOT);
  },

  bump() { set((s) => ({ version: s.version + 1 })); },
  setSpeed(speed) { set({ speed }); audio.play('click'); },

  advance(days) {
    const { world, rng } = get();
    if (!world || !rng) return;
    const produced: WorldEvent[] = [];
    for (let i = 0; i < days; i++) produced.push(...tickDay(world, rng).events);
    afterTicks(get, set, produced);
  },

  setScreen(screen) { set({ screen }); audio.play('nav'); },
  select(ref, push = true) {
    const { selection, selectionStack } = get();
    if (ref && selection && selection.kind === ref.kind && selection.id === ref.id) return;
    set({ selection: ref, selectionStack: ref && push && selection ? [...selectionStack.slice(-12), selection] : ref ? selectionStack : [] });
    if (ref) audio.play('click');
  },
  back() { const st = get().selectionStack; if (!st.length) { set({ selection: null }); return; } set({ selection: st[st.length - 1], selectionStack: st.slice(0, -1) }); },
  setOverlay(overlay) { set({ overlay }); },
  setLinks(links) { set({ links }); },
  setOnboarded() { set({ onboarded: true }); try { localStorage.setItem('twia:onboarded', '1'); } catch { /* ignore */ } },
  focusOn(x, y, zoom) { set((s) => ({ focus: { x, y, zoom, nonce: (s.focus?.nonce ?? 0) + 1 } })); },
  dismissCinematic() {
    const q = get().cinematicQueue;
    if (q.length) set({ cinematic: q[0], cinematicQueue: q.slice(1), lastCinematicAt: performance.now() });
    else set({ cinematic: null });
  },
  dismissToast(id) { set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })); },
  setSetting(k, v) { const settings = { ...get().settings, [k]: v }; set({ settings }); try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ } if (k === 'audio') audio.setEnabled(v as boolean); },

  async refreshSaves() { set({ saves: await store.list() }); },
  async saveWorld(slot) {
    const w = get().world; if (!w) return;
    const name = slot ?? `save-${Date.now().toString(36)}`;
    try { await store.save(name, w); await get().refreshSaves(); if (!slot) audio.play('click'); } catch (e) { console.error('save failed', e); }
  },
  async loadWorld(slot) {
    set({ busy: 'Loading world' });
    try {
      const w = await store.load(slot);
      if (!w) { set({ busy: null }); return false; }
      set({ world: w, rng: RNG.fromState(w.rngState), phase: 'playing', busy: null, speed: 0, selection: null, selectionStack: [], version: get().version + 1, screen: 'world', lastDayEvents: w.events.slice(-6), toasts: [], cinematic: null, cinematicQueue: [] });
      return true;
    } catch (e) { console.error(e); set({ busy: null }); return false; }
  },
  async deleteSave(slot) { await store.remove(slot); await get().refreshSaves(); },
  exportSave() {
    const w = get().world; if (!w) return;
    const blob = new Blob([serialize(w)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${w.meta.name.replace(/\s+/g, '-').toLowerCase()}-${w.meta.seed}-day${w.day}.twia.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  },
  async importSave(file) {
    try {
      const raw = await file.text();
      const w = deserialize(raw);
      set({ world: w, rng: RNG.fromState(w.rngState), phase: 'playing', speed: 0, selection: null, selectionStack: [], version: get().version + 1, screen: 'world', lastDayEvents: w.events.slice(-6) });
      await get().saveWorld(AUTOSAVE_SLOT);
      return true;
    } catch (e) { console.error(e); alert(`Could not import save: ${(e as Error).message}`); return false; }
  },
  runGodPlan(plan, raw) {
    const { world, rng } = get(); if (!world || !rng) return null;
    const res = executePlan(world, rng, plan, raw);
    if (res.ok && res.event) {
      audio.play('god');
      const ev = res.event;
      set((s) => ({ version: s.version + 1, lastDayEvents: [...s.lastDayEvents.slice(-5), ev] }));
      if (ev.severity >= 4 && get().settings.cinematics) pushCinematic(get, set, ev, true);
      else pushToast(get, set, ev);
      enhanceRecent(get, set);
      void get().saveWorld(AUTOSAVE_SLOT);
    }
    return res;
  },
  async runGodText(text) {
    const { world } = get(); if (!world) return null;
    const plan = await godInterpreter.interpret(world, text);
    return get().runGodPlan(plan, text);
  },
  setGodPrefill(p) { set({ godPrefill: p }); },
  setGodPick(p) { set({ godPick: p }); },
  toIntro() { set({ phase: 'intro', speed: 0, selection: null, cinematic: null }); void get().refreshSaves(); },
}));

function afterTicks(get: () => GameState, set: (p: Partial<GameState>) => void, produced: WorldEvent[]): void {
  const { settings, world } = get();
  if (!world) return;
  // When jumping many days at once only surface the most important developments.
  const important = produced.filter((e) => e.severity >= 3).sort((a, b) => b.severity - a.severity).slice(0, produced.length > 20 ? 2 : 3);
  for (const ev of important) {
    if (ev.severity >= 5 && settings.cinematics) pushCinematic(get, set, ev, false);
    else pushToast(get, set, ev);
  }
  set({ version: get().version + 1, lastDayEvents: produced.length ? produced.slice(-8) : get().lastDayEvents });
  enhanceRecent(get, set);
}

/** Optional async LLM enhancement of today's top articles (no-op without an endpoint). */
export function enhanceRecent(get: () => GameState, set: (p: Partial<GameState>) => void): void {
  const w = get().world;
  if (!narrativeEnhancer || !w) return;
  const todays = w.news.filter((n) => n.day === w.day);
  void narrativeEnhancer.enhanceDay(w, todays).then((n) => { if (n) set({ version: get().version + 1 }); });
}

function pushCinematic(get: () => GameState, set: (p: Partial<GameState>) => void, ev: WorldEvent, force: boolean): void {
  const { cinematic, cinematicQueue, lastCinematicAt } = get();
  const now = performance.now();
  if (!cinematic && (force || now - lastCinematicAt > 12000)) { set({ cinematic: ev, lastCinematicAt: now, focus: { x: ev.location.x, y: ev.location.y, zoom: 2.4, nonce: now } }); audio.play('cinematic'); }
  else if (cinematicQueue.length < 2) set({ cinematicQueue: [...cinematicQueue, ev] });
  else pushToast(get, set, ev);
}

function pushToast(get: () => GameState, set: (p: Partial<GameState>) => void, ev: WorldEvent): void {
  const t: Toast = { id: `t${++toastSeq}`, event: ev, at: performance.now() };
  const max = typeof window !== 'undefined' && window.innerWidth < 900 ? 1 : 3;
  set({ toasts: [...get().toasts.slice(-max), t] });
  if (ev.severity >= 4) audio.play('alert');
  setTimeout(() => { set({ toasts: get().toasts.filter((x) => x.id !== t.id) }); }, ev.severity >= 4 ? 9000 : 6000);
}

export function randomSeed(): string {
  const a = ['amber', 'iron', 'silent', 'cobalt', 'hollow', 'radiant', 'glass', 'ember', 'velvet', 'stone', 'north', 'crimson', 'pale', 'lunar', 'quiet'];
  const b = ['tide', 'crown', 'signal', 'harbor', 'orbit', 'meridian', 'lantern', 'garden', 'circuit', 'summit', 'river', 'engine', 'archive', 'horizon', 'compass'];
  const r = Math.random;
  return `${a[Math.floor(r() * a.length)]}-${b[Math.floor(r() * b.length)]}-${Math.floor(r() * 9000 + 1000)}`;
}

function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

/** Convenience selectors */
export const useWorld = () => useGame((s) => s.world);
export const useVersion = () => useGame((s) => s.version);
