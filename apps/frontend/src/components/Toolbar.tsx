import { useState } from 'react';
import { getAllWidgets } from '../widgets/registry';
import { FiPlus, FiTrash2 } from 'react-icons/fi';

interface ToolbarProps {
  onAddWidget: (type: string) => void;
  gridMode: boolean;
  onToggleGridMode: () => void;
  onOpenTrash: () => void;
}

export function Toolbar({ onAddWidget, gridMode, onToggleGridMode, onOpenTrash }: ToolbarProps) {
  const availableWidgets = getAllWidgets();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Add widget"
          aria-expanded={menuOpen}
          className={`flex items-center justify-center border border-transparent py-1.5 transition-all duration-300 ${
            menuOpen || Object.keys(availableWidgets).length === 0
              ? 'text-blue-400 drop-shadow-[0_0_5px_rgba(59,130,246,1)]'
              : 'text-gray-400 hover:text-blue-400 hover:drop-shadow-[0_0_5px_rgba(59,130,246,1)]'
          }`}
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center">
            <FiPlus
              key={menuOpen ? 'open' : 'closed'}
              size={26}
              style={{
                animation: `${menuOpen ? 'widget-menu-spin-open' : 'widget-menu-spin-close'} 0.9s cubic-bezier(0.4, 0, 0.2, 1) forwards`,
              }}
            />
          </span>
        </button>
        <div
          className="absolute left-full top-0 z-50 ml-2 flex items-center gap-1.5"
          style={{
            visibility: menuOpen ? 'visible' : 'hidden',
            transition: menuOpen ? undefined : 'visibility 0s linear 2s',
            pointerEvents: menuOpen ? 'auto' : 'none',
          }}
        >
          {availableWidgets.map(([type, def], i) => (
            <button
              key={`${type}-${menuOpen ? 'open' : 'closed'}`}
              type="button"
              onClick={() => onAddWidget(type)}
              className="group flex items-center gap-2.5 overflow-hidden whitespace-nowrap rounded-[4px] border border-gray-700/80 bg-gray-800/80 py-1.5 pl-1.5 pr-3 text-sm shadow-lg transition-colors hover:border-blue-500/40 hover:bg-blue-500/10"
              style={{
                ['--i' as string]: i,
                animation: menuOpen
                  ? `widget-menu-deal 0.6s cubic-bezier(0.4, 0, 0.2, 1) ${i * 100}ms backwards`
                  : 'widget-menu-deal 0.6s cubic-bezier(0.4, 0, 0.2, 1) reverse forwards',
              }}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] bg-gray-700/80 text-gray-300 transition-colors group-hover:bg-blue-500/20 group-hover:text-blue-400">
                <def.icon size={14} />
              </span>
              <span className="text-gray-300 transition-colors group-hover:text-blue-300">{def.label}</span>
            </button>
          ))}
        </div>
      </div>
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
