/**
 * Avisos con la app cerrada para todas las familias (protocolo «avisos/v1», el mismo
 * que Menú familiar y el servicio de avisos del repositorio moxetas/avisos-familia).
 *
 * Cómo funciona, sin que el servidor pueda leer nada:
 * 1. Este móvil calcula los avisos de los próximos meses y deja cada uno en `/cola/<id>`
 *    con la hora a la que hay que enviarlo (`t`), hasta cuándo vale (`h`) y el texto
 *    CIFRADO (`p`) con una clave que sale del código de familia.
 * 2. Cada móvil que activa los avisos se apunta en `/subs/<familia>/<móvil>`.
 * 3. El servicio de avisos (cada hora) manda a los móviles de la familia los avisos cuya
 *    hora ha llegado. Solo ve horas y una huella de la familia, nunca el código ni el texto.
 * 4. El service worker de este móvil descifra el aviso y lo enseña.
 *
 * En `/familias/<código>/avisos-f` queda la lista de avisos puestos en la cola (con una
 * firma de su contenido): así cualquier móvil de la familia sabe qué cambiar o quitar.
 */

import { seal } from './cipher';
import { dbFor } from './sync';
import type { ReminderFile } from './local';

/** Esta app en la cola («m» es Menú familiar). */
export const APP = 'f';
/** Clave pública para firmar los avisos (la privada solo la tiene el servicio de avisos). */
export const VAPID_PUBLIC = 'BBgZ_6g8t-8HrrKObqkIyGRIBs_LSXo5ymEplnPACy_FfEojNkAMF4PWBdZbw79qTJuNKNPMfaoGE1buefuUH_Q';
/** Días por delante que se ponen en la cola (se renueva cada vez que se abre o cambia la app). */
export const HORIZON_DAYS = 120;
/** Hora local a la que salta un aviso el primer día que toca. */
export const NOTIFY_HOUR = 9;

const enc = new TextEncoder();
const clean = (code: string): string => code.toLowerCase().replace(/[^a-z0-9]/g, '');

async function sha(text: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)));
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Huella de la familia (32 caracteres): no deja sacar el código. */
export async function famId(code: string): Promise<string> {
  return (await sha(`avisos/v1|${clean(code)}`)).slice(0, 32);
}

/** Identificador de un aviso en la cola (57 caracteres): familia + app + huella del aviso. */
export async function itemId(code: string, app: string, key: string): Promise<string> {
  return (await famId(code)) + app + (await sha(`avisos/v1|${clean(code)}|${app}|${key}`)).slice(0, 24);
}

const keyCache = new Map<string, Promise<CryptoKey>>();

/** Clave AES de los avisos (distinta de la de los datos). No se puede exportar. */
export function avisosKey(code: string): Promise<CryptoKey> {
  const c = clean(code);
  let key = keyCache.get(c);
  if (!key) {
    key = crypto.subtle
      .importKey('raw', enc.encode(c), 'HKDF', false, ['deriveKey'])
      .then((base) =>
        crypto.subtle.deriveKey(
          { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('avisos/v1'), info: enc.encode('aviso') },
          base,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt'],
        ),
      );
    keyCache.set(c, key);
  }
  return key;
}

/** Un aviso para la cola. `payload` es lo que verá el service worker al descifrarlo. */
export interface ColaEntry {
  key: string;
  /** Cuándo enviarlo (milisegundos). */
  t: number;
  /** Hasta cuándo tiene sentido enviarlo (milisegundos). */
  h: number;
  payload: unknown;
}

/** Medianoche local de una fecha AAAA-MM-DD + horas. */
function localTime(iso: string, hours: number): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d!, hours).getTime();
}

/** Avisos de la cola a partir del archivo de avisos que ya prepara la app para el service worker. */
export function buildCola(file: ReminderFile, now: number = Date.now()): ColaEntry[] {
  const limit = now + HORIZON_DAYS * 864e5;
  const out: ColaEntry[] = [];
  for (const r of file.items) {
    const t = localTime(r.from, NOTIFY_HOUR);
    const h = localTime(r.until, 24) - 1;
    if (h <= now || t > limit) continue;
    out.push({
      key: r.key,
      t,
      h,
      payload: { k: r.key, c: r.concept, a: r.amountText, d: r.dateText, date: r.date, e: r.estimated, l: file.labels },
    });
  }
  return out;
}

/** Firma corta de un aviso: si no cambia, no se vuelve a subir. */
export async function signature(e: ColaEntry): Promise<string> {
  return (await sha(JSON.stringify([e.t, e.h, e.payload]))).slice(0, 16);
}

/**
 * Cambios para Firebase (una sola escritura en varias rutas): avisos nuevos o cambiados,
 * avisos que sobran y la lista nueva. Devuelve `null` si no hay nada que cambiar.
 */
export async function colaUpdates(code: string, app: string, entries: ColaEntry[], prev: Record<string, string>): Promise<Record<string, unknown> | null> {
  const fam = await famId(code);
  const key = await avisosKey(code);
  const next: Record<string, string> = {};
  const updates: Record<string, unknown> = {};
  for (const e of entries) {
    const id = await itemId(code, app, e.key);
    const sig = await signature(e);
    next[id] = sig;
    if (prev[id] !== sig) updates[`cola/${id}`] = { f: fam, a: app, t: e.t, h: e.h, p: await seal(key, JSON.stringify(e.payload)) };
  }
  for (const id of Object.keys(prev)) if (!(id in next)) updates[`cola/${id}`] = null;
  if (Object.keys(updates).length === 0) return null;
  updates[`familias/${code}/avisos-${app}`] = Object.keys(next).length ? next : null;
  return updates;
}

/**
 * Pone al día la cola de avisos de la familia. Solo trabaja si algún móvil de la familia
 * tiene los avisos activados (ya hay una lista) o si se fuerza (al activarlos aquí).
 */
export async function syncCola(code: string, entries: ColaEntry[], force = false): Promise<void> {
  const db = dbFor(code);
  const res = await fetch(`${db}/familias/${code}/avisos-${APP}.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Firebase ${res.status}`);
  const prev = ((await res.json()) ?? {}) as Record<string, string>;
  if (!force && Object.keys(prev).length === 0) return;
  const updates = await colaUpdates(code, APP, entries, prev);
  if (!updates) return;
  const put = await fetch(`${db}/.json`, { method: 'PATCH', body: JSON.stringify(updates) });
  if (!put.ok) throw new Error(`Firebase ${put.status}`);
}

// ── Clave para el service worker ────────────────────────────────────────────
// El service worker la lee de IndexedDB (la misma base que usa la app) para descifrar los avisos.

export function saveKeyForWorker(code: string): Promise<void> {
  return avisosKey(code).then(
    (key) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('finanzas-familiares', 1);
        open.onupgradeneeded = () => {
          if (!open.result.objectStoreNames.contains('kv')) open.result.createObjectStore('kv');
        };
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction('kv', 'readwrite');
          tx.objectStore('kv').put(key, 'avisos-key');
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
}
