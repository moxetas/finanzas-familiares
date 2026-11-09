/**
 * Idioma elegido en este aparato. Se guarda aparte de los datos (no se
 * sincroniza: cada persona de la familia puede tener el suyo) y se lee antes
 * de abrir los datos, para que el ejemplo de la primera vez salga ya traducido.
 */

import { isLang, t, type Lang } from '../i18n';

const KEY = 'finanzas-familiares:lang';

export function savedLang(): Lang | null {
  try {
    const v = localStorage.getItem(KEY);
    return isLang(v) ? v : null;
  } catch {
    return null;
  }
}

export function saveLang(lang: Lang): boolean {
  try {
    localStorage.setItem(KEY, lang);
    return true;
  } catch {
    return false;
  }
}

/**
 * Nombre de la app en el idioma elegido, para cuando se añade a la pantalla de
 * inicio: el manifiesto (Android) y el título de iPhone. El español usa el
 * manifiesto de siempre; los demás, `manifest-<idioma>.webmanifest`.
 * Una app ya instalada conserva el nombre con el que se instaló.
 */
export function applyDocumentLang(lang: Lang): void {
  document.querySelector('link[rel="manifest"]')?.setAttribute('href', lang === 'es' ? './manifest.webmanifest' : `./manifest-${lang}.webmanifest`);
  document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', t('app.short'));
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('settings.share.text'));
}
