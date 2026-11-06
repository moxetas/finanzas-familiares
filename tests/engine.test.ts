import { describe, expect, it } from 'vitest';
import {
  computeYear,
  entriesOfMonth,
  isItemActive,
  monthLines,
  upcomingPayments,
  type AppData,
  type Item,
} from '../src/calc';

function data(partial: Partial<AppData['config']> = {}, rest: Partial<Omit<AppData, 'config'>> = {}): AppData {
  return {
    config: {
      year: 2027,
      example: false,
      accounts: [
        { name: 'Corriente', initial: 1000 },
        { name: 'Ahorro', initial: 500 },
      ],
      items: [],
      payments: [],
      ...partial,
    },
    overrides: {},
    real_balances: {},
    entries: [],
    ...rest,
  };
}

const item = (over: Partial<Item>): Item => ({
  name: 'X',
  type: 'Gasto',
  amount: 0,
  account: 0,
  to: -1,
  from_month: 1,
  to_month: 12,
  ...over,
});

describe('ingresos, gastos y traspasos', () => {
  it('un ingreso suma en su cuenta y un gasto resta', () => {
    const d = data({
      items: [
        item({ name: 'Nómina', type: 'Ingreso', amount: 2000 }),
        item({ name: 'Alquiler', type: 'Gasto', amount: 800 }),
      ],
    });
    const jan = computeYear(d).months[0]!;
    expect(jan.start).toEqual([1000, 500]);
    expect(jan.delta).toEqual([1200, 0]);
    expect(jan.end).toEqual([2200, 500]);
    expect(jan.income).toBe(2000);
    expect(jan.spending).toBe(800);
    expect(jan.saved).toBe(0);
    expect(jan.leftover).toBe(1200);
  });

  it('un traspaso sale de una cuenta, entra en otra y no cuenta como gasto', () => {
    const d = data({
      items: [
        item({ name: 'Nómina', type: 'Ingreso', amount: 2000 }),
        item({ name: 'A la hucha', type: 'Ahorro', amount: 300, account: 0, to: 1 }),
      ],
    });
    const jan = computeYear(d).months[0]!;
    expect(jan.delta).toEqual([1700, 300]);
    expect(jan.spending).toBe(0);
    expect(jan.saved).toBe(300);
    expect(jan.leftover).toBe(1700);
    // El dinero total no cambia por un traspaso.
    expect(jan.totalClosing).toBe(1000 + 500 + 2000);
  });

  it('un ahorro con destino -1 sale de tus cuentas pero tampoco es gasto', () => {
    const d = data({ items: [item({ type: 'Ahorro', amount: 100, account: 0, to: -1 })] });
    const jan = computeYear(d).months[0]!;
    expect(jan.delta).toEqual([-100, 0]);
    expect(jan.spending).toBe(0);
    expect(jan.saved).toBe(100);
  });

  it('los saldos se encadenan mes a mes', () => {
    const d = data({ items: [item({ type: 'Gasto', amount: 100 })] });
    const year = computeYear(d);
    expect(year.months.map((m) => m.end[0])).toEqual([900, 800, 700, 600, 500, 400, 300, 200, 100, 0, -100, -200]);
    expect(year.months[1]!.start[0]).toBe(900);
    expect(year.months[1]!.startSource[0]).toBe('projected');
    expect(year.months[0]!.startSource[0]).toBe('initial');
    expect(year.totals.endOfYear).toBe(-200 + 500);
    expect(year.totals.startOfYear).toBe(1500);
  });

  it('redondea a céntimos', () => {
    const d = data({
      accounts: [{ name: 'A', initial: 0.1 }],
      items: [item({ type: 'Ingreso', amount: 0.2 })],
    });
    expect(computeYear(d).months[0]!.end[0]).toBe(0.3);
  });
});

describe('rangos de meses', () => {
  it('un concepto solo cuenta dentro de su rango (inclusive)', () => {
    const i = item({ from_month: 3, to_month: 5 });
    expect([1, 2, 3, 4, 5, 6].map((m) => isItemActive(i, m))).toEqual([false, false, true, true, true, false]);
  });

  it('las partidas fuera de rango no aparecen ni suman', () => {
    const d = data({
      items: [item({ name: 'Gimnasio', amount: 40, from_month: 6, to_month: 8 })],
    });
    const year = computeYear(d);
    expect(year.months[4]!.lines).toHaveLength(0);
    expect(year.months[5]!.lines).toHaveLength(1);
    expect(year.months[7]!.end[0]).toBe(1000 - 120);
    expect(year.months[11]!.end[0]).toBe(880);
    expect(year.totals.spending).toBe(120);
  });

  it('un concepto de un solo mes (desde = hasta)', () => {
    const d = data({ items: [item({ type: 'Ingreso', amount: 900, from_month: 12, to_month: 12 })] });
    const year = computeYear(d);
    expect(year.months[10]!.income).toBe(0);
    expect(year.months[11]!.income).toBe(900);
  });
});

describe('pagos no mensuales', () => {
  it('cuentan en el mes de su fecha y son gasto real', () => {
    const d = data({
      payments: [{ date: '2027-03-15', concept: 'Seguro', amount: 400, account: 1, estimated: false }],
    });
    const year = computeYear(d);
    expect(year.months[1]!.spending).toBe(0);
    expect(year.months[2]!.spending).toBe(400);
    expect(year.months[2]!.delta).toEqual([0, -400]);
    expect(year.months[2]!.lines[0]).toMatchObject({ kind: 'payment', type: 'Pago', name: 'Seguro' });
  });

  it('los pagos de otro año no cuentan', () => {
    const d = data({
      payments: [{ date: '2026-03-15', concept: 'Viejo', amount: 400, account: 0, estimated: false }],
    });
    expect(computeYear(d).totals.spending).toBe(0);
  });

  it('marcan si son estimados', () => {
    const d = data({
      payments: [{ date: '2027-07-01', concept: 'IBI', amount: 300, account: 0, estimated: true }],
    });
    expect(monthLines(d, 7)[0]!.estimated).toBe(true);
  });
});

describe('importes cambiados para un mes (overrides)', () => {
  it('sustituyen al importe normal solo ese mes', () => {
    const d = data(
      { items: [item({ type: 'Gasto', amount: 100 })] },
      { overrides: { '2027-02_i0': 250 } },
    );
    const year = computeYear(d);
    expect(year.months[0]!.spending).toBe(100);
    expect(year.months[1]!.spending).toBe(250);
    expect(year.months[2]!.spending).toBe(100);
    const line = year.months[1]!.lines[0]!;
    expect(line.overridden).toBe(true);
    expect(line.base).toBe(100);
    expect(line.amount).toBe(250);
  });

  it('un override de 0 anula la partida ese mes', () => {
    const d = data({ items: [item({ type: 'Ingreso', amount: 2000 })] }, { overrides: { '2027-08_i0': 0 } });
    expect(computeYear(d).months[7]!.income).toBe(0);
  });

  it('también sirven para pagos no mensuales', () => {
    const d = data(
      { payments: [{ date: '2027-05-10', concept: 'ITV', amount: 50, account: 0, estimated: true }] },
      { overrides: { '2027-05_p0': 62.5 } },
    );
    expect(computeYear(d).months[4]!.spending).toBe(62.5);
  });

  it('en un traspaso cambian lo que sale y lo que entra', () => {
    const d = data(
      { items: [item({ type: 'Ahorro', amount: 100, account: 0, to: 1 })] },
      { overrides: { '2027-01_i0': 40 } },
    );
    expect(computeYear(d).months[0]!.delta).toEqual([-40, 40]);
  });

  it('los de otro año no se aplican', () => {
    const d = data({ items: [item({ amount: 100 })] }, { overrides: { '2026-01_i0': 1 } });
    expect(computeYear(d).months[0]!.spending).toBe(100);
  });
});

describe('saldos reales', () => {
  it('el saldo real de un mes pasa como saldo inicial del siguiente', () => {
    const d = data(
      { items: [item({ type: 'Gasto', amount: 100 })] },
      { real_balances: { '2027-01_c0': 850 } },
    );
    const year = computeYear(d);
    const jan = year.months[0]!;
    expect(jan.end[0]).toBe(900);
    expect(jan.real[0]).toBe(850);
    expect(jan.diff[0]).toBe(-50);
    expect(jan.closing[0]).toBe(850);
    const feb = year.months[1]!;
    expect(feb.start[0]).toBe(850);
    expect(feb.startSource[0]).toBe('real');
    expect(feb.end[0]).toBe(750);
    // La otra cuenta no tiene saldo real: sigue con el previsto.
    expect(feb.startSource[1]).toBe('projected');
    expect(jan.diff[1]).toBeNull();
  });

  it('un saldo real en un mes intermedio corrige el resto del año', () => {
    const d = data(
      { items: [item({ type: 'Ingreso', amount: 100 })] },
      { real_balances: { '2027-06_c0': 0 } },
    );
    const year = computeYear(d);
    expect(year.months[5]!.closing[0]).toBe(0);
    expect(year.months[6]!.start[0]).toBe(0);
    expect(year.months[11]!.end[0]).toBe(600);
    expect(year.totals.endOfYear).toBe(600 + 500);
  });

  it('el saldo real de diciembre es el total de fin de año', () => {
    const d = data({}, { real_balances: { '2027-12_c0': 3000, '2027-12_c1': 1 } });
    expect(computeYear(d).totals.endOfYear).toBe(3001);
  });
});

describe('apuntes del mes', () => {
  it('suman o restan en su cuenta y los gastos son gasto real', () => {
    const d = data(
      {},
      {
        entries: [
          { id: 'a', month: '2027-04', concept: 'Dentista', amount: 80, type: 'Gasto', date: '2027-04-12', account: 0, note: '' },
          { id: 'b', month: '2027-04', concept: 'Venta bici', amount: 150, type: 'Ingreso', date: '', account: 1, note: 'Segunda mano' },
          { id: 'c', month: '2027-05', concept: 'Otro', amount: 1, type: 'Gasto', date: '', account: 0, note: '' },
        ],
      },
    );
    const apr = computeYear(d).months[3]!;
    expect(apr.delta).toEqual([-80, 150]);
    expect(apr.spending).toBe(80);
    expect(apr.income).toBe(150);
    expect(apr.lines.map((l) => l.kind)).toEqual(['entry', 'entry']);
  });

  it('se ordenan por fecha, los que no tienen fecha al final', () => {
    const entries = [
      { id: '1', month: '2027-04', concept: 'sin fecha', amount: 1, type: 'Gasto' as const, date: '', account: 0, note: '' },
      { id: '2', month: '2027-04', concept: 'día 20', amount: 1, type: 'Gasto' as const, date: '2027-04-20', account: 0, note: '' },
      { id: '3', month: '2027-04', concept: 'día 2', amount: 1, type: 'Gasto' as const, date: '2027-04-02', account: 0, note: '' },
    ];
    expect(entriesOfMonth(entries, '2027-04').map((e) => e.entry.id)).toEqual(['3', '2', '1']);
  });
});

describe('robustez', () => {
  it('ignora cuentas que no existen sin romperse', () => {
    const d = data({ items: [item({ amount: 10, account: 7 })] });
    const jan = computeYear(d).months[0]!;
    expect(jan.delta).toEqual([0, 0]);
    expect(jan.spending).toBe(10);
  });

  it('funciona sin cuentas', () => {
    const d = data({ accounts: [] });
    expect(computeYear(d).totals.endOfYear).toBe(0);
  });
});

describe('avisos de pagos', () => {
  const config = data({
    payments: [
      { date: '2027-03-01', concept: 'Pasado', amount: 1, account: 0, estimated: false },
      { date: '2027-03-10', concept: 'Hoy', amount: 10, account: 0, estimated: false },
      { date: '2027-03-17', concept: 'En 7 días', amount: 20, account: 0, estimated: true },
      { date: '2027-03-18', concept: 'En 8 días', amount: 30, account: 0, estimated: false },
      { date: '2027-04-09', concept: 'En 30 días', amount: 40, account: 0, estimated: false },
      { date: '2027-06-01', concept: 'Junio B', amount: 60, account: 0, estimated: false },
      { date: '2027-04-10', concept: 'En 31 días', amount: 50, account: 0, estimated: false },
      { date: '2027-06-01', concept: 'Junio A', amount: 70, account: 1, estimated: true },
    ],
  }).config;

  it('agrupa en 7 días, 30 días y el resto por mes', () => {
    const up = upcomingPayments(config, {}, '2027-03-10');
    expect(up.week.map((p) => p.concept)).toEqual(['Hoy', 'En 7 días']);
    expect(up.week.map((p) => p.inDays)).toEqual([0, 7]);
    expect(up.month.map((p) => p.concept)).toEqual(['En 8 días', 'En 30 días']);
    expect(up.later.map((g) => g.ym)).toEqual(['2027-04', '2027-06']);
    expect(up.later[1]!.payments.map((p) => p.concept)).toEqual(['Junio B', 'Junio A']);
  });

  it('usa el importe cambiado del mes del pago', () => {
    const up = upcomingPayments(config, { '2027-03_p1': 99 }, '2027-03-10');
    expect(up.week[0]!.amount).toBe(99);
  });
});
