/** Un mes: cuadrícula de partidas por cuenta, saldos reales y apuntes. */

import { computeYear, entriesOfMonth, type Line, type LineType, type MonthResult } from '../../calc/engine';
import { historyCellKey, monthKey, todayISO } from '../../calc/keys';
import { parseAmount, sum } from '../../calc/money';
import { setRealBalance } from '../../calc/mutations';
import { fmtDate, fmtInput, fmtMoney, fmtNumber, fmtYearMonth, monthName, t, type MessageKey } from '../../i18n';
import { button, card, chip, empty, kpi, money } from '../components';
import type { Ctx } from '../context';
import { h, uid } from '../dom';
import { editEntry, editHistoryCell, editOverride } from '../forms';
import { icon } from '../icons';
import { signButtons } from '../fields';
import { extrasEffect, isFreeRowsAnchor, monthExtras } from '../../calc/extras';
import { freeRows, transferRow } from '../extra-rows';

/** Meses de años anteriores guardados en `history`, ordenados: `["2026-02", …]`. */
export function historyKeys(ctx: Ctx): string[] {
  return Object.keys(ctx.data.history ?? {}).sort();
}

/** Mes que se abre por defecto: el de hoy si existe (en el año planificado o en el historial); si no, enero. */
export function defaultMonthKey(ctx: Ctx): string {
  const today = todayISO();
  const ym = today.slice(0, 7);
  const { year } = ctx.data.config;
  if (today.startsWith(`${year}-`) || ctx.data.history?.[ym]) return ym;
  return monthKey(year, 1);
}

export function defaultMonth(year: number): number {
  const today = todayISO();
  return today.startsWith(`${year}-`) ? Number(today.slice(5, 7)) : 1;
}

export function monthsView(ctx: Ctx, param: string | undefined): HTMLElement {
  const { config } = ctx.data;
  let ym = defaultMonthKey(ctx);
  if (param && /^\d{4}-(0[1-9]|1[0-2])$/.test(param)) {
    const y = Number(param.slice(0, 4));
    if (y === config.year || ctx.data.history?.[param]) ym = param;
  }
  if (Number(ym.slice(0, 4)) !== config.year) return historyView(ctx, ym);

  const month = Number(ym.slice(5, 7));
  const year = computeYear(ctx.data);
  const result = year.months[month - 1]!;

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

/** Un mes de un año anterior, tal como estaba en la hoja. Las cifras se pueden cambiar. */
function historyView(ctx: Ctx, ym: string): HTMLElement {
  const m = ctx.data.history![ym]!;
  const { overrides, real_balances } = ctx.data;
  const edited = m.rows.map((r, ri) => r.v.map((orig, ci) => overrides[historyCellKey(ym, ri, ci)] ?? orig));
  const extras = monthExtras(ctx.data, ym, m.cols.length);
  const effect = extrasEffect(extras);
  const tot = m.tot.map((base, ci) => {
    let v = (base ?? 0) + (effect.delta[ci] ?? 0);
    m.rows.forEach((r, ri) => {
      const o = overrides[historyCellKey(ym, ri, ci)];
      if (o !== undefined) v += o - (r.v[ci] ?? 0);
    });
    return Math.round(v * 100) / 100;
  });
  const cell = (value: number | null, ri: number, ci: number, label: string) => {
    const changed = overrides[historyCellKey(ym, ri, ci)] !== undefined;
    return h(
      'td',
      { class: 'n' },
      h(
        'button',
        {
          type: 'button',
          class: `cell-btn${(value ?? 0) < 0 ? ' neg' : ''}${changed ? ' is-changed' : ''}`,
          'aria-label': `${t('action.edit')} ${label}`,
          'data-focus-key': `hcell-${ri}-${ci}`,
          onclick: () => editHistoryCell(ctx, ym, ri, ci, label),
        },
        value === null || Math.abs(value) < 0.005 ? '–' : fmtNumber(value, { sign: true }),
      ),
    );
  };
  // Filas del mes; las libres van delante de la partida elegida en Ajustes (o al final) y el traspaso al final.
  const extraOpts = { ym, colNames: m.cols, totalCol: false, noteCol: false };
  const historyBody = () => {
    const out: HTMLElement[] = [];
    let placed = false;
    m.rows.forEach((r, ri) => {
      if (!placed && isFreeRowsAnchor(r.l, ctx.data.config.freeRowsBefore)) {
        out.push(...freeRows(ctx, extras, extraOpts));
        placed = true;
      }
      out.push(h('tr', { class: 'row-line' }, h('th', { scope: 'row' }, h('span', { class: 'line-name' }, r.l)), edited[ri]!.map((v, ci) => cell(v, ri, ci, `${r.l} · ${m.cols[ci]}`))));
    });
    if (!placed) out.push(...freeRows(ctx, extras, extraOpts));
    out.push(transferRow(ctx, extras, extraOpts));
    return out;
  };
  const table = h(
    'table',
    { class: 'grid-table plan-table' },
    h('thead', null, h('tr', null, h('th', { scope: 'col' }, t('months.col.item')), m.cols.map((c) => h('th', { scope: 'col', class: 'n' }, c)))),
    h(
      'tbody',
      null,
      historyBody(),
      h('tr', { class: 'row-sum row-end' }, h('th', { scope: 'row' }, t('months.row.total')), tot.map((v) => h('td', { class: 'n strong' }, money(v, { plain: true })))),
    ),
  );
  const fake: MonthResult = {
    month: Number(ym.slice(5, 7)),
    key: ym,
    lines: [],
    start: [],
    startSource: [],
    delta: [],
    end: ctx.data.config.accounts.map(() => 0),
    real: ctx.data.config.accounts.map((_, c) => real_balances[`${ym}_c${c}`] ?? null),
    diff: ctx.data.config.accounts.map(() => null),
    closing: [],
    income: 0,
    spending: 0,
    saved: 0,
    leftover: 0,
    totalClosing: 0,
    debts: [],
    extras,
  };
  return h(
    'div',
    { class: 'view view-months' },
    monthNav(ctx, Number(ym.slice(0, 4)), Number(ym.slice(5, 7))),
    card(
      { title: m.title, sub: t('months.history.sub'), id: 'plan' },
      h('div', { class: 'table-wrap', 'data-scroll-key': 'plan' }, table),
      h('p', { class: 'field-hint' }, t('months.amountsIn')),
    ),
    realCard(ctx, fake, ym, { planned: false }),
    entriesCard(ctx, ym),
  );
}

function monthNav(ctx: Ctx, year: number, month: number): HTMLElement {
  const go = (ym: string) => ctx.go(`#/meses/${ym}`);
  const selectId = uid('month');
  const hist = historyKeys(ctx);
  const inHistory = year !== ctx.data.config.year;
  // Meses disponibles en el año que se está viendo.
  const available = inHistory ? hist.filter((k) => k.startsWith(`${year}-`)).map((k) => Number(k.slice(5, 7))) : Array.from({ length: 12 }, (_, i) => i + 1);
  const pos = available.indexOf(month);
  const prev = pos > 0 ? available[pos - 1]! : null;
  const next = pos >= 0 && pos < available.length - 1 ? available[pos + 1]! : null;
  const years = [...new Set([...hist.map((k) => Number(k.slice(0, 4))), ctx.data.config.year])].sort();
  const yearSwitch =
    years.length > 1
      ? h(
          'div',
          { class: 'segmented year-tabs', role: 'group', 'aria-label': t('months.year') },
          years.map((y) =>
            h(
              'button',
              {
                type: 'button',
                class: 'seg-btn',
                'aria-pressed': String(y === year),
                'data-focus-key': `year-${y}`,
                onclick: () => {
                  if (y === year) return;
                  const prefer = hist.filter((k) => k.startsWith(`${y}-`));
                  const same = monthKey(y, month);
                  go(y === ctx.data.config.year ? same : prefer.includes(same) ? same : (prefer[prefer.length - 1] ?? same));
                },
              },
              String(y),
            ),
          ),
        )
      : null;
  return h(
    'div',
    { class: 'page-head month-nav' },
    h('h1', { class: 'page-title', tabindex: '-1' }, fmtYearMonth(monthKey(year, month))),
    yearSwitch,
    h(
      'div',
      { class: 'month-switch' },
      button(t('months.prev'), { icon: 'prev', iconOnly: true, kind: 'secondary', focusKey: 'month-prev', onClick: () => prev && go(monthKey(year, prev)), className: prev === null ? 'is-hidden' : '' }),
      h('label', { for: selectId, class: 'visually-hidden' }, t('months.pick')),
      h(
        'select',
        { id: selectId, class: 'month-select', 'data-focus-key': 'month-select', onchange: (ev: Event) => go(monthKey(year, Number((ev.target as HTMLSelectElement).value))) },
        available.map((m) => h('option', { value: m, selected: m === month }, monthName(m))),
      ),
      button(t('months.next'), { icon: 'next', iconOnly: true, kind: 'secondary', focusKey: 'month-next', onClick: () => next && go(monthKey(year, next)), className: next === null ? 'is-hidden' : '' }),
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
  if (line.toSpent) return 'Gasto';
  return line.kind === 'entry' ? 'entry' : line.type;
}

function planCard(ctx: Ctx, m: MonthResult, month: number): HTMLElement {
  const accounts = ctx.data.config.accounts;
  const several = accounts.length > 1;
  const cols = accounts.length + (several ? 1 : 0);
  const hasNotes = m.lines.some((l) => l.note !== '' && l.kind !== 'entry');
  const span = 1 + cols + (hasNotes ? 1 : 0);
  const noteCell = (text = '') => (hasNotes ? h('td', { class: 'note-cell' }, text) : null);

  const numCell = (value: number, opts: { strong?: boolean; muted?: boolean } = {}) =>
    h('td', { class: `n${opts.strong ? ' strong' : ''}${opts.muted ? ' muted' : ''}` }, money(value, { plain: true }));

  const rows: HTMLElement[] = [];

  // Saldo inicial
  rows.push(
    h(
      'tr',
      { class: 'row-sum row-start' },
      h('th', { scope: 'row' }, t('months.row.start')),
      accounts.map((a, c) =>
        h(
          'td',
          { class: 'n' },
          a.spent ? null : money(m.start[c] ?? 0, { plain: true }),
          !a.spent && m.startSource[c] === 'real' ? h('span', { class: 'mark-real', title: t('months.row.start.real', { month: monthName(month === 1 ? 12 : month - 1) }) }, ` · ${t('chip.real')}`) : null,
        ),
      ),
      several ? numCell(sum(m.start)) : null,
      noteCell(),
    ),
  );

  // Deudas que bajan con los pagos del año (p. ej. una tarjeta)
  for (const debt of m.debts) {
    rows.push(
      h(
        'tr',
        { class: 'row-sum' },
        h('th', { scope: 'row' }, debt.name),
        accounts.map((_, c) => (c === debt.account ? h('td', { class: `n${debt.remaining > 0 ? ' neg' : ''}` }, debt.remaining > 0 ? `−${fmtNumber(debt.remaining)}` : '–') : h('td', { class: 'n' }))),
        several ? h('td', { class: 'n' }) : null,
        noteCell(debt.note),
      ),
    );
  }

  const extraOpts = { ym: m.key, colNames: accounts.map((a) => a.name), totalCol: several, noteCol: hasNotes };
  let freePlaced = false;
  const sectionRows = (label: string, lines: Line[]) => {
    if (lines.length === 0) return;
    rows.push(h('tr', { class: 'row-group' }, h('th', { scope: 'rowgroup', colspan: span }, label)));
    for (const line of lines) {
      if (!freePlaced && line.kind !== 'entry' && isFreeRowsAnchor(line.name, ctx.data.config.freeRowsBefore)) {
        rows.push(...freeRows(ctx, m.extras, extraOpts));
        freePlaced = true;
      }
      rows.push(lineRow(ctx, line, month, several, hasNotes));
    }
  };

  const sections = ctx.data.config.sections ?? [];
  for (const name of sections) sectionRows(name, m.lines.filter((l) => l.group === name));
  const rest = m.lines.filter((l) => !sections.includes(l.group));
  for (const group of GROUPS) {
    sectionRows(
      t(group.label),
      rest.filter((l) => groupOf(l) === group.type),
    );
  }

  if (m.lines.length === 0) {
    rows.push(h('tr', null, h('td', { colspan: span, class: 'empty-cell' }, t('months.empty'))));
  }
  if (!freePlaced) rows.push(...freeRows(ctx, m.extras, extraOpts));
  rows.push(transferRow(ctx, m.extras, extraOpts));

  rows.push(
    h('tr', { class: 'row-sum' }, h('th', { scope: 'row' }, t('months.row.total')), m.delta.map((v) => numCell(v)), several ? numCell(sum(m.delta)) : null, noteCell()),
    h(
      'tr',
      { class: 'row-sum row-end' },
      h('th', { scope: 'row' }, t('months.row.end')),
      m.end.map((v, c) => (accounts[c]?.spent ? h('td', { class: 'n muted' }, t('months.spent')) : numCell(v, { strong: true }))),
      several ? numCell(sum(m.end), { strong: true }) : null,
      noteCell(),
    ),
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
            hasNotes ? h('th', { scope: 'col' }, t('months.col.note')) : null,
          ),
        ),
        h('tbody', null, rows),
      ),
    ),
    h('p', { class: 'field-hint' }, t('months.amountsIn')),
  );
}

function lineRow(ctx: Ctx, line: Line, month: number, several: boolean, hasNotes: boolean): HTMLElement {
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
    hasNotes ? h('td', { class: 'note-cell' }, line.note) : null,
  );
}

function realCard(ctx: Ctx, m: MonthResult, ym: string, opts: { planned?: boolean } = {}): HTMLElement {
  const planned = opts.planned !== false;
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
      planned ? h('p', { class: 'real-planned', id: `${id}-planned` }, h('span', { class: 'muted' }, `${t('real.planned')} `), money(m.end[c] ?? 0)) : h('p', { class: 'real-planned', id: `${id}-planned`, hidden: true }),
      h('div', { class: 'amount-row real-input' }, signButtons(input, () => { if (document.activeElement !== input) save(); }), h('div', { class: 'amount-wrap' }, input, h('span', { class: 'amount-unit', 'aria-hidden': 'true' }, '€'))),
      planned
        ? h(
            'p',
            { class: 'real-diff' },
            h('span', { class: 'muted' }, `${t('real.diff')} `),
            diff === null || diff === undefined ? h('span', { class: 'muted' }, t('real.none')) : money(diff, { sign: true }),
          )
        : null,
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
