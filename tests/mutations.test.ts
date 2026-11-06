import { describe, expect, it } from 'vitest';
import {
  accountUsage,
  addEntry,
  addItem,
  blankData,
  computeYear,
  removeAccount,
  removeEntry,
  removeItem,
  removePayment,
  setItemOverride,
  setRealBalance,
  updateItem,
  updatePayment,
  type AppData,
} from '../src/calc';

function threeAccounts(): AppData {
  return {
    config: {
      year: 2027,
      example: false,
      accounts: [
        { name: 'Corriente', initial: 1000 },
        { name: 'Hucha', initial: 200 },
        { name: 'Tarjeta', initial: 50 },
      ],
      items: [
        { name: 'Nómina', type: 'Ingreso', amount: 1500, account: 0, to: -1, from_month: 1, to_month: 12 },
        { name: 'A la hucha', type: 'Ahorro', amount: 100, account: 0, to: 1, from_month: 1, to_month: 12 },
        { name: 'Recarga tarjeta', type: 'Ahorro', amount: 60, account: 1, to: 2, from_month: 1, to_month: 12 },
        { name: 'Compras', type: 'Gasto', amount: 60, account: 2, to: -1, from_month: 1, to_month: 12 },
      ],
      payments: [{ date: '2027-05-01', concept: 'Regalo', amount: 40, account: 2, estimated: true }],
    },
    overrides: { '2027-03_i3': 80 },
    real_balances: { '2027-01_c0': 2400, '2027-01_c1': 300, '2027-01_c2': 55 },
    entries: [
      { id: 'e1', month: '2027-02', concept: 'Cena', amount: 30, type: 'Gasto', date: '', account: 2, note: '' },
    ],
  };
}

describe('borrar cuentas', () => {
  it('reasigna conceptos, pagos y apuntes y recoloca los índices', () => {
    const d = removeAccount(threeAccounts(), 1, 0);
    expect(d.config.accounts.map((a) => a.name)).toEqual(['Corriente', 'Tarjeta']);
    // "A la hucha" iba de 0 a 1: ahora iría de 0 a 0, así que sale fuera (-1).
    expect(d.config.items[1]).toMatchObject({ account: 0, to: -1 });
    // "Recarga tarjeta" salía de la hucha (1) hacia la tarjeta (2): ahora de 0 a 1.
    expect(d.config.items[2]).toMatchObject({ account: 0, to: 1 });
    // "Compras" estaba en la tarjeta (2), que ahora es la 1.
    expect(d.config.items[3]!.account).toBe(1);
    expect(d.config.payments[0]!.account).toBe(1);
    expect(d.entries[0]!.account).toBe(1);
  });

  it('borra los saldos reales de la cuenta quitada y renumera los demás', () => {
    const d = removeAccount(threeAccounts(), 1, 0);
    expect(d.real_balances).toEqual({ '2027-01_c0': 2400, '2027-01_c1': 55 });
  });

  it('reasigna a una cuenta con índice mayor que la borrada', () => {
    const d = removeAccount(threeAccounts(), 0, 2);
    expect(d.config.accounts.map((a) => a.name)).toEqual(['Hucha', 'Tarjeta']);
    // La nómina iba a la corriente (0) → ahora a la tarjeta, que pasa a ser la 1.
    expect(d.config.items[0]).toMatchObject({ account: 1, to: -1 });
    // "A la hucha" (0 → 1) pasa a salir de la tarjeta (1) hacia la hucha (0).
    expect(d.config.items[1]).toMatchObject({ account: 1, to: 0 });
    expect(d.real_balances).toEqual({ '2027-01_c0': 300, '2027-01_c1': 55 });
  });

  it('no toca los datos originales', () => {
    const original = threeAccounts();
    const copy = JSON.parse(JSON.stringify(original));
    removeAccount(original, 1, 0);
    expect(original).toEqual(copy);
  });

  it('el resultado se puede calcular sin errores', () => {
    const d = removeAccount(threeAccounts(), 2, 1);
    const year = computeYear(d);
    expect(year.months[0]!.start).toHaveLength(2);
    // Compras (60) y el regalo pasan a la hucha; la recarga hucha → hucha queda como salida.
    expect(d.config.items[2]).toMatchObject({ account: 1, to: -1 });
  });

  it('no deja quitar la única cuenta ni reasignar a la misma', () => {
    const one = blankData(2027, 'Única');
    expect(() => removeAccount(one, 0, 0)).toThrow();
    expect(() => removeAccount(threeAccounts(), 1, 1)).toThrow();
    expect(() => removeAccount(threeAccounts(), 5, 0)).toThrow();
  });

  it('cuenta lo que usa una cuenta antes de quitarla', () => {
    expect(accountUsage(threeAccounts(), 1)).toEqual({ items: 2, payments: 0, entries: 0 });
    expect(accountUsage(threeAccounts(), 2)).toEqual({ items: 2, payments: 1, entries: 1 });
  });
});

describe('borrar conceptos y pagos', () => {
  it('al quitar un concepto se borran sus overrides y se recolocan los demás', () => {
    let d = threeAccounts();
    d = setItemOverride(d, '2027-04', 1, 10);
    d = removeItem(d, 1);
    expect(d.config.items.map((i) => i.name)).toEqual(['Nómina', 'Recarga tarjeta', 'Compras']);
    expect(d.overrides).toEqual({ '2027-03_i2': 80 });
    expect(computeYear(d).months[2]!.spending).toBe(80);
  });

  it('al quitar un pago se borran sus overrides', () => {
    let d = threeAccounts();
    d = { ...d, overrides: { ...d.overrides, '2027-05_p0': 45 } };
    d = removePayment(d, 0);
    expect(d.config.payments).toHaveLength(0);
    expect(d.overrides).toEqual({ '2027-03_i3': 80 });
  });

  it('si un pago cambia de mes, se olvida el importe cambiado del mes viejo', () => {
    let d = threeAccounts();
    d = { ...d, overrides: { ...d.overrides, '2027-05_p0': 45 } };
    const p = d.config.payments[0]!;
    d = updatePayment(d, 0, { ...p, date: '2027-06-01' });
    expect(d.overrides['2027-05_p0']).toBeUndefined();
  });
});

describe('editar', () => {
  it('normaliza los conceptos: importe positivo, rango ordenado, destino solo en ahorro', () => {
    let d = blankData(2027, 'A');
    d = addItem(d, { name: 'Raro', type: 'Gasto', amount: -12.345, account: 0, to: 0, from_month: 9, to_month: 3 });
    expect(d.config.items[0]).toEqual({
      name: 'Raro',
      type: 'Gasto',
      amount: 12.35,
      account: 0,
      to: -1,
      from_month: 3,
      to_month: 9,
    });
    d = updateItem(d, 0, { ...d.config.items[0]!, type: 'Ahorro', to: 0 });
    // Un traspaso a la misma cuenta no tiene sentido: queda como salida.
    expect(d.config.items[0]!.to).toBe(-1);
  });

  it('override y saldo real se quitan con null', () => {
    let d = blankData(2027, 'A');
    d = setItemOverride(d, '2027-01', 0, 5);
    d = setRealBalance(d, '2027-01', 0, -12.5);
    expect(d.overrides).toEqual({ '2027-01_i0': 5 });
    expect(d.real_balances).toEqual({ '2027-01_c0': -12.5 });
    d = setItemOverride(d, '2027-01', 0, null);
    d = setRealBalance(d, '2027-01', 0, null);
    expect(d.overrides).toEqual({});
    expect(d.real_balances).toEqual({});
  });

  it('añade y quita apuntes por id', () => {
    let d = blankData(2027, 'A');
    d = addEntry(d, { id: 'x', month: '2027-01', concept: 'Taxi', amount: -15, type: 'Gasto', date: '', account: 0, note: '' });
    expect(d.entries[0]!.amount).toBe(15);
    d = removeEntry(d, 'x');
    expect(d.entries).toHaveLength(0);
  });
});
