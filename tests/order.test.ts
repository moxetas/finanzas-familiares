import { describe, expect, it } from 'vitest';
import { accountOrder, addAccount, blankData, computeYear, inOrder, moveAccount, moveRow, removeAccount, rowKeys, sortedPositions, type AppData } from '../src/calc';
import { sanitizeData } from '../src/storage/sanitize';

function fourAccounts(): AppData {
  const d = blankData(2027, 'A');
  d.config.accounts.push({ name: 'B', initial: 10 }, { name: 'C', initial: 20 }, { name: 'D', initial: 30 });
  return d;
}

const names = (d: AppData) => inOrder(d.config.accounts, accountOrder(d.config)).map(({ item }) => item.name);

describe('orden de las cuentas', () => {
  it('sin orden guardado, se ven en el orden en que se crearon', () => {
    expect(names(fourAccounts())).toEqual(['A', 'B', 'C', 'D']);
  });

  it('mover una cuenta solo cambia el orden, no los datos', () => {
    const d = fourAccounts();
    const moved = moveAccount(d, 3, 0);
    expect(names(moved)).toEqual(['D', 'A', 'B', 'C']);
    expect(moved.config.accounts).toEqual(d.config.accounts);
    expect(moveAccount(moved, 1, 3).config.accountOrder).toEqual([3, 1, 2, 0]);
    // Posiciones fuera de rango o iguales: no cambia nada.
    expect(moveAccount(d, 2, 2)).toBe(d);
    expect(moveAccount(d, 0, 9)).toBe(d);
  });

  it('una cuenta nueva sale la primera si ya se había ordenado', () => {
    const d = addAccount(moveAccount(fourAccounts(), 0, 3), { name: 'E', initial: 0 });
    expect(names(d)).toEqual(['E', 'B', 'C', 'D', 'A']);
  });

  it('ignora índices repetidos o que no existen', () => {
    expect(accountOrder({ accounts: [{ name: 'A', initial: 0 }, { name: 'B', initial: 0 }], accountOrder: [1, 1, 7, -1] })).toEqual([0, 1]);
  });

  it('al quitar una cuenta se conserva el orden de las demás', () => {
    const d = moveAccount(fourAccounts(), 3, 0); // D A B C
    const r = removeAccount(d, 1, 0); // quita B
    expect(names(r)).toEqual(['D', 'A', 'C']);
    expect(r.config.accountOrder).toEqual([2, 0, 1]);
  });

  it('se guarda en la copia y se descarta si está mal', () => {
    const d = moveAccount(fourAccounts(), 3, 0);
    expect(sanitizeData(JSON.parse(JSON.stringify(d)), 2027, 'A').config.accountOrder).toEqual([3, 0, 1, 2]);
    const bad = { ...d, config: { ...d.config, accountOrder: [0, 0, 'x'] } };
    expect(sanitizeData(JSON.parse(JSON.stringify(bad)), 2027, 'A').config.accountOrder).toBeUndefined();
  });

  it('el cálculo del año no depende del orden', () => {
    const d = fourAccounts();
    expect(computeYear(moveAccount(d, 0, 3))).toEqual(computeYear(d));
  });
});

describe('quitar una cuenta: filas libres, traspasos y deudas', () => {
  it('cada importe sigue en su cuenta', () => {
    const d = fourAccounts();
    d.overrides = { '2027-03_f0_c1': -5, '2027-03_f2_c3': 7, '2027-03_t_c2': 40, '2027-03_t_c3': -40, '2027-03_i0': 9 };
    d.config.debts = [{ name: 'Tarjeta', account: 3, amount: 100, match: 'Tarjeta' }];
    const r = removeAccount(d, 1, 0);
    expect(r.overrides).toEqual({ '2027-03_f2_c2': 7, '2027-03_t_c1': 40, '2027-03_t_c2': -40, '2027-03_i0': 9 });
    expect(r.config.debts![0]!.account).toBe(2);
    expect(d.config.debts![0]!.account).toBe(3);
  });
});

describe('orden de los conceptos de la tabla de Meses', () => {
  const show = (names: string[], order?: string[]) => sortedPositions(rowKeys(names), order).map((i) => names[i]);

  it('sin orden guardado, salen como estaban', () => {
    expect(show(['Luz', 'Agua', 'Gas'])).toEqual(['Luz', 'Agua', 'Gas']);
  });

  it('sigue el orden guardado y lo nuevo va detrás de la fila que tenía delante', () => {
    expect(show(['Luz', 'Agua', 'Gas'], ['Gas', 'Luz', 'Agua'])).toEqual(['Gas', 'Luz', 'Agua']);
    // «Internet» no está en el orden: sigue a «Agua», que tenía delante.
    expect(show(['Luz', 'Agua', 'Internet', 'Gas'], ['Gas', 'Agua', 'Luz'])).toEqual(['Gas', 'Agua', 'Internet', 'Luz']);
    // Sin fila delante, al principio.
    expect(show(['Nuevo', 'Luz', 'Agua'], ['Agua', 'Luz'])).toEqual(['Nuevo', 'Agua', 'Luz']);
  });

  it('distingue nombres repetidos y deja quietas las filas sin clave', () => {
    expect(rowKeys(['Otros', 'Luz', 'Otros', null])).toEqual(['Otros', 'Luz', 'Otros#2', null]);
    const keys = rowKeys(['A', null, 'B']);
    expect(sortedPositions(keys, ['B', 'A'])).toEqual([2, 0, 1]);
  });

  it('mover una fila deja en su sitio las de otras tablas', () => {
    // Orden guardado con conceptos de 2026 (X, Y) y de 2027 (A, B, C) mezclados.
    const order = ['X', 'A', 'Y', 'B', 'C'];
    const shown = show(['A', 'B', 'C'], order); // A B C
    const next = moveRow(order, shown, 2, 0); // C delante
    expect(next).toEqual(['X', 'C', 'Y', 'A', 'B']);
    expect(show(['A', 'B', 'C'], next)).toEqual(['C', 'A', 'B']);
    expect(show(['X', 'Y'], next)).toEqual(['X', 'Y']);
  });

  it('la primera vez guarda las filas que se ven en el orden nuevo', () => {
    expect(moveRow(undefined, ['Luz', 'Agua', 'Gas'], 0, 2)).toEqual(['Agua', 'Gas', 'Luz']);
    // Filas que aún no estaban: entran junto a las que se ven a su lado.
    expect(moveRow(['Gas'], ['Luz', 'Gas', 'Agua'], 2, 0)).toEqual(['Agua', 'Luz', 'Gas']);
    expect(moveRow(['Luz'], ['Luz'], 0, 0)).toEqual(['Luz']);
  });

  it('se guarda en la copia y no cambia el cálculo', () => {
    const d = fourAccounts();
    const withOrder = { ...d, config: { ...d.config, rowOrder: ['Luz', ' Agua ', 'Luz', 7] as unknown as string[] } };
    expect(sanitizeData(JSON.parse(JSON.stringify(withOrder)), 2027, 'A').config.rowOrder).toEqual(['Luz', 'Agua']);
    expect(computeYear(withOrder)).toEqual(computeYear(d));
  });
});
