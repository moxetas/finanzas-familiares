/**
 * Estructura de la app: cabecera, vista actual y barra de pestañas.
 * Navegación con el hash (#/resumen, #/meses/2027-03, #/avisos, #/ajustes),
 * que funciona igual en GitHub Pages dentro de un subdirectorio.
 */

import { t, type MessageKey } from '../i18n';
import { createCtx, type Ctx } from './context';
import { clear, h } from './dom';
import { icon, type IconName } from './icons';
import { listenInstall } from './install';
import { exampleBanner } from './notices';
import type { Store } from './store';
import { mountToasts, toast } from './toast';
import { alertsView } from './views/alerts';
import { monthsView } from './views/months';
import { settingsView } from './views/settings';
import { summaryView } from './views/summary';

interface Route {
  name: 'resumen' | 'meses' | 'avisos' | 'ajustes';
  param?: string;
}

const TABS: { name: Route['name']; label: MessageKey; icon: IconName }[] = [
  { name: 'resumen', label: 'nav.summary', icon: 'summary' },
  { name: 'meses', label: 'nav.months', icon: 'months' },
  { name: 'avisos', label: 'nav.alerts', icon: 'alerts' },
  { name: 'ajustes', label: 'nav.settings', icon: 'settings' },
];

function parseRoute(hash: string): Route {
  const [name, param] = hash.replace(/^#\/?/, '').split('/');
  if (name === 'meses' || name === 'avisos' || name === 'ajustes' || name === 'resumen') return { name, param: param || undefined };
  return { name: 'resumen' };
}

export function mountApp(root: HTMLElement, store: Store): void {
  const ctx: Ctx = createCtx(store, (hash) => {
    if (location.hash === hash) render({ force: true });
    else location.hash = hash;
  });

  const banner = h('div', { class: 'banner-slot' });
  const main = h('main', { id: 'main', class: 'main', tabindex: '-1' });
  const tabLinks = new Map<Route['name'], HTMLAnchorElement>();
  const tabs = h(
    'nav',
    { class: 'tabbar', 'aria-label': t('nav.main') },
    h(
      'ul',
      null,
      TABS.map((tab) => {
        const a = h('a', { href: `#/${tab.name}`, class: 'tab' }, icon(tab.icon, 22), h('span', null, t(tab.label)));
        tabLinks.set(tab.name, a);
        return h('li', null, a);
      }),
    ),
  );
  const toasts = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
  mountToasts(toasts);

  const header = h(
    'header',
    { class: 'topbar' },
    h('a', { href: '#/resumen', class: 'brand' }, h('img', { class: 'brand-logo', src: 'icons/icon-192.png', alt: '', width: 32, height: 32 }), t('app.name')),
    h('span', { class: 'topbar-year', id: 'topbar-year' }),
  );

  clear(root);
  root.append(h('a', { href: '#main', class: 'skip-link' }, t('nav.main')), header, banner, main, tabs, toasts);

  let lastRoute = '';

  /**
   * Dibuja la vista actual. Si la ruta no ha cambiado (por ejemplo, tras
   * guardar un dato), conserva el desplazamiento de la página y de las tablas.
   */
  function render(opts: { force?: boolean; initial?: boolean } = {}): void {
    const route = parseRoute(location.hash);
    const key = `${route.name}/${route.param ?? ''}`;
    const changed = opts.force === true || opts.initial === true || key !== lastRoute;
    lastRoute = key;

    // Recordar el desplazamiento horizontal de las tablas al redibujar.
    const scrolls = new Map<string, number>();
    main.querySelectorAll<HTMLElement>('[data-scroll-key]').forEach((el) => scrolls.set(el.dataset['scrollKey']!, el.scrollLeft));
    const y = window.scrollY;
    const active = document.activeElement;
    const focusKey = active instanceof HTMLElement && main.contains(active) ? active.closest<HTMLElement>('[data-focus-key]')?.dataset['focusKey'] : undefined;

    const view =
      route.name === 'meses'
        ? monthsView(ctx, route.param)
        : route.name === 'avisos'
          ? alertsView(ctx)
          : route.name === 'ajustes'
            ? settingsView(ctx, changed ? route.param : undefined)
            : summaryView(ctx);

    clear(banner);
    const b = exampleBanner(ctx);
    if (b) banner.append(b);
    clear(main);
    main.append(view);
    document.getElementById('topbar-year')!.textContent = String(store.state.data.config.year);

    for (const [name, a] of tabLinks) {
      if (name === route.name) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    document.title = `${t(TABS.find((x) => x.name === route.name)!.label)} · ${t('app.name')}`;

    if (changed) {
      if (!(route.name === 'ajustes' && route.param)) window.scrollTo(0, 0);
      // Al cambiar de pantalla, el foco va al título (lo anuncian los lectores de pantalla).
      if (!opts.initial) view.querySelector<HTMLElement>('.page-title')?.focus({ preventScroll: true });
    } else {
      main.querySelectorAll<HTMLElement>('[data-scroll-key]').forEach((el) => {
        const left = scrolls.get(el.dataset['scrollKey']!);
        if (left) el.scrollLeft = left;
      });
      window.scrollTo(0, y);
      // Mantiene el foco en el mismo control tras redibujar (teclado y lectores de pantalla).
      if (focusKey) main.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
    }
  }

  window.addEventListener('hashchange', () => render());
  store.subscribe(() => render());
  store.onError(() => toast(t('toast.saveError'), { duration: 8000 }));
  listenInstall(() => render());
  render({ initial: true });
}
