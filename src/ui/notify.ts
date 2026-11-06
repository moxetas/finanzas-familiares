/**
 * Notificaciones con la app cerrada.
 *
 * Sin servidor, la única forma de que la app avise sola es la «sincronización
 * periódica en segundo plano» del navegador (Chrome y Edge en Android, con la app
 * instalada): el navegador despierta al service worker más o menos una vez al
 * día y este muestra los avisos que tocan. iPhone y otros navegadores no lo
 * permiten; allí los avisos salen al abrir la app, y para que avise con la app
 * cerrada se pueden añadir los pagos al calendario.
 */

export const PERIODIC_TAG = 'avisos-pagos';
const DAY = 24 * 60 * 60 * 1000;

interface PeriodicSyncManager {
  register(tag: string, options: { minInterval: number }): Promise<void>;
  getTags(): Promise<string[]>;
}

type RegistrationWithPeriodic = ServiceWorkerRegistration & { periodicSync?: PeriodicSyncManager };

/** ¿Puede este navegador avisar con la app cerrada? */
export function backgroundSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    typeof ServiceWorkerRegistration !== 'undefined' &&
    'periodicSync' in ServiceWorkerRegistration.prototype
  );
}

export function permission(): NotificationPermission | 'unsupported' {
  return 'Notification' in window ? Notification.permission : 'unsupported';
}

/**
 * Registra la comprobación diaria. Devuelve `true` si el navegador la acepta
 * (normalmente solo con la app instalada en la pantalla de inicio).
 */
export async function registerBackgroundCheck(): Promise<boolean> {
  if (!backgroundSupported() || Notification.permission !== 'granted') return false;
  try {
    const reg = (await navigator.serviceWorker.ready) as RegistrationWithPeriodic;
    const status = await navigator.permissions.query({ name: 'periodic-background-sync' as PermissionName });
    if (status.state !== 'granted' || !reg.periodicSync) return false;
    await reg.periodicSync.register(PERIODIC_TAG, { minInterval: DAY / 2 });
    return true;
  } catch {
    return false;
  }
}

/** Pide permiso (solo tras tocar un botón) y registra la comprobación diaria. */
export async function enableNotifications(): Promise<{ permission: NotificationPermission | 'unsupported'; background: boolean }> {
  if (!('Notification' in window)) return { permission: 'unsupported', background: false };
  const result = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
  return { permission: result, background: result === 'granted' ? await registerBackgroundCheck() : false };
}

/** Número en el icono de la app (pagos de esta semana), donde el sistema lo permite. */
export function setBadge(count: number): void {
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  try {
    if (count > 0) void nav.setAppBadge?.(count)?.catch(() => undefined);
    else void nav.clearAppBadge?.()?.catch(() => undefined);
  } catch {
    /* sin permiso o sin soporte: no pasa nada */
  }
}
