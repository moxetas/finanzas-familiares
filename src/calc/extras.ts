/**
 * Filas extra de cada mes (en todos los meses, también los de años anteriores):
 * - 3 «filas libres»: nombre e importes que se escriben mes a mes. Un importe
 *   negativo es un gasto y uno positivo, un ingreso.
 * - «Traspaso»: mover dinero entre cuentas ese mes (negativo en la que sale,
 *   positivo en la que entra). Cambia los saldos pero no es gasto ni ingreso.
 *
 * Los importes van en `overrides` (`AAAA-MM_f<fila>_c<col>`, `AAAA-MM_t_c<col>`)
 * y los nombres en `config.freeLabels` (`AAAA-MM_f<fila>`).
 */

import { round2 } from './money';
import type { AppData } from './types';

export const FREE_ROWS = 3;

export const freeCellKey = (ym: string, slot: number, col: number) => `${ym}_f${slot}_c${col}`;
export const freeLabelKey = (ym: string, slot: number) => `${ym}_f${slot}`;
export const transferKey = (ym: string, col: number) => `${ym}_t_c${col}`;

export interface MonthExtras {
  free: { label: string; values: (number | null)[] }[];
  transfer: (number | null)[];
}

function read(data: AppData, key: string): number | null {
  const v = data.overrides[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Filas extra de un mes con `cols` columnas (cuentas). */
export function monthExtras(data: AppData, ym: string, cols: number): MonthExtras {
  const labels = data.config.freeLabels ?? {};
  return {
    free: Array.from({ length: FREE_ROWS }, (_, s) => ({
      label: labels[freeLabelKey(ym, s)] ?? '',
      values: Array.from({ length: cols }, (_, c) => read(data, freeCellKey(ym, s, c))),
    })),
    transfer: Array.from({ length: cols }, (_, c) => read(data, transferKey(ym, c))),
  };
}

/** Efecto de las filas extra: por columna, y cuánto es ingreso y cuánto gasto. */
export function extrasEffect(extras: MonthExtras): { delta: number[]; income: number; spending: number } {
  const delta = extras.transfer.map((v) => v ?? 0);
  let income = 0;
  let spending = 0;
  for (const row of extras.free) {
    row.values.forEach((v, c) => {
      if (v === null) return;
      delta[c] = (delta[c] ?? 0) + v;
      if (v > 0) income += v;
      else spending -= v;
    });
  }
  return { delta: delta.map(round2), income: round2(income), spending: round2(spending) };
}

function setValue(data: AppData, key: string, amount: number | null): AppData {
  const overrides = { ...data.overrides };
  if (amount === null || !Number.isFinite(amount) || amount === 0) delete overrides[key];
  else overrides[key] = round2(amount);
  return { ...data, overrides };
}

export function setFreeCell(data: AppData, ym: string, slot: number, col: number, amount: number | null): AppData {
  return setValue(data, freeCellKey(ym, slot, col), amount);
}

export function setTransferCell(data: AppData, ym: string, col: number, amount: number | null): AppData {
  return setValue(data, transferKey(ym, col), amount);
}

export function setFreeLabel(data: AppData, ym: string, slot: number, label: string): AppData {
  const freeLabels = { ...(data.config.freeLabels ?? {}) };
  const key = freeLabelKey(ym, slot);
  if (label.trim()) freeLabels[key] = label.trim();
  else delete freeLabels[key];
  return { ...data, config: { ...data.config, freeLabels } };
}

/** Las filas libres van delante de la partida con este nombre (sin distinguir mayúsculas). */
export function isFreeRowsAnchor(name: string, anchor: string | undefined): boolean {
  return !!anchor && name.trim().toLocaleLowerCase() === anchor.trim().toLocaleLowerCase();
}
