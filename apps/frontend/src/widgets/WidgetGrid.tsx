import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { DndContext, PointerSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core';
import type { DragEndEvent, DragMoveEvent, DragStartEvent } from '@dnd-kit/core';
import { FiTrash2, FiRotateCcw, FiMoreVertical } from 'react-icons/fi';
import { WidgetFrame } from './WidgetFrame';
import { getWidget } from './registry';
import type { WidgetData, Position } from './types';
import * as api from '../api/widgets';
import { getDragSession, type TransferAction } from './drag-session';
import {
  CELL_W,
  CELL_H,
  snapX,
  snapY,
  snapW,
  snapH,
  snapUpW,
  snapUpH,
  hasCollision,
  findFreeGridSlot,
} from './grid-utils';

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

const UNDO_TOAST_MS = 5000;

function bringIntoDashboard(data: WidgetData[]): WidgetData[] {
  return data.map((w) => {
    const x = Math.max(0, snapX(w.position.x));
    const y = Math.max(0, snapY(w.position.y));
    if (x === w.position.x && y === w.position.y) return w;
    return { ...w, position: { ...w.position, x, y } };
  });
}

function normalizeLayout(data: WidgetData[]): WidgetData[] {
  const snapped = bringIntoDashboard(data).map((w) => ({
    ...w,
    position: {
      ...w.position,
      w: snapW(w.position.w),
      h: snapH(w.position.h),
    },
  }));

  const resolved: WidgetData[] = [];
  for (const w of snapped) {
    const effectiveH = ((w.config.collapsed as boolean) ?? false) ? 25 : w.position.h;
    if (!hasCollision(w.id, w.position.x, w.position.y, w.position.w, effectiveH, resolved)) {
      resolved.push(w);
    } else {
      const slot = findFreeGridSlot(resolved, w.position.w, effectiveH);
      resolved.push({ ...w, position: { ...w.position, x: slot.x, y: slot.y } });
    }
  }
  return resolved;
}

interface WidgetGridProps {
  tabId: string;
  onAddWidgetRef: (
    tabId: string,
    fn: (
      type: string,
      dropPoint?: { x: number; y: number },
      opts?: { deferCommit?: boolean },
    ) => Promise<Position | null>,
  ) => void;
  onPredictAddRef?: (tabId: string, fn: (type: string) => Position | null) => void;
  onRevealRef?: (tabId: string, fn: () => void) => void;
  onCheckPlacementRef?: (
    tabId: string,
    fn: (x: number, y: number, w: number, h: number) => boolean,
  ) => void;
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
  onCheckPlacementRef,
  onRefreshRef,
  onTransferRef,
  onWidgetDragStart,
  onWidgetDragEnd,
  onWidgetTransferred,
  onWidgetSynced,
}: WidgetGridProps) {
  const cacheKey = `dashlet-widgets-${tabId}`;

  const [widgets, setWidgets] = useState<WidgetData[]>(() => loadCache(cacheKey));
  const [loaded, setLoaded] = useState(false);
  const [undoToastWidget, setUndoToastWidget] = useState<WidgetData | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoDeadlineRef = useRef(0);
  const undoRingRafRef = useRef(0);
  const undoRingRef = useRef<SVGRectElement | null>(null);
  const widgetsRef = useRef(widgets);
  const deferredCommitRef = useRef<WidgetData[] | null>(null);
  const pendingWidgetsRef = useRef<WidgetData[]>([]);

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
      if (frac > 0) {
        undoRingRafRef.current = requestAnimationFrame(step);
      } else {
        undoRingRafRef.current = 0;
      }
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

  const pauseUndoTimer = useCallback(() => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    stopUndoRing();
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
    (type: string, dropPoint?: { x: number; y: number }): Position | null => {
      const def = getWidget(type);
      if (!def) return null;
      const snappedW = snapUpW(def.minSize.w);
      const snappedH = snapUpH(def.minSize.h);
      if (dropPoint) {
        return {
          x: Math.max(0, snapX(dropPoint.x)),
          y: Math.max(0, snapY(dropPoint.y)),
          w: snappedW,
          h: snappedH,
        };
      }
      // include widgets that are persisted but not yet revealed so rapid
      // successive adds don't predict the same slot
      const occupied = [...widgetsRef.current, ...pendingWidgetsRef.current];
      const slot = findFreeGridSlot(occupied, snappedW, snappedH);
      return { x: slot.x, y: slot.y, w: snappedW, h: snappedH };
    },
    [],
  );

  const handleAddWidget = useCallback(
    async (
      type: string,
      dropPoint?: { x: number; y: number },
      opts?: { deferCommit?: boolean },
    ): Promise<Position | null> => {
      const def = getWidget(type);
      const position = computeNewPosition(type, dropPoint);
      if (!def || !position) return null;
      await api.createWidget(type, def.defaultConfig, position, tabId);
      const data = await api.fetchWidgets(tabId);
      const normalized = normalizeLayout(data);
      if (opts?.deferCommit) {
        deferredCommitRef.current = normalized;
        const knownIds = new Set(widgetsRef.current.map((w) => w.id));
        pendingWidgetsRef.current = normalized.filter((w) => !knownIds.has(w.id));
        return position;
      }
      setWidgets(normalized);
      saveCache(cacheKey, normalized);
      return position;
    },
    [computeNewPosition, tabId, cacheKey],
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
    pendingWidgetsRef.current = [];
    setWidgets(next);
    saveCache(cacheKey, next);
  }, [cacheKey]);

  useEffect(() => {
    if (onRevealRef) onRevealRef(tabId, revealDeferredCommit);
  }, [revealDeferredCommit, onRevealRef, tabId]);

  const checkPlacement = useCallback(
    (x: number, y: number, w: number, h: number) =>
      !hasCollision(
        '__placement__',
        Math.max(0, snapX(x)),
        Math.max(0, snapY(y)),
        snapUpW(w),
        snapUpH(h),
        widgets,
      ),
    [widgets],
  );

  useEffect(() => {
    if (onCheckPlacementRef) onCheckPlacementRef(tabId, checkPlacement);
  }, [checkPlacement, onCheckPlacementRef, tabId]);

  const refresh = useCallback(() => {
    api
      .fetchWidgets(tabId)
      .then((data) => {
        const normalized = normalizeLayout(data);
        setWidgets(normalized);
        saveCache(cacheKey, normalized);
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
      return [...prev, action.widget];
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
          if (!cancelled) {
            const normalized = normalizeLayout(data);
            setWidgets(normalized);
            saveCache(cacheKey, normalized);
            setLoaded(true);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setTimeout(fetch, 1000);
          }
        });
    }

    fetch();
    return () => {
      cancelled = true;
    };
  }, [tabId, cacheKey]);

  useEffect(() => {
    saveCache(cacheKey, widgets);
  }, [widgets, cacheKey]);

  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleResize = useCallback((id: string, w: number, h: number) => {
    setWidgets((prev) => {
      const widget = prev.find((x) => x.id === id);
      if (!widget) return prev;
      const snappedW = snapW(w);
      const snappedH = snapH(h);
      if (hasCollision(id, widget.position.x, widget.position.y, snappedW, snappedH, prev)) {
        return prev;
      }
      const newPos = { ...widget.position, w: snappedW, h: snappedH };
      api.updateWidget(id, { position: newPos });
      return prev.map((x) => (x.id === id ? { ...x, position: newPos } : x));
    });
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      const widget = widgetsRef.current.find((w) => w.id === id);
      api.deleteWidget(id);
      setWidgets((prev) => prev.filter((w) => w.id !== id));
      if (!widget) return;
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      setUndoToastWidget(widget);
      startUndoTimer();
    },
    [startUndoTimer],
  );

  const handleUndoDelete = useCallback(() => {
    if (!undoToastWidget) return;
    const widget = undoToastWidget;
    dismissUndoToast();
    api.restoreWidget(widget.id).then(
      () =>
        setWidgets((prev) =>
          prev.some((w) => w.id === widget.id) ? prev : normalizeLayout([...prev, widget]),
        ),
      () => {},
    );
  }, [undoToastWidget, dismissUndoToast]);

  const handleConfigChange = useCallback((id: string, config: Record<string, unknown>) => {
    setWidgets((prev) => prev.map((w) => (w.id === id ? { ...w, config } : w)));
    api.updateWidget(id, { config });
  }, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const dropAreaRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDragOverArea = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
  }, []);

  const handleWidgetDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const type = e.dataTransfer.getData('text/plain');
      if (!type) return;
      const rect = dropAreaRef.current?.getBoundingClientRect();
      if (!rect) return;
      const def = getWidget(type);
      if (!def) return;
      const w = snapUpW(def.minSize.w);
      const h = snapUpH(def.minSize.h);
      const x = e.clientX - rect.left - w / 2;
      const y = e.clientY - rect.top - h / 2;
      handleAddWidget(type, { x, y });
    },
    [handleAddWidget],
  );

  const [activeDrag, setActiveDrag] = useState<WidgetData | null>(null);
  const [dropValid, setDropValid] = useState(true);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const widgetId = String(event.active.id).replace('widget-', '');
      onWidgetDragStart(widgetId, tabId);
      setActiveDrag(widgets.find((w) => w.id === widgetId) ?? null);
      setDropValid(true);
    },
    [onWidgetDragStart, tabId, widgets],
  );

  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      const widgetId = String(event.active.id).replace('widget-', '');
      const widget = widgets.find((w) => w.id === widgetId);
      if (!widget) return;
      const h = ((widget.config.collapsed as boolean) ?? false) ? 25 : widget.position.h;
      const x = Math.max(0, snapX(widget.position.x + event.delta.x));
      const y = Math.max(0, snapY(widget.position.y + event.delta.y));
      setDropValid(!hasCollision(widgetId, x, y, widget.position.w, h, widgets));
    },
    [widgets],
  );

  const handleDragCancel = useCallback(() => {
    setActiveDrag(null);
    onWidgetDragEnd();
  }, [onWidgetDragEnd]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, delta } = event;
      const widgetId = String(active.id).replace('widget-', '');
      setActiveDrag(null);

      const session = getDragSession();
      if (session && session.sourceTabId === tabId) {
        const el = document.elementFromPoint(session.pointerX, session.pointerY);
        const targetArea = el?.closest('[data-dashboard-tab-id]');
        const targetTabId = targetArea?.getAttribute('data-dashboard-tab-id');
        if (targetArea && targetTabId && targetTabId !== tabId) {
          const widget = widgets.find((w) => w.id === widgetId);
          if (widget) {
            const rect = targetArea.getBoundingClientRect();
            const collapsed = (widget.config.collapsed as boolean) ?? false;
            const w = widget.position.w;
            const h = collapsed ? 25 : widget.position.h;
            const nx = Math.max(0, session.pointerX - rect.left - w / 2);
            const ny = Math.max(0, session.pointerY - rect.top - h / 2);
            const newPos = {
              ...widget.position,
              x: snapX(nx),
              y: snapY(ny),
            };
            const moved: WidgetData = { ...widget, tabId: targetTabId, position: newPos };
            onWidgetTransferred(targetTabId, { type: 'insert', widget: moved });
            setWidgets((prev) => prev.filter((w) => w.id !== widgetId));
            api.updateWidget(widgetId, { tabId: targetTabId, position: newPos }).then(
              () => onWidgetSynced(targetTabId),
              () => {
                onWidgetTransferred(targetTabId, { type: 'remove', widgetId });
                setWidgets((prev) =>
                  prev.some((w) => w.id === widgetId) ? prev : [...prev, widget],
                );
              },
            );
          }
          onWidgetDragEnd();
          return;
        }
      }
      onWidgetDragEnd();

      const widget = widgets.find((w) => w.id === widgetId);
      if (widget) {
        let nx = widget.position.x + delta.x;
        let ny = widget.position.y + delta.y;
        const nw = widget.position.w;
        const isCollapsed = (widget.config.collapsed as boolean) ?? false;
        const nh = isCollapsed ? 25 : widget.position.h;

        nx = Math.max(0, snapX(nx));
        ny = Math.max(0, snapY(ny));
        if (hasCollision(widgetId, nx, ny, nw, nh, widgets)) return;

        const newPos = { ...widget.position, x: nx, y: ny };
        api.updateWidget(widgetId, { position: newPos });
        setWidgets((prev) => prev.map((w) => (w.id === widgetId ? { ...w, position: newPos } : w)));
      }
    },
    [tabId, widgets, onWidgetDragEnd, onWidgetTransferred, onWidgetSynced],
  );

  const dashW = Math.max(
    viewport.w,
    ...widgets.map((w) => w.position.x + w.position.w + CELL_W * 8),
  );
  const dashH = Math.max(
    viewport.h,
    ...widgets.map((w) => {
      const effectiveH = ((w.config.collapsed as boolean) ?? false) ? 25 : w.position.h;
      return w.position.y + effectiveH + CELL_H * 8;
    }),
  );

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
    >
      <Suspense fallback={<div className="text-gray-500 text-sm">Loading widgets...</div>}>
        <div
          id="dashboard-drop-area"
          ref={dropAreaRef}
          data-dashboard-tab-id={tabId}
          onDragOver={handleDragOverArea}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleWidgetDrop}
          className={`relative ${dragOver ? 'ring-2 ring-blue-400/60 ring-inset' : ''}`}
          style={{ width: dashW, minHeight: dashH }}
        >
          {!loaded && widgets.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-gray-500">
              <p>Loading widgets...</p>
            </div>
          )}
          <div
            className="pointer-events-none absolute left-0 top-0"
            style={{
              width: dashW,
              height: dashH,
              backgroundImage: `
                linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)
              `,
              backgroundSize: `${CELL_W}px ${CELL_H}px`,
            }}
          />
          {widgets.map((widget) => {
            const def = getWidget(widget.type);
            if (!def) return null;

            const maxZ = widgets.reduce((m, w) => Math.max(m, (w.config.zIndex as number) ?? 0), 0);

            return (
              <WidgetFrame
                key={widget.id}
                id={widget.id}
                position={widget.position}
                zIndex={widget.zIndex}
                minSize={def.minSize}
                config={widget.config}
                component={def.component}
                onResize={handleResize}
                onDelete={handleDelete}
                onConfigChange={handleConfigChange}
                label={def.label}
                maxZIndex={maxZ}
              />
            );
          })}
        </div>
      </Suspense>
      {createPortal(
        <DragOverlay style={{ pointerEvents: 'none' }}>
          {activeDrag &&
            (() => {
              const def = getWidget(activeDrag.type);
              if (!def) return null;
              const collapsed = (activeDrag.config.collapsed as boolean) ?? false;
              const title = (activeDrag.config.title as string) || def.label;
              return (
                <div
                  className={`relative overflow-hidden rounded-[4px] border bg-gray-800 shadow-2xl ${dropValid ? 'border-blue-400/40' : 'border-red-400/40'}`}
                  style={{
                    width: activeDrag.position.w,
                    height: collapsed ? 25 : activeDrag.position.h,
                    opacity: 0.92,
                  }}
                >
                  <div className="flex h-[25px] shrink-0 items-center gap-1.5 border-b border-gray-700/60 px-2">
                    <FiMoreVertical size={15} className="shrink-0 text-gray-500" />
                    <span className="truncate text-sm text-white">{title}</span>
                  </div>
                  {!collapsed && (
                    <div
                      className="min-h-0 overflow-hidden p-3"
                      style={{ height: 'calc(100% - 25px)' }}
                    >
                      <Suspense fallback={null}>
                        <def.component config={activeDrag.config} onConfigChange={() => {}} />
                      </Suspense>
                    </div>
                  )}
                </div>
              );
            })()}
        </DragOverlay>,
        document.body,
      )}
      {createPortal(
        undoToastWidget && (
          <div
            className="fixed bottom-4 left-1/2 z-[1200] flex -translate-x-1/2 items-center gap-2.5 rounded-md border border-gray-700 bg-gray-800 py-2 pl-3.5 pr-1.5 shadow-2xl transition-transform duration-150 hover:scale-110"
            onMouseEnter={pauseUndoTimer}
            onMouseLeave={startUndoTimer}
          >
            <svg className="pointer-events-none absolute inset-0 h-full w-full">
              <rect
                ref={undoRingRef}
                x="0.75"
                y="0.75"
                rx="6"
                fill="none"
                stroke="#3b82f6"
                strokeWidth="1.5"
                strokeLinecap="round"
                pathLength={100}
                strokeDasharray={100}
                style={{ width: 'calc(100% - 1.5px)', height: 'calc(100% - 1.5px)', strokeDashoffset: 0 }}
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
              className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded border border-blue-500/60 px-2 py-0.5 text-xs text-blue-400 transition-colors hover:bg-blue-500/20 hover:text-blue-300"
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
