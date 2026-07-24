import { useState, useEffect, useCallback, Suspense } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { WidgetFrame } from './WidgetFrame';
import { getWidget } from './registry';
import type { WidgetData } from './types';
import * as api from '../api/widgets';

const CELL_W = 260;
const CELL_H = 180;

function snapX(value: number): number {
  return Math.round(value / CELL_W) * CELL_W;
}

function snapY(value: number): number {
  return Math.round(value / CELL_H) * CELL_H;
}

function snapW(value: number): number {
  return Math.max(Math.round(value / CELL_W) * CELL_W, CELL_W);
}

function snapH(value: number): number {
  return Math.max(Math.round(value / CELL_H) * CELL_H, CELL_H);
}

function hasCollision(
  id: string, x: number, y: number, w: number, h: number,
  widgets: WidgetData[],
): boolean {
  return widgets.some((wgt) =>
    wgt.id !== id &&
    x < wgt.position.x + wgt.position.w &&
    x + w > wgt.position.x &&
    y < wgt.position.y + wgt.position.h &&
    y + h > wgt.position.y,
  );
}

function findFreeGridSlot(widgets: WidgetData[], defW: number, defH: number): { x: number; y: number } {
  const cols = Math.ceil(defW / CELL_W);
  const rows = Math.ceil(defH / CELL_H);
  const gridW = cols * CELL_W;
  const gridH = rows * CELL_H;

  for (let cy = 0; cy < 40; cy++) {
    for (let cx = 0; cx < 40; cx++) {
      const x = cx * CELL_W;
      const y = cy * CELL_H;
      if (!hasCollision('', x, y, gridW, gridH, widgets)) {
        return { x, y };
      }
    }
  }
  return { x: 0, y: 0 };
}

function loadCache(): WidgetData[] {
  try {
    const cached = localStorage.getItem('dashlet-widgets');
    return cached ? JSON.parse(cached) : [];
  } catch {
    return [];
  }
}

function saveCache(data: WidgetData[]) {
  try { localStorage.setItem('dashlet-widgets', JSON.stringify(data)); } catch {}
}

interface WidgetGridProps {
  onAddWidget: () => void;
  gridMode: boolean;
}

export function WidgetGrid({ onAddWidget, gridMode }: WidgetGridProps) {
  const [widgets, setWidgets] = useState<WidgetData[]>(() => loadCache());

  useEffect(() => {
    let cancelled = false;

    function fetch() {
      api.fetchWidgets().then((data) => {
        if (!cancelled) {
          setWidgets(data);
          saveCache(data);
        }
      }).catch(() => {
        if (!cancelled) {
          setTimeout(fetch, 1000);
        }
      });
    }

    fetch();
    return () => { cancelled = true; };
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
        if (!hasCollision(w.id, w.position.x, w.position.y, w.position.w, w.position.h, resolved)) {
          resolved.push(w);
        } else {
          const slot = findFreeGridSlot(resolved, w.position.w, w.position.h);
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
    setWidgets((prev) => prev.filter((w) => w.id !== id));
    api.deleteWidget(id);
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

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, delta } = event;
    const widgetId = String(active.id).replace('widget-', '');
    setWidgets((prev) => {
      const widget = prev.find((w) => w.id === widgetId);
      if (!widget) return prev;
      let nx = widget.position.x + delta.x;
      let ny = widget.position.y + delta.y;
      const nw = widget.position.w;
      const nh = widget.position.h;

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

  if (widgets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <p className="mb-4">No widgets yet</p>
        <button
          type="button"
          onClick={onAddWidget}
          className="rounded-lg bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
        >
          Add your first widget
        </button>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <Suspense fallback={<div className="text-gray-500 text-sm">Loading widgets...</div>}>
        <div className="relative min-h-[600px] w-full">
          {gridMode && widgets.length > 0 && (() => {
            const maxX = widgets.reduce((m, w) => Math.max(m, w.position.x + w.position.w), 0);
            const maxY = widgets.reduce((m, w) => Math.max(m, w.position.y + w.position.h), 0);
            const gridW = maxX + CELL_W * 2;
            const gridH = maxY + CELL_H * 2;
            return (
              <div
                className="pointer-events-none absolute left-0 top-0"
                style={{
                  width: gridW,
                  height: gridH,
                  backgroundImage: `
                    linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)
                  `,
                  backgroundSize: `${CELL_W}px ${CELL_H}px`,
                }}
              />
            );
          })()}
          {widgets.map((widget) => {
            const def = getWidget(widget.type);
            if (!def) return null;

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
              />
            );
          })}
        </div>
      </Suspense>
    </DndContext>
  );
}
