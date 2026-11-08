/** Pestaña Sueldos: sueldos de cada persona con su media, y compras de BTC. */

import { btcRows, contractSummary, salaryYears, withPlannedYear } from '../../calc/income';
import type { SalaryPerson } from '../../calc/types';
import { fmtDate, fmtMoney, fmtNumber, fmtYearMonth, localeTag, monthName, t } from '../../i18n';
import { button, card, chip, empty, kpi, money, pageHeader } from '../components';
import type { Ctx } from '../context';
import { h } from '../dom';
import { addPerson, editBtc, editContract, editSalary } from '../income-forms';

const qtyFmt = () => new Intl.NumberFormat(localeTag(), { minimumFractionDigits: 6, maximumFractionDigits: 8 });

export function incomeView(ctx: Ctx, param: string | undefined): HTMLElement {
  const people = ctx.data.config.salaries ?? [];
  const tabs = [...people.map((p, i) => ({ id: String(i), label: p.name })), { id: 'btc', label: t('income.btc') }];
  const current = tabs.some((x) => x.id === param) ? param! : (tabs[0]?.id ?? 'btc');
  const switcher = h(
    'div',
    { class: 'segmented year-tabs income-tabs', role: 'group', 'aria-label': t('income.title') },
    tabs.map((x) =>
      h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': String(x.id === current), 'data-focus-key': `inc-${x.id}`, onclick: () => ctx.go(`#/sueldos/${x.id}`) }, x.label),
    ),
    h('button', { type: 'button', class: 'seg-btn', 'aria-label': t('income.addPerson'), title: t('income.addPerson'), onclick: () => addPerson(ctx) }, '+'),
  );
  const body = current === 'btc' ? btcBody(ctx) : personBody(ctx, Number(current));
  return h('div', { class: 'view view-income' }, pageHeader(t('income.title'), t('income.sub')), switcher, body);
}

function personBody(ctx: Ctx, pi: number): HTMLElement[] {
  const stored = ctx.data.config.salaries![pi]!;
  // El año planificado se toma de la pestaña Meses (concepto «SUELDO <nombre>»).
  const { person, autoAfter } = withPlannedYear(ctx.data, stored);
  const until = Math.max(new Date().getFullYear(), ctx.data.config.year);
  const years = salaryYears(person, until, autoAfter).reverse();
  const contracts = contractSummary(stored);
  const add = button(t('income.addMonth'), { icon: 'plus', kind: 'primary', focusKey: `inc-add-${pi}`, onClick: () => editSalary(ctx, pi, null) });

  const contractsCard = card(
    { title: t('income.contracts'), id: `contracts-${pi}`, actions: button(t('income.contract.add'), { icon: 'plus', iconOnly: true, focusKey: `contract-add-${pi}`, onClick: () => editContract(ctx, pi, null) }) },
    person.contracts.length === 0 && contracts.length <= 1
      ? empty(t('income.contract.none'))
      : h(
          'ul',
          { class: 'rows' },
          contracts.map((c) => {
            const ci = person.contracts.findIndex((x) => x.name === c.name);
            return h(
              'li',
              null,
              h(
                'button',
                { type: 'button', class: 'row-btn', onclick: () => ci >= 0 && editContract(ctx, pi, ci) },
                h(
                  'span',
                  { class: 'row-main' },
                  h('span', { class: 'row-title' }, c.name || t('income.contract.none')),
                  h('span', { class: 'row-sub' }, t('income.contract.row', { from: fmtYearMonth(c.from), to: fmtYearMonth(c.to), n: c.months, avg: fmtMoney(c.average) })),
                ),
              ),
            );
          }),
        ),
  );

  if (years.length === 0) return [h('div', { class: 'button-row page-actions' }, add), card({}, empty(t('income.empty'))), contractsCard];

  return [h('div', { class: 'button-row page-actions' }, add), ...years.map((y) => yearCard(ctx, pi, person, y)), contractsCard, h('p', { class: 'field-hint' }, t('income.estimated.hint'))];
}

function yearCard(ctx: Ctx, pi: number, person: SalaryPerson, y: ReturnType<typeof salaryYears>[number]): HTMLElement {
  const rows: HTMLElement[] = [];
  y.rows.forEach((r, i) => {
    if (i === 0 || r.contractStart) {
      if (r.contract) rows.push(h('tr', { class: 'row-group' }, h('th', { scope: 'rowgroup', colspan: 3 }, t('income.contract', { name: r.contract }))));
    }
    rows.push(
      h(
        'tr',
        { class: `row-line${r.estimated ? ' is-estimated' : ''}` },
        h('th', { scope: 'row' }, monthName(Number(r.ym.slice(5, 7))), r.estimated ? chip(t('chip.estimated'), 'estimated') : null),
        h(
          'td',
          { class: 'n' },
          h(
            'button',
            {
              type: 'button',
              class: 'cell-btn',
              'data-focus-key': `sal-${pi}-${r.ym}`,
              'aria-label': `${t('action.edit')} ${fmtYearMonth(r.ym)}: ${fmtMoney(r.amount)}`,
              onclick: () => editSalary(ctx, pi, r.ym, { amount: r.amount, estimated: r.estimated }),
            },
            fmtNumber(r.amount),
          ),
        ),
        h('td', { class: 'n muted' }, fmtNumber(r.average)),
      ),
    );
  });
  rows.push(
    h(
      'tr',
      { class: 'row-sum row-end' },
      h('th', { scope: 'row' }, y.estimated ? t('income.total.estimated', { year: y.year }) : t('income.total', { year: y.year })),
      h('td', { class: 'n strong' }, money(y.total, { plain: true })),
      h('td', { class: 'n' }),
    ),
  );
  void person;
  return card(
    { title: String(y.year), id: `sal-${pi}-${y.year}` },
    h(
      'table',
      { class: 'grid-table plan-table income-table' },
      h(
        'thead',
        null,
        h('tr', null, h('th', { scope: 'col' }, t('income.col.month')), h('th', { scope: 'col', class: 'n' }, t('income.col.salary')), h('th', { scope: 'col', class: 'n', title: t('income.col.average.hint') }, t('income.col.average'))),
      ),
      h('tbody', null, rows),
    ),
    h('p', { class: 'field-hint' }, t('income.col.average.hint')),
  );
}

function btcBody(ctx: Ctx): HTMLElement[] {
  const rows = btcRows(ctx.data.config.btc ?? []);
  const last = rows[rows.length - 1];
  const q = qtyFmt();
  const add = button(t('btc.add'), { icon: 'plus', kind: 'primary', focusKey: 'btc-add', onClick: () => editBtc(ctx, null) });
  if (!last) return [h('div', { class: 'button-row page-actions' }, add), card({}, empty(t('btc.empty')))];
  return [
    h('div', { class: 'button-row page-actions' }, add),
    h(
      'div',
      { class: 'kpis' },
      h('div', { class: 'kpi' }, h('p', { class: 'kpi-label' }, t('btc.kpi.total')), h('p', { class: 'kpi-value' }, h('span', { class: 'num' }, q.format(last.total)))),
      kpi(t('btc.kpi.paid'), last.totalPaid),
      last.avgPrice === null ? null : kpi(t('btc.kpi.avg'), last.avgPrice),
    ),
    card(
      { title: t('btc.title'), id: 'btc' },
      h(
        'div',
        { class: 'table-wrap', 'data-scroll-key': 'btc' },
        h(
          'table',
          { class: 'grid-table plan-table btc-table' },
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              [t('btc.col.date'), t('btc.col.qty'), t('btc.col.price'), t('btc.col.paid'), t('btc.col.total'), t('btc.col.avg'), t('btc.col.totalPaid')].map((c, i) =>
                h('th', { scope: 'col', class: i ? 'n' : '' }, c),
              ),
            ),
          ),
          h(
            'tbody',
            null,
            rows.map((r) =>
              h(
                'tr',
                { class: `row-line${r.qty < 0 ? ' is-sale' : ''}` },
                h('th', { scope: 'row' }, h('button', { type: 'button', class: 'label-btn', 'data-focus-key': `btc-${r.index}`, onclick: () => editBtc(ctx, r.index) }, fmtDate(r.date, { year: true }))),
                h('td', { class: `n${r.qty < 0 ? ' neg' : ''}` }, q.format(r.qty)),
                h('td', { class: 'n' }, fmtNumber(r.price)),
                h('td', { class: `n${r.paid < 0 ? ' neg' : ''}` }, fmtNumber(r.paid)),
                h('td', { class: 'n' }, q.format(r.total)),
                h('td', { class: 'n muted' }, r.avgPrice === null ? '–' : fmtNumber(r.avgPrice)),
                h('td', { class: 'n strong' }, fmtNumber(r.totalPaid)),
              ),
            ),
          ),
        ),
      ),
      h('p', { class: 'field-hint' }, t('btc.avg.hint')),
    ),
  ];
}
