import { describe, expect, it } from 'vitest';
import { computeYear, updateItem } from '../src/calc';
import { sanitizeData } from '../src/storage/sanitize';
import type { AppData, Item } from '../src/calc/types';

const item = (name: string, type: Item['type'], amount: number, account: number, extra: Partial<Item> = {}): Item => ({ name, type, amount, account, to: -1, from_month: 1, to_month: 12, ...extra });
const base = (): AppData => ({
  config: {
    year: 2027,
    example: false,
    accounts: [{ name: 'ING.GIRO', initial: 1000 }, { name: 'VOLKSBANK', initial: 2500, reserve: 5000 }, { name: 'BANKIA', initial: 0, reserve: -1500 }],
    items: [
      item('BAUSPARVERTRAG', 'Ahorro', 200, 0, { to: 1, reserve: true }),
      item('VL ANA', 'Ingreso', 26.59, 1, { reserve: true }),
      item('HIPOTECA', 'Gasto', 806, 1),
      item('TARJETA DE CRÉDITO', 'Gasto', 0, 2, { reserve: true }),
    ],
    payments: [],
  },
  overrides: { '2027-01_i3': 150 },
  real_balances: {},
  entries: [],
});

describe('fila Deuda / Ahorro', () => {
  it('lo marcado va a la fila, no al saldo de la cuenta', () => {
    const jan = computeYear(base()).months[0]!;
    // Volksbank: solo la hipoteca en el saldo; los 200 + 26,59 al ahorro.
    expect(jan.delta).toEqual([-200, -806, -150]);
    expect(jan.reserve).toEqual([0, 5226.59, -1350]);
    const feb = computeYear(base()).months[1]!;
    expect(feb.reserve).toEqual([0, 5453.18, -1350]);
    // Lo de la empresa entra pero se aparta: no sobra para gastar.
    expect(jan.income).toBe(26.59);
    expect(jan.saved).toBe(226.59);
  });

  it('se guarda y se puede quitar', () => {
    const back = sanitizeData(JSON.parse(JSON.stringify(base())), 2027, 'A');
    expect(back.config.accounts[1]!.reserve).toBe(5000);
    expect(back.config.items[0]!.reserve).toBe(true);
    const off = updateItem(back, 0, { ...back.config.items[0]!, reserve: false });
    expect('reserve' in off.config.items[0]!).toBe(false);
    expect(computeYear(off).months[0]!.delta[1]).toBe(-606);
  });
});
