import { describe, it, expect } from 'vitest';
import { generateWorld } from '../src/engine/generator/world';
import { RNG } from '../src/engine/rng';
import { tickDay } from '../src/engine/simulation/tick';
import { LocalGodInterpreter, findDelay } from '../src/engine/godmode/interpreter';
import { scheduleIntervention } from '../src/engine/godmode/execute';

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
});
