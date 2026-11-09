import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BACKDROPS, backdropFor, backdropUrl, DEFAULT_BACKDROP, isBackdropChoice } from '../src/ui/backdrop';

describe('fondo de cabecera', () => {
  it('sin elegir nada, el de por defecto; con «none», ninguno', () => {
    expect(backdropFor(undefined, 'meses')?.id).toBe(DEFAULT_BACKDROP);
    expect(backdropFor('rarito', 'meses')?.id).toBe(DEFAULT_BACKDROP);
    expect(backdropFor('none', 'meses')).toBeNull();
    expect(backdropFor('atardecer', 'avisos')?.id).toBe('atardecer');
  });

  it('«uno en cada pestaña» cambia según la pestaña', () => {
    expect(backdropFor('tabs', 'resumen')?.id).toBe('atardecer');
    expect(backdropFor('tabs', 'avisos')?.id).toBe('calma');
    expect(backdropFor('tabs', 'otra')?.id).toBe(DEFAULT_BACKDROP);
  });

  it('cada fondo tiene su imagen y su miniatura', () => {
    for (const b of BACKDROPS) {
      expect(isBackdropChoice(b.id)).toBe(true);
      expect(existsSync(`public/${backdropUrl(b.id)}`), b.id).toBe(true);
      expect(existsSync(`public/${backdropUrl(b.id, true)}`), b.id).toBe(true);
    }
  });
});
