/**
 * Engine-side language switch. The UI store sets it; engine text helpers (dates, category names,
 * localized event rendering) read it. Kept separate from the React layer so engine code stays framework-free.
 */
export type Lang = 'es' | 'en';
let current: Lang = 'es';
export function getLang(): Lang { return current; }
export function setLang(l: Lang): void { current = l; }
