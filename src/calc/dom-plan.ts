/**
 * Domiciliaciones que ponen sus cargos en la tabla del mes.
 *
 * Al guardar una domiciliación con «cada cuánto se paga», la app crea sola lo
 * que toca: cada mes → un concepto mensual (Gastos); cada 2, 3, 6 o 12 meses →
 * un pago en cada fecha de cargo, en el mismo bloque que los demás pagos (p. ej.
 * «Pagos de este mes · salen del bote»). Todo queda enlazado con `link`, así que
 * al cambiar o borrar la domiciliación se cambian o se quitan sus cargos.
 */
import { daysInMonth, parseDate } from './keys';
import { round2 } from './money';
import { addItem, addPayment, defaultPaymentGroup, removeItem, removePayment, updateItem } from './mutations';
import type { AppData, Config, DomPlan, DomRow, ItemType } from './types';

export const EVERY_OPTIONS = [1, 2, 3, 6, 12] as const;

const pad = (n: number) => String(n).padStart(2, '0');

/** Fechas de los cargos: desde el primero, cada `every` meses, hasta el 31-12 de `untilYear`. */
export function planDates(first: string, every: number, untilYear: number): string[] {
  const f = parseDate(first);
  if (!f || !(every >= 1)) return [];
  const out: string[] = [];
  for (let k = 0; k < 120; k++) {
    const mi = f.month - 1 + k * every;
    const y = f.year + Math.floor(mi / 12);
    const m = (mi % 12) + 1;
    if (y > untilYear) break;
    out.push(`${y}-${pad(m)}-${pad(Math.min(f.day, daysInMonth(y, m)))}`);
  }
  return out;
}

/** « 1/2», « 2/2»… según qué cargo es dentro de su año; nada si es anual. */
export function chargeLabel(date: string, first: string, every: number): string {
  if (every >= 12) return '';
  const m = parseDate(date)?.month ?? 1;
  const start = ((parseDate(first)?.month ?? 1) - 1) % every;
  return ` ${Math.floor((m - 1 - start) / every) + 1}/${Math.round(12 / every)}`;
}

/** Bloque propio que más usan los conceptos de ese tipo, o '' (el bloque normal). */
export function defaultItemGroup(config: Config, type: ItemType): string {
  const sections = config.sections ?? [];
  const count = new Map<string, number>();
  for (const it of config.items) {
    if (it.type !== type) continue;
    const g = it.group && sections.includes(it.group) ? it.group : '';
    count.set(g, (count.get(g) ?? 0) + 1);
  }
  let best = '';
  let max = 0;
  for (const [g, n] of count) if (g && n > max) [best, max] = [g, n];
  return max >= (count.get('') ?? 0) ? best : '';
}

/** Bloque de la tabla del mes donde irán los cargos (para enseñarlo en el formulario). */
export function planGroup(config: Config, every: number): string {
  return every === 1 ? defaultItemGroup(config, 'Gasto') : defaultPaymentGroup(config);
}

/**
 * Quita los cargos de la domiciliación desde `fromDate` (los anteriores ya se
 * cobraron y se quedan). El concepto mensual termina el mes anterior.
 */
export function removePlanCharges(data: AppData, link: string, fromDate: string): AppData {
  let next = data;
  for (let i = next.config.payments.length - 1; i >= 0; i--) {
    const p = next.config.payments[i]!;
    if (p.dom === link && p.date >= fromDate) next = removePayment(next, i);
  }
  const f = parseDate(fromDate);
  for (let i = next.config.items.length - 1; i >= 0; i--) {
    const it = next.config.items[i]!;
    if (it.dom !== link || !f) continue;
    const year = next.config.year;
    if (f.year > year) continue;
    if (f.year < year || f.month <= it.from_month) next = removeItem(next, i);
    else next = updateItem(next, i, { ...it, to_month: Math.min(it.to_month, f.month - 1) });
  }
  return next;
}

/** Pone en la tabla del mes los cargos de la domiciliación con fecha desde `fromDate`. */
export function addPlanCharges(data: AppData, plan: DomPlan, concept: string, amount: number, fromDate: string): AppData {
  const account = plan.account < data.config.accounts.length ? plan.account : 0;
  const value = round2(Math.abs(amount));
  if (!value) return data;
  const year = data.config.year;
  if (plan.every === 1) {
    const begin = parseDate(plan.first > fromDate ? plan.first : fromDate);
    if (!begin || begin.year > year) return data;
    const group = defaultItemGroup(data.config, 'Gasto');
    return addItem(data, {
      name: concept,
      type: 'Gasto',
      amount: value,
      account,
      to: -1,
      from_month: begin.year < year ? 1 : begin.month,
      to_month: 12,
      ...(group ? { group } : {}),
      dom: plan.link,
    });
  }
  const until = Math.max(year, parseDate(plan.first)?.year ?? year) + 1;
  const group = defaultPaymentGroup(data.config);
  let next = data;
  for (const date of planDates(plan.first, plan.every, until)) {
    if (date < fromDate) continue;
    next = addPayment(next, {
      date,
      concept: concept + chargeLabel(date, plan.first, plan.every),
      amount: value,
      account,
      estimated: false,
      ...(group ? { group } : {}),
      dom: plan.link,
    });
  }
  return next;
}

/** Lo que una domiciliación tiene en la tabla del mes desde `fromDate`, para enseñarlo antes de borrar. */
export function planCharges(data: AppData, row: DomRow, fromDate: string): { payments: number[]; items: number[] } {
  const link = row.plan?.link;
  if (link) {
    return {
      payments: data.config.payments.flatMap((p, i) => (p.dom === link && p.date >= fromDate ? [i] : [])),
      items: data.config.items.flatMap((it, i) => (it.dom === link ? [i] : [])),
    };
  }
  // Domiciliaciones antiguas (sin enlace): se proponen los pagos y gastos sin enlace con el mismo importe.
  const cost = row.cost === null ? null : round2(Math.abs(row.cost));
  if (!cost) return { payments: [], items: [] };
  return {
    payments: data.config.payments.flatMap((p, i) => (!p.dom && p.date >= fromDate && round2(p.amount) === cost ? [i] : [])),
    items: data.config.items.flatMap((it, i) => (!it.dom && it.type === 'Gasto' && round2(it.amount) === cost ? [i] : [])),
  };
}

/** Quita de la tabla del mes los cargos elegidos de una domiciliación sin enlace (ver `planCharges`). */
export function removeCharges(data: AppData, found: { payments: number[]; items: number[] }, fromDate: string): AppData {
  let next = data;
  for (const i of [...found.payments].sort((a, b) => b - a)) next = removePayment(next, i);
  const f = parseDate(fromDate);
  for (const i of [...found.items].sort((a, b) => b - a)) {
    const it = next.config.items[i];
    if (!it || !f) continue;
    if (f.year > next.config.year) continue;
    if (f.year < next.config.year || f.month <= it.from_month) next = removeItem(next, i);
    else next = updateItem(next, i, { ...it, to_month: Math.min(it.to_month, f.month - 1) });
  }
  return next;
}
