/** Iconos de trazo simple (24×24), dibujados a mano para no depender de librerías. */

import { s } from './dom';

const PATHS = {
  summary: ['M4 20V10', 'M10 20V4', 'M16 20v-7', 'M22 20H2'],
  months: ['M3 5h18v16H3z', 'M3 10h18', 'M8 3v4', 'M16 3v4', 'M9 10v11', 'M15 10v11'],
  alerts: ['M6 9a6 6 0 0 1 12 0c0 6 2.5 8 2.5 8h-17S6 15 6 9z', 'M10 20.5a2.2 2.2 0 0 0 4 0'],
  settings: ['M4 6h10', 'M18 6h2', 'M4 12h4', 'M12 12h8', 'M4 18h12', 'M20 18h0', 'M16 4v4', 'M10 10v4', 'M18 16v4'],
  prev: ['M15 5l-7 7 7 7'],
  next: ['M9 5l7 7-7 7'],
  plus: ['M12 5v14', 'M5 12h14'],
  download: ['M12 4v11', 'M7 10l5 5 5-5', 'M5 20h14'],
  upload: ['M12 20V9', 'M7 14l5-5 5 5', 'M5 4h14'],
  share: ['M12 3v12', 'M8 7l4-4 4 4', 'M6 11H5v10h14V11h-1'],
  trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13'],
  edit: ['M4 20h4L19 9l-4-4L4 16z', 'M13 7l4 4'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  install: ['M12 3v11', 'M8 10l4 4 4-4', 'M5 15v5h14v-5'],
  info: ['M12 11v6', 'M12 7.5v.5', 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z'],
  arrow: ['M5 12h14', 'M13 6l6 6-6 6'],
} as const;

export type IconName = keyof typeof PATHS;

export function icon(name: IconName, size = 22): SVGSVGElement {
  return s(
    'svg',
    {
      class: 'icon',
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 1.8,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
      focusable: 'false',
    },
    PATHS[name].map((d) => s('path', { d })),
  );
}
