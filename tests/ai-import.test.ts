import { describe, expect, it } from 'vitest';
import { parseImport, toISODate } from '../src/storage/ai-import';

const TODAY = '2026-11-08';

describe('cargar desde la IA o desde texto', () => {
  it('lee la respuesta de la IA en un bloque de código', () => {
    const text = 'Aquí tienes:\n```json\n{"finanzas":[{"tipo":"pago","concepto":"Seguro coche","importe":410.5,"fecha":"2027-01-15","estimado":true},{"tipo":"mensual","concepto":"Luz","importe":"85,20","fecha":"15.02.2027"},{"tipo":"raro","concepto":"X","importe":0}]}\n```';
    expect(parseImport(text, TODAY)).toEqual([
      { kind: 'pago', concept: 'Seguro coche', amount: 410.5, date: '2027-01-15', estimated: true, note: '' },
      { kind: 'mensual', concept: 'Luz', amount: 85.2, date: '2027-02-15', estimated: false, note: '' },
    ]);
  });

  it('acepta una lista suelta y tipos desconocidos como pago', () => {
    expect(parseImport('[{"concepto":"IBI","importe":159.16,"fecha":"2027-06-03","tipo":"otro"}]', TODAY)[0]).toMatchObject({ kind: 'pago', amount: 159.16 });
  });

  it('saca importe, fecha y concepto de texto suelto (correo o foto)', () => {
    const mail = 'VHV Versicherungen\nBeitragsrechnung\nFällig am 01.01.2027\nGesamtbetrag: 947,33 €\nIBAN DE00 ...';
    expect(parseImport(mail, TODAY)).toEqual([{ kind: 'pago', concept: 'VHV Versicherungen', amount: 947.33, date: '2027-01-01', estimated: false, note: '' }]);
  });

  it('sin importe no devuelve nada', () => {
    expect(parseImport('hola, ¿qué tal?', TODAY)).toEqual([]);
  });

  it('fechas', () => {
    expect(toISODate('15/01/27')).toBe('2027-01-15');
    expect(toISODate('31.02.2027')).toBeNull();
  });
});
