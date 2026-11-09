/**
 * Idioma elegido en este aparato. Se guarda aparte de los datos (no se
 * sincroniza: cada persona de la familia puede tener el suyo) y se lee antes
 * de abrir los datos, para que el ejemplo de la primera vez salga ya traducido.
 */

import { isLang, type Lang } from '../i18n';

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
