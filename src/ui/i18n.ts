/** React side of localization: `useT()` re-renders on language change and returns `t`. */
import { useGame } from '@/state/store';
import { t, tn, getLang, type Lang } from '@/i18n';
export function useT(): typeof t { useGame((s) => s.settings.lang); return t; }
export function useLang(): Lang { return useGame((s) => s.settings.lang) ?? getLang(); }
export { t, tn };
