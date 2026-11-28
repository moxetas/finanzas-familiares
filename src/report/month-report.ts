/**
 * Desglose de un mes para el PDF: todo lo que hay en ese mes (conceptos, pagos,
 * apuntes, filas libres, traspasos), de qué cuenta sale y a cuál va, y los saldos.
 * Vale para los meses del año planificado y para los de la hoja (años anteriores).
 * Solo prepara textos; el dibujo del PDF está en `pdf.ts`.
 */

import { computeYear, entriesOfMonth, type Line, type LineType } from '../calc/engine';
import { historyMonth } from '../calc/history-carry';
import { norm } from '../calc/debts';
import { monthKey, realBalanceKey } from '../calc/keys';
import { sum } from '../calc/money';
import { accountOrder, inOrder, rowKeys, sortedPositions } from '../calc/order';
import type { AppData } from '../calc/types';
import { fmtDate, fmtDateTime, fmtMoney, fmtYearMonth, t, type MessageKey } from '../i18n';
import type { MonthExtras } from '../calc/extras';

export type Tone = 'pos' | 'neg' | 'muted' | '';

export interface ReportRow {
  cells: string[];
  /** Color de cada celda (por defecto, normal). */
  tones?: Tone[];
  bold?: boolean;
  /** Nota en pequeño debajo del concepto. */
  sub?: string;
}

export interface ReportTable {
  title: string;
  cols: string[];
  /** Ancho relativo de cada columna. */
  widths: number[];
  /** Columnas alineadas a la derecha (importes). */
  right: boolean[];
  rows: ReportRow[];
  empty?: string;
}

export interface MonthReport {
  title: string;
  subtitle: string;
  kpis: { label: string; value: string; tone: Tone }[];
  tables: ReportTable[];
  footer: string;
}

const money = (n: number, sign = true) => fmtMoney(n, { sign: sign && n !== 0 });
const tone = (n: number): Tone => (n < 0 ? 'neg' : n > 0 ? 'pos' : '');

function movementsTable(title: string, rows: ReportRow[]): ReportTable {
  return {
    title,
    cols: [t('report.col.concept'), t('report.col.account'), t('report.col.amount')],
    widths: [0.5, 0.3, 0.2],
    right: [false, false, true],
    rows,
    empty: t('report.none'),
  };
}

/** Filas libres y traspaso de un mes; `colName(c)` da el nombre de la columna (cuenta). */
function extrasRows(extras: MonthExtras, colName: (c: number) => string): ReportRow[] {
  const rows: ReportRow[] = [];
  const named = [
    ...extras.free.map((row, s) => ({ row, name: row.label || t('extras.free', { n: s + 1 }) })),
    ...extras.card.map((row, s) => ({ row, name: `${row.label || t('extras.card', { n: s + 1 })} (${t('extras.card.short')})` })),
  ];
  for (const { row, name } of named) {
    row.values.forEach((v, c) => {
      if (v === null || v === 0) return;
      rows.push({ cells: [name, colName(c), money(v)], tones: ['', '', tone(v)] });
    });
  }
  extras.transfer.forEach((v, c) => {
    if (v === null || v === 0) return;
    rows.push({ cells: [t('extras.transfer'), colName(c), money(v)], tones: ['', '', tone(v)] });
  });
  return rows;
}

const GROUPS: { type: LineType | 'entry'; label: MessageKey }[] = [
  { type: 'Ingreso', label: 'months.group.Ingreso' },
  { type: 'Gasto', label: 'months.group.Gasto' },
  { type: 'Pago', label: 'months.group.Pago' },
  { type: 'Ahorro', label: 'months.group.Ahorro' },
  { type: 'entry', label: 'months.group.entry' },
];
const groupOf = (l: Line): LineType | 'entry' => (l.toSpent ? 'Gasto' : l.kind === 'entry' ? 'entry' : l.type);

/** Desglose de `ym` («2026-11»), o null si ese mes no existe en los datos. */
export function monthReport(data: AppData, ym: string, now = new Date()): MonthReport | null {
  const year = Number(ym.slice(0, 4));
  const base = { title: t('report.title', { month: fmtYearMonth(ym) }), footer: t('report.made', { date: fmtDateTime(now.toISOString()) }) };
  if (year === data.config.year) return { ...base, ...plannedMonth(data, Number(ym.slice(5, 7))) };
  if (data.history?.[ym]) return { ...base, ...historyMonthReport(data, ym) };
  return null;
}

function plannedMonth(data: AppData, month: number): Omit<MonthReport, 'title' | 'footer'> {
  const { config } = data;
  const accounts = config.accounts;
  const m = computeYear(data).months[month - 1]!;
  const name = (c: number) => (c < 0 ? t('field.from.outside') : (accounts[c]?.name ?? ''));
  const order = accountOrder(config);

  const lineRow = (l: Line): ReportRow => {
    const marks = [l.estimated ? t('chip.estimated') : '', l.overridden ? t('chip.changed') : ''].filter(Boolean);
    let concept = l.name + (marks.length ? ` · ${marks.join(' · ')}` : '');
    if (l.kind === 'entry') {
      const date = data.entries[l.index]?.date;
      if (date) concept = `${fmtDate(date)} · ${concept}`;
    }
    const sub = l.note || undefined;
    if (l.type === 'Ahorro' && !l.toSpent) {
      return { cells: [concept, `${name(l.account)} → ${l.to >= 0 ? name(l.to) : t('report.outside')}`, money(l.amount, false)], tones: ['', '', 'muted'], sub };
    }
    const v = l.type === 'Ingreso' ? l.amount : -l.amount;
    const where = l.toSpent && l.to >= 0 ? `${name(l.account)} → ${name(l.to)}` : name(l.account);
    return { cells: [concept, where, money(v)], tones: ['', '', tone(v)], sub };
  };

  const tables: ReportTable[] = [];
  const add = (title: string, lines: Line[]) => {
    if (lines.length === 0) return;
    const keys = rowKeys(lines.map((l) => (l.kind === 'entry' ? null : l.name)));
    const sorted = sortedPositions(keys, config.rowOrder).map((i) => lines[i]!);
    const rows = sorted.map(lineRow);
    const total = sum(sorted.map((l) => (l.type === 'Ahorro' && !l.toSpent ? 0 : l.type === 'Ingreso' ? l.amount : -l.amount)));
    if (sorted.some((l) => l.type !== 'Ahorro' || l.toSpent)) rows.push({ cells: [t('summary.total'), '', money(total)], tones: ['', '', tone(total)], bold: true });
    tables.push(movementsTable(title, rows));
  };
  const sections = config.sections ?? [];
  for (const s of sections) add(s, m.lines.filter((l) => l.group === s));
  const rest = m.lines.filter((l) => !sections.includes(l.group));
  for (const g of GROUPS) add(t(g.label), rest.filter((l) => groupOf(l) === g.type));
  const extra = extrasRows(m.extras, name);
  if (extra.length) tables.push(movementsTable(t('report.extras'), extra));
  if (tables.length === 0) tables.push(movementsTable(t('report.movements'), []));

  const balRows: ReportRow[] = inOrder(accounts, order).map(({ item: a, index: c }) => {
    if (a.spent) return { cells: [a.name, '', money(m.delta[c] ?? 0), t('months.spent'), ''], tones: ['', '', tone(m.delta[c] ?? 0), 'muted', ''] };
    const real = m.real[c];
    return {
      cells: [a.name, money(m.start[c] ?? 0, false), money(m.delta[c] ?? 0), money(m.end[c] ?? 0, false), real === null || real === undefined ? t('real.none') : money(real, false)],
      tones: ['', '', tone(m.delta[c] ?? 0), '', real === null || real === undefined ? 'muted' : ''],
    };
  });
  if (accounts.length > 1) {
    balRows.push({ cells: [t('summary.total'), money(sum(m.start), false), money(sum(m.delta)), money(sum(m.end), false), ''], tones: ['', '', tone(sum(m.delta)), '', ''], bold: true });
  }
  tables.push({
    title: t('report.balances'),
    cols: [t('report.col.account'), t('months.row.start'), t('report.col.change'), t('report.col.end'), t('real.real')],
    widths: [0.24, 0.19, 0.19, 0.19, 0.19],
    right: [false, true, true, true, true],
    rows: balRows,
  });

  return {
    subtitle: t('months.plan'),
    kpis: [
      { label: t('kpi.income'), value: money(m.income, false), tone: '' },
      { label: t('kpi.spending'), value: money(m.spending, false), tone: '' },
      { label: t('kpi.saved'), value: money(m.saved, false), tone: '' },
      { label: t('kpi.leftover'), value: money(m.leftover, false), tone: tone(m.leftover) },
    ],
    tables,
  };
}

function historyMonthReport(data: AppData, ym: string): Omit<MonthReport, 'title' | 'footer'> {
  const hm = data.history![ym]!;
  const { edited, extras, debtRows, tot, prevBalance } = historyMonth(data, ym);
  const colName = (c: number) => hm.cols[c] ?? '';
  const keys = rowKeys(hm.rows.map((r) => r.l));
  const rows: ReportRow[] = [];
  prevBalance?.forEach((v, ci) => {
    if (v === null) return;
    rows.push({ cells: [t('months.history.prevBalance'), colName(ci), money(v)], tones: ['', '', tone(v)], bold: false });
  });
  for (const ri of sortedPositions(keys, data.config.rowOrder)) {
    const r = hm.rows[ri]!;
    edited[ri]!.forEach((v, ci) => {
      if (v === null || Math.abs(v) < 0.005) return;
      const changed = data.overrides[`${ym}_r${ri}_c${ci}`] !== undefined;
      const concept = r.l + (debtRows[ri] ? ` (${t('months.debt.info')})` : '') + (changed ? ` · ${t('chip.changed')}` : '');
      rows.push({ cells: [concept, colName(ci), money(v)], tones: ['', '', debtRows[ri] ? 'muted' : tone(v)] });
    });
  }
  const tables: ReportTable[] = [movementsTable(t('report.movements'), rows)];
  const extra = extrasRows(extras, colName);
  if (extra.length) tables.push(movementsTable(t('report.extras'), extra));

  const entries = entriesOfMonth(data.entries, ym).map(({ entry: e }) => {
    const v = e.type === 'Ingreso' ? e.amount : -e.amount;
    return { cells: [`${e.date ? `${fmtDate(e.date)} · ` : ''}${e.concept}`, data.config.accounts[e.account]?.name ?? '', money(v)], tones: ['', '', tone(v)] as Tone[], sub: e.note || undefined };
  });
  if (entries.length) tables.push(movementsTable(t('entries.title'), entries));

  // Total de cada columna y saldo real apuntado (si la columna es una cuenta de la app).
  const accIndex = (c: number) => data.config.accounts.findIndex((a) => norm(a.name) === norm(colName(c)));
  const balRows: ReportRow[] = hm.cols.map((c, ci) => {
    const ai = accIndex(ci);
    const real = ai >= 0 ? data.real_balances[realBalanceKey(ym, ai)] : undefined;
    return {
      cells: [c, money(tot[ci] ?? 0, false), typeof real === 'number' ? money(real, false) : t('real.none')],
      tones: ['', tone(tot[ci] ?? 0) === 'neg' ? 'neg' : '', typeof real === 'number' ? '' : 'muted'],
    };
  });
  if (hm.cols.length > 1) balRows.push({ cells: [t('summary.total'), money(sum(tot), false), ''], bold: true });
  tables.push({
    title: t('report.balances'),
    cols: [t('report.col.account'), t('months.row.total'), t('real.real')],
    widths: [0.4, 0.3, 0.3],
    right: [false, true, true],
    rows: balRows,
  });
  return { subtitle: hm.title, kpis: [], tables };
}

/** Nombre del archivo: «Finanzas-familiares-2026-11.pdf». */
export const reportFileName = (ym: string) => `Finanzas-familiares-${ym}.pdf`;

/** Mes de «AAAA-MM» para el año planificado (para los botones de la vista). */
export const plannedYm = (data: AppData, month: number) => monthKey(data.config.year, month);
