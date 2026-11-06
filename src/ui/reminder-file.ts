/** Prepara los avisos programados (con textos ya traducidos) para el service worker. */

import { todayISO } from '../calc/keys';
import { reminderSchedule } from '../calc/reminders';
import type { AppData } from '../calc/types';
import { fmtDate, fmtMoney, t } from '../i18n';
import type { ReminderFile } from '../storage/local';

export function buildReminderFile(data: AppData, today: string = todayISO()): ReminderFile {
  // Con el ejemplo ficticio no se avisa de nada.
  const schedule = data.config.example ? [] : reminderSchedule(data.config, data.overrides, today);
  return {
    v: 1,
    labels: {
      today: t('alerts.today'),
      tomorrow: t('alerts.tomorrow'),
      inDays: t('alerts.inDays'),
      estimated: t('chip.estimated'),
    },
    items: schedule.map((r) => ({
      key: r.key,
      from: r.from,
      until: r.until,
      date: r.date,
      concept: r.concept,
      amountText: fmtMoney(r.amount),
      dateText: fmtDate(r.date, { weekday: true }),
      estimated: r.estimated,
    })),
  };
}
