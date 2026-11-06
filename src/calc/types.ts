/**
 * Modelo de datos de la app. Todo se guarda en el aparato de cada persona.
 *
 * Los índices (`account`, `to`, claves de overrides y saldos reales) apuntan a
 * posiciones en los arrays de `config`. Las funciones de `mutations.ts` se
 * encargan de mantenerlos coherentes al borrar elementos.
 */

export type ItemType = 'Ingreso' | 'Gasto' | 'Ahorro';
export type EntryType = 'Ingreso' | 'Gasto';

export interface Account {
  name: string;
  /** Saldo al empezar el año (1 de enero). */
  initial: number;
}

export interface Item {
  name: string;
  type: ItemType;
  /** Importe positivo. El tipo decide si suma o resta. */
  amount: number;
  /** Cuenta donde entra (Ingreso) o de donde sale (Gasto, Ahorro). */
  account: number;
  /** Solo Ahorro: cuenta destino, o -1 si el dinero sale fuera de tus cuentas. */
  to: number;
  /** Primer mes en que cuenta (1 = enero). */
  from_month: number;
  /** Último mes en que cuenta (12 = diciembre). */
  to_month: number;
}

export interface Payment {
  /** Fecha AAAA-MM-DD. Cuenta en el mes de esta fecha. */
  date: string;
  concept: string;
  amount: number;
  account: number;
  estimated: boolean;
}

export interface Config {
  year: number;
  example: boolean;
  accounts: Account[];
  items: Item[];
  payments: Payment[];
}

/** Importe cambiado solo para un mes: `"AAAA-MM_i<item>"` o `"AAAA-MM_p<pago>"`. */
export type Overrides = Record<string, number>;

/** Saldo real a fin de mes: `"AAAA-MM_c<cuenta>"`. */
export type RealBalances = Record<string, number>;

export interface Entry {
  id: string;
  /** Mes del apunte, AAAA-MM. */
  month: string;
  concept: string;
  amount: number;
  type: EntryType;
  /** Fecha AAAA-MM-DD (opcional, puede ir vacía). */
  date: string;
  account: number;
  note: string;
}

export interface AppData {
  config: Config;
  overrides: Overrides;
  real_balances: RealBalances;
  entries: Entry[];
}
