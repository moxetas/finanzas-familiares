/** Utilidades compartidas por los gráficos SVG. */

import { h, s } from '../ui/dom';

export interface Series {
  name: string;
  values: number[];
  /** Posición en la paleta (1-6). El color sigue a la cuenta, no a su orden. */
  slot: number;
}

/** Marcas «redondas» para el eje: 0, 500, 1.000, 2.500… */
export function niceTicks(min: number, max: number, target = 4): number[] {
  if (min === max) {
    if (min === 0) return [0, 1];
    min = Math.min(0, min);
    max = Math.max(0, max);
  }
  const span = max - min;
  const raw = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

export function linear(d0: number, d1: number, r0: number, r1: number): (v: number) => number {
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return (v) => r0 + (v - d0) * k;
}

/** Ancho aproximado de un texto en px (para reservar margen). */
export function textWidth(text: string, px = 11): number {
  return text.length * px * 0.62;
}

/** Leyenda HTML: muestra de color + nombre. */
export function legend(items: { name: string; slot: number; kind: 'line' | 'bar' }[]): HTMLElement {
  return h(
    'ul',
    { class: 'legend' },
    items.map((it) => h('li', null, h('span', { class: `swatch swatch-${it.kind} s${it.slot}`, 'aria-hidden': 'true' }), it.name)),
  );
}

/** Rejilla horizontal suave y etiquetas del eje Y. */
export function yGrid(ticks: number[], y: (v: number) => number, x0: number, x1: number, fmt: (v: number) => string): SVGGElement {
  return s(
    'g',
    { class: 'grid', 'aria-hidden': 'true' },
    ticks.map((v) => [
      s('line', { x1: x0, x2: x1, y1: y(v), y2: y(v), class: v === 0 ? 'grid-line zero' : 'grid-line' }),
      s('text', { x: x0 - 6, y: y(v), class: 'axis-label', 'text-anchor': 'end', 'dominant-baseline': 'middle' }, fmt(v)),
    ]),
  );
}

export function xLabels(labels: string[], x: (i: number) => number, yPos: number, every: number): SVGGElement {
  return s(
    'g',
    { class: 'x-axis', 'aria-hidden': 'true' },
    // Se cuenta desde el final para que el último mes siempre tenga etiqueta.
    labels.map((label, i) => ((labels.length - 1 - i) % every === 0 ? s('text', { x: x(i), y: yPos, class: 'axis-label', 'text-anchor': 'middle' }, label) : null)),
  );
}

/** Caja del tooltip (HTML) colocada sobre el gráfico. */
export function tooltipBox(): { el: HTMLElement; show(x: number, y: number, width: number, content: Node): void; hide(): void } {
  const el = h('div', { class: 'chart-tip', hidden: true });
  return {
    el,
    show(x, y, width, content) {
      el.replaceChildren(content);
      el.hidden = false;
      const w = el.offsetWidth;
      const left = Math.max(0, Math.min(width - w, x - w / 2));
      el.style.left = `${left}px`;
      el.style.top = `${Math.max(0, y)}px`;
    },
    hide() {
      el.hidden = true;
    },
  };
}

/**
 * Dibuja el gráfico al ancho real del contenedor y lo vuelve a dibujar si cambia.
 * Así el texto no se escala y siempre se lee al mismo tamaño.
 */
export function responsive(container: HTMLElement, draw: (width: number) => void): void {
  let last = 0;
  let seen = false;
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => run()) : null;
  const run = () => {
    if (!container.isConnected) {
      // Si la vista se ha redibujado y este gráfico ya no está, se deja de observar.
      if (seen) observer?.disconnect();
      return;
    }
    seen = true;
    const width = Math.floor(container.clientWidth);
    if (width > 0 && width !== last) {
      last = width;
      draw(width);
    }
  };
  observer?.observe(container);
  requestAnimationFrame(run);
}
