import type { AppData } from '../calc/types';
import { t } from '../i18n';
import type { Store } from './store';
import { toast } from './toast';

/** Lo que necesitan las vistas: leer datos, cambiarlos y navegar. */
export interface Ctx {
  store: Store;
  readonly data: AppData;
  /** Guarda un cambio. Con `undo`, muestra un aviso con «Deshacer». */
  commit(next: AppData, undo?: string): void;
  go(hash: string): void;
}

export function createCtx(store: Store, go: (hash: string) => void): Ctx {
  return {
    store,
    get data() {
      return store.state.data;
    },
    commit(next, undo) {
      const prev = store.state.data;
      store.setData(next);
      if (undo) toast(undo, { action: { label: t('action.undo'), onClick: () => store.setData(prev) } });
    },
    go,
  };
}
