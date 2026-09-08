/**
 * Simulation loop: advances world days according to the selected speed.
 * Simulation frequency is independent of render frequency; React re-renders
 * are throttled to ~8 Hz during fast forward.
 */
import { useGame, type Speed } from './store';
import { tickDay } from '@/engine/simulation/tick';
import type { WorldEvent } from '@/engine/types';
import { audio } from '@/ui/audio';

const DAY_MS: Record<Speed, number> = { 0: Infinity, 1: 1400, 5: 280, 20: 70, 100: 0 };
let raf = 0;
let acc = 0;
let last = 0;
let lastRender = 0;
let lastAutosave = 0;
let tpsWindow: number[] = [];
let pending: WorldEvent[] = [];

function frame(now: number): void {
  raf = requestAnimationFrame(frame);
  const st = useGame.getState();
  const dt = Math.min(250, now - (last || now));
  last = now;
  if (st.phase !== 'playing' || !st.world || !st.rng || st.speed === 0 || st.cinematic) { acc = 0; return; }
  const world = st.world, rng = st.rng;
  let ran = 0;
  if (st.speed === 100) {
    const budget = now + 14; // ms of simulation per frame
    while (performance.now() < budget && ran < 30) { pending.push(...tickDay(world, rng).events); ran++; }
  } else {
    acc += dt;
    const per = DAY_MS[st.speed];
    while (acc >= per && ran < 10) { acc -= per; pending.push(...tickDay(world, rng).events); ran++; }
  }
  if (ran) tpsWindow.push(now, ran);
  // Render throttle
  const renderEvery = st.speed === 100 ? 125 : st.speed === 20 ? 90 : 0;
  if (ran && now - lastRender >= renderEvery) {
    lastRender = now;
    const important = pending.filter((e) => e.severity >= 3);
    const set = useGame.setState;
    for (const ev of important) {
      const s = useGame.getState();
      if (ev.severity >= 5 && s.settings.cinematics) {
        if (!s.cinematic && now - s.lastCinematicAt > 12000) { set({ cinematic: ev, lastCinematicAt: now, focus: { x: ev.location.x, y: ev.location.y, zoom: 2.4, nonce: now } }); audio.play('cinematic'); }
        else if (s.cinematicQueue.length < 2) set({ cinematicQueue: [...s.cinematicQueue, ev] });
      } else if (s.speed !== 100 && s.toasts.length < (window.innerWidth < 900 ? 2 : 4)) {
        const t = { id: `t${now}_${Math.random().toString(36).slice(2, 6)}`, event: ev, at: now };
        set({ toasts: [...s.toasts, t] });
        setTimeout(() => useGame.setState({ toasts: useGame.getState().toasts.filter((x) => x.id !== t.id) }), ev.severity >= 4 ? 9000 : 6000);
        if (ev.severity >= 4) audio.play('alert');
      }
    }
    // tps calc over last second
    tpsWindow = tpsWindow.filter((_, i) => i % 2 === 1 || tpsWindow[i] > now - 1000).slice(-40);
    let tps = 0; for (let i = 0; i < tpsWindow.length; i += 2) if (tpsWindow[i] > now - 1000) tps += tpsWindow[i + 1];
    set({ version: useGame.getState().version + 1, lastDayEvents: pending.length ? pending.slice(-8) : useGame.getState().lastDayEvents, perf: { tps, fps: 60 } });
    pending = [];
  }
  if (now - lastAutosave > 45000 && ran) { lastAutosave = now; void useGame.getState().saveWorld('autosave'); }
}

export function startLoop(): () => void {
  if (!raf) raf = requestAnimationFrame(frame);
  return () => { cancelAnimationFrame(raf); raf = 0; };
}
