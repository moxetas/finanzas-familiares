import { describe, expect, it } from 'vitest';
import { avisosKey, buildCola, colaUpdates, famId, itemId, signature } from '../src/storage/avisos-cola';
import { unseal } from '../src/storage/cipher';
import type { ReminderFile } from '../src/storage/local';

const CODE = 'abcd-efgh-jkmn-pqrs-tuvw';
const labels = { today: 'Hoy', tomorrow: 'Mañana', inDays: 'Dentro de {n} días', estimated: 'estimado' };
const item = (key: string, from: string, until: string, date: string) => ({
  key,
  from,
  until,
  date,
  concept: 'Seguro',
  amountText: '120 €',
  dateText: 'lunes, 16 de noviembre',
  estimated: false,
});
const file = (items: ReminderFile['items']): ReminderFile => ({ v: 1, labels, items });
// 10 de noviembre de 2026, 12:00 (hora local)
const NOW = new Date(2026, 10, 10, 12).getTime();

describe('cola de avisos', () => {
  it('huellas fijas, del tamaño que piden las reglas de Firebase, y sin el código', async () => {
    const f = await famId(CODE);
    // La misma huella que Menú familiar y el servicio de avisos (repositorio avisos-familia)
    expect(f).toBe('6874a103d195eda363a15e9a5a636c29');
    expect(await famId('ABCDEFGHJKMNPQRSTUVW')).toBe(f);
    const id = await itemId(CODE, 'f', '2026-11-16|Seguro|week');
    expect(id).toHaveLength(57);
    expect(id.startsWith(f + 'f')).toBe(true);
    expect(id).not.toContain('abcd');
  });

  it('cada aviso sale a las 9:00 del primer día y vale hasta el final del último', () => {
    const [e] = buildCola(file([item('2026-11-16|Seguro|week', '2026-11-09', '2026-11-14', '2026-11-16')]), NOW);
    expect(e!.t).toBe(new Date(2026, 10, 9, 9).getTime());
    expect(e!.h).toBe(new Date(2026, 10, 15).getTime() - 1);
  });

  it('no pone avisos pasados ni demasiado lejanos', () => {
    const cola = buildCola(
      file([
        item('a', '2026-11-01', '2026-11-05', '2026-11-07'),
        item('b', '2026-11-10', '2026-11-10', '2026-11-10'),
        item('c', '2027-06-01', '2027-06-06', '2027-06-08'),
      ]),
      NOW,
    );
    expect(cola.map((e) => e.key)).toEqual(['b']);
  });

  it('solo sube lo que cambia y quita lo que sobra; el texto va cifrado', async () => {
    const cola = buildCola(file([item('k1', '2026-11-11', '2026-11-12', '2026-11-12'), item('k2', '2026-11-20', '2026-11-25', '2026-11-27')]), NOW);
    const id1 = await itemId(CODE, 'f', 'k1');
    const id2 = await itemId(CODE, 'f', 'k2');
    const gone = (await famId(CODE)) + 'f' + '0'.repeat(24);
    const u = (await colaUpdates(CODE, 'f', cola, { [id1]: await signature(cola[0]!), [gone]: 'x' }))!;
    expect(Object.keys(u).sort()).toEqual([`cola/${gone}`, `cola/${id2}`, `familias/${CODE}/avisos-f`].sort());
    expect(u[`cola/${gone}`]).toBeNull();
    const entry = u[`cola/${id2}`] as { f: string; a: string; t: number; h: number; p: string };
    expect(entry.f).toBe(await famId(CODE));
    expect(entry.a).toBe('f');
    expect(entry.p).not.toContain('Seguro');
    const opened = JSON.parse(String(await unseal(await avisosKey(CODE), entry.p)));
    expect(opened).toMatchObject({ k: 'k2', c: 'Seguro', a: '120 €', date: '2026-11-27', l: labels });
    expect(u[`familias/${CODE}/avisos-f`]).toEqual({ [id1]: await signature(cola[0]!), [id2]: await signature(cola[1]!) });
  });

  it('sin cambios no escribe nada', async () => {
    const cola = buildCola(file([item('k1', '2026-11-11', '2026-11-12', '2026-11-12')]), NOW);
    const prev = { [await itemId(CODE, 'f', 'k1')]: await signature(cola[0]!) };
    expect(await colaUpdates(CODE, 'f', cola, prev)).toBeNull();
  });
});
