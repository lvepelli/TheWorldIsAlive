/**
 * AI provider registry. Chooses LLM-backed providers when configured,
 * otherwise the deterministic local ones. Import from here in the UI.
 */
import { llmConfigFromEnv, LLMGodInterpreter, LLMNarrativeEnhancer } from './llm';
import { localGodInterpreter, type GodCommandInterpreter } from '../godmode/interpreter';

const cfg = llmConfigFromEnv();
export const aiEnabled = !!cfg;
export const godInterpreter: GodCommandInterpreter = cfg ? new LLMGodInterpreter(cfg) : localGodInterpreter;
export const narrativeEnhancer: LLMNarrativeEnhancer | null = cfg ? new LLMNarrativeEnhancer(cfg) : null;
