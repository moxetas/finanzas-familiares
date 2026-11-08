import { describe, expect, it } from 'vitest';
import { autoEstimate, btcRows, contractSummary, salaryYears, type SalaryPerson } from '../src/calc';
import { sanitizeData } from '../src/storage/sanitize';
import { parseAnnex } from '../src/storage/backup';
import { parseQty } from '../src/ui/income-forms';

// Datos inventados (nunca datos reales en el repositorio).
const persona: SalaryPerson = {
  name: 'Persona',
  contracts: [
    { from: '2025-01', name: 'A' },
    { from: '2026-05', name: 'B' },
  ],
  months: { '2025-11': 1000, '2025-12': 2000, '2026-01': 1000, '2026-02': 3000, '2026-05': 2000, '2026-06': 4000 },
};

describe('sueldos', () => {
  it('media acumulada por año que vuelve a empezar con cada contrato', () => {
    const years = salaryYears(persona, 2026);
    expect(years.map((y) => y.year)).toEqual([2025, 2026]);
    expect(years[0]!.rows.map((r) => r.average)).toEqual([1000, 1500]);
    const y26 = years[1]!;
    // Enero y febrero con el contrato A; mayo empieza B (la media se reinicia). Marzo y abril: hueco sin rellenar.
    expect(y26.rows.slice(0, 4).map((r) => [r.ym, r.amount, r.average, r.estimated, r.contractStart])).toEqual([
      ['2026-01', 1000, 1000, false, false],
      ['2026-02', 3000, 2000, false, false],
      ['2026-05', 2000, 2000, false, true],
      ['2026-06', 4000, 3000, false, false],
    ]);
  });

  it('los meses que faltan hasta diciembre son estimados (media del contrato actual o a mano)', () => {
    expect(autoEstimate(persona)).toBe(3000);
    const y26 = salaryYears({ ...persona, estimates: { '2026-12': 5000 } }, 2026)[1]!;
    const rest = y26.rows.filter((r) => r.estimated);
    expect(rest.map((r) => r.ym)).toEqual(['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12']);
    expect(rest.map((r) => r.amount)).toEqual([3000, 3000, 3000, 3000, 3000, 5000]);
    expect(y26.estimated).toBe(true);
  });

  it('resumen por contrato', () => {
    expect(contractSummary(persona)).toEqual([
      { name: 'A', from: '2025-11', to: '2026-02', months: 4, average: 1750 },
      { name: 'B', from: '2026-05', to: '2026-06', months: 2, average: 3000 },
    ]);
  });
});

describe('BTC', () => {
  it('acumulado, total pagado (las ventas restan) y precio medio', () => {
    const rows = btcRows([
      { date: '2026-01-02', qty: 0.002, price: 50000, paid: 100 },
      { date: '2026-01-01', qty: 0.001, price: 40000, paid: 40 },
      { date: '2026-02-01', qty: -0.001, price: 60000, paid: -60 },
    ]);
    expect(rows.map((r) => [r.date, r.total, r.totalPaid, r.avgPrice])).toEqual([
      ['2026-01-01', 0.001, 40, 40000],
      ['2026-01-02', 0.003, 140, 46666.67],
      ['2026-02-01', 0.002, 80, 40000],
    ]);
  });

  it('lee cantidades con coma o punto', () => {
    expect(parseQty('0,00041577')).toBe(0.00041577);
    expect(parseQty('-0.005948')).toBe(-0.005948);
    expect(parseQty('abc')).toBeNull();
  });
});

describe('anexo y copia', () => {
  it('un anexo trae sueldos y BTC limpios; se conservan al guardar', () => {
    const a = parseAnnex(JSON.stringify({ app: 'finanzas-familiares', kind: 'anexo', salaries: [persona], btc: [{ date: '2026-01-01', qty: 0.001, price: 1, paid: 1 }, { date: 'mal', qty: 1 }] }))!;
    expect(a.salaries![0]!.months).toEqual(persona.months);
    expect(a.btc).toHaveLength(1);
    expect(parseAnnex('{"config":{"accounts":[]}}')).toBeNull();
    const d = sanitizeData({ config: { year: 2027, accounts: [{ name: 'A', initial: 0 }], salaries: a.salaries, btc: a.btc } }, 2027, 'A');
    expect(d.config.salaries![0]!.contracts).toHaveLength(2);
    expect(d.config.btc![0]!.qty).toBe(0.001);
  });
});
