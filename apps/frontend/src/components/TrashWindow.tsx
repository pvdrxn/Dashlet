import { useEffect, useState, useCallback } from 'react';
import { FiX, FiTrash2, FiRotateCcw, FiTrash, FiClock } from 'react-icons/fi';
import { getWidget } from '../widgets/registry';
import type { WidgetData } from '../widgets/types';
import * as api from '../api/widgets';

const RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const PURGE_REFRESH_MS = 60 * 1000;

interface TrashWindowProps {
  onClose: () => void;
  onRestoreComplete: () => void;
}

function getDaysLeft(deletedAt?: string | null): number {
  if (!deletedAt) return RETENTION_DAYS;
  const remaining = RETENTION_DAYS * DAY_MS - (Date.now() - new Date(deletedAt).getTime());
  return Math.max(0, Math.ceil(remaining / DAY_MS));
}

function formatDaysLeft(days: number): string {
  if (days <= 0) return 'Deleted today';
  if (days === 1) return 'Deleted in 1 day';
  return `Deleted in ${days} days`;
}

export function TrashWindow({ onClose, onRestoreComplete }: TrashWindowProps) {
  const [items, setItems] = useState<WidgetData[]>([]);

  const load = useCallback(() => {
    api.fetchTrashedWidgets().then(setItems).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, PURGE_REFRESH_MS);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleRestore = useCallback(
    async (id: string) => {
      await api.restoreWidget(id);
      load();
      onRestoreComplete();
    },
    [load, onRestoreComplete]
  );

  const handleDeleteForever = useCallback(
    async (id: string) => {
      await api.deleteWidgetForever(id);
      load();
    },
    [load]
  );

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-gray-700 bg-gray-800 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-700 bg-gray-700 px-4 py-2.5 select-none">
          <h2 className="text-base font-semibold text-white">Trash</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-0.5 text-gray-400 hover:bg-gray-600 hover:text-gray-200 leading-none"
            title="Close trash"
            aria-label="Close trash"
          >
            <FiX size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <FiTrash2 size={32} className="mb-3" />
              <p className="text-sm">The trash is empty</p>
              <p className="mt-1 text-xs">Deleted widgets stay here for 30 days before being permanently removed</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {items.map((widget) => {
                const def = getWidget(widget.type);
                const daysLeft = getDaysLeft(widget.deletedAt);
                const title = (widget.config.title as string) || def?.label || widget.type;
                return (
                  <li key={widget.id} className="flex items-center gap-3 rounded-md border border-gray-700 bg-gray-900 p-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gray-700 text-lg">
                      {def?.icon ? <def.icon size={18} /> : '?'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-white">{title}</p>
                      <p className="flex items-center gap-1 text-xs text-gray-400">
                        <FiClock size={11} />
                        {formatDaysLeft(daysLeft)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleRestore(widget.id)}
                        className="rounded-md border border-blue-500/60 px-2.5 py-1 text-xs text-blue-400 hover:bg-blue-500/20 hover:text-blue-300"
                        title="Restore widget"
                      >
                        <FiRotateCcw size={13} className="inline-block mr-1 -mt-0.5" />
                        Restore
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteForever(widget.id)}
                        className="rounded-md border border-red-500/60 px-2 py-1 text-xs text-red-400 hover:bg-red-500/20 hover:text-red-300"
                        title="Delete permanently"
                      >
                        <FiTrash size={13} className="inline-block -mt-0.5" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t border-gray-700 px-4 py-2 text-xs text-gray-500">
            Widgets are permanently deleted 30 days after being trashed
          </div>
        )}
      </div>
    </div>
  );
}