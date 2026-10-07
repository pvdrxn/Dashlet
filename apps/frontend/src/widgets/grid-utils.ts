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
const EXTRA_ROWS = 2;

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

/** Tamano por defecto, en celdas. */
export const WIDGET_DEFAULT_SIZE: Record<string, { w: number; h: number }> = {
  'todo-list': { w: 4, h: 4 },
  pomodoro: { w: 3, h: 5 },
  notes: { w: 4, h: 3 },
  calculator: { w: 3, h: 5 },
  'habit-tracker': { w: 4, h: 4 },
  diary: { w: 4, h: 3 },
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
 * - notes / diary: listas con scroll, asi que el minimo es el que deja la
 *   barra de entrada y dos filas visibles.
 */
export const WIDGET_MIN_SIZE: Record<string, { w: number; h: number }> = {
  'todo-list': { w: 4, h: 3 },
  pomodoro: { w: 3, h: 4 },
  notes: { w: 3, h: 3 },
  calculator: { w: 3, h: 4 },
  'habit-tracker': { w: 4, h: 3 },
  diary: { w: 3, h: 3 },
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
export function clampRect(rect: Position, type: string, cols: number = GRID_COLS): Position {
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

  // El minimo del tipo, pero sin volver a pasarse del techo.
  w = Math.max(w, Math.min(min.w, cols, max.w));
  h = Math.max(h, Math.min(min.h, max.h));

  return {
    x: Math.max(0, Math.min(Math.round(rect.x) || 0, cols - w)),
    y: Math.max(0, Math.round(rect.y) || 0),
    w,
    h,
  };
}

/** Primera ranura libre para un tamano dado, barriendo fila por fila. */
export function findFirstSlot(
  widgets: WidgetData[],
  type: string,
  cols: number = GRID_COLS,
): { x: number; y: number } {
  const { w, h } = defaultSize(type);
  const width = Math.min(w, cols);
  for (let y = 0; ; y++) {
    for (let x = 0; x + width <= cols; x++) {
      if (!occupantOf(widgets, { x, y, w: width, h }, '')) return { x, y };
    }
  }
}

/**
 * Resuelve un drop.
 *
 * No hay intercambio: el widget llega a su celda y **empuja hacia abajo** a los
 * que encuentra en el camino, igual que las apps del home de iOS. Cada widget
 * desplazado baja lo justo para quedar debajo del que lo tapaba, y si ese a su
 * vez choca con otro, tambien baja (el efecto se propaga hacia abajo).
 *
 * Los widgets que quedan por encima del destino no se mueven: solo se recalcula
 * lo que esta debajo o al mismo nivel.
 *
 * Devuelve null si el widget arrastrado no existe.
 */
export function resolveDrop(
  widgets: WidgetData[],
  id: string,
  target: Position,
  cols: number = GRID_COLS,
): { moved: WidgetData; shifted: { id: string; position: Position }[] } | null {
  const moving = widgets.find((w) => w.id === id);
  if (!moving) return null;

  const rect = clampRect(target, moving.type, cols);

  // Todo lo ya resuelto. Empieza solo con el widget que se esta moviendo.
  const settled: Position[] = [rect];
  const shifted: { id: string; position: Position }[] = [];

  // Orden de lectura: lo de arriba se resuelve antes que lo de abajo, que es lo
  // que hace que el empuje vaya hacia abajo y no hacia arriba.
  const others = widgets
    .filter((w) => w.id !== id)
    .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);

  for (const other of others) {
    let pos = clampRect(other.position, other.type, cols);
    const before = pos;

    // Cada vuelta lo baja hasta quedar justo debajo de lo que lo pisa.
    // El limite evita un bucle infinito si algo quedara encajonado.
    for (let guard = 0; guard < MAX_PUSH_STEPS; guard++) {
      const hits = settled.filter((s) => rectsOverlap(s, pos));
      if (hits.length === 0) break;
      pos = { ...pos, y: Math.max(...hits.map((s) => s.y + s.h)) };
    }

    settled.push(pos);
    if (pos.y !== before.y || pos.x !== before.x) {
      shifted.push({ id: other.id, position: pos });
    }
  }

  return { moved: { ...moving, position: rect }, shifted };
}

/** Cuantas filas hay que dibujar para que quepa todo, con un margen. */

/** Cuantas filas hay que dibujar para que quepa todo, con un margen. */
export function rowCountFor(widgets: WidgetData[]): number {
  const last = widgets.reduce((m, w) => Math.max(m, w.position.y + w.position.h), 0);
  return Math.max(last + EXTRA_ROWS, 3);
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
    let rect: Position;

    if (!legacy) {
      rect = clampRect(w.position, w.type, cols);
      // Si choca con lo ya colocado, se va a la primera ranura libre.
      if (occupantOf(placed, rect, '')) {
        const size = defaultSize(w.type);
        const slot = findFirstSlot(placed, w.type, cols);
        rect = clampRect({ ...slot, w: size.w, h: size.h }, w.type, cols);
      }
    } else {
      const size = defaultSize(w.type);
      const slot = findFirstSlot(placed, w.type, cols);
      rect = clampRect({ ...slot, w: size.w, h: size.h }, w.type, cols);
    }

    placed.push({ ...w, position: rect });
  }

  return placed;
}
