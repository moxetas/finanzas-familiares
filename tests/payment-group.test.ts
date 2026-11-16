import { describe, expect, it } from 'vitest';
import { addPayment, defaultPaymentGroup, findSamePayment, updatePayment } from '../src/calc/mutations';
import type { AppData, Config, Payment } from '../src/calc/types';

const BOTE = 'Pagos de este mes · salen del bote';
const pay = (concept: string, group?: string, date = '2027-01-01', amount = 100): Payment => ({ concept, date, amount, account: 0, estimated: false, ...(group ? { group } : {}) });
const config = (payments: Payment[], sections: string[] = [BOTE]): Config => ({ year: 2027, example: false, accounts: [{ name: 'A', initial: 0 }], items: [], payments, sections });
const data = (c: Config): AppData => ({ config: c, overrides: {}, real_balances: {}, entries: [] });

describe('bloque de los pagos', () => {
  it('los pagos nuevos van al bloque que más usan los demás', () => {
    expect(defaultPaymentGroup(config([pay('Dacia', BOTE), pay('Radio', BOTE), pay('Suelto')]))).toBe(BOTE);
  });
  it('sin bloques propios, o si casi todos van sin bloque, a «Pagos no mensuales»', () => {
    expect(defaultPaymentGroup(config([pay('Dacia')], []))).toBe('');
    expect(defaultPaymentGroup(config([pay('Dacia', BOTE), pay('a'), pay('b')]))).toBe('');
    expect(defaultPaymentGroup(config([]))).toBe('');
  });
  it('al cambiar un pago se puede mover de bloque o quitárselo', () => {
    let d = addPayment(data(config([])), pay('KIA', BOTE));
    expect(d.config.payments[0]!.group).toBe(BOTE);
    d = updatePayment(d, 0, { ...pay('KIA'), group: '' });
    expect('group' in d.config.payments[0]!).toBe(false);
  });
  it('encuentra un pago repetido (mismo día y mismo importe)', () => {
    const c = config([pay('Seguro KIA', BOTE, '2027-01-01', 375.87)]);
    expect(findSamePayment(c, '2027-01-01', 375.87)?.concept).toBe('Seguro KIA');
    expect(findSamePayment(c, '2027-01-01', 375.87, 0)).toBeUndefined();
    expect(findSamePayment(c, '2027-01-02', 375.87)).toBeUndefined();
  });
});
