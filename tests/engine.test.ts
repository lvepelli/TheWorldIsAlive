import { describe, it, expect } from 'vitest';
import { generateWorld } from '../src/engine/generator/world';
import { tickDay } from '../src/engine/simulation/tick';
import { RNG } from '../src/engine/rng';
import { serialize, deserialize } from '../src/engine/persistence/storage';
import { localGodInterpreter } from '../src/engine/godmode/interpreter';
import { executePlan } from '../src/engine/godmode/execute';
import { GOD_PRESETS } from '../src/engine/godmode/presets';
import { summarize } from '../src/engine/simulation/summary';

describe('world generation', () => {
  it('is deterministic for a seed', () => {
    const a = generateWorld({ seed: 'alpha' });
    const b = generateWorld({ seed: 'alpha' });
    expect(Object.keys(a.countries)).toEqual(Object.keys(b.countries));
    expect(Object.values(a.countries).map((c) => c.name)).toEqual(Object.values(b.countries).map((c) => c.name));
    expect(Object.values(a.people).map((p) => p.name)).toEqual(Object.values(b.people).map((p) => p.name));
  });
  it('produces a rich world', () => {
    const w = generateWorld({ seed: 'beta' });
    expect(Object.keys(w.countries).length).toBeGreaterThan(15);
    expect(Object.keys(w.cities).length).toBeGreaterThan(40);
    expect(Object.keys(w.people).length).toBeGreaterThan(100);
    expect(Object.keys(w.companies).length).toBeGreaterThan(40);
    expect(Object.keys(w.outlets).length).toBeGreaterThan(10);
    for (const c of Object.values(w.countries)) {
      expect(w.cities[c.capitalId]).toBeTruthy();
      expect(w.people[c.leaderId]).toBeTruthy();
      expect(c.cityIds.length).toBeGreaterThan(0);
    }
  });
  it('differs across seeds', () => {
    const a = generateWorld({ seed: 'one' }), b = generateWorld({ seed: 'two' });
    expect(Object.values(a.countries).map((c) => c.name)).not.toEqual(Object.values(b.countries).map((c) => c.name));
  });
});

describe('simulation', () => {
  it('advances a year with events, news, social and markets', () => {
    const w = generateWorld({ seed: 'gamma' });
    const rng = RNG.fromState(w.rngState);
    const t0 = Date.now();
    for (let i = 0; i < 365; i++) tickDay(w, rng);
    const ms = Date.now() - t0;
    expect(w.day).toBe(365);
    expect(w.events.length).toBeGreaterThan(150);
    expect(w.news.length).toBeGreaterThan(50);
    expect(w.social.length).toBeGreaterThan(50);
    expect(w.events.some((e) => e.causedBy.startsWith('ev_'))).toBe(true); // consequences exist
    expect(w.indexes.global.history.length).toBeGreaterThan(100);
    expect(w.summaries.length).toBeGreaterThan(5);
    for (const c of Object.values(w.countries)) { expect(Number.isFinite(c.gdp)).toBe(true); expect(c.stability).toBeGreaterThanOrEqual(0); expect(c.stability).toBeLessThanOrEqual(100); }
    console.log(`365 days in ${ms}ms — ${w.events.length} events, ${w.news.length} news, ${w.social.length} posts`);
    expect(ms).toBeLessThan(20000);
  });
  it('first 5 days are interesting', () => {
    const w = generateWorld({ seed: 'delta' });
    const rng = RNG.fromState(w.rngState);
    for (let i = 0; i < 5; i++) tickDay(w, rng);
    expect(w.events.length).toBeGreaterThan(3);
  });
  it('is deterministic across identical runs', () => {
    const run = () => { const w = generateWorld({ seed: 'det' }); const rng = RNG.fromState(w.rngState); for (let i = 0; i < 60; i++) tickDay(w, rng); return w.events.map((e) => e.title); };
    expect(run()).toEqual(run());
  });
});

describe('persistence', () => {
  it('round-trips through JSON and keeps simulating', () => {
    const w = generateWorld({ seed: 'save' });
    const rng = RNG.fromState(w.rngState);
    for (let i = 0; i < 30; i++) tickDay(w, rng);
    const raw = serialize(w);
    const w2 = deserialize(raw);
    expect(w2.day).toBe(30);
    expect(Object.keys(w2.countries).length).toBe(Object.keys(w.countries).length);
    const r2 = RNG.fromState(w2.rngState);
    tickDay(w2, r2);
    expect(w2.day).toBe(31);
  });
  it('rejects corrupted saves', () => {
    expect(() => deserialize('{"nope":1}')).toThrow();
    expect(() => deserialize('not json')).toThrow();
  });
});

describe('god mode', () => {
  it('runs every preset without crashing', () => {
    const w = generateWorld({ seed: 'god' });
    const rng = RNG.fromState(w.rngState);
    for (const p of GOD_PRESETS) {
      const params: Record<string, string> = {};
      for (const prm of p.params) {
        if (prm.type === 'country') params[prm.key] = Object.keys(w.countries)[0];
        if (prm.type === 'country2') params[prm.key] = Object.keys(w.countries)[1];
        if (prm.type === 'company') params[prm.key] = Object.values(w.companies).find((c) => c.alive)!.id;
        if (prm.type === 'person') params[prm.key] = Object.values(w.people).find((c) => c.alive)!.id;
        if (prm.options) params[prm.key] = prm.options[0].value;
      }
      const res = executePlan(w, rng, { action: p.id, params, interpretation: p.label, confidence: 1, targets: [] }, p.label);
      expect(res.ok || res.message.length > 0).toBe(true);
    }
    expect(w.interventions.length).toBeGreaterThan(20);
    expect(w.events.filter((e) => e.playerIntervention).length).toBeGreaterThan(20);
  });
  it('interprets freeform commands', () => {
    const w = generateWorld({ seed: 'free' });
    const rng = RNG.fromState(w.rngState);
    const country = Object.values(w.countries)[3];
    const plan = localGodInterpreter.interpret(w, `A small ${country.adjective} battery company discovers a battery that stores twenty times more energy than current technology.`);
    expect(plan.action).toBe('company-breakthrough');
    expect(plan.params.a).toBe(country.id);
    expect(plan.params.sector).toBe('energy');
    const res = executePlan(w, rng, plan, 'test');
    expect(res.ok).toBe(true);
    expect(res.event?.type).toBe('tech.breakthrough');
    const war = localGodInterpreter.interpret(w, `${Object.values(w.countries)[0].name} declares war on ${Object.values(w.countries)[1].name}`);
    expect(war.action).toBe('start-war');
    expect(war.params.a).toBe(Object.values(w.countries)[0].id);
    expect(war.params.b).toBe(Object.values(w.countries)[1].id);
    const meteor = localGodInterpreter.interpret(w, 'A meteor strikes the capital');
    expect(meteor.action).toBe('meteor');
    // consequences follow within days
    for (let i = 0; i < 10; i++) tickDay(w, rng);
    const root = res.event!;
    expect(w.events.filter((e) => e.causedBy === root.id).length).toBeGreaterThan(0);
  });
});

describe('summaries', () => {
  it('produces readable summaries', () => {
    const w = generateWorld({ seed: 'sum' });
    const rng = RNG.fromState(w.rngState);
    for (let i = 0; i < 40; i++) tickDay(w, rng);
    const s = summarize(w, 'month');
    expect(s.lines.length).toBeGreaterThan(2);
  });
});
