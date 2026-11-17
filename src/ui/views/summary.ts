/** Resumen del año: cifras clave, gráficos y tabla mes a mes. */

import { barChart, lineChart } from '../../charts/charts';
import type { Series } from '../../charts/common';
import { computeYear } from '../../calc/engine';
import { accountOrder, inOrder } from '../../calc/order';
import { fmtCompact, fmtMoney, monthName, t } from '../../i18n';
import { card, kpi, money, pageHeader } from '../components';
import type { Ctx } from '../context';
import { h } from '../dom';
import { backupNotice, installNotice } from '../notices';

/** Máximo de líneas a la vez: hay 6 colores de serie (no se inventan más). */
const MAX_SERIES = 6;
const TOTAL = '__total__';
const PICK_KEY = 'ff.balanceChart';

function readPick(): string[] | null {
  try {
    const v = JSON.parse(localStorage.getItem(PICK_KEY) ?? 'null') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : null;
  } catch {
    return null;
  }
}
function writePick(v: string[]): void {
  try {
    localStorage.setItem(PICK_KEY, JSON.stringify(v));
  } catch {
    /* sin localStorage: la elección dura hasta recargar */
  }
}

type Month = ReturnType<typeof computeYear>['months'][number];

/**
 * Saldo por cuenta, con botones para elegir qué líneas ver (cuentas y total).
 * La elección se guarda en este dispositivo, por nombre de cuenta.
 */
function balanceChart(ctx: Ctx, months: Month[], labels: string[], longLabels: string[]): HTMLElement {
  const { config } = ctx.data;
  const ordered = inOrder(config.accounts, accountOrder(config));
  const options = [...ordered.map(({ item, index }) => ({ id: item.name, label: item.name, index })), ...(ordered.length > 1 ? [{ id: TOTAL, label: t('summary.total'), index: -1 }] : [])];
  const valid = new Set(options.map((o) => o.id));
  const fallback = ordered.length <= MAX_SERIES ? ordered.map(({ item }) => item.name) : [TOTAL];
  const stored = readPick()?.filter((id) => valid.has(id)).slice(0, MAX_SERIES);
  let picked = new Set(stored && stored.length ? stored : fallback);

  const chartBox = h('div', null);
  const hint = h('p', { class: 'field-hint', role: 'status' });
  const buttons = options.map((o) =>
    h(
      'button',
      {
        type: 'button',
        class: 'pick-btn',
        'aria-pressed': String(picked.has(o.id)),
        onclick: (e: Event) => {
          const btn = e.currentTarget as HTMLButtonElement;
          const next = new Set(picked);
          if (next.has(o.id)) {
            if (next.size === 1) return void (hint.textContent = t('summary.pickOne'));
            next.delete(o.id);
          } else {
            if (next.size >= MAX_SERIES) return void (hint.textContent = t('summary.pickMax', { n: MAX_SERIES }));
            next.add(o.id);
          }
          picked = next;
          hint.textContent = '';
          btn.setAttribute('aria-pressed', String(picked.has(o.id)));
          writePick([...picked]);
          draw();
        },
      },
      o.label,
    ),
  );

  function draw(): void {
    const shown = options.filter((o) => picked.has(o.id));
    const series: Series[] = shown.map((o, k) => ({
      name: o.label,
      slot: k + 1,
      values: months.map((m) => (o.index < 0 ? m.totalClosing : (m.closing[o.index] ?? 0))),
    }));
    const showTotalInTip = !picked.has(TOTAL) && ordered.length > 1;
    chartBox.replaceChildren(
      lineChart({
        labels,
        longLabels,
        series,
        format: (v) => fmtMoney(v),
        axisFormat: fmtCompact,
        ariaLabel: `${t('summary.balanceChart')}. ${monthName(12)}: ${series.map((se) => `${se.name} ${fmtMoney(se.values[11] ?? 0)}`).join(', ')}.`,
        tipExtra: showTotalInTip ? (i) => [{ label: t('summary.total'), value: fmtMoney(months[i]!.totalClosing) }] : undefined,
      }),
    );
  }
  draw();

  if (options.length <= 1) return chartBox;
  return h(
    'div',
    null,
    h('p', { class: 'pick-label', id: 'balance-pick-label' }, t('summary.pick', { n: MAX_SERIES })),
    h('div', { class: 'pick-row', role: 'group', 'aria-labelledby': 'balance-pick-label' }, buttons),
    hint,
    chartBox,
  );
}

export function summaryView(ctx: Ctx): HTMLElement {
  const { config } = ctx.data;
  const year = computeYear(ctx.data);
  const months = year.months;
  const labels = months.map((m) => monthName(m.month, 'short'));
  const longLabels = months.map((m) => `${monthName(m.month)} ${config.year}`);

  const kpis = h(
    'div',
    { class: 'kpis' },
    kpi(t('kpi.endOfYear'), year.totals.endOfYear, { tone: 'accent', hint: t('kpi.startOfYear', { amount: fmtMoney(year.totals.startOfYear) }) }),
    kpi(t('kpi.income'), year.totals.income),
    kpi(t('kpi.spending'), year.totals.spending, { hint: t('kpi.spending.hint') }),
    kpi(t('kpi.saved'), year.totals.saved),
    kpi(t('kpi.leftover'), year.totals.leftover),
  );

  const balance = card(
    { title: t('summary.balanceChart'), sub: t('summary.balanceChart.sub'), id: 'chart-balance' },
    balanceChart(ctx, months, labels, longLabels),
  );

  const flow = card(
    { title: t('summary.flowChart'), sub: t('summary.flowChart.sub'), id: 'chart-flow' },
    barChart({
      labels,
      longLabels,
      series: [
        { name: t('kpi.income'), slot: 1, values: months.map((m) => m.income) },
        { name: t('kpi.spending'), slot: 2, values: months.map((m) => m.spending) },
      ],
      format: (v) => fmtMoney(v),
      axisFormat: fmtCompact,
      ariaLabel: t('summary.flowChart'),
      tipExtra: (i) => [
        { label: t('kpi.saved'), value: fmtMoney(months[i]!.saved) },
        { label: t('kpi.leftover'), value: fmtMoney(months[i]!.leftover) },
      ],
    }),
  );

  const table = card(
    { title: t('summary.table'), id: 'summary-table' },
    h(
      'div',
      { class: 'table-wrap', 'data-scroll-key': 'summary-table' },
      h(
        'table',
        { class: 'grid-table' },
        h(
          'thead',
          null,
          h(
            'tr',
            null,
            h('th', { scope: 'col' }, t('summary.table.month')),
            h('th', { scope: 'col', class: 'n' }, t('kpi.income')),
            h('th', { scope: 'col', class: 'n' }, t('kpi.spending')),
            h('th', { scope: 'col', class: 'n' }, t('kpi.saved')),
            h('th', { scope: 'col', class: 'n' }, t('kpi.leftover')),
            h('th', { scope: 'col', class: 'n' }, t('summary.table.total')),
          ),
        ),
        h(
          'tbody',
          null,
          months.map((m) =>
            h(
              'tr',
              null,
              h(
                'th',
                { scope: 'row' },
                h('a', { href: `#/meses/${m.key}`, 'aria-label': t('summary.table.open', { month: monthName(m.month) }) }, monthName(m.month)),
              ),
              h('td', { class: 'n' }, money(m.income, { plain: true })),
              h('td', { class: 'n' }, money(m.spending, { plain: true })),
              h('td', { class: 'n' }, money(m.saved, { plain: true })),
              h('td', { class: 'n' }, money(m.leftover, { plain: true })),
              h('td', { class: 'n strong' }, money(m.totalClosing, { plain: true })),
            ),
          ),
        ),
        h(
          'tfoot',
          null,
          h(
            'tr',
            null,
            h('th', { scope: 'row' }, t('summary.total')),
            h('td', { class: 'n' }, money(year.totals.income, { plain: true })),
            h('td', { class: 'n' }, money(year.totals.spending, { plain: true })),
            h('td', { class: 'n' }, money(year.totals.saved, { plain: true })),
            h('td', { class: 'n' }, money(year.totals.leftover, { plain: true })),
            h('td', { class: 'n strong' }, money(year.totals.endOfYear, { plain: true })),
          ),
        ),
      ),
    ),
    h('p', { class: 'field-hint' }, t('months.amountsIn')),
  );

  return h(
    'div',
    { class: 'view view-summary' },
    pageHeader(t('summary.title', { year: config.year })),
    installNotice(ctx),
    backupNotice(ctx),
    kpis,
    balance,
    flow,
    table,
  );
}
