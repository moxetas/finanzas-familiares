/**
 * Lista que se ordena arrastrando el asa (≡) de cada fila, como al ordenar un
 * menú. Funciona con el dedo y con el ratón; con el teclado, las flechas ↑ ↓
 * sobre el asa mueven la fila un puesto.
 *
 * Mientras se arrastra solo se mueven las filas en pantalla; al soltar se
 * llama a `onMove(desde, hasta)` (posiciones en la lista) y la vista se vuelve
 * a dibujar con el orden nuevo.
 */

import { h } from './dom';

/** Distancia al borde de la pantalla a la que empieza a desplazarse sola. */
const EDGE = 72;
const MAX_SPEED = 14;

/** Asa para arrastrar una fila. `label` es lo que lee el lector de pantalla. */
export function dragHandle(label: string, focusKey: string): HTMLButtonElement {
  return h(
    'button',
    { type: 'button', class: 'drag-handle', 'aria-label': label, 'data-focus-key': focusKey, 'data-drag-handle': true },
    h('span', { class: 'drag-grip', 'aria-hidden': 'true' }),
  );
}

export function makeSortable(list: HTMLElement, onMove: (from: number, to: number) => void): void {
  list.classList.add('sortable');

  list.addEventListener('keydown', (ev) => {
    const handle = (ev.target as Element).closest?.('[data-drag-handle]');
    if (!handle || (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown')) return;
    const items = [...list.children];
    const from = items.indexOf(handle.closest('li')!);
    const to = from + (ev.key === 'ArrowUp' ? -1 : 1);
    if (from < 0 || to < 0 || to >= items.length) return;
    ev.preventDefault();
    onMove(from, to);
  });

  list.addEventListener('pointerdown', (ev) => {
    const handle = (ev.target as Element).closest?.<HTMLElement>('[data-drag-handle]');
    if (!handle || !ev.isPrimary || ev.button !== 0) return;
    const item = handle.closest('li');
    if (!item) return;
    ev.preventDefault();

    const items = [...list.children] as HTMLElement[];
    const from = items.indexOf(item);
    const scroll0 = window.scrollY;
    // Posiciones de partida, en coordenadas de la página (no cambian al desplazar).
    const boxes = items.map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top + scroll0, bottom: r.bottom + scroll0 };
    });
    const step = boxes[from]!.bottom - boxes[from]!.top;
    const grabY = ev.clientY + scroll0;
    let pointerY = ev.clientY;
    let to = from;
    let frame = 0;

    handle.setPointerCapture(ev.pointerId);
    list.classList.add('is-sorting');
    item.classList.add('is-dragging');

    const layout = () => {
      const minDy = boxes[0]!.top - boxes[from]!.top;
      const maxDy = boxes[boxes.length - 1]!.bottom - boxes[from]!.bottom;
      const dy = Math.min(maxDy, Math.max(minDy, pointerY + window.scrollY - grabY));
      item.style.transform = `translateY(${dy}px)`;
      const center = (boxes[from]!.top + boxes[from]!.bottom) / 2 + dy;
      to = from;
      for (let i = from + 1; i < items.length; i++) if (center > (boxes[i]!.top + boxes[i]!.bottom) / 2) to = i;
      for (let i = from - 1; i >= 0; i--) if (center < (boxes[i]!.top + boxes[i]!.bottom) / 2) to = i;
      // Llevada hasta un extremo, va a ese extremo (las filas no miden todas lo mismo).
      if (dy <= minDy) to = 0;
      if (dy >= maxDy) to = items.length - 1;
      items.forEach((el, i) => {
        if (i === from) return;
        const shift = from < to && i > from && i <= to ? -step : to < from && i >= to && i < from ? step : 0;
        el.style.transform = shift ? `translateY(${shift}px)` : '';
      });
    };

    // Cerca del borde de la pantalla, la página se desplaza sola.
    const autoScroll = () => {
      const vh = window.innerHeight;
      const speed = pointerY < EDGE ? -((EDGE - pointerY) / EDGE) : pointerY > vh - EDGE ? (pointerY - (vh - EDGE)) / EDGE : 0;
      if (speed !== 0) {
        window.scrollBy(0, Math.round(speed * MAX_SPEED));
        layout();
      }
      frame = requestAnimationFrame(autoScroll);
    };
    frame = requestAnimationFrame(autoScroll);

    const move = (e: PointerEvent) => {
      if (e.pointerId !== ev.pointerId) return;
      pointerY = e.clientY;
      layout();
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== ev.pointerId) return;
      cancelAnimationFrame(frame);
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      list.classList.remove('is-sorting');
      item.classList.remove('is-dragging');
      for (const el of items) el.style.transform = '';
      if (e.type === 'pointerup' && to !== from) onMove(from, to);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  });
}
