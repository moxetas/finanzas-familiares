/** Ajustes: año, cuentas, conceptos, pagos, copia de seguridad y más. */

import { parseDate, todayISO } from '../../calc/keys';
import { moveAccount, setYear } from '../../calc/mutations';
import { accountOrder, inOrder } from '../../calc/order';
import type { Item } from '../../calc/types';
import { currentLocale, fmtDate, fmtDateTime, isLang, LANGS, langName, monthName, setLocale, t, type Lang } from '../../i18n';
import { saveLang } from '../lang';
import { exampleData } from '../../storage/example';
import { Sync } from '../../storage/sync';
import { exportBackup, importBackup } from '../backup-actions';
import { button, card, chip, empty, money, pageHeader, type ChipTone } from '../components';
import type { Ctx } from '../context';
import { openDialog } from '../dialog';
import { h, uid } from '../dom';
import { editAccount, editItem, editPayment } from '../forms';
import { icon } from '../icons';
import { canPromptInstall, isIOS, isStandalone, promptInstall } from '../install';
import { loadExample, startBlank } from '../notices';
import { syncCard } from '../sync-card';
import { applyTheme } from '../theme';
import { toast } from '../toast';
import { selectField } from '../fields';
import { openImport } from '../import-ai';
import { dragHandle, makeSortable } from '../sortable';

const TYPE_TONE: Record<Item['type'], ChipTone> = { Ingreso: 'income', Gasto: 'expense', Ahorro: 'saving' };

function monthsLabel(item: Item): string {
  if (item.from_month === 1 && item.to_month === 12) return t('item.months.all');
  if (item.from_month === item.to_month) return t('item.months.one', { month: monthName(item.from_month) });
  return t('item.months.range', { from: monthName(item.from_month, 'short'), to: monthName(item.to_month, 'short') });
}

function row(opts: { title: string; sub?: string; chips?: (HTMLElement | null)[]; value?: HTMLElement; onClick: () => void; label?: string; focusKey: string; handle?: HTMLElement }): HTMLElement {
  return h(
    'li',
    opts.handle ? { class: 'sortable-row', 'data-sort-group': 'accounts' } : null,
    opts.handle ?? null,
    h(
      'button',
      { type: 'button', class: 'row-btn', onclick: opts.onClick, 'aria-label': opts.label, 'data-focus-key': opts.focusKey },
      h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, opts.title, opts.chips ?? null), opts.sub ? h('span', { class: 'row-sub' }, opts.sub) : null),
      opts.value ?? null,
      icon('edit', 18),
    ),
  );
}

export function settingsView(ctx: Ctx, section?: string): HTMLElement {
  const { config } = ctx.data;
  const { meta, storage, persisted } = ctx.store.state;
  const accounts = config.accounts;
  const several = accounts.length > 1;

  // ── Año ──
  const yearCard = card(
    { title: t('settings.year'), id: 'year' },
    h(
      'div',
      { class: 'year-switch' },
      button(t('settings.year.prev'), { icon: 'prev', iconOnly: true, focusKey: 'year-prev', onClick: () => ctx.commit(setYear(ctx.data, config.year - 1)) }),
      h('output', { class: 'year-value', 'aria-live': 'polite' }, String(config.year)),
      button(t('settings.year.next'), { icon: 'next', iconOnly: true, focusKey: 'year-next', onClick: () => ctx.commit(setYear(ctx.data, config.year + 1)) }),
    ),
    h('p', { class: 'field-hint' }, t('settings.year.hint')),
  );

  // ── Cuentas ── (en el orden en que se ven en la tabla; se cambia arrastrando el asa)
  const accountList = h(
    'ul',
    { class: 'rows' },
    inOrder(accounts, accountOrder(config)).map(({ item: a, index: i }) =>
      row({
        title: a.name,
        sub: t('field.initial'),
        value: money(a.initial),
        focusKey: `account-${i}`,
        onClick: () => editAccount(ctx, i),
        handle: several ? dragHandle(t('settings.accounts.move', { name: a.name }), `account-move-${i}`) : undefined,
      }),
    ),
  );
  if (several) makeSortable(accountList, (_group, from, to) => ctx.commit(moveAccount(ctx.data, from, to)));
  const accountsCard = card(
    {
      title: t('settings.accounts'),
      sub: t('settings.accounts.sub'),
      id: 'accounts',
      actions: button(t('settings.accounts.add'), { icon: 'plus', kind: 'primary', focusKey: 'add-account', onClick: () => editAccount(ctx, null) }),
    },
    accountList,
    several ? h('p', { class: 'field-hint' }, t('settings.accounts.reorder')) : null,
    h('p', { class: 'field-hint privacy-hint' }, icon('info', 16), t('settings.accounts.noNumbers')),
  );

  // ── Conceptos ──
  const accName = (i: number) => (i === -1 ? t('field.to.outside') : (accounts[i]?.name ?? '—'));
  const order: Item['type'][] = ['Ingreso', 'Gasto', 'Ahorro'];
  const items = config.items.map((item, index) => ({ item, index })).sort((a, b) => order.indexOf(a.item.type) - order.indexOf(b.item.type) || a.index - b.index);
  const itemsCard = card(
    {
      title: t('settings.items'),
      sub: t('settings.items.sub'),
      id: 'items',
      actions: button(t('settings.items.add'), { icon: 'plus', kind: 'primary', focusKey: 'add-item', onClick: () => editItem(ctx, null) }),
    },
    items.length === 0
      ? empty(t('settings.items.empty'))
      : h(
          'ul',
          { class: 'rows' },
          items.map(({ item, index }) => {
            const where = item.type === 'Ahorro' ? t('item.arrow', { from: accName(item.account), to: accName(item.to) }) : several ? accName(item.account) : null;
            const signed = item.type === 'Ingreso' ? item.amount : -item.amount;
            return row({
              title: item.name,
              chips: [chip(item.type === 'Ahorro' ? t('type.Ahorro.short') : t(`type.${item.type}`), TYPE_TONE[item.type])],
              sub: [where, monthsLabel(item)].filter(Boolean).join(' · '),
              value: money(signed, { sign: item.type === 'Ingreso', tone: item.type === 'Ahorro' ? 'none' : 'auto' }),
              focusKey: `item-${index}`,
              onClick: () => editItem(ctx, index),
            });
          }),
        ),
  );

  // ── Pagos no mensuales ──
  const payments = config.payments.map((p, index) => ({ p, index })).sort((a, b) => (a.p.date < b.p.date ? -1 : a.p.date > b.p.date ? 1 : a.index - b.index));
  const thisYear = payments.filter(({ p }) => parseDate(p.date)?.year === config.year);
  const otherYears = payments.filter(({ p }) => parseDate(p.date)?.year !== config.year);
  const paymentRows = (list: typeof payments, withYear: boolean) =>
    h(
      'ul',
      { class: 'rows' },
      list.map(({ p, index }) =>
        row({
          title: p.concept,
          chips: [p.estimated ? chip(t('chip.estimated'), 'estimated') : null],
          sub: [fmtDate(p.date, { year: withYear, weekday: !withYear }), several ? accName(p.account) : null].filter(Boolean).join(' · '),
          value: money(-p.amount),
          focusKey: `payment-${index}`,
          onClick: () => editPayment(ctx, index),
        }),
      ),
    );
  const paymentsCard = card(
    {
      title: t('settings.payments'),
      sub: t('settings.payments.sub'),
      id: 'payments',
      actions: button(t('settings.payments.add'), { icon: 'plus', kind: 'primary', focusKey: 'add-payment', onClick: () => editPayment(ctx, null) }),
    },
    payments.length === 0 ? empty(t('settings.payments.empty')) : paymentRows(thisYear, false),
    otherYears.length ? [h('h3', { class: 'subhead' }, t('settings.payments.otherYear')), paymentRows(otherYears, true)] : null,
  );

  // ── Copia de seguridad ──
  // ── Filas libres de cada mes ──
  const names = Array.from(
    new Set([
      ...config.items.map((i) => i.name),
      ...Object.values(ctx.data.history ?? {}).flatMap((hm) => hm.rows.map((r) => r.l)),
    ]),
  ).filter(Boolean);
  const anchor = config.freeRowsBefore ?? '';
  const anchorField = selectField<string>({
    label: t('extras.anchor.label'),
    value: names.includes(anchor) ? anchor : '',
    options: [{ value: '', label: t('extras.anchor.end') }, ...names.map((n) => ({ value: n, label: n }))],
  });
  anchorField.select.setAttribute('data-focus-key', 'free-anchor');
  anchorField.select.addEventListener('change', () => {
    const v = anchorField.select.value;
    const { freeRowsBefore: _old, ...rest } = ctx.data.config;
    ctx.commit({ ...ctx.data, config: v ? { ...rest, freeRowsBefore: v } : rest });
  });
  const extrasCard = card({ title: t('extras.anchor.title'), sub: t('extras.anchor.sub'), id: 'filas-libres' }, anchorField.el);

  const backupCard = card(
    { title: t('settings.backup'), sub: t('settings.backup.sub'), id: 'backup' },
    h('p', { class: 'meta-line' }, meta.lastBackup ? t('settings.backup.last', { date: fmtDateTime(meta.lastBackup) }) : t('settings.backup.never')),
    h(
      'div',
      { class: 'button-row' },
      button(t('settings.backup.export'), { icon: 'download', kind: 'primary', onClick: () => void exportBackup(ctx) }),
      button(t('settings.backup.import'), { icon: 'upload', onClick: () => importBackup(ctx) }),
    ),
  );

  // ── Compartir ──
  const shareCard = card(
    { title: t('settings.share'), sub: t('settings.share.sub'), id: 'share' },
    h('div', { class: 'button-row' }, button(t('settings.share.button'), { icon: 'share', onClick: () => void shareApp() })),
  );

  // ── Instalar ──
  const installCard = card(
    { title: t('settings.install'), id: 'instalar' },
    isStandalone()
      ? h('p', null, t('settings.install.done'))
      : [
          canPromptInstall() ? h('div', { class: 'button-row' }, button(t('settings.install.button'), { icon: 'install', kind: 'primary', onClick: () => void promptInstall() })) : null,
          h('p', { class: isIOS() ? 'strong-line' : '' }, t('settings.install.ios')),
          h('p', { class: isIOS() ? '' : 'strong-line' }, t('settings.install.android')),
        ],
  );

  // ── Idioma ── (de este aparato; al cambiarlo se vuelve a abrir la app ya traducida)
  const lang = selectField<Lang>({
    label: t('settings.language'),
    options: LANGS.map((code) => ({ value: code, label: langName(code) })),
    value: currentLocale(),
    hint: t('settings.language.hint'),
  });
  lang.select.setAttribute('data-focus-key', 'language');
  // El título de la tarjeta ya dice «Idioma»: la etiqueta solo la leen los lectores de pantalla.
  lang.el.querySelector('label')?.classList.add('visually-hidden');
  lang.select.addEventListener('change', () => {
    const code = lang.select.value;
    if (!isLang(code) || code === currentLocale()) return;
    setLocale(code);
    // Si aún se ve el ejemplo (y no se comparte), se vuelve a crear en el idioma nuevo.
    // Los datos de cada uno no se tocan: los nombres que escribe no se traducen.
    if (ctx.data.config.example && !Sync.savedCode()) ctx.store.setData(exampleData(ctx.data.config.year, todayISO()));
    if (saveLang(code)) void ctx.store.saved().then(() => location.reload());
    else ctx.store.setMeta({});
  });
  const languageCard = card({ title: t('settings.language'), id: 'idioma' }, lang.el);

  // ── Apariencia ──
  const themeName = uid('theme');
  const current = meta.theme ?? 'auto';
  const themeCard = card(
    { title: t('settings.theme'), id: 'theme' },
    h(
      'fieldset',
      { class: 'field segmented-field' },
      h('legend', { class: 'visually-hidden' }, t('settings.theme')),
      h(
        'div',
        { class: 'segmented' },
        (['auto', 'light', 'dark'] as const).map((value) => {
          const id = uid();
          return [
            h('input', {
              type: 'radio',
              name: themeName,
              id,
              value,
              checked: value === current,
              onchange: () => {
                applyTheme(value);
                ctx.store.setMeta({ theme: value });
              },
            }),
            h('label', { for: id }, t(`settings.theme.${value}`)),
          ];
        }),
      ),
    ),
  );

  // ── Datos ──
  const dataCard = card(
    { title: t('settings.data'), id: 'data' },
    h(
      'div',
      { class: 'button-row' },
      button(t('settings.data.example'), { onClick: () => void loadExample(ctx) }),
      button(t('settings.data.blank'), { kind: 'danger', onClick: () => void startBlank(ctx, true) }),
    ),
  );

  // ── Privacidad ──
  const privacyCard = card(
    { title: t('settings.privacy'), id: 'privacy' },
    h('p', null, t('settings.privacy.text')),
    h('p', { class: storage === 'memory' ? 'warn-line' : 'meta-line' }, t(`settings.privacy.storage.${storage}`)),
    persisted ? h('p', { class: 'meta-line' }, t('settings.privacy.persisted')) : null,
    h('p', { class: 'meta-line' }, t('settings.version', { version: __APP_VERSION__ })),
  );

  const view = h(
    'div',
    { class: 'view view-settings' },
    pageHeader(t('settings.title')),
    languageCard,
    card(
      { title: t('settings.start.title'), id: 'empezar' },
      h(
        'div',
        { class: 'button-row' },
        button(t('import.button'), { icon: 'upload', kind: 'primary', onClick: () => openImport(ctx) }),
        button(t('guide.open'), { icon: 'info', onClick: () => ctx.go('#/guia') }),
      ),
      h(
        'div',
        { class: 'field field-check tabs-toggle' },
        h('input', {
          id: 'extra-tabs',
          type: 'checkbox',
          checked: meta.extraTabs === true,
          onchange: (ev: Event) => ctx.store.setMeta({ extraTabs: (ev.target as HTMLInputElement).checked }),
        }),
        h('label', { for: 'extra-tabs' }, t('settings.extraTabs')),
      ),
    ),
    yearCard,
    accountsCard,
    itemsCard,
    paymentsCard,
    extrasCard,
    syncCard(ctx),
    backupCard,
    shareCard,
    installCard,
    themeCard,
    dataCard,
    privacyCard,
  );

  if (section) requestAnimationFrame(() => document.getElementById(section)?.scrollIntoView({ block: 'start' }));
  return view;
}

/** Comparte solo el enlace de la app (nunca datos). */
async function shareApp(): Promise<void> {
  const url = `${location.origin}${location.pathname}`;
  const title = t('app.name');
  if (navigator.share) {
    try {
      await navigator.share({ title, text: t('settings.share.text'), url });
      return;
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast(t('settings.share.copied'));
  } catch {
    const id = uid('url');
    const input = h('input', { id, type: 'url', readonly: true, value: url });
    openDialog({
      title: t('settings.share'),
      content: [h('label', { for: id }, t('settings.share.sub')), input],
      actions: [{ label: t('action.close'), submit: true }],
    });
    input.select();
  }
}
