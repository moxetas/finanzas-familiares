/**
 * Avisos con la app cerrada (Web Push) para cualquier familia, como en Menú familiar.
 * Cada móvil se apunta en `/subs/<huella de la familia>/f_<móvil>` y el servicio de
 * avisos (repositorio moxetas/avisos-familia, cada hora) le manda los avisos que la app
 * dejó cifrados en la cola (ver src/storage/avisos-cola.ts). Funciona en iPhone
 * (iOS 16.4 o posterior, abriendo la app desde la pantalla de inicio) y en Android.
 * Hace falta tener activada la sincronización (el código de familia).
 */

import { APP, VAPID_PUBLIC, famId, saveKeyForWorker } from '../storage/avisos-cola';
import { dbFor } from '../storage/sync';

const INFO_LS = 'finanzas-familiares:push';
const DEVICE_LS = 'finanzas-familiares:dispositivo';

export interface PushInfo {
  id: string;
  dispositivo: string;
  /** 2 = apuntado en el servicio de avisos para todas las familias. */
  v?: number;
}

async function req(url: string, method = 'GET', body?: unknown): Promise<unknown> {
  const res = await fetch(url, method === 'GET' ? { cache: 'no-store' } : { method, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Firebase ${res.status}`);
  return res.json();
}

const subUrl = async (code: string, id: string): Promise<string> => `${dbFor(code)}/subs/${await famId(code)}/${APP}_${id}.json`;

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

/** Apunta este móvil (sin pedir permiso: eso lo hace `enablePush`). */
async function register(code: string): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  const current = sub?.options?.applicationServerKey;
  // Los móviles apuntados antes usaban las claves de cada familia: se cambian por las del servicio.
  if (sub && (!current || b64url(current) !== VAPID_PUBLIC)) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64url(VAPID_PUBLIC) });
  const json = sub.toJSON();
  const info: PushInfo = { id: deviceId(), dispositivo: deviceName(), v: 2 };
  await saveKeyForWorker(code);
  await req(await subUrl(code, info.id), 'PUT', { e: json.endpoint, k: json.keys, a: APP, d: info.dispositivo, t: Date.now() });
  localStorage.setItem(INFO_LS, JSON.stringify(info));
}

export async function enablePush(code: string): Promise<'ok' | 'denied'> {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return 'denied';
  await register(code);
  return 'ok';
}

/**
 * Al abrir la app: los móviles que tenían los avisos del sistema de antes (solo para la
 * familia de Moxetas) se pasan solos al servicio nuevo, y se borra lo de antes.
 */
export async function upgradePush(code: string | null): Promise<void> {
  const info = pushInfo();
  if (!code || !info || info.v === 2 || !pushSupported() || Notification.permission !== 'granted') return;
  await register(code);
  const base = `${dbFor(code)}/familias/${code}`;
  await req(`${base}/finanzas-push/${info.id}.json`, 'DELETE').catch(() => undefined);
  // Las claves de antes estaban guardadas con la familia: ya no hacen falta.
  await req(`${base}/vapid.json`, 'DELETE').catch(() => undefined);
}

export async function disablePush(code: string | null): Promise<void> {
  const info = pushInfo();
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
    if (info && code) await req(await subUrl(code, info.id), 'DELETE');
  } catch {
    /* aunque falle, se olvida en este móvil */
  }
  try {
    localStorage.removeItem(INFO_LS);
  } catch {
    /* nada */
  }
}

export async function testPush(title: string, body: string): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification(title, { body, icon: 'icons/icon-192.png', tag: 'prueba' });
}

/** Cuándo pasó por última vez el servicio de avisos (milisegundos), o `null`. */
export async function lastServerRun(code: string): Promise<number | null> {
  const s = (await req(`${dbFor(code)}/estado-avisos.json`)) as { ultimaVez?: number } | null;
  return typeof s?.ultimaVez === 'number' ? s.ultimaVez : null;
}
