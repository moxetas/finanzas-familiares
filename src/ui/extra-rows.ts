/** Filas libres y fila «Traspaso» de la tabla de un mes (año planificado y años anteriores). */

import type { MonthExtras } from '../calc/extras';
import { fmtNumber, fmtYearMonth, t } from '../i18n';
import { money } from './components';
import type { Ctx } from './context';
import { h } from './dom';
import { editExtraCell, editFreeLabel } from './forms';

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

export function freeRows(ctx: Ctx, extras: MonthExtras, o: Opts): HTMLElement[] {
  return extras.free.map((row, slot) => {
    const placeholder = t('extras.free', { n: slot + 1 });
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
