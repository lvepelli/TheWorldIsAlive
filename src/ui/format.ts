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
export function sevLabel(s: number): string { return ['', 'Minor', 'Notable', 'Major', 'Critical', 'World-changing'][s] ?? ''; }
export function catVar(cat: string): string { return `var(--cat-${cat})`; }
export function initials(name: string): string { return name.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase(); }
export function hueFor(id: string): number { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360; return h; }
export function titleCase(s: string): string { return s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }
