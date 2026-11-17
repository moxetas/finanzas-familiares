import { describe, expect, it } from 'vitest';
import { blankData } from '../src/calc';
import { historyCarry } from '../src/calc/history-carry';
import { historyCellKey } from '../src/calc/keys';

function data() {
  const d = blankData(2027, 'ING');
  return {
    ...d,
    config: { ...d.config, accounts: [{ name: 'ING.GIRO', initial: 0 }, { name: 'BANKIA', initial: 0 }] },
    history: {
      '2026-12': {
        title: 'Diciembre 2026',
        cols: ['ING.GIRO', 'Bankia'],
        rows: [
          { l: 'Deuda', v: [null, -2029.42] },
          { l: 'Ahorrado', v: [1000, null] },
          { l: 'Nómina', v: [3000, null] },
        ],
        tot: [4000, null],
      },
    },
  };
}

describe('«Ahorrado» de un mes guardado toma el saldo real del mes anterior', () => {
  it('saldo real de noviembre → Ahorrado de diciembre, por nombre de cuenta', () => {
    const d = { ...data(), real_balances: { '2026-11_c1': 51.42 } };
    expect(historyCarry(d, '2026-12')).toEqual({ [historyCellKey('2026-12', 1, 1)]: 51.42 });
  });
  it('sin saldo real, nada cambia', () => {
    expect(historyCarry(data(), '2026-12')).toEqual({});
  });
  it('una cifra cambiada a mano manda', () => {
    const d = { ...data(), real_balances: { '2026-11_c1': 51.42 }, overrides: { [historyCellKey('2026-12', 1, 1)]: 10 } };
    expect(historyCarry(d, '2026-12')).toEqual({});
  });
});
