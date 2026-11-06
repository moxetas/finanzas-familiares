/**
 * Archivo de calendario (.ics, RFC 5545) con los pagos no mensuales.
 * Cada pago es un evento de día completo con dos alarmas: una semana antes y
 * el día de antes, a las 9:00. Así el calendario del móvil avisa aunque la app
 * esté cerrada, también en iPhone.
 */

export interface CalendarPayment {
  date: string;
  concept: string;
  /** Importe ya formateado (p. ej. «410,00 €»). */
  amountText: string;
  estimated: boolean;
}

export interface CalendarTexts {
  calendarName: string;
  /** Título del evento: `{concept}` y `{amount}`. */
  summary: string;
  /** Texto de la alarma de una semana antes: `{concept}`. */
  alarmWeek: string;
  /** Texto de la alarma del día de antes: `{concept}`. */
  alarmDay: string;
  description: string;
  estimated: string;
}

/** Escapa texto para un valor iCalendar. */
export function icsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Corta las líneas de más de 75 bytes, como pide el formato. */
export function foldLine(line: string): string {
  const bytes = new TextEncoder();
  if (bytes.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const n = bytes.encode(ch).length;
    const limit = parts.length === 0 ? 75 : 74; // las siguientes empiezan con un espacio
    if (size + n > limit) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += n;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

/** Huella corta y estable de un texto (para el UID del evento). */
function hash(s: string): string {
  let h = 5381;
  for (const ch of s) h = (Math.imul(h, 33) ^ ch.codePointAt(0)!) >>> 0;
  return h.toString(36);
}

const fill = (tpl: string, vars: Record<string, string>) => tpl.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');

function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function nextDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

export function buildCalendar(payments: CalendarPayment[], texts: CalendarTexts, now: Date = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Finanzas familiares//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(texts.calendarName)}`,
  ];
  for (const p of payments) {
    const vars = { concept: p.concept, amount: p.amountText };
    const description = [p.estimated ? texts.estimated : null, texts.description].filter(Boolean).join(' ');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${p.date.replace(/-/g, '')}-${hash(p.concept)}@finanzas-familiares`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${p.date.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${nextDay(p.date).replace(/-/g, '')}`,
      `SUMMARY:${icsText(fill(texts.summary, vars))}`,
      `DESCRIPTION:${icsText(description)}`,
      'TRANSP:TRANSPARENT',
      // El evento empieza a las 0:00; −6 días y 15 h = 9:00 de una semana antes.
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsText(fill(texts.alarmWeek, vars))}`,
      'TRIGGER;RELATED=START:-P6DT15H',
      'END:VALARM',
      // −15 h = 9:00 del día de antes.
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsText(fill(texts.alarmDay, vars))}`,
      'TRIGGER;RELATED=START:-PT15H',
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
