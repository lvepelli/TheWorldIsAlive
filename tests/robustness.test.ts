import { describe, it, expect } from 'vitest';
import { generateWorld } from '../src/engine/generator/world';
import { tickDay } from '../src/engine/simulation/tick';
import { RNG } from '../src/engine/rng';
import { localGodInterpreter } from '../src/engine/godmode/interpreter';
import { executePlan } from '../src/engine/godmode/execute';
import { GOD_PRESETS } from '../src/engine/godmode/presets';
import { serialize, deserialize } from '../src/engine/persistence/storage';
import type { World } from '../src/engine/types';

function checkInvariants(w: World): void {
  const geo = w.geography;
  expect(geo.countryOrder.length).toBeGreaterThan(0);
  for (const c of Object.values(w.countries)) {
    expect(w.cities[c.capitalId], `capital of ${c.name}`).toBeTruthy();
    expect(w.people[c.leaderId]?.alive, `leader of ${c.name} alive`).toBe(true);
    for (const id of c.cityIds) expect(w.cities[id]?.countryId).toBe(c.id);
    for (const n of c.neighbors) expect(w.countries[n]).toBeTruthy();
    for (const a of c.atWarWith) expect(w.countries[a]?.atWarWith.includes(c.id)).toBe(true);
    for (const a of c.alliances) expect(w.countries[a]?.alliances.includes(c.id)).toBe(true);
    expect(Number.isFinite(c.population) && c.population > 0).toBe(true);
    expect(Number.isFinite(c.gdp) && c.gdp > 0).toBe(true);
  }
  for (const city of Object.values(w.cities)) expect(w.countries[city.countryId], `city ${city.name} country`).toBeTruthy();
  for (const p of Object.values(w.people)) { expect(w.countries[p.countryId]).toBeTruthy(); expect(Number.isFinite(p.wealth)).toBe(true); }
  for (const co of Object.values(w.companies)) { expect(w.countries[co.countryId]).toBeTruthy(); expect(Number.isFinite(co.value)).toBe(true); }
  for (const ev of w.events) { expect(Number.isFinite(ev.location.x)).toBe(true); expect(ev.title.length).toBeGreaterThan(3); }
  for (let i = 0; i < geo.cells.length; i++) { const r = geo.cells[i]; if (r >= 0) expect(w.countries[geo.countryOrder[r]]).toBeTruthy(); }
}

const FUZZ_COMMANDS = [
  'war', 'peace now', 'everything explodes', 'A meteor hits', 'make {c} rich', '{c} declares war on {d}', '{c} and {d} sign an alliance', 'the leader of {c} is assassinated', 'a scandal engulfs {p}',
  '{co} goes bankrupt', '{co} invents a fusion reactor', 'a huge earthquake strikes {c}', 'pandemic', 'revolution in {c}', '{c} becomes a monarchy', 'a new country called Freeland breaks away from {c}',
  'a small biotech startup discovers a cure for aging', 'oil is discovered in {c}', 'refugees flee {c} to {d}', 'a new religion called The Path spreads in {c}', 'accelerate technology', 'the people of {c} turn against the government',
  '', '   ', '???', 'lorem ipsum dolor sit amet', '🔥🔥🔥', 'A young scientist named Ada Quill becomes famous in {c}', 'destabilize the region around {c}', 'economic boom', 'market crash in {c}', 'blackouts across the world',
];

describe('robustness', () => {
  it('survives years of random interventions and random freeform commands', { timeout: 120000 }, () => {
    const w = generateWorld({ seed: 'fuzz' });
    const rng = RNG.fromState(w.rngState);
    const fuzz = new RNG('fuzz-driver');
    let ok = 0, noop = 0;
    for (let day = 0; day < 365 * 6; day++) {
      tickDay(w, rng);
      if (day % 9 === 0) {
        const countries = Object.values(w.countries); const people = Object.values(w.people).filter((p) => p.alive); const cos = Object.values(w.companies).filter((c) => c.alive);
        const c = fuzz.pick(countries), d = fuzz.pick(countries), p = fuzz.pick(people), co = fuzz.pick(cos);
        if (fuzz.bool(0.5)) {
          const text = fuzz.pick(FUZZ_COMMANDS).replace('{c}', c.name).replace('{d}', d.name).replace('{p}', p.name).replace('{co}', co.name);
          const plan = localGodInterpreter.interpret(w, text);
          const res = executePlan(w, rng, plan, text);
          if (res.ok) ok++; else noop++;
        } else {
          const preset = fuzz.pick(GOD_PRESETS);
          const params: Record<string, string> = {};
          for (const prm of preset.params) {
            if (prm.type === 'country') params[prm.key] = fuzz.bool(0.8) ? c.id : '';
            if (prm.type === 'country2') params[prm.key] = fuzz.bool(0.8) ? d.id : '';
            if (prm.type === 'company') params[prm.key] = fuzz.bool(0.8) ? co.id : 'nonexistent';
            if (prm.type === 'person') params[prm.key] = fuzz.bool(0.8) ? p.id : 'nonexistent';
            if (prm.options) params[prm.key] = fuzz.pick(prm.options).value;
            if (prm.type === 'text') params[prm.key] = fuzz.bool(0.5) ? 'Custom Name' : '';
          }
          const res = executePlan(w, rng, { action: preset.id, params, interpretation: preset.label, confidence: 1, targets: [] }, preset.label);
          if (res.ok) ok++; else noop++;
        }
      }
      if (day % 365 === 0) checkInvariants(w);
    }
    checkInvariants(w);
    expect(ok).toBeGreaterThan(100);
    console.log(`fuzz: ${ok} interventions ok, ${noop} no-ops, ${Object.keys(w.countries).length} countries, ${w.events.length} events, ${w.interventions.length} interventions`);
    // Save round-trip after chaos
    const w2 = deserialize(serialize(w));
    checkInvariants(w2);
    const r2 = RNG.fromState(w2.rngState);
    for (let i = 0; i < 30; i++) tickDay(w2, r2);
    checkInvariants(w2);
  });

  it('never throws on arbitrary interpreter input', () => {
    const w = generateWorld({ seed: 'interp' });
    const junk = ['', 'a'.repeat(5000), '{}[]()<>', 'null', 'undefined', 'select * from countries', '\n\n\t', 'Ω≈ç√∫˜µ≤≥÷', 'war war war war war peace', 'company company company'];
    for (const j of junk) { const plan = localGodInterpreter.interpret(w, j); expect(typeof plan.action).toBe('string'); }
  });
});
