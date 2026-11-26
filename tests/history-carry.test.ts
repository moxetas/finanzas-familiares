import { describe, expect, it } from 'vitest';
import { blankData } from '../src/calc';
import { historyMonth, prevBalanceRow } from '../src/calc/history-carry';

function data() {
  const d = blankData(2027, 'ING');
  return {
    ...d,
    config: { ...d.config, accounts: [{ name: 'ING.GIRO', initial: 0 }, { name: 'VOLKSBANK', initial: 0 }] },
    history: {
      '2026-12': {
        title: 'Diciembre 2026',
        cols: ['ING.GIRO', 'Volksbank'],
        rows: [
          { l: 'Deuda', v: [null, null] },
          { l: 'Ahorrado', v: [null, 2310.51] },
          { l: 'Nómina', v: [3000, null] },
        ],
        tot: [3000, 2310.51],
      },
    },
  };
}

describe('lo que sobró el mes anterior en un mes de la hoja', () => {
  it('el saldo real de noviembre va a su propia fila y suma al total; «Ahorrado» no cambia', () => {
    const d = { ...data(), real_balances: { '2026-11_c0': 1.04, '2026-11_c1': 20.74 } };
    expect(prevBalanceRow(d, '2026-12')).toEqual([1.04, 20.74]);
    const m = historyMonth(d, '2026-12');
    expect(m.edited[1]).toEqual([null, 2310.51]);
    expect(m.tot).toEqual([3001.04, 2331.25]);
  });
  it('sin saldo real apuntado, no hay fila', () => {
    expect(prevBalanceRow(data(), '2026-12')).toBeNull();
    expect(historyMonth(data(), '2026-12').tot).toEqual([3000, 2310.51]);
  });
});
