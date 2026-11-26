/**
 * Meses de `history` (años anteriores, tal como estaban en la hoja).
 *
 * El saldo real que se apunta a fin de un mes es lo que ha sobrado en esa cuenta:
 * pasa al mes siguiente como una fila aparte, «Saldo del mes anterior», que suma
 * en el total de la columna. No toca la fila «Ahorrado» de la hoja: el ahorro es
 * otra cosa (lo que se aparta a propósito).
 */

import { isDebtLabel, norm } from './debts';
import { extrasEffect, monthExtras, type MonthExtras } from './extras';
import { historyCellKey, monthKey, realBalanceKey } from './keys';
import type { AppData } from './types';

/** Mes anterior a `ym` («2026-12» → «2026-11», «2026-01» → «2025-12»). */
export function prevMonth(ym: string): string {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  return m === 1 ? monthKey(y - 1, 12) : monthKey(y, m - 1);
}

/**
 * Fila «Saldo del mes anterior» de un mes de la hoja: por columna, el saldo real
 * apuntado a fin del mes anterior en la cuenta con ese nombre, o null.
 * Devuelve null si no hay ninguno.
 */
export function prevBalanceRow(data: AppData, ym: string): (number | null)[] | null {
  const m = data.history?.[ym];
  if (!m) return null;
  const prev = prevMonth(ym);
  const row = m.cols.map((name) => {
    const c = data.config.accounts.findIndex((a) => norm(a.name) === norm(name));
    const v = c >= 0 ? data.real_balances[realBalanceKey(prev, c)] : undefined;
    return typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  });
  return row.some((v) => v !== null) ? row : null;
}

/**
 * Un mes de la hoja tal como se ve en Meses: cifras con los cambios a mano, la fila
 * del saldo del mes anterior, filas extra y total de cada columna.
 * La fila «Deuda» es informativa: no cuenta en el total.
 */
export function historyMonth(data: AppData, ym: string): {
  edited: (number | null)[][];
  prevBalance: (number | null)[] | null;
  extras: MonthExtras;
  debtRows: boolean[];
  tot: number[];
} {
  const m = data.history![ym]!;
  const ovr = (ri: number, ci: number): number | undefined => data.overrides[historyCellKey(ym, ri, ci)];
  const edited = m.rows.map((r, ri) => r.v.map((orig, ci) => ovr(ri, ci) ?? orig));
  const prevBalance = prevBalanceRow(data, ym);
  const extras = monthExtras(data, ym, m.cols.length);
  const effect = extrasEffect(extras);
  const debtRows = m.rows.map((r) => isDebtLabel(r.l));
  const tot = m.tot.map((base, ci) => {
    let v = (base ?? 0) + (effect.delta[ci] ?? 0) + (prevBalance?.[ci] ?? 0);
    const sumAll = m.rows.reduce((acc, r) => acc + (r.v[ci] ?? 0), 0);
    // Si el total de la hoja incluía la deuda, se le quita.
    if (Math.abs((base ?? 0) - sumAll) < 0.02) m.rows.forEach((r, ri) => debtRows[ri] && (v -= r.v[ci] ?? 0));
    m.rows.forEach((r, ri) => {
      if (debtRows[ri]) return;
      const o = ovr(ri, ci);
      if (o !== undefined) v += o - (r.v[ci] ?? 0);
    });
    return Math.round(v * 100) / 100;
  });
  return { edited, prevBalance, extras, debtRows, tot };
}
