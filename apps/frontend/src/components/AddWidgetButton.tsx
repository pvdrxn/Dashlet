import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { FiPlus } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { createRoot, type Root } from 'react-dom/client';
import type { Position } from '../widgets/types';
import { getAllWidgets } from '../widgets/registry';
import { setPendingWidgetType, WIDGET_DRAG_MIME } from '../widgets/drag-session';

export interface AddWidgetButtonProps {
  onAddWidget: (type: string) => Promise<Position | null>;
  onAddWidgetDeferred: (type: string) => Promise<Position | null>;
  onPredictAdd: (type: string) => Position | null;
  onRevealWidgets: () => void;
}

export const AddWidgetButton = memo(function AddWidgetButton({
  onAddWidget,
  onAddWidgetDeferred,
  onPredictAdd,
  onRevealWidgets,
}: AddWidgetButtonProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [draggingType, setDraggingType] = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<{ el: HTMLDivElement; root: Root } | null>(null);
  const availableWidgets = getAllWidgets();

  const destroyGhost = useCallback(() => {
    setPendingWidgetType(null);
    if (ghostRef.current) {
      ghostRef.current.root.unmount();
      ghostRef.current.el.remove();
      ghostRef.current = null;
    }
  }, []);

  useEffect(() => destroyGhost, [destroyGhost]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative shrink-0" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex h-8 items-center gap-1.5 px-3 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
          isOpen
            ? 'border-p2 bg-p2 text-gray-950 font-semibold shadow-sm'
            : 'border-p2/40 bg-p2/15 text-p2 hover:border-p2/60 hover:bg-p2/25'
        }`}
        title={t('toolbar.addWidget', 'Agregar Widget')}
      >
        <FiPlus
          size={14}
          className={`${isOpen ? 'rotate-45' : ''} transition-transform duration-200 ${
            isOpen ? 'text-gray-950' : 'text-p2'
          }`}
        />
        <span className="font-medium">{t('toolbar.addWidget', 'Widget')}</span>
      </button>

      {isOpen && (
        <div
          className="absolute right-0 top-[calc(100%+6px)] flex flex-col gap-1 rounded-2xl p-2.5 min-w-[220px] shadow-2xl backdrop-blur-2xl z-[var(--z-menu)] animate-view-fade-in border border-white/12"
          style={{
            background:
              'linear-gradient(180deg, rgba(22, 24, 29, 0.96) 0%, rgba(15, 16, 19, 0.98) 100%)',
            boxShadow: '0 16px 40px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.10)',
          }}
        >
          <div className="flex items-center justify-between mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-p2">
            <span>{t('toolbar.addWidget', 'Agregar Widget')}</span>
            <span className="text-[10px] text-white/40 lowercase">clic o arrastra</span>
          </div>

          <div className="flex flex-col gap-1 max-h-[50vh] overflow-y-auto pr-1">
            {availableWidgets.map(([type, widget]) => (
              <button
                key={type}
                type="button"
                draggable
                data-active={draggingType === type}
                onDragStart={(e) => {
                  setDraggingType(type);
                  e.dataTransfer.setData(WIDGET_DRAG_MIME, type);
                  e.dataTransfer.effectAllowed = 'copy';
                  setPendingWidgetType(type);
                  const ghost = document.createElement('div');
                  ghost.style.position = 'fixed';
                  ghost.style.top = '-9999px';
                  ghost.style.left = '-9999px';
                  ghost.style.pointerEvents = 'none';
                  document.body.appendChild(ghost);
                  const root = createRoot(ghost);
                  root.render(
                    <div className="flex items-center gap-2 rounded-xl border border-white/20 bg-gray-900/95 px-3 py-2 text-xs font-medium text-white shadow-2xl backdrop-blur-md">
                      <span className="text-p2">
                        <widget.icon size={15} />
                      </span>
                      <span>{t(`widgets.${type}.label`, widget.label)}</span>
                    </div>,
                  );
                  ghostRef.current = { el: ghost, root };
                  e.dataTransfer.setDragImage(ghost, 20, 20);
                }}
                onDragEnd={() => {
                  destroyGhost();
                  setDraggingType(null);
                }}
                onClick={async () => {
                  const targetPos = onPredictAdd(type);
                  setIsOpen(false);
                  if (targetPos) {
                    onRevealWidgets();
                    await onAddWidgetDeferred(type);
                  } else {
                    await onAddWidget(type);
                  }
                }}
                className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs text-white/80 hover:bg-white/[0.08] hover:text-white transition-all text-left group cursor-grab active:cursor-grabbing"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] border border-white/10 text-white/80 group-hover:text-p2 group-hover:border-p2/40 transition-colors">
                  <widget.icon size={14} />
                </span>
                <span className="font-medium truncate">{t(`widgets.${type}.label`, widget.label)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
