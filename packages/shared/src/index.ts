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
  createdAt: string;
  updatedAt: string;
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
 * borrar sin tocar los bloques que la usa.
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
  /** Uno de `TAG_COLORS`, o `null` cuando la paleta ya no tiene uno libre.
   *
   * Puede ser `null` y no un id raro: la paleta es chica a proposito, y cuando se
   * agota la etiqueta nueva se queda sin color en vez de repetir el de otra.
   */
  color: TagColorId | null;
  /** Cantidad de bloques que la usan. Viene del servidor, no se cuenta en el cliente. */
  eventCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTagDto {
  name: string;
  /** Si no viene, el servidor elige con `nextFreeTagColorId`. */
  color?: TagColorId;
}

export interface UpdateTagDto {
  name?: string;
  color?: TagColorId;
}

/**
 * Paleta de etiquetas -- DIEZ colores del arco frio.
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
 * Se ampliaron 4 colores más al arco original (blue, lime, teal, violet,
 * orchid, rose) para llegar a 10. Los nuevos son: cyan, indigo, slate y sky.
 * Todos pasaron contraste WCAG AA sobre #191919 y #121212 al momento de agregarse.
 *
 * `nextFreeTagColorId` devuelve siempre un color de los 10 (nunca `null`),
 * garantizando que ninguna categoría quede sin color o blanca por default.
 */
export const TAG_COLORS = [
  { id: 'blue', hex: '#4E8FD4' },
  { id: 'lime', hex: '#7FA83A' },
  { id: 'teal', hex: '#2E9E92' },
  { id: 'violet', hex: '#8E7BD6' },
  { id: 'orchid', hex: '#C268B8' },
  { id: 'rose', hex: '#D9698C' },
  { id: 'cyan', hex: '#06B7F5' },
  { id: 'indigo', hex: '#6366F1' },
  { id: 'slate', hex: '#64748B' },
  { id: 'sky', hex: '#0EA5E9' },
] as const;

export type TagColorId = (typeof TAG_COLORS)[number]['id'];

/** El hex de un color de la paleta, o `null` si la etiqueta no tiene color.
 *
 * `null` y vacio significan "sin color" y se ven neutrales. Un id que no esta en
 * la paleta --un dato viejo, como el `#4E8FD4` que era el default del schema-- cae
 * al primero: es un valor que ya estaba guardado y no hay forma de saber a cual
 * queria decir, asi que se le da el de la paleta y no se pierde el dato.
 */
export function tagColorHex(id: TagColorId | null | undefined): string | null {
  if (!id) return null;
  return TAG_COLORS.find((c) => c.id === id)?.hex ?? TAG_COLORS[0].hex;
}

export function isTagColorId(value: unknown): value is TagColorId {
  return TAG_COLORS.some((c) => c.id === value);
}

/** Devuelve el primer color de los 10 que NO este en el conjunto `used`.
 *
 * Siempre devuelve un `TagColorId` (nunca `null`), cumpliendo el requisito de
 * "bajo ninguna circunstancia una categoría será de color blanco default":
 * si los 10 colores ya los tienen otras categorias, devuelve el primero de la
 * paleta (duplicado permitido, pero al menos es un color real de la paleta).
 *
 * @param used Conjunto de IDs de colores ya asignados a otras categorias.
 * @returns Un color libre de la paleta de 10.
 */
export function nextFreeTagColorId(used: readonly TagColorId[] = []): TagColorId {
  const tomados = new Set(used);
  const libre = TAG_COLORS.find((c) => !tomados.has(c.id));
  if (libre) return libre.id;
  // Todos los 10 colores ya los tienen otras etiquetas.
  // Como las duplicaciones ahora están permitidas, devolvemos el primero
  // para cumplir el requisito de "nunca color blanco default".
  return TAG_COLORS[0].id;
}

/** Compatibilidad: alias de `nextFreeTagColorId` para código que use el nombre viejo. */
export function nextTagColorId(used: readonly TagColorId[] = []): TagColorId {
  return nextFreeTagColorId(used);
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

export type ColumnType = 'text' | 'number' | 'checkbox' | 'date' | 'status' | 'select';

export const COLUMN_TYPES: ColumnType[] = [
  'text',
  'number',
  'checkbox',
  'date',
  'status',
  'select',
];

/**
 * Como se llama cada tipo en la interfaz.
 *
 * Vive aca y no en la grilla porque lo necesitan TRES lugares --el submenu de
 * "Change type", el menu del "+" y el `title` del encabezado-- y son tres copias
 * de un `t === 'x' ? 'X' : 'Y'` que hay que actualizar cada vez que aparece un
 * tipo nuevo. Olvidarse uno deja el menu diciendo "Text" donde deberia decir
 * "Checkbox".
 */
export const COLUMN_TYPE_LABELS: Record<ColumnType, string> = {
  text: 'Text',
  number: 'Number',
  checkbox: 'Checkbox',
  date: 'Date',
  status: 'Status',
  select: 'Select',
};

/**
 * Una opcion de una columna `select`.
 *
 * El `id` es lo que se guarda en la celda y la `label` es lo que se ve. Es la
 * misma separacion que hay entre el nombre y el `id` de una columna, y va en el
 * mismo lugar por el mismo motivo: con la etiqueta sola, renombrar una opcion
 * dejaria las celdas que la usaban apuntando a un texto que ya no existe, y
 * borrarla dejaria filas con un valor que no se puede volver a elegir.
 *
 * Con el `id` el renombrado no toca NINGUN valor --solo cambia lo que se ve-- y el
 * borrado es el unico caso que limpia celdas, y lo limpia el servidor en la misma
 * transaccion que escribe el esquema.
 */
export interface ColumnOption {
  id: string;
  label: string;
  /** Color de la categoria, uno de `TAG_COLORS`. Ausente = sin color, que
   * pasa cuando la paleta ya no tiene ninguno libre y la categoria queda
   * neutra (texto gris). Nunca es `undefined` o vacio por diseño: el default
   * siempre asigna uno de los 10 colores. */
  color?: TagColorId;
}

/** Una categoria nueva, con su `id` y con EL PRIMER COLOR DE LA PALETA QUE NINGUNA
 * DE LAS EXISTENTES TIENE -- de los 10 colores disponibles.
 *
 * Es la unica funcion que crea opciones y es la que garantiza que dos categorias
 * de la misma columna no compartan color por default: recibe las que ya hay y se
 * saltea las usadas. Cuando la paleta se agota (las 10 ya las tienen todas las
 * demas categorias), devuelve la categoria con el primer color de la paleta
 * (duplicado permitido, pero nunca color blanco/default), para cumplir el
 * requisito de "nunca color blanco default".
 *
 * Con el llamado `newColumnOption(label, options)` el color se elige automatico;
 * para asignar un color manual se usa directamente `{ id, label, color }`.
 */
export function newColumnOption(
  label: string,
  existentes: readonly ColumnOption[] = [],
): ColumnOption {
  const color = nextFreeTagColorId(existentes.map((o) => o.color).filter((c): c is TagColorId => !!c));
  return { id: crypto.randomUUID(), label, ...(color ? { color } : {}) };
}

/**
 * Como se muestra un numero, segun la columna.
 *
 * `plain` es lo que se vena haciendo siempre --el numero tal cual-- y sigue siendo
 * el default: una columna sin `format` no cambia ni un pixel de lo que ya se
 * veia. Los otros dos son los que se piden al configurar la columna.
 */
export type NumberFormat = 'plain' | 'currency' | 'percent';

export const NUMBER_FORMATS: NumberFormat[] = ['plain', 'currency', 'percent'];

/** Simbolo de la moneda cuando no se aclara. */
export const DEFAULT_CURRENCY = '$';

/**
 * Los tres estados de una columna `status`.
 *
 * El orden NO es el alfabetico sino el del avance: sin empezar, en curso, terminado.
 * Es el orden en que se arma el menu, para que el ojo baje de lo que hay que
 * mirar a lo que ya no importa.
 *
 * Fijo, no configurable por columna. Un set editable por columna --"en revision",
 * "bloqueado", "cancelado"-- es otra feature, con su schema y su editor; aca son
 * tres y son los tres que el color puede distinguir de verdad.
 */
export const STATUS_VALUES = ['not_started', 'in_progress', 'completed'] as const;

export type StatusValue = (typeof STATUS_VALUES)[number];

export const STATUS_LABELS: Record<StatusValue, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
};

/**
 * Si el valor es uno de los tres estados.
 *
 * Vive aca porque lo necesitan los mismos dos lados que los tipos: la grilla lo
 * usa para no dibujar un estado que no existe y el servidor para rechazar con un
 * 400 lo que no es un estado. Con dos listas distintas, una fila puede quedar
 * guardada con un valor que la grilla no sabe pintar.
 */
export function isStatusValue(value: unknown): value is StatusValue {
  return typeof value === 'string' && (STATUS_VALUES as readonly string[]).includes(value);
}

/**
 * Si el valor es el `id` de una de las opciones de una columna `select`.
 *
 * Mismo criterio que `isStatusValue` y por el mismo motivo: la grilla y el
 * servidor tienen que aceptar exactamente lo mismo, o el cliente deja pasar un
 * valor que el servidor tira con un 400.
 */
export function isOptionValue(
  options: readonly ColumnOption[] | undefined,
  value: unknown,
): value is string {
  return typeof value === 'string' && !!options?.some((o) => o.id === value);
}

/**
 * Si el valor es una FECHA de solo dia en ISO: `AAAA-MM-DD`.
 *
 * Sin hora y sin zona a proposito. `AAAA-MM-DDTHH:mm:ssZ` es otra cosa --un
 * instante-- y meterlo en una columna de fechas mezcla dos preguntas: que dia es,
 * y a que hora. Aparte, un instante guardado como texto ordena mal contra otro
 * con la misma fecha en otra zona, y una fecha de solo dia ordena bien siempre.
 *
 * El formato es el que ordena por orden alfabetico, que es como se guarda, y el
 * que se puede comparar sin interpretarlo. Lo que se MUESTRA es otra cosa --ver
 * `formatDate` en la tabla--: guardar y mostrar no tienen por que ser lo mismo.
 *
 * El round-trip en UTC es lo que descarta las fechas que no existen: el parser de
 * ISO acepta `2026-02-30` y la convierte en el 2 de marzo, asi que sin comparar
 * con lo que se volvia a escribir, un 30 de febrero pasaria como fecha.
 */
export function isIsoDate(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const fecha = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === value;
}

/**
 * Lee una fecha este donde venga y la devuelve en el formato guardado, o `null`.
 *
 * Acepta las dos formas que se escriben: `AAAA-MM-DD` --como esta guardado-- y
 * `DD/MM/AAAA`, que es como se muestra y como se tipea. La segunda entra porque
 * si no, una columna de texto con las fechas escritas como las ve el usuario
 * perderia todo al pasarla a `date`, y el cartel de confirmar diria la verdad
 * tecnica --"no son fechas"-- sobre algo que el usuario escribe como fecha todos
 * los dias.
 *
 * Vive en `shared` y no duplicada en cliente y servidor: los dos tienen que
 * aceptar exactamente lo mismo, o el cliente deja pasar un valor que el servidor
 * tira con un 400.
 */
export function normalizeDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (isIsoDate(t)) return t;
  const m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(t);
  if (!m) return null;
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return isIsoDate(iso) ? iso : null;
}

/** Alto maximo del nombre de una columna. */
export const MAX_COLUMN_NAME_LENGTH = 40;

/**
 * Alto maximo de la etiqueta de una opcion.
 *
 * Va en el mismo lugar y por el mismo motivo que el del nombre: es texto que se
 * dibuja en un menu angosto, y una etiqueta de 300 caracteres empuja el panel
 * entero fuera de la pantalla.
 */
export const MAX_OPTION_LENGTH = 40;

/**
 * Piso y techo del ancho de una columna, en px.
 *
 * El piso es el `min-w-[3rem]` que ya tienen las celdas: por debajo, el track fijo
 * queda mas angosto que su contenido y las dos reglas se pelean. El techo no es un
 * limite de diseno sino de memoria: una columna de 4000px empuja a todas las demas
 * fuera de la pantalla.
 */
export const MIN_COLUMN_WIDTH = 48;
export const MAX_COLUMN_WIDTH = 720;

/** Tope de filas que devuelve el backend, para que una tabla enorme no reviente el widget. */
export const MAX_ROWS_PER_TABLE = 500;

/**
 * Valor de una celda.
 *
 * `null` y no `undefined` porque es lo que se guarda: una celda vacia esta
 * VACIA, no ausente. Un `number` nunca es `NaN` -- lo valida el backend-- y un
 * `boolean` solo aparece en una columna `checkbox`.
 *
 * En una columna `checkbox`, "sin marcar" y "marcado en falso" se dibujan igual
 * y NO son lo mismo guardado: lo primero es que la celda nunca se toco.
 */
export type CellValue = string | number | boolean | null;

/** Los valores de una fila, indexados por `columnId` y NO por nombre. */
export type RowValues = Record<string, CellValue>;

export interface TableColumnDto {
  /** Estable entre renombrar: es la clave de `RowValues`. */
  id: string;
  name: string;
  type: ColumnType;
  /**
   * Ancho en px, cuando el usuario lo ajusto arrastrando el divisor.
   *
   * Ausente = `max-content`: la columna se mide por su contenido, que es el estado
   * inicial de toda columna. Un numero la fija, y es lo que la hace dejar de
   * crecer sola.
   *
   * Vive en la COLUMNA y no en el widget porque la tabla es una sola: si el ancho
   * fuera del widget, la vista tendria otro y abrir la tabla a pantalla completa
   * cambiaria todos los anchos.
   */
  width?: number;
  /** Las opciones de una columna `select`. Solo tiene sentido en esa. */
  options?: ColumnOption[];
  /**
   * Como se muestran los numeros de una columna `number`.
   *
   * Es solo presentacion: el valor guardado es el numero pelado, y el editor de la
   * celda muestra el numero pelado tambien. Por eso una columna con `currency`
   * acepta lo que siempre acepto --`Number()`-- y no hay que aprender a escribir
   * "$1.200,50" para poder editarla.
   */
  format?: NumberFormat;
  /**
   * Simbolo de la moneda, cuando `format` es `currency`.
   */
  currency?: string;
  /**
   * Numero de decimales a mostrar (solo para columnas `number`).
   * `undefined` = mostrar todos los decimales necesarios.
   */
  decimals?: number;
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
  const name =
    type === 'number'
      ? 'Value'
      : type === 'checkbox'
        ? 'Done'
        : type === 'date'
          ? 'Date'
          : type === 'status'
            ? 'Status'
            : type === 'select'
              ? 'Select'
              : 'Name';
  /*
   * Una `select` nace SIN opciones, a diferencia de `Name` y `Value`.
   *
   * Sembrar "Option 1" y "Option 2" dejaba la columna con dos categorias que
   * nadie pidio y que hay que borrar antes de usar; las de verdad se escriben en
   * el menu de la celda, que es donde uno las necesita. Sin opciones la celda se
   * ve vacia y el menu ofrece crear una: se puede usar desde el primer segundo.
   */
  const column: TableColumnDto = { id: crypto.randomUUID(), name, type };
  return column;
}

/* -------------------------------------------------------------------------- */
/* Auth                                                                       */
/* -------------------------------------------------------------------------- */

export interface UserDto {
  id: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterDto {
  email: string;
  password: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface AuthResponseDto {
  user: UserDto;
  accessToken: string;
  refreshToken: string;
}

export interface SessionDto {
  id: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
}

export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface ChangeEmailDto {
  currentPassword: string;
  newEmail: string;
}