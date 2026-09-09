/**
 * PWA install helper: captures Chrome/Android's `beforeinstallprompt`, exposes an
 * `install()` call, and detects iOS Safari (which needs the manual Share → Add to Home Screen).
 */
import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>; }
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as BeforeInstallPromptEvent; listeners.forEach((l) => l()); });
  window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach((l) => l()); });
}
export function isStandalone(): boolean {
  try { return window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true; } catch { return false; }
}
export function isIOS(): boolean { return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream; }
export async function install(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const choice = await deferred.userChoice;
  deferred = null; listeners.forEach((l) => l());
  return choice.outcome === 'accepted';
}
/** React hook: 'prompt' (Android/desktop Chrome can prompt), 'ios' (show manual hint), 'installed', or 'none'. */
export function useInstallState(): 'prompt' | 'ios' | 'installed' | 'none' {
  const [, bump] = useState(0);
  useEffect(() => { const l = () => bump((n) => n + 1); listeners.add(l); return () => { listeners.delete(l); }; }, []);
  if (isStandalone()) return 'installed';
  if (deferred) return 'prompt';
  if (isIOS()) return 'ios';
  return 'none';
}
