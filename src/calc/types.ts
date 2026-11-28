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
  /** Cuenta «de gasto diario»: lo que entra se gasta, no se guarda saldo. */
  spent?: boolean;
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
  /** Texto libre que se ve junto a la partida. */
  note?: string;
  /** Importe aproximado. */
  estimated?: boolean;
  /** Bloque donde se muestra (ver `Config.sections`). */
  group?: string;
  /** Domiciliación que lo creó (`DomRow.link`). */
  dom?: string;
}

export interface Payment {
  /** Fecha AAAA-MM-DD. Cuenta en el mes de esta fecha. */
  date: string;
  concept: string;
  amount: number;
  account: number;
  estimated: boolean;
  note?: string;
  group?: string;
  /** Domiciliación que lo creó (`DomRow.link`). */
  dom?: string;
}

/** Deuda que baja con pagos cuyo concepto empieza por `match`. */
export interface Debt {
  name: string;
  account: number;
  amount: number;
  match: string;
  note?: string;
}

export interface Config {
  year: number;
  example: boolean;
  accounts: Account[];
  items: Item[];
  payments: Payment[];
  /** Orden de los bloques de la tabla del mes (opcional). */
  sections?: string[];
  debts?: Debt[];
  /** Nombre de las filas libres de cada mes: `"AAAA-MM_f<fila>"` → texto. */
  freeLabels?: Record<string, string>;
  /**
   * Filas libres de meses de la hoja (años anteriores) que puso una domiciliación:
   * `"AAAA-MM_f<fila>"` → `"<link>@AAAA-MM-DD"` (enlace y fecha del cargo).
   */
  freeDom?: Record<string, string>;
  /** Sueldos de cada persona (pestaña Sueldos). */
  salaries?: SalaryPerson[];
  /** Compras y ventas de BTC (pestaña Sueldos). */
  btc?: BtcTrade[];
  /** Las filas libres se muestran delante de la partida con este nombre (si no, al final). */
  freeRowsBefore?: string;
  /**
   * Orden en que se ven las cuentas (índices de `accounts`). Solo cambia cómo
   * se muestran: los datos siguen usando el índice de cada cuenta. Sin él, se
   * ven en el orden en que se crearon. Ver `accountOrder()`.
   */
  accountOrder?: number[];
  /**
   * Orden en que se ven las filas (conceptos) de la tabla de cada mes, por
   * nombre. Es el mismo para todos los meses y años. Ver `sortedPositions()`.
   */
  rowOrder?: string[];
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

/** Un mes ya cerrado, tal cual estaba en la hoja (p. ej. 2026). */
export interface HistoryMonth {
  title: string;
  cols: string[];
  rows: { l: string; v: (number | null)[] }[];
  /** Total original de cada columna. */
  tot: (number | null)[];
}

export interface DomRow {
  n: number | null;
  c: string;
  t: string;
  cost: number | null;
  from: string;
  to: string;
  /**
   * Si la domiciliación pone sus cargos en la tabla del mes: cada cuántos meses
   * (1, 2, 3, 6 o 12), el primer cargo, la cuenta de la app y el enlace con los
   * pagos o el concepto mensual que creó (`Payment.dom`, `Item.dom`).
   */
  plan?: DomPlan;
}

export interface DomPlan {
  link: string;
  every: number;
  /** Primer cargo, AAAA-MM-DD. */
  first: string;
  /** Cuenta de donde sale. Con `card`, la cuenta desde la que se paga la tarjeta. */
  account: number;
  /**
   * Se carga en la tarjeta de crédito: no crea conceptos ni pagos, sale cada mes
   * que toca en la tabla «Cargos en la tarjeta de crédito» (ver `cardCharges`).
   * Lo que de verdad sale de la cuenta es el concepto «Tarjeta de crédito», que
   * se escribe a mano cada mes.
   */
  card?: boolean;
}

export interface Domiciliaciones {
  accounts: { name: string; alias: string }[];
  groups: { title: string; rows: DomRow[] }[];
}

export interface AppData {
  config: Config;
  /** Meses de años anteriores, solo lectura salvo cifras cambiadas en `overrides`. */
  history?: Record<string, HistoryMonth>;
  domiciliaciones?: Domiciliaciones;
  overrides: Overrides;
  real_balances: RealBalances;
  entries: Entry[];
}

/** Sueldos de una persona: los cobrados (confirmados) y, si se quiere, estimaciones a mano. */
export interface SalaryPerson {
  name: string;
  /** Contratos por orden: cada uno empieza en `from` (AAAA-MM). La media se reinicia con cada contrato. */
  contracts: { from: string; name: string }[];
  /** Sueldos cobrados: AAAA-MM → importe. */
  months: Record<string, number>;
  /** Estimaciones puestas a mano para meses aún no cobrados: AAAA-MM → importe. */
  estimates?: Record<string, number>;
}

/** Una compra (cantidad positiva) o venta (negativa) de BTC. */
export interface BtcTrade {
  /** AAAA-MM-DD */
  date: string;
  qty: number;
  price: number;
  /** Euros pagados (negativo en una venta). */
  paid: number;
}
