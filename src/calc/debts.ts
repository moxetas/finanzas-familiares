/**
 * Deudas que bajan con los pagos (por ejemplo, la de Bankia con la tarjeta de crédito).
 *
 * - La fila «Deuda» es solo informativa: no suma ni resta en el total de la columna.
 * - En el año planificado, la deuda de cada mes es la del mes anterior menos lo que se
 *   pagó ese mes anterior con las partidas cuyo nombre empieza por el texto de la deuda
 *   (`match`, p. ej. «Tarjeta»). Es decir: la deuda que se ve en enero es la de
 *   diciembre menos la tarjeta de diciembre.
 * - El punto de partida sale del diciembre anterior guardado en `history` (filas
 *   «Deuda» y «Tarjeta…» de la columna de esa cuenta). Si no lo hay, de `debt.amount`.
 */

import { historyCellKey, monthKey, parseDate, paymentOverrideKey, itemOverrideKey } from './keys';
import { round2 } from './money';
import type { AppData, Debt, HistoryMonth } from './types';

/** Texto sin mayúsculas, tildes ni espacios sobrantes, para comparar nombres. */
export function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ');
}

export const isDebtLabel = (label: string) => norm(label) === 'deuda';

/** Cifra (con los cambios hechos a mano) de una fila y columna de un mes de `history`. */
function histValue(data: AppData, ym: string, m: HistoryMonth, row: number, col: number): number {
  const o = data.overrides[historyCellKey(ym, row, col)];
  return typeof o === 'number' ? o : (m.rows[row]?.v[col] ?? 0);
}

/** Columna de `history` que corresponde a una cuenta (por nombre). */
function histCol(m: HistoryMonth, accountName: string): number {
  return m.cols.findIndex((c) => norm(c) === norm(accountName));
}

/** Deudas a vigilar: las de `config.debts` y, si no hay, las que aparecen en el diciembre anterior. */
export function debtList(data: AppData): Debt[] {
  const { config } = data;
  const list: Debt[] = [...(config.debts ?? [])];
  const dec = data.history?.[monthKey(config.year - 1, 12)];
  if (!dec) return list;
  const debtRow = dec.rows.findIndex((r) => isDebtLabel(r.l));
  if (debtRow < 0) return list;
  const card = dec.rows.find((r) => norm(r.l).startsWith('tarjeta'));
  config.accounts.forEach((a, account) => {
    if (list.some((d) => d.account === account)) return;
    const col = histCol(dec, a.name);
    if (col < 0 || !histValue(data, monthKey(config.year - 1, 12), dec, debtRow, col)) return;
    list.push({ name: dec.rows[debtRow]!.l, account, amount: 0, match: card ? card.l.split(' ')[0]! : 'Tarjeta' });
  });
  return list;
}

/** Deuda con la que empieza enero: la de diciembre menos lo pagado en diciembre. */
function opening(data: AppData, debt: Debt): number {
  const { config } = data;
  const ym = monthKey(config.year - 1, 12);
  const dec = data.history?.[ym];
  const account = config.accounts[debt.account];
  if (dec && account) {
    const col = histCol(dec, account.name);
    const debtRow = dec.rows.findIndex((r) => isDebtLabel(r.l));
    if (col >= 0 && debtRow >= 0) {
      const owed = Math.abs(histValue(data, ym, dec, debtRow, col));
      let paid = 0;
      dec.rows.forEach((r, ri) => {
        if (ri !== debtRow && norm(r.l).startsWith(norm(debt.match))) paid += Math.abs(histValue(data, ym, dec, ri, col));
      });
      if (owed) return round2(owed - paid);
    }
  }
  return debt.amount;
}

/** Lo pagado de la deuda en un mes del año planificado (pagos y conceptos que empiezan por `match`). */
function paidIn(data: AppData, debt: Debt, month: number): number {
  const { config, overrides } = data;
  const ym = monthKey(config.year, month);
  const match = norm(debt.match);
  let paid = 0;
  config.payments.forEach((p, index) => {
    const d = parseDate(p.date);
    if (!d || d.year !== config.year || d.month !== month || !norm(p.concept).startsWith(match)) return;
    const o = overrides[paymentOverrideKey(ym, index)];
    paid += Math.abs(typeof o === 'number' ? o : p.amount);
  });
  config.items.forEach((it, index) => {
    if (it.account !== debt.account || month < it.from_month || month > it.to_month || !norm(it.name).startsWith(match)) return;
    const o = overrides[itemOverrideKey(ym, index)];
    paid += Math.abs(typeof o === 'number' ? o : it.amount);
  });
  return paid;
}

/** Lo que queda de cada deuda al empezar el mes `month` del año planificado. */
export function debtsAt(data: AppData, month: number): { name: string; account: number; remaining: number; note: string }[] {
  return debtList(data).map((debt) => {
    let remaining = opening(data, debt);
    for (let m = 1; m < month; m++) remaining -= paidIn(data, debt, m);
    // Es lo que queda al empezar el mes: un nombre «… al acabar el mes» confundiría.
    const name = debt.name.replace(/\s*al acabar el mes/i, '').trim() || debt.name;
    return { name, account: debt.account, remaining: Math.max(0, round2(remaining)), note: debt.note ?? '' };
  });
}
