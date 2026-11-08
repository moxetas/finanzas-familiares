/** «Añadir desde foto, captura o PDF»: con la IA de cada uno o pegando el texto. */

import { addEntry, addItem, addPayment } from '../calc/mutations';
import { accountOrder, inOrder } from '../calc/order';
import type { AppData } from '../calc/types';
import { todayISO } from '../calc/keys';
import { parseAmount } from '../calc/money';
import { fmtInput, t } from '../i18n';
import { AI_PROMPT, parseImport, type ImportKind, type ImportRow } from '../storage/ai-import';
import { newId } from '../storage/sanitize';
import type { Ctx } from './context';
import { openDialog } from './dialog';
import { h, uid } from './dom';
import { toast } from './toast';

export function openImport(ctx: Ctx): void {
  const id = uid('imp');
  const area = h('textarea', { id, rows: 6, placeholder: t('import.paste.placeholder'), class: 'import-area' });
  const copy = h(
    'button',
    {
      type: 'button',
      class: 'btn btn-secondary',
      onclick: async () => {
        try {
          await navigator.clipboard.writeText(AI_PROMPT);
          toast(t('import.copied'));
        } catch {
          area.value = AI_PROMPT;
          area.select();
          toast(t('import.copyManual'));
        }
      },
    },
    t('import.copy'),
  );
  openDialog({
    title: t('import.title'),
    content: [
      h(
        'ol',
        { class: 'import-steps' },
        h('li', null, t('import.step1'), h('div', { class: 'button-row' }, copy)),
        h('li', null, t('import.step2')),
        h('li', null, t('import.step3')),
      ),
      h('div', { class: 'field' }, h('label', { for: id }, t('import.paste')), area, h('p', { class: 'field-hint' }, t('import.paste.hint'))),
      h('p', { class: 'field-hint' }, t('import.privacy')),
    ],
    actions: [
      { label: t('action.cancel') },
      {
        label: t('import.read'),
        submit: true,
        onClick: () => {
          const rows = parseImport(area.value, todayISO());
          if (rows.length === 0) {
            toast(t('import.nothing'), { duration: 6000 });
            return false;
          }
          setTimeout(() => review(ctx, rows), 0);
        },
      },
    ],
  });
}

const KIND_LABEL: Record<ImportKind, Parameters<typeof t>[0]> = {
  pago: 'import.kind.pago',
  gasto: 'import.kind.gasto',
  ingreso: 'import.kind.ingreso',
  mensual: 'import.kind.mensual',
};

/** Revisar y corregir lo leído antes de añadirlo. */
function review(ctx: Ctx, rows: ImportRow[]): void {
  const accounts = ctx.data.config.accounts;
  const accId = uid('acc');
  const account = h('select', { id: accId }, inOrder(accounts, accountOrder(ctx.data.config)).map(({ item: a, index: i }) => h('option', { value: i }, a.name)));
  const editors = rows.map((r) => {
    const on = h('input', { type: 'checkbox', checked: true, 'aria-label': t('import.include') });
    const kind = h('select', { 'aria-label': t('field.type') }, (Object.keys(KIND_LABEL) as ImportKind[]).map((k) => h('option', { value: k, selected: k === r.kind }, t(KIND_LABEL[k]))));
    const concept = h('input', { type: 'text', value: r.concept, maxlength: 60, 'aria-label': t('field.concept') });
    const amount = h('input', { type: 'text', inputmode: 'decimal', value: fmtInput(r.amount), class: 'num-input', 'aria-label': t('field.amount') });
    const date = h('input', { type: 'date', value: r.date, 'aria-label': t('field.date') });
    const el = h('li', { class: 'import-row' }, h('div', { class: 'import-row-head' }, on, kind), concept, h('div', { class: 'field-row' }, amount, date), r.estimated ? h('p', { class: 'field-hint' }, t('chip.estimated')) : null);
    return { el, on, kind, concept, amount, date, row: r };
  });
  openDialog({
    title: t('import.review', { n: rows.length }),
    content: [
      h('p', { class: 'field-hint' }, t('import.review.hint')),
      accounts.length > 1 ? h('div', { class: 'field' }, h('label', { for: accId }, t('field.account')), account) : null,
      h('ul', { class: 'rows import-list' }, editors.map((e) => e.el)),
    ],
    actions: [
      { label: t('action.cancel') },
      {
        label: t('import.add'),
        submit: true,
        onClick: () => {
          const acc = Number(account.value) || 0;
          let data: AppData = ctx.data;
          let added = 0;
          for (const e of editors) {
            if (!e.on.checked) continue;
            const amount = parseAmount(e.amount.value);
            const date = e.date.value;
            if (amount === null || !amount || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
            const concept = e.concept.value.trim() || '—';
            const k = e.kind.value as ImportKind;
            const value = Math.abs(amount);
            if (k === 'pago') data = addPayment(data, { date, concept, amount: value, account: acc, estimated: e.row.estimated });
            else if (k === 'mensual') {
              const from = date.startsWith(`${data.config.year}-`) ? Number(date.slice(5, 7)) : 1;
              data = addItem(data, { name: concept, type: 'Gasto', amount: value, account: acc, to: -1, from_month: from, to_month: 12 });
            } else data = addEntry(data, { id: newId(), month: date.slice(0, 7), concept, amount: value, type: k === 'ingreso' ? 'Ingreso' : 'Gasto', date, account: acc, note: e.row.note });
            added++;
          }
          if (!added) {
            toast(t('import.nothing'));
            return false;
          }
          ctx.commit(data, t('import.added', { n: added }));
        },
      },
    ],
  });
}
