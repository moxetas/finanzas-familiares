import { describe, expect, it } from 'vitest';
import { autoEstimate, btcRows, contractSummary, ensureSalaryPeople, salaryYears, withPlannedYear, type AppData, type SalaryPerson } from '../src/calc';
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

describe('sueldos desde la pestaña Meses (el sueldo va en el mes siguiente, como en la hoja)', () => {
  it('año planificado: lo de enero es el sueldo de diciembre; el resto, estimado con el concepto', async () => {
    const { blankData, withPlannedYear, salaryYears: years } = await import('../src/calc');
    const base = blankData(2027, 'Banco');
    const data = {
      ...base,
      config: { ...base.config, items: [{ name: 'SUELDO PERSONA', type: 'Ingreso' as const, amount: 3000, account: 0, to: -1, from_month: 1, to_month: 12 }] },
      overrides: { '2027-01_i0': 3123.45, '2027-02_i0': 3050 },
    };
    const p = { name: 'Persona', contracts: [], months: { '2026-11': 2900 } };
    const { person, autoAfter } = withPlannedYear(data, p);
    const y = years(person, 2027, autoAfter);
    expect(y.find((x) => x.year === 2026)!.rows.find((r) => r.ym === '2026-12')).toMatchObject({ amount: 3123.45, estimated: false });
    const y27 = y.find((x) => x.year === 2027)!;
    expect(y27.rows[0]).toMatchObject({ ym: '2027-01', amount: 3050, estimated: false });
    expect(y27.rows[1]).toMatchObject({ ym: '2027-02', amount: 3000, estimated: true });
    expect(y27.rows[11]).toMatchObject({ ym: '2027-12', amount: 3000, estimated: true });
  });

  it('meses de la hoja: la cifra cambiada a mano en diciembre es el sueldo cobrado de noviembre', async () => {
    const { blankData, withPlannedYear, salaryYears: years, salaryCell } = await import('../src/calc');
    const base = blankData(2027, 'Banco');
    const data = {
      ...base,
      history: {
        '2026-12': { title: 'Diciembre 2026', cols: ['ING.GIRO', 'VB'], rows: [{ l: 'Sueldo Ana', v: [1550, null] }], tot: [1550, null] },
      },
      overrides: { '2026-12_r0_c0': 1498.21 },
    };
    const p = { name: 'Ana', contracts: [], months: { '2026-10': 1548.21 } };
    expect(salaryCell(data, p, '2026-11')).toEqual({ kind: 'history', ym: '2026-12', row: 0, col: 0 });
    const { person, autoAfter } = withPlannedYear(data, p);
    const y26 = years(person, 2027, autoAfter).find((x) => x.year === 2026)!;
    expect(y26.rows.find((r) => r.ym === '2026-11')).toMatchObject({ amount: 1498.21, estimated: false });
    // Sin tocar la cifra de la hoja, noviembre sigue estimado.
    const { person: p2, autoAfter: a2 } = withPlannedYear({ ...data, overrides: {} }, p);
    expect(years(p2, 2027, a2).find((x) => x.year === 2026)!.rows.find((r) => r.ym === '2026-11')!.estimated).toBe(true);
  });
});

describe('personas de Sueldos desde los conceptos de Meses', () => {
  const withItems = (names: string[], salaries?: { name: string }[]): AppData => ({
    config: {
      year: 2027,
      example: false,
      accounts: [{ name: 'ING', initial: 0 }],
      items: names.map((name) => ({ name, type: 'Ingreso' as const, amount: 3000, account: 0, to: -1, from_month: 1, to_month: 12 })),
      payments: [],
      ...(salaries ? { salaries: salaries.map((s) => ({ ...s, contracts: [], months: {} })) } : {}),
    },
    overrides: {},
    real_balances: {},
    entries: [],
  });

  it('crea a cada persona con concepto de sueldo, sin repetir las que ya hay', () => {
    const d = ensureSalaryPeople(withItems(['SUELDO ALBERTO', 'Nómina Ana', 'KINDERGELD'], [{ name: 'alberto' }]));
    expect(d.config.salaries!.map((p) => p.name)).toEqual(['alberto', 'Ana']);
    const same = ensureSalaryPeople(d);
    expect(same).toBe(d);
  });

  it('lo escrito en Meses sale en Sueldos de esa persona', () => {
    let d = ensureSalaryPeople(withItems(['SUELDO ALBERTO']));
    d = { ...d, overrides: { '2027-02_i0': 3210.5 } };
    const { person } = withPlannedYear(d, d.config.salaries![0]!);
    expect(person.name).toBe('Alberto');
    expect(person.months['2027-01']).toBe(3210.5);
  });
});
