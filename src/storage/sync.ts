/**
 * Sincronización opcional entre móviles con Firebase Realtime Database.
 *
 * - Es opcional y empieza apagada: sin código de familia, nada sale del aparato.
 * - Los datos se guardan en `/familias/<código>/finanzas`. Solo quien conoce el
 *   código (20 letras y cifras al azar) puede leerlos o cambiarlos.
 * - Cada cambio se compara con la última copia sincronizada y solo se envía lo
 *   que ha cambiado. Los cambios de los demás llegan al momento (EventSource).
 * - Sin cobertura, la app sigue funcionando y envía los cambios al volver.
 * - Si dos personas cambian lo mismo a la vez, gana el último en enviar.
 *
 * Las funciones puras (`flatten`, `unflatten`, `diffFlat`, `mergeFlat`) no tocan
 * la red y tienen pruebas.
 */

import type { AppData, Entry } from '../calc/types';
import { sanitizeData } from './sanitize';
import { familyKey, sealAll, unsealAll } from './cipher';

export const FIREBASE_DB = 'https://menu-familiar-a2424-default-rtdb.europe-west1.firebasedatabase.app';
const LS_KEY = 'finanzas-familiares:sync';

/** Datos «aplanados»: una ruta (`cfg`, `ov/<clave>`, `rl/<clave>`, `en/<id>`) → valor. */
export type Flat = Record<string, string | number>;

const fbKey = (s: string): string => s.replace(/[.#$[\]/]/g, '_') || '_';

export function flatten(data: AppData): Flat {
  const flat: Flat = {
    cfg: JSON.stringify({ config: data.config, history: data.history ?? null, domiciliaciones: data.domiciliaciones ?? null }),
  };
  for (const [k, v] of Object.entries(data.overrides)) flat[`ov/${fbKey(k)}`] = v;
  for (const [k, v] of Object.entries(data.real_balances)) flat[`rl/${fbKey(k)}`] = v;
  for (const e of data.entries) flat[`en/${fbKey(e.id)}`] = JSON.stringify(e);
  return flat;
}

/** Lo que devuelve Firebase (`{cfg, ov:{…}, rl:{…}, en:{…}}`) en forma `Flat`. */
export function fromRemote(raw: unknown): Flat {
  const flat: Flat = {};
  if (typeof raw !== 'object' || raw === null) return flat;
  const r = raw as Record<string, unknown>;
  if (typeof r['cfg'] === 'string') flat['cfg'] = r['cfg'];
  for (const [prefix, key] of [['ov', 'ov'], ['rl', 'rl'], ['en', 'en']] as const) {
    const group = r[key];
    if (typeof group !== 'object' || group === null) continue;
    for (const [k, v] of Object.entries(group as Record<string, unknown>)) {
      if (typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v))) flat[`${prefix}/${k}`] = v;
    }
  }
  return flat;
}

export function unflatten(flat: Flat, fallbackYear: number, defaultAccountName: string): AppData {
  let cfg: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(String(flat['cfg'] ?? '{}'));
    if (typeof parsed === 'object' && parsed !== null) cfg = parsed as Record<string, unknown>;
  } catch {
    /* configuración rota: se queda vacía y sanitize pone una por defecto */
  }
  const overrides: Record<string, number> = {};
  const real_balances: Record<string, number> = {};
  const entries: Entry[] = [];
  for (const [path, v] of Object.entries(flat)) {
    if (path.startsWith('ov/') && typeof v === 'number') overrides[path.slice(3)] = v;
    else if (path.startsWith('rl/') && typeof v === 'number') real_balances[path.slice(3)] = v;
    else if (path.startsWith('en/') && typeof v === 'string') {
      try {
        entries.push(JSON.parse(v) as Entry);
      } catch {
        /* apunte roto: se ignora */
      }
    }
  }
  entries.sort((a, b) => (String(a.month) + String(a.date) + String(a.id) < String(b.month) + String(b.date) + String(b.id) ? -1 : 1));
  return sanitizeData({ config: cfg['config'], history: cfg['history'], domiciliaciones: cfg['domiciliaciones'], overrides, real_balances, entries }, fallbackYear, defaultAccountName);
}

/** Rutas que cambian de `from` a `to`; `null` = borrada. */
export function diffFlat(from: Flat, to: Flat): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {};
  for (const [k, v] of Object.entries(to)) if (from[k] !== v) out[k] = v;
  for (const k of Object.keys(from)) if (!(k in to)) out[k] = null;
  return out;
}

/** Aplica un parche de `diffFlat` a una copia. */
export function applyPatch(flat: Flat, patch: Record<string, string | number | null>): Flat {
  const out = { ...flat };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete out[k];
    else out[k] = v;
  }
  return out;
}

/**
 * Junta lo del servidor con los cambios de este móvil que aún no se han enviado
 * (`cur` frente a `base`). En lo que cambiaron ambos, gana este móvil.
 */
export function mergeFlat(base: Flat, remote: Flat, cur: Flat): Flat {
  const local = diffFlat(base, cur);
  return applyPatch(remote, local);
}

// ── Código de familia ────────────────────────────────────────────────────────

export function newCode(): string {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  const r = new Uint32Array(20);
  crypto.getRandomValues(r);
  return Array.from(r, (n) => abc[n % abc.length]!).join('').match(/.{4}/g)!.join('-');
}

/** Acepta el código con o sin guiones, o dentro de un mensaje. Devuelve `null` si no es válido. */
export function readCode(text: string): string | null {
  const lower = String(text).toLowerCase();
  const m = lower.match(/[a-z0-9]{4}(?:-[a-z0-9]{4}){4}/) ?? lower.match(/(?<![a-z0-9])[a-z0-9]{20}(?![a-z0-9])/);
  const s = (m ? m[0] : lower).replace(/[^a-z0-9]/g, '');
  return s.length === 20 ? s.match(/.{4}/g)!.join('-') : null;
}

// ── Conexión ─────────────────────────────────────────────────────────────────

export type SyncStatus = 'off' | 'connecting' | 'online' | 'offline' | 'denied';

export interface SyncHost {
  getData(): AppData;
  /** Sustituye los datos sin volver a enviarlos. */
  replaceData(data: AppData): void;
  fallbackYear(): number;
  accountName(): string;
}

interface Info {
  code: string;
  base: Flat;
  /** 2 = datos cifrados en `finanzas-c`. Sin versión: aún en `finanzas` sin cifrar. */
  v?: number;
}

/** Datos cifrados (desde la v2). */
const PATH = 'finanzas-c';
/** Datos de antes del cifrado: se pasan a `PATH` y, una semana después, se borran. */
const OLD_PATH = 'finanzas';
const OLD_GRACE = 7 * 24 * 3600 * 1000;

export type ConnectResult = 'ok' | 'needs-choice' | 'denied' | 'offline';

export class Sync {
  status: SyncStatus = 'off';
  lastSync = 0;
  private info: Info | null = null;
  private es: EventSource | null = null;
  private listeners = new Set<() => void>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private pullTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private busy: Promise<void> = Promise.resolve();

  constructor(private host: SyncHost) {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) ?? 'null') as Info | null;
      if (saved && typeof saved.code === 'string' && readCode(saved.code)) this.info = { code: saved.code, base: saved.base ?? {}, v: saved.v };
    } catch {
      /* sin sincronización guardada */
    }
  }

  get code(): string | null {
    return this.info?.code ?? null;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private setStatus(s: SyncStatus): void {
    if (s === this.status) return;
    this.status = s;
    for (const fn of this.listeners) fn();
  }

  private save(): void {
    try {
      if (this.info) localStorage.setItem(LS_KEY, JSON.stringify(this.info));
      else localStorage.removeItem(LS_KEY);
    } catch {
      /* sin espacio */
    }
  }

  private url(path = PATH, code = this.info!.code): string {
    return `${FIREBASE_DB}/familias/${code}/${path}.json`;
  }

  /** Lee y descifra lo que hay en la nube (`{}` si no hay nada). */
  private async fetchRemote(code: string, path = PATH): Promise<Flat> {
    const res = await fetch(this.url(path, code), { cache: 'no-store' });
    if (res.status === 401 || res.status === 403) throw new DeniedError();
    if (!res.ok) throw new Error(String(res.status));
    const raw = fromRemote(await res.json());
    if (path === OLD_PATH) return raw;
    return (await unsealAll(await familyKey(code), raw)).values;
  }

  /** Cifra un parche o unos datos completos antes de enviarlos. */
  private async sealed(code: string, patch: Record<string, string | number | null>): Promise<Record<string, string | null>> {
    return sealAll(await familyKey(code), patch);
  }

  /**
   * Paso único a los datos cifrados: si ya hay datos cifrados, mandan (son los de los
   * móviles ya actualizados); si no, se juntan los de antes con los de este móvil y se
   * suben cifrados. Los de antes se borran una semana después (ver `cleanOld`).
   */
  private async migrate(info: Info): Promise<void> {
    const remote = await this.fetchRemote(info.code);
    if (Object.keys(remote).length > 0) {
      this.host.replaceData(unflatten(remote, this.host.fallbackYear(), this.host.accountName()));
      info.base = remote;
    } else {
      const old = await this.fetchRemote(info.code, OLD_PATH);
      const cur = flatten(this.host.getData());
      const merged = Object.keys(old).length ? mergeFlat(info.base, old, cur) : cur;
      const res = await fetch(this.url(PATH, info.code), { method: 'PUT', body: JSON.stringify(toRemote(await this.sealed(info.code, merged) as Flat)) });
      if (!res.ok) throw new Error(String(res.status));
      await fetch(`${FIREBASE_DB}/familias/${info.code}/finanzas-migrado.json`, { method: 'PUT', body: JSON.stringify(Date.now()) }).catch(() => null);
      if (Object.keys(diffFlat(cur, merged)).length > 0) this.host.replaceData(unflatten(merged, this.host.fallbackYear(), this.host.accountName()));
      info.base = merged;
    }
    info.v = 2;
    this.save();
  }

  private cleaned = false;

  /** Borra los datos sin cifrar de antes, cuando ya ha pasado una semana desde el cambio. */
  private async cleanOld(code: string): Promise<void> {
    if (this.cleaned) return;
    this.cleaned = true;
    try {
      const res = await fetch(`${FIREBASE_DB}/familias/${code}/finanzas-migrado.json`, { cache: 'no-store' });
      const when = (await res.json()) as unknown;
      if (typeof when === 'number' && Date.now() - when > OLD_GRACE) {
        await fetch(this.url(OLD_PATH, code), { method: 'DELETE' });
      }
    } catch {
      /* se intentará otro día */
    }
  }

  /** Arranca la sincronización si ya estaba activada en este móvil. */
  start(): void {
    if (!this.info) return;
    this.setStatus('connecting');
    void this.pull().then(() => this.open());
    window.addEventListener('online', () => this.kick());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.kick();
    });
  }

  private kick(): void {
    if (!this.info) return;
    void this.pull();
    if (!this.es || this.es.readyState === EventSource.CLOSED) this.open();
  }

  /** Activa la sincronización con un código. */
  async connect(code: string, choice?: 'cloud' | 'phone'): Promise<ConnectResult> {
    const prev = this.info;
    this.info = { code, base: {}, v: 2 };
    this.setStatus('connecting');
    let remote: Flat;
    try {
      remote = await this.fetchRemote(code);
      // Familia que aún no ha pasado al cifrado: se toman sus datos de antes.
      if (Object.keys(remote).length === 0) remote = await this.fetchRemote(code, OLD_PATH);
    } catch (e) {
      this.info = prev;
      this.setStatus(prev ? this.status : 'off');
      return e instanceof DeniedError ? 'denied' : 'offline';
    }
    const local = this.host.getData();
    const hasRemote = Object.keys(remote).length > 0;
    if (hasRemote && !local.config.example && choice === undefined) {
      this.info = prev;
      this.setStatus(prev ? this.status : 'off');
      return 'needs-choice';
    }
    if (hasRemote && (local.config.example || choice === 'cloud')) {
      this.host.replaceData(unflatten(remote, this.host.fallbackYear(), this.host.accountName()));
      // Se suben cifrados (si venían de los datos de antes, así quedan ya pasados).
      await fetch(this.url(PATH, code), { method: 'PUT', body: JSON.stringify(toRemote((await this.sealed(code, remote)) as Flat)) }).catch(() => null);
      this.info = { code, base: remote, v: 2 };
    } else if (hasRemote && choice === 'phone') {
      // Lo de este móvil sustituye lo que había en la nube.
      const cur = flatten(local);
      const res = await fetch(this.url(), { method: 'PUT', body: JSON.stringify(toRemote((await this.sealed(code, cur)) as Flat)) }).catch(() => null);
      if (!res?.ok) {
        this.info = prev;
        this.setStatus('offline');
        return 'offline';
      }
      this.info = { code, base: cur, v: 2 };
    } else {
      this.info = { code, base: {}, v: 2 };
    }
    this.save();
    this.setStatus('online');
    await this.flush();
    this.open();
    return 'ok';
  }

  disconnect(): void {
    this.close();
    this.info = null;
    this.save();
    this.setStatus('off');
  }

  /** La app avisa de que los datos de este móvil han cambiado. */
  localChanged(): void {
    if (!this.info) return;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => void this.flush(), 400);
  }

  private flush(): Promise<void> {
    this.busy = this.busy.then(async () => {
      const info = this.info;
      if (!info) return;
      const cur = flatten(this.host.getData());
      const patch = diffFlat(info.base, cur);
      if (Object.keys(patch).length === 0) return;
      try {
        if (info.v !== 2) return; // primero el paso a cifrado (lo hace pull)
        const res = await fetch(this.url(), { method: 'PATCH', body: JSON.stringify(await this.sealed(info.code, patch)) });
        if (res.status === 401 || res.status === 403) {
          this.setStatus('denied');
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        if (this.info === info) {
          info.base = applyPatch(info.base, patch);
          this.lastSync = Date.now();
          this.save();
          this.setStatus('online');
        }
      } catch {
        this.setStatus('offline');
        this.scheduleRetry();
      }
    });
    return this.busy;
  }

  /** Trae lo del servidor y lo junta con los cambios pendientes de este móvil. */
  private pull(): Promise<void> {
    this.busy = this.busy.then(async () => {
      const info = this.info;
      if (!info) return;
      try {
        if (info.v !== 2) {
          await this.migrate(info);
          this.setStatus('online');
          this.lastSync = Date.now();
          return;
        }
        const remote = await this.fetchRemote(info.code);
        if (this.info !== info) return;
        void this.cleanOld(info.code);
        const cur = flatten(this.host.getData());
        const merged = mergeFlat(info.base, remote, cur);
        if (Object.keys(diffFlat(cur, merged)).length > 0) {
          this.host.replaceData(unflatten(merged, this.host.fallbackYear(), this.host.accountName()));
        }
        info.base = remote;
        this.lastSync = Date.now();
        this.save();
        this.setStatus('online');
        if (Object.keys(diffFlat(remote, merged)).length > 0) this.localChanged();
      } catch (e) {
        if (e instanceof DeniedError) {
          this.setStatus('denied');
          return;
        }
        this.setStatus('offline');
        this.scheduleRetry();
      }
    });
    return this.busy;
  }

  private scheduleRetry(): void {
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (!this.info) return;
      void this.pull().then(() => this.flush());
    }, 15_000);
  }

  private open(): void {
    this.close();
    if (!this.info || typeof EventSource === 'undefined') return;
    const es = new EventSource(this.url());
    this.es = es;
    const changed = () => {
      if (this.pullTimer) clearTimeout(this.pullTimer);
      this.pullTimer = setTimeout(() => void this.pull(), 300);
    };
    es.addEventListener('put', changed);
    es.addEventListener('patch', changed);
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        this.setStatus(navigator.onLine === false ? 'offline' : 'connecting');
        this.scheduleRetry();
      }
    };
  }

  private close(): void {
    this.es?.close();
    this.es = null;
    for (const t of [this.flushTimer, this.pullTimer, this.retryTimer]) if (t) clearTimeout(t);
    this.flushTimer = this.pullTimer = this.retryTimer = null;
  }
}

class DeniedError extends Error {}

/** `Flat` → forma de Firebase (`{cfg, ov:{…}, rl:{…}, en:{…}}`). */
export function toRemote(flat: Flat): Record<string, unknown> {
  const out: Record<string, Record<string, string | number> | string> = {};
  for (const [path, v] of Object.entries(flat)) {
    if (path === 'cfg') {
      out['cfg'] = String(v);
      continue;
    }
    const slash = path.indexOf('/');
    const group = path.slice(0, slash);
    const bucket = (out[group] ??= {}) as Record<string, string | number>;
    bucket[path.slice(slash + 1)] = v;
  }
  return out;
}
