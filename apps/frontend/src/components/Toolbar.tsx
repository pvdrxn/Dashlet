import { getAllWidgets } from '../widgets/registry';

interface ToolbarProps {
  onAddWidget: (type: string) => void;
}

export function Toolbar({ onAddWidget }: ToolbarProps) {
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
    </div>
  );
}
