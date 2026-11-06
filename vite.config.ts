import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import { contentSecurityPolicy, serviceWorker } from './build/plugins';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  // Rutas relativas: funciona en https://usuario.github.io/repositorio/carpeta/
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: 'es2020',
    // Las fuentes se quedan como archivos (no incrustadas) para que el navegador las guarde.
    assetsInlineLimit: 0,
    sourcemap: false,
  },
  plugins: [serviceWorker(), contentSecurityPolicy()],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
