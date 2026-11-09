import { describe, expect, it } from 'vitest';
import { ar } from '../src/i18n/ar';
import { de } from '../src/i18n/de';
import { en } from '../src/i18n/en';
import { es } from '../src/i18n/es';
import { fr } from '../src/i18n/fr';
import { pl } from '../src/i18n/pl';
import { ro } from '../src/i18n/ro';
import { detectLang, fmtMoney, fmtNumber, LANGS, setLocale } from '../src/i18n';
import { parseAmount } from '../src/calc';

const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('traducciones', () => {
  const all = { ar, de, en, fr, pl, ro };

  it('cada idioma tiene todos los textos, sin vacíos, y con los mismos {huecos}', () => {
    for (const [lang, msgs] of Object.entries(all)) {
      for (const [key, text] of Object.entries(es)) {
        const tr = (msgs as Record<string, string>)[key];
        expect(tr, `${lang} ${key}`).toBeTruthy();
        expect(vars(tr!), `${lang} ${key}`).toEqual(vars(text));
      }
      expect(Object.keys(msgs).sort(), lang).toEqual(Object.keys(es).sort());
    }
  });

  it('elige el idioma del teléfono, o inglés si no lo tiene', () => {
    expect(detectLang(['de-AT', 'en'])).toBe('de');
    expect(detectLang(['pt-BR', 'ro-RO'])).toBe('ro');
    expect(detectLang(['ar-MA'])).toBe('ar');
    expect(detectLang(['ja-JP'])).toBe('en');
    expect(detectLang([])).toBe('en');
    expect(LANGS).toEqual(['es', 'de', 'en', 'pl', 'ro', 'fr', 'ar']);
  });

  it('en todos los idiomas, un importe escrito se lee bien', () => {
    for (const lang of LANGS) {
      setLocale(lang);
      expect(parseAmount(fmtNumber(-1234.5)), lang).toBe(-1234.5);
      expect(parseAmount(fmtMoney(1234.5)), lang).toBe(1234.5);
      expect(fmtMoney(5), lang).toContain('€');
    }
    setLocale('es');
    expect(fmtMoney(-1234.5)).toBe('−1.234,50\u00a0€');
  });
});
