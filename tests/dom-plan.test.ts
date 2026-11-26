import { describe, expect, it } from 'vitest';
import { addPlanCharges, blankData, chargeLabel, monthExtras, planCharges, planDates, removeCharges, removePlanCharges, saveDomRow } from '../src/calc';
import type { AppData, DomPlan, Payment } from '../src/calc/types';

const BOTE = 'Pagos de este mes · salen del bote';
const pay = (concept: string, date: string, amount: number, extra: Partial<Payment> = {}): Payment => ({ concept, date, amount, account: 1, estimated: false, ...extra });
const base = (): AppData => ({
  config: {
    year: 2027,
    example: false,
    accounts: [{ name: 'ING.GIRO', initial: 0 }, { name: 'ING.PAGOS', initial: 0 }],
    items: [{ name: 'Luz', type: 'Gasto', amount: 80, account: 0, to: -1, from_month: 1, to_month: 12 }],
    payments: [pay('Rundfunkbeitrag 1/4', '2027-01-01', 55.08, { group: BOTE }), pay('Seguro coche Dacia (VHV)', '2027-01-01', 693.38, { group: BOTE })],
    sections: [BOTE],
  },
  overrides: {},
  real_balances: {},
  entries: [],
});

describe('domiciliaciones con cargos en la tabla del mes', () => {
  it('fechas y nombres de los cargos', () => {
    expect(planDates('2027-01-15', 6, 2027)).toEqual(['2027-01-15', '2027-07-15']);
    expect(planDates('2027-01-31', 3, 2027)).toEqual(['2027-01-31', '2027-04-30', '2027-07-31', '2027-10-31']);
    expect(chargeLabel('2027-07-15', '2027-01-15', 6)).toBe(' 2/2');
    expect(chargeLabel('2027-05-01', '2027-02-01', 3)).toBe(' 2/4');
    expect(chargeLabel('2027-03-01', '2027-03-01', 12)).toBe('');
  });

  it('semestral: un pago en cada cargo, en el bloque «salen del bote», hasta fin del año siguiente', () => {
    const plan: DomPlan = { link: 'x1', every: 6, first: '2027-01-15', account: 1 };
    const d = addPlanCharges(base(), plan, 'Seguro Dacia (Allianz)', 410.5, '');
    const added = d.config.payments.filter((p) => p.dom === 'x1');
    expect(added.map((p) => [p.date, p.concept, p.amount, p.group, p.account])).toEqual([
      ['2027-01-15', 'Seguro Dacia (Allianz) 1/2', 410.5, BOTE, 1],
      ['2027-07-15', 'Seguro Dacia (Allianz) 2/2', 410.5, BOTE, 1],
      ['2028-01-15', 'Seguro Dacia (Allianz) 1/2', 410.5, BOTE, 1],
      ['2028-07-15', 'Seguro Dacia (Allianz) 2/2', 410.5, BOTE, 1],
    ]);
    // Al cambiarla, los cargos ya pasados se quedan y los demás se quitan.
    const r = removePlanCharges(d, 'x1', '2027-03-01');
    expect(r.config.payments.filter((p) => p.dom === 'x1').map((p) => p.date)).toEqual(['2027-01-15']);
  });

  it('mensual: un concepto de gasto desde el mes del primer cargo; al borrarla termina el mes anterior', () => {
    const plan: DomPlan = { link: 'm1', every: 1, first: '2027-03-01', account: 0 };
    const d = addPlanCharges(base(), plan, 'Gimnasio', 30, '');
    const it = d.config.items.find((i) => i.dom === 'm1')!;
    expect([it.type, it.amount, it.from_month, it.to_month]).toEqual(['Gasto', 30, 3, 12]);
    const r = removePlanCharges(d, 'm1', '2027-09-10');
    expect(r.config.items.find((i) => i.dom === 'm1')!.to_month).toBe(8);
    expect(removePlanCharges(d, 'm1', '2027-01-10').config.items.some((i) => i.dom === 'm1')).toBe(false);
  });

  it('domiciliación antigua sin enlace: propone sus pagos por el importe y los quita', () => {
    const d = saveDomRow(base(), null, { group: 'Seguros', c: 'Kfz Dacia – VHV', t: '', cost: 693.38, from: '', to: '' });
    const row = d.domiciliaciones!.groups[0]!.rows[0]!;
    const found = planCharges(d, row, '2026-11-16');
    expect(found.payments.map((i) => d.config.payments[i]!.concept)).toEqual(['Seguro coche Dacia (VHV)']);
    const r = removeCharges(d, found, '2026-11-16');
    expect(r.config.payments.map((p) => p.concept)).toEqual(['Rundfunkbeitrag 1/4']);
  });

  it('el plan se guarda con la domiciliación', () => {
    const plan: DomPlan = { link: 'k', every: 3, first: '2027-02-01', account: 1 };
    const d = saveDomRow(base(), null, { group: 'Seguros', c: 'Seguro KIA', t: '', cost: 100, from: '', to: '', plan });
    expect(d.domiciliaciones!.groups[0]!.rows[0]!.plan).toEqual(plan);
  });
});

import { sanitizeData } from '../src/storage/sanitize';

describe('se guarda y se vuelve a leer igual', () => {
  it('conserva el plan y los enlaces', () => {
    const plan: DomPlan = { link: 'k', every: 6, first: '2027-01-15', account: 1 };
    let d = saveDomRow(base(), null, { group: 'Seguros', c: 'Seguro KIA', t: '', cost: 375.87, from: '', to: '', plan });
    d = addPlanCharges(d, plan, 'Seguro KIA', 375.87, '');
    const back = sanitizeData(JSON.parse(JSON.stringify(d)), 2027, 'Cuenta');
    expect(back.domiciliaciones!.groups[0]!.rows[0]!.plan).toEqual(plan);
    expect(back.config.payments.filter((p) => p.dom === 'k').length).toBe(4);
  });
});

describe('domiciliación: bloque de su cuenta y meses de la hoja', () => {
  function data2(): AppData {
    const base = blankData(2027, 'ING.GIRO');
    return {
      ...base,
      config: {
        ...base.config,
        accounts: [{ name: 'ING.GIRO', initial: 0 }, { name: 'BANKIA', initial: 0 }],
        sections: ['GASTOS FIJOS ALEMANIA', 'ESPAÑA · BANKIA'],
        items: [
          { name: 'HIPOTECA', type: 'Gasto', amount: 806, account: 0, to: -1, from_month: 1, to_month: 12, group: 'GASTOS FIJOS ALEMANIA' },
          { name: 'LUZ', type: 'Gasto', amount: 250, account: 0, to: -1, from_month: 1, to_month: 12, group: 'GASTOS FIJOS ALEMANIA' },
          { name: 'YOIGO', type: 'Gasto', amount: 15, account: 1, to: -1, from_month: 1, to_month: 12, group: 'ESPAÑA · BANKIA' },
        ],
      },
      history: {
        '2026-11': { title: 'Noviembre 2026', cols: ['ING.GIRO', 'Bankia'], rows: [{ l: 'Luz', v: [-250, null] }], tot: [-250, null] },
        '2026-12': { title: 'Diciembre 2026', cols: ['ING.GIRO', 'Bankia'], rows: [{ l: 'Luz', v: [-250, null] }], tot: [-250, null] },
      },
    };
  }
  const netflix: DomPlan = { link: 'nfx', every: 1, first: '2026-11-24', account: 1 };

  it('cada mes de BANKIA va al bloque de BANKIA, no al más usado', () => {
    const d = addPlanCharges(data2(), netflix, 'Netflix', 14.99, '');
    const it = d.config.items.find((x) => x.dom === 'nfx')!;
    expect(it).toMatchObject({ account: 1, group: 'ESPAÑA · BANKIA', from_month: 1, amount: 14.99 });
  });

  it('noviembre y diciembre de 2026 (meses de la hoja) reciben el cargo en una fila libre, columna BANKIA', () => {
    const d = addPlanCharges(data2(), netflix, 'Netflix', 14.99, '');
    for (const ym of ['2026-11', '2026-12']) {
      const ex = monthExtras(d, ym, 2);
      expect(ex.free[0]).toEqual({ label: 'Netflix', values: [null, -14.99] });
    }
    // Volver a guardarla no lo duplica.
    const again = addPlanCharges(d, netflix, 'Netflix', 14.99, '2026-11-26');
    expect(monthExtras(again, '2026-12', 2).free[1]!.label).toBe('');
  });

  it('al cambiarla o borrarla desde hoy, se quitan los cargos de la hoja desde hoy; los pasados se quedan', () => {
    const d = addPlanCharges(data2(), netflix, 'Netflix', 14.99, '');
    const r = removePlanCharges(d, 'nfx', '2026-11-26');
    expect(monthExtras(r, '2026-11', 2).free[0]!.values[1]).toBe(-14.99);
    expect(monthExtras(r, '2026-12', 2).free[0]).toEqual({ label: '', values: [null, null] });
    expect(r.config.items.some((x) => x.dom === 'nfx')).toBe(false);
  });
});
