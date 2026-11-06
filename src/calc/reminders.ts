/**
 * Avisos de pagos no mensuales: una semana antes y el día de antes.
 *
 * Regla (la misma al abrir la app y en el aviso en segundo plano):
 * - aviso «semana»: cuando faltan entre 7 y 2 días;
 * - aviso «día»: cuando falta 1 día (mañana) o es hoy.
 * Cada aviso se muestra una sola vez; se identifica por fecha, concepto y tipo,
 * así que no se repite aunque cambien el orden o el importe de los pagos.
 */

import { upcomingPayments } from './engine';
import { parseDate } from './keys';
import type { Config, Overrides } from './types';

export type ReminderKind = 'week' | 'day';

export interface Reminder {
  key: string;
  kind: ReminderKind;
  /** Fecha del pago, AAAA-MM-DD. */
  date: string;
  concept: string;
  /** Importe que se pagará (el cambiado para ese mes, si lo hay). */
  amount: number;
  estimated: boolean;
  /** Días que faltan (0 = hoy). */
  inDays: number;
  /** Posición del pago en `config.payments`. */
  index: number;
}

export function reminderKey(date: string, concept: string, kind: ReminderKind): string {
  return `${date}|${concept}|${kind}`;
}

function kindFor(inDays: number): ReminderKind {
  return inDays <= 1 ? 'day' : 'week';
}

/** Avisos que tocan hoy: pagos de hoy a 7 días vista. */
export function dueReminders(config: Config, overrides: Overrides, today: string): Reminder[] {
  return upcomingPayments(config, overrides, today).week.map((p) => {
    const kind = kindFor(p.inDays);
    return {
      key: reminderKey(p.date, p.concept, kind),
      kind,
      date: p.date,
      concept: p.concept,
      amount: p.amount,
      estimated: p.estimated,
      inDays: p.inDays,
      index: p.index,
    };
  });
}

/** Un aviso programado: se puede mostrar cualquier día entre `from` y `until` (incluidos). */
export interface ScheduledReminder {
  key: string;
  kind: ReminderKind;
  from: string;
  until: string;
  date: string;
  concept: string;
  amount: number;
  estimated: boolean;
}

function shiftDate(iso: string, days: number): string {
  const d = parseDate(iso);
  if (!d) return iso;
  return new Date(Date.UTC(d.year, d.month - 1, d.day + days)).toISOString().slice(0, 10);
}

/**
 * Calendario de avisos de todos los pagos desde hoy, para que el service
 * worker pueda avisar con la app cerrada sin tener que calcular nada.
 */
export function reminderSchedule(config: Config, overrides: Overrides, today: string): ScheduledReminder[] {
  const up = upcomingPayments(config, overrides, today);
  const all = [...up.week, ...up.month, ...up.later.flatMap((g) => g.payments)];
  return all.flatMap((p) => {
    const base = { date: p.date, concept: p.concept, amount: p.amount, estimated: p.estimated };
    return [
      { key: reminderKey(p.date, p.concept, 'week'), kind: 'week' as const, from: shiftDate(p.date, -7), until: shiftDate(p.date, -2), ...base },
      { key: reminderKey(p.date, p.concept, 'day'), kind: 'day' as const, from: shiftDate(p.date, -1), until: p.date, ...base },
    ];
  });
}

/** Olvida los avisos de pagos que ya pasaron hace más de 40 días. */
export function pruneShown(keys: readonly string[], today: string): string[] {
  const limit = shiftDate(today, -40);
  return Array.from(new Set(keys)).filter((k) => k.slice(0, 10) >= limit);
}
