/** Resumen del año: cifras clave, gráficos y tabla mes a mes. */

import { barChart, lineChart } from '../../charts/charts';
import type { Series } from '../../charts/common';
import { computeYear } from '../../calc/engine';
import { fmtCompact, fmtMoney, monthName, t } from '../../i18n';
import { card, kpi, money, pageHeader } from '../components';
import type { Ctx } from '../context';
import { h } from '../dom';
import { backupNotice, installNotice } from '../notices';

/** Máximo de cuentas con línea propia; con más, solo el total (no se inventan colores). */
const MAX_SERIES = 6;

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

  const accounts = config.accounts;
  const tooMany = accounts.length > MAX_SERIES;
  const balanceSeries: Series[] = tooMany
    ? [{ name: t('summary.total'), slot: 1, values: months.map((m) => m.totalClosing) }]
    : accounts.map((a, i) => ({ name: a.name, slot: i + 1, values: months.map((m) => m.closing[i] ?? 0) }));

  const balance = card(
    { title: t('summary.balanceChart'), sub: t('summary.balanceChart.sub'), id: 'chart-balance' },
    lineChart({
      labels,
      longLabels,
      series: balanceSeries,
      format: (v) => fmtMoney(v),
      axisFormat: fmtCompact,
      ariaLabel: `${t('summary.balanceChart')}. ${monthName(12)}: ${balanceSeries.map((se) => `${se.name} ${fmtMoney(se.values[11] ?? 0)}`).join(', ')}.`,
      tipExtra: !tooMany && accounts.length > 1 ? (i) => [{ label: t('summary.total'), value: fmtMoney(months[i]!.totalClosing) }] : undefined,
    }),
    tooMany ? h('p', { class: 'field-hint' }, t('summary.totalOnly', { n: MAX_SERIES })) : null,
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
