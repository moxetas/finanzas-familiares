/** Claves y fechas. Sin DOM ni zona horaria: todo son cadenas AAAA-MM(-DD). */

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** `monthKey(2027, 3)` → `"2027-03"`. `month` va de 1 a 12. */
export function monthKey(year: number, month: number): string {
  return `${year}-${pad2(month)}`;
}

export function itemOverrideKey(ym: string, itemIndex: number): string {
  return `${ym}_i${itemIndex}`;
}

export function paymentOverrideKey(ym: string, paymentIndex: number): string {
  return `${ym}_p${paymentIndex}`;
}

export function realBalanceKey(ym: string, accountIndex: number): string {
  return `${ym}_c${accountIndex}`;
}

/** Separa una clave `"AAAA-MM_x<n>"` en sus partes, o `null` si no tiene ese formato. */
export function parseIndexedKey(key: string): { ym: string; kind: string; index: number } | null {
  const m = /^(\d{4}-\d{2})_([a-z])(\d+)$/.exec(key);
  if (!m) return null;
  return { ym: m[1]!, kind: m[2]!, index: Number(m[3]) };
}

/** Año y mes (1-12) de una fecha `AAAA-MM-DD`, o `null` si no es válida. */
export function parseDate(date: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Días entre dos fechas `AAAA-MM-DD` (b − a). */
export function daysBetween(a: string, b: string): number {
  const pa = parseDate(a);
  const pb = parseDate(b);
  if (!pa || !pb) return NaN;
  const ta = Date.UTC(pa.year, pa.month - 1, pa.day);
  const tb = Date.UTC(pb.year, pb.month - 1, pb.day);
  return Math.round((tb - ta) / 86_400_000);
}

/** Fecha local de hoy como `AAAA-MM-DD`. */
export function todayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}
