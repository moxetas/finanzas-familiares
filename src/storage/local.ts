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

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB no disponible'));
      return;
    }
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(STORE)) open.result.createObjectStore(STORE);
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error('IndexedDB bloqueada'));
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
  } catch {
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
