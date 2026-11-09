/**
 * Fondo de cabecera: una foto detrás del título de cada pestaña, que se funde
 * con el color de la página. Las tarjetas y las tablas van encima, sobre su
 * fondo de siempre, así se leen igual de bien.
 *
 * Se elige en Ajustes → Fondo (cada móvil el suyo): sin fondo, uno para todas
 * las pestañas o «uno distinto en cada pestaña». Las imágenes no llevan texto,
 * para que valgan en todos los idiomas. Están en public/themes.
 */

import type { MessageKey } from '../i18n';

export interface Backdrop {
  id: string;
  label: MessageKey;
  /** Qué parte de la foto se ve cuando hay que recortarla (CSS background-position). */
  position: string;
}

export const BACKDROPS: Backdrop[] = [
  { id: 'azul', label: 'backdrop.azul', position: '68% 62%' },
  { id: 'atardecer', label: 'backdrop.atardecer', position: '66% 45%' },
  { id: 'monedas', label: 'backdrop.monedas', position: '50% 66%' },
  { id: 'calma', label: 'backdrop.calma', position: '50% 50%' },
  { id: 'hogar', label: 'backdrop.hogar', position: '50% 80%' },
  { id: 'brote', label: 'backdrop.brote', position: '45% 50%' },
  { id: 'europa', label: 'backdrop.europa', position: '50% 40%' },
];

/** Sin elegir nada, este. */
export const DEFAULT_BACKDROP = 'azul';
/** Opciones que no son una foto. */
export const NO_BACKDROP = 'none';
export const PER_TAB = 'tabs';

/** Con «uno distinto en cada pestaña». */
const BY_TAB: Record<string, string> = {
  resumen: 'atardecer',
  meses: 'azul',
  avisos: 'calma',
  ajustes: 'hogar',
  dom: 'europa',
  sueldos: 'brote',
  guia: 'monedas',
};

export const isBackdropChoice = (v: unknown): v is string =>
  typeof v === 'string' && (v === NO_BACKDROP || v === PER_TAB || BACKDROPS.some((b) => b.id === v));

/** La foto que toca en una pestaña, o `null` sin fondo. */
export function backdropFor(choice: string | undefined, tab: string): Backdrop | null {
  const c = isBackdropChoice(choice) ? choice : DEFAULT_BACKDROP;
  if (c === NO_BACKDROP) return null;
  const id = c === PER_TAB ? (BY_TAB[tab] ?? DEFAULT_BACKDROP) : c;
  return BACKDROPS.find((b) => b.id === id) ?? null;
}

export const backdropUrl = (id: string, mini = false) => `themes/${id}${mini ? '-mini' : ''}.jpg`;

/**
 * Pone la foto en `hero` (o la quita) y ajusta su alto para que llegue un poco
 * más abajo del título de la pestaña, haya o no avisos encima.
 */
export function paintBackdrop(hero: HTMLElement, root: HTMLElement, main: HTMLElement, b: Backdrop | null): void {
  root.classList.toggle('has-hero', b !== null);
  hero.hidden = b === null;
  if (!b) return;
  const url = backdropUrl(b.id);
  if (hero.dataset['src'] !== url) {
    hero.style.backgroundImage = `url("${url}")`;
    hero.dataset['src'] = url;
  }
  hero.style.backgroundPosition = b.position;
  const head = main.querySelector('.page-head');
  const top = (root.querySelector('.topbar') as HTMLElement | null)?.offsetHeight ?? 0;
  const bottom = head ? head.getBoundingClientRect().bottom + window.scrollY : top + 160;
  hero.style.top = `${top}px`;
  hero.style.height = `${Math.max(260, Math.round(bottom - top + 140))}px`;
}
