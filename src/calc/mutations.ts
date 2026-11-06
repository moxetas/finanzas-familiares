/**
 * Cambios en los datos que tienen que mantener los índices coherentes.
 * Todas son puras: devuelven un `AppData` nuevo y no tocan el original.
 */

import { itemOverrideKey, parseIndexedKey, paymentOverrideKey, realBalanceKey } from './keys';
import { round2 } from './money';
import type { Account, AppData, Config, Entry, Item, Payment } from './types';

/** Copia superficial con arrays y objetos de primer nivel nuevos. */
function cloneData(data: AppData): AppData {
  return {
    config: {
      ...data.config,
      accounts: data.config.accounts.map((a) => ({ ...a })),
      items: data.config.items.map((i) => ({ ...i })),
      payments: data.config.payments.map((p) => ({ ...p })),
    },
    overrides: { ...data.overrides },
    real_balances: { ...data.real_balances },
    entries: data.entries.map((e) => ({ ...e })),
  };
}

/**
 * Reescribe las claves `AAAA-MM_<kind><n>` de un diccionario: borra las del
 * índice quitado y baja una posición las de índices mayores.
 */
function shiftKeys(dict: Record<string, number>, kind: string, removed: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(dict)) {
    const parsed = parseIndexedKey(key);
    if (!parsed || parsed.kind !== kind) {
      out[key] = value;
      continue;
    }
    if (parsed.index === removed) continue;
    const index = parsed.index > removed ? parsed.index - 1 : parsed.index;
    out[`${parsed.ym}_${kind}${index}`] = value;
  }
  return out;
}

// ── Cuentas ────────────────────────────────────────────────────────────────

export function addAccount(data: AppData, account: Account): AppData {
  const next = cloneData(data);
  next.config.accounts.push({ name: account.name, initial: round2(account.initial) });
  return next;
}

export function updateAccount(data: AppData, index: number, account: Account): AppData {
  if (!data.config.accounts[index]) return data;
  const next = cloneData(data);
  next.config.accounts[index] = { name: account.name, initial: round2(account.initial) };
  return next;
}

/**
 * Quita la cuenta `index`. Lo que la usaba pasa a la cuenta `reassignTo`
 * (índice anterior al borrado):
 * - conceptos, pagos y apuntes de esa cuenta pasan a `reassignTo`;
 * - los traspasos que iban a ella van a `reassignTo`, salvo que salgan de
 *   esa misma cuenta: entonces quedan con destino -1 (sale de tus cuentas);
 * - sus saldos reales se borran.
 * No se puede quitar la última cuenta.
 */
export function removeAccount(data: AppData, index: number, reassignTo: number): AppData {
  const n = data.config.accounts.length;
  if (n <= 1) throw new Error('No se puede quitar la única cuenta.');
  if (index < 0 || index >= n) throw new Error('Cuenta inexistente.');
  if (reassignTo === index || reassignTo < 0 || reassignTo >= n) {
    throw new Error('Hay que elegir otra cuenta para reasignar.');
  }

  const next = cloneData(data);
  // Índice nuevo de una cuenta que no se borra.
  const shift = (c: number): number => (c > index ? c - 1 : c);
  const target = shift(reassignTo);
  const remap = (c: number): number => (c === index ? target : c >= 0 ? shift(c) : c);

  next.config.accounts.splice(index, 1);
  next.config.items = next.config.items.map((item) => {
    const account = remap(item.account);
    let to = item.type === 'Ahorro' ? remap(item.to) : -1;
    if (to === account) to = -1;
    return { ...item, account, to };
  });
  next.config.payments = next.config.payments.map((p) => ({ ...p, account: remap(p.account) }));
  next.entries = next.entries.map((e) => ({ ...e, account: remap(e.account) }));
  next.real_balances = shiftKeys(next.real_balances, 'c', index);
  return next;
}

/** Cuántos conceptos, pagos y apuntes usan una cuenta (para avisar antes de quitarla). */
export function accountUsage(data: AppData, index: number): { items: number; payments: number; entries: number } {
  return {
    items: data.config.items.filter((i) => i.account === index || (i.type === 'Ahorro' && i.to === index)).length,
    payments: data.config.payments.filter((p) => p.account === index).length,
    entries: data.entries.filter((e) => e.account === index).length,
  };
}

// ── Conceptos de cada mes ────────────────────────────────────────────────────

export function normalizeItem(item: Item): Item {
  let from = Math.min(12, Math.max(1, Math.trunc(item.from_month) || 1));
  let to = Math.min(12, Math.max(1, Math.trunc(item.to_month) || 12));
  if (from > to) [from, to] = [to, from];
  return {
    name: item.name,
    type: item.type,
    amount: round2(Math.abs(item.amount)),
    account: item.account,
    to: item.type === 'Ahorro' && item.to !== item.account ? item.to : -1,
    from_month: from,
    to_month: to,
  };
}

export function addItem(data: AppData, item: Item): AppData {
  const next = cloneData(data);
  next.config.items.push(normalizeItem(item));
  return next;
}

export function updateItem(data: AppData, index: number, item: Item): AppData {
  if (!data.config.items[index]) return data;
  const next = cloneData(data);
  next.config.items[index] = normalizeItem(item);
  return next;
}

/** Quita un concepto y sus importes cambiados; recoloca los del resto. */
export function removeItem(data: AppData, index: number): AppData {
  if (!data.config.items[index]) return data;
  const next = cloneData(data);
  next.config.items.splice(index, 1);
  next.overrides = shiftKeys(next.overrides, 'i', index);
  return next;
}

// ── Pagos que no son mensuales ───────────────────────────────────────────────

export function normalizePayment(p: Payment): Payment {
  return {
    date: p.date,
    concept: p.concept,
    amount: round2(Math.abs(p.amount)),
    account: p.account,
    estimated: Boolean(p.estimated),
  };
}

export function addPayment(data: AppData, payment: Payment): AppData {
  const next = cloneData(data);
  next.config.payments.push(normalizePayment(payment));
  return next;
}

/**
 * Cambia un pago. Si cambia de mes, el importe cambiado del mes anterior
 * ya no aplica y se borra.
 */
export function updatePayment(data: AppData, index: number, payment: Payment): AppData {
  const prev = data.config.payments[index];
  if (!prev) return data;
  const next = cloneData(data);
  next.config.payments[index] = normalizePayment(payment);
  if (prev.date.slice(0, 7) !== payment.date.slice(0, 7)) {
    delete next.overrides[paymentOverrideKey(prev.date.slice(0, 7), index)];
  }
  return next;
}

export function removePayment(data: AppData, index: number): AppData {
  if (!data.config.payments[index]) return data;
  const next = cloneData(data);
  next.config.payments.splice(index, 1);
  next.overrides = shiftKeys(next.overrides, 'p', index);
  return next;
}

// ── Importes de un solo mes y saldos reales ──────────────────────────────────

/** Cambia el importe de un concepto solo en el mes `ym`. `null` vuelve al normal. */
export function setItemOverride(data: AppData, ym: string, index: number, amount: number | null): AppData {
  return setDictValue(data, 'overrides', itemOverrideKey(ym, index), amount === null ? null : Math.abs(amount));
}

export function setPaymentOverride(data: AppData, ym: string, index: number, amount: number | null): AppData {
  return setDictValue(data, 'overrides', paymentOverrideKey(ym, index), amount === null ? null : Math.abs(amount));
}

/** Apunta (o borra con `null`) el saldo real de una cuenta a fin del mes `ym`. */
export function setRealBalance(data: AppData, ym: string, account: number, amount: number | null): AppData {
  return setDictValue(data, 'real_balances', realBalanceKey(ym, account), amount);
}

function setDictValue(
  data: AppData,
  dict: 'overrides' | 'real_balances',
  key: string,
  amount: number | null,
): AppData {
  const next = { ...data, [dict]: { ...data[dict] } } as AppData;
  if (amount === null || !Number.isFinite(amount)) delete next[dict][key];
  else next[dict][key] = round2(amount);
  return next;
}

// ── Apuntes del mes ─────────────────────────────────────────────────────────

export function addEntry(data: AppData, entry: Entry): AppData {
  return { ...data, entries: [...data.entries, { ...entry, amount: round2(Math.abs(entry.amount)) }] };
}

export function updateEntry(data: AppData, id: string, entry: Entry): AppData {
  return {
    ...data,
    entries: data.entries.map((e) => (e.id === id ? { ...entry, id, amount: round2(Math.abs(entry.amount)) } : e)),
  };
}

export function removeEntry(data: AppData, id: string): AppData {
  return { ...data, entries: data.entries.filter((e) => e.id !== id) };
}

// ── Año y datos nuevos ───────────────────────────────────────────────────────

/** Cambia el año a planificar. Los pagos se quedan con su fecha. */
export function setYear(data: AppData, year: number): AppData {
  return { ...data, config: { ...data.config, year: Math.trunc(year) } };
}

/** Datos vacíos: una sola cuenta con saldo 0 y nada más. */
export function blankData(year: number, accountName: string): AppData {
  const config: Config = {
    year,
    example: false,
    accounts: [{ name: accountName, initial: 0 }],
    items: [],
    payments: [],
  };
  return { config, overrides: {}, real_balances: {}, entries: [] };
}
