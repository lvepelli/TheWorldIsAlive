import { describe, it, expect } from 'vitest';
import { generateWorld } from '../src/engine/generator/world';
import { tickDay } from '../src/engine/simulation/tick';
import { RNG } from '../src/engine/rng';
import { serialize, deserialize } from '../src/engine/persistence/storage';
import { localGodInterpreter } from '../src/engine/godmode/interpreter';
import { executePlan } from '../src/engine/godmode/execute';
import { GOD_PRESETS } from '../src/engine/godmode/presets';
import { summarize } from '../src/engine/simulation/summary';
import { localDialogue } from '../src/engine/ai/dialogue';

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
  it('relationships drive consequences (rivals pounce on scandals)', () => {
    const w = generateWorld({ seed: 'rivalry' });
    const rng = RNG.fromState(w.rngState);
    for (let i = 0; i < 365 * 3; i++) tickDay(w, rng);
    const attacks = w.events.filter((e) => e.type === 'rival.attack');
    expect(attacks.length).toBeGreaterThan(0);
    for (const a of attacks) {
      const src = w.events.find((e) => e.id === a.causedBy);
      expect(src?.type).toBe('scandal');
      const [rival, victim] = a.actors.map((x) => w.people[x.id]);
      expect(rival && victim && rival.id !== victim.id).toBe(true);
      expect(src?.actors.some((x) => x.id === victim.id)).toBe(true);
    }
  }, 30000);
  it('every premise opens with its own arc', () => {
    const seen = new Map<string, { seed: string; fired: boolean }>();
    for (let i = 0; i < 60 && seen.size < 8; i++) {
      const seed = `premise-${i}`;
      const w = generateWorld({ seed });
      const id = w.meta.premise!.id;
      if (seen.has(id)) continue;
      const opening = w.events.find((e) => e.type === 'premise.opening')!;
      expect(opening).toBeTruthy();
      const rng = RNG.fromState(w.rngState);
      for (let d = 0; d < 210; d++) tickDay(w, rng);
      const fired = w.events.some((e) => e.causedBy === opening.id);
      seen.set(id, { seed, fired });
    }
    expect(seen.size).toBe(8);
    for (const [id, v] of seen) expect(v.fired, `${id} (${v.seed})`).toBe(true);
  }, 60000);
  it('a JSON round-trip mid-story keeps ticking (pending consequences, omens, premise)', async () => {
    const w = generateWorld({ seed: 'roundtrip' });
    const rng = RNG.fromState(w.rngState);
    for (let i = 0; i < 400; i++) tickDay(w, rng);
    const { scheduleIntervention } = await import('../src/engine/godmode/execute');
    const { LocalGodInterpreter } = await import('../src/engine/godmode/interpreter');
    const plan = await new LocalGodInterpreter().interpret(w, 'In 2 weeks, a global pandemic begins');
    scheduleIntervention(w, rng, plan, 'In 2 weeks, a global pandemic begins');
    w.rngState = rng.state();
    const { validateWorld } = await import('../src/engine/persistence/storage');
    const copy = validateWorld(JSON.parse(JSON.stringify(w)));
    expect(copy.meta.premise?.id).toBe(w.meta.premise?.id);
    expect(copy.pending.some((p) => p.ruleId === 'god.scheduled')).toBe(true);
    const rng2 = RNG.fromState(copy.rngState);
    for (let i = 0; i < 30; i++) tickDay(copy, rng2);
    expect(copy.events.some((e) => e.type === 'health.pandemic' && e.day > 400)).toBe(true);
    expect(copy.day).toBe(430);
  }, 30000);
  it('featured seeds map to their premises', async () => {
    const { FEATURED_SEEDS, premiseFor, PREMISES } = await import('../src/engine/generator/premise');
    expect(FEATURED_SEEDS.length).toBe(PREMISES.length);
    for (const f of FEATURED_SEEDS) expect(premiseFor(f.seed).id, f.seed).toBe(f.premise);
    expect(new Set(FEATURED_SEEDS.map((f) => f.premise)).size).toBe(PREMISES.length);
  });
  it('an interviewed character talks about it on the feed', async () => {
    const { rememberConversation } = await import('../src/engine/ai/dialogue');
    const w = generateWorld({ seed: 'interview' });
    const rng = RNG.fromState(w.rngState);
    const p = Object.values(w.people).filter((x) => x.alive && x.fame > 40).sort((a, b) => b.socialActivity - a.socialActivity)[0];
    rememberConversation(w, p, 'What do you want?', 'To win. Obviously.');
    let posted = false;
    for (let i = 0; i < 3 && !posted; i++) { tickDay(w, rng); posted = w.social.some((s) => s.authorId === p.id && s.hashtags.includes('Interview')); }
    expect(posted || p.memories.every((m) => !m.text.startsWith('Was asked'))).toBe(true);
    expect(w.social.some((s) => s.hashtags.includes('Interview') && /What do you want\?/.test(s.text)) || p.socialActivity < 0.3).toBe(true);
  });
  it('interviews can persuade open characters, rarely cautious ones', async () => {
    const { rememberConversation, localDialogue } = await import('../src/engine/ai/dialogue');
    const w = generateWorld({ seed: 'persuade' });
    const people = Object.values(w.people).filter((x) => x.alive);
    const open = people.slice().sort((a, b) => (b.personality.openness - b.personality.caution) - (a.personality.openness - a.personality.caution))[0];
    const shut = people.slice().sort((a, b) => (a.personality.openness - a.personality.caution) - (b.personality.openness - b.personality.caution))[0];
    let openHits = 0, shutHits = 0;
    for (let i = 0; i < 40; i++) {
      w.day = i;
      if (rememberConversation(w, open, `You should found a hospital in city ${i}`, 'Maybe.').persuaded) openHits++;
      if (rememberConversation(w, shut, `You should found a hospital in city ${i}`, 'No.').persuaded) shutHits++;
    }
    expect(openHits).toBeGreaterThan(shutHits);
    expect(openHits).toBeGreaterThan(3);
    expect(open.history.some((h) => h.text.startsWith('Persuaded by an interviewer'))).toBe(true);
    const a = localDialogue.answer(w, open, 'You should make peace with your rivals');
    expect(a.length).toBeGreaterThan(10);
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

describe('long-run balance', () => {
  it('stays within bounds over 20 years', { timeout: 60000 }, () => {
    const w = generateWorld({ seed: 'balance' });
    const rng = RNG.fromState(w.rngState);
    const pop0 = Object.values(w.countries).reduce((a, c) => a + c.population, 0);
    for (let i = 0; i < 365 * 20; i++) tickDay(w, rng);
    const cs = Object.values(w.countries);
    const pop1 = cs.reduce((a, c) => a + c.population, 0);
    const cos = Object.values(w.companies).filter((c) => c.alive).sort((a, b) => b.value - a.value);
    console.log(`20y: pop ${(pop0 / 1e9).toFixed(2)}B→${(pop1 / 1e9).toFixed(2)}B · gdp ${cs.reduce((a, c) => a + c.gdp, 0).toFixed(0)}B · index ${w.indexes.global.value.toFixed(0)} · top co ${cos[0]?.name} $${cos[0]?.value.toFixed(0)}B · companies ${cos.length} · events ${w.events.length} · wars ${cs.reduce((a, c) => a + c.atWarWith.length, 0) / 2} · inflation max ${Math.max(...cs.map((c) => c.inflation)).toFixed(0)} · living ${Object.values(w.people).filter((p) => p.alive).length}`);
    expect(pop1 / pop0).toBeGreaterThan(0.5);
    expect(pop1 / pop0).toBeLessThan(3);
    for (const c of cs) {
      expect(Number.isFinite(c.gdp) && c.gdp > 0).toBe(true);
      expect(c.inflation).toBeLessThan(200);
      expect(c.debt).toBeLessThanOrEqual(400);
      expect(w.people[c.leaderId]?.alive).toBe(true);
    }
    const wars = cs.reduce((a, c) => a + c.atWarWith.length, 0) / 2;
    expect(wars).toBeLessThan(cs.length / 2);
    const living = Object.values(w.people).filter((p) => p.alive).length;
    expect(living).toBeGreaterThan(80);
    const g = w.indexes.global.value;
    expect(g).toBeGreaterThan(50);
    expect(g).toBeLessThan(200000);
    expect(w.events.length).toBeLessThanOrEqual(3000);
    expect(w.pending.length).toBeLessThan(2000);
    const dialogue = localDialogue.answer(w, Object.values(w.people).find((p) => p.alive)!, 'What do you want?');
    expect(dialogue.length).toBeGreaterThan(10);
  });
});
