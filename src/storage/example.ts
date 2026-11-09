/**
 * Ejemplo ficticio para la primera vez que se abre la app.
 * Todos los nombres e importes son inventados: no son datos de nadie.
 */

import { computeYear } from '../calc/engine';
import { itemOverrideKey, monthKey, parseDate, realBalanceKey } from '../calc/keys';
import { round2 } from '../calc/money';
import type { AppData, Item, Payment } from '../calc/types';
import { t } from '../i18n';

const item = (name: string, type: Item['type'], amount: number, account: number, extra: Partial<Item> = {}): Item => ({
  name,
  type,
  amount,
  account,
  to: -1,
  from_month: 1,
  to_month: 12,
  ...extra,
});

function addDays(iso: string, days: number): string {
  const d = parseDate(iso)!;
  const t = new Date(Date.UTC(d.year, d.month - 1, d.day + days));
  return t.toISOString().slice(0, 10);
}

/**
 * @param year  año a planificar
 * @param today hoy, `AAAA-MM-DD`; sirve para que el ejemplo tenga avisos próximos
 */
export function exampleData(year: number, today: string): AppData {
  const y = (mmdd: string) => `${year}-${mmdd}`;

  const accounts = [
    { name: t('ex.acc.daily'), initial: 1450 },
    { name: t('ex.acc.savings'), initial: 4200 },
    { name: t('ex.acc.holiday'), initial: 400 },
  ];

  const items: Item[] = [
    item(t('ex.salary'), 'Ingreso', 1980, 0),
    item(t('ex.summerBonus'), 'Ingreso', 1980, 0, { from_month: 6, to_month: 6 }),
    item(t('ex.xmasBonus'), 'Ingreso', 1980, 0, { from_month: 12, to_month: 12 }),
    item(t('ex.rent'), 'Gasto', 780, 0),
    item(t('ex.energy'), 'Gasto', 95, 0),
    item(t('ex.internet'), 'Gasto', 48, 0),
    item(t('ex.groceries'), 'Gasto', 340, 0),
    item(t('ex.transport'), 'Gasto', 55, 0),
    item(t('ex.leisure'), 'Gasto', 130, 0),
    item(t('ex.gym'), 'Gasto', 35, 0, { from_month: 1, to_month: 6 }),
    item(t('ex.saving'), 'Ahorro', 250, 0, { to: 1 }),
    item(t('ex.toHoliday'), 'Ahorro', 90, 0, { to: 2, from_month: 1, to_month: 7 }),
  ];

  const payments: Payment[] = [
    { date: y('01-20'), concept: t('ex.carInsurance'), amount: 410, account: 0, estimated: false },
    { date: y('03-05'), concept: t('ex.carTax'), amount: 95, account: 0, estimated: false },
    { date: y('04-15'), concept: t('ex.carService'), amount: 180, account: 0, estimated: true },
    { date: y('08-05'), concept: t('ex.trip'), amount: 980, account: 2, estimated: true },
    { date: y('09-10'), concept: t('ex.course'), amount: 220, account: 0, estimated: false },
    { date: y('10-15'), concept: t('ex.homeInsurance'), amount: 190, account: 0, estimated: false },
    { date: y('12-15'), concept: t('ex.gifts'), amount: 300, account: 0, estimated: true },
  ];

  // Dos pagos cerca de hoy, para que se vean los avisos.
  if (parseDate(today)) {
    payments.push(
      { date: addDays(today, 4), concept: t('ex.dentist'), amount: 65, account: 0, estimated: true },
      { date: addDays(today, 19), concept: t('ex.boiler'), amount: 90, account: 0, estimated: false },
    );
    payments.sort((a, b) => (a.date < b.date ? -1 : 1));
  }

  const luz = items.findIndex((i) => i.name === t('ex.energy'));
  const overrides = {
    [itemOverrideKey(monthKey(year, 1), luz)]: 132,
    [itemOverrideKey(monthKey(year, 2), luz)]: 118,
  };

  const data: AppData = {
    config: { year, example: true, accounts, items, payments },
    overrides,
    real_balances: {},
    entries: [],
  };

  // Saldos reales de enero, un poco distintos de lo previsto.
  const jan = computeYear(data).months[0]!;
  const jan_ym = monthKey(year, 1);
  data.real_balances = {
    [realBalanceKey(jan_ym, 0)]: round2(jan.end[0]! - 42.3),
    [realBalanceKey(jan_ym, 1)]: jan.end[1]!,
    [realBalanceKey(jan_ym, 2)]: jan.end[2]!,
  };

  // Un par de apuntes imprevistos en el mes actual (o en enero si el año es otro).
  const now = parseDate(today);
  const m = now && now.year === year ? now.month : 1;
  const ym = monthKey(year, m);
  data.entries = [
    { id: 'ejemplo-1', month: ym, concept: t('ex.phoneRepair'), amount: 89, type: 'Gasto', date: `${ym}-03`, account: 0, note: t('ex.brokenScreen') },
    { id: 'ejemplo-2', month: ym, concept: t('ex.book'), amount: 15, type: 'Ingreso', date: `${ym}-05`, account: 0, note: '' },
  ];

  return data;
}
