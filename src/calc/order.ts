/**
 * Orden en que se muestran las cuentas. Las cuentas se guardan y se usan por
 * su índice en `config.accounts`; el orden elegido por la persona se guarda
 * aparte (`config.accountOrder`) para no tener que renumerar nada.
 */

import type { Config } from './types';

/**
 * Índices de las cuentas en el orden en que se ven.
 * - Sin orden guardado: el orden en que se crearon.
 * - Con orden guardado: ese orden, sin índices repetidos ni inexistentes. Las
 *   cuentas que no estén (las creadas después de ordenar) salen las primeras,
 *   la más nueva delante, para que se vean sin desplazar la tabla.
 */
export function accountOrder(config: Pick<Config, 'accounts' | 'accountOrder'>): number[] {
  const n = config.accounts.length;
  if (!config.accountOrder) return Array.from({ length: n }, (_, i) => i);
  const seen = new Set<number>();
  const kept: number[] = [];
  for (const i of config.accountOrder) {
    if (Number.isInteger(i) && i >= 0 && i < n && !seen.has(i)) {
      seen.add(i);
      kept.push(i);
    }
  }
  const missing: number[] = [];
  for (let i = n - 1; i >= 0; i--) if (!seen.has(i)) missing.push(i);
  return [...missing, ...kept];
}

/** `items` reordenados según `order` (índices de `items`). */
export function inOrder<T>(items: readonly T[], order: readonly number[]): { item: T; index: number }[] {
  return order.flatMap((index) => (index < items.length ? [{ item: items[index]!, index }] : []));
}
