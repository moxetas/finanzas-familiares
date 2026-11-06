/**
 * Ventanas modales con <dialog>: el navegador se encarga del foco y de cerrar
 * con Escape. En el móvil se muestran como una hoja que sube desde abajo.
 */

import { t } from '../i18n';
import { button, type ButtonKind } from './components';
import { h, uid, type Child } from './dom';
import { icon } from './icons';

export interface DialogAction {
  label: string;
  kind?: ButtonKind;
  /** Devuelve `false` para no cerrar (por ejemplo, si hay errores). */
  onClick?: () => boolean | void;
  /** Botón principal: también se activa al pulsar Intro en un campo. */
  submit?: boolean;
}

export interface DialogHandle {
  close(): void;
  element: HTMLDialogElement;
}

export function openDialog(opts: { title: string; content: Child; actions: DialogAction[]; onClose?: () => void }): DialogHandle {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const openerKey = opener?.closest<HTMLElement>('[data-focus-key]')?.dataset['focusKey'];
  const titleId = uid('dlg');
  let closed = false;

  const dialog = h('dialog', { class: 'sheet', 'aria-labelledby': titleId });
  const close = () => {
    if (closed) return;
    closed = true;
    if (dialog.open) dialog.close();
    dialog.remove();
    opts.onClose?.();
    // Si la vista se ha redibujado, el botón que abrió la ventana es otro: se busca por su clave.
    const target = opener && document.contains(opener) ? opener : openerKey ? document.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(openerKey)}"]`) : null;
    target?.focus({ preventScroll: true });
  };

  const submitAction = opts.actions.find((a) => a.submit);
  const form = h('form', {
    class: 'sheet-form',
    novalidate: true,
    onsubmit: (ev: Event) => {
      ev.preventDefault();
      if (!submitAction) return;
      if (submitAction.onClick?.() !== false) close();
    },
  });

  const actions = opts.actions.map((a) =>
    button(a.label, {
      kind: a.kind ?? (a.submit ? 'primary' : 'secondary'),
      type: a.submit ? 'submit' : 'button',
      onClick: a.submit
        ? undefined
        : () => {
            if (a.onClick?.() !== false) close();
          },
    }),
  );

  form.append(
    h(
      'header',
      { class: 'sheet-head' },
      h('h2', { id: titleId }, opts.title),
      h('button', { type: 'button', class: 'btn btn-ghost btn-icon', 'aria-label': t('action.close'), title: t('action.close'), onclick: close }, icon('close', 20)),
    ),
    h('div', { class: 'sheet-body' }, opts.content),
    h('footer', { class: 'sheet-actions' }, actions),
  );
  dialog.append(form);

  dialog.addEventListener('cancel', (ev) => {
    ev.preventDefault();
    close();
  });
  // Tocar fuera de la hoja la cierra.
  dialog.addEventListener('click', (ev) => {
    if (ev.target === dialog) close();
  });

  document.body.append(dialog);
  dialog.showModal();
  // Con ratón o teclado, el foco va al primer campo. En pantallas táctiles no,
  // para que no salte el teclado nada más abrir.
  const first = dialog.querySelector<HTMLElement>('.sheet-body input, .sheet-body select, .sheet-body textarea');
  if (first && !matchMedia('(pointer: coarse)').matches) first.focus();

  return { close, element: dialog };
}

/** Pregunta de sí o no. Se resuelve con `true` si se confirma. */
export function confirmDialog(opts: { title?: string; text: Child; yes: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    let answer = false;
    openDialog({
      title: opts.title ?? t('confirm.title'),
      content: h('div', { class: 'confirm-text' }, opts.text),
      actions: [
        { label: t('action.cancel'), kind: 'secondary' },
        {
          label: opts.yes,
          kind: opts.danger ? 'danger' : 'primary',
          submit: true,
          onClick: () => {
            answer = true;
          },
        },
      ],
      onClose: () => resolve(answer),
    });
  });
}
