/** Instalar la app en la pantalla de inicio (Android, iOS, escritorio). */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

export function listenInstall(onChange: () => void): void {
  listeners.add(onChange);
}

window.addEventListener('beforeinstallprompt', (ev) => {
  ev.preventDefault();
  deferred = ev as BeforeInstallPromptEvent;
  listeners.forEach((fn) => fn());
});
window.addEventListener('appinstalled', () => {
  deferred = null;
  listeners.forEach((fn) => fn());
});

/** ¿Se está usando ya como app instalada? */
export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** ¿El navegador ofrece su propio botón de instalar (Chrome, Edge, Android…)? */
export function canPromptInstall(): boolean {
  return deferred !== null;
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const ev = deferred;
  deferred = null;
  await ev.prompt();
  const choice = await ev.userChoice;
  listeners.forEach((fn) => fn());
  return choice.outcome === 'accepted';
}
