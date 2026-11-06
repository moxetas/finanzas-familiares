/** Panel de Ajustes para sincronizar con otros móviles. */

import { t } from '../i18n';
import { newCode, readCode, type ConnectResult } from '../storage/sync';
import { button, card } from './components';
import type { Ctx } from './context';
import { confirmDialog, openDialog } from './dialog';
import { h } from './dom';
import { textField } from './fields';
import { toast } from './toast';

function report(result: ConnectResult): boolean {
  if (result === 'ok') toast(t('sync.connected'));
  else if (result === 'denied') toast(t('sync.denied'), { duration: 7000 });
  else if (result === 'offline') toast(t('sync.offline'), { duration: 6000 });
  return result === 'ok';
}

async function connect(ctx: Ctx, code: string): Promise<void> {
  const result = await ctx.store.sync.connect(code);
  if (result !== 'needs-choice') {
    report(result);
    return;
  }
  // Hay datos en los dos sitios: que decida la persona.
  openDialog({
    title: t('sync.choice.title'),
    content: [h('p', null, t('sync.choice.text'))],
    actions: [
      { label: t('action.cancel') },
      { label: t('sync.choice.phone'), kind: 'danger', onClick: () => void ctx.store.sync.connect(code, 'phone').then(report) },
      { label: t('sync.choice.cloud'), submit: true, onClick: () => void ctx.store.sync.connect(code, 'cloud').then(report) },
    ],
  });
}

function joinDialog(ctx: Ctx): void {
  const field = textField({ label: t('sync.join.label'), value: '', maxlength: 300, hint: t('sync.join.hint') });
  openDialog({
    title: t('sync.join.title'),
    content: [field.el],
    actions: [
      { label: t('action.cancel') },
      {
        label: t('sync.join.go'),
        submit: true,
        onClick: () => {
          const r = field.read();
          const code = r.ok ? readCode(r.value) : null;
          if (!code) {
            toast(t('sync.bad'));
            return false;
          }
          void connect(ctx, code);
        },
      },
    ],
  });
}

async function shareCode(code: string): Promise<void> {
  const text = t('sync.code.text', { code });
  try {
    if (navigator.share) {
      await navigator.share({ text });
      return;
    }
    await navigator.clipboard.writeText(text);
    toast(t('sync.code.copied'));
  } catch (e) {
    if ((e as DOMException).name !== 'AbortError') toast(t('sync.code.copied'));
  }
}

export function syncCard(ctx: Ctx): HTMLElement {
  const sync = ctx.store.sync;
  const code = sync.code;
  if (!code) {
    return card(
      { title: t('sync.title'), sub: t('sync.sub'), id: 'sync' },
      h(
        'div',
        { class: 'button-row' },
        button(t('sync.create'), { kind: 'primary', focusKey: 'sync-create', onClick: () => void connect(ctx, newCode()) }),
        button(t('sync.join'), { focusKey: 'sync-join', onClick: () => joinDialog(ctx) }),
      ),
    );
  }
  const ok = sync.status === 'online';
  return card(
    { title: t('sync.title'), id: 'sync' },
    h('p', { class: `sync-status ${ok ? 'is-ok' : 'is-warn'}`, role: 'status' }, t(`sync.status.${sync.status}`)),
    sync.lastSync ? h('p', { class: 'meta-line' }, t('sync.last', { time: new Date(sync.lastSync).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) })) : null,
    h('p', { class: 'meta-line' }, t('sync.code')),
    h('p', { class: 'code-box' }, code),
    h(
      'div',
      { class: 'button-row' },
      button(t('sync.code.share'), { icon: 'share', onClick: () => void shareCode(code) }),
      button(t('sync.off'), {
        kind: 'danger',
        onClick: async () => {
          const yes = await confirmDialog({ text: t('sync.off.confirm'), yes: t('sync.off.yes'), danger: true });
          if (yes) sync.disconnect();
        },
      }),
    ),
    h('p', { class: 'field-hint privacy-hint' }, t('sync.privacy')),
  );
}
