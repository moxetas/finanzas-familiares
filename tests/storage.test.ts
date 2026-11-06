import { describe, expect, it } from 'vitest';
import { computeYear } from '../src/calc';
import { BackupError, backupFileName, parseBackup, serializeBackup } from '../src/storage/backup';
import { exampleData } from '../src/storage/example';
import { sanitizeData } from '../src/storage/sanitize';

describe('copia de seguridad', () => {
  it('exportar e importar devuelve los mismos datos', () => {
    const data = exampleData(2027, '2027-03-10');
    const text = serializeBackup(data, new Date('2027-03-10T10:00:00Z'));
    const back = parseBackup(text, 2000, 'Cuenta');
    expect(back).toEqual(data);
    expect(JSON.parse(text)).toMatchObject({ app: 'finanzas-familiares', version: 1 });
  });

  it('acepta el formato sin cabecera y el envuelto en data', () => {
    const data = exampleData(2027, '2027-03-10');
    expect(parseBackup(JSON.stringify(data), 2000, 'Cuenta')).toEqual(data);
    expect(parseBackup(JSON.stringify({ data }), 2000, 'Cuenta')).toEqual(data);
  });

  it('rechaza archivos que no son copias', () => {
    const code = (text: string) => {
      try {
        parseBackup(text, 2027, 'Cuenta');
        return 'ok';
      } catch (e) {
        return e instanceof BackupError ? e.code : 'other';
      }
    };
    expect(code('esto no es json')).toBe('not-json');
    expect(code('[]')).toBe('not-backup');
    expect(code('{"foo": 1}')).toBe('not-backup');
    expect(code('{"config": {}}')).toBe('not-backup');
    expect(code('{"version": 99, "config": {"accounts": []}}')).toBe('newer-version');
    expect(code('x'.repeat(6 * 1024 * 1024))).toBe('too-big');
  });

  it('nombre del archivo con la fecha', () => {
    expect(backupFileName(new Date(2027, 0, 5))).toBe('finanzas-familiares-2027-01-05.json');
  });
});

describe('limpieza de datos importados', () => {
  it('arregla o descarta lo que no vale', () => {
    const raw = {
      config: {
        year: 'nope',
        accounts: [{ name: '  Banco\n\u0007 ', initial: '12.5' }, { name: '', initial: Infinity }, 'basura'],
        items: [
          { name: 'Ok', type: 'Ahorro', amount: -50, account: 0, to: 1, from_month: 10, to_month: 2 },
          { name: 'Tipo raro', type: 'Robo', amount: 'x', account: 9, to: 5, from_month: 0, to_month: 99 },
        ],
        payments: [
          { date: '2027-02-30', concept: 'Fecha imposible', amount: 1, account: 0 },
          { date: '2027-02-28', concept: '<img src=x onerror=alert(1)>', amount: 3, account: 1, estimated: 'sí' },
        ],
      },
      overrides: { '2027-01_i0': -5, '2027-01_i9': 1, '2027-01_p0': 7, 'otra': 1, '2027-02_i1': 'x' },
      real_balances: { '2027-01_c1': -20, '2027-01_c7': 3 },
      entries: [
        { id: 'a', month: '2027-13', concept: 'Mes malo', amount: 1, type: 'Gasto', account: 0 },
        { id: 'a', month: '2027-01', concept: 'Uno', amount: 1, type: 'Gasto', date: '2027-02-01', account: 3 },
        { id: 'a', date: '2027-04-04', concept: 'Dos', amount: 2, type: 'Ingreso', account: 1, note: 5 },
      ],
    };
    const d = sanitizeData(raw, 2027, 'Cuenta');
    expect(d.config.year).toBe(2027);
    expect(d.config.accounts).toEqual([
      { name: 'Banco', initial: 12.5 },
      { name: 'Cuenta 2', initial: 0 },
    ]);
    expect(d.config.items).toEqual([
      { name: 'Ok', type: 'Ahorro', amount: 50, account: 0, to: 1, from_month: 2, to_month: 10 },
      { name: 'Tipo raro', type: 'Gasto', amount: 0, account: 0, to: -1, from_month: 1, to_month: 12 },
    ]);
    // El texto se guarda tal cual (la interfaz nunca lo trata como HTML).
    expect(d.config.payments).toEqual([
      { date: '2027-02-28', concept: '<img src=x onerror=alert(1)>', amount: 3, account: 1, estimated: false },
    ]);
    expect(d.overrides).toEqual({ '2027-01_i0': 5, '2027-01_p0': 7 });
    expect(d.real_balances).toEqual({ '2027-01_c1': -20 });
    expect(d.entries.map((e) => [e.month, e.concept, e.date, e.account, e.note])).toEqual([
      ['2027-01', 'Uno', '', 0, ''],
      ['2027-04', 'Dos', '2027-04-04', 1, ''],
    ]);
    expect(new Set(d.entries.map((e) => e.id)).size).toBe(2);
    expect(() => computeYear(d)).not.toThrow();
  });

  it('siempre deja al menos una cuenta', () => {
    expect(sanitizeData(null, 2027, 'Mi cuenta').config.accounts).toEqual([{ name: 'Mi cuenta', initial: 0 }]);
  });
});

describe('ejemplo ficticio', () => {
  it('está marcado como ejemplo y es válido', () => {
    const data = exampleData(2027, '2027-05-20');
    expect(data.config.example).toBe(true);
    expect(sanitizeData(data, 2000, 'x')).toEqual(data);
  });

  it('tiene saldos reales en enero y pagos próximos a hoy', () => {
    const data = exampleData(2027, '2027-05-20');
    const year = computeYear(data);
    expect(year.months[0]!.diff[0]).toBe(-42.3);
    expect(data.config.payments.some((p) => p.date === '2027-05-24')).toBe(true);
    expect(data.entries.every((e) => e.month === '2027-05')).toBe(true);
    expect(year.totals.endOfYear).toBeGreaterThan(0);
  });
});
