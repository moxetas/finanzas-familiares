/** Redondeo a céntimos, para que 0,1 + 0,2 no dé 0,30000000000000004. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function sum(values: readonly number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return round2(total);
}

/**
 * Lee un importe escrito a mano, al estilo español o internacional:
 * `"1.234,56"`, `"1234.56"`, `"12,5"`, `"1.500"`, `"-20 €"`.
 * Devuelve `null` si no es un número.
 */
export function parseAmount(input: string): number | null {
  let s = input.replace(/[\s  €]/g, '');
  if (s === '') return null;
  let sign = 1;
  if (s.startsWith('-') || s.startsWith('−')) {
    sign = -1;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    // El último separador es el decimal; el otro agrupa miles.
    const decimal = lastComma > lastDot ? ',' : '.';
    const thousands = decimal === ',' ? '.' : ',';
    s = s.split(thousands).join('').replace(decimal, '.');
  } else if (lastComma >= 0) {
    if ((s.match(/,/g) ?? []).length > 1) {
      if (!/^\d{1,3}(,\d{3})+$/.test(s)) return null;
      s = s.split(',').join('');
    } else {
      s = s.replace(',', '.');
    }
  } else if (lastDot >= 0 && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    // "1.500" o "12.345.678": en español el punto agrupa miles.
    s = s.split('.').join('');
  }
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? round2(sign * n) : null;
}
