import './styles/fonts.css';
import './styles/app.css';
import { setLocale, t } from './i18n';
import { h } from './ui/dom';
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
    console.error(error);
    root.replaceChildren(
      h(
        'div',
        { class: 'boot' },
        h('p', null, t('error.fatal')),
        h('p', { class: 'boot-hint' }, t('error.fatal.hint')),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => location.reload() }, t('error.reload')),
      ),
    );
  }
  if (import.meta.env.PROD) registerServiceWorker();
}

void start();
