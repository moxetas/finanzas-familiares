/** Avisos: pagos no mensuales de los próximos 7 y 30 días y el resto por mes. */

import { upcomingPayments, type UpcomingPayment } from '../../calc/engine';
import { todayISO } from '../../calc/keys';
import { sum } from '../../calc/money';
import { fmtDate, fmtMoney, fmtYearMonth, t } from '../../i18n';
import { exportCalendar } from '../calendar-actions';
import { button, card, chip, empty, money, pageHeader } from '../components';
import type { Ctx } from '../context';
import { h } from '../dom';
import { editPayment } from '../forms';
import { icon } from '../icons';
import { isIOS } from '../install';
import { backgroundSupported, enableNotifications, permission } from '../notify';
import { toast } from '../toast';

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

/** Cómo avisa la app en este móvil: al abrirla, con notificaciones y con el calendario. */
function notifyCard(ctx: Ctx): HTMLElement {
  const perm = permission();
  let status: string;
  let enable: HTMLElement | null = null;
  if (!backgroundSupported()) status = t('notify.unsupported');
  else if (perm === 'denied') status = t('notify.denied');
  else if (perm === 'granted') status = ctx.store.state.meta.notifyBackground ? t('notify.on') : t('notify.onNoBackground');
  else {
    status = t('notify.sub');
    enable = button(t('notify.enable'), {
      icon: 'alerts',
      kind: 'primary',
      focusKey: 'notify-enable',
      onClick: async () => {
        const result = await enableNotifications();
        ctx.store.setMeta({ notifyBackground: result.background });
        toast(result.permission === 'granted' ? t('notify.toast.on') : t('notify.toast.off'));
      },
    });
  }
  return card(
    { title: t('notify.title'), sub: t('notify.sub'), id: 'notify' },
    ctx.data.config.example ? h('p', { class: 'warn-note' }, t('notify.example')) : null,
    h(
      'ul',
      { class: 'notify-list' },
      h('li', null, icon('info', 18), h('span', null, t('notify.onOpen'))),
      h('li', null, icon('alerts', 18), h('span', null, status)),
    ),
    h(
      'div',
      { class: 'button-row' },
      enable,
      button(t('calendar.button'), { icon: 'months', focusKey: 'calendar-export', onClick: () => void exportCalendar(ctx) }),
    ),
    h('p', { class: 'field-hint' }, t('calendar.help')),
    isIOS() ? h('p', { class: 'field-hint' }, t('calendar.helpIOS')) : null,
    h('p', { class: 'field-hint' }, t('calendar.privacy')),
  );
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
    notifyCard(ctx),
  );
}
