/**
 * Crea la guía en PDF en cada idioma, con capturas de la app en ese idioma.
 *
 *   npm run dev                      (en otra terminal: la app en http://localhost:5173/)
 *   npm run guide                    (todas)  ·  npm run guide -- de ar   (solo esas)
 *   npm run guide -- --url=http://localhost:5199/
 *
 * Usa Playwright con Chromium (no es dependencia de la app: `npx playwright
 * install chromium` si no lo tienes). Escribe public/guia.pdf (español) y
 * public/guia-<idioma>.pdf. Los textos están en ./texts.mjs; los nombres de
 * botones y pantallas salen de src/i18n, así coinciden siempre con la app.
 * Hace falta Node 22 o posterior (lee los .ts de src/i18n directamente).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { GUIDE } from './texts.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const APP_URL = 'https://moxetas.github.io/finanzas-familiares/';
const TAGS = { es: 'es-ES', de: 'de-DE', en: 'en-GB', pl: 'pl-PL', ro: 'ro-RO', fr: 'fr-FR', ar: 'ar' };

const args = process.argv.slice(2);
const url = (args.find((a) => a.startsWith('--url='))?.slice(6) ?? 'http://localhost:5173/').replace(/\/?$/, '/');
const only = args.filter((a) => !a.startsWith('--'));
const langs = Object.keys(TAGS).filter((l) => only.length === 0 || only.includes(l));

const dataUri = (path, type) => `data:${type};base64,${readFileSync(root + path).toString('base64')}`;
const font = (family, weight, file) =>
  `@font-face { font-family: '${family}'; font-weight: ${weight}; src: url(${dataUri(`src/fonts/${file}`, 'font/woff2')}) format('woff2'); }`;

const FONTS = [
  font('Plex', 400, 'ibm-plex-sans-latin-400-normal.woff2'),
  font('Plex', 400, 'ibm-plex-sans-latin-ext-400-normal.woff2'),
  font('Plex', 600, 'ibm-plex-sans-latin-600-normal.woff2'),
  font('Plex', 600, 'ibm-plex-sans-latin-ext-600-normal.woff2'),
  font('Plex Mono', 400, 'ibm-plex-mono-latin-400-normal.woff2'),
  font('Bricolage', 700, 'bricolage-grotesque-latin-700-normal.woff2'),
  font('Bricolage', 700, 'bricolage-grotesque-latin-ext-700-normal.woff2'),
  font('Plex Arabic', 400, 'ibm-plex-sans-arabic-arabic-400-normal.woff2'),
  font('Plex Arabic', 600, 'ibm-plex-sans-arabic-arabic-600-normal.woff2'),
  font('Plex Arabic', 700, 'ibm-plex-sans-arabic-arabic-700-normal.woff2'),
].join('\n');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Texto de la guía → HTML: `{{clave}}` de la app, **negrita**, *cursiva*, {url}. */
function rich(text, msgs) {
  const filled = text.replace(/\{\{([\w.-]+)\}\}/g, (_, k) => {
    if (!(k in msgs)) throw new Error(`Falta el texto de la app «${k}»`);
    return msgs[k];
  });
  return esc(filled)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace('{url}', `<code dir="ltr">${APP_URL.replace(/^https:\/\//, '')}</code>`);
}

const list = (items, msgs, tag = 'ul') => `<${tag}>${items.map((i) => `<li>${rich(i, msgs)}</li>`).join('')}</${tag}>`;
const shot = (b64) => `<img class="shot" src="data:image/png;base64,${b64}" alt="">`;

/** Capturas de la app en ese idioma, con el ejemplo (se crea en el idioma del teléfono). */
async function screenshots(browser, lang, msgs) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 700 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: TAGS[lang] });
  const page = await ctx.newPage();
  const go = async (hash) => {
    await page.goto(url + hash);
    await page.waitForTimeout(900);
  };
  const png = async () => (await page.screenshot()).toString('base64');
  const out = {};

  await go('#/ajustes');
  out.settings = await png();

  await page.getByRole('button', { name: msgs['import.button'] }).first().click();
  await page.waitForTimeout(500);
  out.import = await png();
  // Una respuesta de IA de ejemplo, para enseñar la pantalla de revisar.
  const year = new Date().getFullYear() + 1;
  const sample = { finanzas: [
    { tipo: 'pago', concepto: msgs['ex.homeInsurance'], importe: 190.5, fecha: `${year}-03-01`, estimado: false },
    { tipo: 'mensual', concepto: msgs['ex.gym'], importe: 29.9, fecha: `${year}-01-05`, estimado: false },
  ] };
  await page.locator('dialog textarea').fill(JSON.stringify(sample));
  await page.getByRole('button', { name: msgs['import.read'], exact: true }).click();
  await page.waitForTimeout(500);
  out.review = await png();
  await page.keyboard.press('Escape');

  await go('#/meses');
  await page.evaluate(() => {
    const plan = document.getElementById('plan');
    if (plan) window.scrollTo(0, plan.getBoundingClientRect().top + window.scrollY - 150);
  });
  await page.waitForTimeout(300);
  out.months = await png();

  await go('#/resumen');
  out.summary = await png();

  await ctx.close();
  return out;
}

function html(lang, g, msgs, s) {
  const rtl = lang === 'ar';
  const r = (t) => rich(t, msgs);
  return `<!doctype html>
<html lang="${lang}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><style>
${FONTS}
@page { size: A4; margin: 15mm 16mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: 'Plex', 'Plex Arabic', sans-serif; font-size: 10.5pt; line-height: 1.5; color: #10201d; }
header { display: flex; align-items: center; gap: 14px; padding-bottom: 12px; border-bottom: 2px solid #0d7a6e; margin-bottom: 14px; }
header img { width: 54px; height: 54px; border-radius: 12px; }
h1 { font-family: 'Bricolage', 'Plex Arabic', sans-serif; font-size: 24pt; line-height: 1.1; margin: 0; }
.sub { color: #5b6966; margin: 4px 0 0; }
h2 { font-family: 'Plex', 'Plex Arabic', sans-serif; font-weight: 600; color: #0a6157; font-size: 13.5pt; margin: 20px 0 8px; break-after: avoid; }
p { margin: 0 0 8px; }
ul, ol { margin: 0 0 8px; padding-inline-start: 20px; }
li { margin-bottom: 4px; }
strong { font-weight: 600; }
code { font-family: 'Plex Mono', monospace; background: #eef3f1; padding: 1px 5px; border-radius: 4px; font-size: 9.5pt; }
.box { background: #e0f1ee; border-radius: 10px; padding: 10px 14px; margin: 0 0 6px; }
.warn { background: #fdf0d8; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 8px 0 10px; }
.two > div { background: #f3f6f5; border-radius: 10px; padding: 10px 12px; }
.two h3 { font-size: 11pt; margin: 0 0 4px; }
.row { display: grid; grid-template-columns: 190px 1fr; gap: 18px; align-items: start; margin: 4px 0 10px; break-inside: avoid; }
.shot { width: 190px; border: 1px solid #c3cfcc; border-radius: 10px; display: block; }
.small { font-size: 9pt; color: #3a4a47; }
section > p:first-of-type, .two { break-inside: avoid; }
</style></head><body>
<header><img src="${dataUri('public/icons/icon-192.png', 'image/png')}" alt=""><div><h1>${esc(msgs['app.name'])}</h1><p class="sub">${r(g.subtitle)}</p></div></header>
<p class="box">${r(g.privacy)}</p>

<section><h2><bdi dir="ltr">1.</bdi> ${r(g.s1)}</h2>
<p>${r(g.s1text)}</p>
<div class="two"><div><h3>📱 iPhone</h3>${list(g.ios, msgs, 'ol')}</div><div><h3>🤖 Android</h3>${list(g.android, msgs, 'ol')}</div></div>
<p>${r(g.s1after)}</p></section>

<section><h2><bdi dir="ltr">2.</bdi> ${r(g.s2)}</h2><p>${r(g.s2text)}</p>${list(g.s2items, msgs)}</section>

<section><h2><bdi dir="ltr">3.</bdi> ${r(g.s3)}</h2>
<div class="row">${shot(s.settings)}<div>${list(g.s3items, msgs, 'ol')}</div></div></section>

<section><h2><bdi dir="ltr">4.</bdi> ${r(g.s4)}</h2>
<div class="row">${shot(s.import)}<div><p>${r(g.s4text)}</p>${list(g.s4steps, msgs, 'ol')}<p>${r(g.s4after)}</p></div></div>
<div class="row">${shot(s.review)}<div><p>${r(g.s4review)}</p><p class="small">${r(g.s4privacy)}</p></div></div></section>

<section><h2><bdi dir="ltr">5.</bdi> ${r(g.s5)}</h2>
<div class="row">${shot(s.months)}<div><p>${r(g.s5text)}</p>${list(g.s5items, msgs)}</div></div></section>

<section><h2><bdi dir="ltr">6.</bdi> ${r(g.s6)}</h2>
<div class="row">${shot(s.summary)}<div>${list(g.s6items, msgs)}</div></div></section>

<section><h2><bdi dir="ltr">7.</bdi> ${r(g.s7)}</h2><p>${r(g.s7text)}</p></section>

<section><h2><bdi dir="ltr">8.</bdi> ${r(g.s8)}</h2><p class="box warn">${r(g.s8text)}</p>
<p class="small">${r(g.more)}</p></section>
</body></html>`;
}

const browser = await chromium.launch();
for (const lang of langs) {
  const msgs = (await import(`${root}src/i18n/${lang}.ts`))[lang];
  const g = GUIDE[lang];
  const s = await screenshots(browser, lang, msgs);
  const page = await browser.newPage();
  await page.setContent(html(lang, g, msgs, s), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const out = lang === 'es' ? 'public/guia.pdf' : `public/guia-${lang}.pdf`;
  writeFileSync(root + out, await page.pdf({ format: 'A4', printBackground: true }));
  await page.close();
  console.log(`${out} ✓`);
}
await browser.close();
