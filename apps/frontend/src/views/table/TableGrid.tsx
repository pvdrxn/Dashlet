import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiPlus, FiMoreVertical, FiChevronRight, FiCheck, FiMenu } from 'react-icons/fi';
import {
  MAX_COLUMN_NAME_LENGTH,
  newTableColumn,
  type CellValue,
  type ColumnType,
  type TableColumnDto,
  type TableRowDto,
} from '@widget-master/shared';

/*
 * La tabla. Sin fetch y sin estado de datos: recibe columnas y filas y avisa.
 *
 * Es UN componente para la vista y para el widget, no dos parecidos. Es la
 * diferencia entre que corregir un detalle en la tabla lo corrija en las dos
 * superficies o solo en una: duplicarla garantiza que divergen.
 *
 * `density` cambia tamano de letra y relleno y NADA mas. Toda la logica --editar,
 * validar, navegar-- es la misma en los dos modos, que es justo por lo que vale
 * la pena tener un solo componente.
 */

export type TableDensity = 'full' | 'compact';

/** Celda que se esta editando, o `null`. */
interface Editing {
  rowId: string;
  columnId: string;
  /** Lo escrito, sin parsear. Es la fuente de verdad del input mientras edita. */
  draft: string;
  /** Error visible DENTRO de la celda. No impide editar, solo impide guardar. */
  error: string | null;
}

/**
 * Ancho de la columna de acciones de fila, fijo.
 *
 * Fijo y no `max-content` a proposito: si dependiera del contenido, la columna
 * creceria con cada boton y la grilla se moveria al vuelo.
 */
const ACTION_COL = '1.75rem';

/**
 * Ancho de la ultima columna, la del boton "+" que agrega una columna.
 *
 * FIJO y no `auto` por una razon que no es de espacio: si el track es `auto`
 * empuja el sobrante y queda una columna vacia gigante a la derecha. Con un ancho
 * fijo el "+" queda pegado a la ultima columna, que es donde uno lo busca.
 */
const ADD_COL = '1.5rem';

/**
 * Gracia antes de cerrar el submenu de tipos.
 *
 * El raton va del rotulo "Change type" a la lista en diagonal, y en diagonal pasa
 * por pixeles que no son ni del uno ni del otro. Con cierre inmediato en el
 * `mouseleave` la lista se cerraba a mitad de camino y era inaccesible: el unico
 * camino era apretar "Change type" primero. Con la gracia, volver a entrar cancela
 * el cierre y el gesto se puede terminar.
 *
 * 300ms y no menos porque la gracia no es solo para el camino: uno llega a la
 * lista, se detiene a MIRAR la opcion antes de apretarla, y esa pausa tiene que
 * caber. Medido: con 200ms el menu se cerraba antes de que llegara el clic.
 */
const SUBMENU_CLOSE_MS = 300;

/** Ancho del menu de "agregar columna". Va en el calculo de donde se ancla. */
const ADD_MENU_W = 128;

/*
 * Las dos densidades.
 *
 * En `compact` --el widget-- el texto es de 14px, el mismo de Habits, Diary y
 * Todo List. Antes era 10px en los encabezados y 12px en los valores: el unico
 * lugar de la app por debajo de 14, y el unico que se alejaba del sistema.
 *
 * Subirlo de 12 a 14 en los valores ensancha cada columna ~8%: cuatro columnas
 * pasaron de 319px a 361px, contra 354px disponibles. Por eso el padding
 * compacto baja a `px-1.5`: son 4px por columna y devuelven el ajuste exacto.
 *
 * Y con los dos a 14px el encabezado YA NO se distingue por el tamano --seria
 * inventar una jerarquia que no hay--, asi que la separacion la carga la banda
 * de fondo. Ver `HEAD_BG` y `HEAD_TEXT`.
 *
 * En `full` --la vista-- el encabezado queda en 12px: ahi si hay sitio para que
 * el tamano haga el trabajo, y la vista es la superficie de trabajo.
 *
 * El padding vertical compacto es de 2px y no de 4 a proposito: el boton de la
 * celda mide 24px --el piso de target de la propia app--, y con 4px de padding la
 * fila queda en 33px y solo entran 8 filas. Con 2px quedan 29px y entran 10.
 */
const DENSITY = {
  full: { text: 'text-sm', pad: 'px-3 py-2', padY: 'py-2', head: 'text-xs' },
  compact: { text: 'text-sm', pad: 'px-1.5 py-0.5', padY: 'py-0.5', head: 'text-sm' },
} as const;

/** Como se muestra un valor guardado. El vacio es cadena vacia, nunca "null". */
function display(value: CellValue): string {
  return value === null || value === undefined ? '' : String(value);
}

/**
 * Resultado de convertir lo escrito al tipo de la columna.
 *
 * Es un objeto discriminado y no `CellValue | string` a proposito: `CellValue`
 * YA incluye `string`, asi que el valor de una celda de texto y el mensaje de
 * error son el mismo tipo. Con `typeof parsed === 'string'` para detectar el
 * error, NINGUNA celda de texto se podia guardar -- se tomato siempre como
 * error-- y por ahi no guardaban ni Enter ni Tab ni el blur.
 */
type Parsed = { ok: true; value: CellValue } | { ok: false; error: string };

/**
 * Convierte lo escrito al tipo de la columna.
 *
 * El numerico devuelve `null` para el vacio. Ojo con `Number('')`, que es `0`:
 * un input numerico en blanco se guardaria como un cero falso, que es el peor
 * resultado posible porque no se distingue de un cero escrito a proposito.
 */
function parseDraft(column: TableColumnDto, draft: string): Parsed {
  if (column.type === 'text') return { ok: true, value: draft };
  const trimmed = draft.trim();
  if (!trimmed) return { ok: true, value: null };
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return { ok: false, error: 'Not a number' };
  return { ok: true, value: parsed };
}

interface TableGridProps {
  columns: TableColumnDto[];
  rows: TableRowDto[];
  density?: TableDensity;
  /** Guarda UNA celda. El padre reemplaza el objeto `values` entero. */
  onCellChange: (rowId: string, columnId: string, value: CellValue) => void;
  onRowAdd: () => void;
  /**
   * Reemplaza el esquema entero.
   *
   * Es la LISTA COMPLETA en su orden final, no un parche: asi el backend puede
   * borrar en una sola transaccion las claves de las columnas que desaparecieron
   * en todas las filas, y no necesita que le digamos cual era.
   */
  onColumnsChange: (columns: TableColumnDto[]) => void;
  /**
   * Reordena filas moviendo UNA.
   *
   * `next` es la lista completa en su orden final y `position` el valor que hay que
   * guardar para la fila movida. Se manda solo la posicion --y no la lista entera
   * de positions-- porque las del servidor son promedios entre vecinos: alcanza con
   * colocarla entre los dos que la rodean y las demas no se tocan.
   */
  onRowReorder: (next: TableRowDto[], rowId: string, position: number) => void;
  /** Filas que quedaron sin cargar por el tope de `MAX_ROWS_PER_TABLE`. */
  hiddenRowCount?: number;
}

export function TableGrid({
  columns,
  rows,
  density = 'full',
  onCellChange,
  onRowAdd,
  onColumnsChange,
  onRowReorder,
  hiddenRowCount = 0,
}: TableGridProps) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const d = DENSITY[density];

  /* ---------------------------------------------------------------------- */
  /* Arrastre de filas                                                       */
  /* ---------------------------------------------------------------------- */

  /**
   * Arrastre VERTICAL de filas, con el icono de la columna de acciones.
   *
   * Es el mismo esqueleto que el de columnas --preview en vivo, transform pintado
   * por variable CSS, un solo PATCH al soltar-- pero aca la geometria es mas
   * simple: todas las filas miden lo mismo, asi que la posicion natural de la
   * fila `i` es `i * altoFila` y se CALCULA. Con las columnas habia que medir el
   * DOM y el problema fue que el `offsetLeft` que se leia era del orden anterior;
   * aqui no hay nada que medir y ese problema no puede aparecer.
   */
  const [dragRowId, setDragRowId] = useState<string | null>(null);
  /** Orden en vivo de las filas mientras se arrastra. `null` cuando no se arrastra. */
  const [rowPreview, setRowPreview] = useState<TableRowDto[] | null>(null);
  const rowDragRef = useRef<{
    id: string;
    startY: number;
    movido: boolean;
    pointerId: number;
    grid: HTMLElement | null;
    grabOffset: number;
    dy: number;
    /** Alto de UNA fila, medido al empezar. Toda fila mide lo mismo. */
    altoFila: number;
    /**
     * Alto de la BANDA del encabezado, que va por encima de la primera fila.
     *
     * Sin esto la posicion natural se calculaba como `indice * altoFila` y le
     * faltaba el encabezado entero: todo el arrastre arrastraba ese error. Medido,
     * 30px, que es justo la altura de la banda en compacto.
     */
    altoEncabezado: number;
  } | null>(null);

  /**
   * El desplazamiento de la fila que se arrastra, como variable CSS.
   *
   * Por la misma razon que en las columnas: el puntero se mueve unas 60 veces por
   * segundo y pasar por estado de React repintaria las 500 celdas de la fila en
   * cada movimiento.
   */
  const pintarDy = (dy: number) => {
    gridRef.current?.style.setProperty('--dy', `${Math.round(dy)}px`);
  };

  const rowOrder = rowPreview ?? rows;

  /* ---------------------------------------------------------------------- */
  /* Arrastre de columnas                                                   */
  /* ---------------------------------------------------------------------- */

  const [dragId, setDragId] = useState<string | null>(null);
  /**
   * Orden en vivo mientras se arrastra. `null` cuando no se arrastra.
   *
   * El preview vive ACA y no en el padre a proposito: durante el arrastre el
   * orden cambia varias veces por segundo y cada cambio dispararia un PATCH al
   * servidor. Se confirma una sola vez, al soltar.
   *
   * Es tambien lo que hace que se sienta como Notion: las demas columnas se
   * mueven en vivo mientras se arrastra, en vez de saltar al soltar.
   */
  const [preview, setPreview] = useState<TableColumnDto[] | null>(null);
  /** Movimiento minimo antes de empezar a arrastrar, para no secuestrar el clic. */
  const DRAG_THRESHOLD_PX = 4;
  const dragRef = useRef<{
    id: string;
    startX: number;
    movido: boolean;
    pointerId: number;
    grid: HTMLElement | null;
    /** Distancia del puntero al borde izquierdo de la columna, en px. */
    grabOffset: number;
    /** Transform aplicado, en px. */
    dx: number;
    /** Ancho de cada columna, cacheado al empezar el arrastre. */
    ancho: Record<string, number>;
  } | null>(null);
  /*
   * El `click` que sigue a un arrastre hay que tragarselo.
   *
   * Soltar dispara `pointerup` y despues `click`, y ese click es el que abre el
   * renombrado: uno arrastra una columna de lugar y de paso le abre el editor de
   * nombre. Se limpia en el siguiente `pointerdown`, que es mas seguro que con
   * un `setTimeout` porque el orden entre temporizadores y eventos del navegador
   * no esta garantizado.
   */
  const tragarseClick = useRef(false);

  /*
   * Momento en que termino un arrastre que SI se movio, en ms de `performance`.
   *
   * Un bandera no alcanza para el doble clic, y este es el caso que la quemaba:
   * uno arrastra la columna y la suelta donde la agarro, el navegador ve un clic
   * --que se come `tragarseClick`-- y al clic siguiente ya dispara el doble clic
   * con la bandera en false. Resultado: mover una columna de ida y vuelta
   * terminaba abriendo el editor de nombre.
   *
   * Con una marca de tiempo el gesto queda bloqueado durante toda la ventana
   * del doble clic, que es lo que el navegador usa para decidir que dos clics
   * fueron uno.
   */
  const finDeArrastre = useRef(0);

  /** El orden que se dibuja: el de prueba si se esta arrastrando, si no el real. */
  const order = preview ?? columns;

  /*
   * El destino se saca de las posiciones VIVAS de los encabezados, no de un
   * indice acumulado. Como las otras columnas ya se movieron, sus rectangulos
   * son los que dicen donde cae el puntero ahora mismo.
   *
   * Se usa `offsetLeft` y NO `getBoundingClientRect` porque el encabezado que se
   * esta arrastrando ya lleva `translateX`, y su rectangulo mide la posicion
   * desplazada: comparada contra el puntero, esa columna daria siempre el centro
   * equivocado y no se podria dejar en su propia ranura.
   */
  const destinoBajo = (x: number): number => {
    const grid = gridRef.current;
    if (!grid) return order.length - 1;
    const heads = [...grid.querySelectorAll('[data-column-id]')] as HTMLElement[];
    const origen = grid.getBoundingClientRect().left;
    for (let i = 0; i < heads.length; i++) {
      const centro = origen + heads[i].offsetLeft + heads[i].offsetWidth / 2;
      if (x < centro) return i;
    }
    return heads.length - 1;
  };

  /**
   * El desplazamiento visual de la columna que se arrastra.
   *
   * Se escribe como variable CSS en la grilla y NO como estado de React: el
   * puntero se mueve unas 60 veces por segundo y pasar por estado repintaria las
   * 500 celdas de la columna en cada movimiento. Con la variable, el unico
   * trabajo por cuadro es una propiedad, y el navegador mueve la columna.
   */
  const pintarDx = (dx: number) => {
    gridRef.current?.style.setProperty('--dx', `${Math.round(dx)}px`);
  };

  const startDrag = (
    columnId: string,
    clientX: number,
    pointerId: number,
    grid: HTMLElement | null,
    grabOffset: number,
  ) => {
    /*
     * Los anchos se cachean UNA vez, al empezar.
     *
     * No cambian durante el arrastre --el ancho de una columna lo decide su
     * contenido, y el contenido no se esta tocando-- asi que medirlos una vez
     * alcanza y evita volver a leer el DOM en cada movimiento.
     */
    const ancho: Record<string, number> = {};
    for (const h of Array.from(
      grid?.querySelectorAll('[data-column-id]') ?? [],
    ) as HTMLElement[]) {
      ancho[h.dataset.columnId ?? ''] = h.offsetWidth;
    }
    dragRef.current = { id: columnId, startX: clientX, movido: false, pointerId, grid, grabOffset, dx: 0, ancho };
    tragarseClick.current = false;
  };

  const moveDrag = (clientX: number, buttons: number) => {
    const d0 = dragRef.current;
    if (!d0) return;
    /*
     * SIN BOTON APRETADO NO HAY ARRASTRE. Punto.
     *
     * Esta es la guarda que hace falta. El `pointerup` lo escucha la grilla, y si
     * uno suelta el puntero FUERA de la tabla --cosa facil en el widget, que es
     * chico, y en el borde de la ventana-- ese evento nunca le llega: el
     * `dragRef` queda armado y cualquier movimiento de mouse despues movia la
     * columna sin haber apretado nada. Medido: la tabla se arrastraba sola.
     *
     * `event.buttons` es el estado REAL del boton en el momento del movimiento, y
     * no depende de que a la grilla le haya llegado el `pointerup`.
     */
    if (buttons === 0) {
      endDrag();
      return;
    }
    const dx = clientX - d0.startX;
    // El umbral evita que un clic con la mano temblorosa reordene la tabla.
    if (!d0.movido && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
    if (!d0.movido) {
      d0.movido = true;
      setDragId(d0.id);
      /*
       * Capturar el puntero AHORA y no en el `pointerdown`.
       *
       * Sin captura el arrastre se corta en cuanto el cursor sale de la tabla,
       * porque los `pointermove` dejan de llegar al elemento de abajo. Pero
       * capturar desde el principio ROMPE el clic: el `click` se redirige al
       * elemento capturado --la grilla-- y el boton de renombrar deja de
       * recibirlo, asi que un clic simple no abre nada.
       *
       * Recien aqui ya se sabe que fue un arrastre, no un clic.
       */
      try {
        d0.grid?.setPointerCapture(d0.pointerId);
      } catch {
        // Algunos navegadores tiran si el puntero ya se solto; el arrastre sigue
        // funcionando mientras el cursor siga sobre la grilla.
      }
    }
    const grid = d0.grid;
    if (!grid) return;

    const base = preview ?? columns;
    const from = base.findIndex((c) => c.id === d0.id);
    if (from < 0) return;
    const to = destinoBajo(clientX);

    const next = to === from ? base : (() => {
      const n = [...base];
      n.splice(to, 0, n.splice(from, 1)[0]);
      return n;
    })();

    /*
     * La posicion natural se CALCULA, no se mide.
     *
     * Se podria leer `offsetLeft` del encabezado, pero eso obliga a adivinar en
     * que estado esta el DOM: el `offsetLeft` que se lee es del orden ANTERIOR
     * porque React todavia no aplico el nuevo, y el ancho que se necesita para
     * compensar es del orden NUEVO. Los dos.times no coinciden nunca del todo y
     * queda un residuo de unos 17px en cada cambio de ranura.
     *
     * Con los anchos cacheados al empezar el arrastre --que no cambian mientras
     * se arrastra, porque el ancho lo decide el contenido-- la cuenta es exacta y
     * usa el MISMO orden que se va a dibujar. No hay carrera con el commit.
     */
    let natural = 0;
    for (const c of next) {
      if (c.id === d0.id) break;
      natural += d0.ancho[c.id] ?? 0;
    }
    const objetivo = clientX - d0.grabOffset - grid.getBoundingClientRect().left;
    d0.dx = objetivo - natural;

    if (to !== from) setPreview(next);
    pintarDx(d0.dx);
  };

  /* ---------------------------------------------------------------------- */
  /* Arrastre de filas: movimiento, destino y cierre                          */
  /* ---------------------------------------------------------------------- */

  const startRowDrag = (
    rowId: string,
    clientY: number,
    pointerId: number,
    grid: HTMLElement | null,
    grabOffset: number,
    altoFila: number,
    altoEncabezado: number,
  ) => {
    rowDragRef.current = { id: rowId, startY: clientY, movido: false, pointerId, grid, grabOffset, dy: 0, altoFila, altoEncabezado };
    dragRef.current = null; // nunca columna y fila a la vez
  };

  const moveRow = (clientY: number, buttons: number) => {
    const d0 = rowDragRef.current;
    if (!d0) return;
    // Sin boton apretado no hay arrastre. Ver la nota de `moveDrag`.
    if (buttons === 0) {
      endRowDrag();
      return;
    }
    const dy = clientY - d0.startY;
    if (!d0.movido && Math.abs(dy) < 4) return;
    if (!d0.movido) {
      d0.movido = true;
      setDragRowId(d0.id);
      // Captura TARDE, igual que en las columnas: desde el `pointerdown` rompe el
      // clic de las celdas.
      try {
        d0.grid?.setPointerCapture(d0.pointerId);
      } catch {
        // Si el puntero ya se solto, el arrastre sigue mientras siga sobre la grilla.
      }
    }
    const grid = d0.grid;
    if (!grid) return;

    const base = rowPreview ?? rows;
    const from = base.findIndex((r) => r.id === d0.id);
    if (from < 0) return;

    /*
     * La fila donde cae el puntero.
     *
     * Todas las filas miden lo mismo, asi que la ranura es el piso de la division
     * entre la distancia y el alto -- el punto medio de la fila destino. Se resta
     * el alto del encabezado porque la grilla tiene esa banda ARRIBA de la
     * primera fila: sin el descuento, el puntero caia siempre una fila corrida.
     */
    const y = clientY - grid.getBoundingClientRect().top - d0.altoEncabezado;
    let to = Math.floor(y / d0.altoFila);
    if (to < 0) to = 0;
    if (to > base.length - 1) to = base.length - 1;

    const next = to === from ? base : (() => {
      const n = [...base];
      n.splice(to, 0, n.splice(from, 1)[0]);
      return n;
    })();

    /*
     * Natural = indice en el orden QUE SE DIBUJA, por el alto de fila.
     *
     * Usa el mismo `next` del reordenamiento, asi que cuando la fila salta de
     * ranura el transform ya viene compensado y no queda ni un cuadro de desfase.
     * Es la leccion del arrastre de columnas, que midiendo el DOM dejaba 17px de
     * residuo en cada salto.
     */
    const natural = d0.altoEncabezado + next.findIndex((r) => r.id === d0.id) * d0.altoFila;
    const objetivo = clientY - d0.grabOffset - grid.getBoundingClientRect().top;
    d0.dy = objetivo - natural;

    if (to !== from) setRowPreview(next);
    pintarDy(d0.dy);
  };

  /**
   * La `position` que hay que guardar para que la fila caiga donde quedo.
   *
   * Las posiciones del servidor son promedios entre vecinos, no indices: por eso
   * alcanza con persistir UNA fila. Si cae al principio o al final se usa un
   * entero por fuera del vecino; en el medio, el promedio de los dos.
   */
  const positionFor = (next: TableRowDto[], rowId: string): number | null => {
    const i = next.findIndex((r) => r.id === rowId);
    if (i < 0) return null;
    const antes = i > 0 ? next[i - 1] : null;
    const despues = i < next.length - 1 ? next[i + 1] : null;
    if (!antes && !despues) return null;
    if (!antes) return despues!.position - 1;
    if (!despues) return antes.position + 1;
    return (antes.position + despues.position) / 2;
  };

  const endRowDrag = () => {
    const d0 = rowDragRef.current;
    rowDragRef.current = null;
    setDragRowId(null);
    pintarDy(0);
    if (d0?.movido) {
      try {
        if (d0.grid?.hasPointerCapture(d0.pointerId)) d0.grid.releasePointerCapture(d0.pointerId);
      } catch {
        // Si ya se solto, no hay nada que liberar.
      }
    }
    const final = rowPreview;
    setRowPreview(null);
    // Sin PATCH si el orden termino igual: arrastrar y volver a dejarlo en su lugar
    // no es un cambio.
    if (!final) return;
    if (final.map((r) => r.id).join() === rows.map((r) => r.id).join()) return;
    const position = positionFor(final, d0!.id);
    if (position === null) return;
    onRowReorder(final, d0!.id, position);
  };

  const endDrag = () => {
    const d0 = dragRef.current;
    dragRef.current = null;
    setDragId(null);
    // Se vuelve a cero: si se dejaba el ultimo valor y el proximo arrastre no
    // llegara a repintar antes del primer cuadro, la columna apareceria corrida.
    pintarDx(0);
    if (d0?.movido) {
      tragarseClick.current = true;
      finDeArrastre.current = performance.now();
      try {
        if (d0.grid?.hasPointerCapture(d0.pointerId)) {
          d0.grid.releasePointerCapture(d0.pointerId);
        }
      } catch {
        // Si ya se solto, no hay nada que liberar.
      }
    }
    const final = preview;
    setPreview(null);
    // Sin PATCH si el orden termino igual: arrastrar y volver a dejarlo en su
    // lugar no es un cambio.
    if (final && final.map((c) => c.id).join() !== columns.map((c) => c.id).join()) {
      onColumnsChange(final);
    }
  };

  /*
   * Los encabezados vuelven a su sitio cuando el padre manda otro `columns`.
   *
   * Sin esto, un cambio hecho en otro lado --o el que llega de guardar-- no
   * pondria el preview a null y la grilla quedaria mostrando un orden viejo para
   * siempre.
   */
  useEffect(() => {
    setPreview(null);
  }, [columns]);

  /*
   * Red de seguridad: soltar en CUALQUIER parte del documento desarma el arrastre.
   *
   * El `pointerup` de la grilla no es suficiente porque no llega si el puntero se
   * suelta fuera de la tabla, que es el caso comun en el widget chico. Este
   * listener vive en la ventana, asi que lo ve siempre. `blur` tambien: si el
   * usuario cambia de ventana con el boton apretado, al volver el boton ya no
   * esta apretado y el arrastre tiene que estar desarmado.
   *
   * Va por un ref porque `endDrag` se recrea en cada render y el efecto no puede
   * depender de el sin re-suscribirse cada vez.
   */
  const endDragRef = useRef(endDrag);
  endDragRef.current = endDrag;
  const moveDragRef = useRef(moveDrag);
  moveDragRef.current = moveDrag;
  const endRowDragRef = useRef(endRowDrag);
  endRowDragRef.current = endRowDrag;
  const moveRowRef = useRef(moveRow);
  moveRowRef.current = moveRow;
  useEffect(() => {
    /*
     * El `pointermove` va en la VENTANA y no en la grilla, y no es una preferencia.
     *
     * Mientras el boton esta apretado, el arrastre pertenece a quien haya
     * capturado el puntero, no a quien lo recibio primero. Y hay un ancestro que
     * lo captura siempre: el cuerpo del widget toma el puntero en su `pointerdown`
     * para el long-press que colapsa. Con el puntero capturado, el navegador
     * entrega los `pointermove` a ese elemento y los hace subir desde ahi, asi que
     * la grilla --que esta ABAJO-- no los ve nunca.
     *
     * Medido en el widget: de 12 movimientos, la grilla recibia 1 y el cuerpo 12.
     * El arrastre de columnas no arrancaba nunca. En la vista, sin frame que la
     * robe, funcionaba -- y por eso el fallo solo aparecia en el widget.
     *
     * Escuchar en la ventana lo hace inmune a quien tenga la captura, venga de
     * donde venga, y de paso el arrastre sigue vivo aunque el cursor salga de la
     * tabla.
     */
    const mover = (e: PointerEvent) => {
      if (rowDragRef.current) moveRowRef.current(e.clientY, e.buttons);
      else if (dragRef.current) moveDragRef.current(e.clientX, e.buttons);
    };
    const soltar = () => {
      if (rowDragRef.current) endRowDragRef.current();
      else if (dragRef.current) endDragRef.current();
    };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', soltar);
    window.addEventListener('blur', soltar);
    return () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      window.removeEventListener('pointercancel', soltar);
      window.removeEventListener('blur', soltar);
    };
  }, []);

  /**
   * El foco depende de un STRING, no del objeto `editing`.
   *
   * Es el bug que ya se comio el editor de etiquetas: alli el efecto dependia de
   * `[editor]`, cada tecla producia un objeto nuevo, la identidad cambiaba y el
   * efecto volvia a enfocar el titulo. Escribiendo "reuniones" se empezaba en un
   * campo y se terminaba en otro.
   *
   * Con `editingKey` el efecto corre solo cuando cambia la CELDA, que es lo unico
   * que justifica volver a enfocar.
   */
  const editingKey = editing ? `${editing.rowId}:${editing.columnId}` : null;
  useEffect(() => {
    if (editingKey) inputRef.current?.focus();
  }, [editingKey]);

  /**
   * Cada columna mide exactamente lo que mide su contenido.
   *
   * `max-content` y NO `minmax(max-content, auto)`: el `auto` del max le deja
   * absorber el espacio sobrante y con dos columnas cortas la tabla se estiraba
   * a los 1280px con 610px de vacio al lado de un "Fideos". Una columna crece
   * cuando su contenido crece -- que es lo que prohibe el truncate-- pero no se
   * infla cuando el contenido es corto.
   *
   * Si la tabla no entra en el ancho disponible, el contenedor la scrollea en
   * horizontal, que se ve que hay mas, en vez de comerse el texto.
   *
   * El ultimo track es el del "+" y TODA fila tiene que emitir su celda, aunque
   * estea vacia. Ver `RowCells`: sin esa celda la grilla se desalinea entera.
   */
  const template = useMemo(
    () => [ACTION_COL, ...order.map(() => 'max-content'), ADD_COL].join(' '),
    [order.length],
  );

  /** Orden de lectura de las celdas: la fila entera y despues la siguiente. */
  const cells = useMemo(
    () => rows.flatMap((r) => order.map((c) => ({ r, c }))),
    [rows, order],
  );

  const startEditing = (row: TableRowDto, column: TableColumnDto) => {
    setEditing({
      rowId: row.id,
      columnId: column.id,
      draft: display(row.values[column.id]),
      error: null,
    });
  };

  /**
   * Guarda lo escrito y cierra.
   *
   * Si el valor no se puede convertir NO se cierra: el error queda dentro de la
   * celda y sigue editandose. Cerrar con un error a la vista dejaria una celda en
   * modo edicion que ya no tiene el foco, esperando un teclado que no va a ir.
   *
   * Devuelve si se pudo guardar, para que `move` no se mueva con un error vivo.
   */
  const commit = (): boolean => {
    if (!editing) return true;
    const column = columns.find((c) => c.id === editing.columnId);
    if (!column) {
      setEditing(null);
      return true;
    }
    const parsed = parseDraft(column, editing.draft);
    if (!parsed.ok) {
      setEditing({ ...editing, error: parsed.error });
      return false;
    }
    /*
     * Si el texto no cambio, no se guarda nada.
     *
     * Entrar en una celda vacia y salir sin escribir llegaria como `''` y
     * escribiria una cadena vacia donde antes no habia clave. Visualmente es lo
     * mismo, pero `null` y `''` no son lo mismo y lo primero es el "nunca
     * tocado". Se compara contra lo QUE SE VE, no contra el valor crudo: una
     * celda sin clave muestra `''`, asi que `'' === ''` y no se escribe.
     *
     * De paso se ahorra un PATCH por cada celda que se mira y se sale.
     */
    const row = rows.find((r) => r.id === editing.rowId);
    if (!row || display(row.values[editing.columnId]) === editing.draft) {
      setEditing(null);
      return true;
    }
    onCellChange(editing.rowId, editing.columnId, parsed.value);
    setEditing(null);
    return true;
  };

  /**
   * Escribe, y VALIDA en el acto.
   *
   * El error sale mientras se teclea y no al pulsar Enter: si solo aparece al
   * guardar, el usuario escribe "abc", pulsa Enter, y el error le llega tarde,
   * cuando ya intento cerrar la celda. Verlo al momento es lo que le permite
   * corregir antes de perder el foco.
   */
  const editDraft = (draft: string) => {
    setEditing((e) => {
      if (!e) return e;
      const column = columns.find((c) => c.id === e.columnId);
      if (!column) return { ...e, draft, error: null };
      const parsed = parseDraft(column, draft);
      return { ...e, draft, error: parsed.ok ? null : parsed.error };
    });
  };

  /** Cancelar: cerrar sin guardar. Es lo que hace Escape. */
  const cancel = () => setEditing(null);

  /**
   * Perder el foco: guarda si se puede, y si no se puede revierte.
   *
   * Distinto de `cancel` a proposito. Escape es "cancela esto"; perder el foco es
   * "termina esto", y terminar significa guardar. Aqui se revierte solo lo que no
   * se puede convertir, porque dejarlo trabado seria una celda en modo error sin
   * foco y sin forma de salir.
   */
  const blur = () => {
    if (!commit()) cancel();
  };

  /**
   * Mover el foco `delta` celdas en el orden de lectura.
   *
   * Si no se pudo guardar, no se mueve: la celda se queda mostrando el error.
   * Si el destino no existe --fin de tabla-- simplemente no pasa nada, porque
   * `commit` ya se ejecuto antes de mirar el destino.
   */
  const move = (delta: number) => {
    if (!commit()) return;
    const from = cells.findIndex(
      (x) => x.r.id === editing?.rowId && x.c.id === editing?.columnId,
    );
    const next = cells[from + delta];
    if (next) startEditing(next.r, next.c);
  };

  /* ---------------------------------------------------------------------- */
  /* Esquema: columnas                                                      */
  /* ---------------------------------------------------------------------- */

  /*
   * El modo de cada columna --renombrando, o confirmando el borrado-- vive DENTRO
   * de su `ColumnHeader` y no aca. Solo una columna se puede estar editando a la
   * vez de todos modos, y cada encabezado con `memo` no se vuelve a pintar
   * mientras se toca otro. Unico estado compartido: el menu de "agregar", que es
   * un solo boton de la grilla entera.
   */
  const [addOpen, setAddOpen] = useState(false);

  /**
   * Renombrar cambia SOLO el nombre.
   *
   * El `id` no se toca, y por eso los valores de las filas sobreviven: la clave
   * de `RowValues` es el `id` y no la etiqueta. Si el nombre queda igual o en
   * blanco no se avisa al padre, para no gastar un PATCH por abrir y cerrar.
   */
  const renameColumn = (columnId: string, name: string) => {
    const trimmed = name.trim();
    const original = columns.find((c) => c.id === columnId);
    if (!original || !trimmed || trimmed === original.name) return;
    onColumnsChange(columns.map((c) => (c.id === columnId ? { ...c, name: trimmed } : c)));
  };

  /*
   * Cambia el TIPO de una columna.
   *
   * No se toca el `id` ni los valores desde aca: el backend convierte lo que se
   * puede convertir y descarta lo que no, en la misma transaccion que escribe el
   * esquema. Es la unica forma de que el `TableDto` que vuelve aya venga con las
   * celdas ya limpias.
   */
  const changeColumnType = (columnId: string, type: ColumnType) => {
    onColumnsChange(columns.map((c) => (c.id === columnId ? { ...c, type } : c)));
  };

  const deleteColumn = (columnId: string) => {
    /*
     * El servidor quita la clave de los valores de TODAS las filas en la misma
     * transaccion. Aca solo se saca del esquema: replicar esa limpieza en el
     * cliente es duplicar una regla que ya vive en un solo sitio.
     */
    onColumnsChange(columns.filter((c) => c.id !== columnId));
  };

  const addColumn = (type: ColumnType) => {
    setAddOpen(false);
    onColumnsChange([...columns, newTableColumn(type)]);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/*
       * `overflow-auto` y no nada: una columna larga hace scroll DENTRO de la
       * tabla, nunca empuja la pagina. El encabezado va `sticky` para que siga
       * visible al bajar por las 500 filas.
       */}
      <div className="min-h-0 flex-1 overflow-auto">
        <div
          ref={gridRef}
          data-grid=""
          /*
           * Le dice al frame del widget que NO capture el puntero aca adentro.
           *
           * El frame captura en su `pointerdown` para el long-press que colapsa, y
           * con el puntero capturado el navegador reenvia `mouseup`, `click` y
           * `dblclick` al frame en vez de al elemento que uno apunto. Como el frame
           * es ANCESTRO de la grilla, estos eventos no bajan: el arrastre no
           * arrancaba y el doble clic para renombrar nunca llegaba.
           */
          data-no-widget-capture=""
          className={`grid w-max min-w-full ${dragId || dragRowId ? 'select-none' : ''}`}
          style={{ gridTemplateColumns: template }}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={endDrag}
          onClickCapture={(e) => {
            if (!tragarseClick.current) return;
            tragarseClick.current = false;
            e.stopPropagation();
            e.preventDefault();
          }}
          /*
           * El doble clic necesita el mismo descarte que el clic, pero por
           * TIEMPO y no por bandera: mira cuando termino el ultimo arrastre real
           * y descarta todo lo que venga en los siguientes 500ms, que es la
           * ventana con la que el navegador decide que dos clics fueron uno.
           *
           * Sin esto, arrastrar una columna de ida y vuelta --que es lo que hace
           * uno cuando duda donde dejarla-- terminaba abriendo el renombrado.
           */
          onDoubleClickCapture={(e) => {
            if (!tragarseClick.current && performance.now() - finDeArrastre.current > 500) return;
            tragarseClick.current = false;
            e.stopPropagation();
            e.preventDefault();
          }}
        >
          <div
            className={`sticky top-0 z-[var(--z-sticky)] bg-gray-800 ${d.pad}`}
            aria-hidden="true"
          />
          {order.map((c, i) => (
            <ColumnHeader
              key={c.id}
              column={c}
              index={i}
              total={order.length}
              pad={d.pad}
              head={d.head}
              /* Cuantas filas tienen ALGO en esta columna. Es el numero que hace
                 falta para borrar: "remove la columna" suena a borrar el titulo,
                 y lo que pasa es que las celdas pierden su valor. */
              filledRows={rows.filter((r) => display(r.values[c.id]) !== '').length}
              /*
               * Cuantos valores se perderian al pasarla a `number`. El backend
               * conserva lo numerico aunque venga escrito como texto --"10" pasa a
               * 10-- y descarta solo lo que de verdad no es numero, asi que este
               * numero es exactamente lo que se limpia.
               */
              pierdeAlPonerNumero={rows.filter((r) => {
                const v = r.values[c.id];
                return (
                  v !== null &&
                  v !== undefined &&
                  v !== '' &&
                  !Number.isFinite(Number(String(v).trim()))
                );
              }).length}
              dragging={dragId === c.id}
              onDragStart={startDrag}
              onRename={renameColumn}
              onTypeChange={changeColumnType}
              onDelete={deleteColumn}
            />
          ))}          <AddColumn
            density={density}
            padY={d.padY}
            onAdd={addColumn}
            open={addOpen}
            onOpenChange={setAddOpen}
          />

          {rowOrder.map((row, rowIndex) => (
            <RowCells
              key={row.id}
              row={row}
              rowIndex={rowIndex}
              columns={order}
              /*
               * `editing` se pasa SOLO a la fila que esta editando. A las demas
               * les llega `null`, que es un valor estable, y asi el `memo` de
               * abajo puede saltarlas: al escribir una letra solo se repinta una
               * fila y no las otras 39.
               */
              editing={editing?.rowId === row.id ? editing : null}
              inputRef={inputRef}
              pad={d.pad}
              text={d.text}
              onStart={startEditing}
              onDraft={editDraft}
              onBlur={blur}
              onCancel={cancel}
              onMove={move}
              draggingColId={dragId}
              /* Esta fila es la que se esta arrastrando de arriba abajo. */
              lifting={dragRowId === row.id}
              onGrabRow={(clientY, pointerId) => {
                const grid = gridRef.current;
                if (!grid) return;
                // El alto se mide UNA vez: todas las filas miden lo mismo y eso es
                // lo que hace exacta la cuenta de donde cae el puntero. Se mide
                // tambien la banda del encabezado, que va por encima de la primera
                // fila y si no, todo el arrastre arrastra esa diferencia.
                const primeraFila = grid.children[order.length + 3];
                const encabezado = grid.children[1];
                const altoFila = primeraFila ? primeraFila.getBoundingClientRect().height : 0;
                const altoEncabezado = encabezado ? encabezado.getBoundingClientRect().height : 0;
                if (!altoFila) return;
                const grip = grid.querySelector('[data-row-grip="' + row.id + '"]');
                const rect = (grip ?? grid).getBoundingClientRect();
                startRowDrag(row.id, clientY, pointerId, grid, clientY - rect.top, altoFila, altoEncabezado);
              }}
            />
          ))}

          {/*
           * Tabla SIN columnas. Se dibuja igual y no con un "return temprano":
           * volver atras desde ese estado es justo agregar la primera columna, y
           * con un return no habria boton de donde volver.
           */}
          {!columns.length && (
            <p className="col-span-full px-3 py-6 text-sm text-gray-500">
              This table has no columns yet. Use <span className="text-gray-300">+</span> above
              to add one.
            </p>
          )}

          {!rows.length && columns.length > 0 && (
            <p className="col-span-full px-3 py-6 text-sm text-gray-500">No rows yet.</p>
          )}
        </div>
      </div>

      {/*
       * El pie va FUERA del `overflow-auto` para que "Add row" no se vaya con el
       * scroll y siga siempre al pie de la caja.
       */}
      <div className="flex shrink-0 items-center justify-between border-t border-gray-700/60 px-1 pt-1.5">
        {/*
         * "Add row" se apaga sin columnas. Una fila sin columnas es un objeto
         * que no se puede ver ni editar: se podria crear, pero no tendria nada
         * que mostrar y solo apareceria en el conteo.
         */}
        <button
          type="button"
          onClick={onRowAdd}
          disabled={!columns.length}
          className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-gray-400 transition-colors hover:bg-white/5 hover:text-gray-200 disabled:opacity-30"
        >
          <FiPlus size={12} />
          Add row
        </button>
        {hiddenRowCount > 0 && (
          <span className="text-xs text-gray-600" title="These rows were not loaded">
            showing {rows.length} of {rows.length + hiddenRowCount}
          </span>
        )}
      </div>
    </div>
  );
}

/*
 * Encabezado de UNA columna: nombre editable, borrar con confirmacion y arrastrar
 * para reordenar.
 *
 * Vive aca y no en la grilla por dos razones. Su estado --renombrando, o
 * confirmando-- es propio de la columna y asi cada `memo` ignora a las demas. Y
 * el widget lo reutiliza tal cual: el prompt del widget pide las mismas
 * acciones sobre el mismo componente, y si el encabezado fuera de la vista
 * habria que escribirlo dos veces y divergir.
 *
 * Los controles van ENCIMA de la celda con `absolute` y no en la fila: si
 * ocuparan sitio, cada columna seria mas ancha de lo que necesita y la grilla
 * daria un salto cada vez que el puntero entra o sale.
 */

interface ColumnHeaderProps {
  column: TableColumnDto;
  index: number;
  total: number;
  pad: string;
  head: string;
  /** Filas con un valor guardado en esta columna. */
  filledRows: number;
  /** Valores que se perderian si esta columna pasara a `number`. */
  pierdeAlPonerNumero: number;
  /** Esta columna es la que se esta arrastrando. */
  dragging: boolean;
  onDragStart: (
    columnId: string,
    clientX: number,
    pointerId: number,
    grid: HTMLElement | null,
    grabOffset: number,
  ) => void;
  onRename: (columnId: string, name: string) => void;
  onTypeChange: (columnId: string, type: ColumnType) => void;
  onDelete: (columnId: string) => void;
}

const ColumnHeader = memo(function ColumnHeader({
  column,
  index,
  total,
  pad,
  head,
  filledRows,
  pierdeAlPonerNumero,
  dragging,
  onDragStart,
  onRename,
  onTypeChange,
  onDelete,
}: ColumnHeaderProps) {
  const [renaming, setRenaming] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState(column.name);
  const inputRef = useRef<HTMLInputElement>(null);

  /*
   * El menu de la columna: renombrar, cambiar tipo y borrar.
   *
   * Son tres estados y no uno porque el submenu de tipos tiene su propia regla de
   * cierre, que es distinta de la del menu:
   *
   *   `menuAbierto`   el menu principal. Se cierra solo, con un clic afuera.
   *   `tiposAbiertos` el submenu de Text/Number.
   *   `tiposFijados`  si el usuario PRESIONO "Change type". Mientras este en
   *                   true el submenu no se cierra al sacar el mouse, y se queda
   *                   pegado en pantalla hasta que se presione otra cosa.
   *
   * Sin `tiposFijados` el menu se cerraria cada vez que el mouse pasara por el
   * borde de "Change type" de camino a las opciones, y nunca se podria llegar.
   */
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [tiposAbiertos, setTiposAbiertos] = useState(false);
  const [tiposFijados, setTiposFijados] = useState(false);
  /** Que se va a confirmar: borrar la columna, o pasarla a `number`. */
  const [confirmandoTipo, setConfirmandoTipo] = useState<ColumnType | null>(null);
  /*
   * Donde va pegado el menu, en coordenadas de ventana.
   *
   * Se mide el boton al abrir y se dibuja con `position: fixed` en un portal,
   * porque dentro de la grilla no se puede: la tabla vive en un `overflow-auto`
   * y TODO lo que cuelgue del encabezado se recorta con el. Medido: con dos
   * filas, "Delete column" quedaba a 188px de un contenedor que terminaba en
   * 160, invisible, y el clic caia en el boton de "Add row" de abajo.
   *
   * El panel de borrar el mismoerror lo tenia antes y arrastraba desde elmenu.
   */
  const [ancla, setAncla] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const botonRef = useRef<HTMLButtonElement>(null);

  const abrirMenu = () => {
    const b = botonRef.current?.getBoundingClientRect();
    if (!b) return;
    setAncla({ top: b.bottom, left: b.left });
    setMenuAbierto(true);
    setTiposAbiertos(false);
    setTiposFijados(false);
  };

  /*
   * Cerrar SOLO el menu, dejando el ancla.
   *
   * Son dos cosas distintas porque el portal vive mientras haya ancla: al elegir
   * "Delete column" el menu se cierra pero el cartel de confirmacion aparece en
   * el MISMO portal. Si cerrar el menu tambien tirara el ancla, el portal se
   * desmontaria y el cartel nunca se veria --que es exactamente lo que pasaba.
   */
  const cerrarSoloMenu = () => {
    cancelarCierreTipos();
    setMenuAbierto(false);
    setTiposAbiertos(false);
    setTiposFijados(false);
  };

  const cerrarMenu = () => {
    cerrarSoloMenu();
    setAncla(null);
  };

  /*
   * El submenu se cierra con demora, no en el instante en que el mouse sale.
   *
   * Ver la nota del render: en diagonal se atraviesan pixeles que no son ni del
   * rotulo ni del submenu, y con cierre inmediato la lista era inalcanzable. Los
   * 200ms son de sobra para terminar de girar el mouse y son menos que el tiempo
   * que uno tarda en moverse a otra opcion, asi que no se nota la demora cuando
   * de verdad quiere cerrar. Ver `SUBMENU_CLOSE_MS`.
   */
  const timerTipos = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelarCierreTipos = () => {
    if (timerTipos.current === null) return;
    clearTimeout(timerTipos.current);
    timerTipos.current = null;
  };
  const pedirCierreTipos = () => {
    // Fijado manda sobre todo: es el clic el que decide que la lista se queda.
    if (tiposFijados) return;
    cancelarCierreTipos();
    timerTipos.current = setTimeout(() => {
      timerTipos.current = null;
      setTiposAbiertos(false);
    }, SUBMENU_CLOSE_MS);
  };
  useEffect(() => () => cancelarCierreTipos(), []);

  /*
   * Presionar "Change type" deja el submenu pegado.
   *
   * Un clic mas lo despega. Y si en vez de eso se elige otra opcion del menu, o
   * se hace clic afuera de todo, el submenu se cierra igual: "presionar otra cosa
   * con el mouse" es la regla, y el clic que lo abrio es el unico que puede
   * volver a cerrarlo sin ayuda del mouse.
   */
  const alternarTipos = () => {
    setTiposFijados((f) => !f);
    setTiposAbiertos(true);
  };

  const aplicarTipo = (type: ColumnType) => {
    // Elegir el tipo que ya tiene no es un cambio: no se gasta un PATCH.
    if (type === column.type) {
      cerrarMenu();
      return;
    }
    // Solo se pregunta cuando hay algo que perder. Si no, se aplica y listo.
    if (type === 'number' && pierdeAlPonerNumero > 0) {
      cerrarSoloMenu();
      setConfirmandoTipo(type);
    } else {
      cerrarMenu();
      onTypeChange(column.id, type);
    }
  };

  const borrar = () => {
    // El menu se cierra pero el ancla se queda: el cartel de confirmacion se
    // dibuja en el mismo portal.
    cerrarSoloMenu();
    setConfirmandoTipo(null);
    setConfirming(true);
  };

  const renombrar = () => {
    cerrarMenu();
    setRenaming(true);
  };

  /*
   * Un clic en cualquier lado de la pagina, fuera del menu, lo cierra.
   *
   * El boton que lo abre tambien cuenta como "adentro": si no, el `mousedown`
   * cerraria el menu y el `click` siguiente lo volveria a abrir, y nunca se
   * cerraria presionando el mismo boton dos veces.
   */
  useEffect(() => {
    if (!menuAbierto) return;
    const fuera = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t)) return;
      if (botonRef.current?.contains(t)) return;
      cerrarMenu();
    };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
    // `cerrarMenu` es estable en la practica: solo pone estado a null.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuAbierto]);

  /*
   * El menu esta en `fixed`: si la pagina se desplaza, se queda pegado al punto
   * de la pantalla donde estaba y deja de corresponder al boton. Se cierra.
   */
  useEffect(() => {
    if (!menuAbierto) return;
    const fuera = () => cerrarMenu();
    window.addEventListener('scroll', fuera, true);
    window.addEventListener('resize', fuera);
    return () => {
      window.removeEventListener('scroll', fuera, true);
      window.removeEventListener('resize', fuera);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuAbierto]);

  useEffect(() => {
    if (renaming) {
      setDraft(column.name);
      inputRef.current?.focus();
    }
  }, [renaming, column.name]);

  const commit = () => {
    setRenaming(false);
    onRename(column.id, draft);
  };

  const typeLabel = column.type === 'number' ? 'number' : 'text';

  return (
    <div
      role="columnheader"
      aria-sort="none"
      /* Necesario para que `destinoBajo` mida el encabezado VIVO mientras se
         arrastra, que es lo que define donde cae el puntero. */
      data-column-id={column.id}
      title={`${column.name} · ${typeLabel} · drag to reorder`}
      /*
       * `bg-gray-750` no existe, asi que la banda sube de `gray-800` a `gray-700`
       * y el texto de `gray-300` a `gray-400`.
       *
       * En el widget el encabezado y los valores estan los dos a 14px, asi que no
       * hay diferencia de tamano que los separe --y con el mismo tamano y el mismo
       * peso, la banda es lo unico que dice "esto rotula, esto es dato". Con
       * `gray-800` contra el fondo del cuerpo la diferencia era de un paso, y no
       * se leia.
       *
       * El texto se aparta a `gray-400` para que el encabezado se vea como
       * etiqueta y los valores (`gray-200`) como contenido: la jerarquia va al reves
       * de lo que haria un fondo mas claro, porque aca el dato es lo que tiene que
       * saltar.
       */
      className={`group/col sticky top-0 z-[var(--z-sticky)] select-none border-b border-gray-600 bg-gray-700 font-medium text-gray-400 ${pad} ${head} ${
        dragging
          ? 'z-[calc(var(--z-sticky)+1)] cursor-grabbing bg-gray-700 shadow-lg shadow-black/50'
          : 'cursor-grab hover:bg-gray-700/40'
      }`}
      /*
       * Arrastre desde cualquier parte del encabezado, con umbral en la grilla.
       *
       * El `onPointerDown` va en la celda y no solo en un asa: en el widget el
       * encabezado es de 90px y un asa seria un blanco de 10px, imposible de
       * acertar. El umbral de 4px --que aplica `moveDrag`-- deja pasar el doble
       * clic del renombrado, que no mueve el puntero.
       */
      onPointerDown={(e) => {
        if (e.button !== 0 || renaming || confirming) return;
        const header = e.currentTarget as HTMLElement;
        const grid = header.closest('[data-grid]') as HTMLElement | null;
        onDragStart(
          column.id,
          e.clientX,
          e.pointerId,
          grid,
          e.clientX - header.getBoundingClientRect().left,
        );
      }}
      /*
       * La transicion va en el estado NORMAL y no en el de arrastre, y al reves de
       * lo que parece.
       *
       * Durante el arrastre el transform tiene que ser instantaneo. Si estuviera
       * animado, cada vez que la columna cambia de ranura la grilla la mueve de
       * golpe y el transform la devuelve con Transition: se ve volar desde el
       * lado contrario, que es exactamente el sintoma.
       *
       * Ponerla en el estado normal hace que al SOLTAR, cuando el transform se
       * quita de golpe y la columna vuelve a su ranura, ese retorno si se anime.
       */
      style={
        dragging
          ? { transform: 'translateX(var(--dx, 0px))', transition: 'none' }
          : { transition: 'transform 120ms ease-out' }
      }
    >
      {/*
       * El encabezado VACIA cuando se esta confirmando el borrado, porque el
       * panel se dibuja en el portal de mas abajo. Antes se dibujaba aqui con
       * `absolute top-full`, y la grilla --que vive dentro de un `overflow-auto`--
       * lo recortaba: con pocas filas el cartel salia a medias y no se leia.
       */}
      {confirming ? null : (
        <div className="flex items-center gap-1">
          {renaming ? (
            <input
              ref={inputRef}
              value={draft}
              maxLength={MAX_COLUMN_NAME_LENGTH}
              onMouseDown={(e) => e.preventDefault()}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commit();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  // Se sale sin guardar: el texto vuelve al nombre real.
                  setDraft(column.name);
                  setRenaming(false);
                }
              }}
              aria-label={`Rename column ${column.name}`}
              /*
               * Ancho FIJO, no el del contenido: si el campo midiese lo que se
               * escribe, la columna --y con ella todas las de abajo-- daria un
               * salto en cada tecla.
               *
               * `select-text` contra el `select-none` del encabezado: al
               * renombrar uno quiere poder elegir parte del nombre para
               * reemplazarlo, no escribir siempre encima.
               */
              className="w-32 select-text rounded bg-gray-700 px-1 py-0.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-gray-500/50"
            />
          ) : (
            /*
             * El nombre es TEXTO, no un control.
             *
             * Con el clic simple se abria el renombrado, y eso rompia el
             * arrastre en la forma mas annoying posible: el puntero bajaba al
             * nombre --que es donde uno lo agarra-- y en vez de agarrar la columna
             * se entraba a editar. Ademas cada clic de mas seleccionaba el texto
             * y dejaba la columna marcada con un fondo azul.
             *
             * Ahora presionarlo no hace NADA: es el mismo blanco de arrastre que
             * el resto del encabezado. Renombrar quedo en el doble clic, que no
             * choca con el arrastre porque no hay movimiento de por medio --el
             * umbral del arrastre es de 4px-- y porque `onDoubleClickCapture`
             * descarta el gesto si venia de un arrastre de verdad.
             */
            <span
              onDoubleClick={() => setRenaming(true)}
              title={`${column.name} · ${typeLabel}. Double-click to rename, drag to move.`}
              className="max-w-[12rem] cursor-inherit truncate whitespace-nowrap text-left transition-colors hover:text-white"
            >
              {column.name}
            </span>
          )}

          {/*
           * Solo queda borrar. Mover la columna es solo con el arrastre: las
           * flechas aparecian al lado de la papelera, ocupaban el ancho del
           * encabezado en un widget de 300px y decian dos veces lo mismo que
           * arrastrar el titulo.
           */}
          {/*
           * El boton del menu. Reemplaza a la papelera suelta: renombrar, cambiar
           * tipo y borrar son las tres cosas que se pueden hacer con una columna,
           * y con un solo boton el encabezado deja de reservar ancho para tres
           * iconos en un widget de 300px.
           *
           * El menu en si NO va aqui: se dibuja en el portal del final.
           */}
          <span
            className="flex shrink-0 items-center opacity-0 transition-opacity group-hover/col:opacity-100 focus-within:opacity-100"
            aria-hidden={!renaming}
          >
            <button
              ref={botonRef}
              type="button"
              onClick={() => (menuAbierto ? cerrarMenu() : abrirMenu())}
              aria-label={`Options for column ${column.name}`}
              aria-haspopup="menu"
              aria-expanded={menuAbierto}
              title="Column options"
              className="flex size-6 items-center justify-center rounded text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-200"
            >
              <FiMoreVertical size={11} />
            </button>
          </span>
        </div>
      )}

      {/*
       * Los tres paneles --menu, confirmar tipo y confirmar borrado-- se dibujan
       * en un portal al `body`, y no dentro del encabezado.
       *
       * No es cosmetico: la grilla vive dentro de un `overflow-auto` que recorta
       * TODO lo que cuelgue de sus celdas. Medido con dos filas: el contenedor
       * llegaba a 160px y la tercera opcion del menu terminaba en 188, fuera de
       * vista. El clic en esa posicion caia en el boton "Add row" de abajo.
       *
       * En el portal se dibujan en coordenadas de ventana, con `position: fixed`,
       * y no dependen de que el encabezado no tenga recorte.
       */}
      {ancla !== null &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              top: ancla.top,
              left: ancla.left,
              zIndex: 'var(--z-menu)',
            }}
          >
            {menuAbierto && (
              <div
                ref={menuRef}
                role="menu"
                className="w-40 rounded border border-gray-600 bg-gray-800 py-0.5 shadow-xl"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={renombrar}
                  className="block w-full px-3 py-1.5 text-left text-xs text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
                >
                  Rename
                </button>

                {/*
                 * "Change type" y su submenu.
                 *
                 * `relative` en el envoltorio no es decorativo: sin esto el
                 * submenu, que es `absolute top-0`, se ancla al div del portal --
                 * que es `fixed`-- y no a esta fila, y aparece 28px mas arriba,
                 * tapando "Rename".
                 *
                 * El `onMouseLeave` esta en el ENVOLTORIO, no en el submenu, y el
                 * submenu es un descendiente suyo en el DOM aunque se dibuje a la
                 * derecha: asi el raton puede pasar de la etiqueta a las opciones
                 * sin que se cierre en el medio. Si el submenu fuera hermano, salir
                 * de la etiqueta lo cerraria antes de llegar.
                 *
                 * Y a pesar de eso el cierre va CON GRACIA, porque solo con el
                 * leave directo no alcanzaba: el camino natural del raton de la
                 * etiqueta a la lista es en diagonal, y en diagonal pasa por
                 * pixeles que todavia no son ni de una ni del otro -- baja un poco
                 * antes de girar. En el primer pixel fuera se cerraba y la lista
                 * era inaccesible. `SUBMENU_CLOSE_MS` le da tiempo a terminar el
                 * gesto; si vuelve a entrar, el cierre se cancela.
                 */}
                <div
                  className="relative"
                  onMouseEnter={() => {
                    cancelarCierreTipos();
                    setTiposAbiertos(true);
                  }}
                  onMouseLeave={pedirCierreTipos}
                >
                  <button
                    type="button"
                    role="menuitem"
                    aria-haspopup="menu"
                    aria-expanded={tiposAbiertos}
                    onClick={alternarTipos}
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
                  >
                    Change type
                    <FiChevronRight
                      size={11}
                      className={
                        tiposAbiertos ? 'rotate-90 transition-transform' : 'transition-transform'
                      }
                    />
                  </button>

                  {tiposAbiertos && (
                    <div
                      role="menu"
                      /*
                       * El `before` es un puente invisible de 4px sobre el `ml-1`.
                       *
                       * El margen separa los menus, pero el hueco queda como
                       * tierra de nadie: al cruzar se dispara el `onMouseLeave` del
                       * envoltorio y el submenu se cierra antes de que el raton
                       * llegue a "Text". El pseudo-elemento devuelve ese hueco al
                       * submenu, que es lo unico que importa para el hover.
                       */
                      className={`absolute top-0 w-32 rounded border border-gray-600 bg-gray-800 py-0.5 shadow-xl before:absolute before:top-0 before:h-full before:w-1 before:content-[''] ${
                        index === total - 1
                          ? 'right-full mr-1 before:-right-1'
                          : 'left-full ml-1 before:-left-1'
                      }`}
                    >
                      {(['text', 'number'] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          role="menuitemradio"
                          aria-checked={column.type === t}
                          onClick={() => aplicarTipo(t)}
                          className={`flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs transition-colors hover:bg-white/5 ${
                            column.type === t ? 'text-white' : 'text-gray-300'
                          }`}
                        >
                          {column.type === t && <FiCheck size={11} className="shrink-0" />}
                          {t === 'text' ? 'Text' : 'Number'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  role="menuitem"
                  onClick={borrar}
                  className="block w-full px-3 py-1.5 text-left text-xs text-danger transition-colors hover:bg-danger/15"
                >
                  Delete column
                </button>
              </div>
            )}

            {/*
             * Confirmar el cambio de tipo, y solo cuando hay algo que perder.
             *
             * Pasar una columna de texto a numero descarta las celdas que no son
             * numeros. El backend conserva lo numerico escrito como texto --"10"
             * pasa a 10--, asi que lo que se cuenta aca es exactamente lo que se
             * limpia, y sin este cartel esos valores desaparecerian sin que nadie
             * se enterara.
             */}
            {confirmandoTipo !== null && (
              <div className="mt-0.5 w-56 rounded border border-gray-500/50 bg-gray-800 p-2 shadow-xl">
                <p className="text-xs text-gray-300">
                  Change <span className="text-white">{column.name}</span> to Number?{' '}
                  <span className="text-white">
                    {pierdeAlPonerNumero} {pierdeAlPonerNumero === 1 ? 'value' : 'values'} that are
                    not numbers will be cleared.
                  </span>
                </p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      const t = confirmandoTipo;
                      setConfirmandoTipo(null);
                      if (t) onTypeChange(column.id, t);
                    }}
                    className="rounded px-1.5 py-1 text-xs text-gray-200 transition-colors hover:bg-white/5"
                  >
                    Change
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setConfirmandoTipo(null);
                      cerrarMenu();
                    }}
                    className="rounded px-1.5 py-1 text-xs text-gray-400 transition-colors hover:bg-white/5"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {confirming && (
              <div className="mt-0.5 w-56 rounded border border-danger/50 bg-gray-800 p-2 shadow-xl">
                {/*
                 * Decir CUANTAS filas pierden su valor. Sin el numero, borrar una
                 * columna se lee como borrar un encabezado, y lo que pasa es que
                 * las celdas quedan vacias.
                 */}
                <p className="text-xs text-gray-300">
                  {filledRows > 0 ? (
                    <>
                      Remove <span className="text-white">{column.name}</span> from{' '}
                      <span className="text-white">
                        {filledRows} {filledRows === 1 ? 'row' : 'rows'}
                      </span>
                      ?
                    </>
                  ) : (
                    <>
                      Remove <span className="text-white">{column.name}</span>? It has no values.
                    </>
                  )}
                </p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setConfirming(false);
                      setAncla(null);
                      onDelete(column.id);
                    }}
                    className="rounded px-1.5 py-1 text-xs text-danger transition-colors hover:bg-danger/15"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setConfirming(false);
                      setAncla(null);
                    }}
                    className="rounded px-1.5 py-1 text-xs text-gray-400 transition-colors hover:bg-white/5"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
});

/**
 * El "+" que agrega una columna.
 *
 * En `full` abre un menu para elegir el tipo, porque hay sitio. En `compact` no:
 * el widget no tiene donde poner un menu y agrega `text` de una, que es el tipo
 * por defecto y el que mas se usa.
 */
function AddColumn({
  density,
  padY,
  onAdd,
  open,
  onOpenChange,
}: {
  density: TableDensity;
  padY: string;
  onAdd: (type: ColumnType) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const botonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [ancla, setAncla] = useState<{ top: number; left: number } | null>(null);

  const cerrar = () => {
    setAncla(null);
    onOpenChange(false);
  };

  const abrir = () => {
    const b = botonRef.current?.getBoundingClientRect();
    if (!b) return;
    /*
     * Alineado al boton pero sin salirse de la pantalla.
     *
     * El "+" vive en el ultimo track, o sea en el borde derecho de la tabla, y
     * el menu mide 128px. Pegado a la izquierda del boton se iba 104px fuera del
     * contenedor --y fuera de la pantalla-- con cualquier tabla de 4 columnas o
     * mas. Se ancla al boton pero se corrige contra el borde de la ventana.
     */
    const left = Math.max(8, Math.min(b.left, window.innerWidth - ADD_MENU_W - 8));
    setAncla({ top: b.bottom, left });
    onOpenChange(true);
  };

  useEffect(() => {
    if (!open) return;
    const fuera = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t)) return;
      if (botonRef.current?.contains(t)) return;
      cerrar();
    };
    const seMueve = () => cerrar();
    document.addEventListener('mousedown', fuera);
    window.addEventListener('scroll', seMueve, true);
    window.addEventListener('resize', seMueve);
    return () => {
      document.removeEventListener('mousedown', fuera);
      window.removeEventListener('scroll', seMueve, true);
      window.removeEventListener('resize', seMueve);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      <div
        ref={ref}
        /*
         * SIN padding horizontal, y centrado.
         *
         * Esta celda vive en el track de `ADD_COL`, que es de 24px. Con el mismo
         * `px-3` de los encabezados --12px a cada lado-- el contenido se quedaba en
         * 0px de ancho y el boton de 16px se salia 4px fuera de la celda, sobre el
         * fondo de la pagina en vez del del encabezado. Medido: celda 256-280,
         * boton 268-284.
         *
         * Los headers siguen con su `px-3` de siempre; esto solo necesita caber.
         */
        className={`sticky top-0 z-[var(--z-sticky)] flex items-center justify-center border-b border-gray-600 bg-gray-800 ${padY}`}
      >
        {!open && (
          <button
            ref={botonRef}
            type="button"
            onClick={() => (density === 'full' ? abrir() : onAdd('text'))}
            aria-label="Add column"
            title={density === 'full' ? 'Add column' : 'Add a text column'}
            className="flex size-6 items-center justify-center rounded text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-200"
          >
            <FiPlus size={12} />
          </button>
        )}
      </div>

      {/*
       * El menu va en un portal, por el mismo motivo que el de la columna: cuelga
       * de una celda de una grilla que esta dentro de un `overflow-auto`, y todo lo
       * que cuelgue se recorta con el.
       */}
      {open &&
        ancla &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ position: 'fixed', top: ancla.top, left: ancla.left, zIndex: 'var(--z-menu)' }}
            className="w-32 overflow-hidden rounded border border-gray-600 bg-gray-800 shadow-xl"
          >
            {(['text', 'number'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="menuitem"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  cerrar();
                  onAdd(t);
                }}
                className="block w-full px-2 py-1.5 text-left text-xs text-gray-300 transition-colors hover:bg-white/5"
              >
                {t === 'text' ? 'Text column' : 'Number column'}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

/*
 * Las celdas de UNA fila.
 *
 * Van en su propio componente, envuelto en `memo`, para que editar una celda no
 * repinte las demas filas. El estado sigue viviendo en el padre --es el unico
 * lugar donde se puede saber que celda esta activa--, pero el corte lo hace el
 * `editing` que cada fila recibe.
 */

interface RowCellsProps {
  row: TableRowDto;
  rowIndex: number;
  columns: TableColumnDto[];
  editing: Editing | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  pad: string;
  text: string;
  onStart: (row: TableRowDto, column: TableColumnDto) => void;
  onDraft: (draft: string) => void;
  onBlur: () => void;
  onCancel: () => void;
  onMove: (delta: number) => void;
  /** Columna que se esta arrastrando; sus celdas la siguen. */
  draggingColId: string | null;
  /** Esta fila es la que se esta arrastrando de arriba abajo. */
  lifting: boolean;
  /** Arma el arrastre vertical desde el icono de la columna de acciones. */
  onGrabRow: (clientY: number, pointerId: number) => void;
}

const RowCells = memo(function RowCells({
  row,
  rowIndex,
  columns,
  editing,
  inputRef,
  pad,
  text,
  onStart,
  onDraft,
  onBlur,
  onCancel,
  onMove,
  draggingColId,
  lifting,
  onGrabRow,
}: RowCellsProps) {
  /*
   * El transform de la fila levantada, y su sombra.
   *
   * Va en TODAS las celdas de la fila --el asa, los datos y el relleno-- porque si
   * se mueve solo la parte de los datos la fila se ve partida: el asa queda colgada
   * del lado viejo mientras el texto ya se fue.
   *
   * Y el "levantada" es SOLO el fondo, sin sombra por celda. Una sombra puesta celda
   * por celda no se junta: cada una proyecta la suya y quedan N escalones entre
   * ellas, que es exactamente lo que se veía. Un fondo uniforme sobre la fila
   * entera lee igual de claro y no deja costuras.
   */
  const transformFila: React.CSSProperties | undefined = lifting
    ? { transform: 'translateY(var(--dy, 0px))', transition: 'none' }
    : undefined;
  const claseAlzada = lifting ? 'relative z-[1] bg-gray-900/80' : '';
  return (
    <>
      {/*
       * El asa de arrastre de la fila.
       *
       * Antes era la papelera y el boton vivia siempre visible; ahora es el icono
       * que levanta la fila. Sigue siempre visible por la misma razon: un asa que
       * solo aparece al pasar por encima es un asa que no se encuentra, y para
       * arrastrar la fila uno va justo a buscarla.
       *
       * El `onPointerDown` va en el boton y no en la celda para no competir con el
       * resto de la fila; el arrastre recien arranca con 4px de movimiento, asi que
       * un clic sin mover no hace nada.
       */}
      <div
        className={`flex items-center border-b border-gray-700/40 ${pad} ${claseAlzada}`}
        style={transformFila}
      >
        <button
          type="button"
          data-row-grip={row.id}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            onGrabRow(e.clientY, e.pointerId);
          }}
          aria-label={`Reorder row ${rowIndex + 1}`}
          title="Drag to reorder"
          className={`flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded transition-colors hover:bg-white/5 active:cursor-grabbing ${
            lifting ? 'text-gray-300' : 'text-gray-600'
          }`}
        >
          <FiMenu size={11} />
        </button>
      </div>

      {columns.map((c) => {
        const isEditing = editing?.columnId === c.id;
        const raw = row.values[c.id];
        const shown = display(raw);
        /*
         * Las celdas de la columna arrastrada se mueven con ella. Sin esto el
         * encabezado queda flotando sobre datos que no son suyos, y se ve como
         * que la tabla se rompe a media fila.
         *
         * El `translateX` sale de la variable de la grilla y el fondo se apaga un
         * poco para que se lea que esta levantada y no simplemente movida.
         */
        const lifted = draggingColId === c.id;
        /*
         * La fila arrastrada se mueve con ella. Misma logica que las columnas pero
         * en `Y`: el transform sale de la variable de la grilla y el fondo se apaga
         * un poco para que se lea que esta levantada.
         *
         * Se levanta la fila COMPLETA --todas sus celdas-- y no solo la que tiene el
         * puntero: una fila a la que se le mueve una sola celda parece una fila rota.
         */
        const filaAlzada = lifting || lifted;
        return (
          <div
            key={c.id}
            style={
              filaAlzada
                ? {
                    transform: lifted
                      ? 'translateX(var(--dx, 0px))'
                      : 'translateY(var(--dy, 0px))',
                    transition: 'none',
                  }
                : { transition: 'transform 120ms ease-out' }
            }
            className={`border-b border-gray-700/40 align-top ${pad} ${text} ${
              filaAlzada
                ? 'relative z-[1] bg-gray-900/80'
                : isEditing
                  ? 'bg-gray-700/60'
                  : ''
            }`}
          >
            {isEditing ? (
              <div>
                <input
                  ref={inputRef}
                  value={editing?.draft ?? ''}
                  onChange={(e) => onDraft(e.target.value)}
                  onBlur={onBlur}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      // Abajo, como una hoja de calculo. En la ultima fila no hay
                      // destino y simplemente se guarda y se cierra.
                      onMove(columns.length);
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      onCancel();
                    }
                    if (e.key === 'Tab') {
                      e.preventDefault();
                      onMove(e.shiftKey ? -1 : 1);
                    }
                  }}
                  type="text"
                  inputMode={c.type === 'number' ? 'decimal' : undefined}
                  aria-label={`${c.name}, row ${rowIndex + 1}`}
                  className="w-full min-w-[3rem] bg-transparent font-sans text-white focus:outline-none"
                />
                {/*
                 * El error crece la celda hacia abajo en vez de flotar encima.
                 * Flotando se lo comia el `overflow-auto` del contenedor en
                 * cuanto la celda estaba en la ultima fila.
                 */}
                {editing?.error && (
                  <p className="mt-0.5 text-[10px] leading-none text-danger">{editing.error}</p>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onStart(row, c)}
                aria-label={`${c.name}, row ${rowIndex + 1}`}
                className="flex min-h-6 w-full min-w-[3rem] items-center cursor-text whitespace-nowrap text-left text-gray-200 transition-colors hover:bg-white/[0.04]"
              >
                {/* El vacio se ve porque hay algo que hacer clic, pero no como
                    texto: "null" o "undefined" en la celda serian ruido. */}
                {shown || <span className="text-gray-700">&mdash;</span>}
              </button>
            )}
          </div>
        );
      })}

      {/*
       * Celda de relleno del ULTIMO track, el del "+" del encabezado.
       *
       * Parece de mas y no lo esta: la grilla tiene `accion + N columnas + esta`,
       * y sin esta celda cada fila ocupa N+1 tracks de N+2. La colocacion
       * automatica del grid llena una fila antes de pasar a la siguiente, asi que
       * la fila siguiente empieza en el track que le toco y todo lo que viene
       * despues queda corrido un lugar. Medido: el boton de borrar aparecia en la
       * columna "Value" y el texto en la de acciones, y cada cuatro filas el
       * corrimiento daba la vuelta.
       *
       * `border-b` y no nada, para que la linea de la fila siga siendo continua
       * hasta el "+" del encabezado.
       */}
      <div
        className={`border-b border-gray-700/40 ${claseAlzada}`}
        aria-hidden="true"
        style={transformFila}
      />
    </>
  );
});
