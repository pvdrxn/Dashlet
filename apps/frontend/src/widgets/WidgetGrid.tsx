import { useState, useEffect, useCallback } from 'react';
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
    api.fetchWidgets().then((data) => {
      setWidgets(data);
      setLoading(false);
    }).catch((err) => {
      console.error('Failed to load widgets:', err);
      setLoading(false);
    });
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
              onResize={handleResize}
              onDelete={handleDelete}
            >
              <def.component
                config={widget.config}
                onConfigChange={(config) => handleConfigChange(widget.id, config)}
              />
            </WidgetFrame>
          );
        })}
      </div>
    </DndContext>
  );
}
