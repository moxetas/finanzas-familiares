/**
 * Gráficos de los doce meses, en SVG hecho a mano:
 * - `lineChart`: saldo por cuenta (líneas de 2px, punto final con su valor).
 * - `barChart`: barras agrupadas (ingresos frente a gasto real).
 * Ambos tienen rejilla suave, leyenda, y tooltip al pasar el dedo o el ratón
 * (o con las flechas del teclado).
 */

import { h, s } from '../ui/dom';
import { legend, linear, niceTicks, responsive, textWidth, tooltipBox, xLabels, yGrid, type Series } from './common';

export interface ChartOptions {
  /** Etiquetas cortas del eje X (ene, feb…). */
  labels: string[];
  /** Etiquetas largas para el tooltip (enero de 2027…). */
  longLabels: string[];
  series: Series[];
  /** Formato de los valores en tooltip y etiquetas. */
  format: (v: number) => string;
  /** Formato corto para el eje Y. */
  axisFormat: (v: number) => string;
  /** Descripción para lectores de pantalla. */
  ariaLabel: string;
  height?: number;
  /** Filas extra del tooltip para el mes `i`. */
  tipExtra?: (i: number) => { label: string; value: string }[];
}

const AXIS_PX = 11;

function tipContent(opts: ChartOptions, i: number, kind: 'line' | 'bar'): Node {
  return h(
    'div',
    null,
    h('p', { class: 'tip-title' }, opts.longLabels[i] ?? ''),
    h(
      'ul',
      null,
      opts.series.map((se) =>
        h('li', null, h('span', { class: `swatch swatch-${kind} s${se.slot}`, 'aria-hidden': 'true' }), h('span', { class: 'tip-name' }, se.name), h('span', { class: 'num' }, opts.format(se.values[i] ?? 0))),
      ),
      (opts.tipExtra?.(i) ?? []).map((row) => h('li', { class: 'tip-extra' }, h('span', { class: 'tip-name' }, row.label), h('span', { class: 'num' }, row.value))),
    ),
  );
}

/** Conecta ratón, dedo y teclado: llama a `show(i)` con el mes más cercano. */
function interact(wrap: HTMLElement, svg: SVGSVGElement, n: number, xAt: (i: number) => number, show: (i: number | null) => void): void {
  let current: number | null = null;
  const set = (i: number | null) => {
    current = i;
    show(i);
  };
  const nearest = (clientX: number) => {
    const left = svg.getBoundingClientRect().left;
    const x = clientX - left;
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(xAt(i) - x) < Math.abs(xAt(best) - x)) best = i;
    return best;
  };
  svg.addEventListener('pointermove', (ev) => set(nearest(ev.clientX)));
  svg.addEventListener('pointerdown', (ev) => set(nearest(ev.clientX)));
  svg.addEventListener('pointerleave', (ev) => {
    if (ev.pointerType === 'mouse') set(null);
  });
  // Con `on…` (y no addEventListener) para no acumular manejadores al redibujar.
  wrap.onkeydown = (ev) => {
    const keys: Record<string, () => number | null> = {
      ArrowRight: () => Math.min(n - 1, (current ?? -1) + 1),
      ArrowLeft: () => Math.max(0, (current ?? n) - 1),
      Home: () => 0,
      End: () => n - 1,
      Escape: () => null,
    };
    const fn = keys[ev.key];
    if (fn) {
      ev.preventDefault();
      set(fn());
    }
  };
  wrap.onblur = () => set(null);
}

function frame(opts: ChartOptions, kind: 'line' | 'bar', draw: (width: number, plot: HTMLElement) => void): HTMLElement {
  const plot = h('div', { class: 'chart-plot', tabindex: '0', role: 'img', 'aria-label': opts.ariaLabel });
  const root = h('figure', { class: `chart chart-${kind}` }, opts.series.length > 1 ? legend(opts.series.map((se) => ({ name: se.name, slot: se.slot, kind }))) : null, plot);
  responsive(plot, (width) => draw(width, plot));
  return root;
}

export function lineChart(opts: ChartOptions): HTMLElement {
  return frame(opts, 'line', (width, plot) => {
    const height = opts.height ?? 220;
    const n = opts.labels.length;
    const all = opts.series.flatMap((se) => se.values);
    const ticks = niceTicks(Math.min(0, ...all), Math.max(0, ...all));
    const lo = ticks[0]!;
    const hi = ticks[ticks.length - 1]!;

    const endLabels = opts.series.map((se) => opts.format(se.values[n - 1] ?? 0));
    const left = Math.max(...ticks.map((v) => textWidth(opts.axisFormat(v), AXIS_PX))) + 12;
    const right = Math.min(width * 0.32, Math.max(...endLabels.map((l) => textWidth(l, AXIS_PX))) + 14);
    const top = 12;
    const bottom = 26;
    const x = (i: number) => left + (n === 1 ? 0 : (i * (width - left - right)) / (n - 1));
    const y = linear(lo, hi, height - bottom, top);

    const svg = s('svg', { width, height, viewBox: `0 0 ${width} ${height}`, 'aria-hidden': 'true', focusable: 'false' });
    svg.append(yGrid(ticks, y, left, width - right + 6, opts.axisFormat));
    svg.append(xLabels(opts.labels, x, height - 8, width < 420 ? 2 : 1));

    for (const se of opts.series) {
      const d = se.values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
      svg.append(s('path', { d, class: `line s${se.slot}` }));
    }

    // Punto final y su valor. Si dos etiquetas se pisan, se queda la primera
    // (la leyenda y el tooltip siguen dando el resto).
    const placed: number[] = [];
    opts.series.forEach((se, k) => {
      const v = se.values[n - 1] ?? 0;
      const cy = y(v);
      svg.append(s('circle', { cx: x(n - 1), cy, r: 4, class: `dot s${se.slot}` }));
      if (placed.every((p) => Math.abs(p - cy) >= 14)) {
        placed.push(cy);
        svg.append(s('text', { x: x(n - 1) + 8, y: cy, class: 'end-label', 'dominant-baseline': 'middle' }, endLabels[k]!));
      }
    });

    const cross = s('g', { class: 'crosshair', visibility: 'hidden' });
    svg.append(cross);
    const tip = tooltipBox();
    plot.replaceChildren(svg, tip.el);

    interact(plot, svg, n, x, (i) => {
      cross.replaceChildren();
      if (i === null) {
        cross.setAttribute('visibility', 'hidden');
        tip.hide();
        return;
      }
      cross.setAttribute('visibility', 'visible');
      cross.append(s('line', { x1: x(i), x2: x(i), y1: top, y2: height - bottom, class: 'cross-line' }));
      for (const se of opts.series) cross.append(s('circle', { cx: x(i), cy: y(se.values[i] ?? 0), r: 4, class: `dot s${se.slot}` }));
      tip.show(x(i), 0, width, tipContent(opts, i, 'line'));
    });
  });
}

/** Barra con el extremo de datos redondeado (4px) y recta en la base. */
function barPath(x: number, w: number, y0: number, y1: number): string {
  const up = y1 < y0;
  const hgt = Math.abs(y0 - y1);
  const r = Math.min(4, w / 2, hgt);
  if (up) {
    return `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + r}V${y0}Z`;
  }
  return `M${x},${y0}V${y1 - r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 - r}V${y0}Z`;
}

export function barChart(opts: ChartOptions): HTMLElement {
  return frame(opts, 'bar', (width, plot) => {
    const height = opts.height ?? 200;
    const n = opts.labels.length;
    const k = opts.series.length;
    const all = opts.series.flatMap((se) => se.values);
    const ticks = niceTicks(Math.min(0, ...all), Math.max(0, ...all));
    const lo = ticks[0]!;
    const hi = ticks[ticks.length - 1]!;
    const left = Math.max(...ticks.map((v) => textWidth(opts.axisFormat(v), AXIS_PX))) + 12;
    const right = 8;
    const top = 12;
    const bottom = 26;
    const band = (width - left - right) / n;
    const gap = 2;
    const barW = Math.max(3, Math.min(24, (band * 0.7 - gap * (k - 1)) / k));
    const groupW = barW * k + gap * (k - 1);
    const x = (i: number) => left + band * i + band / 2;
    const y = linear(lo, hi, height - bottom, top);

    const svg = s('svg', { width, height, viewBox: `0 0 ${width} ${height}`, 'aria-hidden': 'true', focusable: 'false' });
    svg.append(yGrid(ticks, y, left, width - right, opts.axisFormat));
    const hover = s('rect', { class: 'hover-band', y: top, height: height - bottom - top, width: band, visibility: 'hidden' });
    svg.append(hover);
    svg.append(xLabels(opts.labels, x, height - 8, width < 420 ? 2 : 1));

    for (let i = 0; i < n; i++) {
      const gx = x(i) - groupW / 2;
      opts.series.forEach((se, j) => {
        const v = se.values[i] ?? 0;
        if (v === 0) return;
        svg.append(s('path', { d: barPath(gx + j * (barW + gap), barW, y(0), y(v)), class: `bar s${se.slot}` }));
      });
    }

    const tip = tooltipBox();
    plot.replaceChildren(svg, tip.el);
    interact(plot, svg, n, x, (i) => {
      if (i === null) {
        hover.setAttribute('visibility', 'hidden');
        tip.hide();
        return;
      }
      hover.setAttribute('x', String(x(i) - band / 2));
      hover.setAttribute('visibility', 'visible');
      tip.show(x(i), 0, width, tipContent(opts, i, 'bar'));
    });
  });
}
