/** Formularios (en ventana) para crear, cambiar y borrar cada cosa. */

import type { Line } from '../calc/engine';
import { monthKey, daysInMonth, todayISO } from '../calc/keys';
import {
  accountUsage,
  addAccount,
  addEntry,
  addItem,
  addPayment,
  removeAccount,
  removeEntry,
  removeItem,
  removePayment,
  setItemOverride,
  setPaymentOverride,
  updateAccount,
  updateEntry,
  updateItem,
  updatePayment,
} from '../calc/mutations';
import type { EntryType, ItemType } from '../calc/types';
import { fmtMoney, fmtYearMonth, t } from '../i18n';
import { LIMITS, newId } from '../storage/sanitize';
import type { Ctx } from './context';
import { confirmDialog, openDialog, type DialogAction } from './dialog';
import { h } from './dom';
import { amountField, checkboxField, dateField, monthField, readAll, segmentedField, selectField, textField } from './fields';
import { toast } from './toast';

function accountOptions(ctx: Ctx) {
  return ctx.data.config.accounts.map((a, i) => ({ value: i, label: a.name }));
}

function deleteAction(onClick: () => void): DialogAction {
  return { label: t('action.delete'), kind: 'danger', onClick: () => void onClick() };
}

// ── Cuentas ─────────────────────────────────────────────────────────────────

export function editAccount(ctx: Ctx, index: number | null): void {
  const current = index === null ? null : ctx.data.config.accounts[index];
  const fields = {
    name: textField({ label: t('field.name'), value: current?.name ?? '', maxlength: LIMITS.name, hint: t('settings.accounts.noNumbers') }),
    initial: amountField({ label: t('field.initial'), value: current?.initial ?? 0, allowNegative: true }),
  };
  const actions: DialogAction[] = [];
  if (index !== null) actions.push(deleteAction(() => deleteAccount(ctx, index)));
  actions.push(
    { label: t('action.cancel') },
    {
      label: t('action.save'),
      submit: true,
      onClick: () => {
        const v = readAll(fields);
        if (!v) return false;
        const account = { name: v.name, initial: v.initial ?? 0 };
        ctx.commit(index === null ? addAccount(ctx.data, account) : updateAccount(ctx.data, index, account));
      },
    },
  );
  openDialog({
    title: index === null ? t('account.new') : t('account.edit'),
    content: [fields.name.el, fields.initial.el],
    actions,
  });
}

export function deleteAccount(ctx: Ctx, index: number): void {
  const accounts = ctx.data.config.accounts;
  const account = accounts[index];
  if (!account) return;
  if (accounts.length <= 1) {
    toast(t('account.delete.last'));
    return;
  }
  const usage = accountUsage(ctx.data, index);
  const used = usage.items + usage.payments + usage.entries > 0;
  const others = accounts.map((a, i) => ({ value: i, label: a.name })).filter((o) => o.value !== index);
  const target = selectField({ label: t('account.delete.reassign'), options: others, value: others[0]!.value });
  openDialog({
    title: t('account.delete.title', { name: account.name }),
    content: [
      h('p', null, used ? t('account.delete.text', { items: usage.items, payments: usage.payments, entries: usage.entries }) : t('account.delete.unused')),
      used ? target.el : null,
      h('p', { class: 'field-hint' }, t('account.delete.realNote')),
    ],
    actions: [
      { label: t('action.cancel') },
      {
        label: t('action.delete'),
        kind: 'danger',
        submit: true,
        onClick: () => {
          const r = target.read();
          const to = r.ok ? r.value : others[0]!.value;
          ctx.commit(removeAccount(ctx.data, index, to), t('account.deleted'));
        },
      },
    ],
  });
}

// ── Conceptos de cada mes ────────────────────────────────────────────────────

export function editItem(ctx: Ctx, index: number | null): void {
  const current = index === null ? null : ctx.data.config.items[index];
  const accounts = accountOptions(ctx);
  const hasSeveral = accounts.length > 1;
  let type: ItemType = current?.type ?? 'Gasto';

  const typeField = segmentedField<ItemType>({
    label: t('field.type'),
    value: type,
    options: (['Ingreso', 'Gasto', 'Ahorro'] as const).map((v) => ({
      value: v,
      label: v === 'Ahorro' ? t('type.Ahorro.short') : t(`type.${v}`),
      hint: t(`field.type.${v}.hint`),
    })),
    onChange: (v) => {
      type = v;
      sync();
    },
  });
  const name = textField({ label: t('field.name'), value: current?.name ?? '', maxlength: LIMITS.name });
  const amount = amountField({ label: t('field.amount'), value: current?.amount ?? null });
  const account = selectField({ label: t('field.account'), options: accounts, value: current?.account ?? 0 });
  const toOptions = [...accounts, { value: -1, label: t('field.to.outside') }];
  const defaultTo = current && current.type === 'Ahorro' ? current.to : (accounts.find((a) => a.value !== (current?.account ?? 0))?.value ?? -1);
  const to = selectField({ label: t('field.to'), options: toOptions, value: defaultTo });
  const from = monthField({ label: t('field.fromMonth'), value: current?.from_month ?? 1 });
  const until = monthField({ label: t('field.toMonth'), value: current?.to_month ?? 12 });

  const accountLabel = account.el.querySelector('label')!;
  const sync = () => {
    const isSaving = type === 'Ahorro';
    to.el.hidden = !isSaving;
    accountLabel.textContent = isSaving ? t('field.from') : t('field.account');
    // El destino no puede ser la misma cuenta de origen.
    const origin = account.select.value;
    for (const opt of Array.from(to.select.options)) opt.disabled = opt.value === origin;
    if (to.select.value === origin) to.select.value = String(accounts.find((a) => String(a.value) !== origin)?.value ?? -1);
  };
  account.select.addEventListener('change', sync);
  sync();
  if (!hasSeveral) account.el.hidden = true;

  const actions: DialogAction[] = [];
  if (index !== null && current) {
    actions.push(
      deleteAction(async () => {
        const yes = await confirmDialog({ text: t('item.delete', { name: current.name }), yes: t('action.delete'), danger: true });
        if (yes) ctx.commit(removeItem(ctx.data, index), t('item.deleted'));
      }),
    );
  }
  actions.push(
    { label: t('action.cancel') },
    {
      label: t('action.save'),
      submit: true,
      onClick: () => {
        const v = readAll({ type: typeField, name, amount, account, to, from, until });
        if (!v) return false;
        const item = {
          name: v.name,
          type: v.type,
          amount: v.amount ?? 0,
          account: v.account,
          to: v.type === 'Ahorro' ? v.to : -1,
          from_month: v.from,
          to_month: v.until,
        };
        ctx.commit(index === null ? addItem(ctx.data, item) : updateItem(ctx.data, index, item));
      },
    },
  );

  openDialog({
    title: index === null ? t('item.new') : t('item.edit'),
    content: [typeField.el, name.el, amount.el, account.el, to.el, h('div', { class: 'field-row' }, from.el, until.el)],
    actions,
  });
}

// ── Pagos que no son mensuales ───────────────────────────────────────────────

export function editPayment(ctx: Ctx, index: number | null): void {
  const current = index === null ? null : ctx.data.config.payments[index];
  const year = ctx.data.config.year;
  const today = todayISO();
  const defaultDate = today.startsWith(String(year)) ? today : `${year}-01-01`;

  const concept = textField({ label: t('field.concept'), value: current?.concept ?? '', maxlength: LIMITS.name });
  const amount = amountField({ label: t('field.amount'), value: current?.amount ?? null });
  const date = dateField({ label: t('field.date'), value: current?.date ?? defaultDate, hint: t('settings.year.hint') });
  const account = selectField({ label: t('field.account'), options: accountOptions(ctx), value: current?.account ?? 0 });
  if (ctx.data.config.accounts.length < 2) account.el.hidden = true;
  const estimated = checkboxField({ label: t('field.estimated'), checked: current?.estimated ?? false });

  const actions: DialogAction[] = [];
  if (index !== null && current) {
    actions.push(
      deleteAction(async () => {
        const yes = await confirmDialog({ text: t('payment.delete', { name: current.concept }), yes: t('action.delete'), danger: true });
        if (yes) ctx.commit(removePayment(ctx.data, index), t('payment.deleted'));
      }),
    );
  }
  actions.push(
    { label: t('action.cancel') },
    {
      label: t('action.save'),
      submit: true,
      onClick: () => {
        const v = readAll({ concept, amount, date, account, estimated });
        if (!v) return false;
        const payment = { concept: v.concept, amount: v.amount ?? 0, date: v.date, account: v.account, estimated: v.estimated };
        ctx.commit(index === null ? addPayment(ctx.data, payment) : updatePayment(ctx.data, index, payment));
      },
    },
  );

  openDialog({
    title: index === null ? t('payment.new') : t('payment.edit'),
    content: [concept.el, amount.el, date.el, account.el, estimated.el],
    actions,
  });
}

// ── Apuntes del mes ─────────────────────────────────────────────────────────

export function editEntry(ctx: Ctx, ym: string, id: string | null): void {
  const current = id === null ? null : (ctx.data.entries.find((e) => e.id === id) ?? null);
  const [y, m] = ym.split('-').map(Number) as [number, number];
  const first = `${ym}-01`;
  const last = `${ym}-${String(daysInMonth(y, m)).padStart(2, '0')}`;
  const today = todayISO();

  const type = segmentedField<EntryType>({
    label: t('field.type'),
    value: current?.type ?? 'Gasto',
    options: [
      { value: 'Gasto', label: t('type.Gasto') },
      { value: 'Ingreso', label: t('type.Ingreso') },
    ],
  });
  const concept = textField({ label: t('field.concept'), value: current?.concept ?? '', maxlength: LIMITS.name });
  const amount = amountField({ label: t('field.amount'), value: current?.amount ?? null });
  const date = dateField({
    label: t('field.date'),
    optional: true,
    value: current ? current.date : today >= first && today <= last ? today : '',
    min: first,
    max: last,
  });
  const account = selectField({ label: t('field.account'), options: accountOptions(ctx), value: current?.account ?? 0 });
  if (ctx.data.config.accounts.length < 2) account.el.hidden = true;
  const note = textField({ label: t('field.note'), value: current?.note ?? '', optional: true, multiline: true, maxlength: LIMITS.note });

  const actions: DialogAction[] = [];
  if (current) actions.push(deleteAction(() => ctx.commit(removeEntry(ctx.data, current.id), t('entries.deleted'))));
  actions.push(
    { label: t('action.cancel') },
    {
      label: t('action.save'),
      submit: true,
      onClick: () => {
        const v = readAll({ type, concept, amount, date, account, note });
        if (!v) return false;
        const entry = {
          id: current?.id ?? newId(),
          month: ym,
          type: v.type,
          concept: v.concept,
          amount: v.amount ?? 0,
          date: v.date,
          account: v.account,
          note: v.note,
        };
        ctx.commit(current ? updateEntry(ctx.data, current.id, entry) : addEntry(ctx.data, entry));
      },
    },
  );

  openDialog({
    title: current ? t('entries.edit') : `${t('entries.new')} · ${fmtYearMonth(ym)}`,
    content: [type.el, concept.el, amount.el, date.el, account.el, note.el],
    actions,
  });
}

// ── Importe de un solo mes ───────────────────────────────────────────────────

export function editOverride(ctx: Ctx, line: Line, month: number): void {
  if (line.kind === 'entry') {
    const entry = ctx.data.entries[line.index];
    if (entry) editEntry(ctx, entry.month, entry.id);
    return;
  }
  const ym = monthKey(ctx.data.config.year, month);
  const amount = amountField({ label: t('field.amount'), value: line.amount, hint: t('override.normal', { amount: fmtMoney(line.base) }) });
  const apply = (value: number | null) => {
    const fn = line.kind === 'item' ? setItemOverride : setPaymentOverride;
    ctx.commit(fn(ctx.data, ym, line.index, value));
  };
  const actions: DialogAction[] = [];
  if (line.overridden) {
    actions.push({
      label: t('action.reset'),
      kind: 'ghost',
      onClick: () => {
        apply(null);
        toast(t('override.reset'));
      },
    });
  }
  actions.push(
    { label: t('action.cancel') },
    {
      label: t('action.save'),
      submit: true,
      onClick: () => {
        const r = amount.read();
        if (!r.ok || r.value === null) return false;
        // Si vuelve a ser el importe normal, no hace falta guardar el cambio.
        apply(r.value === line.base ? null : r.value);
        if (r.value !== line.base) toast(t('override.saved', { month: fmtYearMonth(ym) }));
      },
    },
  );
  openDialog({
    title: t('override.title', { name: line.name, month: fmtYearMonth(ym) }),
    content: [amount.el, h('p', { class: 'field-hint' }, t('override.hint'))],
    actions,
  });
  amount.input.select();
}
