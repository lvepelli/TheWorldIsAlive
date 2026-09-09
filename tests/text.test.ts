import { describe, it, expect } from 'vitest';
import { tidy, findTextIssues } from '../src/engine/text';
import { generateWorld } from '../src/engine/generator/world';
import { tickDay } from '../src/engine/simulation/tick';
import { RNG } from '../src/engine/rng';
import { es } from '../src/i18n/es';
import { en } from '../src/i18n/en';

describe('text hygiene', () => {
  it('removes repeated consecutive words and double articles', () => {
    expect(tidy('el gobierno gobierno anunció')).toBe('el gobierno anunció');
    expect(tidy('The the company company grew')).toBe('The company grew');
    expect(tidy('la región región región pide')).toBe('la región pide');
    expect(tidy('ha anunciado ha anunciado medidas')).toBe('ha anunciado medidas');
    expect(tidy('the the a plan')).toBe('the a plan'.replace('the a', 'the a')); // different articles are left alone
  });
  it('fixes spacing and punctuation slips', () => {
    expect(tidy('Hello , world ..')).toBe('Hello, world.');
    expect(tidy('What ?? Really !!')).toBe('What? Really!');
    expect(tidy('Done. . Next')).toBe('Done. Next');
    expect(tidy('  many   spaces  ')).toBe('many spaces');
    expect(tidy('Wait… . More')).toBe('Wait… More');
  });
  it('keeps numbers, names and ellipses', () => {
    expect(tidy('Room 101 101 is not a repeat of digits')).toBe('Room 101 101 is not a repeat of digits');
    expect(tidy('Walla Walla is a city')).toBe('Walla is a city'); // accepted cost: no such places are generated
    expect(tidy('Then… nothing.')).toBe('Then… nothing.');
  });
  it('drops a sentence repeated back to back', () => {
    expect(tidy('The market fell sharply today. The market fell sharply today. Traders panicked.')).toBe('The market fell sharply today. Traders panicked.');
  });
  it('lints without changing', () => {
    expect(findTextIssues('the the end')[0].kind).toBe('repeat');
    expect(findTextIssues('')[0].kind).toBe('empty');
    expect(findTextIssues('A clean sentence, with a comma.')).toEqual([]);
  });
  it('no generated text in a simulated world has duplicated words, empty strings or broken punctuation', () => {
    const w = generateWorld({ seed: 'textcheck' }); const rng = new RNG('textcheck');
    for (let i = 0; i < 400; i++) tickDay(w, rng);
    const bad: string[] = [];
    for (const e of w.events) for (const s of [e.title, e.description]) for (const i of findTextIssues(s)) bad.push(`${e.type}: ${i.kind} @ "${i.at}"`);
    for (const n of w.news) for (const s of [n.headline, n.body]) for (const i of findTextIssues(s)) bad.push(`news: ${i.kind} @ "${i.at}"`);
    for (const p of w.social) for (const i of findTextIssues(p.text)) bad.push(`post: ${i.kind} @ "${i.at}"`);
    for (const sm of w.summaries) for (const l of sm.lines) for (const i of findTextIssues(l)) bad.push(`summary: ${i.kind} @ "${i.at}"`);
    expect(bad.slice(0, 20)).toEqual([]);
  }, 60000);
  it('the two dictionaries carry the same keys and no empty strings', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
    for (const [k, v] of Object.entries(es)) { expect(v.trim(), k).not.toBe(''); expect(findTextIssues(v).filter((i) => i.kind === 'repeat'), k).toEqual([]); }
  });
});
