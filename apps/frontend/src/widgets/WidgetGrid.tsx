import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  pointerWithin,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { FiTrash2, FiRotateCcw, FiGrid } from 'react-icons/fi';
import { WidgetFrame } from './WidgetFrame';
import { disposePomodoroTimer } from './pomodoro/timer';
import { getWidget } from './registry';
import type { WidgetData, Position } from './types';
import type { DragHandleProps } from './WidgetFrame';
import * as api from '../api/widgets';
import {
  getDragSession,
  getPendingWidgetType,
  WIDGET_DRAG_MIME,
  type TransferAction,
} from './drag-session';
import {
  CELL_GAP,
  CELL_W,
  CELL_H,
  colsForWidth,
  canvasWidth,
  canvasHeight,
  rectToPixels,
  pxToCells,
  pointToCell,
  rowCountFor,
  clampRect,
  findFirstSlot,
  resolveDrop,
  pushDirectionFor,
  normalizeLayout,
  minSize,
  COLLAPSED_CELLS_H,
} from './grid-utils';
/*
 * Dashboard tipo home screen: grilla de GRID_COLS columnas donde cada widget
 * elige donde va y cuantas celdas ocupa. Todo en coordenadas de celda, asi que
 * el arrastre y el resize snappean solos.
 *
 * El canvas es infinito hacia abajo: las filas se calculan a partir del widget
 * mas bajo, con un par de filas de sobra para tener donde soltar.
 *
 * Invariante: ningun par de widgets se solapa. Lo mantiene `resolveDrop`, que
 * empuja a los que encuentra en el camino hacia el lado del que viene el gesto,
 * y se cae a la pasada hacia abajo si en esa direccion no hay grilla.
 */
const CACHE_VERSION = 3;
const UNDO_TOAST_MS = 5000;
/** Id imposible: sirve para meter un widget sin crear en el calculo del empuje. */
const NEW_WIDGET_PROBE = '__new__';
/*
 * Cuanto sigue viva la clase `.widget-sizing` despues del ultimo cambio.
 *
 * Tiene que ser MAS LARGA que `--motion-sizing` (240ms), no igual: si la clase
 * se sacara antes de que termine la transicion, esta se corta a mitad de camino
 * y el widget da un tirón. El tiron es exactamente el salto que la animación
 * existe para quitar, asi que el margen va aparte del número de la animación en
 * vez de ser el mismo.
 */
const SIZING_SETTLE_MS = 280;
/** Igual que el anterior, pero para la regla `.widget-pushing`. */
const PUSH_SETTLE_MS = 280;
function loadCache(cacheKey: string): WidgetData[] {
  try {
    const cached = localStorage.getItem(cacheKey);
    return cached ? JSON.parse(cached) : [];
  } catch {
    return [];
  }
}
function saveCache(cacheKey: string, data: WidgetData[]) {
  try {
    localStorage.setItem(cacheKey, JSON.stringify(data));
  } catch {}
}
interface WidgetBoxProps {
  widget: WidgetData;
  box: { left: number; top: number; width: number; height: number };
  cols: number;
  onDelete: (id: string) => void;
  onConfigChange: (id: string, config: Record<string, unknown>) => void;
  onResize: (id: string, size: { w: number; h: number }) => void;
  /** Hay un empuje en curso: las cajas deslizan a su nueva celda. */
  pushing?: boolean;
}
function WidgetBox({
  widget,
  box,
  cols,
  onDelete,
  onConfigChange,
  onResize,
  pushing,
}: WidgetBoxProps) {
  const def = getWidget(widget.type);
  /*
   * El nodo que dnd-kit mide es el tirador, no la caja. Asi el sensor arranca
   * justo donde el usuario apoya el mouse, como en el home screen.
   */
  const { attributes, listeners, setNodeRef: setDragHandleRef, isDragging, transform } =
    useDraggable({
      id: `widget-${widget.id}`,
      data: { widgetId: widget.id },
    });
  /*
   * Redimensionado por tirador en la esquina inferior derecha. Se reporta en
   * celdas, no en px: mientras se arrastra solo se mueve el widget localmente y
   * la posicion se commitea al soltar. Asi no hay un PATCH por pixel.
   */
  const [draft, setDraft] = useState<{ w: number; h: number } | null>(null);
  const draftRef = useRef<{ w: number; h: number } | null>(null);
  /*
   * Vive un poco mas alla del gesto. Si la transicion se sacara en el mismo
   * frame en que se commitea el tamano, el ultimo paso se cortaria a mitad de
   * camino y el widget daria un tiron al soltar: justo el salto que se esta
   * tratando de quitar.
   */
  const [resizing, setResizing] = useState(false);
  const settleRef = useRef(0);
  useEffect(() => () => clearTimeout(settleRef.current), []);
  const min = minSize(widget.type);
  const collapsed = (widget.config.collapsed as boolean) ?? false;
  /*
   * Repliegue del widget: misma transicion que el redimensionado, sobre el alto
   * de la misma caja.
   *
   * La clase tiene que estar puesta ANTES de que el alto cambie, y el alto
   * cambia en el mismo render en que cambia `collapsed`. Un `useEffect` llega
   * tarde: cuando corre, el alto ya commiteo sin transicion y no hay nada que
   * interpolar. Comparar contra el valor previo durante el render y marcar el
   * estado ahi hace que React descarte el render en curso y vuelva a hacerlo
   * con la clase ya puesta, antes de commitear.
   *
   * Vive mas alla del cambio por lo mismo que el redimensionado: si la clase se
   * sacara en el mismo commit, la transicion se cortaria a mitad de camino.
   */
  const prevCollapsedRef = useRef(collapsed);
  const [retracting, setRetracting] = useState(false);
  const retractTimerRef = useRef(0);
  if (prevCollapsedRef.current !== collapsed) {
    prevCollapsedRef.current = collapsed;
    setRetracting(true);
    if (retractTimerRef.current) clearTimeout(retractTimerRef.current);
    retractTimerRef.current = window.setTimeout(() => setRetracting(false), SIZING_SETTLE_MS);
  }
  useEffect(() => () => clearTimeout(retractTimerRef.current), []);
  const handleResizeStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setResizing(true);
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = widget.position.w;
      const startH = widget.position.h;
      let frame = 0;
      let pending: { w: number; h: number } | null = null;
      const clamp = (w: number, h: number) => {
        const rect = clampRect(
          { x: widget.position.x, y: widget.position.y, w, h },
          widget.type,
          cols,
        );
        return { w: rect.w, h: rect.h };
      };
      const flush = () => {
        frame = 0;
        if (!pending) return;
        const next = clamp(pending.w, pending.h);
        draftRef.current = next;
        setDraft(next);
        pending = null;
      };
      const onMove = (ev: PointerEvent) => {
        pending = {
          w: startW + pxToCells(ev.clientX - startX, 0).dx,
          h: startH + pxToCells(0, ev.clientY - startY).dy,
        };
        if (!frame) frame = requestAnimationFrame(flush);
      };
      const finish = () => {
        if (frame) {
          cancelAnimationFrame(frame);
          frame = 0;
        }
        flush();
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', finish);
        window.removeEventListener('blur', finish);
        const committed = draftRef.current;
        draftRef.current = null;
        setDraft(null);
        if (settleRef.current) clearTimeout(settleRef.current);
        settleRef.current = window.setTimeout(() => setResizing(false), SIZING_SETTLE_MS);
        if (committed) onResize(widget.id, committed);
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', finish);
      window.addEventListener('blur', finish);
    },
    [widget.id, widget.position.x, widget.position.w, widget.position.h, min.w, min.h, cols, onResize],
  );
  if (!def) return null;
  /*
   * El borrador cambia las medidas en vivo sin tocar el estado global: si se
   * escribiera en `widgets`, cada pixel del raton re-renderizaría la grilla
   * entera y dispararía un PATCH por movimiento.
   */
  const drawn = draft ?? { w: widget.position.w, h: widget.position.h };
  const liveBox = draft
    ? rectToPixels({ ...widget.position, w: drawn.w, h: drawn.h })
    : box;
  /*
   * Sin animacion de reubicacion: cuando un widget cambia de celda aparece
   * directamente en su posicion nueva.
   *
   * Reubicacion: cuando un widget cae sobre otro, los de abajo se corren. Ahora
   * deslizan en vez de saltar -- ver `.widget-pushing` en index.css. Se deslizan
   * los que se empujan Y el que se acaba de soltar: con el `transform` de dnd-kit
   * incluido en la transicion, ese entra a su celda en vez de saltar y despues
   * correr.
   */
  return (
    <>
      {/*
        Silueta de la celda de origen. Se dibuja solo mientras se arrastra y
        queda clavada en el lugar de donde salio el widget, como el hueco que
        deja una app al levantarla en iOS.

        El dibujo es `.widget-slot`, la misma clase que usa la celda de destino
        de un widget nuevo. El por que de ese dibujo esta en la clase.
      */}
      {isDragging && (
        <div
          aria-hidden="true"
          className="widget-slot pointer-events-none absolute"
          style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
        />
      )}
      {/*
        El widget real es el que sigue al cursor, movido con `transform`.
        Antes se usaba un DragOverlay que renderizaba una SEGUNDA copia en un
        portal: se veía el original atenuado mas la copia moviendose (la
        "estela") y, peor, el componente se montaba dos veces, asi que el
        Pomodoro corria dos workers y dos timers a la vez.
      */}
      <div
        data-widget-id={widget.id}
        className={`absolute touch-none${resizing || retracting ? ' widget-sizing' : ''}${
          pushing ? ' widget-pushing' : ''
        }`}
        style={{
          left: liveBox.left,
          top: liveBox.top,
          width: liveBox.width,
          /*
           * Retraido ocupa una celda entera, no 27px: el readout necesita el
           * alto. Se dice `CELL_H` y no `liveBox.height` a proposito -- un widget
           * retraido que venga de datos viejos puede tener `position.h` de 4 y se
           * dibujaria como un widget grande con la barra de titulo pegada arriba.
           */
          height: collapsed ? CELL_H : liveBox.height,
          transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
          zIndex: isDragging ? 900 : undefined,
          cursor: isDragging ? 'grabbing' : undefined,
        }}
      >
      <WidgetFrame
        id={widget.id}
        type={widget.type}
        config={widget.config}
        component={def.component}
        onDelete={onDelete}
        onConfigChange={onConfigChange}
        label={def.label}
        dragHandleProps={{ ...attributes, ...listeners } as DragHandleProps}
        dragHandleRef={setDragHandleRef}
        isDragging={isDragging}
      />
      <button
        type="button"
        aria-label={`Resize ${def.label}`}
        onPointerDown={handleResizeStart}
        /*
         * Oculto mientras esta retraido. El tirador agrandaria la celda del
         * widget y empujaria a los de abajo, pero la config seguiria diciendo
         * "retraido" y se dibujaria como una franja con una celda grande debajo.
         * Un widget retraido se despliega, no se redimensiona.
         */
        hidden={collapsed}
        tabIndex={collapsed ? -1 : 0}
        className="absolute bottom-0 right-0 z-20 h-3 w-3 cursor-nwse-resize touch-none"
        style={{
          backgroundImage:
            'linear-gradient(135deg, transparent 50%, var(--color-gray-600) 50%)',
          backgroundSize: '8px 8px',
          backgroundPosition: 'bottom right',
          backgroundRepeat: 'no-repeat',
          border: 'none',
          padding: 0,
        }}
      />
      </div>
    </>
  );
}
interface WidgetGridProps {
  tabId: string;
  onAddWidgetRef: (
    tabId: string,
    fn: (type: string, opts?: { deferCommit?: boolean }) => Promise<Position | null>,
  ) => void;
  onPredictAddRef?: (tabId: string, fn: (type: string) => Position | null) => void;
  onRevealRef?: (tabId: string, fn: () => void) => void;
  onRefreshRef?: (tabId: string, fn: () => void) => void;
  onTransferRef?: (tabId: string, fn: (action: TransferAction) => void) => void;
  onWidgetDragStart: (widgetId: string, sourceTabId: string) => void;
  onWidgetDragEnd: () => void;
  onWidgetTransferred: (targetTabId: string, action: TransferAction) => void;
  onWidgetSynced: (targetTabId: string) => void;
}
export function WidgetGrid({
  tabId,
  onAddWidgetRef,
  onPredictAddRef,
  onRevealRef,
  onRefreshRef,
  onTransferRef,
  onWidgetDragStart,
  onWidgetDragEnd,
  onWidgetTransferred,
  onWidgetSynced,
}: WidgetGridProps) {
  const cacheKey = `dashlet-widgets-${tabId}-v${CACHE_VERSION}`;
  /*
 * El cache se carga sin normalizar: `cols` todavia no se conoce en el primer
 * render. El efecto de fetch que sigue normaliza con el ancho real, asi que
 * alcanza con el estado crudo mientras tanto.
 */
const [widgets, setWidgets] = useState<WidgetData[]>(() => loadCache(cacheKey));
  const [loaded, setLoaded] = useState(false);
  const [undoToastWidget, setUndoToastWidget] = useState<WidgetData | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoDeadlineRef = useRef(0);
  const undoRingRafRef = useRef(0);
  const undoRingRef = useRef<SVGRectElement | null>(null);
  const widgetsRef = useRef(widgets);
  const deferredCommitRef = useRef<WidgetData[] | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  /*
   * Ventana de reubicacion. Va en `WidgetGrid` y no en `WidgetBox` porque los
   * tres empuves -- al soltar un widget, al soltar uno nuevo del menu y al
   * desplegar -- se resuelven todos desde aca.
   */
  const [pushing, setPushing] = useState(false);
  const pushTimerRef = useRef(0);
  /*
   * Deja puesta la clase de transicion. La tiene que quedar DESPUES de que la
   * posicion cambie, porque una transicion se lee del estilo de despues: si se
   * sacara en el mismo commit, la caja se cortaria a mitad de camino. Se llama
   * justo antes del `setWidgets` para que ambas cosas entren en el mismo
   * render.
   */
  const beginPush = useCallback(() => {
    setPushing(true);
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    pushTimerRef.current = window.setTimeout(() => setPushing(false), PUSH_SETTLE_MS);
  }, []);
  useEffect(
    () => () => {
      if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    },
    [],
  );
  const [containerWidth, setContainerWidth] = useState(0);
  useEffect(() => {
    widgetsRef.current = widgets;
  }, [widgets]);
  useEffect(
    () => () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      if (undoRingRafRef.current) cancelAnimationFrame(undoRingRafRef.current);
    },
    [],
  );
  /*
   * La celda mide 80px fijo, asi que el resize de la ventana no toca ningun
   * widget: lo que cambia es cuantas columnas entran. Es lo unico que se
   * mide del DOM.
   */
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const cols = useMemo(() => colsForWidth(containerWidth), [containerWidth]);
  const rows = useMemo(() => rowCountFor(widgets), [widgets]);
  const stopUndoRing = useCallback(() => {
    if (undoRingRafRef.current) {
      cancelAnimationFrame(undoRingRafRef.current);
      undoRingRafRef.current = 0;
    }
  }, []);
  const runUndoRing = useCallback(() => {
    stopUndoRing();
    const step = () => {
      const el = undoRingRef.current;
      if (!el) {
        undoRingRafRef.current = 0;
        return;
      }
      const remaining = Math.max(0, undoDeadlineRef.current - performance.now());
      const frac = Math.min(1, remaining / UNDO_TOAST_MS);
      el.style.strokeDashoffset = String(100 * (1 - frac));
      undoRingRafRef.current = frac > 0 ? requestAnimationFrame(step) : 0;
    };
    undoRingRafRef.current = requestAnimationFrame(step);
  }, [stopUndoRing]);
  const dismissUndoToast = useCallback(() => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    stopUndoRing();
    setUndoToastWidget(null);
  }, [stopUndoRing]);
  const startUndoTimer = useCallback(() => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoDeadlineRef.current = performance.now() + UNDO_TOAST_MS;
    undoTimerRef.current = setTimeout(() => {
      undoTimerRef.current = null;
      setUndoToastWidget(null);
    }, UNDO_TOAST_MS);
    runUndoRing();
  }, [runUndoRing]);
  const computeNewPosition = useCallback(
    (type: string): Position => {
      const size = minSize(type);
      const slot = findFirstSlot(widgetsRef.current, type, cols, size);
      return clampRect({ ...slot, ...size }, type, cols);
    },
    [cols],
  );
  const handleAddWidget = useCallback(
    async (
      type: string,
      opts?: { deferCommit?: boolean },
    ): Promise<Position | null> => {
      const def = getWidget(type);
      if (!def) return null;
      const size = minSize(type);
      const slot = findFirstSlot(widgetsRef.current, type, cols, size);
      const position = clampRect({ ...slot, ...size }, type, cols);
      await api.createWidget(type, def.defaultConfig, position, tabId);
      const data = await api.fetchWidgets(tabId);
      const normalized = normalizeLayout(data, cols);
      if (opts?.deferCommit) {
        deferredCommitRef.current = normalized;
        return position;
      }
      setWidgets(normalized);
      saveCache(cacheKey, normalized);
      return position;
    },
    [tabId, cacheKey, cols],
  );
  useEffect(() => {
    onAddWidgetRef(tabId, handleAddWidget);
  }, [handleAddWidget, onAddWidgetRef, tabId]);

  /*
   * Suelte del menu "+": el widget nace en la celda donde se solto y empuja a lo
   * que quede en el camino, igual que mover uno que ya existe.
   *
   * Aca no hay gesto del cual sacar la direccion -- el widget no viene de
   * ningun lado de la grilla, sale del menu -- asi que empuja hacia abajo, que
   * es la direccion donde siempre hay espacio.
   *
   * El empuje se PERSISTE. `normalizeLayout` tambien lo reparte, pero solo en
   * memoria: si no se guarda, al recargar los demas vuelven a su sitio y el
   * layout se desarma. Se usa un id imposible como sonda para que `resolveDrop`
   * trate al widget nuevo como el que se esta moviendo.
   */
  const addWidgetAt = useCallback(
    async (type: string, cell: { x: number; y: number }) => {
      const def = getWidget(type);
      if (!def) return;
      const target = clampRect({ ...cell, ...minSize(type) }, type, cols);
      const probe: WidgetData = {
        id: NEW_WIDGET_PROBE,
        userId: '',
        tabId,
        type,
        config: def.defaultConfig,
        position: target,
        zIndex: 0,
      };
      const resolved = resolveDrop(
        [...widgetsRef.current, probe],
        NEW_WIDGET_PROBE,
        target,
        cols,
      );
      if (!resolved) return;
      await api.createWidget(type, def.defaultConfig, resolved.moved.position, tabId);
      await Promise.all(resolved.shifted.map((s) => api.updateWidget(s.id, { position: s.position })));
      const data = await api.fetchWidgets(tabId);
      const normalized = normalizeLayout(data, cols);
      if (resolved.shifted.length) beginPush();
      setWidgets(normalized);
      saveCache(cacheKey, normalized);
    },
    [tabId, cacheKey, cols, beginPush],
  );

  /*
   * Arrastre NATIVO desde el menu "+". Es otro sistema que dnd-kit: aqui manda
   * el navegador, no el puntero. Las dos reglas que no se pueden omitir:
   *
   * - `dragover` tiene que llamar a preventDefault. Sin eso el elemento no
   *   cuenta como destino valido, no se dispara `drop` y no hay forma de
   *   arrastrar nada sobre el.
   * - solo se acepta el MIME propio de Dashlet. dnd-kit no usa DnD nativo, asi
   *   que este handler nunca ve los drags de mover o redimensionar, y sin el
   *   chequeo un archivo soltado desde el escritorio activaria el preview.
   */
  /*
   * La silueta NO vive en estado de React. `dragover` dispara en cada movimiento
   * del mouse, y un setState ahi re-renderiza `WidgetGrid` entero: todos los
   * widgets con su contenido, en cada frame. Con el nodo directo se escribe solo
   * su `transform` y el resto del canvas no se entera.
   *
   * Los refs, no el estado, tambien por el `requestAnimationFrame`: dentro del
   * callback no existe `e.currentTarget`, porque React ya termino de despachar.
   */
  const dropAreaRef = useRef<HTMLDivElement | null>(null);
  const dropPreviewRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef(0);
  const pendingDragRef = useRef<{ x: number; y: number; type: string } | null>(null);
  // dragleave tambien dispara al pasar sobre cada hijo. El contador da la
  // salida real del area sin parpadear.
  const dragDepthRef = useRef(0);

  const isWidgetDrag = (e: React.DragEvent) => e.dataTransfer.types.includes(WIDGET_DRAG_MIME);

  /*
   * Cancelar el frame pendiente es parte de ocultar. Si no, un `dragover` que
   * se pidio justo antes de salir del canvas se resuelve despues y vuelve a
   * prender la silueta, que queda pegada afuera del canvas.
   */
  const hidePreview = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    pendingDragRef.current = null;
    const el = dropPreviewRef.current;
    if (el) el.style.opacity = '0';
  };

  /*
   * Coloca la silueta. La primera vez de cada arrastre se saltea la transicion:
   * si no, apareceria deslizando desde el 0,0, que esta en la esquina y no
   * arriba del puntero.
   *
   * El salto se hace con un reflow forzado y no con un `requestAnimationFrame`
   * para el apagado: un segundo frame guardaria su id en el mismo ref que
   * usa `dragover` y, sin volverlo a cero, cortaria el siguiente `dragover`.
   */
  const placePreview = (px: { left: number; top: number; width: number; height: number }) => {
    const el = dropPreviewRef.current;
    if (!el) return;
    el.style.width = `${px.width}px`;
    el.style.height = `${px.height}px`;
    el.style.transform = `translate3d(${px.left}px, ${px.top}px, 0)`;
    if (el.style.opacity !== '1') {
      el.classList.add('drop-preview-instant');
      el.style.opacity = '1';
      // Obliga al navegador a registrar esta posicion con la transicion apagada.
      void el.offsetWidth;
      el.classList.remove('drop-preview-instant');
    }
  };

  const handleNativeDragEnter = (e: React.DragEvent) => {
    if (!isWidgetDrag(e)) return;
    e.preventDefault();
    dragDepthRef.current += 1;
  };

  const handleNativeDragOver = (e: React.DragEvent) => {
    if (!isWidgetDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const type = getPendingWidgetType();
    if (!type) {
      hidePreview();
      return;
    }
    // `dragover` puede dispararse varias veces por frame: se guarda el ultimo
    // punto y se resuelve una sola vez en el proximo frame.
    pendingDragRef.current = { x: e.clientX, y: e.clientY, type };
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const p = pendingDragRef.current;
      const area = dropAreaRef.current;
      if (!p || !area) return;
      pendingDragRef.current = null;
      const rect = area.getBoundingClientRect();
      const cell = pointToCell(p.x, p.y, rect, cols);
      placePreview(rectToPixels(clampRect({ ...cell, ...minSize(p.type) }, p.type, cols)));
    });
  };

  const handleNativeDragLeave = (e: React.DragEvent) => {
    if (!isWidgetDrag(e)) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) hidePreview();
  };

  const handleNativeDrop = async (e: React.DragEvent) => {
    if (!isWidgetDrag(e)) return;
    e.preventDefault();
    dragDepthRef.current = 0;
    hidePreview();
    const type = e.dataTransfer.getData(WIDGET_DRAG_MIME);
    if (!type) return;
    const rect = e.currentTarget.getBoundingClientRect();
    await addWidgetAt(type, pointToCell(e.clientX, e.clientY, rect, cols));
  };

  /*
   * Soltar fuera del canvas no dispara ni drop ni dragleave, y el preview se
   * quedaria pegado. `dragend` es el unico evento que dispara siempre.
   */
  useEffect(() => {
    const clear = () => {
      dragDepthRef.current = 0;
      hidePreview();
    };
    window.addEventListener('dragend', clear);
    return () => {
      window.removeEventListener('dragend', clear);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);
  const predictAddPosition = useCallback(
    (type: string) => computeNewPosition(type),
    [computeNewPosition],
  );
  useEffect(() => {
    if (onPredictAddRef) onPredictAddRef(tabId, predictAddPosition);
  }, [predictAddPosition, onPredictAddRef, tabId]);
  const revealDeferredCommit = useCallback(() => {
    const next = deferredCommitRef.current;
    if (!next) return;
    deferredCommitRef.current = null;
    setWidgets(next);
    saveCache(cacheKey, next);
  }, [cacheKey]);
  useEffect(() => {
    if (onRevealRef) onRevealRef(tabId, revealDeferredCommit);
  }, [revealDeferredCommit, onRevealRef, tabId]);
  const refresh = useCallback(() => {
    api
      .fetchWidgets(tabId)
      .then((data) => {
        const normalized = normalizeLayout(data, cols);
        setWidgets(normalized);
        saveCache(cacheKey, normalized);
        setLoaded(true);
      })
      .catch(() => {});
  }, [tabId, cacheKey, cols]);
  useEffect(() => {
    if (onRefreshRef) onRefreshRef(tabId, refresh);
  }, [refresh, onRefreshRef, tabId]);
  const handleTransfer = useCallback(
    (action: TransferAction) => {
      setWidgets((prev) => {
        if (action.type === 'remove') return prev.filter((w) => w.id !== action.widgetId);
        if (prev.some((w) => w.id === action.widget.id)) return prev;
        return normalizeLayout([...prev, action.widget], cols);
      });
    },
    [cols],
  );
  useEffect(() => {
    if (onTransferRef) onTransferRef(tabId, handleTransfer);
  }, [handleTransfer, onTransferRef, tabId]);
  useEffect(() => {
    let cancelled = false;
    function fetch() {
      api
        .fetchWidgets(tabId)
        .then((data) => {
          if (cancelled) return;
          const normalized = normalizeLayout(data, cols);
          setWidgets(normalized);
          saveCache(cacheKey, normalized);
          setLoaded(true);
        })
        .catch(() => {
          if (!cancelled) setTimeout(fetch, 1000);
        });
    }
    fetch();
    return () => {
      cancelled = true;
    };
  }, [tabId, cacheKey, cols]);
  useEffect(() => {
    saveCache(cacheKey, widgets);
  }, [widgets, cacheKey]);
  const handleDelete = useCallback(
    (id: string) => {
      const widget = widgetsRef.current.find((w) => w.id === id);
      /*
       * El reloj del pomodoro vive fuera del componente (ver `pomodoro/timer.ts`),
       * asi que desmontar el widget NO lo para: eso es lo que permite que siga
       * corriendo retraido. Borrarlo es la unica salida, asi que hay que soltar
       * el registro explicito o el tick seguiria escribiendo contra un widget
       * que ya no existe.
       *
       * El import es arriba del archivo, no perezoso: el registro tiene que estar
       * vivo antes del primer tick.
       */
      disposePomodoroTimer(id);
      api.deleteWidget(id);
      setWidgets((prev) => normalizeLayout(prev.filter((w) => w.id !== id), cols));
      if (!widget) return;
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      setUndoToastWidget(widget);
      startUndoTimer();
    },
    [startUndoTimer, cols],
  );
  const handleUndoDelete = useCallback(() => {
    if (!undoToastWidget) return;
    const widget = undoToastWidget;
    dismissUndoToast();
    api.restoreWidget(widget.id).then(
      () =>
        setWidgets((prev) =>
          prev.some((w) => w.id === widget.id) ? prev : normalizeLayout([...prev, widget], cols),
        ),
      () => {},
    );
  }, [undoToastWidget, dismissUndoToast, cols]);
  /** Lee el tamano guardado al retraer, si hay uno usable. */
function readCollapsedSize(config: Record<string, unknown>): { w: number; h: number } | null {
    const raw = config.collapsedSize;
    if (!raw || typeof raw !== 'object') return null;
    const { w, h } = raw as { w?: unknown; h?: unknown };
    if (!Number.isFinite(w) || !Number.isFinite(h)) return null;
    return { w: Math.round(w as number), h: Math.round(h as number) };
  }

  const handleConfigChange = useCallback((id: string, config: Record<string, unknown>) => {
    const current = widgetsRef.current;
    const widget = current.find((w) => w.id === id);
    /*
     * Retraer y desplegar son ASIMETRICOS a proposito:
     *
     * - Retraer baja la celda a 1 y no mueve a nadie. Las filas liberadas quedan
     *   vacias. Si los de abajo subieran, el tablero se reorganizaria cada vez
     *   que se retrae algo, que es justo lo que no se quiere.
     * - Desplegar, en cambio, SI tiene que empujar: el widget crece y lo que
     *   tenga debajo quedaria dentro de su celda.
     *
     * El alto que tenia antes se guarda en la config porque al bajar la celda se
     * pierde: sin eso, desplegar lo mandaria al minimo del tipo y un widget de
     * 5x5 volveria como 4x3.
     */
    const isCollapse =
      !!widget &&
      typeof config.collapsed === 'boolean' &&
      Boolean(config.collapsed) !== Boolean(widget.config.collapsed);
    if (!isCollapse || !widget) {
      setWidgets((prev) => prev.map((w) => (w.id === id ? { ...w, config } : w)));
      api.updateWidget(id, { config });
      return;
    }
    const collapsed = Boolean(config.collapsed);
    const nextConfig: Record<string, unknown> = { ...config };
    if (collapsed) {
      nextConfig.collapsedSize = { w: widget.position.w, h: widget.position.h };
    } else {
      delete nextConfig.collapsedSize;
    }
    const saved = readCollapsedSize(config);

    if (collapsed) {
      /*
       * Retraer: la celda encoge y NADIE se mueve. Las filas liberadas quedan
       * vacias, que es lo pedido.
       */
      const position = clampRect(
        { ...widget.position, w: widget.position.w, h: COLLAPSED_CELLS_H },
        widget.type,
        cols,
        COLLAPSED_CELLS_H,
      );
      setWidgets(current.map((w) => (w.id === id ? { ...w, config: nextConfig, position } : w)));
      api.updateWidget(id, { config: nextConfig, position });
      return;
    }

    /*
     * Desplegar es lo contrario: el widget CRECE, y lo que este debajo queda
     * adentro de su celda si no se mueve. Aca si hay que empujar, y es el mismo
     * empuje que ya hacen un drop y un resize, asi que se delega a `resolveDrop`
     * en vez de reescribirlo.
     *
     * Se resuelve contra la config ya desplegada para que `minHeightOf` vea al
     * widget en su estado final y no le exija el piso de 1 celda.
     */
    const size = saved ?? minSize(widget.type);
    const target = clampRect({ ...widget.position, ...size }, widget.type, cols, size.h);
    const withNewConfig = current.map((w) => (w.id === id ? { ...w, config: nextConfig } : w));
    const resolved = resolveDrop(withNewConfig, id, target, cols);
    if (!resolved) {
      setWidgets(current.map((w) => (w.id === id ? { ...w, config: nextConfig } : w)));
      api.updateWidget(id, { config: nextConfig });
      return;
    }
    const updates = [{ id, position: resolved.moved.position }, ...resolved.shifted];
    if (resolved.shifted.length) beginPush();
    setWidgets(
      normalizeLayout(
        withNewConfig.map((w) => {
          const patch = updates.find((u) => u.id === w.id);
          return patch ? { ...w, position: patch.position } : w;
        }),
        cols,
      ),
    );
    api.updateWidget(id, { config: nextConfig, position: resolved.moved.position });
    for (const u of resolved.shifted) void api.updateWidget(u.id, { position: u.position });
  }, [cols, beginPush]);
  const commitPositions = useCallback(
    (updates: { id: string; position: Position }[]) => {
      if (!updates.length) return;
      // Mas de un widget movido significa que hubo empuje y hay que deslizarlo.
      // `updates` trae primero al que se movio y despues a los corridos, asi que
      // con dos o mas ya se sabe.
      if (updates.length > 1) beginPush();
      setWidgets((prev) => {
        const next = normalizeLayout(
          prev.map((w) => {
            const patch = updates.find((u) => u.id === w.id);
            return patch ? { ...w, position: patch.position } : w;
          }),
          cols,
        );
        for (const u of updates) {
          const found = next.find((w) => w.id === u.id);
          void api.updateWidget(u.id, { position: found ? found.position : u.position });
        }
        return next;
      });
    },
    [cols, beginPush],
  );
  const handleResize = useCallback(
    (id: string, size: { w: number; h: number }) => {
      // Se calcula el layout final **fuera** del updater: hacer la llamada a la
      // API adentro de `setWidgets` es una efectoimpuro durante el render, y
      // con un `w` fuera de rango `normalizeLayout` podia dejar un rect
      // invalido que rompia el arbol entero al pintarlo.
      const current = widgetsRef.current;
      const widget = current.find((w) => w.id === id);
      if (!widget) return;
      const safe = clampRect({ ...widget.position, ...size }, widget.type, cols);
      const candidate = current.map((w) =>
        w.id === id ? { ...w, position: safe } : w,
      );
      // Al agrandar, los vecinos que quedan tapados se corren de lado, igual que
      // en un drop. Sin gesto del cual sacar la direccion, se va hacia abajo.
      const resolved = resolveDrop(current, id, safe, cols);
      const finalWidget = resolved?.moved ?? { ...widget, position: safe };
      const updates = [
        { id, position: finalWidget.position },
        ...(resolved?.shifted ?? []),
      ];
      /*
       * El empuje se desliza igual que en un drop, y por el mismo motivo: la clase
       * tiene que quedar puesta antes de que las cajas cambien de celda.
       *
       * Faltaba, y por eso agrandar saltaba: los vecinos se movian igual --el
       * `resolveDrop` es el mismo-- pero sin `widget-pushing` no habia quien
       * interpolara el `top`.
       */
      if (resolved?.shifted.length) beginPush();
      setWidgets(
        normalizeLayout(
          candidate.map((w) => {
            const u = updates.find((x) => x.id === w.id);
            return u ? { ...w, position: u.position } : w;
          }),
          cols,
        ),
      );
      for (const u of updates) void api.updateWidget(u.id, { position: u.position });
    },
    [cols, beginPush],
  );
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const widgetId = String(event.active.id).replace('widget-', '');
      if (widgets.some((w) => w.id === widgetId)) onWidgetDragStart(widgetId, tabId);
    },
    [widgets, onWidgetDragStart, tabId],
  );
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, delta } = event;
      const widgetId = String(active.id).replace('widget-', '');
      const widget = widgets.find((w) => w.id === widgetId);
      // Cruce de pestañas: el destino sale del elemento bajo el puntero.
      const session = getDragSession();
      if (session && session.sourceTabId === tabId && widget) {
        const el = document.elementFromPoint(session.pointerX, session.pointerY);
        const targetArea = el?.closest('[data-dashboard-tab-id]');
        const targetTabId = targetArea?.getAttribute('data-dashboard-tab-id');
        if (targetArea && targetTabId && targetTabId !== tabId) {
          const rect = targetArea.getBoundingClientRect();
          const targetCols = colsForWidth(rect.width);
          const cell = pointToCell(session.pointerX, session.pointerY, rect, targetCols);
          const size = { w: widget.position.w, h: widget.position.h };
          const moved: WidgetData = {
            ...widget,
            tabId: targetTabId,
            position: clampRect({ ...size, x: cell.x, y: cell.y }, widget.type, targetCols),
          };
          onWidgetTransferred(targetTabId, { type: 'insert', widget: moved });
          setWidgets((prev) => prev.filter((w) => w.id !== widgetId));
          api.updateWidget(widget.id, { tabId: targetTabId, position: moved.position }).then(
            () => onWidgetSynced(targetTabId),
            () => {
              onWidgetTransferred(targetTabId, { type: 'remove', widgetId });
              setWidgets((prev) =>
                prev.some((w) => w.id === widget.id) ? prev : [...prev, widget],
              );
            },
          );
          onWidgetDragEnd();
          return;
        }
      }
      onWidgetDragEnd();
      if (!widget) return;
      const shift = pxToCells(delta.x, delta.y);
      const target = {
        ...widget.position,
        x: widget.position.x + shift.dx,
        y: widget.position.y + shift.dy,
      };
      /*
       * El empuje no lo decide este gesto: lo decide DONDE QUEDO el widget, y
       * `resolveDrop` lo ve solo. El gesto va como desempate para cuando el
       * widget cae encima de otro y no hay un lado mas corto que abrir. Se
       * pasa en celdas y no en px porque en px un arrastre oblicuo seria
       * indistinguible de uno recto.
       */
      const gesture = pushDirectionFor(shift.dx, shift.dy);
      const resolved = resolveDrop(widgets, widgetId, target, cols, gesture);
      if (!resolved) return;
      // El que se movio mas los que el empuje corrio de lado.
      commitPositions([
        { id: widgetId, position: resolved.moved.position },
        ...resolved.shifted,
      ]);
    },
    [tabId, widgets, cols, onWidgetDragEnd, onWidgetTransferred, onWidgetSynced, commitPositions],
  );
  const handleDragCancel = useCallback(() => {
    onWidgetDragEnd();
  }, [onWidgetDragEnd]);
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
    >
      <Suspense
        fallback={
          <div className="flex flex-col gap-3 p-4" aria-hidden="true">
            <div className="skeleton h-8 w-48 rounded-lg" />
            <div className="skeleton h-40 w-72 rounded-lg" />
          </div>
        }
      >
        {/*
         * El canvas ocupa exactamente el ancho disponible y calcula cuantas
         * columnas entran con celdas de 80px. Al agrandar la ventana aparecen
         * mas celdas; al achicarla, menos. Los widgets nunca cambian de tamano:
         * lo que se ajusta es el numero de huecos, no la celda.
         */}
        <div ref={areaRef} className="w-full">
          <div
            id="dashboard-drop-area"
            ref={dropAreaRef}
            data-grid
            data-dashboard-tab-id={tabId}
            className="relative"
            style={{ width: canvasWidth(containerWidth, cols), height: canvasHeight(rows) }}
            onDragEnter={handleNativeDragEnter}
            onDragOver={handleNativeDragOver}
            onDragLeave={handleNativeDragLeave}
            onDrop={handleNativeDrop}
          >
            {/* Punteado de fondo: hace visible la grilla, como en iOS. */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage: `
                radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0)
              `,
                backgroundSize: `${CELL_W + CELL_GAP}px ${CELL_H + CELL_GAP}px`,
                backgroundPosition: `${CELL_GAP}px ${CELL_GAP}px`,
              }}
            />
            {/*
             * Celda donde caeria el widget. Comparte `.widget-slot` con el hueco
             * de origen: las dos siluetas son el mismo dibujo.
             *
             * Siempre montado: si se montara y desmontara segun el estado,
             * entraria y saldría del DOM en cada celda y no habria transicion
             * posible. La visibilidad la maneja el ref con `opacity`.
             */}
            <div
              ref={dropPreviewRef}
              className="drop-preview widget-slot pointer-events-none absolute left-0 top-0 opacity-0"
              aria-hidden="true"
            />
            {widgets.map((widget) => (
              <WidgetBox
                key={widget.id}
                widget={widget}
                box={rectToPixels(widget.position)}
                cols={cols}
                onDelete={handleDelete}
                onConfigChange={handleConfigChange}
                onResize={handleResize}
                pushing={pushing}
              />
            ))}
          {loaded && widgets.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <FiGrid size={32} className="text-gray-600" />
              <div>
                <p className="text-sm font-medium text-gray-300">Este dashboard esta vacio</p>
                <p className="mt-1 text-xs text-gray-400">
                  Usa el menu de arriba para agregar tu primer widget.
                </p>
              </div>
            </div>
          )}
          </div>
        </div>
      </Suspense>
      {createPortal(
        undoToastWidget && (
          <div
            className="fixed bottom-4 left-1/2 z-[var(--z-overlay)] flex -translate-x-1/2 items-center gap-2.5 rounded border border-gray-700 bg-gray-800 py-2 pl-3.5 pr-1.5 shadow-2xl transition-transform duration-150 hover:scale-110"
            onMouseEnter={() => {
              if (undoTimerRef.current) {
                clearTimeout(undoTimerRef.current);
                undoTimerRef.current = null;
              }
              stopUndoRing();
            }}
          >
            <svg className="pointer-events-none absolute inset-0 h-full w-full">
              <rect
                ref={undoRingRef}
                x="0.75"
                y="0.75"
                rx="6"
                fill="none"
                stroke="var(--color-p2)"
                strokeWidth="1.5"
                strokeLinecap="round"
                pathLength={100}
                strokeDasharray={100}
                style={{
                  width: 'calc(100% - 1.5px)',
                  height: 'calc(100% - 1.5px)',
                  strokeDashoffset: 0,
                }}
              />
            </svg>
            <FiTrash2 size={14} className="shrink-0 text-gray-500" />
            <span className="whitespace-nowrap text-sm text-gray-300">
              Deleted{' '}
              {(undoToastWidget.config.title as string) ||
                getWidget(undoToastWidget.type)?.label ||
                undoToastWidget.type}
            </span>
            <button
              type="button"
              onClick={handleUndoDelete}
              className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded border border-p2/60 px-2 py-0.5 text-xs text-p2 transition-colors hover:bg-p2/15 hover:text-p2"
            >
              <FiRotateCcw size={12} />
              Undo
            </button>
          </div>
        ),
        document.body,
      )}
    </DndContext>
  );
}
