/**
 * Plugins de Vite propios:
 * - `serviceWorker`: al terminar la compilación, genera `sw.js` con la lista de
 *   archivos a guardar y una versión que cambia si cambia cualquier archivo.
 * - `contentSecurityPolicy`: añade una política que impide que la página
 *   cargue o envíe nada fuera de su propio sitio (ni analítica, ni CDN).
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin, ResolvedConfig } from 'vite';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

export function serviceWorker(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'finanzas-service-worker',
    apply: 'build',
    configResolved(c) {
      config = c;
    },
    closeBundle() {
      const outDir = join(config.root, config.build.outDir);
      const files = walk(outDir)
        .map((f) => relative(outDir, f).split(sep).join('/'))
        .filter((f) => f !== 'sw.js' && !f.endsWith('.map') && f !== '.nojekyll')
        // Los iconos grandes solo se usan al instalar; no hace falta guardarlos para usar sin conexión.
        .filter((f) => !/^icons\/icon-(512|maskable-512)\.png$/.test(f) && !f.endsWith('.pdf'))
        // Fondos: solo el de por defecto y las miniaturas; los demás se guardan al usarlos (ver sw-template.js).
        .filter((f) => !/^themes\/(?!azul\.jpg$)[a-z]+\.jpg$/.test(f))
        .sort();
      const hash = createHash('sha256');
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = hash.digest('hex').slice(0, 12);
      const precache = files.filter((f) => f !== 'index.html');
      precache.unshift('index.html');
      const template = readFileSync(fileURLToPath(new URL('./sw-template.js', import.meta.url)), 'utf8');
      const sw = template.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(precache, null, 2));
      writeFileSync(join(outDir, 'sw.js'), sw);
      config.logger.info(`sw.js: ${precache.length} archivos, versión ${version}`);
    },
  };
}

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https://menu-familiar-a2424-default-rtdb.europe-west1.firebasedatabase.app",
  "manifest-src 'self'",
  "worker-src 'self'",
  "base-uri 'self'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ');

export function contentSecurityPolicy(): Plugin {
  return {
    name: 'finanzas-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n    <meta http-equiv="Content-Security-Policy" content="${CSP}">`);
    },
  };
}
