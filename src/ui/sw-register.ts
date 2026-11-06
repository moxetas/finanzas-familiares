/**
 * Registra el service worker (la copia para usar sin conexión) y avisa
 * cuando hay una versión nueva. La versión nueva no se aplica a medias:
 * espera a que la persona toque «Actualizar» y entonces recarga una vez.
 */

import { t } from '../i18n';
import { toast } from './toast';

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  const hadController = Boolean(navigator.serviceWorker.controller);

  const register = async () => {
    let reg: ServiceWorkerRegistration;
    try {
      reg = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
    } catch {
      return;
    }

    const offerUpdate = (worker: ServiceWorker) =>
      toast(t('toast.update'), {
        duration: 0,
        action: { label: t('toast.updateNow'), onClick: () => worker.postMessage('skip-waiting') },
      });

    if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);

    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state !== 'installed') return;
        if (navigator.serviceWorker.controller) offerUpdate(worker);
        else toast(t('toast.offlineReady'));
      });
    });

    // Cuando la versión nueva toma el control, se recarga una sola vez.
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading) return;
      reloading = true;
      location.reload();
    });

    // Al volver a la app, mira si hay versión nueva.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => undefined);
    });
  };

  // La app arranca de forma asíncrona: puede que la página ya haya terminado de cargar.
  if (document.readyState === 'complete') void register();
  else window.addEventListener('load', () => void register(), { once: true });
}
