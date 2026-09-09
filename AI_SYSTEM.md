# AI System

## Principle

The game must be complete without any AI API. Generative AI is an **enhancement layer**, never a dependency of the simulation tick. The core is synchronous and deterministic; AI work is asynchronous and idempotent (it rewrites text that already exists).

## Layered simulation

1. Global statistics (populations, GDP, markets) — arithmetic.
2. Countries / organizations / cities — rule drift (`systems.ts`).
3. Lightweight agents (tier 2/3 people) — occasional objective pursuit.
4. Important named characters (tier 1) — frequent objective pursuit, memories, life story.
5. **LLM-enhanced narrative** (optional) — better prose for top stories, richer God command interpretation, future dialogue.

## Abstractions

| Interface | Local implementation | LLM implementation |
| --- | --- | --- |
| `NarrativeProvider` (`ai/narrative.ts`): `headline`, `post`, `reply` | `LocalNarrativeProvider` (templates by outlet bias / profession / traits) | Not synchronous; instead `LLMNarrativeEnhancer.enhanceDay()` rewrites top articles after the tick |
| `GodCommandInterpreter` (`godmode/interpreter.ts`): `interpret(world, text) → GodPlan` | `LocalGodInterpreter` (regex intents + entity matching) | `LLMGodInterpreter` (JSON plan, validated, falls back to local) |
| Character dialogue (`ai/dialogue.ts`: `DialogueProvider.answer`) | `LocalDialogueProvider` (personality/objective/memory/relationship templates) | not wired yet; prompt ready in `prompts/character_dialogue.md` |
| World summaries | `summary.ts` templates | prompt ready in `prompts/world_summary.md` |

`src/engine/ai/index.ts` picks implementations based on `VITE_AI_ENDPOINT`.

## Configuration

```
VITE_AI_ENDPOINT=https://your-proxy/v1/chat/completions   # OpenAI-compatible chat endpoint
VITE_AI_MODEL=...
VITE_AI_API_KEY=...   # avoid: ship a proxy instead of a browser-visible key
```

`chat()` in `ai/llm.ts` posts `{model, messages, max_tokens}` and accepts either OpenAI-style `choices[0].message.content` or Anthropic-style `content[0].text`. Adapt `chat()` for other providers; nothing else needs to change.

## Prompts

Templates live in `/prompts/*.md` (human-readable) and are inlined in `src/engine/ai/prompts.ts` (what the browser uses). Placeholders use `{{name}}`. Keep both in sync.

## Cost control

- Only severity ≥ 4 events are enhanced; `LLMNarrativeEnhancer(budgetPerDay = 6)`.
- Enhancement happens after `advance()` and after God interventions, not during fast-forward loops.
- God interpretation is one call per command; failures fall back to the local plan without user-visible errors.
- All prompts are short (< 1.5k tokens) and request JSON to keep outputs small.

## Adding a new AI feature

1. Write a deterministic local fallback first.
2. Add a prompt in `/prompts` and `prompts.ts`.
3. Implement the async enhancer that mutates existing world data (never creates simulation-relevant state).
4. Bump `version` in the store after mutation so the UI refreshes.
