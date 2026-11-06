/**
 * Ayudas mínimas para crear elementos. Todo el texto se pone con nodos de
 * texto (nunca con innerHTML), así que nada de lo que escribe el usuario o
 * viene en una copia importada se interpreta como HTML.
 */

export type Child = Node | string | number | null | undefined | false | Child[];

type Handler = (ev: Event) => void;
export type Attrs = Record<string, string | number | boolean | null | undefined | Handler>;

function append(parent: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(parent, c);
    else if (c instanceof Node) parent.appendChild(c);
    else parent.appendChild(document.createTextNode(String(c)));
  }
}

function setAttrs(el: Element, attrs: Attrs | null | undefined): void {
  if (!attrs) return;
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value as Handler);
    } else if (key === 'value' && 'value' in el) {
      (el as HTMLInputElement).value = String(value);
    } else if (key === 'checked' && 'checked' in el) {
      (el as HTMLInputElement).checked = Boolean(value);
    } else if (value === true) {
      el.setAttribute(key, '');
    } else {
      el.setAttribute(key, String(value));
    }
  }
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Attrs | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  setAttrs(el, attrs);
  append(el, children);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function s<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Attrs | null,
  ...children: Child[]
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  setAttrs(el, attrs);
  append(el, children);
  return el;
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

let idCounter = 0;
/** Id único para enlazar etiquetas y campos. */
export function uid(prefix = 'f'): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

/** ¿Pide el sistema menos animaciones? */
export function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
