import { describe, it, expect } from 'vitest';
import { generateWorld } from '../src/engine/generator/world';
import { tickDay } from '../src/engine/simulation/tick';
import { RNG } from '../src/engine/rng';
import { setLang, getLang } from '../src/engine/i18n/lang';
import { renderEvent, LOCALIZED_TYPES } from '../src/engine/i18n/render';
import { spanishToEnglish, looksSpanish } from '../src/engine/godmode/es';
import { localGodInterpreter, findDelay } from '../src/engine/godmode/interpreter';
import { t, keysOf } from '../src/i18n';
import { formatDate, daysAgo } from '../src/engine/time';
import { findTextIssues } from '../src/engine/text';

describe('localization', () => {
  it('Spanish is the default language and dictionaries have parity', () => {
    expect(getLang()).toBe('es');
    const es = new Set(keysOf('es')), en = new Set(keysOf('en'));
    expect([...es].filter((k) => !en.has(k))).toEqual([]);
    expect([...en].filter((k) => !es.has(k))).toEqual([]);
    expect(es.size).toBeGreaterThan(700);
    for (const k of es) { expect(t(k).length, k).toBeGreaterThan(0); }
  });
  it('renders the vast majority of simulated events in Spanish and never leaks a template variable', { timeout: 30000 }, () => {
    setLang('es');
    const w = generateWorld({ seed: 'i18n' }); const rng = RNG.fromState(w.rngState);
    for (let d = 0; d < 365 * 4; d++) tickDay(w, rng);
    let localized = 0; const missing = new Map<string, number>();
    for (const ev of w.events) {
      const r = renderEvent(ev, w);
      expect(r.title, ev.type).not.toMatch(/\{[a-z]+\}/i);
      expect(r.description, ev.type).not.toMatch(/\{[a-z]+\}/i);
      expect(findTextIssues(r.title).filter((i) => i.kind !== 'empty'), `${ev.type}: ${r.title}`).toEqual([]);
      if (r.localized) localized++; else missing.set(ev.type, (missing.get(ev.type) ?? 0) + 1);
    }
    const share = localized / w.events.length;
    if (share < 0.9) console.log('untranslated event types:', [...missing.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15));
    expect(share).toBeGreaterThan(0.9);
    expect(LOCALIZED_TYPES.length).toBeGreaterThan(100);
    // English fallback is the engine text
    setLang('en');
    const ev = w.events[10]; expect(renderEvent(ev, w).title).toBe(ev.title);
    setLang('es');
  });
  it('formats dates and relative days per language', () => {
    setLang('es'); expect(formatDate(31, 2040)).toBe('1 de febrero de 2040'); expect(daysAgo(0, 0)).toBe('hoy'); expect(daysAgo(0, 1)).toBe('ayer');
    setLang('en'); expect(formatDate(31, 2040)).toMatch(/Feb/); setLang('es');
  });
  it('understands Spanish God commands through the keyword bridge', () => {
    const w = generateWorld({ seed: 'i18n-god' });
    const cs = Object.values(w.countries).sort((a, b) => b.gdp - a.gdp); const a = cs[0], b = cs[1];
    expect(looksSpanish('Estalla una guerra entre dos países')).toBe(true);
    expect(looksSpanish('A meteor strikes the capital')).toBe(false);
    expect(spanishToEnglish('dentro de tres meses')).toBe('in three months');
    expect(findDelay(spanishToEnglish('Dentro de dos semanas empieza una pandemia'))).toBe(14);
    expect(findDelay(spanishToEnglish('El año que viene, una pandemia'))).toBe(365);
    const cases: [string, string][] = [
      [`${a.name} declara la guerra a ${b.name}`, 'start-war'],
      [`Un meteorito golpea ${a.name}`, 'meteor'],
      ['Estalla una pandemia global', 'pandemic'],
      [`${a.name} y ${b.name} firman una alianza histórica`, 'alliance'],
      [`La economía de ${a.name} colapsa en una crisis`, 'crisis'],
      [`${b.name} estalla en revolución`, 'revolution'],
      [`Se descubre petróleo en ${b.name}`, 'resource'],
      [`Refugiados huyen de ${b.name} hacia ${a.name}`, 'migration'],
      [`${b.name} organiza un festival de cine`, 'festival'],
      [`Una pequeña empresa de ${a.name} descubre una batería que almacena veinte veces más energía`, 'company-breakthrough'],
      [`${a.name} convoca elecciones anticipadas`, 'election'],
      [`Un terremoto sacude ${a.name}`, 'disaster'],
    ];
    for (const [text, action] of cases) {
      const plan = localGodInterpreter.interpret(w, text);
      expect(plan.action, text).toBe(action);
    }
    // entity names survive translation and are still found
    const plan = localGodInterpreter.interpret(w, `${a.name} declara la guerra a ${b.name}`);
    expect(plan.params.a).toBe(a.id); expect(plan.params.b).toBe(b.id);
  });
});
