import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { PROMPTS } from '../src/engine/ai/prompts';

const vars = (s: string) => new Set(Array.from(s.matchAll(/\{\{(\w+)\}\}/g)).map((m) => m[1]));

describe('prompt files', () => {
  it('prompts/*.md carry the same placeholders as prompts.ts', () => {
    for (const [key, p] of Object.entries(PROMPTS)) {
      const file = new URL(`../prompts/${key}.md`, import.meta.url).pathname;
      expect(existsSync(file), `${key}.md exists`).toBe(true);
      const md = readFileSync(file, 'utf8');
      const inTs = vars(`${p.system}\n${p.user}`); const inMd = vars(md);
      expect(Array.from(inMd).sort(), `${key}: placeholders`).toEqual(Array.from(inTs).sort());
    }
  });
});
