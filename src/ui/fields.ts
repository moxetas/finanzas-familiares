/** Campos de formulario con etiqueta, ayuda y mensaje de error accesibles. */

import { parseAmount } from '../calc/money';
import { fmtInput, monthName, t } from '../i18n';
import { h, uid, type Child } from './dom';

interface FieldBase {
  label: string;
  hint?: string;
  optional?: boolean;
}

export type Result<T> = { ok: true; value: T } | { ok: false };

export interface Field<T> {
  el: HTMLElement;
  /** Lee el valor; si no es válido, muestra el error y devuelve `{ ok: false }`. */
  read(): Result<T>;
  focus(): void;
}

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const bad: Result<never> = { ok: false };

function frame(id: string, base: FieldBase, control: HTMLElement, target: HTMLElement = control, extraClass = '') {
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const error = h('p', { class: 'field-error', id: errId, hidden: true });
  const describedBy = [base.hint ? hintId : null, errId].filter(Boolean).join(' ');
  target.setAttribute('aria-describedby', describedBy);
  const el = h(
    'div',
    { class: `field ${extraClass}`.trim() },
    h('label', { for: id }, base.label, base.optional ? h('span', { class: 'optional' }, ` ${t('field.optional')}`) : null),
    control,
    base.hint ? h('p', { class: 'field-hint', id: hintId }, base.hint) : null,
    error,
  );
  const setError = (msg: string | null) => {
    error.hidden = !msg;
    error.textContent = msg ?? '';
    if (msg) target.setAttribute('aria-invalid', 'true');
    else target.removeAttribute('aria-invalid');
  };
  return { el, setError };
}

export function textField(opts: FieldBase & { value?: string; maxlength?: number; placeholder?: string; multiline?: boolean }): Field<string> {
  const id = uid();
  const input = opts.multiline
    ? h('textarea', { id, rows: 2, maxlength: opts.maxlength ?? 300 })
    : h('input', { id, type: 'text', autocomplete: 'off', maxlength: opts.maxlength ?? 60, placeholder: opts.placeholder, enterkeyhint: 'next' });
  input.value = opts.value ?? '';
  const { el, setError } = frame(id, opts, input);
  input.addEventListener('input', () => setError(null));
  return {
    el,
    focus: () => input.focus(),
    read() {
      const v = input.value.replace(/\s+/g, ' ').trim();
      if (!v && !opts.optional) {
        setError(t('field.required'));
        return bad;
      }
      setError(null);
      return ok(v);
    },
  };
}

/** Importe en texto libre: admite «12,50», «1.234,56», «-20»… */
export function amountField(opts: FieldBase & { value?: number | null; allowNegative?: boolean; placeholder?: string }): Field<number | null> & { input: HTMLInputElement } {
  const id = uid();
  const input = h('input', {
    id,
    type: 'text',
    inputmode: 'decimal',
    autocomplete: 'off',
    class: 'num-input',
    placeholder: opts.placeholder ?? '0,00',
    enterkeyhint: 'done',
  });
  input.value = opts.value === null || opts.value === undefined ? '' : fmtInput(opts.value);
  const wrap = h('div', { class: 'amount-wrap' }, input, h('span', { class: 'amount-unit', 'aria-hidden': 'true' }, '€'));
  const { el, setError } = frame(id, opts, wrap, input);
  input.addEventListener('input', () => setError(null));
  return {
    el,
    input,
    focus: () => input.focus(),
    read() {
      if (input.value.trim() === '' && opts.optional) {
        setError(null);
        return ok(null);
      }
      const n = parseAmount(input.value);
      if (n === null || (!opts.allowNegative && n < 0)) {
        setError(t('field.badAmount'));
        return bad;
      }
      setError(null);
      return ok(n);
    },
  };
}

export function selectField<V extends string | number>(opts: FieldBase & { options: { value: V; label: string }[]; value: V }): Field<V> & { select: HTMLSelectElement } {
  const id = uid();
  const select = h(
    'select',
    { id },
    opts.options.map((o) => h('option', { value: String(o.value), selected: o.value === opts.value }, o.label)),
  );
  const { el } = frame(id, opts, select);
  return {
    el,
    select,
    focus: () => select.focus(),
    read() {
      const found = opts.options.find((o) => String(o.value) === select.value);
      return ok(found ? found.value : opts.value);
    },
  };
}

export function monthField(opts: FieldBase & { value: number }): Field<number> & { select: HTMLSelectElement } {
  return selectField({
    ...opts,
    options: Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: monthName(i + 1) })),
  });
}

export function dateField(opts: FieldBase & { value: string; min?: string; max?: string }): Field<string> {
  const id = uid();
  const input = h('input', { id, type: 'date', min: opts.min, max: opts.max });
  input.value = opts.value;
  const { el, setError } = frame(id, opts, input);
  input.addEventListener('input', () => setError(null));
  return {
    el,
    focus: () => input.focus(),
    read() {
      const v = input.value;
      if (!v) {
        if (opts.optional) return ok('');
        setError(t('field.badDate'));
        return bad;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || (opts.min && v < opts.min) || (opts.max && v > opts.max)) {
        setError(t('field.badDate'));
        return bad;
      }
      setError(null);
      return ok(v);
    },
  };
}

export function checkboxField(opts: { label: string; checked: boolean }): Field<boolean> {
  const id = uid();
  const input = h('input', { id, type: 'checkbox', checked: opts.checked });
  const el = h('div', { class: 'field field-check' }, input, h('label', { for: id }, opts.label));
  return { el, focus: () => input.focus(), read: () => ok(input.checked) };
}

/** Grupo de opciones tipo botones segmentados (radio accesible). */
export function segmentedField<V extends string>(opts: {
  label: string;
  options: { value: V; label: string; hint?: string }[];
  value: V;
  onChange?: (v: V) => void;
}): Field<V> {
  const name = uid('seg');
  const hint = h('p', { class: 'field-hint', 'aria-live': 'polite' });
  const setHint = (v: V) => {
    hint.textContent = opts.options.find((o) => o.value === v)?.hint ?? '';
  };
  const inputs: HTMLInputElement[] = [];
  const group = h(
    'fieldset',
    { class: 'field segmented-field' },
    h('legend', null, opts.label),
    h(
      'div',
      { class: 'segmented' },
      opts.options.map((o) => {
        const id = uid();
        const input = h('input', {
          type: 'radio',
          name,
          id,
          value: o.value,
          checked: o.value === opts.value,
          onchange: () => {
            setHint(o.value);
            opts.onChange?.(o.value);
          },
        });
        inputs.push(input);
        return [input, h('label', { for: id }, o.label)] as Child;
      }),
    ),
    hint,
  );
  setHint(opts.value);
  return {
    el: group,
    focus: () => inputs.find((i) => i.checked)?.focus(),
    read: () => ok((inputs.find((i) => i.checked)?.value as V | undefined) ?? opts.value),
  };
}

type Values<T> = { [K in keyof T]: T[K] extends Field<infer V> ? V : never };

/** Lee varios campos; si alguno falla devuelve `null` y enfoca el primero con error. */
export function readAll<T extends Record<string, Field<unknown>>>(fields: T): Values<T> | null {
  const out: Record<string, unknown> = {};
  let firstBad: Field<unknown> | null = null;
  for (const [key, field] of Object.entries(fields)) {
    const r = field.read();
    if (r.ok) out[key] = r.value;
    else firstBad ??= field;
  }
  if (firstBad) {
    firstBad.focus();
    return null;
  }
  return out as Values<T>;
}
