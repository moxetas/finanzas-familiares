/**
 * Ejemplo ficticio para la primera vez que se abre la app.
 * Todos los nombres e importes son inventados: no son datos de nadie.
 */

import { computeYear } from '../calc/engine';
import { itemOverrideKey, monthKey, parseDate, realBalanceKey } from '../calc/keys';
import { round2 } from '../calc/money';
import type { AppData, Item, Payment } from '../calc/types';

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
    { name: 'Cuenta del día a día', initial: 1450 },
    { name: 'Ahorro', initial: 4200 },
    { name: 'Hucha de vacaciones', initial: 400 },
  ];

  const items: Item[] = [
    item('Nómina', 'Ingreso', 1980, 0),
    item('Paga extra de verano', 'Ingreso', 1980, 0, { from_month: 6, to_month: 6 }),
    item('Paga extra de Navidad', 'Ingreso', 1980, 0, { from_month: 12, to_month: 12 }),
    item('Alquiler', 'Gasto', 780, 0),
    item('Luz y gas', 'Gasto', 95, 0),
    item('Internet y móvil', 'Gasto', 48, 0),
    item('Supermercado', 'Gasto', 340, 0),
    item('Transporte', 'Gasto', 55, 0),
    item('Ocio y salidas', 'Gasto', 130, 0),
    item('Gimnasio', 'Gasto', 35, 0, { from_month: 1, to_month: 6 }),
    item('Ahorro del mes', 'Ahorro', 250, 0, { to: 1 }),
    item('A la hucha de vacaciones', 'Ahorro', 90, 0, { to: 2, from_month: 1, to_month: 7 }),
  ];

  const payments: Payment[] = [
    { date: y('01-20'), concept: 'Seguro del coche', amount: 410, account: 0, estimated: false },
    { date: y('03-05'), concept: 'Impuesto del coche', amount: 95, account: 0, estimated: false },
    { date: y('04-15'), concept: 'Revisión del coche', amount: 180, account: 0, estimated: true },
    { date: y('08-05'), concept: 'Viaje de verano', amount: 980, account: 2, estimated: true },
    { date: y('09-10'), concept: 'Curso de idiomas', amount: 220, account: 0, estimated: false },
    { date: y('10-15'), concept: 'Seguro de hogar', amount: 190, account: 0, estimated: false },
    { date: y('12-15'), concept: 'Regalos de Navidad', amount: 300, account: 0, estimated: true },
  ];

  // Dos pagos cerca de hoy, para que se vean los avisos.
  if (parseDate(today)) {
    payments.push(
      { date: addDays(today, 4), concept: 'Revisión del dentista', amount: 65, account: 0, estimated: true },
      { date: addDays(today, 19), concept: 'Revisión de la caldera', amount: 90, account: 0, estimated: false },
    );
    payments.sort((a, b) => (a.date < b.date ? -1 : 1));
  }

  const luz = items.findIndex((i) => i.name === 'Luz y gas');
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
  const t = parseDate(today);
  const m = t && t.year === year ? t.month : 1;
  const ym = monthKey(year, m);
  data.entries = [
    { id: 'ejemplo-1', month: ym, concept: 'Reparación del móvil', amount: 89, type: 'Gasto', date: `${ym}-03`, account: 0, note: 'Pantalla rota' },
    { id: 'ejemplo-2', month: ym, concept: 'Venta de un libro usado', amount: 15, type: 'Ingreso', date: `${ym}-05`, account: 0, note: '' },
  ];

  return data;
}
