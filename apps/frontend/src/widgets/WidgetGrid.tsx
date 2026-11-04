import { useState, useEffect, useLayoutEffect, useCallback, useRef, memo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FiTrash2, FiRotateCcw, FiGrid } from 'react-icons/fi';
import { WidgetFrame, type DragHandleProps } from './WidgetFrame';
import { disposePomodoroTimer } from './pomodoro/timer';
import { getWidget } from './registry';
import type { WidgetData, Position } from './types';
import * as api from '../api/widgets';
import { WIDGET_DRAG_MIME, type TransferAction } from './drag-session';

const CACHE_VERSION = 4;
const UNDO_TOAST_MS = 5000;
const ROW_TRACK_PX = 4;
const ROW_GAP_PX = 16;

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
    if (a.position.y !== b.position.y) return a.position.y - b.position.y;
    return a.position.x - b.position.x;
  });
}

interface SortableWidgetCardProps {
  widget: WidgetData;
  isAnyDragging?: boolean;
  onDelete: (id: string) => void;
  onConfigChange: (id: string, config: Record<string, unknown>) => void;
  onToggleColSpan: (id: string) => void;
}

const SortableWidgetCard = memo(function SortableWidgetCard({
  widget,
  isAnyDragging = false,
  onDelete,
  onConfigChange,
  onToggleColSpan,
}: SortableWidgetCardProps) {
  const def = getWidget(widget.type);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: widget.id,
    data: { widgetId: widget.id, type: widget.type },
  });

  const contentRef = useRef<HTMLDivElement>(null);

  const rawSpan = (widget.config.colSpan as number) ?? (widget.position.w >= 2 ? 2 : 1);
  const collapsed = Boolean(widget.config.collapsed);
  const colSpan = collapsed ? 1 : Math.min(2, Math.max(1, rawSpan));

  // Estimación inicial para prevenir flash de 1 fila antes de primera medición
  const initialSpan = collapsed ? 15 : 64;
  const [rowSpan, setRowSpan] = useState<number>(initialSpan);

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const updateSpan = () => {
      const height = el.getBoundingClientRect().height;
      if (height > 0) {
        const nextSpan = Math.ceil((height + ROW_GAP_PX) / ROW_TRACK_PX);
        setRowSpan((prev) => (prev === nextSpan ? prev : nextSpan));
      }
    };

    updateSpan();
    const ro = new ResizeObserver(updateSpan);
    ro.observe(el);
    return () => ro.disconnect();
  }, [collapsed, colSpan]);

  if (!def) return null;

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 0 : undefined,
    opacity: isDragging ? 0.3 : 1,
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
          onToggleColSpan={() => onToggleColSpan(widget.id)}
        />
      </div>
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
  const [loaded, setLoaded] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const [undoToastWidget, setUndoToastWidget] = useState<WidgetData | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoDeadlineRef = useRef(0);
  const undoRingRafRef = useRef(0);
  const undoRingRef = useRef<SVGCircleElement | null>(null);

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
      const colSpan = type === 'data-table' || type === 'habit-tracker' ? 2 : 1;
      const position: Position = {
        x: widgetsRef.current.length,
        y: 0,
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
      const colSpan = type === 'data-table' || type === 'habit-tracker' ? 2 : 1;
      return {
        x: widgetsRef.current.length,
        y: 0,
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
        const next = prev.map((w) => {
          if (w.id !== id) return w;
          const currentSpan = Math.min(2, Math.max(1, (w.config.colSpan as number) ?? (w.position.w >= 2 ? 2 : 1)));
          const nextSpan = currentSpan === 2 ? 1 : 2;
          const nextConfig = { ...w.config, colSpan: nextSpan };
          const nextPosition = { ...w.position, w: nextSpan };
          void api.updateWidget(w.id, { config: nextConfig, position: nextPosition });
          return { ...w, config: nextConfig, position: nextPosition };
        });
        saveCache(cacheKey, next);
        return next;
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

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const widgetId = String(event.active.id);
      setActiveWidgetId(widgetId);
      if (widgets.some((w) => w.id === widgetId)) {
        onWidgetDragStart(widgetId, tabId);
      }
    },
    [widgets, onWidgetDragStart, tabId],
  );

  const handleDragCancel = useCallback(() => {
    setActiveWidgetId(null);
    onWidgetDragEnd();
  }, [onWidgetDragEnd]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveWidgetId(null);
      onWidgetDragEnd();
      if (!over || active.id === over.id) return;

      setWidgets((current) => {
        const oldIndex = current.findIndex((w) => w.id === active.id);
        const newIndex = current.findIndex((w) => w.id === over.id);
        if (oldIndex === -1 || newIndex === -1) return current;

        const reordered = arrayMove(current, oldIndex, newIndex);
        const updated = reordered.map((w, index) => ({
          ...w,
          position: { ...w.position, x: index, y: 0 },
        }));

        saveCache(cacheKey, updated);
        updated.forEach((w) => {
          void api.updateWidget(w.id, { position: w.position });
        });
        return updated;
      });
    },
    [onWidgetDragEnd, cacheKey],
  );

  // Native drag-and-drop from Toolbar "+ Widget" menu
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
      : Math.min(2, Math.max(1, (activeWidget.config.colSpan as number) ?? (activeWidget.position.w >= 2 ? 2 : 1)))
    : 1;

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
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={widgets.map((w) => w.id)} strategy={rectSortingStrategy}>
          <div
            style={{
              gridAutoRows: `${ROW_TRACK_PX}px`,
              gridAutoFlow: 'row dense',
            }}
            className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-0 items-start ${
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
                onDelete={handleDelete}
                onConfigChange={handleConfigChange}
                onToggleColSpan={handleToggleColSpan}
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
          <h3 className="text-base font-semibold text-[#F1F3F5] mb-1">
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
          className="fixed bottom-6 right-6 z-[var(--z-overlay)] flex items-center gap-3 rounded-xl border border-white/10 bg-[#16181D]/95 px-4 py-3 shadow-2xl backdrop-blur-xl animate-view-fade-in"
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
            <FiTrash2 size={10} className="absolute text-[#F1F3F5]" />
          </div>

          <span className="text-xs font-medium text-[#F1F3F5]">
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
