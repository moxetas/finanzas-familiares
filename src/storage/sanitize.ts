/**
 * Limpia datos que vienen de fuera (una copia importada o lo guardado en el
 * navegador) para que la app nunca se rompa por un archivo raro: números
 * finitos, textos acotados, índices de cuenta válidos y claves con el formato
 * esperado. Lo que no se puede arreglar se descarta.
 */

import { parseDate } from '../calc/keys';
import { round2 } from '../calc/money';
import type { Account, AppData, Entry, EntryType, Item, ItemType, Payment } from '../calc/types';

const ITEM_TYPES: readonly ItemType[] = ['Ingreso', 'Gasto', 'Ahorro'];
const ENTRY_TYPES: readonly EntryType[] = ['Ingreso', 'Gasto'];
const MAX = { accounts: 30, items: 300, payments: 500, entries: 5000, keys: 20000 };

export const LIMITS = { name: 60, note: 300 } as const;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? round2(n) : fallback;
}

/** Texto sin caracteres de control, sin espacios sobrantes y con longitud máxima. */
export function cleanText(v: unknown, max: number = LIMITS.name): string {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function int(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isInteger(n) ? n : fallback;
}

function month(v: unknown, fallback: number): number {
  return Math.min(12, Math.max(1, int(v, fallback)));
}

/**
 * Convierte cualquier cosa en datos válidos. `fallbackYear` y
 * `defaultAccountName` se usan si faltan el año o todas las cuentas.
 */
export function sanitizeData(raw: unknown, fallbackYear: number, defaultAccountName: string): AppData {
  const root = isObj(raw) ? raw : {};
  const cfg = isObj(root['config']) ? root['config'] : {};

  let year = int(cfg['year'], fallbackYear);
  if (year < 1900 || year > 2200) year = fallbackYear;

  const accounts: Account[] = arr(cfg['accounts'])
    .filter(isObj)
    .slice(0, MAX.accounts)
    .map((a, i) => ({ name: cleanText(a['name']) || `${defaultAccountName} ${i + 1}`, initial: num(a['initial']) }));
  if (accounts.length === 0) accounts.push({ name: defaultAccountName, initial: 0 });
  const n = accounts.length;
  const acc = (v: unknown): number => {
    const c = int(v, 0);
    return c >= 0 && c < n ? c : 0;
  };

  const items: Item[] = arr(cfg['items'])
    .filter(isObj)
    .slice(0, MAX.items)
    .map((it) => {
      const type = ITEM_TYPES.includes(it['type'] as ItemType) ? (it['type'] as ItemType) : 'Gasto';
      const account = acc(it['account']);
      const rawTo = int(it['to'], -1);
      const to = type === 'Ahorro' && rawTo >= 0 && rawTo < n && rawTo !== account ? rawTo : -1;
      let from = month(it['from_month'], 1);
      let until = month(it['to_month'], 12);
      if (from > until) [from, until] = [until, from];
      return {
        name: cleanText(it['name']) || '—',
        type,
        amount: Math.abs(num(it['amount'])),
        account,
        to,
        from_month: from,
        to_month: until,
      };
    });

  const payments: Payment[] = [];
  for (const p of arr(cfg['payments']).filter(isObj).slice(0, MAX.payments)) {
    const date = typeof p['date'] === 'string' ? p['date'].slice(0, 10) : '';
    if (!parseDate(date)) continue;
    payments.push({
      date,
      concept: cleanText(p['concept']) || '—',
      amount: Math.abs(num(p['amount'])),
      account: acc(p['account']),
      estimated: p['estimated'] === true,
    });
  }

  const overrides = numericDict(root['overrides'], /^\d{4}-\d{2}_[ip]\d+$/, (key) => {
    const [, kind, idx] = /_([ip])(\d+)$/.exec(key)!;
    const limit = kind === 'i' ? items.length : payments.length;
    return Number(idx) < limit;
  }, true);
  const real_balances = numericDict(root['real_balances'], /^\d{4}-\d{2}_c\d+$/, (key) => {
    return Number(/_c(\d+)$/.exec(key)![1]) < n;
  }, false);

  const entries: Entry[] = [];
  const seen = new Set<string>();
  for (const e of arr(root['entries']).filter(isObj).slice(0, MAX.entries)) {
    const date = typeof e['date'] === 'string' && parseDate(e['date'].slice(0, 10)) ? e['date'].slice(0, 10) : '';
    let ym = typeof e['month'] === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(e['month']) ? e['month'] : '';
    if (!ym && date) ym = date.slice(0, 7);
    if (!ym) continue;
    let id = cleanText(e['id'], 64);
    if (!id || seen.has(id)) id = newId();
    seen.add(id);
    entries.push({
      id,
      month: ym,
      concept: cleanText(e['concept']) || '—',
      amount: Math.abs(num(e['amount'])),
      type: ENTRY_TYPES.includes(e['type'] as EntryType) ? (e['type'] as EntryType) : 'Gasto',
      date: date.startsWith(ym) ? date : '',
      account: acc(e['account']),
      note: cleanText(e['note'], LIMITS.note),
    });
  }

  return {
    config: { year, example: cfg['example'] === true, accounts, items, payments },
    overrides,
    real_balances,
    entries,
  };
}

function numericDict(
  v: unknown,
  pattern: RegExp,
  valid: (key: string) => boolean,
  positive: boolean,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObj(v)) return out;
  let count = 0;
  for (const [key, value] of Object.entries(v)) {
    if (count >= MAX.keys) break;
    if (!pattern.test(key) || !valid(key)) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    out[key] = positive ? Math.abs(round2(value)) : round2(value);
    count++;
  }
  return out;
}

/** Identificador corto y único para apuntes. */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

