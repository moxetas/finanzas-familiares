import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blankData, type AppData } from '../src/calc';
import { familyKey, isSealed, seal, unseal } from '../src/storage/cipher';
import { flatten, Sync } from '../src/storage/sync';

const CODE = 'abcd-efgh-jkmn-pqrs-tuvw';

describe('cifrado', () => {
  it('cifra y descifra; con otro código no se puede abrir', async () => {
    const k = await familyKey(CODE);
    const s = await seal(k, 'Seguro del coche 410 €');
    expect(isSealed(s)).toBe(true);
    expect(s).not.toContain('Seguro');
    expect(await unseal(k, s)).toBe('Seguro del coche 410 €');
    expect(await unseal(await familyKey('abcdefghjkmnpqrstuvw'), s)).toBe('Seguro del coche 410 €'); // con o sin guiones
    expect(await unseal(await familyKey('zzzz-zzzz-zzzz-zzzz-zzzz'), s)).toBeUndefined();
    expect(await unseal(k, await seal(k, 12.5))).toBe(12.5);
  });
});

/** Firebase de mentira en memoria: GET/PUT/PATCH/DELETE sobre rutas `.json`. */
function fakeFirebase() {
  const root: Record<string, unknown> = {};
  const parts = (url: string) => new URL(url).pathname.replace(/\.json$/, '').split('/').filter(Boolean);
  const get = (p: string[]) => p.reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), root);
  const set = (p: string[], v: unknown) => {
    let o = root as Record<string, unknown>;
    for (const k of p.slice(0, -1)) o = (o[k] ??= {}) as Record<string, unknown>;
    if (v === null) delete o[p[p.length - 1]!];
    else o[p[p.length - 1]!] = v;
  };
  const fetchMock = vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    const p = parts(url);
    const method = init?.method ?? 'GET';
    if (method === 'PUT') set(p, JSON.parse(init!.body!));
    else if (method === 'DELETE') set(p, null);
    else if (method === 'PATCH') {
      const body = JSON.parse(init!.body!) as Record<string, unknown>;
      for (const [k, v] of Object.entries(body)) set([...p, ...k.split('/')], v);
    }
    return { ok: true, status: 200, json: async () => get(p) ?? null } as Response;
  });
  return { root, fetchMock, get: (path: string) => get(path.split('/')) };
}

function host(initial: AppData) {
  let data = initial;
  return {
    getData: () => data,
    replaceData: (d: AppData) => (data = d),
    fallbackYear: () => 2027,
    accountName: () => 'Cuenta',
    get data() {
      return data;
    },
  };
}

const mine = (): AppData => {
  const d = blankData(2027, 'Banco');
  return { ...d, config: { ...d.config, payments: [{ date: '2027-03-01', concept: 'Seguro del coche', amount: 410, account: 0, estimated: false }] } };
};

describe('sincronización cifrada', () => {
  let fb: ReturnType<typeof fakeFirebase>;
  beforeEach(() => {
    fb = fakeFirebase();
    vi.stubGlobal('fetch', fb.fetchMock);
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => (store[k] = v), removeItem: (k: string) => delete store[k] });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('en la nube solo hay datos cifrados y otro móvil con el código los lee', async () => {
    const a = new Sync(host(mine()));
    expect(await a.connect(CODE)).toBe('ok');
    await new Promise((r) => setTimeout(r, 0));
    const cloud = JSON.stringify(fb.root);
    expect(cloud).not.toContain('Seguro');
    expect(cloud).not.toContain('410');
    const stored = fb.get(`familias/${CODE}/finanzas-c`) as Record<string, unknown>;
    expect(isSealed(stored['cfg'])).toBe(true);

    const exampleLocal = { ...blankData(2027, 'X'), config: { ...blankData(2027, 'X').config, example: true } };
    const h2 = host(exampleLocal);
    const b = new Sync(h2);
    expect(await b.connect(CODE)).toBe('ok');
    expect(h2.data.config.payments[0]!.concept).toBe('Seguro del coche');
  });

  it('pasa los datos de antes (sin cifrar) a cifrados', async () => {
    // Datos de una versión anterior, sin cifrar, y un móvil que ya estaba conectado.
    const old = mine();
    const flat = flatten(old);
    fb.root['familias'] = { [CODE]: { finanzas: { cfg: flat['cfg'] } } };
    localStorage.setItem('finanzas-familiares:sync', JSON.stringify({ code: CODE, base: flat }));
    const h = host(old);
    const s = new Sync(h);
    // `pull` es privado: se llama como lo hace `start`, sin abrir la conexión en vivo.
    await (s as unknown as { pull(): Promise<void> }).pull();
    const enc = fb.get(`familias/${CODE}/finanzas-c`) as Record<string, unknown>;
    expect(isSealed(enc['cfg'])).toBe(true);
    expect(JSON.stringify(enc)).not.toContain('Seguro');
    expect(typeof fb.get(`familias/${CODE}/finanzas-migrado`)).toBe('number');
    expect(JSON.parse(localStorage.getItem('finanzas-familiares:sync')!).v).toBe(2);
  });
});
