/**
 * Guardado local. Los datos viven solo en este navegador (IndexedDB y, si no
 * está disponible, localStorage). Nada sale del aparato.
 */

import type { AppData } from '../calc/types';

export interface Meta {
  /** Fecha ISO de la última copia exportada. */
  lastBackup?: string;
  /** Fecha ISO del último guardado. */
  savedAt?: string;
  /** Aviso de instalación descartado. */
  installHintDismissed?: boolean;
  /** Tema elegido: automático (según el sistema), claro u oscuro. */
  theme?: 'auto' | 'light' | 'dark';
  /** Notificaciones con la app cerrada: activadas y comprobación diaria registrada. */
  notifyBackground?: boolean;
  /** Ya se ha visto la guía de primeros pasos. */
  guideSeen?: boolean;
  /** Mostrar siempre las pestañas Domiciliaciones y Sueldos. */
  extraTabs?: boolean;
}

/**
 * Avisos programados que lee el service worker para avisar con la app cerrada.
 * Los textos van ya traducidos y formateados: el service worker no calcula nada.
 */
export interface ReminderFile {
  v: 1;
  labels: { today: string; tomorrow: string; inDays: string; estimated: string };
  items: {
    key: string;
    from: string;
    until: string;
    date: string;
    concept: string;
    amountText: string;
    dateText: string;
    estimated: boolean;
  }[];
}

export interface Stored {
  data: unknown;
  meta: Meta;
}

export type StorageKind = 'indexeddb' | 'localstorage' | 'memory';

export interface LocalStore {
  readonly kind: StorageKind;
  load(): Promise<Stored | null>;
  save(data: AppData, meta: Meta): Promise<void>;
  clear(): Promise<void>;
  /** Avisos ya mostrados en este aparato (no se sincronizan con otros móviles). */
  loadShown(): Promise<string[]>;
  /** Añade avisos mostrados; `prune` quita los que ya no hacen falta. */
  addShown(keys: string[], prune: (all: string[]) => string[]): Promise<void>;
  /** Guarda los avisos programados para el service worker (solo con IndexedDB). */
  saveReminders(file: ReminderFile): Promise<void>;
}

const DB_NAME = 'finanzas-familiares';
const STORE = 'kv';
const LS_KEY = 'finanzas-familiares:v1';

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/** IndexedDB no ha respondido a tiempo (no es que no exista). */
export class StorageTimeoutError extends Error {
  constructor() {
    super('IndexedDB no responde');
    this.name = 'StorageTimeoutError';
  }
}

/**
 * Safari en iPhone a veces deja colgada la primera apertura de IndexedDB tras
 * abrir la app. Preguntar por `indexedDB.databases()` hasta que responda la
 * «despierta» (es el arreglo habitual para este fallo de WebKit).
 */
function wakeIndexedDB(): Promise<void> {
  const idb = indexedDB as IDBFactory & { databases?: () => Promise<unknown> };
  if (typeof idb.databases !== 'function') return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearInterval(timer);
      clearTimeout(limit);
      resolve();
    };
    const poke = () => {
      idb.databases!().then(finish, finish);
    };
    const timer = setInterval(poke, 100);
    const limit = setTimeout(finish, 2000);
    poke();
  });
}

async function openDB(attempt = 1): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') throw new Error('IndexedDB no disponible');
  await wakeIndexedDB();
  try {
    return await openOnce();
  } catch (e) {
    // Si se ha quedado colgada, se intenta otra vez antes de rendirse.
    if (e instanceof StorageTimeoutError && attempt < 2) return openDB(attempt + 1);
    throw e;
  }
}

function openOnce(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new StorageTimeoutError()), 3000);
    const open = indexedDB.open(DB_NAME, 1);
    open.onsuccess = () => {
      clearTimeout(timer);
      resolve(open.result);
    };
    open.onerror = () => {
      clearTimeout(timer);
      reject(open.error);
    };
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(STORE)) open.result.createObjectStore(STORE);
    };
    open.onblocked = () => {
      clearTimeout(timer);
      reject(new Error('IndexedDB bloqueada'));
    };
  });
}

class IDBStore implements LocalStore {
  readonly kind = 'indexeddb' as const;
  constructor(private db: IDBDatabase) {}

  async load(): Promise<Stored | null> {
    const tx = this.db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const [data, meta] = await Promise.all([req(store.get('data')), req(store.get('meta'))]);
    if (data === undefined) return null;
    return { data, meta: (meta as Meta | undefined) ?? {} };
  }

  save(data: AppData, meta: Meta): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      store.put(data, 'data');
      store.put(meta, 'meta');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  clear(): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async loadShown(): Promise<string[]> {
    const tx = this.db.transaction(STORE, 'readonly');
    const value = await req(tx.objectStore(STORE).get('shown'));
    return Array.isArray(value) ? value.filter((k): k is string => typeof k === 'string') : [];
  }

  addShown(keys: string[], prune: (all: string[]) => string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      // Leer y escribir en la misma transacción: el service worker también lo usa.
      const tx = this.db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const get = store.get('shown');
      get.onsuccess = () => {
        const prev = Array.isArray(get.result) ? (get.result as unknown[]).filter((k): k is string => typeof k === 'string') : [];
        store.put(prune([...prev, ...keys]), 'shown');
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  saveReminders(file: ReminderFile): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(file, 'reminders');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

class LSStore implements LocalStore {
  readonly kind = 'localstorage' as const;

  async load(): Promise<Stored | null> {
    const text = localStorage.getItem(LS_KEY);
    if (!text) return null;
    try {
      const parsed = JSON.parse(text) as { data?: unknown; meta?: Meta };
      return parsed.data === undefined ? null : { data: parsed.data, meta: parsed.meta ?? {} };
    } catch {
      return null;
    }
  }

  async save(data: AppData, meta: Meta): Promise<void> {
    localStorage.setItem(LS_KEY, JSON.stringify({ data, meta }));
  }

  async clear(): Promise<void> {
    localStorage.removeItem(LS_KEY);
  }

  async loadShown(): Promise<string[]> {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(`${LS_KEY}:shown`) ?? '[]');
      return Array.isArray(value) ? value.filter((k): k is string => typeof k === 'string') : [];
    } catch {
      return [];
    }
  }

  async addShown(keys: string[], prune: (all: string[]) => string[]): Promise<void> {
    localStorage.setItem(`${LS_KEY}:shown`, JSON.stringify(prune([...(await this.loadShown()), ...keys])));
  }

  /** El service worker no puede leer localStorage: aquí no hay avisos con la app cerrada. */
  async saveReminders(): Promise<void> {}
}

/** Espera una promesa como mucho `ms`; si no llega, `StorageTimeoutError`. */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new StorageTimeoutError()), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** Almacenamiento en memoria (cuando el del móvil no responde). */
export function memoryStore(): LocalStore {
  return new MemoryStore();
}

/** Último recurso: funciona, pero se pierde al cerrar la app. */
class MemoryStore implements LocalStore {
  readonly kind = 'memory' as const;
  private value: Stored | null = null;
  async load(): Promise<Stored | null> {
    return this.value;
  }
  async save(data: AppData, meta: Meta): Promise<void> {
    this.value = { data: structuredClone(data), meta: { ...meta } };
  }
  async clear(): Promise<void> {
    this.value = null;
  }
  private shown: string[] = [];
  async loadShown(): Promise<string[]> {
    return this.shown;
  }
  async addShown(keys: string[], prune: (all: string[]) => string[]): Promise<void> {
    this.shown = prune([...this.shown, ...keys]);
  }
  async saveReminders(): Promise<void> {}
}

function localStorageWorks(): boolean {
  try {
    const k = `${LS_KEY}:test`;
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

/** Abre el mejor almacenamiento disponible en este navegador. */
export async function openLocalStore(): Promise<LocalStore> {
  try {
    const db = await openDB();
    const store = new IDBStore(db);
    // Si hay datos de una versión que usaba localStorage, se pasan a IndexedDB.
    if (localStorageWorks() && localStorage.getItem(LS_KEY)) {
      const old = await new LSStore().load();
      const current = await store.load();
      if (old && !current) await store.save(old.data as AppData, old.meta);
      localStorage.removeItem(LS_KEY);
    }
    return store;
  } catch (e) {
    // Si IndexedDB existe pero no responde, NO se cambia a otro almacenamiento:
    // se vería la app vacía (y podría sincronizarse así). Mejor pedir reabrir.
    if (e instanceof StorageTimeoutError) throw e;
    if (localStorageWorks()) return new LSStore();
    return new MemoryStore();
  }
}

/**
 * Pide al navegador que no borre los datos por falta de espacio.
 * Devuelve si quedan protegidos (no todos los navegadores lo conceden).
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
