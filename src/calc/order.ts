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

// ── Orden de las filas (conceptos) de la tabla de Meses ────────────────────
//
// Se guarda una sola lista de nombres (`config.rowOrder`) para todos los meses
// y años: «Sueldo Alberto» sale en el mismo sitio en 2026 y en 2027. Una fila
// cuyo nombre no está en la lista (un concepto nuevo) sigue a la fila que
// tenía delante.

/** Más filas no se guardan en el orden (de sobra para cualquier hoja). */
export const MAX_ROW_ORDER = 1000;

/**
 * Clave de cada fila para ordenarla: su nombre, sin espacios a los lados. Si un
 * nombre se repite en la misma tabla, la segunda vez es `nombre#2`, etc.
 * Las filas con nombre `null` no se ordenan (p. ej. los apuntes).
 */
export function rowKeys(names: readonly (string | null)[]): (string | null)[] {
  const seen = new Map<string, number>();
  return names.map((raw) => {
    if (raw === null) return null;
    const name = raw.trim();
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    return n === 1 ? name : `${name}#${n}`;
  });
}

/**
 * Posiciones de `keys` en el orden en que se ven, según `order`. Las filas
 * que no están en `order` (o con clave `null`) van detrás de la fila que
 * tenían delante; si no tenían ninguna, al principio.
 */
export function sortedPositions(keys: readonly (string | null)[], order: readonly string[] | undefined): number[] {
  const idx = keys.map((_, i) => i);
  if (!order || order.length === 0) return idx;
  const pos = new Map(order.map((k, i) => [k, i] as const));
  let last = -0.5;
  const rank = keys.map((k) => {
    const p = k === null ? undefined : pos.get(k);
    if (p === undefined) return last + 0.25;
    last = p;
    return p;
  });
  return idx.sort((a, b) => rank[a]! - rank[b]! || a - b);
}

/**
 * Lista de orden nueva tras mover, en una tabla que muestra las filas `shown`
 * (claves en el orden en que se ven), la de la posición `from` a `to`. Las
 * filas de otras tablas que ya estaban en la lista no cambian de sitio.
 */
export function moveRow(order: readonly string[] | undefined, shown: readonly string[], from: number, to: number): string[] {
  const list = [...new Set(order ?? [])];
  if (from === to || from < 0 || to < 0 || from >= shown.length || to >= shown.length) return list;
  // Primero, las filas que se ven y no estaban en la lista entran donde se ven.
  let prev = -1;
  shown.forEach((key, i) => {
    let at = list.indexOf(key);
    if (at < 0) {
      if (prev >= 0) at = prev + 1;
      else {
        const next = shown.slice(i + 1).map((k) => list.indexOf(k)).find((x) => x >= 0);
        at = next ?? list.length;
      }
      list.splice(at, 0, key);
    }
    prev = at;
  });
  // Después, las filas que se ven se recolocan en los huecos que ocupaban.
  const moved = [...shown];
  const [item] = moved.splice(from, 1);
  moved.splice(to, 0, item!);
  const slots = shown.map((k) => list.indexOf(k)).sort((a, b) => a - b);
  slots.forEach((slot, i) => (list[slot] = moved[i]!));
  return list.slice(0, MAX_ROW_ORDER);
}
