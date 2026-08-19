import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { WidgetFrame } from './WidgetFrame';
import { getWidget } from './registry';
import type { WidgetData, Position } from './types';
import * as api from '../api/widgets';
import { CELL_W, CELL_H, snapX, snapY, snapW, snapH, snapUpW, snapUpH, hasCollision, findFreeGridSlot } from './grid-utils';

function loadCache(cacheKey: string): WidgetData[] {
  try {
    const cached = localStorage.getItem(cacheKey);
    return cached ? JSON.parse(cached) : [];
  } catch {
    return [];
  }
}

function saveCache(cacheKey: string, data: WidgetData[]) {
  try { localStorage.setItem(cacheKey, JSON.stringify(data)); } catch {}
}

function bringIntoDashboard(
  data: WidgetData[],
): WidgetData[] {
  return data.map((w) => {
    const x = Math.max(0, w.position.x);
    const y = Math.max(0, w.position.y);
    if (x === w.position.x && y === w.position.y) return w;
    return { ...w, position: { ...w.position, x, y } };
  });
}

interface WidgetGridProps {
  tabId: string;
  gridMode: boolean;
  onAddWidgetRef: (tabId: string, fn: (type: string) => void) => void;
  onRefreshRef?: (tabId: string, fn: () => void) => void;
}

export function WidgetGrid({ tabId, gridMode, onAddWidgetRef, onRefreshRef }: WidgetGridProps) {
  const cacheKey = `dashlet-widgets-${tabId}`;

  const [widgets, setWidgets] = useState<WidgetData[]>(() => loadCache(cacheKey));
  const [loaded, setLoaded] = useState(false);

const handleAddWidget = useCallback(async (type: string, dropPoint?: { x: number; y: number }) => {
    const def = getWidget(type);
    if (!def) return;
    const snappedW = snapUpW(def.minSize.w);
    const snappedH = snapUpH(def.minSize.h);
    const position: Position = dropPoint
      ? {
          x: Math.max(0, gridMode ? snapX(dropPoint.x) : dropPoint.x),
          y: Math.max(0, gridMode ? snapY(dropPoint.y) : dropPoint.y),
          w: snappedW,
          h: snappedH,
        }
      : (() => {
          const slot = findFreeGridSlot(widgets, snappedW, snappedH);
          return { x: slot.x, y: slot.y, w: snappedW, h: snappedH };
        })();
await api.createWidget(type, def.defaultConfig, position, tabId);
    const data = await api.fetchWidgets(tabId);
    setWidgets(bringIntoDashboard(data));
    saveCache(cacheKey, data);
  }, [widgets, gridMode, tabId, cacheKey]);

  useEffect(() => {
    onAddWidgetRef(tabId, handleAddWidget);
  }, [handleAddWidget, onAddWidgetRef, tabId]);

  const refresh = useCallback(() => {
    api.fetchWidgets(tabId).then((data) => {
      setWidgets(data);
      saveCache(cacheKey, data);
      setLoaded(true);
    }).catch(() => {});
  }, [tabId, cacheKey]);

  useEffect(() => {
    if (onRefreshRef) onRefreshRef(tabId, refresh);
  }, [refresh, onRefreshRef, tabId]);

  useEffect(() => {
    let cancelled = false;

    function fetch() {
      api.fetchWidgets(tabId).then((data) => {
        if (!cancelled) {
          setWidgets(data);
          saveCache(cacheKey, data);
          setLoaded(true);
        }
      }).catch(() => {
        if (!cancelled) {
          setTimeout(fetch, 1000);
        }
      });
    }

    fetch();
    return () => { cancelled = true; };
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

  useEffect(() => {
    if (!gridMode) return;
    setWidgets((prev) => {
      const snapped = prev.map((w) => ({
        ...w,
        position: {
          x: snapX(w.position.x),
          y: snapY(w.position.y),
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
    });
  }, [gridMode]);

  const handleResize = useCallback((id: string, w: number, h: number) => {
    setWidgets((prev) => {
      const widget = prev.find((x) => x.id === id);
      if (!widget) return prev;
      const snappedW = gridMode ? snapW(w) : w;
      const snappedH = gridMode ? snapH(h) : h;
      if (gridMode && hasCollision(id, widget.position.x, widget.position.y, snappedW, snappedH, prev)) {
        return prev;
      }
      const newPos = { ...widget.position, w: snappedW, h: snappedH };
      api.updateWidget(id, { position: newPos });
      return prev.map((x) => (x.id === id ? { ...x, position: newPos } : x));
    });
  }, [gridMode]);

  const handleDelete = useCallback((id: string) => {
    api.deleteWidget(id);
    setWidgets((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const handleConfigChange = useCallback((id: string, config: Record<string, unknown>) => {
    setWidgets((prev) =>
      prev.map((w) => (w.id === id ? { ...w, config } : w)),
    );
    api.updateWidget(id, { config });
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const dropAreaRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDragOverArea = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
  }, []);

  const handleWidgetDrop = useCallback((e: React.DragEvent) => {
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
  }, [handleAddWidget]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, delta } = event;
    const widgetId = String(active.id).replace('widget-', '');
    setWidgets((prev) => {
      const widget = prev.find((w) => w.id === widgetId);
      if (!widget) return prev;
      let nx = widget.position.x + delta.x;
      let ny = widget.position.y + delta.y;
      const nw = widget.position.w;
      const isCollapsed = (widget.config.collapsed as boolean) ?? false;
      const nh = isCollapsed ? 25 : widget.position.h;

      if (gridMode) {
        nx = snapX(nx);
        ny = snapY(ny);
        if (hasCollision(widgetId, nx, ny, nw, nh, prev)) {
          return prev;
        }
      }

      const newPos = { ...widget.position, x: nx, y: ny };
      api.updateWidget(widgetId, { position: newPos });
      return prev.map((w) => (w.id === widgetId ? { ...w, position: newPos } : w));
    });
  }, [gridMode]);

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
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <Suspense fallback={<div className="text-gray-500 text-sm">Loading widgets...</div>}>
        <div
          id="dashboard-drop-area"
          ref={dropAreaRef}
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
          {gridMode && (
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
          )}
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
                gridMode={gridMode}
                label={def.label}
                maxZIndex={maxZ}
              />
            );
          })}
        </div>
      </Suspense>
    </DndContext>
  );
}
