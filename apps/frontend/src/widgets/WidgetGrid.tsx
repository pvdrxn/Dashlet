import { useState, useEffect, useLayoutEffect, useCallback, useRef, memo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  type CollisionDetection,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
} from '@dnd-kit/sortable';
import { FiTrash2, FiRotateCcw, FiGrid } from 'react-icons/fi';
import { WidgetFrame, type DragHandleProps } from './WidgetFrame';
import { disposePomodoroTimer } from './pomodoro/timer';
import { getWidget } from './registry';
import type { WidgetData, Position } from './types';
import * as api from '../api/widgets';
import { WIDGET_DRAG_MIME, type TransferAction } from './drag-session';

const CACHE_VERSION = 6;
const UNDO_TOAST_MS = 5000;
const ROW_TRACK_PX = 4;
const ROW_GAP_PX = 16;
const NUM_COLS = 4;

/** Widgets que SIEMPRE tienen 2 columnas de ancho */
const ALWAYS_2_COL_TYPES = ['data-table'];

/** Widgets que OPCIONALMENTE tienen 2 columnas de ancho (conmutables con botón) */
const OPTIONAL_2_COL_TYPES = ['todo-list', 'calendar', 'notes', 'diary', 'habit-tracker'];

function getEffectiveColSpan(type: string, config?: Record<string, unknown>, position?: Position): number {
  if (config?.collapsed) return 1;
  if (ALWAYS_2_COL_TYPES.includes(type)) {
    return 2;
  }
  if (OPTIONAL_2_COL_TYPES.includes(type)) {
    const fromConfig = config?.colSpan as number | undefined;
    const fromPos = position?.w;
    if (fromConfig === 2 || fromPos === 2) return 2;
    return 1;
  }
  return 1;
}

function getWidgetColStart(w: WidgetData): number {
  const span = getEffectiveColSpan(w.type, w.config, w.position);
  const rawX = typeof w.position?.x === 'number' ? w.position.x : 0;
  let colIndex = Math.min(NUM_COLS - 1, Math.max(0, rawX % NUM_COLS));
  if (span === 2 && colIndex > NUM_COLS - 2) {
    colIndex = NUM_COLS - 2;
  }
  return colIndex;
}

function widgetOccupiesCol(w: WidgetData, col: number): boolean {
  const span = getEffectiveColSpan(w.type, w.config, w.position);
  const startCol = getWidgetColStart(w);
  return col >= startCol && col < startCol + span;
}

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

function sortWidgets(list: WidgetData[]): WidgetData[] {
  return [...list].sort((a, b) => {
    const ay = typeof a.position?.y === 'number' ? a.position.y : 0;
    const by = typeof b.position?.y === 'number' ? b.position.y : 0;
    if (ay !== by) return ay - by;

    const aSpan = getEffectiveColSpan(a.type, a.config, a.position);
    const bSpan = getEffectiveColSpan(b.type, b.config, b.position);
    if (aSpan !== bSpan) return bSpan - aSpan;

    const aStart = getWidgetColStart(a);
    const bStart = getWidgetColStart(b);
    if (aStart !== bStart) return aStart - bStart;

    const ax = typeof a.position?.x === 'number' ? a.position.x : 0;
    const bx = typeof b.position?.x === 'number' ? b.position.x : 0;
    return ax - bx;
  });
}

interface SortableWidgetCardProps {
  widget: WidgetData;
  isAnyDragging?: boolean;
  offsetY?: number;
  onDelete: (id: string) => void;
  onConfigChange: (id: string, config: Record<string, unknown>) => void;
  onToggleColSpan?: (id: string) => void;
  onHeightChange?: (id: string, height: number) => void;
}

const SortableWidgetCard = memo(function SortableWidgetCard({
  widget,
  isAnyDragging = false,
  offsetY = 0,
  onDelete,
  onConfigChange,
  onToggleColSpan,
  onHeightChange,
}: SortableWidgetCardProps) {
  const def = getWidget(widget.type);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    isDragging,
  } = useSortable({
    id: widget.id,
    data: { widgetId: widget.id, type: widget.type },
  });

  const contentRef = useRef<HTMLDivElement>(null);

  const isAlways2 = ALWAYS_2_COL_TYPES.includes(widget.type);
  const isOptional2 = OPTIONAL_2_COL_TYPES.includes(widget.type);
  const rawSpan = isAlways2
    ? 2
    : isOptional2
    ? ((widget.config.colSpan as number) ?? (widget.position.w >= 2 ? 2 : 1))
    : 1;

  const collapsed = Boolean(widget.config.collapsed);
  // Retraído ocupa 1 celda compacta para no bloquear filas completas
  const colSpan = collapsed ? 1 : rawSpan;

  // Columna asignada fijada en CSS Grid (0..3 -> 1..4)
  const colIndex = getWidgetColStart(widget);
  const colStart = colIndex + 1;

  const initialSpan = collapsed ? 12 : 60;
  const [rowSpan, setRowSpan] = useState<number>(initialSpan);

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const updateSpan = () => {
      const height = el.getBoundingClientRect().height;
      if (height > 0) {
        const nextSpan = Math.ceil((height + ROW_GAP_PX) / ROW_TRACK_PX);
        setRowSpan((prev) => (prev === nextSpan ? prev : nextSpan));
        onHeightChange?.(widget.id, height);
      }
    };

    updateSpan();
    const ro = new ResizeObserver(updateSpan);
    ro.observe(el);
    return () => ro.disconnect();
  }, [collapsed, colSpan, widget.id, onHeightChange]);

  if (!def) return null;

  const style: React.CSSProperties = {
    transform: isDragging ? undefined : `translate3d(0, ${offsetY}px, 0)`,
    transition: isDragging ? undefined : 'transform 200ms cubic-bezier(0.2, 0, 0, 1)',
    zIndex: isDragging ? 0 : offsetY !== 0 ? 5 : undefined,
    opacity: isDragging ? 0.25 : 1,
    gridColumnStart: colStart,
    gridColumnEnd: `span ${colSpan}`,
    gridRowEnd: `span ${rowSpan}`,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative flex flex-col self-start ${
        colSpan === 2 ? 'col-span-1 sm:col-span-2' : 'col-span-1'
      } ${collapsed ? 'w-fit max-w-full justify-self-start' : 'w-full'} h-auto pb-4`}
    >
      <div ref={contentRef} className={`${collapsed ? 'w-fit max-w-full' : 'w-full'} h-auto`}>
        <WidgetFrame
          id={widget.id}
          type={widget.type}
          config={widget.config}
          component={def.component}
          onDelete={onDelete}
          onConfigChange={onConfigChange}
          label={def.label}
          dragHandleProps={{ ...attributes, ...listeners } as DragHandleProps}
          dragHandleRef={setActivatorNodeRef}
          isDragging={isDragging}
          isAnyDragging={isAnyDragging}
          colSpan={colSpan}
          onToggleColSpan={isOptional2 && onToggleColSpan ? () => onToggleColSpan(widget.id) : undefined}
        />
      </div>
    </div>
  );
});

interface ColumnDropZoneProps {
  id: string;
  colIndex: number;
  isDragging: boolean;
  isOver: boolean;
  hasWidgets: boolean;
}

const ColumnDropZone = memo(function ColumnDropZone({
  id,
  colIndex,
  isDragging,
  isOver,
  hasWidgets,
}: ColumnDropZoneProps) {
  const { setNodeRef } = useDroppable({
    id,
    data: {
      type: 'column-bottom',
      colIndex,
    },
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        gridColumnStart: colIndex + 1,
        gridColumnEnd: 'span 1',
        gridRowEnd: hasWidgets ? 'span 14' : 'span 32',
      }}
      className={`rounded-xl border border-dashed transition-all duration-150 flex items-center justify-center text-[11px] font-medium self-start w-full mb-4 ${
        !isDragging
          ? 'hidden'
          : isOver
          ? 'border-p2/60 bg-p2/[0.08] text-p2 ring-1 ring-p2/30 scale-[1.01]'
          : 'border-white/10 bg-white/[0.01] text-white/30 hover:border-white/20'
      }`}
    >
      {isOver
        ? `Soltar al final de col ${colIndex + 1}`
        : hasWidgets
        ? `+ Final col ${colIndex + 1}`
        : `Columna ${colIndex + 1} vacía`}
    </div>
  );
});

export interface WidgetGridProps {
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
}: WidgetGridProps) {
  const { t } = useTranslation();
  const cacheKey = `dashlet-widgets-${tabId}-v${CACHE_VERSION}`;

  const [widgets, setWidgets] = useState<WidgetData[]>(() => sortWidgets(loadCache(cacheKey)));
  const [activeWidgetId, setActiveWidgetId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const [undoToastWidget, setUndoToastWidget] = useState<WidgetData | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoDeadlineRef = useRef(0);
  const undoRingRafRef = useRef(0);
  const undoRingRef = useRef<SVGCircleElement | null>(null);

  const gridContainerRef = useRef<HTMLDivElement>(null);
  const widgetHeightsRef = useRef<Record<string, number>>({});
  const initialRectsRef = useRef<
    Map<string, { left: number; right: number; top: number; bottom: number; width: number; height: number }>
  >(new Map());

  const handleHeightChange = useCallback((id: string, height: number) => {
    widgetHeightsRef.current[id] = height;
  }, []);

  const widgetsRef = useRef(widgets);
  widgetsRef.current = widgets;
  const deferredCommitRef = useRef<WidgetData[] | null>(null);

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

  const handleAddWidget = useCallback(
    async (
      type: string,
      opts?: { deferCommit?: boolean },
    ): Promise<Position | null> => {
      const def = getWidget(type);
      if (!def) return null;

      const isAlways2 = ALWAYS_2_COL_TYPES.includes(type);
      const colSpan = isAlways2 ? 2 : 1;

      // Asignar a la columna con menos widgets
      let targetCol = 0;
      if (colSpan === 2) {
        const leftCount = widgetsRef.current.filter((w) => w.position.x <= 1).length;
        const rightCount = widgetsRef.current.filter((w) => w.position.x >= 2).length;
        targetCol = leftCount <= rightCount ? 0 : 2;
      } else {
        const counts = [0, 1, 2, 3].map(
          (c) => widgetsRef.current.filter((w) => w.position.x === c).length,
        );
        targetCol = counts.indexOf(Math.min(...counts));
      }

      const colWidgets = widgetsRef.current.filter((w) => w.position.x === targetCol);
      const currentMaxY =
        colWidgets.length > 0 ? Math.max(...colWidgets.map((w) => w.position.y)) : -1;
      const nextY = currentMaxY + 1;

      const position: Position = {
        x: targetCol,
        y: nextY,
        w: colSpan,
        h: 1,
      };
      const initialConfig = {
        ...def.defaultConfig,
        colSpan,
      };

      await api.createWidget(type, initialConfig, position, tabId);
      const data = await api.fetchWidgets(tabId);
      const sorted = sortWidgets(data);

      if (opts?.deferCommit) {
        deferredCommitRef.current = sorted;
        return position;
      }

      setWidgets(sorted);
      saveCache(cacheKey, sorted);
      return position;
    },
    [tabId, cacheKey],
  );

  useEffect(() => {
    onAddWidgetRef(tabId, handleAddWidget);
  }, [handleAddWidget, onAddWidgetRef, tabId]);

  const predictAddPosition = useCallback(
    (type: string): Position => {
      const isAlways2 = ALWAYS_2_COL_TYPES.includes(type);
      const colSpan = isAlways2 ? 2 : 1;

      let targetCol = 0;
      if (colSpan === 2) {
        const leftCount = widgetsRef.current.filter((w) => w.position.x <= 1).length;
        const rightCount = widgetsRef.current.filter((w) => w.position.x >= 2).length;
        targetCol = leftCount <= rightCount ? 0 : 2;
      } else {
        const counts = [0, 1, 2, 3].map(
          (c) => widgetsRef.current.filter((w) => w.position.x === c).length,
        );
        targetCol = counts.indexOf(Math.min(...counts));
      }

      const colWidgets = widgetsRef.current.filter((w) => w.position.x === targetCol);
      const currentMaxY =
        colWidgets.length > 0 ? Math.max(...colWidgets.map((w) => w.position.y)) : -1;

      return {
        x: targetCol,
        y: currentMaxY + 1,
        w: colSpan,
        h: 1,
      };
    },
    [],
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
        const sorted = sortWidgets(data);
        setWidgets(sorted);
        saveCache(cacheKey, sorted);
        setLoaded(true);
      })
      .catch(() => {});
  }, [tabId, cacheKey]);

  useEffect(() => {
    if (onRefreshRef) onRefreshRef(tabId, refresh);
  }, [refresh, onRefreshRef, tabId]);

  const handleTransfer = useCallback((action: TransferAction) => {
    setWidgets((prev) => {
      if (action.type === 'remove') return prev.filter((w) => w.id !== action.widgetId);
      if (prev.some((w) => w.id === action.widget.id)) return prev;
      return sortWidgets([...prev, action.widget]);
    });
  }, []);

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
          const sorted = sortWidgets(data);
          setWidgets(sorted);
          saveCache(cacheKey, sorted);
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
  }, [tabId, cacheKey]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      if (undoRingRafRef.current) cancelAnimationFrame(undoRingRafRef.current);
    };
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      const widget = widgetsRef.current.find((w) => w.id === id);
      disposePomodoroTimer(id);
      api.deleteWidget(id);
      setWidgets((prev) => {
        const next = prev.filter((w) => w.id !== id);
        saveCache(cacheKey, next);
        return next;
      });
      if (!widget) return;
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      setUndoToastWidget(widget);
      startUndoTimer();
    },
    [cacheKey, startUndoTimer],
  );

  const handleUndoDelete = useCallback(() => {
    if (!undoToastWidget) return;
    const widget = undoToastWidget;
    dismissUndoToast();
    api.restoreWidget(widget.id).then(
      () => {
        setWidgets((prev) => {
          if (prev.some((w) => w.id === widget.id)) return prev;
          const next = sortWidgets([...prev, widget]);
          saveCache(cacheKey, next);
          return next;
        });
      },
      () => {},
    );
  }, [undoToastWidget, dismissUndoToast, cacheKey]);

  const handleConfigChange = useCallback(
    (id: string, config: Record<string, unknown>) => {
      setWidgets((prev) => {
        const next = prev.map((w) => (w.id === id ? { ...w, config } : w));
        saveCache(cacheKey, next);
        return next;
      });
      void api.updateWidget(id, { config });
    },
    [cacheKey],
  );

  const handleToggleColSpan = useCallback(
    (id: string) => {
      setWidgets((prev) => {
        const target = prev.find((w) => w.id === id);
        if (!target || !OPTIONAL_2_COL_TYPES.includes(target.type)) return prev;

        const currentSpan = (target.config.colSpan as number) === 2 || target.position.w === 2 ? 2 : 1;
        const nextSpan = currentSpan === 2 ? 1 : 2;

        // Preservar siempre la columna original (ej: 3 para columna 4)
        const homeX = (target.config.originCol as number | undefined) ?? target.position.x;
        const targetY = target.position.y;

        let updatedOthers = prev.filter((w) => w.id !== id);

        // Columna adyacente que comparte espacio con el widget de 2 columnas
        const affectedCol = homeX >= NUM_COLS - 1 ? NUM_COLS - 2 : homeX + 1;

        if (nextSpan === 2) {
          // Al expandir: empujar hacia abajo los widgets de la columna adyacente
          updatedOthers = updatedOthers.map((w) => {
            if (widgetOccupiesCol(w, affectedCol) && w.position.y >= targetY) {
              return {
                ...w,
                position: { ...w.position, y: w.position.y + 1 },
              };
            }
            return w;
          });
        } else {
          // Al retraer: los widgets de la columna adyacente suben al espacio liberado
          updatedOthers = updatedOthers.map((w) => {
            if (widgetOccupiesCol(w, affectedCol) && w.position.y > targetY) {
              return {
                ...w,
                position: { ...w.position, y: Math.max(0, w.position.y - 1) },
              };
            }
            return w;
          });
        }

        const nextConfig = {
          ...target.config,
          colSpan: nextSpan,
          originCol: homeX,
        };

        // Mantener permanentemente homeX en position.x
        const nextActive = {
          ...target,
          config: nextConfig,
          position: {
            ...target.position,
            x: homeX,
            y: targetY,
            w: nextSpan,
          },
        };

        const updated = [...updatedOthers, nextActive];
        const sorted = sortWidgets(updated);
        saveCache(cacheKey, sorted);

        // Persistir todos los widgets modificados al backend
        sorted.forEach((w) => {
          const orig = prev.find((o) => o.id === w.id);
          if (
            !orig ||
            orig.position.x !== w.position.x ||
            orig.position.y !== w.position.y ||
            orig.position.w !== w.position.w ||
            orig.config.colSpan !== w.config.colSpan ||
            orig.config.originCol !== w.config.originCol
          ) {
            void api.updateWidget(w.id, { config: w.config, position: w.position });
          }
        });

        return sorted;
      });
    },
    [cacheKey],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 4,
      },
    }),
  );

  /**
   * Detección de colisiones simétrica con umbral del 50% en todas las direcciones:
   * 1. Comprueba si el widget arrastrado solapa al menos el 50% (en ancho y alto) de algún widget droppable.
   *    Esto garantiza que el empuje solo se active al penetrar 50% desde arriba, abajo, izquierda o derecha.
   * 2. Si ningún widget alcanza el 50%, comprueba si el arrastre apunta a la zona inferior de la columna (drop zone).
   */
  const collisionDetectionStrategy: CollisionDetection = useCallback((args) => {
    const { droppableRects, droppableContainers, pointerCoordinates, collisionRect, active } = args;

    const px = pointerCoordinates
      ? pointerCoordinates.x
      : collisionRect
      ? collisionRect.left + collisionRect.width / 2
      : null;
    const py = pointerCoordinates
      ? pointerCoordinates.y
      : collisionRect
      ? collisionRect.top + collisionRect.height / 2
      : null;

    if (px === null || py === null) return [];

    const gridEl = gridContainerRef.current;
    if (!gridEl) return [];

    const gridRect = gridEl.getBoundingClientRect();
    const computedCols = window.getComputedStyle(gridEl).gridTemplateColumns.split(' ').length;
    const numCols = Math.max(1, Math.min(NUM_COLS, computedCols || NUM_COLS));
    const colWidth = gridRect.width / numCols;

    const activeWidget = widgetsRef.current.find((w) => w.id === String(active.id));
    const activeSpan = activeWidget
      ? getEffectiveColSpan(activeWidget.type, activeWidget.config, activeWidget.position)
      : 1;
    const activeHeight = (activeWidget && widgetHeightsRef.current[activeWidget.id]) || 180;
    const estimatedWidth = colWidth * activeSpan;

    const dragRect =
      collisionRect && collisionRect.width > 0 && collisionRect.height > 0
        ? collisionRect
        : {
            left: px - estimatedWidth / 2,
            right: px + estimatedWidth / 2,
            top: py - activeHeight / 2,
            bottom: py + activeHeight / 2,
            width: estimatedWidth,
            height: activeHeight,
          };

    // Poblar initialRects al inicio del arrastre antes de que cualquier widget se desplace
    if (initialRectsRef.current.size === 0 && droppableRects.size > 0) {
      for (const [id, rect] of droppableRects.entries()) {
        initialRectsRef.current.set(String(id), {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        });
      }
    }

    // 1. Evaluar si algún widget candidato cumple el umbral del 50% de solapamiento en X e Y
    let bestCandidate: { id: string; area: number } | null = null;

    for (const [id, liveRect] of droppableRects.entries()) {
      const idStr = String(id);
      if (idStr === String(active.id)) continue;
      if (idStr.startsWith('col-drop-')) continue;

      // Usar el rectángulo estacionario inicial para que los desplazamientos visuales no alteren la detección del 50%
      const rect = initialRectsRef.current.get(idStr) || liveRect;

      const overlapX = Math.max(0, Math.min(dragRect.right, rect.right) - Math.max(dragRect.left, rect.left));
      const overlapY = Math.max(0, Math.min(dragRect.bottom, rect.bottom) - Math.max(dragRect.top, rect.top));

      const refW = Math.min(dragRect.width, rect.width);
      const refH = Math.min(dragRect.height, rect.height);

      if (refW <= 0 || refH <= 0) continue;

      const ratioX = overlapX / refW;
      const ratioY = overlapY / refH;

      // Umbral estricto del 50% en ambas dimensiones (X e Y) desde todos los lados (arriba, abajo, izquierda, derecha)
      if (ratioX >= 0.5 && ratioY >= 0.5) {
        const area = overlapX * overlapY;
        if (!bestCandidate || area > bestCandidate.area) {
          bestCandidate = { id: idStr, area };
        }
      }
    }

    if (bestCandidate) {
      const container = droppableContainers.find((c) => c.id === bestCandidate.id);
      if (container) {
        return [{ id: bestCandidate.id, data: { droppableContainer: container, value: bestCandidate.area } }];
      }
    }

    // 2. Si ningún widget alcanza el 50%, verificar si el arrastre apunta a la zona final de una columna
    const dragCenterX = dragRect.left + dragRect.width / 2;
    const relativeX = dragCenterX - gridRect.left;
    let targetCol = Math.floor(relativeX / colWidth);
    targetCol = Math.max(0, Math.min(numCols - 1, targetCol));
    if (activeSpan === 2 && targetCol > numCols - 2) {
      targetCol = Math.max(0, numCols - 2);
    }

    const colWidgets = widgetsRef.current
      .filter((w) => w.id !== String(active.id) && w.position.x === targetCol)
      .sort((a, b) => a.position.y - b.position.y);

    const dropId = `col-drop-${targetCol}`;
    const dropContainer = droppableContainers.find((c) => c.id === dropId);

    if (dropContainer) {
      if (colWidgets.length === 0) {
        return [{ id: dropId, data: { droppableContainer: dropContainer, value: 0 } }];
      }

      const lastWidget = colWidgets[colWidgets.length - 1];
      const lastRect = initialRectsRef.current.get(lastWidget.id) || droppableRects.get(lastWidget.id);
      if (lastRect && (py > lastRect.bottom || dragRect.top > lastRect.bottom - lastRect.height * 0.5)) {
        return [{ id: dropId, data: { droppableContainer: dropContainer, value: 0 } }];
      }
    }

    return [];
  }, []);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const widgetId = String(event.active.id);
      setActiveWidgetId(widgetId);
      setOverId(null);
      initialRectsRef.current.clear();
      if (widgets.some((w) => w.id === widgetId)) {
        onWidgetDragStart(widgetId, tabId);
      }
    },
    [widgets, onWidgetDragStart, tabId],
  );

  const handleDragCancel = useCallback(() => {
    setActiveWidgetId(null);
    setOverId(null);
    initialRectsRef.current.clear();
    onWidgetDragEnd();
  }, [onWidgetDragEnd]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveWidgetId(null);
      setOverId(null);
      initialRectsRef.current.clear();
      onWidgetDragEnd();

      if (!over || active.id === over.id) return;

      const activeId = String(active.id);
      const overIdStr = String(over.id);

      const activeWidget = widgetsRef.current.find((w) => w.id === activeId);
      if (!activeWidget) return;

      const activeSpan = getEffectiveColSpan(activeWidget.type, activeWidget.config, activeWidget.position);
      const sourceCol = activeWidget.position.x;

      setWidgets((current) => {
        const dragged = current.find((w) => w.id === activeId);
        if (!dragged) return current;

        let targetCol: number;
        let targetIndex: number;

        if (overIdStr.startsWith('col-drop-')) {
          targetCol = parseInt(overIdStr.replace('col-drop-', ''), 10);
          if (isNaN(targetCol)) targetCol = 0;
          if (activeSpan === 2 && targetCol > NUM_COLS - 2) targetCol = NUM_COLS - 2;

          const destWidgets = current.filter((w) => w.id !== activeId && w.position.x === targetCol);
          targetIndex = destWidgets.length;
        } else {
          const overWidget = current.find((w) => w.id === overIdStr);
          if (!overWidget) return current;

          targetCol = overWidget.position.x;
          if (activeSpan === 2 && targetCol > NUM_COLS - 2) targetCol = NUM_COLS - 2;

          const destWidgets = current
            .filter((w) => w.id !== activeId && w.position.x === targetCol)
            .sort((a, b) => a.position.y - b.position.y);

          const foundIdx = destWidgets.findIndex((w) => w.id === overIdStr);
          targetIndex = foundIdx >= 0 ? foundIdx : destWidgets.length;
        }

        // 1. Reordenamiento dentro de la misma columna (sourceCol === targetCol)
        if (sourceCol === targetCol) {
          const colWidgets = current
            .filter((w) => w.position.x === sourceCol)
            .sort((a, b) => a.position.y - b.position.y);

          const oldIdx = colWidgets.findIndex((w) => w.id === activeId);
          if (oldIdx < 0) return current;

          const reordered = [...colWidgets];
          const [movedItem] = reordered.splice(oldIdx, 1);

          if (overIdStr.startsWith('col-drop-')) {
            reordered.push(movedItem);
          } else {
            const targetIdxInCol = colWidgets.findIndex((w) => w.id === overIdStr);
            if (targetIdxInCol >= 0) {
              reordered.splice(targetIdxInCol, 0, movedItem);
            } else {
              reordered.push(movedItem);
            }
          }

          reordered.forEach((w, idx) => {
            w.position = { ...w.position, y: idx };
          });

          const otherCols = current.filter((w) => w.position.x !== sourceCol);
          const nextWidgets = sortWidgets([...otherCols, ...reordered]);
          saveCache(cacheKey, nextWidgets);

          nextWidgets.forEach((w) => {
            const orig = current.find((o) => o.id === w.id);
            if (
              !orig ||
              orig.position.x !== w.position.x ||
              orig.position.y !== w.position.y ||
              orig.position.w !== w.position.w
            ) {
              void api.updateWidget(w.id, { position: w.position });
            }
          });

          return nextWidgets;
        }

        // 2. Movimiento entre columnas distintas (sourceCol !== targetCol)
        // Columna origen: remover widget y compactar
        const sourceWidgets = current
          .filter((w) => w.id !== activeId && w.position.x === sourceCol)
          .sort((a, b) => a.position.y - b.position.y)
          .map((w, idx) => ({
            ...w,
            position: { ...w.position, y: idx },
          }));

        // Columna destino: insertar dragged en targetIndex (empujando hacia abajo los siguientes)
        const destWidgets = current
          .filter((w) => w.id !== activeId && w.position.x === targetCol)
          .sort((a, b) => a.position.y - b.position.y);

        const movedWidget = {
          ...dragged,
          config: { ...dragged.config, originCol: targetCol },
          position: { ...dragged.position, x: targetCol, w: activeSpan },
        };

        const clampedInsertIdx = Math.max(0, Math.min(destWidgets.length, targetIndex));
        destWidgets.splice(clampedInsertIdx, 0, movedWidget);

        const reindexedDest = destWidgets.map((w, idx) => ({
          ...w,
          position: { ...w.position, y: idx },
        }));

        // Si activeSpan === 2, también empujar widgets en targetCol + 1
        let extraColUpdated: WidgetData[] = [];
        if (activeSpan === 2 && targetCol + 1 < NUM_COLS && targetCol + 1 !== sourceCol) {
          extraColUpdated = current
            .filter((w) => w.id !== activeId && w.position.x === targetCol + 1)
            .sort((a, b) => a.position.y - b.position.y)
            .map((w) => {
              if (w.position.y >= clampedInsertIdx) {
                return {
                  ...w,
                  position: { ...w.position, y: w.position.y + 1 },
                };
              }
              return w;
            });
        }

        const untouchedCols = current.filter(
          (w) =>
            w.id !== activeId &&
            w.position.x !== sourceCol &&
            w.position.x !== targetCol &&
            (activeSpan !== 2 || w.position.x !== targetCol + 1),
        );

        const allUpdated = [
          ...sourceWidgets,
          ...reindexedDest,
          ...extraColUpdated,
          ...untouchedCols,
        ];

        const nextWidgets = sortWidgets(allUpdated);
        saveCache(cacheKey, nextWidgets);

        nextWidgets.forEach((w) => {
          const orig = current.find((o) => o.id === w.id);
          if (
            !orig ||
            orig.position.x !== w.position.x ||
            orig.position.y !== w.position.y ||
            orig.position.w !== w.position.w
          ) {
            void api.updateWidget(w.id, { position: w.position });
          }
        });

        return nextWidgets;
      });
    },
    [onWidgetDragEnd, cacheKey],
  );

  // Drag & drop nativo desde el toolbar "+ Widget"
  const handleNativeDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(WIDGET_DRAG_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setIsDragOver(true);
    }
  };

  const handleNativeDragLeave = () => {
    setIsDragOver(false);
  };

  const handleNativeDrop = async (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(WIDGET_DRAG_MIME)) return;
    e.preventDefault();
    setIsDragOver(false);
    const type = e.dataTransfer.getData(WIDGET_DRAG_MIME);
    if (type) {
      await handleAddWidget(type);
    }
  };

  const activeWidget = activeWidgetId ? widgets.find((w) => w.id === activeWidgetId) : null;
  const activeDef = activeWidget ? getWidget(activeWidget.type) : null;
  const activeCollapsed = Boolean(activeWidget?.config.collapsed);
  const activeSpan = activeWidget
    ? activeCollapsed
      ? 1
      : getEffectiveColSpan(activeWidget.type, activeWidget.config, activeWidget.position)
    : 1;

  const getWidgetOffsetY = useCallback(
    (widget: WidgetData): number => {
      if (!activeWidgetId || !overId || overId === activeWidgetId) return 0;
      if (widget.id === activeWidgetId) return 0;

      const activeWidget = widgets.find((w) => w.id === activeWidgetId);
      if (!activeWidget) return 0;

      const activeHeight = widgetHeightsRef.current[activeWidgetId] || 180;
      const activeShift = activeHeight + ROW_GAP_PX;

      const sourceCol = activeWidget.position.x;
      const sourceY = activeWidget.position.y;

      let targetCol: number;
      let targetY: number;

      if (overId.startsWith('col-drop-')) {
        targetCol = parseInt(overId.replace('col-drop-', ''), 10);
        if (isNaN(targetCol)) targetCol = 0;
        if (activeSpan === 2 && targetCol > NUM_COLS - 2) targetCol = NUM_COLS - 2;

        const destWidgets = widgets.filter((w) => w.id !== activeWidgetId && w.position.x === targetCol);
        targetY = destWidgets.length;
      } else {
        const overWidget = widgets.find((w) => w.id === overId);
        if (!overWidget) return 0;

        targetCol = overWidget.position.x;
        if (activeSpan === 2 && targetCol > NUM_COLS - 2) targetCol = NUM_COLS - 2;
        targetY = overWidget.position.y;
      }

      const widgetCol = widget.position.x;
      const widgetY = widget.position.y;

      const occupiesActiveCols =
        widgetCol === targetCol || (activeSpan === 2 && widgetCol === targetCol + 1);

      // 1. Misma columna (sourceCol === targetCol)
      if (sourceCol === targetCol) {
        if (!occupiesActiveCols) return 0;

        // 1A. Arrastre hacia arriba (sourceY > targetY)
        // Ejemplo: A(0), B(1), C(2). Arrastro B(1) hacia arriba sobre A(0).
        // Solo A(0) baja (+activeShift). C(2) está debajo del arrastrado y NO se mueve (0).
        if (sourceY > targetY) {
          if (widgetY >= targetY && widgetY < sourceY) {
            return activeShift;
          }
          return 0;
        }

        // 1B. Arrastre hacia abajo (sourceY < targetY)
        // Ejemplo: A(0), B(1), C(2). Arrastro A(0) hacia abajo sobre B(1).
        // B(1) sube (-activeShift) para ocupar el hueco de A(0). C(2) NO se empuja hacia abajo (0).
        if (sourceY < targetY) {
          if (widgetY > sourceY && widgetY <= targetY) {
            return -activeShift;
          }
          return 0;
        }

        return 0;
      }

      // 2. Distinta columna (sourceCol !== targetCol)
      // 2A. En la columna destino: widgets en o debajo de targetY se desplazan hacia abajo (+activeShift)
      const isTargetCol =
        widgetCol === targetCol || (activeSpan === 2 && widgetCol === targetCol + 1 && widgetCol !== sourceCol);

      if (isTargetCol) {
        if (widgetY >= targetY) {
          return activeShift;
        }
        return 0;
      }

      // 2B. En la columna origen: widgets debajo del que sale suben (-activeShift) para compactar
      if (widgetCol === sourceCol) {
        if (widgetY > sourceY) {
          return -activeShift;
        }
        return 0;
      }

      return 0;
    },
    [activeWidgetId, overId, widgets, activeSpan],
  );

  return (
    <div
      onDragOver={handleNativeDragOver}
      onDragLeave={handleNativeDragLeave}
      onDrop={handleNativeDrop}
      className={`h-full w-full overflow-y-auto px-6 pt-4 pb-6 transition-colors ${
        isDragOver ? 'ring-2 ring-p2/50 ring-dashed bg-p2/[0.02]' : ''
      }`}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetectionStrategy}
        onDragStart={handleDragStart}
        onDragOver={(event) => {
          setOverId(event.over ? String(event.over.id) : null);
        }}
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={widgets.map((w) => w.id)}>
          <div
            ref={gridContainerRef}
            style={{
              gridAutoRows: `${ROW_TRACK_PX}px`,
              gridAutoFlow: 'row dense',
            }}
            className={`grid grid-cols-4 gap-x-3.5 gap-y-0 items-start max-w-[1240px] mx-auto ${
              activeWidgetId
                ? 'select-none [&_input]:pointer-events-none [&_textarea]:pointer-events-none [&_button]:pointer-events-none [&_[contenteditable]]:pointer-events-none'
                : ''
            }`}
          >
            {widgets.map((widget) => (
              <SortableWidgetCard
                key={widget.id}
                widget={widget}
                isAnyDragging={Boolean(activeWidgetId)}
                offsetY={getWidgetOffsetY(widget)}
                onDelete={handleDelete}
                onConfigChange={handleConfigChange}
                onToggleColSpan={handleToggleColSpan}
                onHeightChange={handleHeightChange}
              />
            ))}

            {/* Zonas de caída dedicadas al final de cada columna */}
            {[0, 1, 2, 3].map((colIdx) => (
              <ColumnDropZone
                key={colIdx}
                id={`col-drop-${colIdx}`}
                colIndex={colIdx}
                isDragging={Boolean(activeWidgetId)}
                isOver={overId === `col-drop-${colIdx}`}
                hasWidgets={widgets.some((w) => w.position.x === colIdx)}
              />
            ))}
          </div>
        </SortableContext>

        <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
          {activeWidget && activeDef && (
            <div
              className={`flex flex-col pointer-events-none cursor-grabbing shadow-2xl ${
                activeSpan === 2 ? 'col-span-1 sm:col-span-2' : 'col-span-1'
              } ${activeCollapsed ? 'w-fit max-w-full' : 'w-full'} h-auto`}
            >
              <WidgetFrame
                id={activeWidget.id}
                type={activeWidget.type}
                config={activeWidget.config}
                component={activeDef.component}
                onDelete={() => {}}
                onConfigChange={() => {}}
                label={activeDef.label}
                dragHandleProps={{} as DragHandleProps}
                isDragging={true}
                isAnyDragging={true}
                colSpan={activeSpan}
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Empty State */}
      {loaded && widgets.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-p2 mb-4 shadow-xl">
            <FiGrid size={28} />
          </div>
          <h3 className="text-base font-semibold text-[#DCE4EC] mb-1">
            {t('dashboard.emptyTitle', 'Sin widgets en esta pestaña')}
          </h3>
          <p className="text-xs text-[#8E95A2] max-w-sm mb-5">
            {t(
              'dashboard.emptyDescription',
              'Agrega herramientas de productividad como listas de tareas, notas, pomodoro o tablas usando el botón superior.',
            )}
          </p>
        </div>
      )}

      {/* Undo Toast */}
      {undoToastWidget && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-[var(--z-overlay)] flex items-center gap-3 rounded-xl border border-[#232B3B] bg-[#141A26]/95 px-4 py-3 shadow-2xl backdrop-blur-xl animate-view-fade-in"
        >
          <div className="relative flex h-5 w-5 items-center justify-center text-p2">
            <svg className="h-5 w-5 -rotate-90" viewBox="0 0 36 36">
              <circle
                cx="18"
                cy="18"
                r="15.915"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                className="opacity-20"
              />
              <circle
                ref={undoRingRef}
                cx="18"
                cy="18"
                r="15.915"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeDasharray="100"
                strokeDashoffset="0"
                strokeLinecap="round"
                className="text-p2"
              />
            </svg>
            <FiTrash2 size={10} className="absolute text-[#DCE4EC]" />
          </div>

          <span className="text-xs font-medium text-[#DCE4EC]">
            {t('dashboard.widgetDeleted', 'Widget eliminado')}
          </span>

          <button
            type="button"
            onClick={handleUndoDelete}
            className="flex items-center gap-1.5 rounded-lg bg-p2 px-2.5 py-1 text-xs font-semibold text-gray-950 transition-colors hover:bg-p2/90 active:scale-95 cursor-pointer ml-1"
          >
            <FiRotateCcw size={11} />
            <span>{t('dashboard.undo', 'Deshacer')}</span>
          </button>
        </div>
      )}
    </div>
  );
}
