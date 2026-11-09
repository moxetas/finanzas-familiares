/**
 * Traducciones y formato de cifras y fechas según el idioma.
 * Números, meses y fechas se formatean con `Intl`, no a mano.
 */

import { ar } from './ar';
import { de } from './de';
import { en } from './en';
import { es, type MessageKey, type Messages } from './es';
import { fr } from './fr';
import { pl } from './pl';
import { ro } from './ro';

export type { MessageKey } from './es';

interface Locale {
  /** Etiqueta BCP 47 para `Intl` y `<html lang>`. */
  tag: string;
  /** Nombre del idioma en ese idioma, para elegirlo. */
  name: string;
  dir: 'ltr' | 'rtl';
  currency: string;
  messages: Messages;
}

/**
 * Idiomas disponibles, en el orden en que se ofrecen. Para añadir uno: su
 * archivo de textos (copia de `es.ts`) y una línea aquí.
 * En árabe las cifras van con números occidentales (`nu-latn`): así los
 * importes se escriben y se leen igual que en el banco.
 */
const LOCALES = {
  es: { tag: 'es-ES', name: 'Español', dir: 'ltr', currency: 'EUR', messages: es },
  de: { tag: 'de-DE', name: 'Deutsch', dir: 'ltr', currency: 'EUR', messages: de },
  en: { tag: 'en-GB', name: 'English', dir: 'ltr', currency: 'EUR', messages: en },
  pl: { tag: 'pl-PL', name: 'Polski', dir: 'ltr', currency: 'EUR', messages: pl },
  ro: { tag: 'ro-RO', name: 'Română', dir: 'ltr', currency: 'EUR', messages: ro },
  fr: { tag: 'fr-FR', name: 'Français', dir: 'ltr', currency: 'EUR', messages: fr },
  ar: { tag: 'ar-u-nu-latn', name: 'العربية', dir: 'rtl', currency: 'EUR', messages: ar },
} satisfies Record<string, Locale>;

export type Lang = keyof typeof LOCALES;
export const LANGS = Object.keys(LOCALES) as Lang[];

/** Idioma de una app nueva cuando el teléfono no está en ninguno de los disponibles. */
const FALLBACK: Lang = 'en';

export const isLang = (code: unknown): code is Lang => typeof code === 'string' && code in LOCALES;

/** Nombre de cada idioma en su propio idioma («Deutsch», «Polski»…). */
export function langName(code: Lang): string {
  return LOCALES[code].name;
}

/** El primero de los idiomas del teléfono que tenga la app (`de-AT` → `de`), o el inglés. */
export function detectLang(preferred: readonly string[] = typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language])): Lang {
  for (const tag of preferred) {
    const base = String(tag).toLowerCase().split(/[-_]/)[0];
    if (isLang(base)) return base;
  }
  return FALLBACK;
}

let currentLang: Lang = 'es';
let current: Locale = LOCALES.es;
let money: Intl.NumberFormat;
let moneyPlain: Intl.NumberFormat;
let moneyCompact: Intl.NumberFormat;

function build(): void {
  // `useGrouping: 'always'` hace que 1234 se escriba 1.234 también en español.
  const grouping = { useGrouping: 'always' } as unknown as Intl.NumberFormatOptions;
  money = new Intl.NumberFormat(current.tag, {
    style: 'currency',
    currency: current.currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...grouping,
  });
  moneyPlain = new Intl.NumberFormat(current.tag, { minimumFractionDigits: 2, maximumFractionDigits: 2, ...grouping });
  moneyCompact = new Intl.NumberFormat(current.tag, { notation: 'compact', maximumFractionDigits: 1 });
}
build();

export function setLocale(code: string): void {
  currentLang = isLang(code) ? code : 'es';
  current = LOCALES[currentLang];
  build();
  if (typeof document !== 'undefined') {
    document.documentElement.lang = currentLang;
    document.documentElement.dir = current.dir;
  }
}

export function currentLocale(): Lang {
  return currentLang;
}

/**
 * En árabe (de derecha a izquierda), una cifra va aislada para que el signo
 * y el símbolo € no salten al otro lado: «−250,00» y no «250,00−».
 */
const isolate = (s: string): string => (current.dir === 'rtl' ? `\u2066${s}\u2069` : s);

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
  const s = money.format(Math.abs(n)).replace(/[\u200e\u200f\u061c]/g, '');
  if (n < 0) return isolate(MINUS + s);
  if (opts.sign && n > 0) return isolate('+' + s);
  return isolate(s);
}

/** Igual pero sin el símbolo de moneda (para tablas). */
export function fmtNumber(n: number, opts: { sign?: boolean } = {}): string {
  const s = moneyPlain.format(Math.abs(n));
  if (n < 0) return isolate(MINUS + s);
  if (opts.sign && n > 0) return isolate('+' + s);
  return isolate(s);
}

/** Cifra corta para ejes: `12,3 mil`. */
export function fmtCompact(n: number): string {
  const s = moneyCompact.format(Math.abs(n));
  return isolate(n < 0 ? MINUS + s : s);
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
