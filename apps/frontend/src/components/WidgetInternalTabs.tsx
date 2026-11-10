import { useState, useRef, useEffect, type ReactNode } from 'react';
import { FiPlus, FiX } from 'react-icons/fi';

export interface WidgetTabItem {
  id: string;
  name: string;
}

export interface WidgetInternalTabsProps {
  tabs: WidgetTabItem[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onAddTab?: () => void;
  onRenameTab?: (id: string, newName: string) => void;
  onDeleteTab?: (id: string) => void;
  maxTabs?: number;
  addLabel?: string;
  extraRight?: ReactNode;
  className?: string;
}

export function WidgetInternalTabs({
  tabs,
  activeTabId,
  onSelectTab,
  onAddTab,
  onRenameTab,
  onDeleteTab,
  maxTabs = 3,
  addLabel = 'Nueva pestaña',
  extraRight,
  className = '',
}: WidgetInternalTabsProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editingId]);

  const handleStartRename = (id: string, currentName: string) => {
    if (!onRenameTab) return;
    setEditingId(id);
    setEditingName(currentName);
  };

  const handleCommitRename = () => {
    if (editingId && onRenameTab) {
      const trimmed = editingName.trim();
      if (trimmed) {
        onRenameTab(editingId, trimmed);
      }
    }
    setEditingId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCommitRename();
    } else if (e.key === 'Escape') {
      setEditingId(null);
    }
  };

  const canAdd = onAddTab && tabs.length < maxTabs;

  return (
    <div
      className={`-mx-2 px-2 flex items-center justify-between gap-1.5 border-b border-[#232B3B] pb-2 mb-3 select-none ${className}`}
    >
      <div className="flex flex-1 min-w-0 items-center gap-1.5 overflow-x-auto py-1 px-1 scrollbar-none">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const isEditing = tab.id === editingId;

          if (isEditing) {
            return (
              <div
                key={tab.id}
                className="flex items-center rounded border border-[#FFC20D]/60 bg-[#141A26] px-2 py-0.5 text-xs font-medium shrink-0"
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={handleCommitRename}
                  onKeyDown={handleKeyDown}
                  className="w-20 bg-transparent text-xs text-[#DCE4EC] outline-none"
                  maxLength={18}
                />
              </div>
            );
          }

          return (
            <div
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              onDoubleClick={() => handleStartRename(tab.id, tab.name)}
              title={
                onRenameTab
                  ? `${tab.name} (Doble clic para renombrar)`
                  : tab.name
              }
              className={`group flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-all duration-150 cursor-pointer whitespace-nowrap shrink-0 border ${
                isActive
                  ? 'bg-[#FFC20D]/15 text-[#FFC20D] border-[#FFC20D]/30 font-semibold shadow-sm'
                  : 'border-transparent text-[#8B9BB0] hover:text-[#DCE4EC] hover:bg-[#1C2436]'
              }`}
            >
              <span className="truncate max-w-[110px]">{tab.name}</span>

              {tabs.length > 1 && onDeleteTab && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteTab(tab.id);
                  }}
                  title={`Eliminar pestaña ${tab.name}`}
                  className={`rounded p-0.5 transition-colors ${
                    isActive
                      ? 'text-[#FFC20D]/70 hover:bg-[#FFC20D]/30 hover:text-[#FFC20D]'
                      : 'opacity-0 group-hover:opacity-100 text-[#8B9BB0] hover:bg-[#1C2436] hover:text-[#DCE4EC]'
                  }`}
                >
                  <FiX size={11} />
                </button>
              )}
            </div>
          );
        })}

        {canAdd && (
          <button
            type="button"
            onClick={onAddTab}
            title={addLabel}
            aria-label={addLabel}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-dashed border-[#313D53] text-[#8B9BB0] hover:border-[#FFC20D]/60 hover:text-[#FFC20D] hover:bg-[#FFC20D]/10 transition-colors cursor-pointer"
          >
            <FiPlus size={12} />
          </button>
        )}
      </div>

      {extraRight && (
        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          {extraRight}
        </div>
      )}
    </div>
  );
}
