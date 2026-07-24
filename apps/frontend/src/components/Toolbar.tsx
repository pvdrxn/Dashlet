import { getAllWidgets } from '../widgets/registry';

interface ToolbarProps {
  onAddWidget: (type: string) => void;
  gridMode: boolean;
  onToggleGridMode: () => void;
}

export function Toolbar({ onAddWidget, gridMode, onToggleGridMode }: ToolbarProps) {
  const availableWidgets = getAllWidgets();

  return (
    <div className="flex items-center gap-2 border-b border-gray-700 bg-gray-800 px-4 py-2 shadow-sm">
      <span className="mr-2 text-sm font-semibold text-gray-300">Widgets</span>
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
