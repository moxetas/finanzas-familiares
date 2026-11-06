/**
 * Avisos al abrir la app: si hay pagos dentro de una semana, mañana u hoy que
 * aún no se han avisado en este aparato, sale una ventana con ellos.
 */

import { todayISO } from '../calc/keys';
import { dueReminders, type Reminder } from '../calc/reminders';
import { fmtDate, fmtMoney, t } from '../i18n';
import { chip } from './components';
import type { Ctx } from './context';
import { openDialog } from './dialog';
import { h } from './dom';
import { registerBackgroundCheck, setBadge } from './notify';

function when(r: Reminder): string {
  if (r.inDays === 0) return t('alerts.today');
  if (r.inDays === 1) return t('alerts.tomorrow');
  return t('alerts.inDays', { n: r.inDays });
}

let checking = false;

export async function checkReminders(ctx: Ctx): Promise<void> {
  if (checking) return;
  checking = true;
  try {
    const { config, overrides } = ctx.data;
    if (config.example) {
      setBadge(0);
      return;
    }
    const due = dueReminders(config, overrides, todayISO());
    setBadge(due.length);
    // No se pone encima de otra ventana abierta; se intentará la próxima vez.
    if (due.length === 0 || document.querySelector('dialog[open]')) return;
    const shown = new Set(await ctx.store.loadShown());
    const fresh = due.filter((r) => !shown.has(r.key));
    if (fresh.length === 0) return;
    await ctx.store.markShown(fresh.map((r) => r.key));
    openDialog({
      title: t('reminders.title'),
      content: [
        h('p', { class: 'sub' }, t('reminders.sub')),
        h(
          'ul',
          { class: 'rows reminder-list' },
          fresh.map((r) =>
            h(
              'li',
              { class: 'reminder-row' },
              h('span', { class: `reminder-when${r.kind === 'day' ? ' is-soon' : ''}` }, when(r)),
              h(
                'span',
                { class: 'row-main' },
                h('span', { class: 'row-title' }, r.concept, r.estimated ? chip(t('chip.estimated'), 'estimated') : null),
                h('span', { class: 'row-sub' }, fmtDate(r.date, { weekday: true })),
              ),
              h('span', { class: 'num' }, fmtMoney(-r.amount)),
            ),
          ),
        ),
      ],
      actions: [
        { label: t('reminders.seeAll'), kind: 'secondary', onClick: () => ctx.go('#/avisos') },
        { label: t('reminders.ok'), submit: true },
      ],
    });
  } finally {
    checking = false;
  }
}

/** Comprueba al abrir la app, al volver a ella y al cambiar los datos. */
export function startReminders(ctx: Ctx): void {
  const check = () => void checkReminders(ctx);
  setTimeout(check, 600);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  ctx.store.subscribe(() => setBadge(ctx.data.config.example ? 0 : dueReminders(ctx.data.config, ctx.data.overrides, todayISO()).length));
  // Si ya se dio permiso, se renueva la comprobación diaria en segundo plano.
  if ('Notification' in window && Notification.permission === 'granted') {
    void registerBackgroundCheck().then((on) => {
      if (on !== (ctx.store.state.meta.notifyBackground === true)) ctx.store.setMeta({ notifyBackground: on });
    });
  }
}
