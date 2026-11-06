/**
 * Motor de cálculo. Funciones puras: reciben los datos y devuelven el resultado,
 * sin tocar el DOM ni el almacenamiento.
 *
 * Por cada mes k (1-12) y cada cuenta:
 *   saldo inicial = saldo real del mes anterior si existe; si no, el saldo
 *                   previsto final del mes anterior; en enero, el saldo inicial
 *                   de la cuenta.
 *   saldo final   = saldo inicial + total del mes.
 *
 * Total del mes de una cuenta:
 *   Ingreso  → +importe en su cuenta.
 *   Gasto    → −importe en su cuenta.
 *   Ahorro   → −importe en la cuenta origen y +importe en la destino
 *              (si el destino es -1, el dinero sale de tus cuentas).
 *   Pago no mensual → −importe en su cuenta, en el mes de su fecha.
 *   Apunte del mes  → ±importe según sea ingreso o gasto.
 *
 * Gasto real = gastos + pagos no mensuales + apuntes de gasto. El ahorro y los
 * traspasos no son gasto. Sobra = ingresos − gasto real − apartado.
 */

import { itemOverrideKey, monthKey, parseDate, paymentOverrideKey, realBalanceKey } from './keys';
import { round2, sum } from './money';
import type { AppData, Config, Entry, Item, ItemType, Overrides } from './types';

export type LineKind = 'item' | 'payment' | 'entry';
export type LineType = ItemType | 'Pago';

export interface Line {
  kind: LineKind;
  /** Posición en `config.items`, `config.payments` o `entries`. */
  index: number;
  /** Clave de override, o `null` en los apuntes (se editan directamente). */
  overrideKey: string | null;
  name: string;
  type: LineType;
  /** Importe que cuenta este mes (el cambiado, si lo hay). Siempre positivo. */
  amount: number;
  /** Importe normal, sin cambios de este mes. */
  base: number;
  overridden: boolean;
  estimated: boolean;
  account: number;
  /** Cuenta destino (solo Ahorro), o -1. */
  to: number;
  /** Efecto en cada cuenta (mismo orden que `config.accounts`). */
  deltas: number[];
}

export type StartSource = 'initial' | 'real' | 'projected';

export interface MonthResult {
  /** 1 = enero … 12 = diciembre. */
  month: number;
  /** `AAAA-MM`. */
  key: string;
  lines: Line[];
  /** Saldo al empezar el mes, por cuenta. */
  start: number[];
  startSource: StartSource[];
  /** Total del mes, por cuenta. */
  delta: number[];
  /** Saldo previsto a fin de mes, por cuenta. */
  end: number[];
  /** Saldo real apuntado a fin de mes, por cuenta (o `null`). */
  real: (number | null)[];
  /** Real − previsto, por cuenta (o `null` si no hay saldo real). */
  diff: (number | null)[];
  /** Lo que se considera saldo de cierre: el real si lo hay, si no el previsto. */
  closing: number[];
  income: number;
  /** Gasto real: gastos + pagos no mensuales + apuntes de gasto. */
  spending: number;
  /** Apartado: ahorro y traspasos. */
  saved: number;
  /** Ingresos − gasto real − apartado. */
  leftover: number;
  /** Suma de los saldos de cierre de todas las cuentas. */
  totalClosing: number;
}

export interface YearResult {
  year: number;
  months: MonthResult[];
  totals: {
    income: number;
    spending: number;
    saved: number;
    leftover: number;
    /** Dinero total a fin de año (suma de cierres de diciembre). */
    endOfYear: number;
    /** Dinero total al empezar el año. */
    startOfYear: number;
  };
}

/** ¿Cuenta este concepto en el mes `month` (1-12)? */
export function isItemActive(item: Item, month: number): boolean {
  const from = clampMonth(item.from_month, 1);
  const to = clampMonth(item.to_month, 12);
  return month >= from && month <= to;
}

function clampMonth(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(12, Math.max(1, Math.trunc(value)));
}

function lookup(overrides: Overrides, key: string): number | undefined {
  const v = overrides[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function emptyDeltas(n: number): number[] {
  return new Array<number>(n).fill(0);
}

/** Suma `amount` a la cuenta `account` si existe; los índices rotos se ignoran. */
function addTo(deltas: number[], account: number, amount: number): void {
  if (Number.isInteger(account) && account >= 0 && account < deltas.length) {
    deltas[account] = round2(deltas[account]! + amount);
  }
}

/** Partidas (filas) de un mes: conceptos activos, pagos de ese mes y apuntes. */
export function monthLines(data: AppData, month: number): Line[] {
  const { config, overrides, entries } = data;
  const n = config.accounts.length;
  const ym = monthKey(config.year, month);
  const lines: Line[] = [];

  config.items.forEach((item, index) => {
    if (!isItemActive(item, month)) return;
    const key = itemOverrideKey(ym, index);
    const override = lookup(overrides, key);
    const amount = round2(override ?? item.amount);
    const deltas = emptyDeltas(n);
    const to = item.type === 'Ahorro' ? item.to : -1;
    if (item.type === 'Ingreso') addTo(deltas, item.account, amount);
    else if (item.type === 'Gasto') addTo(deltas, item.account, -amount);
    else {
      // Traspaso: sale de una cuenta y entra en la otra (con -1 no entra en ninguna).
      addTo(deltas, item.account, -amount);
      addTo(deltas, to, amount);
    }
    lines.push({
      kind: 'item',
      index,
      overrideKey: key,
      name: item.name,
      type: item.type,
      amount,
      base: round2(item.amount),
      overridden: override !== undefined,
      estimated: false,
      account: item.account,
      to,
      deltas,
    });
  });

  config.payments.forEach((payment, index) => {
    const d = parseDate(payment.date);
    if (!d || d.year !== config.year || d.month !== month) return;
    const key = paymentOverrideKey(ym, index);
    const override = lookup(overrides, key);
    const amount = round2(override ?? payment.amount);
    const deltas = emptyDeltas(n);
    addTo(deltas, payment.account, -amount);
    lines.push({
      kind: 'payment',
      index,
      overrideKey: key,
      name: payment.concept,
      type: 'Pago',
      amount,
      base: round2(payment.amount),
      overridden: override !== undefined,
      estimated: payment.estimated,
      account: payment.account,
      to: -1,
      deltas,
    });
  });

  entries.forEach((entry, index) => {
    if (entry.month !== ym) return;
    const amount = round2(entry.amount);
    const deltas = emptyDeltas(n);
    addTo(deltas, entry.account, entry.type === 'Ingreso' ? amount : -amount);
    lines.push({
      kind: 'entry',
      index,
      overrideKey: null,
      name: entry.concept,
      type: entry.type,
      amount,
      base: amount,
      overridden: false,
      estimated: false,
      account: entry.account,
      to: -1,
      deltas,
    });
  });

  return lines;
}

/** Calcula los doce meses del año planificado. */
export function computeYear(data: AppData): YearResult {
  const { config, real_balances } = data;
  const n = config.accounts.length;
  const months: MonthResult[] = [];

  let prevEnd: number[] = config.accounts.map((a) => round2(a.initial));
  let prevReal: (number | null)[] = new Array<number | null>(n).fill(null);

  for (let month = 1; month <= 12; month++) {
    const key = monthKey(config.year, month);
    const lines = monthLines(data, month);

    const start: number[] = [];
    const startSource: StartSource[] = [];
    for (let c = 0; c < n; c++) {
      const real = prevReal[c];
      if (month === 1) {
        start.push(prevEnd[c]!);
        startSource.push('initial');
      } else if (real !== null && real !== undefined) {
        start.push(real);
        startSource.push('real');
      } else {
        start.push(prevEnd[c]!);
        startSource.push('projected');
      }
    }

    const delta = emptyDeltas(n);
    let income = 0;
    let spending = 0;
    let saved = 0;
    for (const line of lines) {
      for (let c = 0; c < n; c++) delta[c] = round2(delta[c]! + line.deltas[c]!);
      if (line.type === 'Ingreso') income += line.amount;
      else if (line.type === 'Gasto' || line.type === 'Pago') spending += line.amount;
      else saved += line.amount;
    }

    const end = start.map((s, c) => round2(s + delta[c]!));
    const real = config.accounts.map((_, c) => {
      const v = real_balances[realBalanceKey(key, c)];
      return typeof v === 'number' && Number.isFinite(v) ? round2(v) : null;
    });
    const diff = real.map((r, c) => (r === null ? null : round2(r - end[c]!)));
    const closing = real.map((r, c) => (r === null ? end[c]! : r));

    income = round2(income);
    spending = round2(spending);
    saved = round2(saved);

    months.push({
      month,
      key,
      lines,
      start,
      startSource,
      delta,
      end,
      real,
      diff,
      closing,
      income,
      spending,
      saved,
      leftover: round2(income - spending - saved),
      totalClosing: sum(closing),
    });

    prevEnd = end;
    prevReal = real;
  }

  const income = sum(months.map((m) => m.income));
  const spending = sum(months.map((m) => m.spending));
  const saved = sum(months.map((m) => m.saved));
  return {
    year: config.year,
    months,
    totals: {
      income,
      spending,
      saved,
      leftover: round2(income - spending - saved),
      endOfYear: months[11]?.totalClosing ?? 0,
      startOfYear: sum(config.accounts.map((a) => a.initial)),
    },
  };
}

/** Un pago pendiente, con el importe que contará (el cambiado, si lo hay). */
export interface UpcomingPayment {
  index: number;
  date: string;
  concept: string;
  amount: number;
  account: number;
  estimated: boolean;
  /** Días que faltan desde hoy (0 = hoy). */
  inDays: number;
}

export interface Upcoming {
  /** Hoy y los próximos 7 días. */
  week: UpcomingPayment[];
  /** Del día 8 al 30. */
  month: UpcomingPayment[];
  /** Después, agrupados por mes `AAAA-MM`, en orden. */
  later: { ym: string; payments: UpcomingPayment[] }[];
}

/** Pagos no mensuales desde hoy (`AAAA-MM-DD`), ordenados por fecha. */
export function upcomingPayments(config: Config, overrides: Overrides, today: string): Upcoming {
  const t = parseDate(today);
  const result: Upcoming = { week: [], month: [], later: [] };
  if (!t) return result;
  const todayUTC = Date.UTC(t.year, t.month - 1, t.day);

  const list: UpcomingPayment[] = [];
  config.payments.forEach((p, index) => {
    const d = parseDate(p.date);
    if (!d) return;
    const inDays = Math.round((Date.UTC(d.year, d.month - 1, d.day) - todayUTC) / 86_400_000);
    if (inDays < 0) return;
    const override = lookup(overrides, paymentOverrideKey(monthKey(d.year, d.month), index));
    list.push({
      index,
      date: p.date,
      concept: p.concept,
      amount: round2(override ?? p.amount),
      account: p.account,
      estimated: p.estimated,
      inDays,
    });
  });
  list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.index - b.index));

  for (const p of list) {
    if (p.inDays <= 7) result.week.push(p);
    else if (p.inDays <= 30) result.month.push(p);
    else {
      const ym = p.date.slice(0, 7);
      let group = result.later.find((g) => g.ym === ym);
      if (!group) {
        group = { ym, payments: [] };
        result.later.push(group);
      }
      group.payments.push(p);
    }
  }
  return result;
}

/** Apuntes de un mes, ordenados por fecha (los que no tienen fecha, al final). */
export function entriesOfMonth(entries: readonly Entry[], ym: string): { entry: Entry; index: number }[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.month === ym)
    .sort((a, b) => {
      const da = a.entry.date || '9999';
      const db = b.entry.date || '9999';
      return da < db ? -1 : da > db ? 1 : a.index - b.index;
    });
}
