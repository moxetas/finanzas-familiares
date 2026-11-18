import './styles/fonts.css';
import './styles/app.css';
import { currentLocale, detectLang, LANGS, langName, setLocale, t, type Lang } from './i18n';
import { applyDocumentLang, savedLang, saveLang } from './ui/lang';
import { h } from './ui/dom';
import { mountApp } from './ui/app';
import { Store } from './ui/store';
import { applyTheme } from './ui/theme';
import { registerServiceWorker } from './ui/sw-register';

/**
 * La primera vez se pregunta el idioma (el del teléfono sale el primero y
 * marcado). Se pregunta antes de abrir los datos para que el ejemplo y la guía
 * salgan ya en el idioma elegido.
 */
function askLang(root: HTMLElement): Promise<Lang> {
  const phone = detectLang();
  setLocale(phone);
  const order = [phone, ...LANGS.filter((l) => l !== phone)];
  return new Promise((resolve) => {
    root.replaceChildren(
      h(
        'div',
        { class: 'boot lang-pick' },
        h('h1', { class: 'lang-pick-title' }, t('lang.pick.title')),
        h(
          'div',
          { class: 'lang-pick-list', role: 'group', 'aria-label': t('lang.pick.title') },
          order.map((code) =>
            h(
              'button',
              { type: 'button', class: `btn ${code === phone ? 'btn-primary' : 'btn-secondary'}`, lang: code, onclick: () => resolve(code) },
              langName(code),
            ),
          ),
        ),
        h('p', { class: 'boot-hint' }, t('lang.pick.hint')),
      ),
    );
  });
}

async function start(): Promise<void> {
  // Idioma: el elegido en este aparato o, si no hay, se pregunta.
  const root = document.getElementById('app')!;
  let chosen = savedLang();
  if (!chosen) {
    chosen = await askLang(root);
    saveLang(chosen);
  }
  setLocale(chosen);
  try {
    const store = await Store.open();
    applyDocumentLang(currentLocale());
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
