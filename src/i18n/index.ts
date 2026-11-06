/**
 * Traducciones y formato de cifras y fechas según el idioma.
 * Números, meses y fechas se formatean con `Intl`, no a mano.
 */

import { es, type MessageKey, type Messages } from './es';

export type { MessageKey } from './es';

interface Locale {
  /** Etiqueta BCP 47 para `Intl` y `<html lang>`. */
  tag: string;
  currency: string;
  messages: Messages;
}

/** Idiomas disponibles. Para añadir uno: `en: { tag: 'en-GB', currency: 'EUR', messages: en }`. */
const LOCALES: Record<string, Locale> = {
  es: { tag: 'es-ES', currency: 'EUR', messages: es },
};

let current: Locale = LOCALES['es']!;
let money: Intl.NumberFormat;
let moneyPlain: Intl.NumberFormat;
let moneyCompact: Intl.NumberFormat;

function build(): void {
  // `useGrouping: 'always'` hace que 1234 se escriba 1.234 también en español.
  const grouping = { useGrouping: 'always' } as unknown as Intl.NumberFormatOptions;
  money = new Intl.NumberFormat(current.tag, {
    style: 'currency',
    currency: current.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...grouping,
  });
  moneyPlain = new Intl.NumberFormat(current.tag, { minimumFractionDigits: 2, maximumFractionDigits: 2, ...grouping });
  moneyCompact = new Intl.NumberFormat(current.tag, { notation: 'compact', maximumFractionDigits: 1 });
}
build();

export function setLocale(code: string): void {
  current = LOCALES[code] ?? LOCALES['es']!;
  build();
  document.documentElement.lang = current.tag;
}

export function localeTag(): string {
  return current.tag;
}

/** Texto traducido, con `{variables}` sustituidas. */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  let s: string = current.messages[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

const MINUS = '−';

/** `1234.5` → `1.234,50 €`. Con `sign`, los positivos llevan `+`. */
export function fmtMoney(n: number, opts: { sign?: boolean } = {}): string {
  const s = money.format(Math.abs(n));
  if (n < 0) return MINUS + s;
  if (opts.sign && n > 0) return '+' + s;
  return s;
}

/** Igual pero sin el símbolo de moneda (para tablas). */
export function fmtNumber(n: number, opts: { sign?: boolean } = {}): string {
  const s = moneyPlain.format(Math.abs(n));
  if (n < 0) return MINUS + s;
  if (opts.sign && n > 0) return '+' + s;
  return s;
}

/** Cifra corta para ejes: `12,3 mil`. */
export function fmtCompact(n: number): string {
  const s = moneyCompact.format(Math.abs(n));
  return n < 0 ? MINUS + s : s;
}

/** Importe en un campo de texto: `1234,5` (sin separador de miles ni símbolo). */
export function fmtInput(n: number): string {
  return new Intl.NumberFormat(current.tag, { maximumFractionDigits: 2, useGrouping: false }).format(n);
}

/** Nombre del mes (1-12): `long` → «marzo», `short` → «mar». Con mayúscula inicial. */
export function monthName(month: number, style: 'long' | 'short' = 'long'): string {
  const d = new Date(Date.UTC(2000, month - 1, 1));
  const s = new Intl.DateTimeFormat(current.tag, { month: style, timeZone: 'UTC' }).format(d).replace('.', '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** `AAAA-MM` → «marzo de 2027». */
export function fmtYearMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1, 1));
  const s = new Intl.DateTimeFormat(current.tag, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** `AAAA-MM-DD` → «vie, 15 mar» (o con año si `year`). */
export function fmtDate(iso: string, opts: { year?: boolean; weekday?: boolean } = {}): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  if (!y || !m || !d) return iso;
  const date = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat(current.tag, {
    weekday: opts.weekday ? 'short' : undefined,
    day: 'numeric',
    month: 'short',
    year: opts.year ? 'numeric' : undefined,
    timeZone: 'UTC',
  }).format(date);
}

/** Fecha y hora local de una marca ISO, para «última copia». */
export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(current.tag, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}
