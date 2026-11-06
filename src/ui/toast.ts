/** Mensajes breves abajo de la pantalla, con una acción opcional (Deshacer, Actualizar…). */

import { h, clear } from './dom';

let region: HTMLElement | null = null;
let timer: number | undefined;

export function mountToasts(el: HTMLElement): void {
  region = el;
}

export function toast(message: string, opts: { action?: { label: string; onClick: () => void }; duration?: number } = {}): void {
  if (!region) return;
  window.clearTimeout(timer);
  clear(region);
  const box = h(
    'div',
    { class: 'toast' },
    h('span', null, message),
    opts.action
      ? h(
          'button',
          {
            type: 'button',
            class: 'toast-action',
            onclick: () => {
              hide();
              opts.action!.onClick();
            },
          },
          opts.action.label,
        )
      : null,
  );
  region.append(box);
  const duration = opts.duration ?? (opts.action ? 7000 : 3500);
  if (duration > 0) timer = window.setTimeout(hide, duration);
}

export function hide(): void {
  if (region) clear(region);
}
