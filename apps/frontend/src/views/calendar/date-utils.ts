import i18n from '../../i18n';
/*
 * Aritmetica de fechas del calendario.
 *
 * Todo el calendario trabaja con dos strings: el dia `YYYY-MM-DD` y el mes
 * `YYYY-MM`. No hay `Date` en el medio porque la zona horaria no tiene por que
 * participar: el dia 12 es el dia 12, y si se pasa por `Date` a las 23:30 en
 * algun sitio con UTC-3 el string puede volver siendo el dia 13. Ver el criterio
 * completo en `CalendarEventDto` (packages/shared).
 *
 * Cuando hace falta un `Date` -- para formatear -- se CONSTRUYE desde las partes
 * locales (`new Date(y, m-1, d)`), nunca con `new Date(string)`, que parsea en
 * UTC y reintroduce justo el corrimiento que estamos esquivando.
 *
 * Los nombres van en arrays y no con `toLocaleDateString`. Son datos, no
 * configuracion: la UI de la app es ingles fijo, y `toLocale*` mete el idioma
 * del sistema en el medio -- el mismo calendario diria "marzo" en un Windows en
 * espanol. Ademas su salida depende de los datos de ICU del runtime, que es
 * justo el tipo de variacion que no se quiere en un `.exe` empaquetado.
 */

export const MONTH_KEY_RE = /^\d{4}-\d{2}$/;
export const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

const MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

const MONTH_NAMES_SHORT = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];

/*
 * "M T W T F S S". Las iniciales se repiten y queda igual que en cualquier
 * calendario en ingles: son las que el lector ya reconoce de un vistazo, y
 * escribir "Mo/Tu/We" no es mas claro, solo mas largo.
 */
const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const WEEKDAY_LONG = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

/* -------------------------------------------------------------------------- */
/* Claves                                                                      */
/* -------------------------------------------------------------------------- */

/** `YYYY-MM-DD` del dia local. */
export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** `YYYY-MM` del mes local. */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Fecha local a medianoche desde `YYYY-MM-DD`. */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Anade (o resta, con `delta` negativo) dias a un `YYYY-MM-DD`. */
export function addDays(key: string, delta: number): string {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + delta);
  return dateKey(d);
}

/** Anade (o resta) meses a un `YYYY-MM`, engaging el dia 1 para no chocar. */
export function addMonths(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  // Dia 1: sumar meses nunca depende de cuantos dias tenga el mes de destino.
  const d = new Date(y, m - 1 + delta, 1);
  return monthKey(d);
}

/** Primer dia del mes `YYYY-MM` como `YYYY-MM-DD`. */
export function firstDayOfMonth(key: string): string {
  return `${key}-01`;
}

/** Ultimo dia del mes `YYYY-MM` como `YYYY-MM-DD`. `new Date(y, m, 0)` es el ultimo dia de `m-1`. */
export function lastDayOfMonth(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return dateKey(new Date(y, m, 0));
}

/** Rango cerrado `[from, to]` del mes, listo para el endpoint. */
export function monthRange(key: string): { from: string; to: string } {
  return { from: firstDayOfMonth(key), to: lastDayOfMonth(key) };
}

/* -------------------------------------------------------------------------- */
/* Formato                                                                     */
/* -------------------------------------------------------------------------- */

/** "October 2026" or "Oct 2026" when short. */
export function formatMonthLabel(key: string, short = false): string {
  const [y, m] = key.split('-').map(Number);
  const i = Math.min(11, Math.max(0, m - 1));
  const rawKey = MONTH_NAMES[i];
  const rawShort = MONTH_NAMES_SHORT[i];
  const translated = short
    ? i18n.t(`calendar.monthsShort.${rawShort}`, { defaultValue: rawShort })
    : i18n.t(`calendar.months.${rawKey}`, { defaultValue: rawKey });
  return `${translated} ${y}`;
}

/** "Mon 12 Oct" para la cabecera del dia. */
export function formatDayLabel(key: string): string {
  const d = parseDateKey(key);
  const rawWd = WEEKDAY_LONG[(d.getDay() + 6) % 7];
  const rawMonth = MONTH_NAMES_SHORT[d.getMonth()];
  const wd = i18n.t(`calendar.weekdaysLong.${rawWd}`, { defaultValue: rawWd });
  const month = i18n.t(`calendar.monthsShort.${rawMonth}`, { defaultValue: rawMonth });
  return `${wd} ${d.getDate()} ${month}`;
}

/** "M T W T F S S", empezando en lunes. */
export function weekdayInitials(): string[] {
  const custom = i18n.t('calendar.weekdaysShort', { returnObjects: true, defaultValue: WEEKDAY_INITIALS });
  return Array.isArray(custom) ? (custom as string[]) : WEEKDAY_INITIALS;
}

/** `startMin` (0..1439) como "09:30". */
export function formatHour(startMin: number): string {
  const h = Math.floor(startMin / 60);
  const m = startMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Numero de dia, sin ceros. */
export function dayNumber(key: string): number {
  return Number(key.slice(8, 10));
}

/** `true` si el dia es hoy (local). */
export function isToday(key: string): boolean {
  return key === dateKey(new Date());
}

/* -------------------------------------------------------------------------- */
/* Grilla                                                                      */
/* -------------------------------------------------------------------------- */

export interface MonthCell {
  /** `YYYY-MM-DD`. */
  key: string;
  /** Numero de dia, sin ceros. */
  day: number;
  /** `false` si el dia cae del mes anterior o del siguiente: se dibuja atenuado. */
  inMonth: boolean;
}

/**
 * Las 6 filas x 7 columnas del mes, empezando en lunes.
 *
 * Siempre 6 filas, no 5: el mes mas corto (febrero en ano no bisiesto)
 * empieza en domingo y necesita exactamente 6 para cubrirse. Recortar a las
 * filas necesarias hace que la grilla cambie de alto al pasar de mes y el
 * layout salte.
 *
 * Los dias de los meses vecinos se incluyen y se marcan `inMonth: false` en vez
 * de recortarse: es lo que hacen los calendarios de verdad y evita que el
 * ultimo o el primer dia queden amputados.
 */
export function monthGrid(key: string): MonthCell[][] {
  const first = parseDateKey(firstDayOfMonth(key));
  // getDay() da 0=domingo; `(d + 6) % 7` rota a 0=lunes.
  const leading = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(start.getDate() - leading);

  const cells: MonthCell[] = [];
  const cursor = new Date(start);
  const monthIndex = Number(key.slice(5, 7));
  for (let i = 0; i < 42; i++) {
    const k = dateKey(cursor);
    cells.push({ key: k, day: cursor.getDate(), inMonth: cursor.getMonth() + 1 === monthIndex });
    cursor.setDate(cursor.getDate() + 1);
  }

  const rows: MonthCell[][] = [];
  for (let i = 0; i < 6; i++) {
    rows.push(cells.slice(i * 7, i * 7 + 7));
  }
  return rows;
}

/**
 * Las 24 horas del dia como bloques para la grilla de horas.
 *
 * Es lo que la vista usa para "cada dia tiene bloques divididos por hora": 24
 * filas de altura fija, y los eventos se posicionan por `startMin`. La hora de
 * inicio de un bloque es su indice por 60.
 */
export function hourBlocks(): { hour: number; label: string; startMin: number }[] {
  const blocks: { hour: number; label: string; startMin: number }[] = [];
  for (let h = 0; h < 24; h++) {
    blocks.push({ hour: h, label: formatHour(h * 60), startMin: h * 60 });
  }
  return blocks;
}
