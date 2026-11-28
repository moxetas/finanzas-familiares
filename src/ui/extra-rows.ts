/**
 * Filas libres y fila «Traspaso» de la tabla de un mes (año planificado y años
 * anteriores), y la tabla aparte de los cargos de la tarjeta de crédito.
 */

import { CARD_SLOT0, type ExtraRow, type MonthExtras } from '../calc/extras';
import { fmtNumber, fmtYearMonth, t } from '../i18n';
import { card, chip, money } from './components';
import type { Ctx } from './context';
import { h } from './dom';
import { editExtraCell, editFreeLabel, extraRowName } from './forms';

interface Opts {
  ym: string;
  /** Nombre de cada columna (para el título de la ventana). */
  colNames: string[];
  /** Añadir columna de total y/o de notas al final de cada fila. */
  totalCol: boolean;
  noteCol: boolean;
  /** Orden en que se ven las columnas (índices). Sin él, el de los datos. */
  order?: number[];
}

/** Celdas de una fila en el orden en que se ven las columnas. */
function cells(ctx: Ctx, o: Opts, values: (number | null)[], slot: number | null, rowName: string): HTMLElement[] {
  const order = o.order ?? values.map((_, c) => c);
  return order.map((c) => cell(ctx, o, values[c] ?? null, c, slot, rowName));
}

function cell(ctx: Ctx, o: Opts, value: number | null, col: number, slot: number | null, rowName: string): HTMLElement {
  const title = `${rowName} · ${o.colNames[col] ?? ''} · ${fmtYearMonth(o.ym)}`;
  return h(
    'td',
    { class: 'n' },
    h(
      'button',
      {
        type: 'button',
        class: `cell-btn${(value ?? 0) < 0 ? ' neg' : ''}${value === null ? ' is-empty' : ''}`,
        'aria-label': `${t('action.edit')} ${title}`,
        'data-focus-key': `x-${slot ?? 't'}-${col}`,
        onclick: () => editExtraCell(ctx, { ym: o.ym, col, slot, title, current: value }),
      },
      value === null ? '–' : fmtNumber(value, { sign: true }),
    ),
  );
}

const rowTotal = (values: (number | null)[]) => Math.round(values.reduce<number>((s, v) => s + (v ?? 0), 0) * 100) / 100;

/** Filas extra con nombre (las libres, o las de la tarjeta desde la fila `slot0`). */
function namedRows(ctx: Ctx, rows: ExtraRow[], slot0: number, o: Opts): HTMLElement[] {
  return rows.map((row, i) => {
    const slot = slot0 + i;
    const placeholder = extraRowName(slot);
    return h(
      'tr',
      { class: 'row-line row-free' },
      h(
        'th',
        { scope: 'row' },
        h(
          'button',
          {
            type: 'button',
            class: `label-btn${row.label ? '' : ' is-empty'}`,
            'data-focus-key': `x-label-${slot}`,
            'aria-label': `${t('extras.rename')}: ${row.label || placeholder}`,
            onclick: () => editFreeLabel(ctx, o.ym, slot, row.label),
          },
          row.label || placeholder,
        ),
      ),
      cells(ctx, o, row.values, slot, row.label || placeholder),
      o.totalCol ? h('td', { class: 'n muted' }, row.values.some((v) => v !== null) ? money(rowTotal(row.values), { plain: true, tone: 'none' }) : null) : null,
      o.noteCol ? h('td', { class: 'note-cell' }) : null,
    );
  });
}

export function freeRows(ctx: Ctx, extras: MonthExtras, o: Opts): HTMLElement[] {
  return namedRows(ctx, extras.free, 0, o);
}

/**
 * Tabla de los cargos de la tarjeta de crédito del mes (Netflix, Amazon Prime…),
 * con las mismas columnas que la del mes. Arriba, las domiciliaciones que se
 * cargan en la tarjeta (salen solas); debajo, 5 filas para apuntar a mano.
 * Es solo para verlo: no cuenta en el total del mes.
 */
export function cardTable(ctx: Ctx, extras: MonthExtras, o: Opts & { head: HTMLElement }): HTMLElement {
  const order = o.order ?? o.colNames.map((_, c) => c);
  const auto = extras.auto ?? [];
  const all = [...auto, ...extras.card];
  const totals = order.map((c) => rowTotal(all.map((r) => r.values[c] ?? null)));
  const used = all.some((r) => r.values.some((v) => v !== null));
  const autoRows = auto.map((row) =>
    h(
      'tr',
      { class: 'row-line row-card-dom' },
      h('th', { scope: 'row' }, h('span', { class: 'line-name' }, row.label), chip(t('extras.card.dom'), 'accent')),
      order.map((c) => {
        const v = row.values[c] ?? null;
        return h('td', { class: `n${(v ?? 0) < 0 ? ' neg' : ''}` }, v === null ? null : fmtNumber(v, { sign: true }));
      }),
      o.totalCol ? h('td', { class: 'n muted' }, money(rowTotal(row.values), { plain: true, tone: 'none' })) : null,
    ),
  );
  const totalRow = h(
    'tr',
    { class: 'row-sum' },
    h('th', { scope: 'row' }, t('summary.total')),
    totals.map((v) => h('td', { class: `n${v < 0 ? ' neg' : ''}` }, v !== 0 ? fmtNumber(v, { sign: true }) : '–')),
    o.totalCol ? h('td', { class: 'n' }, used ? money(rowTotal(totals), { plain: true }) : null) : null,
  );
  const table = h(
    'table',
    { class: 'grid-table plan-table card-table' },
    h('thead', null, o.head),
    h('tbody', null, autoRows, namedRows(ctx, extras.card, CARD_SLOT0, { ...o, noteCol: false }), totalRow),
  );
  return card(
    { title: t('extras.card.title'), sub: t('extras.card.sub'), id: 'card-charges' },
    h('div', { class: 'table-wrap', 'data-scroll-key': 'card-charges' }, table),
  );
}

export function transferRow(ctx: Ctx, extras: MonthExtras, o: Opts): HTMLElement {
  const total = rowTotal(extras.transfer);
  const used = extras.transfer.some((v) => v !== null);
  return h(
    'tr',
    { class: 'row-line row-transfer' },
    h('th', { scope: 'row' }, h('span', { class: 'line-name' }, t('extras.transfer'))),
    cells(ctx, o, extras.transfer, null, t('extras.transfer')),
    // Si lo que sale no es igual a lo que entra, se marca para que se vea.
    o.totalCol ? h('td', { class: `n${used && total !== 0 ? ' neg' : ' muted'}`, title: used && total !== 0 ? t('extras.transfer.unbalanced') : undefined }, used ? money(total, { plain: true, tone: 'none' }) : null) : null,
    o.noteCol ? h('td', { class: 'note-cell' }, used && total !== 0 ? t('extras.transfer.unbalanced') : '') : null,
  );
}
