/** Avisos: pagos no mensuales de los próximos 7 y 30 días y el resto por mes. */

import { upcomingPayments, type UpcomingPayment } from '../../calc/engine';
import { todayISO } from '../../calc/keys';
import { sum } from '../../calc/money';
import { fmtDate, fmtMoney, fmtYearMonth, t } from '../../i18n';
import { card, chip, empty, money, pageHeader } from '../components';
import type { Ctx } from '../context';
import { h } from '../dom';
import { editPayment } from '../forms';
import { icon } from '../icons';

function when(p: UpcomingPayment): string {
  if (p.inDays === 0) return t('alerts.today');
  if (p.inDays === 1) return t('alerts.tomorrow');
  return t('alerts.inDays', { n: p.inDays });
}

function list(ctx: Ctx, payments: UpcomingPayment[], showWhen: boolean): HTMLElement {
  const accounts = ctx.data.config.accounts;
  return h(
    'ul',
    { class: 'rows' },
    payments.map((p) =>
      h(
        'li',
        null,
        h(
          'button',
          { type: 'button', class: 'row-btn', 'data-focus-key': `alert-${p.index}`, onclick: () => editPayment(ctx, p.index) },
          h('span', { class: 'row-date' }, h('span', { class: 'row-day' }, fmtDate(p.date, { weekday: true }))),
          h(
            'span',
            { class: 'row-main' },
            h('span', { class: 'row-title' }, p.concept, p.estimated ? chip(t('chip.estimated'), 'estimated') : null),
            h(
              'span',
              { class: 'row-sub' },
              [showWhen ? when(p) : null, accounts.length > 1 ? (accounts[p.account]?.name ?? '') : null].filter(Boolean).join(' · '),
            ),
          ),
          money(-p.amount),
          icon('edit', 18),
        ),
      ),
    ),
  );
}

function total(payments: UpcomingPayment[]): HTMLElement | null {
  if (payments.length < 2) return null;
  return h('p', { class: 'group-total' }, t('alerts.groupTotal', { amount: fmtMoney(-sum(payments.map((p) => p.amount))) }));
}

export function alertsView(ctx: Ctx): HTMLElement {
  const { config, overrides } = ctx.data;
  const up = upcomingPayments(config, overrides, todayISO());
  const nothing = up.week.length + up.month.length + up.later.length === 0;

  return h(
    'div',
    { class: 'view view-alerts' },
    pageHeader(t('alerts.title'), t('alerts.sub')),
    nothing && config.payments.length === 0
      ? card({}, empty(t('alerts.empty')))
      : [
          card({ title: t('alerts.week'), id: 'alerts-week', className: up.week.length ? 'is-urgent' : '' }, up.week.length ? [list(ctx, up.week, true), total(up.week)] : empty(t('alerts.none.week'))),
          card({ title: t('alerts.month'), id: 'alerts-month' }, up.month.length ? [list(ctx, up.month, true), total(up.month)] : empty(t('alerts.none.month'))),
          card(
            { title: t('alerts.later'), id: 'alerts-later' },
            up.later.length
              ? up.later.map((g) => h('div', { class: 'month-group' }, h('h3', null, fmtYearMonth(g.ym)), list(ctx, g.payments, false), total(g.payments)))
              : empty(t('alerts.none.later')),
          ),
        ],
  );
}
