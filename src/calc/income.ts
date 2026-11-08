/**
 * Sueldos y compras de BTC (pestaña Sueldos). Funciones puras.
 *
 * Sueldos: cada mes cobrado es «confirmado». Los meses que faltan hasta final de año
 * salen como «estimado»: el importe puesto a mano o, si no, la media de lo cobrado
 * con el contrato actual. La media de cada mes es la media acumulada desde enero
 * (o desde que empezó el contrato, si empezó ese año): «este mes he cobrado X y de
 * media llevo Y con este contrato».
 */

import { round2 } from './money';
import type { BtcTrade, SalaryPerson } from './types';

export interface SalaryRow {
  ym: string;
  amount: number;
  estimated: boolean;
  /** Media acumulada en el año con este contrato (incluye este mes). */
  average: number;
  contract: string;
  /** Primer mes de un contrato nuevo en este año (para mostrar el cambio). */
  contractStart: boolean;
}

export interface SalaryYear {
  year: number;
  rows: SalaryRow[];
  total: number;
  /** ¿Hay meses estimados en el total? */
  estimated: boolean;
}

const ymOf = (year: number, m: number) => `${year}-${String(m).padStart(2, '0')}`;

export function contractAt(p: SalaryPerson, ym: string): string {
  let name = '';
  for (const c of [...p.contracts].sort((a, b) => (a.from < b.from ? -1 : 1))) if (c.from <= ym) name = c.name;
  return name;
}

/** Media de lo cobrado con el contrato vigente en el último mes cobrado. */
export function autoEstimate(p: SalaryPerson): number | null {
  const keys = Object.keys(p.months).sort();
  const last = keys[keys.length - 1];
  if (!last) return null;
  const contract = contractAt(p, last);
  const same = keys.filter((k) => contractAt(p, k) === contract).map((k) => p.months[k]!);
  return same.length ? round2(same.reduce((a, b) => a + b, 0) / same.length) : null;
}

/** Tabla de sueldos por año, desde el primer mes cobrado hasta diciembre de `untilYear`. */
export function salaryYears(p: SalaryPerson, untilYear: number): SalaryYear[] {
  const keys = Object.keys(p.months).sort();
  if (keys.length === 0) return [];
  const first = keys[0]!;
  const last = keys[keys.length - 1]!;
  const auto = autoEstimate(p);
  const firstYear = Number(first.slice(0, 4));
  const endYear = Math.max(untilYear, Number(last.slice(0, 4)));
  const years: SalaryYear[] = [];
  for (let year = firstYear; year <= endYear; year++) {
    const rows: SalaryRow[] = [];
    let acc = 0;
    let n = 0;
    let prevContract: string | null = null;
    for (let m = 1; m <= 12; m++) {
      const ym = ymOf(year, m);
      if (ym < first) continue;
      const confirmed = p.months[ym];
      let amount: number | null = confirmed ?? null;
      let estimated = false;
      if (amount === null) {
        if (ym < last) continue; // un hueco en el pasado no se rellena
        amount = p.estimates?.[ym] ?? auto;
        estimated = true;
      }
      if (amount === null) continue;
      const contract = contractAt(p, ym);
      const contractStart = prevContract !== null && contract !== prevContract;
      if (contractStart) {
        acc = 0;
        n = 0;
      }
      prevContract = contract;
      acc += amount;
      n++;
      rows.push({ ym, amount: round2(amount), estimated, average: round2(acc / n), contract, contractStart });
    }
    if (rows.length) {
      years.push({ year, rows, total: round2(rows.reduce((a, r) => a + r.amount, 0)), estimated: rows.some((r) => r.estimated) });
    }
  }
  return years;
}

/** Resumen por contrato: meses cobrados y media. */
export function contractSummary(p: SalaryPerson): { name: string; from: string; to: string; months: number; average: number }[] {
  const keys = Object.keys(p.months).sort();
  const out: { name: string; from: string; to: string; months: number; average: number }[] = [];
  for (const k of keys) {
    const name = contractAt(p, k);
    let cur = out[out.length - 1];
    if (!cur || cur.name !== name) {
      cur = { name, from: k, to: k, months: 0, average: 0 };
      out.push(cur);
    }
    cur.average = (cur.average * cur.months + p.months[k]!) / (cur.months + 1);
    cur.months++;
    cur.to = k;
  }
  return out.map((c) => ({ ...c, average: round2(c.average) }));
}

export interface BtcRow extends BtcTrade {
  index: number;
  /** BTC acumulados tras esta operación. */
  total: number;
  /** Euros pagados en total (las ventas restan). */
  totalPaid: number;
  /** Precio medio: total pagado ÷ BTC acumulados. */
  avgPrice: number | null;
}

/** Operaciones de BTC por fecha con acumulados, total pagado y precio medio. */
export function btcRows(trades: readonly BtcTrade[]): BtcRow[] {
  let total = 0;
  let totalPaid = 0;
  return trades
    .map((t, index) => ({ ...t, index }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.index - b.index))
    .map((t) => {
      total = Math.round((total + t.qty) * 1e8) / 1e8;
      totalPaid = round2(totalPaid + t.paid);
      return { ...t, total, totalPaid, avgPrice: total > 0 ? round2(totalPaid / total) : null };
    });
}
