import { useState, useEffect, useCallback, Suspense } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { WidgetFrame } from './WidgetFrame';
import { getWidget } from './registry';
import type { WidgetData } from './types';
import * as api from '../api/widgets';

interface WidgetGridProps {
  onAddWidget: () => void;
}

export function WidgetGrid({ onAddWidget }: WidgetGridProps) {
  const [widgets, setWidgets] = useState<WidgetData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout>;

    async function load() {
      while (!cancelled) {
        try {
          const data = await api.fetchWidgets();
          if (!cancelled) {
            setWidgets(data);
            setLoading(false);
          }
          return;
        } catch {
          await new Promise(resolve => { retryTimer = setTimeout(resolve, 1000); });
        }
      }
    }

    load();
    return () => { cancelled = true; clearTimeout(retryTimer); };
  }, []);

  const handleResize = useCallback((id: string, w: number, h: number) => {
    setWidgets((prev) => {
      const widget = prev.find((x) => x.id === id);
      if (!widget) return prev;
      const newPos = { ...widget.position, w, h };
      api.updateWidget(id, { position: newPos });
      return prev.map((x) => (x.id === id ? { ...x, position: newPos } : x));
    });
  }, []);

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
      const newPos = { ...widget.position, x: widget.position.x + delta.x, y: widget.position.y + delta.y };
      api.updateWidget(widgetId, { position: newPos });
      return prev.map((w) => (w.id === widgetId ? { ...w, position: newPos } : w));
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        Loading widgets...
      </div>
    );
  }

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
              />
            );
          })}
        </div>
      </Suspense>
    </DndContext>
  );
}
