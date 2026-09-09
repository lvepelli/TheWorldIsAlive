/**
 * Optional LLM integration. Talks to any OpenAI-compatible chat completions
 * endpoint (or your own proxy) configured through Vite env variables:
 *
 *   VITE_AI_ENDPOINT=https://your-proxy.example.com/v1/chat/completions
 *   VITE_AI_MODEL=some-model
 *   VITE_AI_API_KEY=...   (prefer a proxy so the key never ships to browsers)
 *
 * The simulation never waits for these calls. They enhance already-generated
 * text after the fact and fall back silently to the local providers on error.
 * Cost control: only high-severity events are enhanced, with a per-day budget.
 */
import type { World, NewsArticle, WorldEvent } from '../types';
import { PROMPTS, fill } from './prompts';
import type { GodCommandInterpreter, GodPlan } from '../godmode/interpreter';
import { localGodInterpreter } from '../godmode/interpreter';
import { GOD_PRESETS } from '../godmode/presets';
import { formatDate } from '../time';

export interface LLMConfig { endpoint: string; model: string; apiKey?: string; }

export function llmConfigFromEnv(): LLMConfig | null {
  const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env ?? {};
  const endpoint = env.VITE_AI_ENDPOINT;
  if (!endpoint) return null;
  return { endpoint, model: env.VITE_AI_MODEL ?? 'default', apiKey: env.VITE_AI_API_KEY };
}

export async function chat(cfg: LLMConfig, system: string, user: string, maxTokens = 300): Promise<string> {
  const res = await fetch(cfg.endpoint, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}) },
    body: JSON.stringify({ model: cfg.model, max_tokens: maxTokens, temperature: 0.8, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}`);
  const data = await res.json() as { choices?: { message?: { content?: string } }[]; content?: { text?: string }[] };
  return data.choices?.[0]?.message?.content ?? data.content?.[0]?.text ?? '';
}

function parseJSON<T>(text: string): T | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]) as T; } catch { return null; }
}

/** Rewrites the most important articles of the day with the LLM. Mutates articles in place. */
export class LLMNarrativeEnhancer {
  private spentToday = 0;
  private day = -1;
  constructor(private cfg: LLMConfig, private budgetPerDay = 6) {}

  async enhanceDay(world: World, articles: NewsArticle[]): Promise<number> {
    if (world.day !== this.day) { this.day = world.day; this.spentToday = 0; }
    const candidates = articles
      .map((a) => ({ a, ev: world.events.find((e) => e.id === a.eventId) }))
      .filter((x): x is { a: NewsArticle; ev: WorldEvent } => !!x.ev && x.ev.severity >= 4)
      .sort((x, y) => y.ev.severity - x.ev.severity)
      .slice(0, Math.max(0, this.budgetPerDay - this.spentToday));
    let n = 0;
    await Promise.all(candidates.map(async ({ a, ev }) => {
      const outlet = world.outlets[a.outletId]; if (!outlet) return;
      const cause = typeof ev.causedBy === 'string' && ev.causedBy.startsWith('ev_') ? world.events.find((e) => e.id === ev.causedBy)?.title ?? '' : ev.causedBy === 'player' ? 'an unexplained, seemingly divine intervention' : 'none';
      const vars = { outletName: outlet.name, outletStyle: outlet.style, outletBias: outlet.bias, outletMotto: outlet.motto, title: ev.title, category: ev.category, severity: ev.severity, location: ev.location.countryId ? world.countries[ev.location.countryId]?.name : 'global', actors: ev.actors.map((r) => r.id).join(', '), date: formatDate(ev.day, world.meta.startYear), description: ev.description, cause };
      try {
        const out = parseJSON<{ headline: string; body: string }>(await chat(this.cfg, fill(PROMPTS.news_article.system, vars), fill(PROMPTS.news_article.user, vars)));
        if (out?.headline && out.body) { a.headline = out.headline.slice(0, 120); a.body = out.body.slice(0, 600); n++; this.spentToday++; }
      } catch (e) { console.warn('[llm] article enhancement failed', e); }
    }));
    return n;
  }
}

/** LLM-backed God command interpreter with local fallback. */
export class LLMGodInterpreter implements GodCommandInterpreter {
  readonly id = 'llm';
  constructor(private cfg: LLMConfig) {}
  async interpret(world: World, text: string): Promise<GodPlan> {
    const local = localGodInterpreter.interpret(world, text);
    try {
      const actions = GOD_PRESETS.map((p) => `${p.id} — ${p.params.map((x) => `${x.key}:${x.type}`).join(', ') || 'none'}`).join('\n');
      const countries = Object.values(world.countries).map((c) => `${c.id}=${c.name}`).join('; ');
      const companies = Object.values(world.companies).filter((c) => c.alive).sort((a, b) => b.value - a.value).slice(0, 40).map((c) => `${c.id}=${c.name} (${c.sector}, ${c.countryId})`).join('; ');
      const people = Object.values(world.people).filter((p) => p.alive).sort((a, b) => b.fame - a.fame).slice(0, 40).map((p) => `${p.id}=${p.name} (${p.profession}, ${p.countryId})`).join('; ');
      const vars = { actions, countries, companies, people, command: text };
      const out = parseJSON<Partial<GodPlan>>(await chat(this.cfg, fill(PROMPTS.god_command.system, vars), fill(PROMPTS.god_command.user, vars), 400));
      if (!out?.action || (!GOD_PRESETS.some((p) => p.id === out.action) && out.action !== 'company-breakthrough')) return local;
      return { action: out.action, params: out.params ?? {}, interpretation: out.interpretation ?? local.interpretation, confidence: typeof out.confidence === 'number' ? out.confidence : 0.8, magnitude: out.magnitude ?? local.magnitude, delayDays: typeof out.delayDays === 'number' && out.delayDays > 0 ? Math.round(out.delayDays) : local.delayDays, customDescription: out.customDescription ?? local.customDescription, targets: local.targets };
    } catch (e) { console.warn('[llm] god interpretation failed, using local', e); return local; }
  }
}
