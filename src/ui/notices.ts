/** Avisos de la parte de arriba: ejemplo, instalar la app, copia de seguridad. */

import { todayISO } from '../calc/keys';
import { blankData } from '../calc/mutations';
import { t } from '../i18n';
import { exampleData } from '../storage/example';
import { exportBackup } from './backup-actions';
import { button } from './components';
import type { Ctx } from './context';
import { confirmDialog } from './dialog';
import { h } from './dom';
import { icon } from './icons';
import { canPromptInstall, isStandalone, promptInstall } from './install';
import { toast } from './toast';

/** Banda fija mientras se ve el ejemplo ficticio. */
export function exampleBanner(ctx: Ctx): HTMLElement | null {
  if (!ctx.data.config.example) return null;
  return h(
    'aside',
    { class: 'example-banner', 'aria-label': t('example.badge') },
    h('div', { class: 'example-text' }, h('strong', null, t('example.badge')), h('span', null, t('example.text'))),
    h(
      'div',
      { class: 'example-actions' },
      button(t('example.mine'), { kind: 'primary', onClick: () => useExampleAsMine(ctx) }),
      button(t('example.blank'), { kind: 'secondary', onClick: () => void startBlank(ctx) }),
    ),
  );
}

/** Se queda con el ejemplo como punto de partida y lleva a Ajustes para cambiarlo. */
export function useExampleAsMine(ctx: Ctx): void {
  ctx.commit({ ...ctx.data, config: { ...ctx.data.config, example: false } });
  ctx.go('#/ajustes');
  toast(t('toast.mine'));
}

export async function startBlank(ctx: Ctx, ask = !ctx.data.config.example): Promise<void> {
  if (ask) {
    const yes = await confirmDialog({ text: t('confirm.blank'), yes: t('confirm.yes.blank'), danger: true });
    if (!yes) return;
  }
  ctx.commit(blankData(ctx.data.config.year, t('account.defaultName')), ask ? t('toast.blank') : undefined);
  ctx.go('#/ajustes');
  if (!ask) toast(t('toast.blank'));
}

export async function loadExample(ctx: Ctx): Promise<void> {
  const yes = ctx.data.config.example || (await confirmDialog({ text: t('confirm.example'), yes: t('confirm.yes.example'), danger: true }));
  if (!yes) return;
  ctx.commit(exampleData(new Date().getFullYear(), todayISO()), t('toast.example'));
  ctx.go('#/resumen');
}

function notice(content: HTMLElement[], onDismiss?: () => void): HTMLElement {
  return h(
    'aside',
    { class: 'notice' },
    h('div', { class: 'notice-body' }, content),
    onDismiss
      ? h('button', { type: 'button', class: 'btn btn-ghost btn-icon', 'aria-label': t('summary.dismiss'), title: t('summary.dismiss'), onclick: onDismiss }, icon('close', 18))
      : null,
  );
}

export function installNotice(ctx: Ctx): HTMLElement | null {
  if (isStandalone() || ctx.store.state.meta.installHintDismissed) return null;
  const action = canPromptInstall()
    ? button(t('settings.install.button'), { icon: 'install', kind: 'primary', onClick: () => void promptInstall() })
    : button(t('summary.installHow'), { kind: 'secondary', onClick: () => ctx.go('#/ajustes/instalar') });
  return notice([h('p', null, t('summary.install')), action], () => ctx.store.setMeta({ installHintDismissed: true }));
}

const DAY = 86_400_000;

export function backupNotice(ctx: Ctx): HTMLElement | null {
  const { data, meta } = ctx.store.state;
  if (data.config.example) return null;
  const amount = data.config.items.length + data.config.payments.length + data.entries.length;
  const last = meta.lastBackup ? Date.parse(meta.lastBackup) : NaN;
  let text: string | null = null;
  if (Number.isNaN(last)) {
    if (amount >= 3) text = t('summary.backupNever');
  } else if (Date.now() - last > 30 * DAY) {
    text = t('summary.backupReminder');
  }
  if (!text) return null;
  return notice([h('p', null, text), button(t('summary.backupNow'), { icon: 'download', kind: 'primary', onClick: () => void exportBackup(ctx) })]);
}
