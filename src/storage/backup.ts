/**
 * Copia de seguridad: exportar e importar un archivo JSON.
 * El archivo tiene la misma forma que el modelo de datos, más una cabecera.
 */

import type { AppData } from '../calc/types';
import { sanitizeData } from './sanitize';

export const BACKUP_APP = 'finanzas-familiares';
export const BACKUP_VERSION = 1;
/** Un archivo de copia normal ocupa unos pocos KB; 5 MB es más que de sobra. */
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

export interface BackupFile extends AppData {
  app: typeof BACKUP_APP;
  version: number;
  exported_at: string;
}

export type BackupErrorCode = 'too-big' | 'not-json' | 'not-backup' | 'newer-version';

export class BackupError extends Error {
  constructor(public readonly code: BackupErrorCode) {
    super(code);
    this.name = 'BackupError';
  }
}

export function toBackup(data: AppData, now: Date = new Date()): BackupFile {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exported_at: now.toISOString(),
    config: data.config,
    overrides: data.overrides,
    real_balances: data.real_balances,
    entries: data.entries,
  };
}

export function serializeBackup(data: AppData, now: Date = new Date()): string {
  return JSON.stringify(toBackup(data, now), null, 2);
}

/** Nombre del archivo: `finanzas-familiares-AAAA-MM-DD.json`. */
export function backupFileName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `finanzas-familiares-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

/**
 * Lee un archivo de copia. Acepta el formato de esta app (con o sin cabecera)
 * y lo limpia con `sanitizeData`. Lanza `BackupError` si no sirve.
 */
export function parseBackup(text: string, fallbackYear: number, defaultAccountName: string): AppData {
  if (text.length > MAX_BACKUP_BYTES) throw new BackupError('too-big');
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    throw new BackupError('not-json');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new BackupError('not-backup');
  let obj = raw as Record<string, unknown>;
  // También vale { data: { config, ... } }.
  if (!('config' in obj) && typeof obj['data'] === 'object' && obj['data'] !== null) {
    obj = obj['data'] as Record<string, unknown>;
  }
  const config = obj['config'];
  if (typeof config !== 'object' || config === null || !Array.isArray((config as Record<string, unknown>)['accounts'])) {
    throw new BackupError('not-backup');
  }
  const version = (raw as Record<string, unknown>)['version'];
  if (typeof version === 'number' && version > BACKUP_VERSION) throw new BackupError('newer-version');
  return sanitizeData(obj, fallbackYear, defaultAccountName);
}
