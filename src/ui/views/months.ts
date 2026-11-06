/** Un mes: cuadrícula de partidas por cuenta, saldos reales y apuntes. */

import { computeYear, entriesOfMonth, type Line, type LineType, type MonthResult } from '../../calc/engine';
import { monthKey, todayISO } from '../../calc/keys';
import { parseAmount, sum } from '../../calc/money';
import { setRealBalance } from '../../calc/mutations';
import { fmtDate, fmtInput, fmtMoney, fmtNumber, fmtYearMonth, monthName, t, type MessageKey } from '../../i18n';
import { button, card, chip, empty, kpi, money } from '../components';
import type { Ctx } from '../context';
import { h, uid } from '../dom';
import { editEntry, editOverride } from '../forms';
import { icon } from '../icons';

/** Mes que se abre por defecto: el actual si es el año planificado; si no, enero. */
export function defaultMonth(year: number): number {
  const today = todayISO();
  return today.startsWith(`${year}-`) ? Number(today.slice(5, 7)) : 1;
}

export function monthsView(ctx: Ctx, param: string | undefined): HTMLElement {
  const { config } = ctx.data;
  let month = defaultMonth(config.year);
  if (param && /^\d{4}-\d{2}$/.test(param) && Number(param.slice(0, 4)) === config.year) {
    const m = Number(param.slice(5, 7));
    if (m >= 1 && m <= 12) month = m;
  }
  const year = computeYear(ctx.data);
  const result = year.months[month - 1]!;
  const ym = monthKey(config.year, month);

  return h(
    'div',
    { class: 'view view-months' },
    monthNav(ctx, config.year, month),
    h(
      'div',
      { class: 'kpis kpis-4' },
      kpi(t('kpi.income'), result.income),
      kpi(t('kpi.spending'), result.spending),
      kpi(t('kpi.saved'), result.saved),
      kpi(t('kpi.leftover'), result.leftover, { tone: 'accent' }),
    ),
    planCard(ctx, result, month),
    realCard(ctx, result, ym),
    entriesCard(ctx, ym),
  );
}

function monthNav(ctx: Ctx, year: number, month: number): HTMLElement {
  const go = (m: number) => ctx.go(`#/meses/${monthKey(year, m)}`);
  const selectId = uid('month');
  return h(
    'div',
    { class: 'page-head month-nav' },
    h('h1', { class: 'page-title', tabindex: '-1' }, fmtYearMonth(monthKey(year, month))),
    h(
      'div',
      { class: 'month-switch' },
      button(t('months.prev'), { icon: 'prev', iconOnly: true, kind: 'secondary', focusKey: 'month-prev', onClick: () => go(month - 1), className: month === 1 ? 'is-hidden' : '' }),
      h('label', { for: selectId, class: 'visually-hidden' }, t('months.pick')),
      h(
        'select',
        { id: selectId, class: 'month-select', 'data-focus-key': 'month-select', onchange: (ev: Event) => go(Number((ev.target as HTMLSelectElement).value)) },
        Array.from({ length: 12 }, (_, i) => h('option', { value: i + 1, selected: i + 1 === month }, monthName(i + 1))),
      ),
      button(t('months.next'), { icon: 'next', iconOnly: true, kind: 'secondary', focusKey: 'month-next', onClick: () => go(month + 1), className: month === 12 ? 'is-hidden' : '' }),
    ),
  );
}

const GROUPS: { type: LineType | 'entry'; label: MessageKey }[] = [
  { type: 'Ingreso', label: 'months.group.Ingreso' },
  { type: 'Gasto', label: 'months.group.Gasto' },
  { type: 'Pago', label: 'months.group.Pago' },
  { type: 'Ahorro', label: 'months.group.Ahorro' },
  { type: 'entry', label: 'months.group.entry' },
];

function groupOf(line: Line): LineType | 'entry' {
  return line.kind === 'entry' ? 'entry' : line.type;
}

function planCard(ctx: Ctx, m: MonthResult, month: number): HTMLElement {
  const accounts = ctx.data.config.accounts;
  const several = accounts.length > 1;
  const cols = accounts.length + (several ? 1 : 0);

  const numCell = (value: number, opts: { strong?: boolean; muted?: boolean } = {}) =>
    h('td', { class: `n${opts.strong ? ' strong' : ''}${opts.muted ? ' muted' : ''}` }, money(value, { plain: true }));

  const rows: HTMLElement[] = [];

  // Saldo inicial
  rows.push(
    h(
      'tr',
      { class: 'row-sum row-start' },
      h('th', { scope: 'row' }, t('months.row.start')),
      accounts.map((_, c) =>
        h(
          'td',
          { class: 'n' },
          money(m.start[c] ?? 0, { plain: true }),
          m.startSource[c] === 'real' ? h('span', { class: 'mark-real', title: t('months.row.start.real', { month: monthName(month - 1) }) }, ` · ${t('chip.real')}`) : null,
        ),
      ),
      several ? numCell(sum(m.start)) : null,
    ),
  );

  for (const group of GROUPS) {
    const lines = m.lines.filter((l) => groupOf(l) === group.type);
    if (lines.length === 0) continue;
    rows.push(h('tr', { class: 'row-group' }, h('th', { scope: 'rowgroup', colspan: 1 + cols }, t(group.label))));
    for (const line of lines) rows.push(lineRow(ctx, line, month, several));
  }

  if (m.lines.length === 0) {
    rows.push(h('tr', null, h('td', { colspan: 1 + cols, class: 'empty-cell' }, t('months.empty'))));
  }

  rows.push(
    h('tr', { class: 'row-sum' }, h('th', { scope: 'row' }, t('months.row.total')), m.delta.map((v) => numCell(v)), several ? numCell(sum(m.delta)) : null),
    h('tr', { class: 'row-sum row-end' }, h('th', { scope: 'row' }, t('months.row.end')), m.end.map((v) => numCell(v, { strong: true })), several ? numCell(sum(m.end), { strong: true }) : null),
  );

  return card(
    { title: t('months.plan'), sub: t('months.plan.sub'), id: 'plan' },
    h(
      'div',
      { class: 'table-wrap', 'data-scroll-key': 'plan' },
      h(
        'table',
        { class: 'grid-table plan-table' },
        h(
          'thead',
          null,
          h(
            'tr',
            null,
            h('th', { scope: 'col' }, t('months.col.item')),
            accounts.map((a) => h('th', { scope: 'col', class: 'n' }, a.name)),
            several ? h('th', { scope: 'col', class: 'n' }, t('months.col.total')) : null,
          ),
        ),
        h('tbody', null, rows),
      ),
    ),
    h('p', { class: 'field-hint' }, t('months.amountsIn')),
  );
}

function lineRow(ctx: Ctx, line: Line, month: number, several: boolean): HTMLElement {
  const accounts = ctx.data.config.accounts;
  const marks = [
    line.estimated ? chip(t('chip.estimated'), 'estimated') : null,
    line.overridden ? chip(t('chip.changed'), 'accent') : null,
  ];
  const label = `${line.name}: ${fmtMoney(line.amount)}`;
  return h(
    'tr',
    { class: `row-line${line.amount === 0 ? ' is-zero' : ''}` },
    h('th', { scope: 'row' }, h('span', { class: 'line-name' }, line.name), marks),
    accounts.map((_, c) => {
      const delta = line.deltas[c] ?? 0;
      const involved = delta !== 0 || line.account === c || line.to === c;
      if (!involved) return h('td', { class: 'n' });
      // En un traspaso, la cuenta destino suma y la de origen resta.
      const shown = delta !== 0 ? delta : line.to === c ? line.amount : line.type === 'Ingreso' ? line.amount : -line.amount;
      return h(
        'td',
        { class: 'n' },
        h(
          'button',
          {
            type: 'button',
            class: `cell-btn${shown < 0 ? ' neg' : ''}${line.overridden ? ' is-changed' : ''}`,
            'aria-label': `${t('action.edit')} ${label}`,
            'data-focus-key': `cell-${line.kind}-${line.index}-${c}`,
            onclick: () => editOverride(ctx, line, month),
          },
          fmtNumber(shown, { sign: true }),
        ),
      );
    }),
    several ? h('td', { class: 'n muted' }, money(sum(line.deltas), { plain: true, tone: 'none' })) : null,
  );
}

function realCard(ctx: Ctx, m: MonthResult, ym: string): HTMLElement {
  const accounts = ctx.data.config.accounts;
  const rows = accounts.map((a, c) => {
    const id = uid('real');
    const errId = `${id}-err`;
    const input = h('input', {
      id,
      type: 'text',
      inputmode: 'decimal',
      autocomplete: 'off',
      class: 'num-input',
      placeholder: t('real.placeholder'),
      enterkeyhint: 'done',
      'aria-describedby': `${id}-planned ${errId}`,
      'data-focus-key': `real-${c}`,
    });
    const real = m.real[c];
    input.value = real === null || real === undefined ? '' : fmtInput(real);
    const error = h('p', { class: 'field-error', id: errId, hidden: true }, t('field.badAmount'));
    const save = () => {
      const text = input.value.trim();
      const value = text === '' ? null : parseAmount(text);
      if (text !== '' && value === null) {
        error.hidden = false;
        input.setAttribute('aria-invalid', 'true');
        return;
      }
      error.hidden = true;
      input.removeAttribute('aria-invalid');
      if (value === (real ?? null)) return;
      ctx.commit(setRealBalance(ctx.data, ym, c, value));
    };
    input.addEventListener('change', save);
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        input.blur();
      }
    });
    const diff = m.diff[c];
    return h(
      'div',
      { class: 'real-row' },
      h('label', { for: id, class: 'real-name' }, a.name),
      h('p', { class: 'real-planned', id: `${id}-planned` }, h('span', { class: 'muted' }, `${t('real.planned')} `), money(m.end[c] ?? 0)),
      h('div', { class: 'amount-wrap real-input' }, input, h('span', { class: 'amount-unit', 'aria-hidden': 'true' }, '€')),
      h(
        'p',
        { class: 'real-diff' },
        h('span', { class: 'muted' }, `${t('real.diff')} `),
        diff === null || diff === undefined ? h('span', { class: 'muted' }, t('real.none')) : money(diff, { sign: true }),
      ),
      error,
    );
  });
  return card({ title: t('real.title'), sub: t('real.sub'), id: 'real' }, h('div', { class: 'real-list' }, rows));
}

function entriesCard(ctx: Ctx, ym: string): HTMLElement {
  const accounts = ctx.data.config.accounts;
  const list = entriesOfMonth(ctx.data.entries, ym);
  const add = button(t('entries.add'), { icon: 'plus', kind: 'primary', focusKey: 'add-entry', onClick: () => editEntry(ctx, ym, null) });
  return card(
    { title: t('entries.title'), sub: t('entries.sub'), id: 'entries', actions: add },
    list.length === 0
      ? empty(t('entries.empty'))
      : h(
          'ul',
          { class: 'rows' },
          list.map(({ entry }) =>
            h(
              'li',
              null,
              h(
                'button',
                { type: 'button', class: 'row-btn', 'data-focus-key': `entry-${entry.id}`, onclick: () => editEntry(ctx, ym, entry.id) },
                h(
                  'span',
                  { class: 'row-main' },
                  h('span', { class: 'row-title' }, entry.concept),
                  h(
                    'span',
                    { class: 'row-sub' },
                    [entry.date ? fmtDate(entry.date, { weekday: true }) : null, accounts.length > 1 ? (accounts[entry.account]?.name ?? '') : null, entry.note || null]
                      .filter(Boolean)
                      .join(' · '),
                  ),
                ),
                money(entry.type === 'Ingreso' ? entry.amount : -entry.amount, { sign: true }),
                icon('edit', 18),
              ),
            ),
          ),
        ),
  );
}
