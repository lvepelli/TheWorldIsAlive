import { describe, it, expect } from 'vitest';
import { generateWorld } from '../src/engine/generator/world';
import { RNG } from '../src/engine/rng';
import { tickDay } from '../src/engine/simulation/tick';
import { LocalGodInterpreter, findDelay } from '../src/engine/godmode/interpreter';
import { scheduleIntervention } from '../src/engine/godmode/execute';
import { GOD_PRESETS } from '../src/engine/godmode/presets';
import { react } from '../src/engine/events/consequences';

describe('god mode', () => {
  it('parses delays', () => {
    expect(findDelay('in 3 months, x declares war on y')).toBe(90);
    expect(findDelay('after two weeks the economy collapses')).toBe(14);
    expect(findDelay('next year a pandemic begins')).toBe(365);
    expect(findDelay('a decade from now, machines take over')).toBe(3650);
    expect(findDelay('x declares war on y')).toBe(0);
  });
  it('carries out a scheduled intervention on the day', async () => {
    const w = generateWorld({ seed: 'omen' }); const rng = RNG.fromState(w.rngState);
    const cs = Object.values(w.countries); const a = cs[0]; const b = w.countries[a.neighbors[0]] ?? cs[1];
    const plan = await new LocalGodInterpreter().interpret(w, `In 2 months, ${a.name} declares war on ${b.name}`);
    expect(plan.action).toBe('start-war'); expect(plan.delayDays).toBe(60);
    const res = scheduleIntervention(w, rng, plan, 'In 2 months, war');
    expect(res.ok).toBe(true); expect(res.event?.type).toBe('prophecy');
    for (let i = 0; i < 59; i++) tickDay(w, rng);
    expect(a.atWarWith.includes(b.id)).toBe(false);
    for (let i = 0; i < 3; i++) tickDay(w, rng);
    const war = w.events.find((e) => e.type === 'war.declared' && e.causedBy === res.event!.id);
    expect(war).toBeTruthy(); expect(a.atWarWith.includes(b.id)).toBe(true);
    expect(w.interventions.some((i) => i.eventId === war!.id)).toBe(true);
  });
  it('holds a festival or a fair on command, in the named country', async () => {
    const w = generateWorld({ seed: 'fairs' }); const rng = new RNG('fairs'); const interp = new LocalGodInterpreter();
    const host = Object.values(w.countries)[3];
    const plan = await interp.interpret(w, `Hold a film festival in ${host.name}`);
    expect(plan.action).toBe('festival'); expect(plan.params.a).toBe(host.id);
    const fair = await interp.interpret(w, `${host.name} hosts a trade fair`);
    expect(fair.action).toBe('trade-fair');
    const preset = GOD_PRESETS.find((p) => p.id === 'festival')!; const ev = preset.run(w, rng, { a: host.id })!;
    expect(ev.type).toBe('festival.film'); expect(ev.location.countryId).toBe(host.id); expect(ev.playerIntervention).toBe(true);
    react(w, rng, ev);
    expect(!ev.data?.maker || w.pending.some((q) => q.sourceEventId === ev.id && q.ruleId.startsWith('festival.'))).toBe(true);
  });
  it('targets regions by name: autonomy and secession', async () => {
    const w = generateWorld({ seed: 'regions' }); const rng = new RNG('regions'); const interp = new LocalGodInterpreter();
    const c = Object.values(w.countries).filter((x) => (x.regionIds ?? []).length >= 3).sort((a, b) => b.area - a.area)[0];
    const r = (c.regionIds ?? []).map((id) => w.regions[id]).find((x) => !x.cityIds.includes(c.capitalId))!;
    const plan = await interp.interpret(w, `${r.name} declares independence`);
    expect(plan.action).toBe('create-country'); expect(plan.params.region).toBe(r.id); expect(plan.params.a).toBe(c.id);
    const auto = await interp.interpret(w, `Grant ${r.name} autonomy`);
    expect(auto.action).toBe('autonomy'); expect(auto.params.region).toBe(r.id);
    const ev = GOD_PRESETS.find((p) => p.id === 'autonomy')!.run(w, rng, { a: c.id, region: r.id })!;
    expect(ev.type).toBe('region.concession'); expect(r.autonomy).toBeGreaterThanOrEqual(30);
    const before = Object.keys(w.countries).length; const cities = r.cityIds.slice();
    const born = GOD_PRESETS.find((p) => p.id === 'create-country')!.run(w, rng, { a: c.id, region: r.name })!;
    expect(born.type).toBe('country.founded'); expect(Object.keys(w.countries).length).toBe(before + 1);
    expect(w.countries[r.countryId].cityIds.slice().sort()).toEqual(cities.sort());
  });
});
