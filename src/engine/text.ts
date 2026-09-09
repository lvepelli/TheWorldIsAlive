/**
 * Text hygiene for procedural prose. Every generated title, description, headline, post and
 * summary line passes through `tidy()` so template accidents never reach the player:
 * repeated consecutive words ("the the", "el gobierno gobierno"), double articles, doubled
 * spaces, space before punctuation, doubled punctuation, "..", and a repeated sentence.
 * `findTextIssues()` is the same rule set as a linter, used by tests over whole worlds.
 */
const ARTICLES = new Set(['the', 'a', 'an', 'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'en', 'y', 'o', 'que', 'and', 'of', 'to', 'in']);

const WORD_RE = /^[\p{L}\p{N}'’-]+$/u;
const PUNCT = '.,;:!?()[]{}"“”«»‘…—–*';
const isPunct = (ch: string): boolean => PUNCT.indexOf(ch) >= 0;
/** Lower-cased token without surrounding punctuation; ASCII fast path, unicode-safe otherwise. */
function norm(tok: string): string {
  let a = 0, b = tok.length;
  while (a < b && isPunct(tok[a])) a++;
  while (b > a && isPunct(tok[b - 1])) b--;
  return (a === 0 && b === tok.length ? tok : tok.slice(a, b)).toLowerCase();
}
const isPlainWord = (tok: string): boolean => { for (let i = 0; i < tok.length; i++) if (isPunct(tok[i])) return false; return WORD_RE.test(tok); };

/**
 * Collapse repeated consecutive words and short phrases (1–4 words) with a single token scan,
 * keeping the first occurrence's casing and punctuation. Numbers and comma-separated repeats
 * ("1 1", "no, no") are left alone. Linear time — this runs on every generated sentence.
 */
function dedupeTokens(s: string): string {
  if (s.indexOf(' ') < 0) return s;
  const toks = s.split(' ');
  if (toks.length < 2) return s;
  const keys = toks.map(norm);
  const out: string[] = []; const outKeys: string[] = [];
  for (let i = 0; i < toks.length; i++) {
    let dup = 0;
    for (let n = 1; n <= 4 && n <= outKeys.length && i + n <= toks.length; n++) {
      let same = true;
      for (let k = 0; k < n; k++) { const a = outKeys[outKeys.length - n + k], b = keys[i + k]; if (!a || a !== b || /^\d+$/.test(a)) { same = false; break; } }
      if (!same) continue;
      // The kept run must be plain words (no comma between "no, no"), and the repeat must be whole tokens.
      let plain = true; for (let k = 0; k < n; k++) { if (!isPlainWord(out[out.length - n + k]) && k < n - 1) { plain = false; break; } if (k < n - 1 && !isPlainWord(toks[i + k])) { plain = false; break; } }
      if (!plain) continue;
      const last = out[out.length - 1]; if (/[,;:]$/.test(last)) continue;
      dup = n; break;
    }
    if (dup) {
      // Preserve trailing punctuation of the dropped run on the kept run ("the the." → "the.").
      const tail = toks[i + dup - 1].match(/[^\p{L}\p{N}'’-]+$/u)?.[0] ?? '';
      if (tail && !/[^\p{L}\p{N}'’-]$/u.test(out[out.length - 1])) out[out.length - 1] += tail;
      i += dup - 1; continue;
    }
    out.push(toks[i]); outKeys.push(keys[i]);
  }
  return out.join(' ');
}

export function tidy(input: string | undefined | null): string {
  if (!input) return '';
  let s = String(input);
  s = s.replace(/\s+/g, ' ').trim();
  s = dedupeTokens(s);
  // Double articles that survive the token scan: "the a", "el la" style slips are kept (they can be legitimate); exact doubles are gone already.
  if (/\s[,.;:!?%]|[,;:]{2}|\.\.|\?\?|!!|\(\s*\)|,\s*[.!?]|\.\s+\.|\s\)|\(\s/.test(s)) {
    s = s.replace(/\s+([,.;:!?%])/g, '$1');               // no space before punctuation
    s = s.replace(/([,;:])\1+/g, '$1');                   // ",," → ","
    s = s.replace(/(?<![.…])\.\.(?!\.)/g, '.');           // ".." → "." (keep "…")
    s = s.replace(/\.\s*\./g, '.');                       // ". ." → "."
    s = s.replace(/\?\?+/g, '?').replace(/!!+/g, '!');
    s = s.replace(/([.!?…])\s*([.!?])/g, (m, a: string, b: string) => (a === b ? a : a === '…' ? a : m));
    s = s.replace(/\(\s*\)/g, '').replace(/\s+\)/g, ')').replace(/\(\s+/g, '(');
    s = s.replace(/,\s*([.!?])/g, '$1');
    s = s.replace(/\s+/g, ' ').trim();
  }
  // A sentence repeated verbatim back to back ("X. X.") — keep one. Only worth checking with two or more sentence ends.
  if (s.length > 24 && (s.indexOf('. ') >= 0 || s.indexOf('! ') >= 0 || s.indexOf('? ') >= 0)) {
    const parts = s.split(/(?<=[.!?])\s+/);
    if (parts.length > 1) { const kept: string[] = []; for (const part of parts) { const prev = kept[kept.length - 1]; if (prev && prev.length >= 12 && prev === part) continue; kept.push(part); } if (kept.length !== parts.length) s = kept.join(' '); }
  }
  return s;
}

export interface TextIssue { kind: 'repeat' | 'double-article' | 'punctuation' | 'empty' | 'repeat-sentence' | 'space'; at: string }

/** Lint a string without changing it. Used by tests over generated worlds. */
export function findTextIssues(s: string | undefined | null): TextIssue[] {
  const out: TextIssue[] = [];
  if (!s || !String(s).trim()) return [{ kind: 'empty', at: '' }];
  const str = String(s);
  const rep = str.match(/(?<![\p{L}\p{N}'’-])([\p{L}\p{N}'’-]+)\s+\1(?![\p{L}\p{N}'’-])/giu);
  if (rep) for (const r of rep) { const w = r.split(/\s+/)[0]; if (!/^\d+$/.test(w)) out.push({ kind: 'repeat', at: r }); }
  const phr = str.match(/(?<![\p{L}\p{N}'’-])([\p{L}\p{N}'’-]+(?:\s+[\p{L}\p{N}'’-]+){1,3})\s+\1(?![\p{L}\p{N}'’-])/giu); if (phr) for (const r of phr) out.push({ kind: 'repeat', at: r });
  const art = str.match(/(?<![\p{L}\p{N}])(the|el|la|los|las|un|una)\s+\1(?![\p{L}\p{N}])/giu); if (art) for (const a of art) out.push({ kind: 'double-article', at: a });
  if (/\s[,.;:!?]/.test(str)) out.push({ kind: 'space', at: (str.match(/.{0,12}\s[,.;:!?].{0,6}/) ?? [''])[0] });
  if (/(?<![.…])\.\.(?!\.)|,,|\?\?|!!|\.\s\./.test(str)) out.push({ kind: 'punctuation', at: (str.match(/.{0,12}(\.\.|,,|\?\?|!!|\.\s\.).{0,6}/) ?? [''])[0] });
  const sent = str.match(/([^.!?]{12,}[.!?])\s+\1(?=\s|$)/); if (sent) out.push({ kind: 'repeat-sentence', at: sent[1].slice(0, 40) });
  return out;
}
export function isArticle(w: string): boolean { return ARTICLES.has(w.toLowerCase()); }
