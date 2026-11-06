import { describe, expect, it } from 'vitest';
import { daysBetween, monthKey, parseAmount, parseDate, parseIndexedKey, round2, sum } from '../src/calc';

describe('parseAmount', () => {
  it.each([
    ['12', 12],
    ['12,5', 12.5],
    ['12.50', 12.5],
    ['1.234,56', 1234.56],
    ['1,234.56', 1234.56],
    ['1.500', 1500],
    ['12.345.678', 12345678],
    ['1,000,000', 1000000],
    ['-20 €', -20],
    ['−7,10', -7.1],
    ['+3', 3],
    [' 1 234,5 ', 1234.5],
    ['0,005', 0.01],
    [',5', 0.5],
  ])('%s → %d', (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it.each(['', 'abc', '12a', '1,2,3', '--5', '1.2.3,4,5'])('rechaza %j', (input) => {
    expect(parseAmount(input)).toBeNull();
  });
});

describe('utilidades', () => {
  it('redondea y suma a céntimos', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(sum([0.1, 0.2, 0.3])).toBe(0.6);
  });

  it('claves y fechas', () => {
    expect(monthKey(2027, 3)).toBe('2027-03');
    expect(parseIndexedKey('2027-03_i12')).toEqual({ ym: '2027-03', kind: 'i', index: 12 });
    expect(parseIndexedKey('basura')).toBeNull();
    expect(parseDate('2027-02-29')).toBeNull();
    expect(parseDate('2028-02-29')).toEqual({ year: 2028, month: 2, day: 29 });
    expect(daysBetween('2027-12-25', '2028-01-01')).toBe(7);
  });
});
