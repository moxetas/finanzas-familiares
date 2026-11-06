/** Botones de exportar e importar la copia de seguridad. */

import { BackupError, backupFileName, parseBackup, serializeBackup } from '../storage/backup';
import { t } from '../i18n';
import type { Ctx } from './context';
import { confirmDialog } from './dialog';
import { h } from './dom';
import { isIOS } from './install';
import { toast } from './toast';

/** Descarga (o comparte, en iPhone) el archivo JSON con todos los datos. */
export async function exportBackup(ctx: Ctx): Promise<void> {
  const now = new Date();
  const text = serializeBackup(ctx.data, now);
  const name = backupFileName(now);
  const blob = new Blob([text], { type: 'application/json' });

  // En iPhone, «Compartir → Guardar en Archivos» es lo más fiable.
  if (isIOS() && typeof File !== 'undefined' && navigator.canShare) {
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        done(ctx, now);
      } catch (e) {
        if ((e as DOMException).name !== 'AbortError') download(blob, name, ctx, now);
      }
      return;
    }
  }
  download(blob, name, ctx, now);
}

function download(blob: Blob, name: string, ctx: Ctx, now: Date): void {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name, hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  done(ctx, now);
}

function done(ctx: Ctx, now: Date): void {
  ctx.store.setMeta({ lastBackup: now.toISOString() });
  toast(t('toast.exported'));
}

/** Abre el selector de archivos y, si el usuario confirma, sustituye los datos. */
export function importBackup(ctx: Ctx): void {
  const input = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch {
      toast(t('backup.error.read'));
      return;
    }
    try {
      const data = parseBackup(text, new Date().getFullYear(), t('account.defaultName'));
      const yes = await confirmDialog({ text: t('confirm.import', { file: file.name }), yes: t('confirm.yes.import'), danger: true });
      if (yes) {
        ctx.commit(data, t('toast.imported'));
        ctx.go('#/resumen');
      }
    } catch (e) {
      const code = e instanceof BackupError ? e.code : 'not-backup';
      toast(t(`backup.error.${code}`), { duration: 6000 });
    }
  });
  document.body.append(input);
  input.click();
}
