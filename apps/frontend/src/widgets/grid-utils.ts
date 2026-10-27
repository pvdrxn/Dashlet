import type { Position, WidgetData } from './types';

/*
 * Dashboard al estilo home screen: grilla de 12 columnas, los widgets se
 * colocan donde se quiera y ocupan las celdas que quieran.
 *
 * La diferencia con el modelo de celdas fijas (y con el canvas libre en
 * pixeles que hubo antes) es que la posicion **y** el tamano van en celdas
 * enteras, no en pixeles. Snappear es entonces una division, no un redondeo
 * sobre un tamano arbitrario, y dos widgets nunca pueden ocupar medio像素.
 *
 * Invariante que se mantiene siempre: ningun par de widgets se solapa.
 */

/**
 * Columnas de la grilla: **no es un numero fijo**. Sale de cuanto entre en el
 * ancho disponible con celdas de CELL_W, y se recalcula en cada resize.
 * Ver `colsForWidth`.
 *
 * GRID_COLS quedo como valor por defecto para los tests y para cuando todavia
 * no se midio el contenedor.
 */
export const GRID_COLS = 12;

/** Cuantas filas se dibujan de sobra siempre, para tener donde soltar. */

/** Tope de vueltas del empuje, para que un caso patologico no cuelgue. */
const MAX_PUSH_STEPS = 64;

/** Separacion entre celdas, en px. */
export const CELL_GAP = 8;

/*
 * La celda tiene un tamano FIJO, no proporcional a la ventana.
 *
 * Es la diferencia con el canvas anterior: si la celda dependiera del ancho
 * disponible, al achicar la ventana cada celda encogeria y todos los widgets
 * con ella. Con el tamano fijo el dashboard mantiene sus dimensiones y lo que
 * cambia es **cuanto se ve**: aparecen menos celdas y hay que scrollear.
 *
 * 80px hace que un widget 4x3 mida 344x256px, que es lo que necesitan la
 * mayoria; y la grilla entera ocupa 12*80 + 13*8 = 1064px.
 */
export const CELL_W = 80;
export const CELL_H = 80;

/*
 * Cuantas columnas tiene la grilla: una por cada celda de 80px que entra en el
 * ancho disponible. Es lo unico del dashboard que responde a la ventana; la
 * celda en si no cambia de tamaño, asi que los widgets tampoco.
 *
 * Los topes evitan que en una ventana enana la grilla quede de una sola
 * columna, y que en un ultrawide se haga interminable de deslizar.
 */
export const MIN_COLS = 3;
export const MAX_COLS = 24;

export function colsForWidth(containerWidth: number): number {
  const fit = Math.floor((containerWidth - CELL_GAP) / (CELL_W + CELL_GAP));
  return Math.max(MIN_COLS, Math.min(fit, MAX_COLS));
}

/**
 * Ancho del canvas: exactamente el disponible, para que nunca aparezca scroll
 * horizontal ni sobre el espacio.
 *
 * Las celdas miden 80px fijo y se alinean a la izquierda, asi que el resto no
 * se reparte entre ellas: queda como separador final, mas ancho que los otros.
 * Es la unica forma de llenar el ancho sin que ningun widget cambie de medida.
 */
export function canvasWidth(containerWidth: number, cols: number = GRID_COLS): number {
  const needed = cols * CELL_W + (cols + 1) * CELL_GAP;
  return Math.max(needed, containerWidth);
}

/** Piso global: ningun widget puede ser mas chico que 1x1. */
export const MIN_CELLS_W = 1;
export const MIN_CELLS_H = 1;

/**
 * En celdas, el alto de un widget retraido: 1.
 *
 * El header + borde miden 27px contra 88px de paso de celda, y 1 celda es la
 * menor unidad que la grilla puede expresar. No hace falta mirar el tipo: el
 * `minSize` de cada tipo esta calculado para que el CONTENIDO entre, y retraido
 * no hay contenido.
 */
export const COLLAPSED_CELLS_H = 1;

/** Tamano por defecto, en celdas. */
export const WIDGET_DEFAULT_SIZE: Record<string, { w: number; h: number }> = {
  'todo-list': { w: 4, h: 4 },
  pomodoro: { w: 3, h: 5 },
  notes: { w: 4, h: 3 },
  calculator: { w: 3, h: 5 },
  'habit-tracker': { w: 4, h: 4 },
  diary: { w: 4, h: 3 },
  /*
 * data-table: una fila compacta mide 28px (14 de texto a lh 20 + 4 de padding por
 * arriba y por abajo) y el encabezado lo mismo. Cinco celdas de alto son 432px,
 * menos los 49px que se come el frame --25 de barra y 24 de padding--, y menos el
 * encabezado y el pie: quedan 331px, once filas. Se leen sin scrollear.
 *
 * En ancho, cuatro columnas cortas miden 345px --el padding compacto es `px-1.5`
 * justamente para que entren--, mas 52 de cromo, sobre 406px de grilla: entran
 * justas. Con 4 celdas (344px) el titulo y el boton de "abrir completo" ya se
 * pisan.
 */
  'data-table': { w: 5, h: 5 },
  /*
   * calendar: mes compacto arriba y lista del dia abajo. La grilla mide 148px
   * --16 de iniciales y seis filas de 22-- y la barra del widget 24 mas 8 de
   * separacion, o sea unos 180px fijos. Cuatro celdas (344px) menos los 49 del
   * frame dejan 295: sobran 115px de lista, un subtitulo y tres bloques.
   */
  calendar: { w: 4, h: 4 },
};

/*
 * Minimo por tipo, en celdas.
 *
 * Medido contra el contenido, no estimado: con celda de 80px y gap de 8, una
 * celda mide 88*w - 8 px de ancho y 88*h - 8 de alto, y el frame se come 49px
 * (25 de barra + 24 de padding). O sea que `h: 3` = 256px y `h: 4` = 344px.
 *
 * - pomodoro: anillo fijo de 140px + barra de tecnicas + controles = 268px de
 *   contenido. En alto necesita 4 celdas; en ancho, la fila de 4 botones de
 *   control mide ~212px, asi que 2 celdas (168px) se come el contenido.
 * - calculator: display min 70px + teclado de 6 filas = 269px. Mismo alto.
 * - habit-tracker: cada fila ~32px y la lista usa minmax(230px), asi que 3
 *   celdas de ancho (256px) es lo mas angosto que no parte la grilla interna.
 * - todo-list: la fila de una tarea trae checkbox (16px) + campo de texto +
 *   selector de urgencia (`w-12` = 48px) + padding. Con 3 celdas (256px) el
 *   texto queda enanoso, asi que el minimo son 4 celdas (344px).
 * - notes: editor de texto largo. En alto 3 celdas alcanza porque el cuerpo se
 *   scrollea; en ancho 3 celdas dejan 207px de linea, que se lee como una tira,
 *   asi que el minimo son 4 (295px, medida de pagina).
 * - diary: paginado, con la barra de paginas arriba y una sola entrada por
 *   pagina. 3 celdas alcanzan en las dos direcciones.
 * - data-table: el minimo lo mandan el ANCHO y el PIE. Cuatro celdas (344px)
 *   dejan 318px de grilla, menos 52 de cromo --28 de acciones y 24 del "+"--, o
 *   sea 266px para columnas: entran dos o tres y el resto scrollea, que es lo
 *   razonable para un resumen. En alto 3 celdas (256px) no alcanzaba ni para las
 *   filas del ancho minimo: el pie "Add row" se caia y la tabla quedaba
 *   scrolleando en las dos direcciones. Con 4 (344px) entran ocho filas y el pie.
 */
export const WIDGET_MIN_SIZE: Record<string, { w: number; h: number }> = {
  'todo-list': { w: 4, h: 3 },
  pomodoro: { w: 3, h: 4 },
  notes: { w: 4, h: 3 },
  calculator: { w: 3, h: 4 },
  'habit-tracker': { w: 3, h: 3 },
  diary: { w: 3, h: 3 },
  'data-table': { w: 4, h: 4 },
  /*
   * calendar: el minimo lo manda el ALTO. Con 3 celdas (256px, 207 de cuerpo) la
   * grilla y la barra se comen 180 y la lista queda en 27px: ni un bloque. Con 4
   * entra una lista de tres. En ancho 3 celdas (232px de cuerpo) alcanzan para
   * siete columnas de 33px; el modo dia, que no lleva grilla, entra sobrado.
   */
  calendar: { w: 3, h: 4 },
};

/*
 * Maximo por tipo, en celdas.
 *
 * Es lo que evita el segundo sintoma: al agrandar de mas, el contenido queda
 * flotando en el medio de una celda enorme (el pomodoro centra su anillo con
 * `justify-center`, asi que crece alrededor del anillo y se ve descolgado).
 * Con techo, agrandar tiene un tope razonable.
 */
export const WIDGET_MAX_SIZE: Record<string, { w: number; h: number }> = {
  'todo-list': { w: 8, h: 10 },
  pomodoro: { w: 5, h: 7 },
  notes: { w: 10, h: 8 },
  calculator: { w: 4, h: 8 },
  'habit-tracker': { w: 8, h: 10 },
  diary: { w: 8, h: 8 },
  // 12 celdas de ancho: una tabla con muchas columnas scrollea en horizontal, y
  // el tope alto es justamente para que eso sea util en vez de un castigo.
  'data-table': { w: 12, h: 12 },
  // 8 de ancho ya reparte grilla y lista lado a lado; mas alla las celdas del mes
  // se estirarian sin ganar nada. 6 de alto da una lista de diez bloques.
  calendar: { w: 8, h: 6 },
};

export const FALLBACK_SIZE = { w: 4, h: 3 };
export const FALLBACK_MIN_SIZE = { w: 3, h: 3 };
export const FALLBACK_MAX_SIZE = { w: 8, h: 8 };

export function defaultSize(type: string): { w: number; h: number } {
  return WIDGET_DEFAULT_SIZE[type] ?? FALLBACK_SIZE;
}

export function minSize(type: string): { w: number; h: number } {
  return WIDGET_MIN_SIZE[type] ?? FALLBACK_MIN_SIZE;
}

export function maxSize(type: string): { w: number; h: number } {
  return WIDGET_MAX_SIZE[type] ?? FALLBACK_MAX_SIZE;
}

/** ¿Este rect se sale del dashboard? */
export function outOfBounds(p: Position): boolean {
  return p.x < 0 || p.y < 0 || p.x + p.w > GRID_COLS || p.y + p.h < 0;
}

/** ¿Se pisan dos rectangulos? */
export function rectsOverlap(a: Position, b: Position): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function occupantOf(
  widgets: WidgetData[],
  rect: Position,
  exceptId: string,
): WidgetData | undefined {
  return widgets.find((w) => w.id !== exceptId && rectsOverlap(w.position, rect));
}

/**
 * Ajusta un rect a la grilla: entero, dentro de la grilla, y entre el minimo y
 * el maximo del tipo. Es el unico lugar donde se decide que un rect es valido.
 */
export function clampRect(
  rect: Position,
  type: string,
  cols: number = GRID_COLS,
  minH?: number,
): Position {
  const min = minSize(type);
  const max = maxSize(type);

  // Tres techos, del mas laxo al mas estricto: la grilla, el maximo del tipo y
  // 1 celda. Si un widget fuera mas ancho que la grilla, ocuparia la fila
  // entera; descontar despues dejaria x en negativo.
  let w = Math.round(rect.w);
  if (!Number.isFinite(w)) w = defaultSize(type).w;
  w = Math.max(Math.min(w, cols, max.w), MIN_CELLS_W);

  let h = Math.round(rect.h);
  if (!Number.isFinite(h)) h = defaultSize(type).h;
  h = Math.max(Math.min(h, max.h), MIN_CELLS_H);

  // El minimo del tipo, pero sin volver a pasarse del techo. `minH` lo pisa el
  // llamador para el widget retraido, que tiene que poder bajar a 1 celda sin
  // que este clamp lo vuelva a subir en el siguiente normalize.
  w = Math.max(w, Math.min(min.w, cols, max.w));
  h = Math.max(h, Math.min(minH ?? min.h, max.h));

  return {
    x: Math.max(0, Math.min(Math.round(rect.x) || 0, cols - w)),
    y: Math.max(0, Math.round(rect.y) || 0),
    w,
    h,
  };
}

/**
 * Alto minimo en celdas de un widget concreto.
 *
 * Retraido son 1 celda; desplegado, el minimo de su tipo. Va aparte de
 * `minSize` porque el minimo de tipo esta medido contra el CONTENIDO, y un
 * widget retraido no muestra contenido.
 */
export function minHeightOf(widget: WidgetData): number {
  return widget.config.collapsed ? COLLAPSED_CELLS_H : minSize(widget.type).h;
}

/**
 * Primera ranura libre para un tamano dado, barriendo fila por fila.
 *
 * El tamano se puede pasar aparte del tipo. Si se midiera siempre contra
 * `defaultSize` y el widget se crease con `minSize`, la busqueda reservaria un
 * hueco mas grande del que hace falta y cada widget nuevo dejaria un vacio
 * invisible al costado que empuja a los siguientes hacia abajo.
 */
export function findFirstSlot(
  widgets: WidgetData[],
  type: string,
  cols: number = GRID_COLS,
  size?: { w: number; h: number },
): { x: number; y: number } {
  const { w, h } = size ?? defaultSize(type);
  const width = Math.min(w, cols);
  for (let y = 0; ; y++) {
    for (let x = 0; x + width <= cols; x++) {
      if (!occupantOf(widgets, { x, y, w: width, h }, '')) return { x, y };
    }
  }
}

/** Hacia donde se empuja a los widgets que el que se mueve va a tapar. */
export type PushDirection = 'down' | 'up' | 'left' | 'right';

/**
 * Hacia donde se empuja, segun de donde venga el widget.
 *
 * Es la direccion del GESTO y no la del lugar de destino: se usa solo para
 * desempatar cuando el widget cae encima de otro y no hay un lado mas corto.
 * Ver `awayDirection`, que es la que manda en realidad.
 */
export function pushDirectionFor(dx: number, dy: number): PushDirection {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  if (dy > 0) return 'down';
  if (dy < 0) return 'up';
  return 'down';
}

/**
 * Hacia donde se va un widget para dejarle el lugar a `drop`.
 *
 * Lo que manda no es de donde vino el gesto sino DONDE QUEDO: si al soltar el
 * widget este quedo a la izquierda del otro, el otro se va a la derecha, y al
 * reves. O sea, cada uno huye del rect soltado por el lado mas corto, que es el
 * que menos hueco tiene que abrir.
 *
 * Se comparan los centros con signo, asi que la aritmetica da el lado en que
 * hay que EXPULSAR, no el lado desde el que se entra: si el otro esta a la
 * derecha de `drop`, sale a la derecha.
 *
 * Cuando los dos centros caen en el mismo lugar -- que es justo cuando el
 * widget se solto encima del otro y no al lado -- no hay lado mas corto, y ahi
 * se vuelve al gesto: es la unica informacion que queda.
 */
function awayDirection(drop: Position, other: Position, gesture: PushDirection): PushDirection {
  const dx = other.x + other.w / 2 - (drop.x + drop.w / 2);
  const dy = other.y + other.h / 2 - (drop.y + drop.h / 2);
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  // Diagonal exacta: los dos lados pesan igual y no hay criterio para elegir.
  if (ax === ay) return gesture;
  if (ax > ay) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

/**
 * Orden en que se recorren los widgets: del mas cercano al rect soltado al mas
 * lejano.
 *
 * Asi el empuje se propaga HACIA AFUERA: el que se recorre despues todavia puede
 * estar corrido por el anterior. El desempate es el de lectura, para que dos
 * widgets a la misma distancia no cambien entre si.
 */
function dropOrder(drop: Position): (a: WidgetData, b: WidgetData) => number {
  const gap = (p: Position): number => {
    const dx = Math.max(0, Math.max(drop.x - (p.x + p.w), p.x - (drop.x + drop.w)));
    const dy = Math.max(0, Math.max(drop.y - (p.y + p.h), p.y - (drop.y + drop.h)));
    return dx + dy;
  };
  return (a, b) => gap(a.position) - gap(b.position) || a.position.y - b.position.y || a.position.x - b.position.x;
}

/** Un paso del empuje: lo que se pisa queda del lado del que viene el empuje. */
function pushStep(pos: Position, hits: Position[], dir: PushDirection): Position {
  switch (dir) {
    case 'up':
      return { ...pos, y: Math.min(...hits.map((s) => s.y)) - pos.h };
    case 'left':
      return { ...pos, x: Math.min(...hits.map((s) => s.x)) - pos.w };
    case 'right':
      return { ...pos, x: Math.max(...hits.map((s) => s.x + s.w)) };
    default:
      return { ...pos, y: Math.max(...hits.map((s) => s.y + s.h)) };
  }
}

/** ¿El rect sigue entrando en la grilla? */
function insideGrid(pos: Position, cols: number): boolean {
  return pos.x >= 0 && pos.y >= 0 && pos.x + pos.w <= cols;
}

/** Una pasada de empuje. `fits` dice si el resultado entro entero en la grilla. */
function pushPass(
  widgets: WidgetData[],
  id: string,
  rect: Position,
  cols: number,
  gesture: PushDirection,
  forced: PushDirection | null,
): { shifted: { id: string; position: Position }[]; fits: boolean } {
  // Todo lo ya resuelto. Empieza solo con el widget que se esta moviendo.
  const settled: Position[] = [rect];
  const shifted: { id: string; position: Position }[] = [];
  let fits = true;

  const others = widgets.filter((w) => w.id !== id).sort(dropOrder(rect));

  for (const other of others) {
    let pos = clampRect(other.position, other.type, cols, minHeightOf(other));
    const before = pos;

    /*
     * La direccion se decide UNA vez, contra el rect soltado. Recalcularla en
     * cada vuelta haría que el widget zigzaguease entre dos lados en vez de
     * alejarse de una.
     */
    const dir = forced ?? awayDirection(rect, pos, gesture);

    // Cada vuelta lo corre hasta quedar justo del otro lado de lo que lo pisa.
    // El limite evita un bucle infinito si algo quedara encajonado.
    for (let guard = 0; guard < MAX_PUSH_STEPS; guard++) {
      const hits = settled.filter((s) => rectsOverlap(s, pos));
      if (hits.length === 0) break;
      pos = pushStep(pos, hits, dir);
    }

    // No se re-clampa el resultado: el clamp volveria a meter al widget encima
    // de lo que lo pisa. Si se salio de la grilla, la pasada se descarta.
    if (!insideGrid(pos, cols)) fits = false;

    settled.push(pos);
    if (pos.y !== before.y || pos.x !== before.x) {
      shifted.push({ id: other.id, position: pos });
    }
  }

  return { shifted, fits };
}

/**
 * Resuelve un drop.
 *
 * No hay intercambio: el widget llega a su celda y **empuja** a los que
 * encuentra en el camino, igual que las apps del home de iOS. Cada widget
 * desplazado se corre lo justo para quedar del otro lado del que lo tapaba, y
 * si ese a su vez choca con otro, tambien se corre (el efecto se propaga).
 *
 * Hacia donde se empuja sale de DONDE QUEDO el widget, no de como se trajo: al
 * soltarlo a la izquierda de otro, ese otro se va a la derecha, y al soltarlo
 * arriba, baja. Ver `awayDirection`.
 *
 * Hacia abajo siempre hay espacio -- el canvas crece con el widget mas bajo --
 * pero hacia arriba, a la izquierda y a la derecha no: la grilla tiene borde.
 * Si en la direccion que le tocaba alguien se queda afuera, la pasada se tira
 * entera y se repite empujando todos hacia abajo.
 *
 * Devuelve null si el widget arrastrado no existe.
 */
export function resolveDrop(
  widgets: WidgetData[],
  id: string,
  target: Position,
  cols: number = GRID_COLS,
  gesture: PushDirection = 'down',
): { moved: WidgetData; shifted: { id: string; position: Position }[] } | null {
  const moving = widgets.find((w) => w.id === id);
  if (!moving) return null;

  // Piso por widget: arrastrar un widget retraido no lo despliega.
  const rect = clampRect(target, moving.type, cols, minHeightOf(moving));

  // Primero cada uno por su lado. Si alguno se queda sin grilla, la pasada se
  // descarta completa -- no se reintenta solo el que no entra, porque dejandolo
  // atado al rect soltado volveria a chocar con el -- y se repite hacia abajo.
  const first = pushPass(widgets, id, rect, cols, gesture, null);
  const result = first.fits ? first : pushPass(widgets, id, rect, cols, gesture, 'down');

  return { moved: { ...moving, position: rect }, shifted: result.shifted };
}

/** Cuantas filas hay que dibujar para que quepa todo, sin desbordar con scrollbar innecesaria. */
export function rowCountFor(widgets: WidgetData[]): number {
  const last = widgets.reduce((m, w) => Math.max(m, w.position.y + w.position.h), 0);
  return last > 0 ? last : 1;
}

/** Rect en px a partir de su rect en celdas. */
export function rectToPixels(rect: Position): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  return {
    left: CELL_GAP + rect.x * (CELL_W + CELL_GAP),
    top: CELL_GAP + rect.y * (CELL_H + CELL_GAP),
    width: rect.w * CELL_W + (rect.w - 1) * CELL_GAP,
    height: rect.h * CELL_H + (rect.h - 1) * CELL_GAP,
  };
}

/** Alto total del canvas, en px. */
export function canvasHeight(rows: number): number {
  return rows * CELL_H + (rows + 1) * CELL_GAP;
}

/** Traduce un delta en px a un delta en celdas. */
export function pxToCells(dx: number, dy: number): { dx: number; dy: number } {
  return {
    dx: Math.round(dx / (CELL_W + CELL_GAP)),
    dy: Math.round(dy / (CELL_H + CELL_GAP)),
  };
}

/** Traduce un punto del contenedor a la celda que hay debajo. */
export function pointToCell(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  cols: number = GRID_COLS,
): { x: number; y: number } {
  const col = Math.floor((clientX - rect.left - CELL_GAP) / (CELL_W + CELL_GAP));
  const row = Math.floor((clientY - rect.top - CELL_GAP) / (CELL_H + CELL_GAP));
  return {
    x: Math.max(0, Math.min(col, cols - 1)),
    y: Math.max(0, row),
  };
}

function isLegacyRect(p: Position, cols: number): boolean {
  // El modelo viejo guardaba pixeles y, en la version intermedia, `width`/`height`.
  return (
    p === null ||
    typeof p !== 'object' ||
    (p as unknown as { width?: unknown }).width !== undefined ||
    (p as unknown as { height?: unknown }).height !== undefined ||
    !Number.isFinite(p.x) ||
    !Number.isFinite(p.y) ||
    !Number.isFinite(p.w) ||
    !Number.isFinite(p.h) ||
    !Number.isInteger(p.x) ||
    !Number.isInteger(p.y) ||
    !Number.isInteger(p.w) ||
    !Number.isInteger(p.h) ||
    p.w > cols ||
    p.h > 64
  );
}

/**
 * Deja un layout valido: rects en celdas, dentro de la grilla, por encima del
 * minimo del tipo y sin solaparse.
 *
 * Los widgets que vienen del modelo viejo en pixeles (o que chocan) se vuelven a
 * colocar en la primera ranura libre, en orden de lectura. Es lo que permite
 * migrar sin script: basta con que al pintar se detecten y se repartan.
 */
export function normalizeLayout(widgets: WidgetData[], cols: number = GRID_COLS): WidgetData[] {
  const placed: WidgetData[] = [];

  for (const w of widgets) {
    const legacy = isLegacyRect(w.position, cols);
    // El piso sale del widget, no del tipo: un retraido tiene que poder quedarse
    // en 1 celda o este clamp lo desplegaria solo en cada normalize.
    const floor = minHeightOf(w);
    let rect: Position;

    if (!legacy) {
      rect = clampRect(w.position, w.type, cols, floor);
      // Si choca con lo ya colocado, se va a la primera ranura libre.
      if (occupantOf(placed, rect, '')) {
        // Se conserva el tamano que ya traia. Forzar `defaultSize` aqui
        // devolveria al default a un widget que el usuario ya agrando, y
        // agrandaria solo a los recien creados: justo lo contrario de lo que se
        // quiere, que el tamano cambie cuando el usuario lo cambie.
        const slot = findFirstSlot(placed, w.type, cols, { w: rect.w, h: rect.h });
        rect = clampRect({ ...slot, w: rect.w, h: rect.h }, w.type, cols, floor);
      }
    } else {
      const size = { w: defaultSize(w.type).w, h: floor };
      const slot = findFirstSlot(placed, w.type, cols, size);
      rect = clampRect({ ...slot, ...size }, w.type, cols, floor);
    }

    placed.push({ ...w, position: rect });
  }

  return placed;
}
