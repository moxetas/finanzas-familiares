/** Domiciliaciones: los recibos fijos, cuánto son y de qué cuenta salen. Se pueden añadir, cambiar y borrar. */

import { fmtMoney, t } from '../../i18n';
import { button, card, empty, pageHeader } from '../components';
import type { Ctx } from '../context';
import { h } from '../dom';
import { editDomRow } from '../forms';
import { icon } from '../icons';

export function domView(ctx: Ctx): HTMLElement {
  const dom = ctx.data.domiciliaciones;
  const add = button(t('dom.add'), { icon: 'plus', kind: 'primary', focusKey: 'dom-add', onClick: () => editDomRow(ctx, null) });
  const head = [pageHeader(t('dom.title'), t('dom.sub')), h('div', { class: 'button-row page-actions' }, add)];
  if (!dom || dom.groups.length === 0) return h('div', { class: 'view view-dom' }, head, card({}, empty(t('dom.empty'))));

  const accounts = dom.accounts.length
    ? card(
        { title: t('dom.accounts'), id: 'dom-accounts' },
        h('ul', { class: 'rows' }, dom.accounts.map((a) => h('li', null, h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, a.alias), a.name && a.name !== a.alias ? h('span', { class: 'row-sub' }, a.name) : null)))),
      )
    : null;

  const groups = dom.groups.map((g, gi) =>
    card(
      {
        title: g.title,
        id: `dom-${gi}`,
        actions: button(t('dom.add'), { icon: 'plus', iconOnly: true, focusKey: `dom-add-${gi}`, onClick: () => editDomRow(ctx, null, g.title) }),
      },
      h(
        'ul',
        { class: 'rows' },
        g.rows.map((r, ri) => {
          const where = r.from && r.to && r.to !== r.from ? t('dom.arrow', { from: r.from, to: r.to }) : r.from || r.to;
          return h(
            'li',
            null,
            h(
              'button',
              { type: 'button', class: 'row-btn', 'data-focus-key': `dom-${gi}-${ri}`, onclick: () => editDomRow(ctx, { g: gi, r: ri }) },
              h('span', { class: 'row-date' }, r.n === null ? String(ri + 1) : String(r.n)),
              h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, r.c), h('span', { class: 'row-sub' }, [where, r.t].filter(Boolean).join(' · '))),
              r.cost === null ? null : h('span', { class: 'num' }, fmtMoney(r.cost)),
              icon('edit', 18),
            ),
          );
        }),
      ),
    ),
  );
  return h('div', { class: 'view view-dom' }, head, accounts, groups);
}
