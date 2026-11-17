/**
 * Meses de `history` (años anteriores, tal como estaban en la hoja): la fila
 * «Ahorrado» es lo que cada cuenta traía del mes anterior. Si en el mes
 * anterior se apuntó el saldo real de esa cuenta, ese saldo pasa a la fila
 * «Ahorrado» del mes siguiente (salvo que la cifra se haya cambiado a mano).
 */

import { norm } from './debts';
import { historyCellKey, monthKey, realBalanceKey } from './keys';
import type { AppData } from './types';

/** Fila que hace de saldo traído del mes anterior. */
export const isCarryLabel = (label: string) => ['ahorrado', 'saldo anterior', 'saldo inicial'].includes(norm(label));

/** Mes anterior a `ym` («2026-12» → «2026-11», «2026-01» → «2025-12»). */
function prevMonth(ym: string): string {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  return m === 1 ? monthKey(y - 1, 12) : monthKey(y, m - 1);
}

/**
 * Cifras de la fila «Ahorrado» que vienen del saldo real del mes anterior,
 * por clave de celda (`historyCellKey`). Las celdas cambiadas a mano no se tocan.
 */
export function historyCarry(data: AppData, ym: string): Record<string, number> {
  const out: Record<string, number> = {};
  const m = data.history?.[ym];
  if (!m) return out;
  const row = m.rows.findIndex((r) => isCarryLabel(r.l));
  if (row < 0) return out;
  const prev = prevMonth(ym);
  data.config.accounts.forEach((a, c) => {
    const col = m.cols.findIndex((name) => norm(name) === norm(a.name));
    if (col < 0) return;
    const key = historyCellKey(ym, row, col);
    if (data.overrides[key] !== undefined) return;
    const real = data.real_balances[realBalanceKey(prev, c)];
    if (typeof real === 'number' && Number.isFinite(real)) out[key] = Math.round(real * 100) / 100;
  });
  return out;
}
