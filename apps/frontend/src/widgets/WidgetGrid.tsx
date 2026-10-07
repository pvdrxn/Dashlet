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
import { getWidget } from './registry';
import type { WidgetData, Position } from './types';
import type { DragHandleProps } from './WidgetFrame';
import * as api from '../api/widgets';
import { getDragSession, type TransferAction } from './drag-session';
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
  normalizeLayout,
  minSize,
  defaultSize,
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
 * intercambia posiciones cuando el destino esta ocupado por uno solo y rechaza
 * el drop si hay mas de uno.
 */
const CACHE_VERSION = 3;
const UNDO_TOAST_MS = 5000;
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
}
function WidgetBox({ widget, box, cols, onDelete, onConfigChange, onResize }: WidgetBoxProps) {
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
  const min = minSize(widget.type);
  const collapsed = (widget.config.collapsed as boolean) ?? false;
  const handleResizeStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
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
   * Lo unico que se mueve de forma continua es el widget que se esta arrastrando,
   * y eso no es una animacion sino el `transform` que escribe dnd-kit en cada
   * frame mientras dura el arrastre. Los que se empujan por debajo saltan.
   */
  return (
    <>
      {/*
        Silueta de la celda de origen. Se dibuja solo mientras se arrastra y
        queda clavada en el lugar de donde salio el widget, como el hueco que
        deja una app al levantarla en iOS.

        Borde continuo, no discontinuo: el punteado sugeria un "slot" vacio
        esperando ser llenado, cuando en realidad ya hay algo moviendose. Y
        comparte la sombra de p2 del widget arrastrado para que el par se lea
        como una sola operacion: lo que se levanta y el hueco de donde salio.
      */}
      {isDragging && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-lg border-2 border-p2 bg-p2/[0.04] shadow-[0_18px_44px_-10px_rgba(217,164,65,0.32),inset_0_1px_0_rgba(255,255,255,0.07)]"
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
        className="absolute touch-none"
        style={{
          left: liveBox.left,
          top: liveBox.top,
          width: liveBox.width,
          height: collapsed ? undefined : liveBox.height,
          transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
          zIndex: isDragging ? 900 : undefined,
          cursor: isDragging ? 'grabbing' : undefined,
        }}
      >
      <WidgetFrame
        id={widget.id}
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
        className="absolute bottom-0 right-0 z-20 h-3 w-3 cursor-nwse-resize touch-none"
        style={{
          backgroundImage: 'linear-gradient(135deg, transparent 50%, #454c58 50%)',
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
      const slot = findFirstSlot(widgetsRef.current, type, cols);
      return clampRect({ ...slot, ...defaultSize(type) }, type, cols);
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
      const slot = findFirstSlot(widgetsRef.current, type, cols);
      const position = clampRect({ ...slot, ...defaultSize(type) }, type, cols);
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
  const handleConfigChange = useCallback((id: string, config: Record<string, unknown>) => {
    setWidgets((prev) => prev.map((w) => (w.id === id ? { ...w, config } : w)));
    api.updateWidget(id, { config });
  }, []);
  const commitPositions = useCallback(
    (updates: { id: string; position: Position }[]) => {
      if (!updates.length) return;
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
    [cols],
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
      // Al agrandar, los vecinos que quedan tapados bajan, igual que en un drop.
      const resolved = resolveDrop(current, id, safe, cols);
      const finalWidget = resolved?.moved ?? { ...widget, position: safe };
      const updates = [
        { id, position: finalWidget.position },
        ...(resolved?.shifted ?? []),
      ];
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
    [cols],
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
      const resolved = resolveDrop(widgets, widgetId, target, cols);
      if (!resolved) return;
      // El que se movio mas los que el empuje corrio hacia abajo.
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
            data-grid
            data-dashboard-tab-id={tabId}
            className="relative"
            style={{ width: canvasWidth(containerWidth, cols), height: canvasHeight(rows) }}
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
            {widgets.map((widget) => (
              <WidgetBox
                key={widget.id}
                widget={widget}
                box={rectToPixels(widget.position)}
                cols={cols}
                onDelete={handleDelete}
                onConfigChange={handleConfigChange}
                onResize={handleResize}
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
