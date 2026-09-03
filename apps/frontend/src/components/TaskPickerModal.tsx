import { useEffect, useState, useCallback } from 'react';
import { FiX, FiClock } from 'react-icons/fi';
import * as api from '../api/widgets';
import { widgetBus } from '../widgets/widget-bus';
import type { WidgetData } from '../widgets/types';

interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  estimatedTime?: number;
  estimatedTimeUnit?: 'min' | 'hr';
}

interface TaskPickerModalProps {
  onClose: () => void;
}

function formatEstimatedTime(time?: number, unit?: 'min' | 'hr'): string | null {
  if (!time || time <= 0) return null;
  return unit === 'hr' ? `${time}hr` : `${time}min`;
}

export function TaskPickerModal({ onClose }: TaskPickerModalProps) {
  const [todoLists, setTodoLists] = useState<WidgetData[]>([]);

  const load = useCallback(() => {
    api.fetchWidgets().then((widgets) => {
      setTodoLists(widgets.filter((w) => w.type === 'todo-list' && !w.deletedAt));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSelect = useCallback((item: TodoItem, widgetId: string) => {
    if (item.completed) return;
    const estimatedMinutes = item.estimatedTime != null
      ? item.estimatedTimeUnit === 'hr'
        ? item.estimatedTime * 60
        : item.estimatedTime
      : undefined;
    widgetBus.emit('task:select', {
      taskId: item.id,
      taskName: item.text,
      estimatedMinutes,
      widgetId,
    });
    onClose();
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-gray-700 bg-gray-800 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-700 bg-gray-700 px-4 py-2.5 select-none">
          <h2 className="text-base font-semibold text-white">Select task</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-0.5 text-gray-400 hover:bg-white/10 hover:text-gray-200 leading-none"
            title="Close"
            aria-label="Close task picker"
          >
            <FiX size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {todoLists.length === 0 && (
            <p className="py-6 text-center text-sm text-gray-500">No todo lists found.</p>
          )}

          {todoLists.map((widget) => {
            const items = ((widget.config as Record<string, unknown>).items as TodoItem[] | undefined) ?? [];
            const pendingItems = items.filter((item) => !item.completed);
            const title = ((widget.config as Record<string, unknown>).title as string) || 'Todo List';

            if (pendingItems.length === 0) return null;

            return (
              <div key={widget.id} className="mb-4 last:mb-0">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  {title}
                </h3>
                <ul className="flex flex-col gap-1">
                  {pendingItems.map((item) => {
                    const est = formatEstimatedTime(item.estimatedTime, item.estimatedTimeUnit);
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => handleSelect(item, widget.id)}
                          className="flex w-full items-center gap-2 rounded-md border border-gray-700 bg-gray-900 p-2.5 text-left transition-colors hover:border-cyan-600 hover:bg-gray-750"
                        >
                          <FiClock size={14} className="shrink-0 text-gray-500" />
                          <span className="min-w-0 flex-1 truncate text-sm text-gray-200">
                            {item.text}
                          </span>
                          {est && (
                            <span className="shrink-0 rounded bg-gray-700 px-1.5 py-0.5 text-[10px] text-gray-400">
                              {est}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
