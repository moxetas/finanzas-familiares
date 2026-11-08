import { describe, expect, it } from 'vitest';
import { blankData, computeYear, monthExtras, setFreeCell, setFreeLabel, setTransferCell } from '../src/calc';
import { sanitizeData } from '../src/storage/sanitize';

const base = () => {
  const d = blankData(2027, 'A');
  return { ...d, config: { ...d.config, accounts: [{ name: 'A', initial: 1000 }, { name: 'B', initial: 0 }] } };
};

describe('filas libres y traspaso', () => {
  it('el traspaso mueve dinero entre cuentas sin ser gasto ni ingreso', () => {
    let d = setTransferCell(base(), '2027-03', 0, -300);
    d = setTransferCell(d, '2027-03', 1, 300);
    const mar = computeYear(d).months[2]!;
    expect(mar.delta).toEqual([-300, 300]);
    expect([mar.income, mar.spending, mar.saved]).toEqual([0, 0, 0]);
    expect(computeYear(d).months[3]!.start).toEqual([700, 300]);
  });

  it('las filas libres negativas son gasto y las positivas ingreso, solo ese mes', () => {
    let d = setFreeCell(base(), '2027-03', 0, 0, -50);
    d = setFreeCell(d, '2027-03', 2, 1, 20);
    d = setFreeLabel(d, '2027-03', 0, 'Regalo');
    const y = computeYear(d);
    expect(y.months[2]!.spending).toBe(50);
    expect(y.months[2]!.income).toBe(20);
    expect(y.months[2]!.extras.free[0]!.label).toBe('Regalo');
    expect(y.months[3]!.extras.free[0]!.label).toBe('');
    expect(y.months[3]!.spending).toBe(0);
  });

  it('se conservan al guardar y recargar (con signo)', () => {
    let d = setTransferCell(base(), '2026-11', 0, -300);
    d = setFreeCell(d, '2026-11', 1, 0, -12.5);
    d = setFreeLabel(d, '2026-11', 1, 'Parking');
    d = { ...d, config: { ...d.config, freeRowsBefore: 'Seguro Hogar' } };
    const back = sanitizeData(JSON.parse(JSON.stringify(d)), 2027, 'A');
    expect(monthExtras(back, '2026-11', 2)).toEqual(monthExtras(d, '2026-11', 2));
    expect(back.config.freeRowsBefore).toBe('Seguro Hogar');
    expect(back.overrides['2026-11_t_c0']).toBe(-300);
  });

  it('vaciar una celda la quita', () => {
    const d = setFreeCell(setFreeCell(base(), '2027-01', 0, 0, -5), '2027-01', 0, 0, null);
    expect(d.overrides).toEqual({});
  });
});
