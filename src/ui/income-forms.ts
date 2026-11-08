/** Formularios de la pestaña Sueldos: sueldos, contratos, personas y operaciones de BTC. */

import { round2 } from '../calc/money';
import type { BtcTrade, SalaryPerson } from '../calc/types';
import { fmtYearMonth, t } from '../i18n';
import { LIMITS } from '../storage/sanitize';
import type { Ctx } from './context';
import { confirmDialog, openDialog, type DialogAction } from './dialog';
import { h, uid } from './dom';
import { amountField, checkboxField, dateField, readAll, signButtons, textField, type Field, type Result } from './fields';

function setSalaries(ctx: Ctx, salaries: SalaryPerson[]): void {
  ctx.commit({ ...ctx.data, config: { ...ctx.data.config, salaries } });
}

const clone = (p: SalaryPerson): SalaryPerson => ({ ...p, contracts: p.contracts.map((c) => ({ ...c })), months: { ...p.months }, estimates: { ...(p.estimates ?? {}) } });

/** Campo de mes (AAAA-MM). */
function monthInput(label: string, value: string): Field<string> {
  const id = uid();
  const input = h('input', { id, type: 'month', value });
  const error = h('p', { class: 'field-error', hidden: true }, t('field.badDate'));
  return {
    el: h('div', { class: 'field' }, h('label', { for: id }, label), input, error),
    focus: () => input.focus(),
    read(): Result<string> {
      const ok = /^\d{4}-(0[1-9]|1[0-2])$/.test(input.value);
      error.hidden = ok;
      return ok ? { ok: true, value: input.value } : { ok: false };
    },
  };
}

export function addPerson(ctx: Ctx): void {
  const name = textField({ label: t('income.person.name'), maxlength: LIMITS.name });
  openDialog({
    title: t('income.person.new'),
    content: [name.el],
    actions: [
      { label: t('action.cancel') },
      {
        label: t('action.save'),
        submit: true,
        onClick: () => {
          const v = readAll({ name });
          if (!v) return false;
          setSalaries(ctx, [...(ctx.data.config.salaries ?? []), { name: v.name, contracts: [], months: {} }]);
        },
      },
    ],
  });
}

/** Sueldo de un mes: cobrado (confirmado) o estimado. `ym` = null para elegir el mes. */
export function editSalary(ctx: Ctx, pi: number, ym: string | null, current?: { amount: number; estimated: boolean }): void {
  const person = ctx.data.config.salaries?.[pi];
  if (!person) return;
  const month = ym ? null : monthInput(t('income.month.field'), new Date().toISOString().slice(0, 7));
  const amount = amountField({ label: t('field.amount'), value: current?.amount ?? null });
  const confirmed = checkboxField({ label: t('income.month.confirmed'), checked: current ? !current.estimated : true });
  const isSet = ym !== null && (person.months[ym] !== undefined || person.estimates?.[ym] !== undefined);
  const actions: DialogAction[] = [];
  if (isSet) {
    actions.push({
      label: t('action.delete'),
      kind: 'danger',
      onClick: () => {
        const p = clone(person);
        delete p.months[ym!];
        delete p.estimates![ym!];
        const all = [...(ctx.data.config.salaries ?? [])];
        all[pi] = p;
        setSalaries(ctx, all);
      },
    });
  }
  actions.push(
    { label: t('action.cancel') },
    {
      label: t('action.save'),
      submit: true,
      onClick: () => {
        const m = month ? month.read() : ({ ok: true, value: ym! } as Result<string>);
        const v = readAll({ amount, confirmed });
        if (!m.ok || !v || v.amount === null) return false;
        const p = clone(person);
        delete p.months[m.value];
        delete p.estimates![m.value];
        if (v.confirmed) p.months[m.value] = round2(v.amount);
        else p.estimates![m.value] = round2(v.amount);
        const all = [...(ctx.data.config.salaries ?? [])];
        all[pi] = p;
        setSalaries(ctx, all);
      },
    },
  );
  openDialog({
    title: ym ? t('income.month.title', { month: fmtYearMonth(ym) }) : `${t('income.addMonth')} · ${person.name}`,
    content: [month?.el ?? null, amount.el, confirmed.el, h('p', { class: 'field-hint' }, t('income.month.hint'))],
    actions,
  });
}

/** Añadir (`ci` = null) o cambiar un contrato. */
export function editContract(ctx: Ctx, pi: number, ci: number | null): void {
  const person = ctx.data.config.salaries?.[pi];
  if (!person) return;
  const current = ci === null ? null : person.contracts[ci];
  const name = textField({ label: t('income.contract.name'), value: current?.name ?? '', maxlength: LIMITS.name });
  const from = monthInput(t('income.contract.from'), current?.from ?? new Date().toISOString().slice(0, 7));
  const save = (contracts: SalaryPerson['contracts']) => {
    const p = clone(person);
    p.contracts = contracts.sort((a, b) => (a.from < b.from ? -1 : 1));
    const all = [...(ctx.data.config.salaries ?? [])];
    all[pi] = p;
    setSalaries(ctx, all);
  };
  const actions: DialogAction[] = [];
  if (ci !== null) actions.push({ label: t('action.delete'), kind: 'danger', onClick: () => save(person.contracts.filter((_, i) => i !== ci)) });
  actions.push(
    { label: t('action.cancel') },
    {
      label: t('action.save'),
      submit: true,
      onClick: () => {
        const v = readAll({ name, from });
        if (!v) return false;
        const list = person.contracts.filter((_, i) => i !== ci);
        save([...list, { name: v.name, from: v.from }]);
      },
    },
  );
  openDialog({ title: ci === null ? t('income.contract.new') : t('income.contract.edit'), content: [name.el, from.el], actions });
}

/** Cantidad de BTC con hasta 8 decimales («0,0015», «-0.005948»). */
export function parseQty(text: string): number | null {
  let s = text.replace(/[\s ]/g, '').replace('−', '-');
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(',', '.');
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n !== 0 ? Math.round(n * 1e8) / 1e8 : null;
}

function qtyField(value: number | null): Field<number> {
  const id = uid();
  const input = h('input', { id, type: 'text', inputmode: 'decimal', autocomplete: 'off', class: 'num-input', placeholder: '0,00000000' });
  input.value = value === null ? '' : String(value).replace('.', ',');
  const error = h('p', { class: 'field-error', hidden: true }, t('btc.badQty'));
  return {
    el: h(
      'div',
      { class: 'field' },
      h('label', { for: id }, t('btc.field.qty')),
      h('div', { class: 'amount-row' }, signButtons(input), h('div', { class: 'amount-wrap' }, input)),
      h('p', { class: 'field-hint' }, t('btc.field.qty.hint')),
      error,
    ),
    focus: () => input.focus(),
    read(): Result<number> {
      const n = parseQty(input.value);
      error.hidden = n !== null;
      return n === null ? { ok: false } : { ok: true, value: n };
    },
  };
}

export function editBtc(ctx: Ctx, index: number | null): void {
  const list = ctx.data.config.btc ?? [];
  const current = index === null ? null : list[index];
  const date = dateField({ label: t('btc.col.date'), value: current?.date ?? new Date().toISOString().slice(0, 10) });
  const qty = qtyField(current?.qty ?? null);
  const price = amountField({ label: t('btc.field.price'), value: current?.price ?? null });
  const paid = amountField({ label: t('btc.field.paid'), value: current?.paid ?? null, allowNegative: true, optional: true, hint: t('btc.field.paid.hint') });
  const save = (next: BtcTrade[]) => ctx.commit({ ...ctx.data, config: { ...ctx.data.config, btc: next } });
  const actions: DialogAction[] = [];
  if (index !== null && current) {
    actions.push({
      label: t('action.delete'),
      kind: 'danger',
      onClick: () =>
        void confirmDialog({ text: `${t('action.delete')}?`, yes: t('action.delete'), danger: true }).then((yes) => {
          if (yes) save(list.filter((_, i) => i !== index));
        }),
    });
  }
  actions.push(
    { label: t('action.cancel') },
    {
      label: t('action.save'),
      submit: true,
      onClick: () => {
        const v = readAll({ date, qty, price, paid });
        if (!v || v.price === null) return false;
        const trade: BtcTrade = { date: v.date, qty: v.qty, price: v.price, paid: v.paid ?? round2(v.qty * v.price) };
        const next = [...list];
        if (index === null) next.push(trade);
        else next[index] = trade;
        save(next);
      },
    },
  );
  openDialog({ title: index === null ? t('btc.new') : t('btc.edit'), content: [date.el, qty.el, price.el, paid.el], actions });
}

