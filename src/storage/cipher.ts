/**
 * Cifrado de extremo a extremo de lo que se sincroniza.
 *
 * La clave sale del código de familia (HKDF-SHA-256) y nunca sale del móvil. En la
 * nube solo se guardan textos cifrados (AES-GCM): ni el dueño de la base de datos ni
 * nadie sin el código puede leerlos. Cada valor se guarda como `c1.<iv+cifrado en base64url>`.
 *
 * El proceso de avisos de GitHub (.github/scripts/avisos.mjs) usa la misma derivación.
 */

export const SEALED_PREFIX = 'c1.';
const SALT = 'finanzas-familiares/cifrado/v1';
const enc = new TextEncoder();
const dec = new TextDecoder();

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

const cache = new Map<string, Promise<CryptoKey>>();

/** Clave AES de la familia a partir del código (con o sin guiones). */
export function familyKey(code: string): Promise<CryptoKey> {
  const clean = code.toLowerCase().replace(/[^a-z0-9]/g, '');
  let key = cache.get(clean);
  if (!key) {
    key = crypto.subtle
      .importKey('raw', enc.encode(clean), 'HKDF', false, ['deriveKey'])
      .then((base) =>
        crypto.subtle.deriveKey(
          { name: 'HKDF', hash: 'SHA-256', salt: enc.encode(SALT), info: enc.encode('datos') },
          base,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt'],
        ),
      );
    cache.set(clean, key);
  }
  return key;
}

export async function seal(key: CryptoKey, value: string | number): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(value))));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return SEALED_PREFIX + b64url(out);
}

export const isSealed = (v: unknown): v is string => typeof v === 'string' && v.startsWith(SEALED_PREFIX);

/** Descifra un valor; `undefined` si no está cifrado o no se puede descifrar con esta clave. */
export async function unseal(key: CryptoKey, v: unknown): Promise<string | number | undefined> {
  if (!isSealed(v)) return undefined;
  try {
    const bytes = fromB64url(v.slice(SEALED_PREFIX.length));
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12));
    const parsed: unknown = JSON.parse(dec.decode(plain));
    return typeof parsed === 'string' || (typeof parsed === 'number' && Number.isFinite(parsed)) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** Cifra todos los valores de un objeto (los `null` se quedan: significan «borrar»). */
export async function sealAll<T extends string | number | null>(key: CryptoKey, obj: Record<string, T>): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  await Promise.all(Object.entries(obj).map(async ([k, v]) => (out[k] = v === null ? null : await seal(key, v))));
  return out;
}

/**
 * Descifra todos los valores. Los que no están cifrados (datos de antes del cifrado)
 * se aceptan tal cual; los cifrados que no se pueden abrir se descartan.
 */
export async function unsealAll(key: CryptoKey, obj: Record<string, string | number>): Promise<{ values: Record<string, string | number>; plain: number }> {
  const values: Record<string, string | number> = {};
  let plain = 0;
  await Promise.all(
    Object.entries(obj).map(async ([k, v]) => {
      if (isSealed(v)) {
        const open = await unseal(key, v);
        if (open !== undefined) values[k] = open;
      } else {
        values[k] = v;
        plain++;
      }
    }),
  );
  return { values, plain };
}
