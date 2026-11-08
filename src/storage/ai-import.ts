/**
 * Cargar datos desde fotos, capturas o PDF con la IA que cada persona ya usa
 * (ChatGPT, Claude, Gemini…). La app no envía nada a ningún sitio: copia unas
 * instrucciones, la persona adjunta el documento en su app de IA y pega aquí la
 * respuesta. También acepta texto copiado tal cual (de un correo o del texto de
 * una foto) e intenta sacar fecha, importe y concepto.
 */

import { parseDate } from '../calc/keys';
import { parseAmount, round2 } from '../calc/money';

export type ImportKind = 'pago' | 'gasto' | 'ingreso' | 'mensual';

export interface ImportRow {
  kind: ImportKind;
  concept: string;
  amount: number;
  /** AAAA-MM-DD */
  date: string;
  estimated: boolean;
  note: string;
}

export const AI_PROMPT = `Lee el documento adjunto (factura, recibo, captura de pantalla, foto o PDF) y devuélveme SOLO un bloque de código JSON, sin explicaciones, con esta forma:

{"finanzas":[{"tipo":"pago","concepto":"Seguro del coche","importe":410.50,"fecha":"2027-01-15","estimado":false,"nota":"Anual"}]}

Reglas:
- "tipo": "pago" si es un cobro único o anual que llegará en una fecha (seguro, impuesto, recibo trimestral…); "mensual" si se repite todos los meses (alquiler, luz, móvil…); "gasto" si ya está pagado y fue algo puntual; "ingreso" si es dinero que entra.
- "importe": número positivo con punto decimal, sin símbolo de moneda.
- "fecha": AAAA-MM-DD (la de cargo o vencimiento; si no hay, la de emisión).
- "estimado": true si el importe no es seguro.
- "concepto": corto y claro, en español.
- Si hay varios cargos o plazos, pon uno por elemento.
- No incluyas IBAN, números de cuenta, direcciones ni datos personales.`;

const KINDS: readonly ImportKind[] = ['pago', 'gasto', 'ingreso', 'mensual'];

function clean(s: unknown, max = 60): string {
  return typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return round2(Math.abs(v));
  if (typeof v === 'string') {
    const n = parseAmount(v);
    return n === null ? null : Math.abs(n);
  }
  return null;
}

/** «15.01.2027», «15/01/27», «2027-01-15» → «2027-01-15». */
export function toISODate(v: unknown, fallbackYear = new Date().getFullYear()): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  let m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  let iso: string | null = null;
  if (m) iso = `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`;
  else if ((m = /\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/.exec(s))) {
    const y = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
    iso = `${y}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  } else if ((m = /\b(\d{1,2})[./](\d{1,2})\b/.exec(s))) {
    iso = `${fallbackYear}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  }
  return iso && parseDate(iso) ? iso : null;
}

/** Busca un JSON en el texto (también dentro de un bloque ```json). */
function findJson(text: string): unknown {
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidates = [fence?.[1], text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1), text.slice(text.indexOf('['), text.lastIndexOf(']') + 1)];
  for (const c of candidates) {
    if (!c || c.length < 2) continue;
    try {
      return JSON.parse(c);
    } catch {
      /* siguiente */
    }
  }
  return undefined;
}

function fromJson(raw: unknown, today: string): ImportRow[] {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? ((raw as Record<string, unknown>)['finanzas'] ?? (raw as Record<string, unknown>)['items']) : undefined;
  if (!Array.isArray(list)) return [];
  const rows: ImportRow[] = [];
  for (const x of list.slice(0, 100)) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const amount = toNumber(o['importe'] ?? o['amount']);
    if (amount === null || amount === 0) continue;
    const t = clean(o['tipo'] ?? o['type'], 20).toLowerCase();
    const kind: ImportKind = KINDS.includes(t as ImportKind) ? (t as ImportKind) : 'pago';
    rows.push({
      kind,
      concept: clean(o['concepto'] ?? o['concept']) || '—',
      amount,
      date: toISODate(o['fecha'] ?? o['date']) ?? today,
      estimated: o['estimado'] === true || o['estimated'] === true,
      note: clean(o['nota'] ?? o['note'], 200),
    });
  }
  return rows;
}

/** Texto suelto (correo, texto de una foto): el importe mayor con €, la primera fecha y la primera línea con letras. */
function fromText(text: string, today: string): ImportRow[] {
  const amounts: number[] = [];
  const re = /(?:€|eur)\s*(-?\d[\d.,\s]*\d|\d)|(-?\d[\d.,]*\d|\d)\s*(?:€|eur\b|euros?\b)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const n = parseAmount((m[1] ?? m[2] ?? '').replace(/\s/g, ''));
    if (n !== null && n !== 0) amounts.push(Math.abs(n));
  }
  if (amounts.length === 0) {
    // Sin símbolo de moneda: números con dos decimales.
    for (const x of text.match(/\b\d{1,3}(?:[.\s]\d{3})*,\d{2}\b|\b\d+\.\d{2}\b/g) ?? []) {
      const n = parseAmount(x);
      if (n) amounts.push(Math.abs(n));
    }
  }
  if (amounts.length === 0) return [];
  const date = toISODate(text) ?? today;
  const concept = clean(text.split(/\r?\n/).find((l) => /[a-záéíóúñü]{3,}/i.test(l)) ?? '') || '—';
  return [{ kind: 'pago', concept, amount: Math.max(...amounts), date, estimated: false, note: '' }];
}

/** Lee lo pegado: primero como respuesta de la IA (JSON); si no, como texto suelto. */
export function parseImport(text: string, today: string): ImportRow[] {
  const json = findJson(text);
  const rows = json === undefined ? [] : fromJson(json, today);
  return rows.length ? rows : fromText(text, today);
}
