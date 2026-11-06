/** Piezas de interfaz reutilizables. */

import { fmtMoney, fmtNumber } from '../i18n';
import { h, type Child } from './dom';
import { icon, type IconName } from './icons';

export function card(opts: { title?: string; sub?: string; id?: string; className?: string; actions?: Child }, ...children: Child[]): HTMLElement {
  const headingId = opts.id ? `${opts.id}-title` : undefined;
  return h(
    'section',
    { class: `card ${opts.className ?? ''}`.trim(), id: opts.id, 'aria-labelledby': headingId },
    opts.title || opts.actions
      ? h(
          'div',
          { class: 'card-head' },
          h('div', { class: 'card-titles' }, opts.title ? h('h2', { id: headingId }, opts.title) : null, opts.sub ? h('p', { class: 'sub' }, opts.sub) : null),
          opts.actions ? h('div', { class: 'card-actions' }, opts.actions) : null,
        )
      : null,
    children,
  );
}

export type ButtonKind = 'primary' | 'secondary' | 'ghost' | 'danger';

export function button(
  label: string,
  opts: { icon?: IconName; kind?: ButtonKind; onClick?: (ev: Event) => void; type?: 'button' | 'submit'; iconOnly?: boolean; ariaLabel?: string; className?: string; focusKey?: string } = {},
): HTMLButtonElement {
  const kind = opts.kind ?? 'secondary';
  return h(
    'button',
    {
      type: opts.type ?? 'button',
      class: `btn btn-${kind}${opts.iconOnly ? ' btn-icon' : ''} ${opts.className ?? ''}`.trim(),
      onclick: opts.onClick,
      'aria-label': opts.iconOnly ? (opts.ariaLabel ?? label) : opts.ariaLabel,
      title: opts.iconOnly ? label : undefined,
      'data-focus-key': opts.focusKey,
    },
    opts.icon ? icon(opts.icon, 20) : null,
    opts.iconOnly ? null : h('span', null, label),
  );
}

export type ChipTone = 'neutral' | 'accent' | 'estimated' | 'income' | 'expense' | 'saving' | 'payment' | 'entry';

export function chip(text: string, tone: ChipTone = 'neutral'): HTMLElement {
  return h('span', { class: `chip chip-${tone}` }, text);
}

/** Importe con cifras tabulares; los negativos en rojo ladrillo. */
export function money(n: number, opts: { sign?: boolean; plain?: boolean; tone?: 'auto' | 'none' } = {}): HTMLElement {
  const text = opts.plain ? fmtNumber(n, opts) : fmtMoney(n, opts);
  const neg = (opts.tone ?? 'auto') === 'auto' && n < 0;
  return h('span', { class: `num${neg ? ' neg' : ''}` }, text);
}

export function kpi(label: string, value: number, opts: { hint?: string; tone?: 'accent' | 'default' } = {}): HTMLElement {
  return h(
    'div',
    { class: `kpi${opts.tone === 'accent' ? ' kpi-accent' : ''}` },
    h('p', { class: 'kpi-label' }, label),
    h('p', { class: 'kpi-value' }, money(value)),
    opts.hint ? h('p', { class: 'kpi-hint' }, opts.hint) : null,
  );
}

export function empty(text: string): HTMLElement {
  return h('p', { class: 'empty' }, text);
}

export function pageHeader(title: string, sub?: Child): HTMLElement {
  return h('div', { class: 'page-head' }, h('h1', { class: 'page-title', tabindex: '-1' }, title), sub ? h('p', { class: 'sub' }, sub) : null);
}
