import { describe, expect, it } from 'vitest';
// @ts-expect-error — script de Node en JavaScript, sin tipos
import { ahoraEnZona, avisosQueTocan, run, textoAviso } from '../.github/scripts/avisos.mjs';

const finanzas = (payments: unknown[], ov: Record<string, number> = {}, example = false) => ({
  cfg: JSON.stringify({ config: { year: 2026, example, accounts: [], items: [], payments } }),
  ov,
});
// 10 de noviembre de 2026 a las 10:00 en España (09:00 UTC)
const AHORA = Date.UTC(2026, 10, 10, 9, 0);

describe('servicio de avisos', () => {
  it('hora de España', () => {
    expect(ahoraEnZona(AHORA)).toEqual({ hoy: '2026-11-10', hora: 10 });
    expect(ahoraEnZona(Date.UTC(2026, 10, 10, 23, 30)).hoy).toBe('2026-11-11');
  });

  it('avisa a 7-2 días (semana) y mañana u hoy (día), una sola vez', () => {
    const data = {
      finanzas: finanzas(
        [
          { date: '2026-11-11', concept: 'Seguro', amount: 410, account: 0, estimated: false },
          { date: '2026-11-15', concept: 'Alcantarillado', amount: 155, account: 0, estimated: true },
          { date: '2026-11-20', concept: 'Lejos', amount: 1, account: 0, estimated: false },
          { date: '2026-11-01', concept: 'Pasado', amount: 1, account: 0, estimated: false },
        ],
        { '2026-11_p0': 400 },
      ),
      avisados: {},
    };
    const r = avisosQueTocan(data, AHORA);
    expect(r.enviar.map((a: { key: string }) => a.key)).toEqual(['2026-11-11|Seguro|day', '2026-11-15|Alcantarillado|week']);
    expect(r.enviar[0].importe).toBe(400);
    const otra = avisosQueTocan({ ...data, avisados: r.avisados }, AHORA + 3600e3);
    expect(otra.enviar).toHaveLength(0);
  });

  it('no avisa de noche ni con el ejemplo', () => {
    const p = [{ date: '2026-11-11', concept: 'Seguro', amount: 1, account: 0, estimated: false }];
    expect(avisosQueTocan({ finanzas: finanzas(p) }, Date.UTC(2026, 10, 10, 5, 0)).enviar).toHaveLength(0);
    expect(avisosQueTocan({ finanzas: finanzas(p, {}, true) }, AHORA).enviar).toHaveLength(0);
  });

  it('texto del aviso', () => {
    const t = textoAviso({ key: 'k', tipo: 'day', dias: 1, date: '2026-11-11', concept: 'Seguro', importe: 1410.5, estimated: true });
    expect(t.title).toBe('💶 Mañana: Seguro');
    expect(t.body.replace(/\s/g, ' ')).toBe('1.410,50 € (estimado) · miércoles, 11 de noviembre');
  });

  it('envía a cada móvil y da de baja los que ya no existen', async () => {
    const store: Record<string, unknown> = {
      finanzas: finanzas([{ date: '2026-11-11', concept: 'Seguro', amount: 1, account: 0, estimated: false }]),
      'finanzas-push': { a: { endpoint: 'https://push/a', keys: {} }, b: { endpoint: 'https://push/b', keys: {} } },
      vapid: { publicKey: 'x', privateKey: 'y' },
    };
    let patch: Record<string, unknown> = {};
    const db = async (_code: string, path: string, method = 'GET', body?: Record<string, unknown>) => {
      if (method === 'PATCH') {
        patch = body!;
        return {};
      }
      return store[path] ?? null;
    };
    const sent: string[] = [];
    const send = async (sub: { endpoint: string }) => {
      if (sub.endpoint.endsWith('/b')) throw Object.assign(new Error('gone'), { statusCode: 410 });
      sent.push(sub.endpoint);
    };
    const r = await run({ code: 'c', ahora: AHORA, send, db });
    expect(sent).toEqual(['https://push/a']);
    expect(r.caducados).toEqual(['b']);
    expect(patch['finanzas-push/b']).toBeNull();
    expect(Object.keys(patch['finanzas-avisados'] as object)).toEqual(['2026-11-11|Seguro|day']);
  });
});
