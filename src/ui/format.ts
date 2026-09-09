export function fmtNum(n: number, digits = 1): string {
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(digits) + 'T';
  if (abs >= 1e9) return (n / 1e9).toFixed(digits) + 'B';
  if (abs >= 1e6) return (n / 1e6).toFixed(digits) + 'M';
  if (abs >= 1e3) return (n / 1e3).toFixed(digits) + 'k';
  return n.toFixed(abs < 10 ? digits : 0);
}
export function fmtMoneyB(b: number): string {
  if (b >= 1000) return `$${(b / 1000).toFixed(2)}T`;
  if (b >= 1) return `$${b.toFixed(1)}B`;
  return `$${(b * 1000).toFixed(0)}M`;
}
export function fmtPct(p: number, digits = 1): string { return `${p >= 0 ? '+' : ''}${p.toFixed(digits)}%`; }
export function fmtPop(n: number): string { return fmtNum(n, 1); }
import { t } from '@/i18n';
export function sevLabel(s: number): string { return s >= 1 && s <= 5 ? t(`sev.${s}`) : ''; }
export function catLabel(cat: string): string { return t(`cat.${cat}`); }
export function govLabel(g: string): string { const k = `gov.${g}`; const v = t(k); return v === k ? titleCase(g) : v; }
export function profLabel(p: string): string { const k = `prof.${p}`; const v = t(k); return v === k ? titleCase(p) : v; }
export function sectorLabel(s: string): string { const k = `sector.${s}`; const v = t(k); return v === k ? titleCase(s) : v; }
export function ideoLabel(i: string): string { const k = `ideo.${i}`; const v = t(k); return v === k ? i : v; }
export function relLabel(r: string): string { const k = `rel.${r}`; const v = t(k); return v === k ? r : v; }
export function orgTypeLabel(o: string): string { const k = `org.type.${o}`; const v = t(k); return v === k ? titleCase(o) : v; }
export function resLabel(r: string): string { const k = `res.${r}`; const v = t(k); return v === k ? r : v; }
/** Country relation bucket from a -100..100 score plus war/alliance flags. */
export function relationBucket(score: number, war: boolean, ally: boolean, trade: boolean): 'war' | 'enemy' | 'rival' | 'neutral' | 'friendly' | 'ally' | 'trade' { if (war) return 'war'; if (ally) return 'ally'; if (score <= -60) return 'enemy'; if (score <= -25) return 'rival'; if (score >= 40) return 'friendly'; if (trade && score >= 10) return 'trade'; return 'neutral'; }
export function relationColor(b: string): string { return b === 'war' ? 'var(--bad)' : b === 'enemy' ? '#ff8a3d' : b === 'rival' ? 'var(--warn)' : b === 'ally' ? 'var(--ok)' : b === 'friendly' ? '#8fd3ff' : b === 'trade' ? '#2dd4bf' : 'var(--text-3)'; }
export function trendArrow(delta: number, eps = 0.05): string { return delta > eps ? '▲' : delta < -eps ? '▼' : '▶'; }
export function trendColor(delta: number, eps = 0.05, invert = false): string { const up = delta > eps, down = delta < -eps; if (!up && !down) return 'var(--text-3)'; return (up !== invert) ? 'var(--ok)' : 'var(--bad)'; }
export function catVar(cat: string): string { return `var(--cat-${cat})`; }
export function initials(name: string): string { return name.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase(); }
export function hueFor(id: string): number { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360; return h; }
export function titleCase(s: string): string { return s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }
