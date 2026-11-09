/**
 * Avisos con la app cerrada (Web Push), como en Menú familiar: cada móvil se
 * apunta en Firebase (/familias/<código>/finanzas-push/<móvil>) y un proceso de
 * GitHub que se ejecuta cada hora (.github/workflows/avisos.yml) envía los
 * avisos de los pagos. Funciona en iPhone (iOS 16.4 o posterior, abriendo la
 * app desde la pantalla de inicio) y en Android.
 * Hace falta tener activada la sincronización (el código de familia).
 * Cada móvil guarda también su idioma (`lang`), para recibir los avisos en él.
 */

import { currentLocale } from '../i18n';
import { FIREBASE_DB } from '../storage/sync';

const INFO_LS = 'finanzas-familiares:push';
const DEVICE_LS = 'finanzas-familiares:dispositivo';

export interface PushInfo {
  id: string;
  dispositivo: string;
}

async function raw(code: string, path: string, method = 'GET', body?: unknown): Promise<unknown> {
  const res = await fetch(`${FIREBASE_DB}/familias/${code}/${path}.json`, method === 'GET' ? { cache: 'no-store' } : { method, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Firebase ${res.status}`);
  return res.json();
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function pushInfo(): PushInfo | null {
  try {
    return JSON.parse(localStorage.getItem(INFO_LS) ?? 'null') as PushInfo | null;
  } catch {
    return null;
  }
}

function deviceId(): string {
  let id: string | null = null;
  try {
    id = localStorage.getItem(DEVICE_LS);
  } catch {
    /* sin localStorage */
  }
  if (!id) {
    id = Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => b.toString(16).padStart(2, '0')).join('');
    try {
      localStorage.setItem(DEVICE_LS, id);
    } catch {
      /* sin localStorage */
    }
  }
  return id;
}

function deviceName(): string {
  const ua = navigator.userAgent;
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return 'Android';
  return 'ordenador';
}

const b64url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (ch) => ch.charCodeAt(0));

/** Claves para firmar los avisos (VAPID): las de la familia, compartidas con Menú familiar; si no hay, se crean. */
async function vapidKey(code: string): Promise<string> {
  let pub = (await raw(code, 'vapid/publicKey')) as string | null;
  if (pub) return pub;
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const mine = b64url(await crypto.subtle.exportKey('raw', kp.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  await raw(code, 'vapid', 'PUT', { publicKey: mine, privateKey: jwk.d, creada: Date.now() });
  // Por si otro móvil las ha creado a la vez: se usa la que quede guardada.
  await new Promise((r) => setTimeout(r, 1200));
  pub = (await raw(code, 'vapid/publicKey')) as string | null;
  return pub ?? mine;
}

export async function enablePush(code: string): Promise<'ok' | 'denied'> {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return 'denied';
  const reg = await navigator.serviceWorker.ready;
  const pub = await vapidKey(code);
  let sub = await reg.pushManager.getSubscription();
  const current = sub?.options?.applicationServerKey;
  if (sub && (!current || b64url(current) !== pub)) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64url(pub) });
  const json = sub.toJSON();
  const info: PushInfo = { id: deviceId(), dispositivo: deviceName() };
  await raw(code, `finanzas-push/${info.id}`, 'PUT', { endpoint: json.endpoint, keys: json.keys, dispositivo: info.dispositivo, lang: currentLocale(), desde: Date.now() });
  localStorage.setItem(INFO_LS, JSON.stringify(info));
  return 'ok';
}

export async function disablePush(code: string | null): Promise<void> {
  const info = pushInfo();
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
    if (info && code) await raw(code, `finanzas-push/${info.id}`, 'DELETE');
  } catch {
    /* aunque falle, se olvida en este móvil */
  }
  try {
    localStorage.removeItem(INFO_LS);
  } catch {
    /* nada */
  }
}

/** Al cambiar de idioma: los avisos de este móvil llegarán en el idioma nuevo. */
export async function setPushLang(code: string | null, lang: string): Promise<void> {
  const info = pushInfo();
  if (!info || !code) return;
  await raw(code, `finanzas-push/${info.id}/lang`, 'PUT', lang);
}

export async function testPush(title: string, body: string): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification(title, { body, icon: 'icons/icon-192.png', tag: 'prueba' });
}

/** Cuándo pasó por última vez el servicio de avisos (milisegundos), o `null`. */
export async function lastServerRun(code: string): Promise<number | null> {
  const s = (await raw(code, 'finanzas-servidor')) as { ultimaVez?: number } | null;
  return typeof s?.ultimaVez === 'number' ? s.ultimaVez : null;
}
