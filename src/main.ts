import './styles/fonts.css';
import './styles/app.css';
import { setLocale, t } from './i18n';
import { mountApp } from './ui/app';
import { Store } from './ui/store';
import { applyTheme } from './ui/theme';
import { registerServiceWorker } from './ui/sw-register';

async function start(): Promise<void> {
  setLocale('es');
  const root = document.getElementById('app')!;
  try {
    const store = await Store.open();
    applyTheme(store.state.meta.theme ?? 'auto');
    mountApp(root, store);
  } catch (error) {
    root.textContent = t('error.fatal');
    console.error(error);
  }
  if (import.meta.env.PROD) registerServiceWorker();
}

void start();
