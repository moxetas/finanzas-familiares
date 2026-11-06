/** Domiciliaciones: lista de cobros fijos con su cuenta (solo lectura). */

import { fmtNumber, t } from '../../i18n';
import { card, empty, pageHeader } from '../components';
import type { Ctx } from '../context';
import { h } from '../dom';

export function domView(ctx: Ctx): HTMLElement {
  const dom = ctx.data.domiciliaciones;
  if (!dom) return h('div', { class: 'view view-dom' }, pageHeader(t('dom.title'), t('dom.sub')), empty(t('dom.empty')));
  const accounts = dom.accounts.length
    ? card(
        { title: t('dom.accounts'), id: 'dom-accounts' },
        h('ul', { class: 'rows' }, dom.accounts.map((a) => h('li', null, h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, a.alias), a.name && a.name !== a.alias ? h('span', { class: 'row-sub' }, a.name) : null)))),
      )
    : null;
  const groups = dom.groups.map((g, gi) =>
    card(
      { title: g.title, id: `dom-${gi}` },
      h(
        'div',
        { class: 'table-wrap', 'data-scroll-key': `dom-${gi}` },
        h(
          'table',
          { class: 'grid-table dom-table' },
          h('thead', null, h('tr', null, [t('dom.col.n'), t('dom.col.concept'), t('dom.col.ticker'), t('dom.col.cost'), t('dom.col.from'), t('dom.col.to')].map((c, i) => h('th', { scope: 'col', class: i === 3 ? 'n' : '' }, c)))),
          h(
            'tbody',
            null,
            g.rows.map((r) =>
              h(
                'tr',
                null,
                h('td', { class: 'muted' }, r.n === null ? '' : String(r.n)),
                h('th', { scope: 'row' }, h('span', { class: 'line-name' }, r.c)),
                h('td', { class: 'muted' }, r.t),
                h('td', { class: 'n' }, r.cost === null ? '' : fmtNumber(r.cost)),
                h('td', null, r.from),
                h('td', null, r.to),
              ),
            ),
          ),
        ),
      ),
    ),
  );
  return h('div', { class: 'view view-dom' }, pageHeader(t('dom.title'), t('dom.sub')), accounts, groups);
}
