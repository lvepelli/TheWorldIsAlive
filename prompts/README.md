# Prompts

These are the prompt templates used when an external LLM endpoint is configured
(`VITE_AI_ENDPOINT` in `.env`). They are mirrored in `src/engine/ai/prompts.ts`
so the browser build never needs to fetch these files. If you edit one, edit the
other (or write a small build step that inlines them).

The game runs fully without any LLM: every prompt has a deterministic local
fallback in `src/engine/ai/narrative.ts` and `src/engine/godmode/interpreter.ts`.

| File | Used by | Output contract |
| --- | --- | --- |
| `news_article.md` | `LLMNarrativeEnhancer.enhanceArticle` | JSON `{ "headline": string, "body": string }` |
| `social_post.md` | `LLMNarrativeEnhancer.enhancePost` | JSON `{ "text": string }` (≤ 240 chars) |
| `god_command.md` | `LLMGodInterpreter.interpret` | JSON `GodPlan` (see `src/engine/godmode/interpreter.ts`) |
| `world_summary.md` | future: narrative period summaries | plain prose |
| `character_dialogue.md` | talk to a character (`LLMDialogueProvider`; local fallback) | plain prose in character voice, 1–3 sentences |
