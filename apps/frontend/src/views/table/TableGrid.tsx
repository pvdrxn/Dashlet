import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { IconType } from 'react-icons';
import {
  FiPlus,
  FiChevronRight,
  FiCheck,
  FiMenu,
  FiType,
  FiHash,
  FiCheckSquare,
} from 'react-icons/fi';
import {
  MAX_COLUMN_NAME_LENGTH,
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  COLUMN_TYPES,
  COLUMN_TYPE_LABELS,
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
 *
 * 24px y no 28: el asa de arrastre mide 20 y esta centrada, asi que el track es la
 * medida del asa mas 2px de aire a cada lado. Antes el track era de 28 con un
 * boton de 24 DENTRO del padding de la celda --6px por lado en compacto, 12 en la
 * vista--, o sea que el contenido disponible eran 16px y el boton de 24 se salia
 * 8px encima de la primera columna. Medido: el asa se veia pegada al borde y
 * corridas respecto del centro de la fila.
 *
 * EN PX y no en `rem` porque `moveDrag` lo SUMA: es el ancho del track que esta
 * antes de la primera columna, y sin el la columna arrastrada salia corrida
 * exactamente 24px. Ser al mismo tiempo un valor de CSS y algo que se suma es
 * justo la clase de bug que no se ve leyendo el arrastre.
 */
const ACTION_COL = 24;

/**
 * El separador VERTICAL, con el mismo tono que el de fila.
 *
 * Un divisor mas claro que la regla de fila se lee como una jerarquia que no
 * existe: los dos separan lo mismo --el dato de su vecino--, asi que con el mismo
 * peso se leen como un sistema. Hay 44 lineas en pantalla en una tabla de cuatro
 * columnas y no parece papel milimetrado justamente porque 1.65:1 no es un borde,
 * es una sugerencia.
 *
 * Va en el `border-l` de cada celda y no en un pseudo-elemento: el divisor tiene
 * que ACOMPANAR la transform cuando se arrastra una columna, y un `::before`
 * habria que mover a mano lo mismo que se mueve la celda.
 */
const divisor = 'border-l border-gray-600/70';

/**
 * Ancho de la ultima columna, la del boton "+" que agrega una columna.
 *
 * FIJO y no `auto` por una razon que no es de espacio: si el track es `auto`
 * empuja el sobrante y queda una columna vacia gigante a la derecha. Con un ancho
 * fijo el "+" queda pegado a la ultima columna, que es donde uno lo busca.
 *
 * En px, como `ACTION_COL`, por el mismo motivo de que los dos se arman en la
 * misma plantilla.
 */
const ADD_COL = 24;

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

/**
 * Medidas del menu de "+", para saber donde puede anclar sin salirse.
 *
 * El ancho lo fija el CAMPO del buscador, que es `w-36` mas el `p-1.5` del panel
 * y su borde: 144 + 12 + 2 = 158. Los nombres de los tipos son mas angostos que
 * eso, asi que el panel nunca pasa de ahi -- y si uno llegara a serlo, el `w-max`
 * lo ampara y esta constante queda corta por los pixeles de mas, no al reves.
 *
 * El alto se sumo con el buscador, que le agrega una fila. Los dos van en el
 * calculo de la esquina: sin el alto, un widget bajo en un tablero largo abria el
 * menu cortado por el borde de abajo.
 */
const ADD_MENU_W = 158;
const ADD_MENU_H = 130;

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

/**
 * El icono de cada tipo, a la izquierda del nombre.
 *
 * Vive aca y no en `shared` porque son componentes de React y `shared` lo consume
 * tambien el backend, que no tiene React.
 *
 * Los tres son del set que ya usa la grilla --Feather--, y dos de ellos son los
 * glifos que dicen el tipo sin palabras: `Type` es el "Aa" y `Hash` el "#",
 * que es literalmente lo que guarda la celda. `CheckSquare` es el mismo icono con
 * el que esta registrado el widget de tareas: una columna de casillas y un widget
 * de casillas se ven iguales por una razon, y no por casualidad.
 */
const TYPE_ICON: Record<ColumnType, IconType> = {
  text: FiType,
  number: FiHash,
  checkbox: FiCheckSquare,
};

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
  /**
   * El usuario ajusto el ancho de UNA columna.
   *
   * Solo al soltar, nunca durante el arrastre: el padre guarda la columna con un
   * PATCH, y a 60 cuadros por segundo eso seria 60 escrituras por gesto.
   */
  onColumnWidth?: (columnId: string, width: number) => void;
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
  onColumnWidth,
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

  /*
   * La fila bajo el mouse, pintada por el DOM y no por estado.
   *
   * La grilla es plana --cada celda es un item del grid, no hay elemento de fila--
   * asi que "resaltar la fila" no se puede con CSS: hay que saber que celdas
   * comparten `data-row-id` y marcarlas. Con estado de React seria un render de
   * las 40 filas en cada movimiento del mouse, que es justo lo que el `memo` de
   * `RowCells` existe para evitar. Por eso va por el DOM, igual que `--dx` y
   * `--dy` en los arrastres.
   *
   * Un solo listener en la grilla --`mouseover` burbujea-- y un atributo por celda.
   */
  const filaHoverRef = useRef<string | null>(null);
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const pintar = (id: string | null) => {
      if (id === filaHoverRef.current) return;
      filaHoverRef.current = id;
      for (const c of grid.querySelectorAll('.row-hover')) c.classList.remove('row-hover');
      if (!id) return;
      for (const c of grid.querySelectorAll(`[data-row-id="${id}"]`)) {
        c.classList.add('row-hover');
      }
    };
    const sobre = (e: MouseEvent) => {
      const celda = (e.target as HTMLElement | null)?.closest?.('[data-row-id]');
      pintar(celda?.getAttribute('data-row-id') ?? null);
    };
    const salio = () => pintar(null);
    grid.addEventListener('mouseover', sobre);
    grid.addEventListener('mouseleave', salio);
    return () => {
      grid.removeEventListener('mouseover', sobre);
      grid.removeEventListener('mouseleave', salio);
    };
  }, []);

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
  /**
   * Cuanto se corre cada columna para que la arrastrada la EMPUJE a su lugar.
   *
   * El corrimiento va como `transform` y no como ancho de columna: cambiar el
   * track de la grilla reacomodaria el texto y lo deformaria. Es el mismo
   * desplazamiento visual, solo que por pasos en vez de de golpe.
   *
   * Vive en estado --y no como una propiedad del DOM-- porque lo tienen que
   * seguir las celdas tambien, y eso ya es un render.
   */
  const [push, setPush] = useState<Record<string, number> | null>(null);
  /**
   * Donde estaba cada columna justo antes de que React reordenara.
   *
   * Se mide del DOM y no se calcula con los anchos: si el empuje anterior
   * todavia esta corriendo, la columna esta a medio camino y hay que arrancar la
   * animacion desde donde esta, no desde donde le tocaria. Con anchos, una
   * animacion interrumpida saltaba para atras y volvia a arrancar.
   */
  const pushAntes = useRef<Record<string, number> | null>(null);
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
    /**
     * Donde el puntero quiere el borde izquierdo de la columna, en px desde la
     * grilla. Vive aca porque el `--dx` hay que recalcularlo cuando React cambia
     * el orden; ver el `useLayoutEffect` de mas abajo.
     */
    objetivo: number;
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
   * Donde cae la columna: cuando uno de sus DOS bordes pasa la mitad de un vecino.
   *
   * Los dos bordes, y no el centro. Con el centro hay que recorrer un ancho de
   * columna entero para cambiar de lugar; con el borde, el cambio dispara cuando
   * la columna todavia esta a medio camino de la vecina --que es justo cuando el
   * ojo dice que se cruzaron--. Mira el borde que va primero: el derecho yendo
   * hacia la derecha, el izquierdo yendo hacia la izquierda.
   *
   * Se CALCULA con los anchos cacheados y NO se mide del DOM. No por precision:
   * midiendo con `getBoundingClientRect`, las posiciones de los vecinos
   * INCLUYEN el `translateX` del empuje, y con la animacion a medio camino el
   * centro de un vecino se movia solo. La columna cruzaba el centro y volvia a
   * cruzarlo al terminar la animacion, yendo y viniendo sola. Los anchos no se
   * mueven.
   *
   * El destino es el vecino MAS LEJAN que ya se cruzo --hacia la derecha, el
   * indice mas grande; hacia la izquierda, el mas chico-- porque el recorrido va
   * de izquierda a derecha: sin `min`/`max` se queda el de al lado y la columna
   * cruzaria de a uno.
   *
   * SIN MARGEN, y es el precio de la regla: al cruzarse, el borde que dispara
   * queda parado sobre la mitad de la vecina que acaba de correr, o sea que el
   * umbral para volver a cruzarla es el mismo punto. Entrar y salir del cambio
   * queda a un pixel. Si molesta en la practica, el margen va en la comparacion
   * del `derecha`.
   */
  const destinoBajo = (
    borde: number,
    lista: TableColumnDto[],
    desde: number,
    ancho: Record<string, number>,
  ): number => {
    const derecha = borde + (ancho[lista[desde].id] ?? 0);
    let destino = desde;
    let slot = ACTION_COL;
    for (let i = 0; i < lista.length; i++) {
      const w = ancho[lista[i].id] ?? 0;
      const centro = slot + w / 2;
      if (i > desde && derecha > centro) destino = Math.max(destino, i);
      else if (i < desde && borde < centro) destino = Math.min(destino, i);
      slot += w;
    }
    return destino;
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

  /**
   * Donde esta el borde izquierdo de una columna dentro de la grilla, en px.
   *
   * Se CALCULA con los anchos cacheados y no se mide del DOM, porque el DOM va
   * siempre un commit atras: leer `offsetLeft` daria la ranura del orden
   * anterior y quedaria un residuo de una columna entera en cada cambio de
   * lugar.
   *
   * Arranca en `ACTION_COL` y no en cero porque ese track --las acciones de
   * fila-- va antes de la primera columna. Sin sumarlo, `dx` salia corrido
   * exactamente 24px: la arrastrada se iba adelante del puntero y mas adelante
   * cuanto mas se arrastraba.
   */
  const slotDe = (lista: TableColumnDto[], id: string, ancho: Record<string, number>) => {
    let slot = ACTION_COL;
    for (const c of lista) {
      if (c.id === id) return slot;
      slot += ancho[c.id] ?? 0;
    }
    return slot;
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
    dragRef.current = { id: columnId, startX: clientX, movido: false, pointerId, grid, grabOffset, dx: 0, objetivo: 0, ancho };
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
    /*
     * El borde izquierdo que quiere la arrastrada, en px desde la grilla. Se
     * calcula ACA y no despues porque es lo que decide el destino: decide por
     * donde se ve la columna, no por donde esta el puntero --que puede estar a
     * media columna de distancia, segun donde la agarraste--. En `destinoBajo` se
     * compara con el borde izquierdo y con el derecho.
     */
    d0.objetivo = clientX - d0.grabOffset - grid.getBoundingClientRect().left;
    const to = destinoBajo(d0.objetivo, base, from, d0.ancho);

    const next = to === from ? base : (() => {
      const n = [...base];
      n.splice(to, 0, n.splice(from, 1)[0]);
      return n;
    })();

    /*
     * El desplazamiento sale de la ranura que esta EN PANTALLA, no de `next`.
     *
     * `setPreview` no reordena el DOM: encola el render. Entre este cuadro y el
     * commit hay un hueco en el que el navegador puede pintar, y si el `--dx`
     * fuera el del orden nuevo la columna se veria corrida una columna entera
     * hasta que el commit llegara. Medido: los tirones al entrar en cada ranura
     * nueva. Con `base` --el orden que esta dibujado-- el cuadro sale bien, y el
     * `useLayoutEffect` de mas abajo corrige el `--dx` cuando el orden cambia.
     */
    d0.dx = d0.objetivo - slotDe(base, d0.id, d0.ancho);

    if (to !== from) {
      /*
       * Se mide antes de `setPreview`, que es lo unico que todavia no paso: con
       * el DOM en el orden viejo, `getBoundingClientRect` da donde esta VISTA la
       * columna, empuje anterior a medio camino incluido.
       */
      const antes: Record<string, number> = {};
      for (const h of Array.from(
        grid.querySelectorAll('[data-column-id]'),
      ) as HTMLElement[]) {
        if (h.dataset.columnId) antes[h.dataset.columnId] = h.getBoundingClientRect().left;
      }
      pushAntes.current = antes;
      setPreview(next);
    }
    pintarDx(d0.dx);
  };

  /*
   * El `--dx` se vuelve a calcular DESPUES de que React reordena.
   *
   * La columna arrastrada esta en dos lugares a la vez: la ranura que le da la
   * grilla --que cambia cuando el orden cambia-- y el `--dx` que la corre. Si el
   * `--dx` quedara con el valor de la ranura anterior, al commit la columna
   * saltaria de golpe el ancho de la que se le cruzó. Por eso se recalcula
   * apenas React aplico el orden nuevo, y se pinta antes de que el navegador
   * dibuje: `useLayoutEffect` corre entre el commit y el pintado, donde
   * `useEffect` corre despues y dejaria ver el salto.
   */
  useLayoutEffect(() => {
    const d0 = dragRef.current;
    if (!d0?.movido) return;
    d0.dx = d0.objetivo - slotDe(preview ?? columns, d0.id, d0.ancho);
    pintarDx(d0.dx);

    /*
     * El empuje se calcula con React ya ordenada la grilla: cada columna que se
     * corrio recibe el `transform` que la devuelve a donde estaba, y de ahi el
     * navegador la lleva a su ranura con la transicion que ya tenia.
     *
     * Va en este mismo efecto y no en uno aparte porque los dos necesitan del
     * mismo commit: primero se corrige la arrastrada y despues se empujan las
     * demas, en el mismo cuadro y antes de que se pinte nada.
     */
    const grid = gridRef.current;
    const antes = pushAntes.current;
    pushAntes.current = null;
    if (!grid || !antes) return;
    const empuje: Record<string, number> = {};
    for (const h of Array.from(grid.querySelectorAll('[data-column-id]')) as HTMLElement[]) {
      const id = h.dataset.columnId;
      if (!id || id === d0.id || antes[id] === undefined) continue;
      const corre = antes[id] - h.getBoundingClientRect().left;
      // menos de medio pixel no es un desplazamiento, es redondeo
      if (Math.abs(corre) > 0.5) empuje[id] = corre;
    }
    setPush(empuje);
  }, [preview, columns]);

  /*
   * El empuje se suelta en el CUADRO siguiente, no en el mismo.
   *
   * Es el truco de toda animacion tipo FLIP: primero se pinta la columna donde
   * estaba, sin transicion, y recien despues se la suelta. Sin el cuadro de
   * espera, el navegador tendria los dos valores en el mismo estilo y no habria
   * nada que animar.
   */
  useLayoutEffect(() => {
    if (!push) return;
    const cuadro = requestAnimationFrame(() => setPush(null));
    return () => cancelAnimationFrame(cuadro);
  }, [push]);

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
   * Cada columna mide lo que mide su contenido, o lo que le fijo el usuario.
   *
   * `max-content` y NO `minmax(max-content, auto)`: el `auto` del max le deja
   * absorber el espacio sobrante y con dos columnas cortas la tabla se estiraba
   * a los 1280px con 610px de vacio al lado de un "Fideos". Una columna crece
   * cuando su contenido crece -- que es lo que prohibe el truncate-- pero no se
   * infla cuando el contenido es corto.
   *
   * Cuando la columna trae `width`, el track es fijo: eso es lo que hace el arrastre
   * del divisor, porque con `max-content` el arrastre se desharía en la medida en
   * que el contenido empuja el track de vuelta.
   *
   * Si la tabla no entra en el ancho disponible, el contenedor la scrollea en
   * horizontal, que se ve que hay mas, en vez de comerse el texto.
   *
   * El ultimo track es el del "+" y TODA fila tiene que emitir su celda, aunque
   * estea vacia. Ver `RowCells`: sin esa celda la grilla se desalinea entera.
   *
   * La dependencia es la FIRMA de los anchos y no `order`: `order` es un array
   * nuevo en cada render, asi que con el no se recordaria nada. Y si el memo se
   * recalculara durante el arrastre, React reescribiria el `gridTemplateColumns`
   * sobre lo que el gesto esta pintando y el ancho en curso se perderia.
   */
  const firmaAnchos = order.map((c) => c.width ?? 0).join(',');
  const template = useMemo(
    () =>
      [
        `${ACTION_COL}px`,
        ...order.map((c) => (c.width ? `${c.width}px` : 'max-content')),
        `${ADD_COL}px`,
      ].join(' '),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [firmaAnchos, order.length],
  );

  /*
   * El relleno del encabezado, y por que son DOS.
   *
   * Es el mismo color que la superficie donde esta la tabla, y difiere porque las
   * superficies difieren: el cuerpo del widget es `gray-800/90` sobre el canvas
   * (#121212), o sea #181818; y la vista es el panel de `gray-900` pelado (#121212).
   * Un solo color no puede ser "el mismo que el fondo" en las dos, asi que va por
   * densidad.
   *
   * NO puede ser transparente, aunque es lo mas fiel: el encabezado es `sticky` y
   * sin relleno las filas se ven pasar POR DEBAJO al scrollear. Tiene que ser
   * opaco.
   */
  const banda = density === 'compact' ? 'bg-gray-800' : 'bg-gray-900';

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

  /**
   * Una celda de `checkbox`.
   *
   * Escribe SIEMPRE `true` o `false`, nunca borra la clave: "sin marcar" y
   * "marcado en falso" se ven igual, asi que borrar la clave no aportaria nada y
   * dejaria la fila con menos informacion de la que tenia.
   */
  const toggleCell = (row: TableRowDto, column: TableColumnDto) => {
    onCellChange(row.id, column.id, row.values[column.id] === true ? false : true);
  };

  /*
   * REDIMENSIONAR UNA COLUMNA, arrastrando su divisor.
   *
   * El ancho en curso se pinta en el DOM, como la transform del arrastre de
   * columnas: el puntero se mueve unas 60 veces por segundo y un setState por
   * movimiento repintaria las 500 celdas de la columna en cada cuadro.
   *
   * Se reconstruye el `gridTemplateColumns` entero --con el ancho nuevo en su
   * posicion y el resto de los tracks como estaban-- en vez de tocar un solo
   * track: el grid no tiene forma de cambiar UN track y recalcular el resto, y
   * tocar el string a mano por indice es donde se cuelan los desalineos.
   *
   * Los anchos de los OTROS tracks salen de los encabezados vivos, no de `order`:
   * durante un arrastre de columnas el DOM muestra el orden de prueba, y leer de
   * ahi es leer lo que esta en pantalla.
   */
  const anchoEnCursoRef = useRef<{ id: string; px: number } | null>(null);

  const pintarAncho = (id: string, px: number) => {
    const grid = gridRef.current;
    if (!grid) return;
    const tracks: string[] = [`${ACTION_COL}px`];
    for (const h of Array.from(grid.querySelectorAll('[data-column-id]'))) {
      const cid = (h as HTMLElement).dataset.columnId ?? '';
      if (cid === id) {
        tracks.push(`${px}px`);
        continue;
      }
      const col = order.find((c) => c.id === cid);
      tracks.push(col?.width ? `${col.width}px` : 'max-content');
    }
    tracks.push(`${ADD_COL}px`);
    grid.style.gridTemplateColumns = tracks.join(' ');
  };

  const startResize = (columnId: string, clientX: number) => {
    const grid = gridRef.current;
    const head = grid?.querySelector(`[data-column-id="${columnId}"]`) as HTMLElement | null;
    if (!grid || !head) return;
    const startW = head.offsetWidth;
    let px = startW;

    const move = (ev: PointerEvent) => {
      const crudo = Math.round(startW + ev.clientX - clientX);
      px = Math.min(Math.max(crudo, MIN_COLUMN_WIDTH), MAX_COLUMN_WIDTH);
      anchoEnCursoRef.current = { id: columnId, px };
      pintarAncho(columnId, px);
    };
    const finish = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', finish);
      window.removeEventListener('blur', finish);
      const curso = anchoEnCursoRef.current;
      anchoEnCursoRef.current = null;
      // Sin movimiento no hay cambio, y sin cambio no hay PATCH: un clic solo sobre
      // el divisor no debe escribir nada.
      if (!curso || curso.px === startW) return;
      onColumnWidth?.(columnId, curso.px);
    };

    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', finish);
    window.addEventListener('blur', finish);
  };

  /**
   * El ancho desde el teclado, para el divider.
   *
   * Un `separator` que no se puede mover sin raton no es un control: es un
   * adorno. Las flechas mueven 8px, que es un paso que se ve sin salirse de la
   * columna, y con Shift son 24.
   */
  const nudgeResize = (columnId: string, delta: number) => {
    const head = gridRef.current?.querySelector(
      `[data-column-id="${columnId}"]`,
    ) as HTMLElement | null;
    const col = columns.find((c) => c.id === columnId);
    if (!head || !col) return;
    const px = Math.min(
      Math.max(Math.round(col.width ?? head.offsetWidth) + delta, MIN_COLUMN_WIDTH),
      MAX_COLUMN_WIDTH,
    );
    if (px === col.width) return;
    pintarAncho(columnId, px);
    onColumnWidth?.(columnId, px);
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
    /*
     * Las casillas se SALTEAN, no se aterrizan: no dibujan input, asi que dejar
     * el estado `editing` apuntando a una de ellas deja una edicion que no
     * existe y un foco que no tiene donde estar. Se busca la siguiente celda
     * editable en el sentido del Tab, que es lo que uno espera al apretarlo.
     */
    for (let i = from + delta; i >= 0 && i < cells.length; i += delta) {
      if (cells[i].c.type === 'checkbox') continue;
      startEditing(cells[i].r, cells[i].c);
      return;
    }
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

  /*
   * La pista de "hay mas a la derecha", por el DOM.
   *
   * Misma razon que el hover de fila: cambiar una clase en cada `scroll` con estado
   * de React repintaria la grilla entera en cada cuadro del desplazamiento. Se
   * togglea `.scroll-hint` --ver `index.css`-- y se recalcula en el `scroll`, en un
   * `ResizeObserver` del contenedor --cambio de ventana-- y en otro del contenido
   * --columnas y filas--, porque agrandar la tabla tambien crea desbordamiento sin
   * que el contenedor cambie de tamano.
   */
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    const contenido = gridRef.current;
    if (!el || !contenido) return;
    const check = () => {
      const sobra = el.scrollWidth - el.clientWidth - el.scrollLeft > 1;
      el.classList.toggle('scroll-hint', sobra);
    };
    check();
    el.addEventListener('scroll', check, { passive: true });
    const observer = new ResizeObserver(check);
    observer.observe(el);
    observer.observe(contenido);
    return () => {
      el.removeEventListener('scroll', check);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/*
       * `overflow-auto` y no nada: una columna larga hace scroll DENTRO de la
       * tabla, nunca empuja la pagina. El encabezado va `sticky` para que siga
       * visible al bajar por las 500 filas.
       */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
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
            /*
             * Mismo relleno y mismo borde que los encabezados, por el mismo
             * motivo: comparten fila y un salto de tono se lee como una costura.
             */
            className={`sticky top-0 z-[var(--z-sticky)] border-b border-gray-600/80 ${banda} ${d.pad}`}
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
              banda={banda}
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
              push={push ?? undefined}
              onDragStart={startDrag}
              onResizeStart={startResize}
              onResizeNudge={nudgeResize}
              onRename={renameColumn}
              onTypeChange={changeColumnType}
              onDelete={deleteColumn}
            />
          ))}
          <AddColumn
            padY={d.padY}
            banda={banda}
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
              /*
               * El tope va aca y no adentro porque es una decision de DENSIDAD, no
               * de columna: la misma celda se dibuja distinta en el widget y en la
               * vista, y en la vista el valor entero tiene que verse.
               */
              anchoCelda={density === 'compact' ? 'max-w-[12rem] truncate' : ''}
              truncar={density === 'compact'}
              onStart={startEditing}
              onToggle={toggleCell}
              onDraft={editDraft}
              onBlur={blur}
              onCancel={cancel}
              onMove={move}
              draggingColId={dragId}
              push={push ?? undefined}
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
          /*
           * `gray-500` y no `gray-600`: este texto dice cuantos datos NO se
           * cargaron, que es informacion, no adorno. En `gray-600` daba 2.2:1 --
           * por debajo del minimo AA y con 12px encima.
           */
          <span className="text-xs text-gray-500" title="These rows were not loaded">
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
  /** Relleno del encabezado: el de la superficie donde vive la tabla. Ver `banda`. */
  banda: string;
  /** Filas con un valor guardado en esta columna. */
  filledRows: number;
  /** Valores que se perderian si esta columna pasara a `number`. */
  pierdeAlPonerNumero: number;
  /** Esta columna es la que se esta arrastrando. */
  dragging: boolean;
  /** Corrimiento del empuje, en px, mientras la arrastrada la mueve de lugar. */
  push?: Record<string, number>;
  onDragStart: (
    columnId: string,
    clientX: number,
    pointerId: number,
    grid: HTMLElement | null,
    grabOffset: number,
  ) => void;
  /** El usuario arrastro el divisor de esta columna. */
  onResizeStart: (columnId: string, clientX: number) => void;
  /** El usuario movio el divisor con el teclado. */
  onResizeNudge: (columnId: string, delta: number) => void;
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
  banda,
  onResizeStart,
  onResizeNudge,
  filledRows,
  pierdeAlPonerNumero,
  dragging,
  push,
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
   * Se dibuja con `position: fixed` en un portal, porque dentro de la grilla no se
   * puede: la tabla vive en un `overflow-auto` y TODO lo que cuelgue del
   * encabezado se recorta con el. Medido: con dos filas, "Delete column" quedaba a
   * 188px de un contenedor que terminaba en 160, invisible, y el clic caia en el
   * boton de "Add row" de abajo.
   *
   * El panel de borrar el mismo error lo tenia antes y arrastraba desde el menu.
   */
  const [ancla, setAncla] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  /*
   * Abrir con clic DERECHO sobre el encabezado.
   *
   * El ancla es el puntero y no un boton: con el menu contextual no hay boton que
   * medir, y ademas tiene que abrirse en la posicion donde uno apunto, que es lo
   * que espera de un menu de ese tipo.
   *
   * Se corrige contra el borde derecho de la ventana: un clic cerca del borde
   * abriria el menu --160px de ancho-- enteramente fuera de la pantalla.
   */
  const MENU_W = 160;
  const abrirMenu = (x: number, y: number) => {
    setAncla({ top: y, left: Math.max(8, Math.min(x, window.innerWidth - MENU_W - 8)) });
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

  /**
   * Cuantos valores se limpian al pasar a `type`.
   *
   * A `number` sobrevive lo que ya se puede leer como numero --"10" pasa a 10--,
   * asi que lo que se cuenta es lo que NO se puede. A `checkbox` no sobrevive
   * nada que no sea `true`/`false`, asi que se cuenta todo lo que tiene algo
   * escrito: por eso el `filledRows` y no un filtro mas.
   */
  const perdidosAlTipo = (type: ColumnType): number => {
    if (type === 'number') return pierdeAlPonerNumero;
    if (type === 'checkbox') return filledRows;
    return 0;
  };

  const aplicarTipo = (type: ColumnType) => {
    // Elegir el tipo que ya tiene no es un cambio: no se gasta un PATCH.
    if (type === column.type) {
      cerrarMenu();
      return;
    }
    // Solo se pregunta cuando hay algo que perder. Si no, se aplica y listo.
    const perdidos = perdidosAlTipo(type);
    if (perdidos > 0) {
      cerrarSoloMenu();
      setConfirmandoTipo(type);
    } else {
      cerrarMenu();
      onTypeChange(column.id, type);
    }
  };

  const perdidosAlConfirmar = confirmandoTipo === null ? 0 : perdidosAlTipo(confirmandoTipo);

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
      cerrarMenu();
    };
    /*
     * `contextmenu` y no solo `mousedown`: con el boton derecho el `mousedown` que
     * abre el menu llega con `button: 2`, y el de cerrar tiene que ser el de
     * CUALQUIER boton. Sin esto, hacer clic derecho afuera no cerraba nada y el
     * menu quedaba pegado con el menu nativo del navegador encima.
     */
    document.addEventListener('mousedown', fuera);
    document.addEventListener('contextmenu', fuera);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('contextmenu', fuera);
    };
    // `cerrarMenu` es estable en la practica: solo pone estado a null.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuAbierto]);

  /*
   * Escape cierra el menu.
   *
   * Sin esto el menu contextual es la unica parte de la tabla que no se puede
   * cerrar con el teclado: se abria con el raton y no habia forma de salir sin
   * volver a hacer clic.
   */
  useEffect(() => {
    if (!menuAbierto) return;
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrarMenu();
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
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

  const typeLabel = COLUMN_TYPE_LABELS[column.type];
  const IconoTipo = TYPE_ICON[column.type];
  /** Corriente del empuje; 0 = no la esta empujando nadie. */
  const empujada = push?.[column.id] ?? 0;

  /*
   * El encabezado tiene el COLOR DE SU FONDO, y se separa con el borde.
   *
   * Paso por dos bandas antes de llegar aca, y las dos estaban mal:
   *
   *   `gray-700`  era la superficie mas clara de la tabla --#383838 sobre #121212
   *               o #181818--: el punto mas brillante de la pantalla. El nombre
   *               daba 4.5:1, justo en el limite con 12px, y el icono del tipo
   *               1.4:1, o sea invisible.
   *   `black/40`  la hundia a #0f0f0f, por debajo de las dos superficies. Menos
   *               ruido, pero se leia como una banda metida adentro en vez de
   *               como parte de la tabla.
   *
   * Ahora es exactamente el fondo donde esta: en el widget `gray-800` y en la
   * vista `gray-900`, que es lo que hay debajo de el. Son dos colores porque las
   * superficies son dos -- ver la nota de `banda` en `TableGrid` -- y no puede ser
   * transparente porque el encabezado es `sticky`.
   *
   * La separacion la carga el BORDE, que es lo unico que hace falta entre dos
   * superficies identicas, y un borde no se nota cuando la banda se mueve.
   *
   * La jerarquia va por BRILLO, en tres pasos medidos, todos sobre AA. Antes
   * estaba atada al fondo y por eso el icono no tenia donde caer; ahora se
   * sostiene sola:
   *
   *   valor    gray-200   13:1   el dato, lo mas brillante
   *   nombre   gray-400    7:1
   *   icono    gray-500    4:1   el tipo, un paso atras del nombre
   *
   * El nombre bajo a `gray-400` porque el `gray-300` se leia casi blanco y una
   * fila de encabezados de 14px con texto casi blanco compite con los datos, que
   * son la razon de estar de la tabla. Con `gray-400` sigue en 7:1 y el ojo va a
   * los valores primero.
   *
   * El icono baja con el porque si no compartirian tono: nombre e icono en el
   * mismo gris los convierte en una mancha. 4:1 alcanza porque es un glifo --la
   * WCAG pide 3:1 para lo que no es texto--, y no baja mas por la misma razon que
   * el nombre: seria esconder el tipo de la columna.
   *
   * Las TRES celdas de esta fila --la esquina, los encabezados y el "+"-- van con
   * el mismo relleno y el mismo borde: comparten fila, y un salto de tono se lee
   * como una costura.
   */
  return (
    <div
      role="columnheader"
      aria-sort="none"
      /* Necesario para que `destinoBajo` mida el encabezado VIVO mientras se
         arrastra, que es lo que define donde cae el puntero. */
      data-column-id={column.id}
      /*
       * El menu es de clic derecho, que es un gesto solo de raton, asi que el
       * encabezado se hace alcanzable con el Tab y abre con Enter, Espacio o la
       * tecla de menu del teclado. Sin esto, renombrar o borrar una columna --las
       * dos unicas cosas que hay en el menu-- serian imposibles sin mouse.
       *
       * `aria-haspopup` y `aria-expanded` van en la celda y no en un boton
       * interior, porque la celda es la que abre el menu ahora.
       */
      tabIndex={0}
      aria-haspopup="menu"
      aria-expanded={menuAbierto}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'ContextMenu') return;
        // Sin puntero, el menu se ancla al borde derecho del encabezado.
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        abrirMenu(r.right - 160, r.bottom);
      }}
      title={`${column.name} · ${typeLabel} · drag to reorder`}
      /*
       * `flex items-center` y no nada: la celda es un item del grid, asi que se
       * estira a la fila y su contenido se pegaba ARRIBA.
       *
       * Importa porque la fila no la fija el encabezado: la fija el "+", que es un
       * boton de 24px. En `full` el texto del encabezado mide 16px de alto y la
       * celda 40 --8 de padding--, o sea que el nombre quedaba 8px mas arriba que
       * el "+" de al lado y los dos no parecian de la misma fila.
       */
      className={`group/col sticky top-0 z-[var(--z-sticky)] flex select-none items-center border-b border-gray-600/80 ${divisor} ${banda} font-medium text-gray-400 ${pad} ${head} ${
        dragging
          ? 'z-[calc(var(--z-sticky)+1)] cursor-grabbing shadow-lg shadow-black/50'
          : 'cursor-grab hover:bg-white/[0.04]'
      }`}
      /*
       * Arrastre desde cualquier parte del encabezado, con umbral en la grilla.
       *
       * El `onPointerDown` va en la celda y no solo en un asa: en el widget el
       * encabezado es de 90px y un asa seria un blanco de 10px, imposible de
       * acertar. El umbral de 4px --que aplica `moveDrag`-- deja pasar el doble
       * clic del renombrado, que no mueve el puntero.
       *
       * El clic DERECHO no arma arrastre --el `button !== 0` de abajo-- asi que el
       * menu contextual y el arrastre conviven en la misma celda sin pelear: son
       * botones distintos y cada uno hace lo suyo.
       *
       * Y desde el divisor NO se arrastra, porque el divisor corta la propagacion
       * para redimensionar. Un asa que ademas moviera la columna seria lo peor de
       * los dos: uno que empuja la columna en vez de correrle el borde.
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
       * El menu se abre con clic DERECHO en cualquier parte del encabezado, menos
       * el divisor --que corta la propagacion de este mismo evento.
       *
       * El ancla es el puntero: con menu contextual no hay boton que medir, y
       * ademas tiene que abrirse donde uno apunto.
       */
      onContextMenu={(e) => {
        e.preventDefault();
        if (renaming || confirming) return;
        abrirMenu(e.clientX, e.clientY);
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
       *
       * El empuje tiene la misma forma pero al reves: `transition: none` mientras
       * la columna esta corrida a la posicion vieja, y la transicion normal un
       * cuadro despues, cuando el corrimiento se suelta y la columna viaja a su
       * ranura sola.
       */
      style={
        empujada
          ? { transform: `translateX(${empujada}px)`, transition: 'none' }
          : dragging
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
        /*
         * `justify-end` en las columnas de cifras.
         *
         * El contenido --icono y nombre-- termina en el mismo borde que el de las
         * celdas, asi que con `justify-end` la etiqueta cae justo encima de sus
         * numeros, que es lo que hace falta para que "Value" rotule una columna de
         * cifras y no parezca un texto suelto al lado de otra cosa.
         *
         * Antes este `justify-end` existia por otra razon: el boton de menu era
         * `absolute` y el nombre se alineaba a la derecha para compensar el hueco
         * que dejaba. Ese boton ya no esta.
         */
        <div
          className={`flex min-w-0 flex-1 items-center gap-1 ${
            column.type === 'number' ? 'justify-end' : ''
          }`}
        >
          {/*
           * El icono del tipo, antes del nombre. Es el mismo del selector del "+",
           * asi que el tipo se lee igual en los dos lugares donde se elige.
           *
           * Va FIJO y no al hover porque el tipo de una columna no es algo que se
           * quiera descubrir: es la fila de arriba de la tabla y es lo primero que
           * uno mira para saber que hay en cada columna.
           *
           * Un paso detras del nombre en brillo, no mas apagado: con el encabezado
           * hundido la jerarquia se hace con el tono. Ver la nota de la banda.
           */}
      {/*
       * El icono del tipo. NO es un asa: el arrastre vive en toda la celda del
       * encabezado y el clic derecho abre el menu, asi que el icono es solo la
       * marca de que tipo guarda la columna.
       *
       * Va con `block`: como hijo de un `flex items-center` lo alinea el flex,
       * pero el `svg` en linea se apoya en la linea base del texto y queda un
       * pixel --segun la fuente-- por debajo del centro. `block` lo saca de la
       * linea base y lo deja donde dice `items-center`.
       *
       * `gray-500`, un paso detras del nombre: con el mismo gris los dos se
       * vuelven una mancha y se pierde que el icono es el tipo y no parte del
       * nombre. Ver la nota de la banda.
       */}
      <IconoTipo
        size={12}
        className="block shrink-0 text-gray-500 group-hover/col:text-gray-400"
      />
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
              title={`${column.name} · ${typeLabel}. Double-click to rename, right-click for options, drag to move.`}
              /*
               * El nombre es lo unico que puede encogerse: con `flex-1` + `min-w-0`
               * en el padre cede y se corta con puntos en vez de estirar el track.
               *
               * El `max-w-[12rem]` le pone un piso al truncate: sin el, el nombre se
               * estira tanto como el texto y las demas columnas quedan fuera de
               * vista. Es el mismo tope que usan las celdas en `compact`.
               */
              className="max-w-[12rem] min-w-0 cursor-inherit truncate whitespace-nowrap text-left transition-colors hover:text-white"
            >
              {column.name}
            </span>
          )}
        </div>
      )}

      {/*
       * EL DIVISOR: el asa para redimensionar la columna.
       *
       * Va en el borde DERECHO del encabezado y redimensiona ESA columna, que es
       * el mismo lugar donde esta el `border-l` de la celda siguiente: la linea que
       * se arrastra es la que ya se ve.
       *
       * Que sea el derecho y no el izquierdo es la convencion de toda planilla y
       * de todo editor de tablas: el divisor pertenece al campo que tiene a su
       * izquierda. Con el asa al borde izquierdo, apretar un divisor movia el
       * limite agrandando el campo de la DERECHA --el que todavia no habia tocado
       * el usuario--, que se lee como que el divisor no hace lo que uno espera.
       * Asi el campo de la izquierda crece y el resto se corre, que es lo unico
       * que se puede esperar de un limite.
       *
       * Hay UN asa por limite y no dos: como vive en el borde derecho de su
       * columna, el limite entre dos columnas tiene el asa de la izquierda y la
       * de la derecha no lo dibujaria encima. Por eso la primera columna no tiene
       * asa a la izquierda --a su izquierda esta el track de las acciones, que no
       * es una columna-- y la ultima si la tiene a la derecha, en el limite con
       * el "+", donde no hay linea permanente pero el hover la dibuja.
       *
       * `stopPropagation` porque el encabezado tiene el arrastre de reordenar en su
       * `pointerdown`: sin esto, agarrar el divisor mueve la columna de lugar y le
       * cambia el tamano al mismo tiempo. Es el mismo motivo por el que el
       * `button !== 0` de arriba no alcanza -- son dos gestos con el boton izquierdo
       * sobre el mismo elemento.
       *
       * El asa mide 8px y no 1px porque 1px no se agarra, y va DENTRO de la celda y
       * no encima del vecino porque un asa a medio camino depende de que la columna
       * siguiente la pinte despues y la tape.
       *
       * El `after` es lo unico que se ve al pasar por encima: una linea de 1px en
       * p2, el color de "esto esta activo" en la app. Sin ella el divisor es
       * invisible y no hay nada que invite a arrastrarlo.
       */}
      <span
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize column ${column.name}`}
        tabIndex={0}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          /*
           * SIN `preventDefault()`.
           *
           * Estaba puesto por la seleccion de texto durante el arrastre, pero el
           * encabezado es `select-none`: no hay nada que seleccionar y el
           * `preventDefault` no HacIA nada por eso.
           *
           * Y hacia MUCHO daño: en Chromium, cancelar el `pointerdown` cancela
           * tambien el `contextmenu` -- o sea que en los 8px de este asa el menu
           * de opciones no se abria nunca, en silencio y sin error. El `contextmenu`
           * del encabezado se cancela en su propio handler, que es donde tiene que
           * estar.
           */
          e.stopPropagation();
          onResizeStart(column.id, e.clientX);
        }}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          // 8px es un paso que se ve; con Shift, 24, que es el ancho de un boton.
          const paso = e.shiftKey ? 24 : 8;
          onResizeNudge(column.id, e.key === 'ArrowLeft' ? -paso : paso);
        }}
        /*
         * El menu NO se abre aca. Es lo unico que hay que exceptuar del "clic
         * derecho en cualquier parte del encabezado": sobre el divisor uno va a
         * redimensionar, y un menu que aparece ahi tapa justo la columna que
         * esta mirando. `stopPropagation` y nada mas --no `preventDefault`--
         * porque el menu nativo del navegador si interesa mostrarlo ahi.
         */
        onContextMenu={(e) => e.stopPropagation()}
        className="absolute right-0 top-0 z-[2] flex h-full w-2 cursor-col-resize touch-none after:absolute after:right-0 after:top-0 after:h-full after:w-px after:bg-transparent after:content-[''] hover:after:bg-p2 focus-visible:after:bg-p2 focus-visible:outline-none"
      />

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
                      {COLUMN_TYPES.map((t) => (
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
                          {COLUMN_TYPE_LABELS[t]}
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
             * Pasar una columna a numero descarta las celdas que no son numeros,
             * y pasarla a checkbox descarta todo lo que tenga escrito. El numero
             * que se muestra es exactamente lo que `coerceValue` va a limpiar en
             * el servidor, y sin este cartel esos valores desaparecerian sin que
             * nadie se enterara.
             */}
            {confirmandoTipo !== null && (
              <div className="mt-0.5 w-56 rounded border border-gray-500/50 bg-gray-800 p-2 shadow-xl">
                <p className="text-xs text-gray-300">
                  Change <span className="text-white">{column.name}</span> to{' '}
                  <span className="text-white">{COLUMN_TYPE_LABELS[confirmandoTipo]}</span>?{' '}
                  <span className="text-white">
                    {perdidosAlConfirmar} {perdidosAlConfirmar === 1 ? 'value' : 'values'}
                  </span>
                  {confirmandoTipo === 'number' ? ' that are not numbers' : ''} will be cleared.
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
 * El "+" que agrega una columna: un selector de tipo con buscador.
 *
 * El buscador esta aunque hoy haya tres tipos y seijan a simple vista. Es el
 * precio de agregar el cuarto: el menu es el unico lugar donde se ve la lista
 * completa de lo que la tabla puede guardar, y sin buscador hay que scrollear
 * para encontrar un tipo que la ventana tape.
 *
 * Abre en las DOS densidades. Antes en `compact` el "+" agrega `text` de una y no
 * abria nada, con el argumento de que en el widget no hay lugar para un menu: el
 * menu va en un portal y no ocupa lugar en la grilla, asi que ese argumento no se
 * sostenia -- y sin esto, en el widget no habia forma de agregar una columna de
 * casillas sin cambiarle el tipo a otra.
 */
function AddColumn({
  padY,
  banda,
  onAdd,
  open,
  onOpenChange,
}: {
  padY: string;
  /** Relleno de la celda del "+": el de la superficie. Ver `banda`. */
  banda: string;
  onAdd: (type: ColumnType) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const botonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [ancla, setAncla] = useState<{ top: number; left: number } | null>(null);
  const [busqueda, setBusqueda] = useState('');

  const cerrar = () => {
    setAncla(null);
    setBusqueda('');
    onOpenChange(false);
  };

  const abrir = () => {
    const b = botonRef.current?.getBoundingClientRect();
    if (!b) return;
    /*
     * Alineado al boton pero sin salirse de la pantalla, en los dos ejes.
     *
     * El "+" vive en el ultimo track, o sea en el borde derecho de la tabla, y
     * el menu mide 158px. Pegado a la izquierda del boton se iba 104px fuera del
     * contenedor --y fuera de la pantalla-- con cualquier tabla de 4 columnas o
     * mas. Abajo es el mismo problema al reves: el menu se abre hacia abajo y un
     * "+" cerca del borde inferior lo cortaba. Se ancla al boton y se corrige
     * contra los bordes de la ventana.
     */
    const left = Math.max(8, Math.min(b.left, window.innerWidth - ADD_MENU_W - 8));
    const top = Math.max(8, Math.min(b.bottom, window.innerHeight - ADD_MENU_H - 8));
    setAncla({ top, left });
    setBusqueda('');
    onOpenChange(true);
  };

  /** Los tipos que matchean lo escrito. Case-insensitive, y recortado por los dos lados. */
  const visibles = COLUMN_TYPES.filter((t) =>
    COLUMN_TYPE_LABELS[t].toLowerCase().includes(busqueda.trim().toLowerCase()),
  );

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
        /*
         * SIN divisor y SIN `border-b`.
         *
         * El "+" no es un campo: es cromo colgado del costado. Con cualquiera de
         * las dos lineas se leia como parte de la grilla --una columna vacia con un
         * boton-- y las dos.extendian el dibujo mas alla del ultimo dato, que es
         * justo la separacion que ahi no existe.
         *
         * Lo unico que comparte con la fila de arriba es el relleno. Ver `banda`.
         */
        className={`sticky top-0 z-[var(--z-sticky)] flex items-center justify-center ${banda} ${padY}`}
      >
        {!open && (
          <button
            ref={botonRef}
            type="button"
            onClick={abrir}
            aria-label="Add column"
            title="Add column"
            className="flex size-6 items-center justify-center rounded text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-200"
          >
            {/*
             * 15px y no 12. El boton NO crece: vive en un track de 24px de ancho
             * --`ADD_COL`-- y pasaria a empujar la ultima columna. El icono era lo
             * unico que se podia agrandar sin romper la grilla.
             */}
            <FiPlus size={15} />
          </button>
        )}
      </div>

      {/*
       * El menu va en un portal, por el mismo motivo que el de la columna: cuelga
       * de una celda de una grilla que esta dentro de un `overflow-auto`, y todo lo
       * que cuelgue se recorta con el.
       *
       * `role="dialog"` y no `menu`: con un buscador adentro ya no es un menu --un
       * menu no puede contener un campo de texto-- y el anuncio que corresponde es
       * "un cuadro con un campo y unos botones".
       */}
      {open &&
        ancla &&
        createPortal(
          <div
            ref={menuRef}
            role="dialog"
            aria-label="Column type"
            style={{ position: 'fixed', top: ancla.top, left: ancla.left, zIndex: 'var(--z-menu)' }}
            className="w-max overflow-hidden rounded border border-gray-600 bg-gray-800 shadow-xl"
          >
            <div className="border-b border-gray-700/60 p-1.5">
              <input
                autoFocus
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') cerrar();
                }}
                spellCheck={false}
                placeholder="Search types"
                aria-label="Search column types"
                /*
                 * Ancho FIJO, y el que fija el del panel: con `w-full` adentro de
                 * un contenedor que se ajusta al contenido, el input devuelve su
                 * ancho intrinseco --unos 170px en Chrome-- y el menu queda mas
                 * ancho que ahora. Lo que se busca es el mas ancho de los hijos, y
                 * ese es el campo. Ver `ADD_MENU_W`.
                 */
                className="w-36 rounded bg-gray-900/60 px-2 py-1 text-xs text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500/50"
              />
            </div>
            {visibles.length === 0 ? (
              /* Sin esto el menu abierto queda en blanco, que parece roto. */
              <p className="px-3 py-2 text-xs text-gray-500">No match</p>
            ) : (
              visibles.map((t) => {
                const Icono = TYPE_ICON[t];
                return (
                  <button
                    key={t}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      cerrar();
                      onAdd(t);
                    }}
                    /*
                     * `group` para que el icono tenga su propio paso en el hover:
                     * el renglon entero es la accion, y el icono es lo que dice
                     * que tipo es. Con el mismo tono que el nombre seria solo
                     * decoracion; un paso mas apagado lo pone en segundo plano y
                     * lo sube junto con el texto.
                     */
                    className="group flex w-full items-center gap-2 whitespace-nowrap px-3 py-1.5 text-left text-xs text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
                  >
                    <Icono size={12} className="shrink-0 text-gray-500 group-hover:text-gray-300" />
                    {/*
                     * Solo el nombre del tipo. Decia "Text column", "Number
                     * column" y "Checkbox column": la misma palabra en los tres
                     * renglones de un popup que ya ES el selector de columna.
                     *
                     * `whitespace-nowrap` porque con el panel ajustado al contenido
                     * un renglon partido haria el ancho depender de donde este el
                     * texto: el menu daria un salto al filtrar.
                     */}
                    {COLUMN_TYPE_LABELS[t]}
                  </button>
                );
              })
            )}
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
  /** Tope de ancho de una celda, solo en `compact`. Ver `RowCells`. */
  anchoCelda: string;
  /** El texto se corta siempre, no solo en `compact`: la columna tiene ancho fijo. */
  truncar: boolean;
  onStart: (row: TableRowDto, column: TableColumnDto) => void;
  /** Marca o desmarca una celda de `checkbox`. No hay edicion: el clic es el cambio. */
  onToggle: (row: TableRowDto, column: TableColumnDto) => void;
  onDraft: (draft: string) => void;
  onBlur: () => void;
  onCancel: () => void;
  onMove: (delta: number) => void;
  /** Columna que se esta arrastrando; sus celdas la siguen. */
  draggingColId: string | null;
  /** Corrimiento del empuje, en px. Ver `push` en `TableGrid`. */
  push?: Record<string, number>;
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
  anchoCelda,
  truncar,
  onStart,
  onToggle,
  onDraft,
  onBlur,
  onCancel,
  onMove,
  draggingColId,
  push,
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
  /*
   * El separador de fila, y por que no es el que habia.
   *
   * Era `gray-700/40`, que sobre la superficie del cuerpo daba 1.16:1: un 5% de
   * diferencia en un canal, o sea que la fila no se leia como fila. En una grilla
   * de 25px con texto de 14px esa linea es lo unico que separa una fila de la
   * siguiente, asi que no es decoracion: es el ritmo de la tabla.
   *
   * `gray-600/70` lo deja en 1.65:1. No mas: una fila mas pesada que esto y la
   * tabla parece papel milimetrado, que es el otro extremo.
   */
  const regla = 'border-b border-gray-600/70';
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
       *
       * La celda va SIN padding y con `justify-center`: no tiene texto, solo el
       * asa, y el padding lo que hacia era correr el boton contra el borde
       * izquierdo --ademas de desbordarlo, porque el boton era mas grande que el
       * hueco que le dejaba--. Centrado, el track queda con el aire que le toca.
       */}
      <div
        data-row-id={row.id}
        className={`flex items-center justify-center ${regla} ${claseAlzada}`}
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
          /*
           * 20px de dibujo con 24 de target: el `after:-inset-1` --el mismo truco
           * que usan los botones de la barra del widget-- hace que el area de
           * click siga siendo de 24 sin que el boton se vea de ese tamano. Bajar
           * el dibujo era necesario para que el asa entre en el track: a 24px
           * con el padding de la celda se salia encima de la primera columna.
           *
           * El glifo va a 14 sobre un dibujo de 20, o sea al 70%: es el tope antes
           * de que `FiMenu` --tres barras con puntos-- empiece a tocarse con el
           * borde del boton. Si hace falta mas, el paso siguiente es el boton y el
           * track, no el glifo.
           *
           * SIN fondo en hover, a proposito. El asa esta siempre visible --no es un
           * control que aparece--, y un rectangulo que se enciende al pasar por
           * encima hace que la fila parezca una celda pulsable: el hover pertenece
           * a la fila entera --`.row-hover`-- y este asa se le suma.
           *
           * El `transition-colors` queda para el unico cambio de color que le
           * queda: el glifo se aclara cuando la fila se levanta.
           */
          className={`relative flex size-5 shrink-0 cursor-grab touch-none items-center justify-center rounded transition-colors after:pointer-events-auto after:absolute after:-inset-1 after:content-[''] active:cursor-grabbing ${
            lifting ? 'text-gray-300' : 'text-gray-600'
          }`}
        >
          <FiMenu size={14} />
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
        /*
         * La celda de una columna que la arrastrada esta empujando se corre con
         * ella. Sin esto solo se animan los encabezados y la tabla se ve como si
         * el titulo se corriera solo mientras los datos quedan en su sitio.
         */
        const empujada = push?.[c.id] ?? 0;
        return (
          <div
            key={c.id}
            data-row-id={row.id}
            style={
              empujada
                ? { transform: `translateX(${empujada}px)`, transition: 'none' }
                : filaAlzada
                  ? {
                      transform: lifted
                        ? 'translateX(var(--dx, 0px))'
                        : 'translateY(var(--dy, 0px))',
                      transition: 'none',
                    }
                  : { transition: 'transform 120ms ease-out' }
            }
            className={`${regla} ${divisor} ${pad} ${text} ${
              /*
               * La casilla se CENTRA en la fila y las demas celdas se pegan
               * arriba. `align-top` deja la celda con el alto de su contenido, y
               * en una fila de texto eso ya es casi todo el alto; para un cuadro
               * de 16px dentro de una fila de 36 se notaria flotando. Sin
               * `align-top` la celda se estira a la fila y `items-center` la
               * centra en ella.
               */
              c.type === 'checkbox' ? 'flex items-center' : 'align-top'
            } ${
              filaAlzada
                ? 'relative z-[1] bg-gray-900/80'
                : isEditing
                  ? 'bg-gray-700/60'
                  : ''
            }`}
          >
            {c.type === 'checkbox' ? (
              /*
               * La celda ES el control: no hay doble clic ni modo edicion, se
               * marca y se guarda. Una casilla no tiene un texto adentro que
               * editar.
               *
               * Un `input type="checkbox"` de verdad y no un `div` con un cuadrado
               * dibujado, para que Space lo marque, el foco llegue con el Tab y el
               * lector de pantalla lo anuncie como casilla y no como texto.
               *
               * Las clases son las del todo-list, copia exacta: se habian
               * cambiado a `border-gray-600` y el borde paso a 2.2:1 contra su
               * propio relleno, o sea que la casilla sin marcar era un cuadrado
               * de 16px mas claro que la fila y con el borde casi borrado. El
               * control tiene que leerse mas que la fila que lo contiene.
               */
              <input
                type="checkbox"
                /* `=== true` y no truthiness: el valor guardado puede ser texto. */
                checked={raw === true}
                onChange={() => onToggle(row, c)}
                aria-label={`${c.name}, row ${rowIndex + 1}`}
                className="h-4 w-4 shrink-0 cursor-pointer appearance-none rounded border border-gray-500 bg-gray-700 transition-colors checked:border-gray-400 checked:bg-gray-400 checked:bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20viewBox=%270%200%2016%2016%27%20fill=%27none%27%20stroke=%27white%27%20stroke-width=%272.5%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27%3E%3Cpath%20d=%27M3.5%208.5l3%203%206-7%27/%3E%3C/svg%3E')] checked:bg-center checked:bg-no-repeat checked:bg-[length:12px_12px] hover:border-gray-400"
              />
            ) : isEditing ? (
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
                /*
                 * Con el texto cortado el valor entero no esta en pantalla, asi que
                 * el `title` es lo unico que lo deja disponible sin abrir la tabla en
                 * otra vista. Solo cuando hay corte posible: un tooltip en cada celda
                 * de una tabla que ya se lee entera es ruido.
                 */
                title={truncar || c.width ? shown || undefined : undefined}
                /*
                 * LAS CIFRAS A LA DERECHA, y con digitos de ancho fijo.
                 *
                 * Todo estaba alineado a la izquierda, y una columna de valores
                 * --1.234, 56, 890-- alineada a la izquierda no se lee como
                 * cifras: el borde de las unidades queda en zigzag y comparar
                 * magnitudes obliga a leer numero por numero. A la derecha se
                 * comparan por el borde, que es como se comparan.
                 *
                 * `tabular-nums` para que el 1 ocupe lo mismo que el 8: sin eso
                 * los digitos se corren y la columna tiembla al escribir. La app
                 * ya lo usa en el readout retraido.
                 *
                 * Y el tope SOLO en `compact`: en el widget un valor de 60
                 * caracteres metia una columna de 400px y empujaba todo lo demas
                 * fuera de la vista. En la vista el texto entero tiene que verse --
                 * para eso esta el "Open" del widget--, asi que alla no se toca.
                 *
                 * EXCEPTO cuando la columna tiene ancho fijo, y ahi `truncate` es
                 * obligatorio y no unadecision: sin `overflow-hidden`, el texto se
                 * sale de la celda y se dibuja encima de la columna vecina. Un
                 * track fijo con contenido sin recortar es texto encima de texto.
                 */
                className={`flex min-h-6 w-full min-w-[3rem] items-center cursor-text whitespace-nowrap text-gray-200 transition-colors hover:bg-white/[0.04] ${
                  c.type === 'number' ? 'justify-end text-right tabular-nums' : 'text-left'
                } ${truncar || c.width ? 'truncate' : ''} ${anchoCelda}`}
              >
                {/*
                 * El vacio se ve porque hay algo que hacer clic, pero no como
                 * texto: "null" o "undefined" en la celda serian ruido.
                 *
                 * `gray-600` y no `gray-700`: este guion estaba en 1.5:1, o sea
                 * que el placeholder de una celda con algo que hacer era
                 * invisible. Sigue siendo un placeholder apagado, solo que ahora se
                 * ve.
                 */}
                {shown || <span className="text-gray-600">&mdash;</span>}
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
       * Ni divisor ni `border-b`, igual que el "+" de arriba: este track es el
       * del boton, no el de una columna, y cualquier linea aqui extenderia el
       * dibujo de la tabla mas alla del ultimo dato.
       */}
      <div
        data-row-id={row.id}
        className={`${claseAlzada}`}
        aria-hidden="true"
        style={transformFila}
      />
    </>
  );
});
