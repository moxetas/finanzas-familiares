/** Guía de primeros pasos: sale sola la primera vez y se puede abrir desde Ajustes. */

import { currentLocale, t, type MessageKey } from '../../i18n';
import { button, card, pageHeader } from '../components';
import type { Ctx } from '../context';
import { h } from '../dom';
import { openImport } from '../import-ai';
import { startBlank, useExampleAsMine } from '../notices';

/** La guía en PDF en el idioma de la app (public/guia.pdf es la española). */
function guidePdf(): { href: string; download: string } {
  const lang = currentLocale();
  return { href: lang === 'es' ? 'guia.pdf' : `guia-${lang}.pdf`, download: `${t('app.name').replace(/\s+/g, '-')}.pdf` };
}

const STEPS: { title: MessageKey; text: MessageKey }[] = [
  { title: 'guide.s1.title', text: 'guide.s1.text' },
  { title: 'guide.s2.title', text: 'guide.s2.text' },
  { title: 'guide.s3.title', text: 'guide.s3.text' },
  { title: 'guide.s4.title', text: 'guide.s4.text' },
  { title: 'guide.s5.title', text: 'guide.s5.text' },
  { title: 'guide.s6.title', text: 'guide.s6.text' },
  { title: 'guide.s7.title', text: 'guide.s7.text' },
];

export function guideView(ctx: Ctx): HTMLElement {
  if (!ctx.store.state.meta.guideSeen) queueMicrotask(() => ctx.store.setMeta({ guideSeen: true }));
  const example = ctx.data.config.example;
  return h(
    'div',
    { class: 'view view-guide' },
    pageHeader(t('guide.title'), t('guide.sub')),
    card(
      { title: t('guide.privacy.title') },
      h('p', null, t('guide.privacy.text')),
    ),
    h(
      'ol',
      { class: 'guide-steps' },
      STEPS.map((s, i) => h('li', { class: 'card guide-step' }, h('span', { class: 'guide-num', 'aria-hidden': 'true' }, String(i + 1)), h('div', null, h('h2', null, t(s.title)), h('p', null, t(s.text))))),
    ),
    card(
      { title: t('guide.start.title') },
      h(
        'div',
        { class: 'button-row' },
        example ? button(t('example.blank'), { kind: 'primary', onClick: () => void startBlank(ctx) }) : null,
        example ? button(t('example.mine'), { onClick: () => useExampleAsMine(ctx) }) : button(t('guide.toSettings'), { kind: 'primary', onClick: () => ctx.go('#/ajustes') }),
        button(t('import.button'), { icon: 'upload', onClick: () => openImport(ctx) }),
      ),
      h('p', { class: 'field-hint' }, h('a', guidePdf(), t('guide.pdf'))),
    ),
  );
}
