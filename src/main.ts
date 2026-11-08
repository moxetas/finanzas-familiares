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
    const rescue = (window as Window & { __rescate?: { repair(): void; copy(): void; errors: string[] } }).__rescate;
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    rescue?.errors.push(`arranque: ${detail}`);
    root.replaceChildren(
      h(
        'div',
        { class: 'boot' },
        h('p', null, t('error.fatal')),
        h('p', { class: 'boot-hint' }, t('error.fatal.hint')),
        h('pre', { class: 'rescue-diag' }, detail),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => location.reload() }, t('error.reload')),
        rescue ? h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => rescue.repair() }, t('error.repair')) : null,
        rescue ? h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => rescue.copy() }, t('error.copy')) : null,
      ),
    );
  }
  if (import.meta.env.PROD) registerServiceWorker();
}

void start();
