/** Tema claro u oscuro. «auto» sigue al sistema (prefers-color-scheme). */

export type Theme = 'auto' | 'light' | 'dark';

const COLORS = { light: '#f3f6f5', dark: '#0e1413' } as const;

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  // Color de la barra del sistema en el móvil.
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  metas.forEach((m) => {
    const scheme = m.media.includes('dark') ? 'dark' : 'light';
    m.content = theme === 'auto' ? COLORS[scheme] : COLORS[theme];
  });
}
