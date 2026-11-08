/**
 * Estado de la app en memoria + guardado automático en el aparato.
 * Cada cambio se guarda al momento. Si la app está abierta en dos pestañas,
 * la otra se entera y recarga los datos.
 */

import type { AppData } from '../calc/types';
import { memoryStore, openLocalStore, requestPersistence, StorageTimeoutError, withTimeout, type LocalStore, type Meta, type StorageKind, type Stored } from '../storage/local';
import { blankData } from '../calc/mutations';
import { sanitizeData } from '../storage/sanitize';
import { exampleData } from '../storage/example';
import { todayISO } from '../calc/keys';
import { t } from '../i18n';
import { Sync } from '../storage/sync';
import { pruneShown } from '../calc/reminders';
import { buildReminderFile } from './reminder-file';

export interface State {
  data: AppData;
  meta: Meta;
  storage: StorageKind;
  persisted: boolean;
}

type Listener = (state: State) => void;
type ErrorListener = (error: unknown) => void;

const CHANNEL = 'finanzas-familiares';

export class Store {
  private listeners = new Set<Listener>();
  private errorListeners = new Set<ErrorListener>();
  private queue: Promise<void> = Promise.resolve();
  private channel: BroadcastChannel | null = null;
  private askedPersistence = false;
  readonly sync: Sync;
  /** El almacenamiento del móvil no responde: datos de la nube, solo en memoria. */
  cloudOnly = false;

  private constructor(
    private local: LocalStore,
    public state: State,
  ) {
    this.sync = new Sync({
      getData: () => this.state.data,
      replaceData: (d) => this.replaceData(d),
      fallbackYear: () => new Date().getFullYear(),
      accountName: () => t('account.defaultName'),
    });
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(CHANNEL);
      this.channel.onmessage = () => void this.reload();
    }
  }

  /** Abre el almacenamiento y carga los datos; la primera vez, el ejemplo. */
  static async open(): Promise<Store> {
    let local: LocalStore;
    let stored: Stored | null;
    // Si el almacenamiento del móvil no responde (pasa a veces en iPhone) y hay
    // sincronización, la app arranca con los datos de la nube en memoria.
    let cloudOnly = false;
    try {
      local = await openLocalStore();
      stored = await withTimeout(local.load(), 6000).catch((e: unknown) => {
        if (e instanceof StorageTimeoutError) throw e;
        return null;
      });
    } catch (e) {
      if (!(e instanceof StorageTimeoutError) || !Sync.savedCode()) throw e;
      local = memoryStore();
      stored = null;
      cloudOnly = true;
    }
    const year = new Date().getFullYear();
    let data: AppData;
    let meta: Meta = {};
    if (stored) {
      data = sanitizeData(stored.data, year, t('account.defaultName'));
      meta = stored.meta;
    } else if (cloudOnly) {
      data = blankData(year, t('account.defaultName'));
    } else {
      data = exampleData(year, todayISO());
    }
    const store = new Store(local, { data, meta, storage: local.kind, persisted: false });
    if (cloudOnly) {
      store.cloudOnly = true;
      store.sync.memoryMode();
      store.sync.preferCloud();
    } else if (!stored) await store.persist();
    else store.saveReminders();
    store.askPersistence();
    store.sync.start();
    return store;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onError(fn: ErrorListener): void {
    this.errorListeners.add(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.state);
  }

  /** Cambia los datos, los guarda y avisa a la interfaz. */
  setData(data: AppData): void {
    this.state = { ...this.state, data };
    this.emit();
    void this.persist();
    this.askPersistence();
    this.sync.localChanged();
  }

  /** Datos que llegan de la sincronización: se guardan y se muestran, sin reenviarlos. */
  private replaceData(data: AppData): void {
    this.state = { ...this.state, data };
    this.emit();
    void this.persist();
  }

  /**
   * Pide al navegador que no borre los datos por falta de espacio, pero solo
   * cuando ya son datos propios (no el ejemplo) y una vez por sesión.
   */
  private askPersistence(): void {
    if (this.askedPersistence || this.state.data.config.example) return;
    this.askedPersistence = true;
    void requestPersistence().then((persisted) => {
      if (persisted === this.state.persisted) return;
      this.state = { ...this.state, persisted };
      this.emit();
    });
  }

  setMeta(patch: Partial<Meta>): void {
    this.state = { ...this.state, meta: { ...this.state.meta, ...patch } };
    this.emit();
    void this.persist();
  }

  /** Avisos ya mostrados en este aparato. */
  loadShown(): Promise<string[]> {
    return this.local.loadShown().catch(() => []);
  }

  markShown(keys: string[]): Promise<void> {
    return this.local.addShown(keys, (all) => pruneShown(all, todayISO())).catch(() => undefined);
  }

  /** Deja preparados los avisos para que el service worker avise con la app cerrada. */
  private saveReminders(): void {
    void this.local.saveReminders(buildReminderFile(this.state.data)).catch(() => undefined);
  }

  private persist(): Promise<void> {
    const { data, meta } = this.state;
    const savedAt = new Date().toISOString();
    this.queue = this.queue
      .then(() => this.local.save(data, { ...meta, savedAt }))
      .then(() => this.saveReminders())
      .then(() => this.channel?.postMessage('saved'))
      .catch((error: unknown) => {
        for (const fn of this.errorListeners) fn(error);
      });
    return this.queue;
  }

  /** Vuelve a leer lo guardado (cuando otra pestaña ha cambiado algo). */
  private async reload(): Promise<void> {
    const stored = await this.local.load().catch(() => null);
    if (!stored) return;
    const data = sanitizeData(stored.data, new Date().getFullYear(), t('account.defaultName'));
    this.state = { ...this.state, data, meta: stored.meta };
    this.emit();
  }
}
