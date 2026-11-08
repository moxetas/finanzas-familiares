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
import { isIOS, isStandalone } from '../install';
import { disablePush, enablePush, lastServerRun, pushInfo, pushSupported, testPush } from '../push';
import { toast } from '../toast';
import { openImport } from '../import-ai';

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

/** Estado de los avisos con la app cerrada (Web Push) en este móvil. */
function pushBlock(ctx: Ctx): HTMLElement {
  const code = ctx.store.sync.code;
  const info = pushInfo();
  const line = (text: string, ...extra: (HTMLElement | null)[]) => h('li', null, icon('alerts', 18), h('div', { class: 'push-body' }, h('p', null, text), ...extra));
  if (!pushSupported()) return line(isIOS() && !isStandalone() ? t('push.iosInstall') : t('push.unsupported'));
  if (!code) return line(t('push.needSync'), button(t('push.goSync'), { focusKey: 'push-sync', onClick: () => ctx.go('#/ajustes/sync') }));
  if (Notification.permission === 'denied') return line(t('push.denied'));
  if (info && Notification.permission === 'granted') {
    const server = h('p', { class: 'meta-line' }, t('push.server.checking'));
    void lastServerRun(code)
      .then((last) => {
        if (last === null) {
          server.textContent = t('push.server.never');
          return;
        }
        const min = Math.round((Date.now() - last) / 60000);
        const ago = min < 2 ? t('push.ago.now') : min < 120 ? t('push.ago.min', { n: min }) : t('push.ago.hours', { n: Math.round(min / 60) });
        server.textContent = t('push.server.last', { ago }) + (min > 180 ? ` ${t('push.server.late')}` : '');
      })
      .catch(() => (server.textContent = ''));
    return line(
      t('push.on', { device: info.dispositivo }),
      server,
      h(
        'div',
        { class: 'button-row' },
        button(t('push.test'), { focusKey: 'push-test', onClick: () => void testPush(t('push.test.title'), t('push.test.body')).catch(() => toast(t('push.error'))) }),
        button(t('push.off'), {
          kind: 'ghost',
          focusKey: 'push-off',
          onClick: async () => {
            await disablePush(code);
            toast(t('push.toast.off'));
            ctx.store.setMeta({});
          },
        }),
      ),
    );
  }
  return line(
    t('push.intro'),
    h(
      'div',
      { class: 'button-row' },
      button(t('push.enable'), {
        icon: 'alerts',
        kind: 'primary',
        focusKey: 'push-enable',
        onClick: async () => {
          try {
            const r = await enablePush(code);
            toast(r === 'ok' ? t('push.toast.on') : t('push.toast.denied'));
            if (r === 'ok') void testPush(t('push.test.title'), t('push.test.body')).catch(() => undefined);
          } catch (e) {
            toast(`${t('push.error')}${e instanceof Error && e.message ? `: ${e.message}` : ''}`, { duration: 8000 });
          }
          ctx.store.setMeta({});
        },
      }),
    ),
  );
}

/** Cómo avisa la app en este móvil: al abrirla, con la app cerrada y con el calendario. */
function notifyCard(ctx: Ctx): HTMLElement {
  return card(
    { title: t('notify.title'), sub: t('notify.sub'), id: 'notify' },
    ctx.data.config.example ? h('p', { class: 'warn-note' }, t('notify.example')) : null,
    h('ul', { class: 'notify-list' }, h('li', null, icon('info', 18), h('span', null, t('notify.onOpen'))), pushBlock(ctx)),
    h('h3', { class: 'subhead' }, t('calendar.title')),
    h('div', { class: 'button-row' }, button(t('calendar.button'), { icon: 'months', focusKey: 'calendar-export', onClick: () => void exportCalendar(ctx) })),
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
    h('div', { class: 'button-row page-actions' }, button(t('import.button'), { icon: 'upload', onClick: () => openImport(ctx) })),
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
