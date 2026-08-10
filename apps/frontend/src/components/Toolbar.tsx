import { getAllWidgets } from '../widgets/registry';
import { FiTrash2 } from 'react-icons/fi';

interface ToolbarProps {
  onAddWidget: (type: string) => void;
  gridMode: boolean;
  onToggleGridMode: () => void;
  onOpenTrash: () => void;
}

export function Toolbar({ onAddWidget, gridMode, onToggleGridMode, onOpenTrash }: ToolbarProps) {
  const availableWidgets = getAllWidgets();

  return (
    <div className="flex items-center gap-2 px-4 py-2">
      {availableWidgets.map(([type, def]) => (
        <button
          key={type}
          type="button"
          onClick={() => onAddWidget(type)}
          className="rounded-md border border-gray-600 px-3 py-1 text-sm text-gray-400 hover:bg-gray-700 hover:text-gray-200"
        >
          {def.icon} {def.label}
        </button>
      ))}
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenTrash}
          className="rounded-md border border-gray-600 px-2.5 py-1 text-sm text-gray-400 hover:bg-gray-700 hover:text-gray-200"
          title="Open trash"
        >
          <FiTrash2 size={15} className="inline-block -mt-0.5" />
        </button>
        <span className="text-xs text-gray-500">Snap Grid</span>
        <button
          type="button"
          onClick={onToggleGridMode}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${gridMode ? 'bg-blue-500' : 'bg-gray-600'}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${gridMode ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </button>
      </div>
    </div>
  );
}
