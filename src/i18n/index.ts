/**
 * UI localization. Spanish is the primary language; English is the fallback dictionary.
 * `t(key, vars)` looks up the current language, then English, then returns the key itself so
 * missing strings are visible in QA instead of crashing.
 */
import { es } from './es';
import { en } from './en';
import { getLang, setLang as setEngineLang, type Lang } from '@/engine/i18n/lang';

export type { Lang };
const DICTS: Record<Lang, Record<string, string>> = { es, en };
export const LANGS: { id: Lang; label: string }[] = [{ id: 'es', label: 'Español' }, { id: 'en', label: 'English' }];

export function setLang(l: Lang): void { setEngineLang(l); try { document.documentElement.lang = l; } catch { /* non-browser */ } }
export { getLang };

export function t(key: string, vars?: Record<string, string | number>): string {
  const lang = getLang();
  let s = DICTS[lang][key] ?? DICTS.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** Plural helper: t('key', n) picks `key.one` / `key.other`. */
export function tn(key: string, n: number, vars?: Record<string, string | number>): string { return t(n === 1 ? `${key}.one` : `${key}.other`, { n, ...(vars ?? {}) }); }

/** True when a key exists in the current language (used by tests and QA). */
export function has(key: string): boolean { return key in DICTS[getLang()]; }
export function keysOf(lang: Lang): string[] { return Object.keys(DICTS[lang]); }
