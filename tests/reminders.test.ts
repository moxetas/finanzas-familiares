import { describe, expect, it } from 'vitest';
import { dueReminders, pruneShown, reminderSchedule, type Config } from '../src/calc';
import { buildCalendar, foldLine, icsText } from '../src/storage/calendar';

const config: Config = {
  year: 2027,
  example: false,
  accounts: [{ name: 'Banco', initial: 0 }],
  items: [],
  payments: [
    { date: '2027-03-09', concept: 'Ayer', amount: 5, account: 0, estimated: false },
    { date: '2027-03-10', concept: 'Hoy', amount: 10, account: 0, estimated: false },
    { date: '2027-03-11', concept: 'Mañana', amount: 11, account: 0, estimated: false },
    { date: '2027-03-12', concept: 'En 2 días', amount: 12, account: 0, estimated: true },
    { date: '2027-03-17', concept: 'En 7 días', amount: 17, account: 0, estimated: false },
    { date: '2027-03-18', concept: 'En 8 días', amount: 18, account: 0, estimated: false },
  ],
};

describe('avisos que tocan hoy', () => {
  it('semana de 7 a 2 días; día para mañana y hoy; nada fuera de la semana', () => {
    const due = dueReminders(config, {}, '2027-03-10');
    expect(due.map((r) => [r.concept, r.kind, r.inDays])).toEqual([
      ['Hoy', 'day', 0],
      ['Mañana', 'day', 1],
      ['En 2 días', 'week', 2],
      ['En 7 días', 'week', 7],
    ]);
  });

  it('la clave no depende del importe ni del orden de los pagos', () => {
    const a = dueReminders(config, {}, '2027-03-10');
    const b = dueReminders({ ...config, payments: [...config.payments].reverse() }, { '2027-03_p2': 99 }, '2027-03-10');
    expect(new Set(b.map((r) => r.key))).toEqual(new Set(a.map((r) => r.key)));
    expect(a.find((r) => r.concept === 'Mañana')!.key).toBe('2027-03-11|Mañana|day');
  });

  it('usa el importe cambiado de ese mes', () => {
    const due = dueReminders(config, { '2027-03_p2': 99 }, '2027-03-10');
    expect(due.find((r) => r.concept === 'Mañana')!.amount).toBe(99);
  });
});

describe('calendario de avisos para el service worker', () => {
  it('cada pago futuro tiene su ventana de semana y de día', () => {
    const s = reminderSchedule(config, {}, '2027-03-10');
    expect(s.filter((r) => r.concept === 'Ayer')).toHaveLength(0);
    const week = s.find((r) => r.concept === 'En 8 días' && r.kind === 'week')!;
    expect([week.from, week.until]).toEqual(['2027-03-11', '2027-03-16']);
    const day = s.find((r) => r.concept === 'En 8 días' && r.kind === 'day')!;
    expect([day.from, day.until]).toEqual(['2027-03-17', '2027-03-18']);
    // Cruza de mes y de año sin problemas.
    const y = reminderSchedule({ ...config, payments: [{ date: '2028-01-03', concept: 'Seguro', amount: 1, account: 0, estimated: false }] }, {}, '2027-12-01');
    expect(y.map((r) => [r.from, r.until])).toEqual([
      ['2027-12-27', '2028-01-01'],
      ['2028-01-02', '2028-01-03'],
    ]);
  });

  it('coincide con los avisos que tocan cada día', () => {
    const s = reminderSchedule(config, {}, '2027-03-01');
    for (const today of ['2027-03-05', '2027-03-10', '2027-03-11', '2027-03-16', '2027-03-17']) {
      const fromSchedule = s.filter((r) => r.from <= today && today <= r.until).map((r) => r.key).sort();
      const fromDue = dueReminders(config, {}, today).map((r) => r.key).sort();
      expect(fromSchedule).toEqual(fromDue);
    }
  });

  it('olvida avisos antiguos', () => {
    expect(pruneShown(['2027-01-01|A|day', '2027-03-01|B|week', '2027-03-01|B|week'], '2027-03-10')).toEqual(['2027-03-01|B|week']);
  });
});

describe('archivo de calendario', () => {
  /** Una barra invertida (así se lee mejor que con escapes dobles). */
  const BS = String.fromCharCode(92);
  const texts = {
    calendarName: 'Pagos',
    summary: 'Pago: {concept} · {amount}',
    alarmWeek: 'Dentro de una semana: {concept}',
    alarmDay: 'Mañana: {concept}',
    description: 'Creado con Finanzas familiares.',
    estimated: 'Importe estimado.',
  };

  it('un evento de día completo con alarmas una semana antes y el día de antes', () => {
    const ics = buildCalendar(
      [{ date: '2027-03-15', concept: 'Seguro, coche; anual', amountText: '410,00 €', estimated: true }],
      texts,
      new Date('2027-03-01T10:00:00Z'),
    );
    const lines = ics.split('\r\n');
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(lines).toContain('DTSTART;VALUE=DATE:20270315');
    expect(lines).toContain('DTEND;VALUE=DATE:20270316');
    expect(lines).toContain('DTSTAMP:20270301T100000Z');
    expect(lines).toContain('TRIGGER;RELATED=START:-P6DT15H');
    expect(lines).toContain('TRIGGER;RELATED=START:-PT15H');
    expect(lines).toContain(`SUMMARY:Pago: Seguro${BS}, coche${BS}; anual · 410${BS},00 €`);
    expect(lines).toContain('DESCRIPTION:Importe estimado. Creado con Finanzas familiares.');
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(2);
    // El UID es estable: el mismo pago da el mismo evento.
    const again = buildCalendar([{ date: '2027-03-15', concept: 'Seguro, coche; anual', amountText: '1 €', estimated: false }], texts);
    expect(again.match(/UID:.*/)![0]).toBe(ics.match(/UID:.*/)![0]);
  });

  it('escapa y corta líneas largas', () => {
    expect(icsText(`a,b;c${BS}d\ne`)).toBe(`a${BS},b${BS};c${BS}${BS}d${BS}ne`);
    const long = 'SUMMARY:' + 'ñ'.repeat(60);
    const folded = foldLine(long);
    for (const part of folded.split('\r\n')) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(folded.split('\r\n').map((p, i) => (i === 0 ? p : p.slice(1))).join('')).toBe(long);
  });
});
