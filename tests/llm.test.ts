import { describe, it, expect } from 'vitest';
import { createServer } from 'node:http';
import { generateWorld } from '../src/engine/generator/world';
import { LLMGodInterpreter, LLMNarrativeEnhancer, LLMDialogueProvider, chat } from '../src/engine/ai/llm';
import { rememberConversation } from '../src/engine/ai/dialogue';
import { RNG } from '../src/engine/rng';
import { tickDay } from '../src/engine/simulation/tick';

/** Mock OpenAI-compatible endpoint that returns canned JSON depending on the system prompt. */
async function mockServer(): Promise<{ url: string; close: () => void; calls: string[] }> {
  const calls: string[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const payload = JSON.parse(body) as { messages: { role: string; content: string }[] };
      const sys = payload.messages[0].content; const user = payload.messages[1].content;
      calls.push(sys.slice(0, 30));
      let content: string;
      if (sys.includes('God command')) {
        const cid = user.match(/Countries: (c_\w+)=/)?.[1] ?? '';
        content = `Here you go:\n{"action":"boom","params":{"a":"${cid}"},"interpretation":"LLM: boom in first country","confidence":0.9,"magnitude":1,"customDescription":"A golden age."}`;
      } else if (sys.startsWith('You are ') && sys.includes('Never break character')) content = user.includes('trust') ? 'I trust nobody, least of all interviewers.' : 'LLM answer in character.';
      else content = '{"headline":"LLM HEADLINE","body":"LLM body text."}';
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content } }] }));
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${port}/v1/chat/completions`, close: () => server.close(), calls };
}

describe('LLM integration (mocked endpoint)', () => {
  it('interprets God commands through the endpoint and validates the plan', async () => {
    const srv = await mockServer();
    try {
      const w = generateWorld({ seed: 'llm' });
      const interp = new LLMGodInterpreter({ endpoint: srv.url, model: 'mock' });
      const plan = await interp.interpret(w, 'make the economy amazing');
      expect(plan.action).toBe('boom');
      expect(plan.params.a).toBe(Object.keys(w.countries)[0]);
      expect(plan.interpretation).toContain('LLM');
      expect(srv.calls.length).toBe(1);
    } finally { srv.close(); }
  });
  it('falls back to the local interpreter when the endpoint fails', async () => {
    const w = generateWorld({ seed: 'llm2' });
    const interp = new LLMGodInterpreter({ endpoint: 'http://127.0.0.1:1/nope', model: 'mock' });
    const plan = await interp.interpret(w, `${Object.values(w.countries)[0].name} declares war on ${Object.values(w.countries)[1].name}`);
    expect(plan.action).toBe('start-war');
  });
  it('enhances top articles and respects the daily budget', async () => {
    const srv = await mockServer();
    try {
      const w = generateWorld({ seed: 'llm3' });
      const rng = RNG.fromState(w.rngState);
      for (let i = 0; i < 60; i++) tickDay(w, rng);
      // Force a severity-5 event so there is something worth enhancing
      const { economicShock } = await import('../src/engine/events/actions');
      economicShock(w, rng, null, 'crash', 'player', true);
      const { generateNews } = await import('../src/engine/simulation/information');
      const todays = generateNews(w, rng, w.events.slice(-1));
      expect(todays.length).toBeGreaterThan(0);
      const enh = new LLMNarrativeEnhancer({ endpoint: srv.url, model: 'mock' }, 3);
      const n = await enh.enhanceDay(w, todays);
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThanOrEqual(3);
      expect(todays.some((a) => a.headline === 'LLM HEADLINE')).toBe(true);
      const again = await enh.enhanceDay(w, todays);
      expect(again).toBe(0); // budget spent for the day
    } finally { srv.close(); }
  });
  it('chat() parses Anthropic-style responses too', async () => {
    const server = createServer((_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ content: [{ text: 'hello' }] })); });
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as { port: number }).port;
    try { expect(await chat({ endpoint: `http://127.0.0.1:${port}/`, model: 'x' }, 's', 'u')).toBe('hello'); } finally { server.close(); }
  });

  it('LLMDialogueProvider answers in character, keeps a thread, and falls back locally', async () => {
    const m = await mockServer();
    const w = generateWorld({ seed: 'llm-dialogue' });
    const p = Object.values(w.people).find((x) => x.alive)!;
    const prov = new LLMDialogueProvider({ endpoint: m.url, model: 'mock' });
    const a1 = await prov.answer(w, p, 'What do you want?'); expect(a1).toBe('LLM answer in character.');
    rememberConversation(w, p, 'What do you want?', a1);
    const a2 = await prov.answer(w, p, 'Who do you trust?'); expect(a2).toContain('trust nobody');
    expect(p.memories.some((x) => x.text.startsWith('Was asked'))).toBe(true);
    m.close();
    const dead = new LLMDialogueProvider({ endpoint: 'http://127.0.0.1:9/nope', model: 'mock' });
    const a3 = await dead.answer(w, p, 'Tell me about yourself.'); expect(typeof a3).toBe('string'); expect(a3.length).toBeGreaterThan(5);
  });
});
