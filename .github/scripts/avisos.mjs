// Envía los avisos de los pagos no mensuales al móvil: una semana antes y el día de antes.
// Lo ejecuta cada hora .github/workflows/avisos.yml. Necesita el secreto FAMILIA_CODIGO
// (el mismo código de familia que se usa en la app para sincronizar).
//
// Lee de Firebase, dentro de /familias/<código>:
//   finanzas           → las cuentas sincronizadas de la app (pagos e importes cambiados)
//   finanzas-push      → los móviles que han activado los avisos (suscripciones Web Push)
//   vapid              → claves para firmar los avisos (las mismas que usa Menú familiar)
//   finanzas-avisados  → qué avisos ya se han enviado (lo escribe este script)
//   finanzas-servidor  → cuándo pasó este script por última vez (lo enseña la app)
//
// El repositorio es público: los registros (logs) solo muestran cuántos avisos se envían,
// nunca conceptos ni importes.

export const FIREBASE_DB = 'https://menu-familiar-a2424-default-rtdb.europe-west1.firebasedatabase.app';
const ZONA = 'Europe/Madrid';
/** No se avisa antes de esta hora (hora de España). */
const HORA_AVISOS = 9;

/** Pagos e importes cambiados a partir del nodo `finanzas` de Firebase. */
export function leerFinanzas(raw) {
  let config = {};
  try {
    config = JSON.parse(raw?.cfg ?? '{}')?.config ?? {};
  } catch {
    config = {};
  }
  const payments = Array.isArray(config.payments) ? config.payments : [];
  const overrides = raw?.ov && typeof raw.ov === 'object' ? raw.ov : {};
  return { payments, overrides, example: config.example === true };
}

const diaUTC = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

/** Fecha y hora de ahora en España: { hoy: 'AAAA-MM-DD', hora: 0-23 }. */
export function ahoraEnZona(ahora, zona = ZONA) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(ahora))
      .map((x) => [x.type, x.value]),
  );
  return { hoy: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour) };
}

/**
 * Avisos que tocan hoy (la misma regla que la app): «semana» si faltan de 7 a 2 días,
 * «día» si es mañana u hoy. La clave es fecha|concepto|tipo.
 */
export function avisosDeHoy({ payments, overrides }, hoy) {
  const out = [];
  payments.forEach((p, index) => {
    if (!p || typeof p.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.date)) return;
    const dias = Math.round((diaUTC(p.date) - diaUTC(hoy)) / 864e5);
    if (dias < 0 || dias > 7) return;
    const tipo = dias <= 1 ? 'day' : 'week';
    const cambiado = overrides[`${p.date.slice(0, 7)}_p${index}`];
    const importe = Math.abs(typeof cambiado === 'number' ? cambiado : Number(p.amount) || 0);
    out.push({ key: `${p.date}|${p.concept}|${tipo}`, tipo, dias, date: p.date, concept: String(p.concept || ''), importe, estimated: p.estimated === true });
  });
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

const euros = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always' });

export function textoAviso(a) {
  const cuando = a.dias <= 0 ? 'Hoy' : a.dias === 1 ? 'Mañana' : a.dias === 7 ? 'Dentro de una semana' : `Dentro de ${a.dias} días`;
  const fecha = new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(diaUTC(a.date)));
  return {
    title: `💶 ${cuando}: ${a.concept}`,
    body: `${euros.format(a.importe)}${a.estimated ? ' (estimado)' : ''} · ${fecha}`,
    tag: `pago-${a.key}`,
    url: './#/avisos',
  };
}

/** Qué hay que enviar ahora y la lista de enviados actualizada (sin los de hace más de 40 días). */
export function avisosQueTocan(data, ahora) {
  const { hoy, hora } = ahoraEnZona(ahora);
  const limite = new Date(diaUTC(hoy) - 40 * 864e5).toISOString().slice(0, 10);
  const avisados = {};
  for (const [k, v] of Object.entries(data.avisados || {})) if (k.slice(0, 10) >= limite) avisados[k] = v;
  const fin = leerFinanzas(data.finanzas);
  // Con el ejemplo ficticio no se avisa; por la noche tampoco (se espera a las 9:00).
  if (fin.example || hora < HORA_AVISOS) return { enviar: [], avisados };
  const enviar = [];
  for (const a of avisosDeHoy(fin, hoy)) {
    // Firebase no admite «.», «#», «$», «[», «]» ni «/» en las claves.
    const id = a.key.replace(/[.#$[\]/]/g, '_');
    if (avisados[id]) continue;
    enviar.push(a);
    avisados[id] = ahora;
  }
  return { enviar, avisados };
}

async function firebase(code, path, method = 'GET', body) {
  const res = await fetch(`${FIREBASE_DB}/familias/${code}/${path}.json`, method === 'GET' ? {} : { method, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Firebase ${method} ${path || '/'}: ${res.status}`);
  return res.json();
}

export async function run({ code, ahora = Date.now(), send, db = firebase }) {
  const [finanzas, push, vapid, avisados] = await Promise.all([
    db(code, 'finanzas'),
    db(code, 'finanzas-push'),
    db(code, 'vapid'),
    db(code, 'finanzas-avisados'),
  ]);
  const { enviar, avisados: nuevos } = avisosQueTocan({ finanzas, avisados }, ahora);
  const subs = Object.entries(push || {});
  let enviados = 0;
  const caducados = new Set();
  for (const a of enviar) {
    const aviso = JSON.stringify(textoAviso(a));
    for (const [subId, sub] of subs) {
      if (caducados.has(subId)) continue;
      try {
        await send({ endpoint: sub.endpoint, keys: sub.keys }, aviso, vapid);
        enviados++;
      } catch (e) {
        // 404/410: ese móvil ya no acepta avisos (app borrada o avisos desactivados)
        if (e.statusCode === 404 || e.statusCode === 410) caducados.add(subId);
        else console.log(`No se pudo avisar a un móvil (${sub.dispositivo || 'móvil'}): ${e.statusCode || e.message}`);
      }
    }
  }
  const cambios = { 'finanzas-avisados': nuevos, 'finanzas-servidor': { ultimaVez: ahora, enviados, moviles: subs.length - caducados.size } };
  for (const id of caducados) cambios[`finanzas-push/${id}`] = null;
  await db(code, '', 'PATCH', cambios);
  return { enviar, enviados, caducados: [...caducados] };
}

// Ejecutado directamente (desde GitHub Actions)
if (import.meta.url === `file://${process.argv[1]}`) {
  const code = (process.env.FAMILIA_CODIGO || '').trim();
  if (!code) {
    console.log('::warning::Falta el secreto FAMILIA_CODIGO. Ponlo en GitHub: Settings → Secrets and variables → Actions.');
    process.exit(0);
  }
  const webpush = (await import('web-push')).default;
  const send = async (sub, payload, vapid) => {
    if (!vapid?.publicKey || !vapid?.privateKey) throw new Error('Aún no hay claves de avisos (se crean al activar los avisos en un móvil)');
    return webpush.sendNotification(sub, payload, {
      vapidDetails: { subject: 'https://moxetas.github.io/finanzas-familiares/', publicKey: vapid.publicKey, privateKey: vapid.privateKey },
      TTL: 12 * 3600,
      urgency: 'high',
    });
  };
  const r = await run({ code, send });
  console.log(`Listo: ${r.enviar.length} avisos, ${r.enviados} envíos${r.caducados.length ? `, ${r.caducados.length} móviles dados de baja` : ''}.`);
}
