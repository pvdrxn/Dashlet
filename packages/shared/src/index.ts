/**
 * Ranura (slot) del dashboard, en unidades de celda y no de pixeles.
 *
 * `x` es la columna dentro del bloque (0..BLOCK_COLS-1) e `y` es la fila
 * absoluta del dashboard. El layout es una grilla de 2 columnas: cada bloque
 * de 2x2 son dos filas consecutivas de `y`.
 *
 * No hay ancho ni alto persistido: el tamaño lo impose la celda. Ver
 * `apps/frontend/src/widgets/grid-utils.ts`.
 */
/**
 * Posicion y tamano de un widget, en celdas de la grilla (no en pixeles).
 *
 * `x`/`y` son la celda donde arranca, y `w`/`h` cuantas celdas ocupa hacia
 * derecha y hacia abajo. GRID_COLS es el ancho de la grilla; ver
 * `apps/frontend/src/widgets/grid-utils.ts`.
 */
export interface Position {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TabDto {
  id: string;
  userId: string;
  name: string;
  order: number;
  widgetCount?: number;
  deletedAt: string | null;
}

export interface CreateTabDto {
  name?: string;
}

export interface UpdateTabDto {
  name?: string;
  order?: number;
}

export interface WidgetDto {
  id: string;
  userId: string;
  tabId: string | null;
  type: string;
  config: Record<string, unknown>;
  position: Position;
  zIndex: number;
  deletedAt: string | null;
}

export interface CreateWidgetDto {
  type: string;
  tabId?: string;
  config?: Record<string, unknown>;
  position?: Position;
}

export interface UpdateWidgetDto {
  config?: Record<string, unknown>;
  position?: Position;
  zIndex?: number;
  tabId?: string | null;
}

/* -------------------------------------------------------------------------- */
/* Calendario                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Un bloque del calendario: una tarea con hora dentro de un dia concreto.
 *
 * `date` es un string `YYYY-MM-DD` en hora LOCAL y no un `DateTime`. Es a
 * proposito: el dia es la unidad con la que el usuario piensa ("el martes 12"),
 * no un instante. Guardarlo como timestamp obliga a elegir zona horaria en cada
 * lectura y escritura, y en SQLite eso se traduce en el bug clasico del evento
 * que se corre un dia al cambiar el horario de verano. Un string nunca se corre.
 *
 * La hora va aparte y en MINUTOS desde la medianoche (`startMin`, 0..1439), no
 * como columna `time`: asi el dia completo es `date` a secas, sin la ambiguedad
 * de las 24:00, y el rango de la grilla de horas se calcula con una division.
 */
export interface CalendarEventDto {
  id: string;
  userId: string;
  /** `YYYY-MM-DD`, hora local. */
  date: string;
  /** Minutos desde la medianoche, 0..1439. */
  startMin: number;
  /** Duracion en minutos. */
  durationMin: number;
  title: string;
  /**
   * Etiqueta del bloque, o `null` si no tiene ninguna.
   *
   * UNA sola, no una lista: es la regla del producto. Por eso es una columna
   * nullable y no una tabla puente -- con una etiqueta por bloque, la union solo
   * agrega una indireccion y dos joins para guardar un id.
   *
   * Va como id y no anidada a proposito: la vista ya baja la lista completa de
   * etiquetas para la fila de filtro, asi que resolver nombre y color desde ahi
   * es una busqueda en un Map. Anidarla seria mandar el mismo dato dos veces por
   * la red.
   */
  tagId: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCalendarEventDto {
  /** `YYYY-MM-DD`, hora local. */
  date: string;
  /** Minutos desde la medianoche, 0..1439. */
  startMin: number;
  /** Duracion en minutos. Si no viene, `DEFAULT_DURATION_MIN`. */
  durationMin?: number;
  title: string;
  /** Etiqueta a asignar. Si no viene, el bloque nace sin etiqueta. */
  tagId?: string | null;
}

export interface UpdateCalendarEventDto {
  date?: string;
  startMin?: number;
  durationMin?: number;
  title?: string;
  /**
   * Reemplaza la etiqueta del bloque, no la agrega. `null` la saca.
   *
   * Es lo que espera un editor: si cambias de etiqueta en la UI, la anterior
   * tiene que desaparecer. Un id que no exista se ignora en vez de romper el
   * guardado.
   */
  tagId?: string | null;
}

/** Duracion por defecto de un bloque: una hora. */
export const DEFAULT_DURATION_MIN = 60;

/**
 * Ventana de dias alrededor de "hoy" que forman las pestañas de mes.
 *
 * Los meses son efimeros, no entidades: se derivan de la fecha actual en cada
 * arranque. El desfase pone el mes de hoy en el medio para que las flechas
 * sirvan hacia atras y hacia adelante sin tener que llegar al borde.
 */
export const MONTH_TABS_BEFORE = 6;
export const MONTH_TABS_AFTER = 6;

/* -------------------------------------------------------------------------- */
/* Etiquetas                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Una etiqueta: la crea el usuario, tiene vida propia y se puede renombrar o
 * borrar sin tocar los bloques que la usan.
 *
 * Por eso es entidad y no un `string[]` en el evento: renombrar tiene que ser
 * una operacion, y si el nombre viviera adentro de cada bloque habria que
 * reescribir todos.
 */
export interface TagDto {
  id: string;
  userId: string;
  /** Como la escribio el usuario: puede llevar mayusculas. */
  name: string;
  /** Uno de `TAG_COLORS`. */
  color: TagColorId;
  /** Cantidad de bloques que la usan. Viene del servidor, no se cuenta en el cliente. */
  eventCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTagDto {
  name: string;
  /** Si no viene, el servidor elige con `nextTagColorId`. */
  color?: TagColorId;
}

export interface UpdateTagDto {
  name?: string;
  color?: TagColorId;
}

/**
 * Paleta de etiquetas.
 *
 * SOLO el arco frio. El sistema de la app ya ocupa la banda calida: `danger`
 * #d4605f (~0), `p3` #e2703f (~22) y `p2` #d9a441 (~40), donde p2 significa
 * "activo / corriendo / relevante". Si el ambar tambien fuera color de
 * etiqueta, una etiqueta pintada de ambar seria indistinguible de un bloque
 * activo, que es justo lo que el ambar ya dice en la hora ocupada y en el
 * contador del mes.
 *
 * Asi la regla es aprendible y no arbitraria: frio = categoria, calido = estado.
 *
 * Los seis estan en el mismo peso perceptual (~L* 68-72) para que ninguno pese
 * mas que otro, y `rose` esta lo bastante en magenta como para no confundirse
 * con `danger`. Ese par es el que mas habia que vigilar.
 */
export const TAG_COLORS = [
  { id: 'blue', hex: '#4E8FD4' },
  { id: 'lime', hex: '#7FA83A' },
  { id: 'teal', hex: '#2E9E92' },
  { id: 'violet', hex: '#8E7BD6' },
  { id: 'orchid', hex: '#C268B8' },
  { id: 'rose', hex: '#D9698C' },
] as const;

export type TagColorId = (typeof TAG_COLORS)[number]['id'];

/** Color por defecto de la etiqueta numero `index`, en orden de creacion. */
export function tagColorHex(id: TagColorId): string {
  return TAG_COLORS.find((c) => c.id === id)?.hex ?? TAG_COLORS[0].hex;
}

export function isTagColorId(value: unknown): value is TagColorId {
  return TAG_COLORS.some((c) => c.id === value);
}

/**
 * El color con que nace la etiqueta numero `n`.
 *
 * El orden NO es el de la paleta: alterna lados del arco para que dos
 * etiquetas creadas seguidas no caigan en tonos parecidos. Con el orden natural,
 * la primera y la segunda salian Blue y Lime, que a 10px de alto se leen casi
 * igual; asi salen Blue y Teal, que se distinguen.
 */
const AUTO_COLOR_ORDER: TagColorId[] = ['blue', 'lime', 'teal', 'violet', 'orchid', 'rose'];

export function nextTagColorId(existingCount: number): TagColorId {
  return AUTO_COLOR_ORDER[existingCount % AUTO_COLOR_ORDER.length];
}

/**
 * Limpieza de una etiqueta escrita por el usuario: recorta, colapsa espacios
 * internos y corta al tope.
 *
 * Va en `shared` y no en el service porque las reglas tienen que ser las
 * mismas de los dos lados: si el frontendShown una cosa y el backend guarda
 * otra, el nombre "se corrige" solo despues de recargar.
 */
export function normalizeTagName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_TAG_NAME_LENGTH);
}

/**
 * Clave de comparacion, sin mayusculas.
 *
 * Es la columna `nameLower` y la que indexa el `@@unique`. SQLite no tiene
 * collation case-insensitive por defecto, asi que sin esto "Work" y "work"
 * coexistirian como dos etiquetas distintas.
 */
export function tagKey(name: string): string {
  return name.trim().toLowerCase();
}

export const MAX_TAG_NAME_LENGTH = 24;

export interface TodoListDto {
  id: string;
  userId: string;
  title: string;
  items: TodoItemDto[];
}

export interface TodoItemDto {
  id: string;
  listId: string;
  text: string;
  completed: boolean;
  order: number;
  urgency: 0 | 1 | 2 | 3;
}

export type WidgetType =
  'todo-list' | 'pomodoro' | 'notes' | 'calculator' | 'habit-tracker' | 'diary' | 'data-table';

export const WIDGET_TYPES: WidgetType[] = [
  'todo-list',
  'pomodoro',
  'notes',
  'calculator',
  'habit-tracker',
  'diary',
  'data-table',
];

/*
 * Tablas de datos.
 *
 * El esquema de la tabla y sus filas viajan en el MISMO dto (`TableDto`), no en
 * dos: la vista siempre dibuja las columnas contra las filas y separarlas
 * obligaria a dos requests para pintar una pantalla. `TableSummaryDto` es la
 * version liviana, sin filas, para el selector de tablas.
 */

export type ColumnType = 'text' | 'number';

export const COLUMN_TYPES: ColumnType[] = ['text', 'number'];

/** Alto maximo del nombre de una columna. */
export const MAX_COLUMN_NAME_LENGTH = 40;

/** Tope de filas que devuelve el backend, para que una tabla enorme no reviente el widget. */
export const MAX_ROWS_PER_TABLE = 500;

/**
 * Valor de una celda.
 *
 * `null` y no `undefined` porque es lo que se guarda: una celda vacia esta
 * VACIA, no ausente. Un `number` nunca es `NaN` -- lo valida el backend.
 */
export type CellValue = string | number | null;

/** Los valores de una fila, indexados por `columnId` y NO por nombre. */
export type RowValues = Record<string, CellValue>;

export interface TableColumnDto {
  /** Estable entre renombrar: es la clave de `RowValues`. */
  id: string;
  name: string;
  type: ColumnType;
}

export interface TableRowDto {
  id: string;
  values: RowValues;
  position: number;
}

export interface TableDto {
  id: string;
  name: string;
  columns: TableColumnDto[];
  rows: TableRowDto[];
  /**
   * Filas REALES de la tabla, que puede ser mas que `rows.length`.
   *
   * `rows` viene capado a `MAX_ROWS_PER_TABLE` para que una tabla enorme no
   * reviente el widget. Sin este numero el cliente no puede distinguir "esta
   * tabla tiene 12 filas" de "esta tabla tiene 12 de 2.400", y acabaria
   * mostrando un total que no es el de la tabla.
   */
  rowCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TableSummaryDto {
  id: string;
  name: string;
  rowCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Columns iniciales de una tabla: `Name` (texto) y `Value` (numerico).
 *
 * Es el punto de partida, no una imposicion: el usuario renombra, borra y agrega
 * las que quiera. Se siembran dos porque una tabla sin ninguna columna es una
 * pantalla en blanco de la que no se puede salir, y una sola no muestra la
 * diferencia entre los dos tipos.
 */
export const DEFAULT_TABLE_COLUMNS: { name: string; type: ColumnType }[] = [
  { name: 'Name', type: 'text' },
  { name: 'Value', type: 'number' },
];

export interface CreateTableDto {
  name?: string;
  columns?: TableColumnDto[];
}

export interface UpdateTableDto {
  name?: string;
  columns?: TableColumnDto[];
}

export interface CreateTableRowDto {
  values?: RowValues;
}

export interface UpdateTableRowDto {
  values?: RowValues;
  position?: number;
}

/**
 * Las columnas iniciales, cada una con un id nuevo.
 *
 * El id se genera en el cliente y NO en el servidor a proposito: la vista y el
 * widget agregan columnas optimistas --la fila nueva se dibuja antes de que
 * llegue la respuesta-- y para eso hace falta el id antes de llamar al backend.
 * El servidor tambien genera uno propio cuando `POST /tables` no recibe columnas,
 * que es el caso de la creacion automatica del widget.
 *
 * Usa el `crypto` global, que existe en Node y en navegador. En navegador pide
 * contexto seguro: los dos casos de esta app --el dev server y el servidor
 * estatico de Electron-- son `localhost`, asi que lo son.
 */
export function defaultTableColumns(): TableColumnDto[] {
  return DEFAULT_TABLE_COLUMNS.map((c) => ({
    id: crypto.randomUUID(),
    name: c.name,
    type: c.type,
  }));
}

/** Columna nueva suelta, para el boton "+" de la grilla. */
export function newTableColumn(type: ColumnType = 'text'): TableColumnDto {
  return { id: crypto.randomUUID(), name: type === 'number' ? 'Value' : 'Name', type };
}
