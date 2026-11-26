/** Botón «PDF del mes»: hace el desglose del mes y lo comparte o lo descarga. */

import { currentLocale, t } from '../i18n';
import { monthReport, reportFileName } from '../report/month-report';
import { reportPdf } from '../report/pdf';
import { button } from './components';
import type { Ctx } from './context';
import { h } from './dom';
import { toast } from './toast';

let busy = false;

export function monthPdfButton(ctx: Ctx, ym: string): HTMLElement {
  return h(
    'div',
    { class: 'button-row page-actions' },
    button(t('report.button'), { icon: 'download', focusKey: 'month-pdf', onClick: () => void makeMonthPdf(ctx, ym) }),
  );
}

export async function makeMonthPdf(ctx: Ctx, ym: string): Promise<void> {
  if (busy) return;
  const report = monthReport(ctx.data, ym);
  if (!report) return;
  busy = true;
  toast(t('report.making'));
  try {
    const blob = await reportPdf(report, currentLocale() === 'ar');
    await saveFile(blob, reportFileName(ym));
  } catch {
    toast(t('report.error'));
  } finally {
    busy = false;
  }
}

/** En el móvil, «Compartir» (guardar en Archivos, enviar por WhatsApp…); si no, descarga. */
async function saveFile(blob: Blob, name: string): Promise<void> {
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (mobile && typeof File !== 'undefined' && navigator.canShare) {
    const file = new File([blob], name, { type: blob.type });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        return;
      } catch (e) {
        if ((e as DOMException).name === 'AbortError') return;
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name, hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  toast(t('report.saved'));
}
