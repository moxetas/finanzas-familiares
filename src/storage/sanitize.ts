/**
 * Limpia datos que vienen de fuera (una copia importada o lo guardado en el
 * navegador) para que la app nunca se rompa por un archivo raro: números
 * finitos, textos acotados, índices de cuenta válidos y claves con el formato
 * esperado. Lo que no se puede arreglar se descarta.
 */

import { parseDate } from '../calc/keys';
import { round2 } from '../calc/money';
import type { BtcTrade, SalaryPerson, Account, AppData, Debt, Domiciliaciones, Entry, EntryType, HistoryMonth, Item, ItemType, Payment } from '../calc/types';

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
    .map((a, i): Account => ({
      name: cleanText(a['name']) || `${defaultAccountName} ${i + 1}`,
      initial: num(a['initial']),
      ...(a['spent'] === true ? { spent: true } : {}),
    }));
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
      const rawAccount = int(it['account'], 0);
      // Un ahorro puede venir de fuera de tus cuentas (-1), p. ej. lo que paga la empresa.
      const account = type === 'Ahorro' && rawAccount === -1 ? -1 : acc(it['account']);
      const rawTo = int(it['to'], -1);
      const to = type === 'Ahorro' && rawTo >= 0 && rawTo < n && rawTo !== account ? rawTo : -1;
      let from = month(it['from_month'], 1);
      let until = month(it['to_month'], 12);
      if (from > until) [from, until] = [until, from];
      const item: Item = {
        name: cleanText(it['name']) || '—',
        type,
        amount: Math.abs(num(it['amount'])),
        account,
        to,
        from_month: from,
        to_month: until,
      };
      const note = cleanText(it['note'], LIMITS.note);
      const group = cleanText(it['group'], 120);
      if (note) item.note = note;
      if (group) item.group = group;
      if (it['estimated'] === true) item.estimated = true;
      return item;
    });

  const payments: Payment[] = [];
  for (const p of arr(cfg['payments']).filter(isObj).slice(0, MAX.payments)) {
    const date = typeof p['date'] === 'string' ? p['date'].slice(0, 10) : '';
    if (!parseDate(date)) continue;
    const pay: Payment = {
      date,
      concept: cleanText(p['concept']) || '—',
      amount: Math.abs(num(p['amount'])),
      account: acc(p['account']),
      estimated: p['estimated'] === true,
    };
    const note = cleanText(p['note'], LIMITS.note);
    const group = cleanText(p['group'], 120);
    if (note) pay.note = note;
    if (group) pay.group = group;
    payments.push(pay);
  }

  const overrides = numericDict(root['overrides'], /^\d{4}-\d{2}_([ip]\d+|r\d+_c\d+|f[0-2]_c\d+|t_c\d+)$/, (key) => {
    const m = /_([ip])(\d+)$/.exec(key);
    if (!m) return true; // cifra de un mes de `history`, fila libre o traspaso
    const [, kind, idx] = m;
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

  const sections = arr(cfg['sections']).map((x) => cleanText(x, 120)).filter(Boolean).slice(0, 40);
  const debts: Debt[] = arr(cfg['debts'])
    .filter(isObj)
    .slice(0, 20)
    .map((d) => ({
      name: cleanText(d['name']) || '—',
      account: acc(d['account']),
      amount: Math.abs(num(d['amount'])),
      match: cleanText(d['match'], 60),
      note: cleanText(d['note'], LIMITS.note),
    }))
    .filter((d) => d.match);

  const freeLabels: Record<string, string> = {};
  if (isObj(cfg['freeLabels'])) {
    for (const [k, v] of Object.entries(cfg['freeLabels']).slice(0, 2000)) {
      const label = cleanText(v, 80);
      if (/^\d{4}-\d{2}_f[0-2]$/.test(k) && label) freeLabels[k] = label;
    }
  }
  const freeRowsBefore = cleanText(cfg['freeRowsBefore'], 120);
  const salaries = sanitizeSalaries(cfg['salaries']);
  const btc = sanitizeBtc(cfg['btc']);

  const out: AppData = {
    config: {
      year,
      example: cfg['example'] === true,
      accounts,
      items,
      payments,
      ...(sections.length ? { sections } : {}),
      ...(debts.length ? { debts } : {}),
      ...(Object.keys(freeLabels).length ? { freeLabels } : {}),
      ...(freeRowsBefore ? { freeRowsBefore } : {}),
      ...(salaries.length ? { salaries } : {}),
      ...(btc.length ? { btc } : {}),
    },
    overrides,
    real_balances,
    entries,
  };
  const history = sanitizeHistory(root['history']);
  if (history) out.history = history;
  const dom = sanitizeDom(root['domiciliaciones']);
  if (dom) out.domiciliaciones = dom;
  return out;
}

function nullableNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? round2(v) : null;
}

function sanitizeHistory(raw: unknown): Record<string, HistoryMonth> | undefined {
  if (!isObj(raw)) return undefined;
  const out: Record<string, HistoryMonth> = {};
  for (const [ym, m] of Object.entries(raw).slice(0, 36)) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym) || !isObj(m)) continue;
    const cols = arr(m['cols']).map((c) => cleanText(c)).slice(0, 12);
    if (cols.length === 0) continue;
    const fit = (v: unknown) => cols.map((_, i) => nullableNum(arr(v)[i]));
    out[ym] = {
      title: cleanText(m['title'], 80) || ym,
      cols,
      rows: arr(m['rows'])
        .filter(isObj)
        .slice(0, 120)
        .map((r) => ({ l: cleanText(r['l'], 120) || '—', v: fit(r['v']) })),
      tot: fit(m['tot']),
    };
  }
  return Object.keys(out).length ? out : undefined;
}

function sanitizeDom(raw: unknown): Domiciliaciones | undefined {
  if (!isObj(raw)) return undefined;
  const accounts = arr(raw['accounts'])
    .filter(isObj)
    .slice(0, 30)
    .map((a) => ({ name: cleanText(a['name'], 120), alias: cleanText(a['alias'], 60) }));
  const groups = arr(raw['groups'])
    .filter(isObj)
    .slice(0, 20)
    .map((g) => ({
      title: cleanText(g['title'], 120),
      rows: arr(g['rows'])
        .filter(isObj)
        .slice(0, 100)
        .map((r) => ({
          n: nullableNum(r['n']),
          c: cleanText(r['c'], 300),
          t: cleanText(r['t'], 60),
          cost: nullableNum(r['cost']),
          from: cleanText(r['from'], 60),
          to: cleanText(r['to'], 60),
        })),
    }));
  return groups.length ? { accounts, groups } : undefined;
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
    // Solo los importes de conceptos y pagos son siempre positivos; el resto puede ser negativo.
    out[key] = positive && /_[ip]\d+$/.test(key) ? Math.abs(round2(value)) : round2(value);
    count++;
  }
  return out;
}

/** Identificador corto y único para apuntes. */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}


const YM = /^\d{4}-(0[1-9]|1[0-2])$/;

function ymDict(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObj(v)) return out;
  for (const [k, x] of Object.entries(v).slice(0, 600)) {
    if (YM.test(k) && typeof x === 'number' && Number.isFinite(x)) out[k] = round2(x);
  }
  return out;
}

/** Sueldos: personas con contratos y meses (AAAA-MM → importe). */
export function sanitizeSalaries(v: unknown): SalaryPerson[] {
  return arr(v)
    .filter(isObj)
    .slice(0, 10)
    .map((p) => {
      const estimates = ymDict(p['estimates']);
      return {
        name: cleanText(p['name']) || '—',
        contracts: arr(p['contracts'])
          .filter(isObj)
          .slice(0, 30)
          .map((c) => ({ from: typeof c['from'] === 'string' && YM.test(c['from']) ? c['from'] : '', name: cleanText(c['name']) }))
          .filter((c) => c.from),
        months: ymDict(p['months']),
        ...(Object.keys(estimates).length ? { estimates } : {}),
      };
    });
}

/** Operaciones de BTC. */
export function sanitizeBtc(v: unknown): BtcTrade[] {
  const out: BtcTrade[] = [];
  for (const t of arr(v).filter(isObj).slice(0, 2000)) {
    const date = typeof t['date'] === 'string' ? t['date'].slice(0, 10) : '';
    const qty = typeof t['qty'] === 'number' && Number.isFinite(t['qty']) ? Math.round(t['qty'] * 1e8) / 1e8 : NaN;
    if (!parseDate(date) || !Number.isFinite(qty)) continue;
    out.push({ date, qty, price: num(t['price']), paid: num(t['paid']) });
  }
  return out;
}
