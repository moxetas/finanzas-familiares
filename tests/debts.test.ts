import { describe, expect, it } from 'vitest';
import { blankData, computeYear } from '../src/calc';

function data() {
  const d = blankData(2027, 'ING');
  return {
    ...d,
    config: {
      ...d.config,
      accounts: [{ name: 'ING.GIRO', initial: 0 }, { name: 'Bankia', initial: 0 }],
      items: [{ name: 'Tarjeta de Credito', type: 'Gasto' as const, amount: 464.1, account: 1, to: -1, from_month: 1, to_month: 12 }],
    },
    history: {
      '2026-12': {
        title: 'Diciembre 2026',
        cols: ['ING.GIRO', 'Bankia'],
        rows: [
          { l: 'Deuda', v: [null, -2029.42] },
          { l: 'Nómina', v: [3000, null] },
          { l: 'Tarjeta De Credito', v: [null, -464.1] },
        ],
        tot: [3000, -2493.52],
      },
    },
  };
}

describe('deuda que baja con la tarjeta', () => {
  it('enero = deuda de diciembre − tarjeta de diciembre; después baja cada mes', () => {
    const y = computeYear(data());
    expect(y.months[0]!.debts).toEqual([{ name: 'Deuda', account: 1, remaining: 1565.32, note: '', index: 0, manual: false }]);
    expect(y.months[1]!.debts[0]!.remaining).toBe(1101.22);
    expect(y.months[4]!.debts[0]!.remaining).toBe(0);
  });

  it('la deuda no cuenta en el saldo de la cuenta', () => {
    const jan = computeYear(data()).months[0]!;
    expect(jan.delta).toEqual([0, -464.1]);
  });

  it('un importe cambiado de la tarjeta cuenta en la deuda', () => {
    const d = { ...data(), overrides: { '2027-01_i0': 1000 } };
    expect(computeYear(d).months[1]!.debts[0]!.remaining).toBe(565.32);
  });
});

describe('deuda escrita a mano', () => {
  it('desde el mes escrito, sigue bajando con lo pagado', () => {
    const d = { ...data(), overrides: { '2027-03_d0': 900 } };
    const y = computeYear(d);
    expect(y.months[1]!.debts[0]!.remaining).toBe(1101.22);
    expect(y.months[2]!.debts[0]).toMatchObject({ remaining: 900, manual: true });
    expect(y.months[3]!.debts[0]).toMatchObject({ remaining: 435.9, manual: false });
  });
});
