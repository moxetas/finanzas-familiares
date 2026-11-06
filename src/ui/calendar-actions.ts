/** Botón «Añadir al calendario»: descarga un .ics con los pagos y sus alarmas. */

import { upcomingPayments } from '../calc/engine';
import { todayISO } from '../calc/keys';
import { fmtMoney, t } from '../i18n';
import { buildCalendar } from '../storage/calendar';
import type { Ctx } from './context';
import { h } from './dom';
import { isIOS } from './install';
import { toast } from './toast';

export async function exportCalendar(ctx: Ctx): Promise<void> {
  const { config, overrides } = ctx.data;
  const up = upcomingPayments(config, overrides, todayISO());
  const payments = [...up.week, ...up.month, ...up.later.flatMap((g) => g.payments)];
  if (payments.length === 0) {
    toast(t('calendar.none'));
    return;
  }
  const text = buildCalendar(
    payments.map((p) => ({ date: p.date, concept: p.concept, amountText: fmtMoney(p.amount), estimated: p.estimated })),
    {
      calendarName: t('calendar.name'),
      summary: t('calendar.summary'),
      alarmWeek: t('calendar.alarmWeek'),
      alarmDay: t('calendar.alarmDay'),
      description: t('calendar.description'),
      estimated: t('calendar.estimated'),
    },
  );
  const name = 'pagos-finanzas-familiares.ics';
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });

  // En iPhone, compartir el archivo es lo que mejor funciona con la app instalada.
  if (isIOS() && typeof File !== 'undefined' && navigator.canShare) {
    const file = new File([blob], name, { type: 'text/calendar' });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: t('calendar.name') });
        return;
      } catch (e) {
        if ((e as DOMException).name === 'AbortError') return;
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name, hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  toast(t('calendar.done'), { duration: 6000 });
}
