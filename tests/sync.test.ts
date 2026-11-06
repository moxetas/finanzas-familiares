import { describe, expect, it } from 'vitest';
import { computeYear } from '../src/calc/engine';
import type { AppData } from '../src/calc/types';
import { parseBackup, serializeBackup } from '../src/storage/backup';
import { diffFlat, flatten, fromRemote, mergeFlat, readCode, toRemote, unflatten } from '../src/storage/sync';

function data(): AppData {
  return {
    config: {
      year: 2027,
      example: false,
      accounts: [
        { name: 'Giro', initial: 1000 },
        { name: 'Ahorro', initial: 0 },
        { name: 'Compra', initial: 0, spent: true },
      ],
      items: [
        { name: 'Sueldo', type: 'Ingreso', amount: 2000, account: 0, to: -1, from_month: 1, to_month: 12, note: 'nómina' },
        { name: 'Compra', type: 'Ahorro', amount: 500, account: 0, to: 2, from_month: 1, to_month: 12, group: 'Gastos' },
        { name: 'Empresa', type: 'Ahorro', amount: 30, account: -1, to: 1, from_month: 1, to_month: 12 },
        { name: 'Ahorro', type: 'Ahorro', amount: 200, account: 0, to: 1, from_month: 1, to_month: 12 },
      ],
      payments: [
        { date: '2027-02-01', concept: 'Tarjeta cuota', amount: 100, account: 0, estimated: false },
        { date: '2027-03-01', concept: 'Tarjeta cuota', amount: 100, account: 0, estimated: false },
      ],
      sections: ['Gastos'],
      debts: [{ name: 'Tarjeta', account: 0, amount: 250, match: 'Tarjeta' }],
    },
    history: { '2026-12': { title: 'DIC 26', cols: ['Giro'], rows: [{ l: 'Luz', v: [-50] }], tot: [-50] } },
    overrides: { '2027-01_i0': 2100, '2026-12_r0_c0': -60 },
    real_balances: { '2026-12_c0': 900 },
    entries: [{ id: 'a1', month: '2027-01', concept: 'Cena', amount: 40, type: 'Gasto', date: '2027-01-10', account: 0, note: '' }],
  };
}

describe('motor: cuentas de gasto diario, dinero de fuera y deudas', () => {
  const y = computeYear(data());
  const jan = y.months[0]!;
  it('el saldo real de diciembre del año anterior abre enero', () => {
    expect(jan.start[0]).toBe(900);
    expect(jan.startSource[0]).toBe('real');
  });
  it('lo traspasado a una cuenta de gasto diario cuenta como gasto y no guarda saldo', () => {
    expect(jan.spending).toBe(540); // 500 compra + 40 apunte
    expect(jan.end[2]).toBe(0);
    expect(jan.delta[2]).toBe(500);
  });
  it('el ahorro que viene de fuera suma en la cuenta pero no es ahorro propio', () => {
    expect(jan.saved).toBe(200);
    expect(jan.end[1]).toBe(230);
  });
  it('la deuda baja con los pagos', () => {
    expect(y.months.map((m) => m.debts[0]!.remaining).slice(0, 4)).toEqual([250, 150, 50, 50]);
  });
});

describe('copia JSON con historial', () => {
  it('conserva historial, notas, grupos y cifras negativas del historial', () => {
    const back = parseBackup(serializeBackup(data()), 2027, 'Cuenta');
    expect(back.history?.['2026-12']?.rows[0]?.v).toEqual([-50]);
    expect(back.overrides['2026-12_r0_c0']).toBe(-60);
    expect(back.config.items[0]!.note).toBe('nómina');
    expect(back.config.items[2]!.account).toBe(-1);
    expect(back.config.accounts[2]!.spent).toBe(true);
    expect(back.config.debts?.[0]?.match).toBe('Tarjeta');
  });
});

describe('sincronización', () => {
  it('aplanar y reconstruir no pierde nada', () => {
    const d = data();
    const again = unflatten(fromRemote(toRemote(flatten(d))), 2027, 'Cuenta');
    expect(again).toEqual(parseBackup(serializeBackup(d), 2027, 'Cuenta'));
  });
  it('solo envía lo que cambia', () => {
    const d = data();
    const base = flatten(d);
    const changed = { ...d, overrides: { ...d.overrides, '2027-02_i0': 1 } };
    expect(diffFlat(base, flatten(changed))).toEqual({ 'ov/2027-02_i0': 1 });
    const removed = { ...d, entries: [] };
    expect(diffFlat(base, flatten(removed))).toEqual({ 'en/a1': null });
  });
  it('junta cambios de los dos móviles; en lo mismo gana este móvil', () => {
    const base = { a: 1, b: 2, c: 3 };
    const remote = { a: 1, b: 20, c: 30, d: 4 };
    const cur = { a: 1, b: 2, c: 300 };
    expect(mergeFlat(base, remote, cur)).toEqual({ a: 1, b: 20, c: 300, d: 4 });
  });
  it('lee el código con o sin guiones', () => {
    expect(readCode('abcd-efgh-jkmn-pqrs-tuvw')).toBe('abcd-efgh-jkmn-pqrs-tuvw');
    expect(readCode('Pega este código: ABCDEFGHJKMNPQRSTUVW')).toBe('abcd-efgh-jkmn-pqrs-tuvw');
    expect(readCode('corto')).toBeNull();
  });
});
