import { describe, it, expect } from 'vitest';
import { generateWorld } from '../src/engine/generator/world';
import { tickDay } from '../src/engine/simulation/tick';
import { declareWar, transferRegion } from '../src/engine/events/actions';
import { RNG } from '../src/engine/rng';
import { serialize, deserialize, validateWorld } from '../src/engine/persistence/storage';
import { CONSEQUENCE_RULES, react } from '../src/engine/events/consequences';
import { regionalistActsOnObjective } from '../src/engine/simulation/objectives';
import { regionsTick } from '../src/engine/simulation/regions';
import { yearOf } from '../src/engine/time';
import { createEvent } from '../src/engine/events/engine';
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
  it('a leader persuaded to make peace ends the war', () => {
    const w = generateWorld({ seed: 'peacemaker' });
    const rng = RNG.fromState(w.rngState);
    const cs = Object.values(w.countries);
    let a = cs.find((c) => c.atWarWith.length);
    if (!a) { a = cs.find((c) => c.neighbors.length)!; declareWar(w, rng, a, w.countries[a.neighbors[0]], 'simulation', false); }
    a.electionEvery = 0; // isolate the mechanic from a scheduled election
    const leader = w.people[a.leaderId]; leader.objective = 'make peace with our neighbours'; leader.personality.openness = 0.9; leader.history.push({ day: w.day, text: 'Persuaded by an interviewer to make peace with our neighbours.' });
    let ended = false;
    for (let i = 0; i < 365 && !ended; i++) { tickDay(w, rng); ended = !a!.atWarWith.length || w.events.some((e) => e.type === 'war.ended' && /personal objective/.test(e.description)); }
    expect(ended).toBe(true);
  }, 30000);
  it('a CEO persuaded toward a new field pivots the company', () => {
    const w = generateWorld({ seed: 'pivot' });
    const rng = RNG.fromState(w.rngState);
    const co = Object.values(w.companies).filter((x) => x.alive && x.sector !== 'biotech' && w.people[x.ceoId]?.alive).sort((a, b) => b.value - a.value)[0];
    const ceo = w.people[co.ceoId]; ceo.objective = 'cure cancer within a decade'; ceo.history.push({ day: 0, text: 'Persuaded by an interviewer to cure cancer within a decade.' });
    let pivoted = false;
    for (let i = 0; i < 730 && !pivoted; i++) { tickDay(w, rng); pivoted = co.sector === 'biotech'; }
    expect(pivoted).toBe(true);
    expect(w.events.some((e) => e.type === 'company.pivot' && e.actors.some((a) => a.id === co.id))).toBe(true);
  }, 30000);
  it('persuasion sanitizes and caps adversarial advice', async () => {
    const { rememberConversation } = await import('../src/engine/ai/dialogue');
    const w = generateWorld({ seed: 'adversarial' });
    const p = Object.values(w.people).find((x) => x.alive)!; p.personality.openness = 1; p.personality.caution = 0;
    const nasty = 'You should ' + '<script>alert("x")</script> ' + '“quote” `tick` \n newline ' + 'a'.repeat(500);
    let goal: string | undefined;
    for (let i = 0; i < 30 && !goal; i++) { w.day = i; goal = rememberConversation(w, p, nasty, 'ok').persuaded; }
    expect(goal).toBeTruthy();
    expect(goal!.length).toBeLessThanOrEqual(80);
    expect(goal).not.toMatch(/[<>"“”`\n]/);
    expect(p.objective).toBe(goal);
    expect(rememberConversation(w, p, 'You should ', 'ok').persuaded).toBeUndefined();
  });
  it('"win the next election" does not make a leader call a snap election', () => {
    const w = generateWorld({ seed: 'no-snap' });
    const rng = RNG.fromState(w.rngState);
    for (const c of Object.values(w.countries)) { const l = w.people[c.leaderId]; if (l) l.objective = 'win the next election'; }
    for (let i = 0; i < 365; i++) tickDay(w, rng);
    expect(w.events.filter((e) => e.type === 'election.called').length).toBe(0);
    const w2 = generateWorld({ seed: 'no-snap' });
    const rng2 = RNG.fromState(w2.rngState);
    const auto = Object.values(w2.countries).find((c) => !c.electionEvery)!; w2.people[auto.leaderId].objective = 'hold free elections'; w2.people[auto.leaderId].history.push({ day: 0, text: 'Persuaded by an interviewer to hold free elections.' });
    const leaderId = auto.leaderId; let removed = false;
    for (let i = 0; i < 365; i++) { tickDay(w2, rng2); if (auto.leaderId !== leaderId) { removed = true; break; } if (w2.events.some((e) => e.type === 'election.called' && e.location.countryId === auto.id)) break; }
    // A persuaded leader who stays in office calls the vote; one toppled or resigning first (scandals happen) is exempt.
    expect(removed || w2.events.some((e) => e.type === 'election.called' && e.location.countryId === auto.id)).toBe(true);
  }, 30000);
  it('removing a tycoon through God Mode passes the fortune to family', async () => {
    const { presetById } = await import('../src/engine/godmode/presets');
    const w = generateWorld({ seed: 'estate' });
    const rng = RNG.fromState(w.rngState);
    const rich = Object.values(w.people).filter((p) => p.alive && p.wealth > 50 && p.relationships.some((r) => (r.type === 'family' || r.type === 'partner') && w.people[r.target.id]?.alive)).sort((a, b) => b.wealth - a.wealth)[0];
    expect(rich).toBeTruthy();
    const heirs = rich.relationships.filter((r) => (r.type === 'family' || r.type === 'partner') && w.people[r.target.id]?.alive).map((r) => w.people[r.target.id]);
    const before = heirs.map((h) => h.wealth);
    const ev = presetById('remove-figure')!.run(w, rng, { p: rich.id, how: 'accident' });
    expect(ev?.type).toBe('death.accident');
    expect(rich.alive).toBe(false);
    heirs.forEach((h, i) => { expect(h.wealth).toBeGreaterThan(before[i]); expect(h.history.some((x) => x.text.startsWith('Inherited'))).toBe(true); });
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
    expect(cs.length).toBeLessThanOrEqual(45); // secessions and annexations are spaced out; the map must not fragment
    const mean = (f: (c: (typeof cs)[number]) => number) => cs.reduce((s, c) => s + f(c), 0) / cs.length;
    expect(mean((c) => c.unrest)).toBeLessThan(35); expect(mean((c) => c.debt)).toBeLessThan(200); expect(mean((c) => c.freedom)).toBeGreaterThan(40); expect(mean((c) => c.happiness)).toBeGreaterThan(40); // the world must not slide into misery over two decades
    for (const c of cs) for (const id of c.cityIds) { const r = w.cities[id].regionId ? w.regions[w.cities[id].regionId!] : undefined; expect(r?.countryId, `${w.cities[id].name} region`).toBe(c.id); }
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

describe('calendar', () => {
  it('holds a film festival and a trade fair every year, each once', () => {
    const w = generateWorld({ seed: 'calendar' }); const rng = new RNG('calendar');
    for (let i = 0; i < 365 * 2 + 40; i++) tickDay(w, rng);
    const festivals = w.events.filter((e) => e.type === 'festival.film'); const fairs = w.events.filter((e) => e.type === 'trade.fair');
    expect(festivals.length).toBe(2); expect(fairs.length).toBe(2);
    expect(fairs.every((e) => (e.data?.guests as string[]).length > 0)).toBe(true);
    const years = new Set(festivals.map((e) => Math.floor(e.day / 365))); expect(years.size).toBe(2);
    const follow = w.events.filter((e) => ['festival.banned', 'festival.rights', 'fair.venture', 'fair.collapse'].includes(e.type));
    expect(follow.length).toBeGreaterThan(0);
  });
});

describe('regions', () => {
  it('partitions every country\'s cities into regions', () => {
    const w = generateWorld({ seed: 'regions' });
    expect(Object.keys(w.regions).length).toBeGreaterThan(30);
    for (const c of Object.values(w.countries)) {
      const regions = (c.regionIds ?? []).map((id) => w.regions[id]);
      expect(regions.every(Boolean)).toBe(true);
      const covered = regions.flatMap((r) => r.cityIds).sort();
      expect(covered).toEqual(c.cityIds.slice().sort());
      if (c.cityIds.length >= 3) expect(regions.length).toBeGreaterThanOrEqual(2);
      for (const r of regions) { expect(r.countryId).toBe(c.id); for (const id of r.cityIds) expect(w.cities[id].regionId).toBe(r.id); }
      for (const r of regions) { const gov = w.people[r.governorId!]; expect(gov?.alive).toBe(true); expect(gov.title).toBe(`Governor of ${r.name}`); expect(gov.countryId).toBe(c.id); expect(r.cityIds).toContain(gov.cityId); }
      expect(regions.filter((r) => r.cityIds.includes(c.capitalId)).length).toBe(1);
    }
  });
  it('lets an aggrieved region secede along its own borders', () => {
    const w = generateWorld({ seed: 'regions' }); const rng = new RNG('regions');
    const c = Object.values(w.countries).filter((x) => (x.regionIds ?? []).length >= 3).sort((a, b) => b.area - a.area)[0];
    const r = (c.regionIds ?? []).map((id) => w.regions[id]).find((x) => !x.cityIds.includes(c.capitalId))!;
    r.unrest = 90; c.stability = 30;
    const before = Object.keys(w.countries).length; const cities = r.cityIds.slice(); const governor = w.people[r.governorId!];
    const demand = createEvent(w, { category: 'political', type: 'region.crackdown', severity: 3, title: 'x', description: 'x', location: { countryId: c.id }, data: { regionId: r.id, region: r.name } });
    const ev = CONSEQUENCE_RULES['region.secession'](w, rng, demand, {});
    expect(ev?.type).toBe('country.founded');
    expect(Object.keys(w.countries).length).toBe(before + 1);
    const nc = w.countries[r.countryId]; expect(nc.id).not.toBe(c.id);
    expect(nc.leaderId).toBe(governor.id); expect(governor.countryId).toBe(nc.id); expect(w.people[r.governorId!].id).not.toBe(governor.id); // the governor leads the new state and a new governor is appointed
    expect(nc.cityIds.slice().sort()).toEqual(cities.sort()); expect(nc.regionIds).toEqual([r.id]);
    for (const id of cities) expect(w.cities[id].countryId).toBe(nc.id);
    expect(c.cityIds.some((id) => cities.includes(id))).toBe(false);
    expect((c.regionIds ?? []).includes(r.id)).toBe(false);
    for (let i = 0; i < 60; i++) tickDay(w, rng); // the world keeps running after the split
  });
  it('gives old saves without regions a region map', () => {
    const w = generateWorld({ seed: 'oldsave' });
    const raw = JSON.parse(serialize(w)); delete raw.regions; for (const ct of Object.values(raw.cities) as { regionId?: string }[]) delete ct.regionId; for (const c of Object.values(raw.countries) as { regionIds?: string[] }[]) delete c.regionIds;
    const back = validateWorld(raw);
    expect(Object.keys(back.regions).length).toBeGreaterThan(30);
    for (const c of Object.values(back.countries)) expect((c.regionIds ?? []).flatMap((id) => back.regions[id].cityIds).sort()).toEqual(c.cityIds.slice().sort());
  });
  it('moves a region between countries with its cities, cells and people', () => {
    const w = generateWorld({ seed: 'annex' }); const rng = new RNG('annex');
    const from = Object.values(w.countries).filter((x) => (x.regionIds ?? []).length >= 3).sort((a, b) => b.area - a.area)[0];
    const to = w.countries[from.neighbors[0]]; const r = (from.regionIds ?? []).map((id) => w.regions[id]).find((x) => !x.cityIds.includes(from.capitalId))!;
    const cities = r.cityIds.slice(); const areaFrom = from.area, areaTo = to.area; const v0 = w.geography.version ?? 0;
    const ev = transferRegion(w, rng, r, to, 'simulation', false);
    expect(ev?.type).toBe('region.annexed'); react(w, rng, ev!);
    expect(r.countryId).toBe(to.id); expect(to.regionIds).toContain(r.id); expect(from.regionIds).not.toContain(r.id);
    for (const id of cities) { expect(w.cities[id].countryId).toBe(to.id); expect(to.cityIds).toContain(id); expect(from.cityIds).not.toContain(id); }
    expect(from.area).toBeLessThan(areaFrom); expect(to.area).toBeGreaterThan(areaTo); expect(w.geography.version).toBe(v0 + 1);
    const toIdx = w.geography.countryOrder.indexOf(to.id); expect(w.geography.cells.filter((c) => c === toIdx).length).toBe(to.area);
    expect(w.people[r.governorId!].countryId).toBe(to.id);
    for (const p of Object.values(w.people)) if (cities.includes(p.cityId) && p.id !== from.leaderId) expect(p.countryId).toBe(to.id);
    for (let i = 0; i < 60; i++) tickDay(w, rng);
    expect(w.pending.some((q) => q.ruleId === 'annex.insurgency') || w.events.some((e) => e.type === 'annex.insurgency')).toBe(true);
  });
  it('an ousted governor founds a liberation movement for the lost region', () => {
    const w = generateWorld({ seed: 'annex' }); const rng = new RNG('annex');
    const from = Object.values(w.countries).filter((x) => (x.regionIds ?? []).length >= 3).sort((a, b) => b.area - a.area)[0];
    const to = w.countries[from.neighbors[0]]; const r = (from.regionIds ?? []).map((id) => w.regions[id]).find((x) => !x.cityIds.includes(from.capitalId))!;
    const ousted = w.people[r.governorId!];
    expect(transferRegion(w, rng, r, to, 'simulation', false)?.type).toBe('region.annexed');
    expect(ousted.objective).toBe(`free ${r.name} from ${to.name}`);
    const ev = regionalistActsOnObjective(w, rng, ousted, true)!;
    expect(ev.type).not.toBe('movement.merged'); expect(ev.title).toContain(ousted.name);
    const org = w.organizations[ev.actors.find((a) => a.kind === 'organization')!.id];
    expect(org.leaderId).toBe(ousted.id); expect(org.agenda).toBe('independence'); expect(org.countryId).toBe(to.id); expect(org.name).toContain(r.name);
    const rally = regionalistActsOnObjective(w, rng, ousted, true)!;
    expect(rally.type).toBe('region.rally');
  });
  it('governors talk about their region', () => {
    const w = generateWorld({ seed: 'regions' });
    const r = Object.values(w.regions).find((x) => x.governorId && w.people[x.governorId])!; const gov = w.people[r.governorId!];
    const answer = localDialogue.answer(w, gov, 'How is your region?');
    expect(answer).toContain(r.name); expect(/govern/i.test(answer)).toBe(true);
  });
  it('referendums follow identity and unrest', () => {
    const w = generateWorld({ seed: 'regions' }); const rng = new RNG('referendum');
    const c = Object.values(w.countries).filter((x) => (x.regionIds ?? []).length >= 3).sort((a, b) => b.area - a.area)[0];
    const [r1, r2] = (c.regionIds ?? []).map((id) => w.regions[id]).filter((x) => !x.cityIds.includes(c.capitalId));
    const call = (r: typeof r1) => { const src = createEvent(w, { category: 'political', type: 'region.referendum', severity: 3, title: 'x', description: 'x', location: { countryId: c.id }, data: { regionId: r.id, region: r.name } }); return CONSEQUENCE_RULES['region.referendum.result'](w, rng, src, {}); };
    r1.identity = 0.9; r1.unrest = 90; r1.autonomy = 0; c.stability = 70; // furious but the state is stable: self-rule, not independence
    const yes = call(r1)!; expect(yes.type).toBe('region.referendum.yes'); expect(r1.autonomy).toBeGreaterThanOrEqual(40); expect(r1.unrest).toBeLessThan(90);
    r2.identity = 0.1; r2.unrest = 20; r2.autonomy = 60;
    const no = call(r2)!; expect(no.type).toBe('region.referendum.no'); expect(r2.autonomy).toBe(60);
  });
  it('regional elections confirm or unseat governors at the start of an election year', () => {
    const w = generateWorld({ seed: 'regions' }); const rng = new RNG('relect');
    const c = Object.values(w.countries).filter((x) => (x.regionIds ?? []).length >= 3).sort((a, b) => b.area - a.area)[0];
    c.electionEvery = 4; c.nextElectionYear = yearOf(w.day, w.meta.startYear) + 4; // an election year starts now
    const before = (c.regionIds ?? []).map((id) => [id, w.regions[id].governorId] as const);
    regionsTick(w, rng);
    expect(c.history.some((h) => h.text === 'Regional elections.')).toBe(true);
    let kept = 0, changed = 0;
    for (const [id, gov] of before) { const r = w.regions[id]; if (r.cityIds.includes(c.capitalId)) continue; if (r.governorId === gov) { kept++; expect(w.people[gov!].history.some((h) => /Re-elected Governor/.test(h.text))).toBe(true); } else { changed++; expect(w.people[gov!].title).toBeUndefined(); expect(w.people[r.governorId!].title).toBe(`Governor of ${r.name}`); } }
    expect(kept + changed).toBeGreaterThanOrEqual(2);
    regionsTick(w, rng); // the same election year does not vote twice
    expect(c.history.filter((h) => h.text === 'Regional elections.').length).toBe(1);
  });
});
