/** Formularios (en ventana) para crear, cambiar y borrar cada cosa. */

import type { Line } from '../calc/engine';
import { monthKey, daysInMonth, todayISO } from '../calc/keys';
import { setFreeCell, setFreeLabel, setTransferCell } from '../calc/extras';
import { accountOrder, inOrder } from '../calc/order';
import { parseAmount } from '../calc/money';
import {
  removeDomRow,
  saveDomRow,
  accountUsage,
  addAccount,
  addEntry,
  addItem,
  addPayment,
  defaultPaymentGroup,
  findSamePayment,
  addPlanCharges,
  EVERY_OPTIONS,
  planCharges,
  planGroup,
  removeCharges,
  removePlanCharges,
  removeAccount,
  removeEntry,
  removeItem,
  removePayment,
  setHistoryCell,
  setItemOverride,
  setPaymentOverride,
  setRealBalance,
  updateAccount,
  updateEntry,
  updateItem,
  updatePayment,
} from '../calc';
import type { DomPlan, EntryType, ItemType } from '../calc/types';
import { fmtDate, fmtMoney, fmtYearMonth, t } from '../i18n';
import { LIMITS, newId } from '../storage/sanitize';
import type { Ctx } from './context';
import { confirmDialog, openDialog, type DialogAction } from './dialog';
import { h } from './dom';
import { amountField, checkboxField, dateField, monthField, readAll, segmentedField, selectField, textField } from './fields';
import { toast } from './toast';

/** Cuentas para elegir, en el orden en que se ven en la tabla. */
function accountOptions(ctx: Ctx) {
  return inOrder(ctx.data.config.accounts, accountOrder(ctx.data.config)).map(({ item: a, index: i }) => ({ value: i, label: a.name }));
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
    spent: checkboxField({ label: t('field.spent'), checked: current?.spent === true }),
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
        const account = { name: v.name, initial: v.initial ?? 0, ...(v.spent ? { spent: true } : {}) };
        ctx.commit(index === null ? addAccount(ctx.data, account) : updateAccount(ctx.data, index, account));
      },
    },
  );
  openDialog({
    title: index === null ? t('account.new') : t('account.edit'),
    content: [fields.name.el, fields.initial.el, fields.spent.el],
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
  const others = accountOptions(ctx).filter((o) => o.value !== index);
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
  const account = selectField({ label: t('field.account'), options: [...accounts, { value: -1, label: t('field.from.outside') }], value: current?.account ?? 0 });
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
    // «Desde fuera» solo tiene sentido en un ahorro (p. ej. lo que paga la empresa).
    for (const opt of Array.from(account.select.options)) if (opt.value === '-1') opt.disabled = !isSaving;
    if (!isSaving && account.select.value === '-1') account.select.value = '0';
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
  // Bloque de la tabla del mes: solo si hay bloques propios (p. ej. «Pagos de este mes · salen del bote»).
  // Los pagos sin bloque van a «Pagos no mensuales»; los nuevos, al bloque que más usan los demás pagos.
  const sections = ctx.data.config.sections ?? [];
  const groupNow = current?.group && sections.includes(current.group) ? current.group : current ? '' : defaultPaymentGroup(ctx.data.config);
  const group = selectField<string>({
    label: t('field.group'),
    value: groupNow,
    options: [...sections.map((s) => ({ value: s, label: s })), { value: '', label: t('months.group.Pago') }],
  });
  if (sections.length === 0) group.el.hidden = true;
  // Aviso si ya hay un pago ese día con el mismo importe (para no apuntarlo dos veces).
  const same = h('p', { class: 'field-hint warn-hint', role: 'status' });
  const checkSame = () => {
    // Se leen los cuadros tal cual, sin `read()`, para no marcar errores mientras se escribe.
    const a = parseAmount(amount.el.querySelector('input')?.value ?? '');
    const d = date.el.querySelector('input')?.value ?? '';
    const twin = a && /^\d{4}-\d{2}-\d{2}$/.test(d) ? findSamePayment(ctx.data.config, d, a, index) : undefined;
    same.textContent = twin ? t('payment.same', { name: twin.concept }) : '';
    same.hidden = !twin;
  };
  for (const f of [amount.el, date.el]) {
    f.addEventListener('input', checkSame);
    f.addEventListener('change', checkSame);
  }
  checkSame();

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
        const v = readAll({ concept, amount, date, account, estimated, group });
        if (!v) return false;
        const payment = { concept: v.concept, amount: v.amount ?? 0, date: v.date, account: v.account, estimated: v.estimated, group: v.group };
        ctx.commit(index === null ? addPayment(ctx.data, payment) : updatePayment(ctx.data, index, payment));
      },
    },
  );

  openDialog({
    title: index === null ? t('payment.new') : t('payment.edit'),
    content: [concept.el, amount.el, date.el, same, account.el, group.el, estimated.el],
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
  // Se escribe con signo, como se ve en la tabla: un ingreso en +, un gasto, pago o traspaso en −.
  // Con el signo contrario cuenta al revés ese mes (p. ej. un gasto en + es una devolución).
  const dir = line.type === 'Ingreso' ? 1 : -1;
  const amount = amountField({ label: t('field.amount'), value: dir * line.amount, allowNegative: true, hint: t('override.normal', { amount: fmtMoney(dir * line.base) }) });
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
        const r0 = amount.read();
        if (!r0.ok || r0.value === null) return false;
        const r = { value: dir * r0.value };
        // Si vuelve a ser el importe normal, no hace falta guardar el cambio. Salvo en un
        // sueldo: lo escrito a mano es lo cobrado (y así sale como confirmado en Sueldos).
        const keep = line.kind === 'item' && line.type === 'Ingreso' && /^sueldo /i.test(line.name.trim());
        apply(r.value === line.base && !keep ? null : r.value);
        if (r.value !== line.base || keep) toast(t('override.saved', { month: fmtYearMonth(ym) }));
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

// ── Cifra de un mes de años anteriores ───────────────────────────────────────

export function editHistoryCell(ctx: Ctx, ym: string, row: number, col: number, label: string): void {
  const m = ctx.data.history?.[ym];
  const original = m?.rows[row]?.v[col] ?? null;
  const key = `${ym}_r${row}_c${col}`;
  const current = ctx.data.overrides[key];
  const amount = amountField({ label: t('field.amount'), value: current ?? original, allowNegative: true, hint: t('history.cell.hint') });
  const actions: DialogAction[] = [];
  if (current !== undefined) actions.push({ label: t('action.reset'), kind: 'danger', onClick: () => ctx.commit(setHistoryCell(ctx.data, ym, row, col, null)) });
  actions.push(
    { label: t('action.cancel') },
    {
      label: t('action.save'),
      submit: true,
      onClick: () => {
        const v = readAll({ amount });
        if (!v) return false;
        ctx.commit(setHistoryCell(ctx.data, ym, row, col, v.amount ?? 0));
      },
    },
  );
  openDialog({ title: label, content: [amount.el], actions });
}

// ── Domiciliaciones ─────────────────────────────────────────────────────────

/** Nombres de cuenta para sugerir: las de la app y las de la lista de domiciliaciones. */
function domAccountNames(ctx: Ctx): string[] {
  const dom = ctx.data.domiciliaciones;
  return [
    ...ctx.data.config.accounts.map((a) => a.name),
    ...(dom?.accounts ?? []).map((a) => a.alias),
    ...(dom?.groups ?? []).flatMap((g) => g.rows.flatMap((r) => [r.from, r.to])),
  ];
}

/** Añade (`at` = null) o cambia una domiciliación. `group` propone el bloque al añadir. */
export function editDomRow(ctx: Ctx, at: { g: number; r: number } | null, group?: string): void {
  const dom = ctx.data.domiciliaciones;
  const config = ctx.data.config;
  const current = at ? dom?.groups[at.g]?.rows[at.r] : undefined;
  const groupTitle = at ? (dom?.groups[at.g]?.title ?? '') : (group ?? dom?.groups[0]?.title ?? t('dom.defaultGroup'));
  const accounts = domAccountNames(ctx);
  const today = todayISO();
  const plan = current?.plan;

  const concept = textField({ label: t('dom.field.concept'), value: current?.c ?? '', maxlength: 300 });
  // Cada cuánto se cobra: si no es «solo en la lista», sus cargos van solos a la tabla del mes.
  const every = selectField<number>({
    label: t('dom.field.every'),
    value: plan?.every ?? (current ? 0 : 1),
    options: [...EVERY_OPTIONS.map((n) => ({ value: n, label: t(`dom.every.${n}`) })), { value: 0, label: t('dom.every.0') }],
  });
  const cost = amountField({ label: t('dom.field.costEach'), value: current?.cost ?? null, optional: true });
  const first = dateField({ label: t('dom.field.first'), value: plan?.first ?? (today.startsWith(String(config.year)) ? today : `${config.year}-01-01`) });
  const usual = (() => {
    const g = defaultPaymentGroup(config);
    const count = new Map<number, number>();
    for (const p of config.payments) if ((p.group ?? '') === g) count.set(p.account, (count.get(p.account) ?? 0) + 1);
    return [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  })();
  const account = selectField({ label: t('dom.field.account'), options: accountOptions(ctx), value: plan && plan.account < config.accounts.length ? plan.account : usual });
  const summary = h('p', { class: 'field-hint dom-plan-hint', role: 'status' });
  // Domiciliación antigua (sin enlace) que pasa a tener cargos: se ofrece quitar lo que ya había apuntado a mano.
  const old = current && !plan ? planCharges(ctx.data, current, '') : { payments: [], items: [] };
  const oldNames = [...old.payments.map((i) => config.payments[i]!.concept), ...old.items.map((i) => config.items[i]!.name)];
  const replace = checkboxField({ label: t('dom.replaceOld', { list: oldNames.slice(0, 6).join(', ') }), checked: true });
  const from = textField({ label: t('dom.field.from'), value: current?.from ?? '', optional: true, suggestions: accounts, hint: t('settings.accounts.noNumbers') });
  const to = textField({ label: t('dom.field.to'), value: current?.to ?? '', optional: true, suggestions: accounts });
  const groupField = textField({ label: t('dom.field.group'), value: groupTitle, maxlength: 120, suggestions: (dom?.groups ?? []).map((g) => g.title), hint: t('dom.field.group.hint') });
  const ticker = textField({ label: t('dom.field.ticker'), value: current?.t ?? '', optional: true });

  const sync = () => {
    const n = Number(every.select.value);
    first.el.hidden = n === 0;
    account.el.hidden = n === 0 || config.accounts.length < 2;
    replace.el.hidden = n === 0 || oldNames.length === 0;
    const g = planGroup(config, n, Number(account.select.value));
    const block = g || t(n === 1 ? 'months.group.Gasto' : 'months.group.Pago');
    const date = first.el.querySelector('input')?.value ?? '';
    summary.textContent =
      n === 0 ? t('dom.plan.none') : n === 1 ? t('dom.plan.month', { block }) : t('dom.plan.pay', { n: Math.round(12 / n), block, date: date ? fmtDate(date, { year: true }) : '—' });
  };
  every.select.addEventListener('change', sync);
  account.select.addEventListener('change', sync);
  first.el.addEventListener('change', sync);
  first.el.addEventListener('input', sync);
  sync();

  const actions: DialogAction[] = [];
  if (at && current) {
    actions.push(
      deleteAction(async () => {
        // Al borrarla se ofrece quitar también sus cargos de la tabla del mes, desde hoy.
        const found = planCharges(ctx.data, current, today);
        const names = [
          ...(found.free ?? []).map((d) => `${current.c} (${fmtDate(d, { year: true })})`),
          ...found.payments.map((i) => `${config.payments[i]!.concept} (${fmtDate(config.payments[i]!.date, { year: true })})`),
          ...found.items.map((i) => config.items[i]!.name),
        ];
        const also = checkboxField({ label: t('dom.delete.charges', { list: names.slice(0, 8).join(', ') + (names.length > 8 ? '…' : '') }), checked: true });
        const yes = await confirmDialog({ text: [h('p', null, t('dom.delete', { name: current.c })), names.length ? also.el : null], yes: t('action.delete'), danger: true });
        if (!yes) return;
        let data = ctx.data;
        if (names.length && also.el.querySelector('input')?.checked) data = plan ? removePlanCharges(data, plan.link, today) : removeCharges(data, found, today);
        ctx.commit(removeDomRow(data, at.g, at.r), t('dom.deleted'));
      }),
    );
  }
  actions.push(
    { label: t('action.cancel') },
    {
      label: t('action.save'),
      submit: true,
      onClick: () => {
        const v = readAll({ concept, cost, from, to, groupField, ticker, first, account });
        if (!v) return false;
        const n = Number(every.select.value);
        if (n && !v.cost) {
          toast(t('dom.needCost'));
          cost.focus();
          return false;
        }
        const nextPlan: DomPlan | undefined = n ? { link: plan?.link ?? newId(), every: n, first: v.first, account: v.account } : undefined;
        let data = ctx.data;
        // Con cargos, guardar siempre los rehace (así se corrigen bloque y meses que faltaban).
        const changed = !!nextPlan || !!plan;
        if (changed) {
          // Los cargos ya pasados se quedan; los de hoy en adelante se vuelven a crear con lo nuevo.
          if (plan) data = removePlanCharges(data, plan.link, today);
          else if (nextPlan && oldNames.length && (replace.el.querySelector('input')?.checked ?? false)) data = removeCharges(data, old, '');
          if (nextPlan) data = addPlanCharges(data, nextPlan, v.concept, v.cost ?? 0, plan ? today : '');
        }
        ctx.commit(saveDomRow(data, at, { group: v.groupField, c: v.concept, t: v.ticker, cost: v.cost, from: v.from, to: v.to, plan: nextPlan }), nextPlan && changed ? t('dom.plan.saved') : undefined);
      },
    },
  );
  openDialog({
    title: at ? t('dom.edit') : t('dom.new'),
    content: [concept.el, every.el, cost.el, first.el, account.el, summary, replace.el, from.el, to.el, groupField.el, ticker.el],
    actions,
  });
}

// ── Filas libres y traspaso de cada mes ─────────────────────────────────────

/** Importe de una fila libre o del traspaso en una cuenta. Vacío lo borra. */
export function editExtraCell(ctx: Ctx, opts: { ym: string; col: number; slot: number | null; title: string; current: number | null }): void {
  const amount = amountField({
    label: t('field.amount'),
    value: opts.current,
    allowNegative: true,
    optional: true,
    hint: opts.slot === null ? t('extras.transfer.hint') : t('extras.free.hint'),
  });
  const apply = (v: number | null) =>
    ctx.commit(opts.slot === null ? setTransferCell(ctx.data, opts.ym, opts.col, v) : setFreeCell(ctx.data, opts.ym, opts.slot, opts.col, v));
  const actions: DialogAction[] = [];
  if (opts.current !== null) actions.push({ label: t('action.delete'), kind: 'danger', onClick: () => apply(null) });
  actions.push(
    { label: t('action.cancel') },
    {
      label: t('action.save'),
      submit: true,
      onClick: () => {
        const r = amount.read();
        if (!r.ok) return false;
        apply(r.value);
      },
    },
  );
  openDialog({ title: opts.title, content: [amount.el], actions });
  amount.input.select();
}

/** Nombre de una fila libre en un mes. */
export function editFreeLabel(ctx: Ctx, ym: string, slot: number, current: string): void {
  const name = textField({ label: t('field.concept'), value: current, optional: true, maxlength: 80, hint: t('extras.label.hint') });
  openDialog({
    title: `${t('extras.free', { n: slot + 1 })} · ${fmtYearMonth(ym)}`,
    content: [name.el],
    actions: [
      { label: t('action.cancel') },
      {
        label: t('action.save'),
        submit: true,
        onClick: () => {
          const r = name.read();
          if (!r.ok) return false;
          ctx.commit(setFreeLabel(ctx.data, ym, slot, r.value));
        },
      },
    ],
  });
}

// ── Saldo inicial y deuda de un mes ─────────────────────────────────────────

/** Saldo con el que empieza un mes: se guarda como saldo real a fin del mes anterior. */
export function editStart(ctx: Ctx, month: number, account: number, current: number, isReal: boolean): void {
  const { year } = ctx.data.config;
  const prev = month === 1 ? monthKey(year - 1, 12) : monthKey(year, month - 1);
  const name = ctx.data.config.accounts[account]?.name ?? '';
  const amount = amountField({ label: t('field.amount'), value: current, allowNegative: true, hint: t('start.hint', { month: fmtYearMonth(prev) }) });
  const actions: DialogAction[] = [];
  if (isReal) actions.push({ label: t('action.reset'), kind: 'danger', onClick: () => ctx.commit(setRealBalance(ctx.data, prev, account, null)) });
  actions.push(
    { label: t('action.cancel') },
    {
      label: t('action.save'),
      submit: true,
      onClick: () => {
        const r = amount.read();
        if (!r.ok || r.value === null) return false;
        ctx.commit(setRealBalance(ctx.data, prev, account, r.value));
      },
    },
  );
  openDialog({ title: `${t('months.row.start')} · ${name} · ${fmtYearMonth(monthKey(year, month))}`, content: [amount.el], actions });
  amount.input.select();
}

/** Deuda al empezar un mes, escrita a mano: los meses siguientes siguen desde ella. */
export function editDebt(ctx: Ctx, month: number, index: number, name: string, current: number, manual: boolean): void {
  const ym = monthKey(ctx.data.config.year, month);
  const key = `${ym}_d${index}`;
  const amount = amountField({ label: t('field.amount'), value: current, hint: t('debt.hint') });
  const set = (v: number | null) => {
    const overrides = { ...ctx.data.overrides };
    if (v === null) delete overrides[key];
    else overrides[key] = Math.abs(v);
    ctx.commit({ ...ctx.data, overrides });
  };
  const actions: DialogAction[] = [];
  if (manual) actions.push({ label: t('debt.auto'), kind: 'danger', onClick: () => set(null) });
  actions.push(
    { label: t('action.cancel') },
    {
      label: t('action.save'),
      submit: true,
      onClick: () => {
        const r = amount.read();
        if (!r.ok || r.value === null) return false;
        set(r.value);
      },
    },
  );
  openDialog({ title: `${name} · ${fmtYearMonth(ym)}`, content: [amount.el], actions });
  amount.input.select();
}
