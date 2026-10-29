import { useState, useRef, useCallback, useEffect } from 'react';
import { FiPlus } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { createRoot, type Root } from 'react-dom/client';
import { getAllWidgets } from '../widgets/registry';
import { setPendingWidgetType, WIDGET_DRAG_MIME } from '../widgets/drag-session';
import type { Position } from '../widgets/types';
import { clampButtonPosition } from './floating-utils';

interface FloatingAddWidgetButtonProps {
  onAddWidget: (type: string) => Promise<Position | null>;
  onAddWidgetDeferred: (type: string) => Promise<Position | null>;
  onPredictAdd: (type: string) => Position | null;
  onRevealWidgets: () => void;
}

export function FloatingAddWidgetButton({
  onAddWidget,
  onAddWidgetDeferred,
  onPredictAdd,
  onRevealWidgets,
}: FloatingAddWidgetButtonProps) {
  const { t } = useTranslation();
  const availableWidgets = getAllWidgets();

  // Posición guardada o por defecto a la derecha del botón de menú
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    const saved = localStorage.getItem('dashlet-add-widget-pos');
    if (saved) {
      try {
        return clampButtonPosition(JSON.parse(saved));
      } catch {}
    }
    return clampButtonPosition({ x: 86, y: 55 });
  });

  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [draggingType, setDraggingType] = useState<string | null>(null);

  const dragStartRef = useRef<{ startX: number; startY: number; posX: number; posY: number } | null>(
    null,
  );
  const hasMovedRef = useRef(false);
  const ghostRef = useRef<{ el: HTMLDivElement; root: Root } | null>(null);

  const destroyGhost = () => {
    setPendingWidgetType(null);
    if (ghostRef.current) {
      ghostRef.current.root.unmount();
      ghostRef.current.el.remove();
      ghostRef.current = null;
    }
  };

  useEffect(() => destroyGhost, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: pos.x,
      posY: pos.y,
    };
    hasMovedRef.current = false;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.startX;
    const dy = e.clientY - dragStartRef.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      hasMovedRef.current = true;
      setIsDragging(true);
      const next = clampButtonPosition({
        x: dragStartRef.current.posX + dx,
        y: dragStartRef.current.posY + dy,
      });
      setPos(next);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragStartRef.current) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      dragStartRef.current = null;
    }
    if (hasMovedRef.current) {
      localStorage.setItem('dashlet-add-widget-pos', JSON.stringify(pos));
    } else {
      setIsOpen((prev) => !prev);
    }
    setIsDragging(false);
  };

  const notifyMouseEnter = useCallback(() => {
    window.electronAPI?.setIgnoreMouseEvents?.(false);
  }, []);

  const notifyMouseLeave = useCallback(() => {
    if (!isOpen && !draggingType) {
      window.electronAPI?.setIgnoreMouseEvents?.(true, { forward: true });
    }
  }, [isOpen, draggingType]);

  return (
    <div
      className="pointer-events-auto fixed z-[var(--z-modal)] select-none"
      style={{ left: `${pos.x}px`, top: `${pos.y}px` }}
      onMouseEnter={notifyMouseEnter}
      onMouseLeave={notifyMouseLeave}
    >
      {/* Botón flotante circular para añadir widgets */}
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className={`flex h-12 w-12 items-center justify-center rounded-full border border-gray-600 bg-gray-800/95 text-white shadow-2xl backdrop-blur-md transition-transform duration-150 active:scale-95 ${
          isOpen ? 'border-p2 text-p2' : 'hover:border-gray-500'
        } ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        title="Añadir Widget"
      >
        <FiPlus
          size={24}
          className={isOpen ? 'rotate-45 transition-transform text-p2' : 'transition-transform'}
        />
      </button>

      {/* Lista flotante de widgets disponibles */}
      {isOpen && (
        <div
          className={`absolute left-14 ${
            pos.y > window.innerHeight - 380 ? 'bottom-0' : 'top-0'
          } flex flex-col gap-1.5 rounded-lg border border-gray-700 bg-gray-800/95 p-2 shadow-2xl backdrop-blur-md min-w-[180px]`}
          onMouseEnter={notifyMouseEnter}
        >
          <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            {t('toolbar.addWidget', 'Widgets')}
          </div>
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
                  <div className="flex items-center gap-2 rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-xs font-medium text-white shadow-xl">
                    <span className="text-p2"><widget.icon size={14} /></span>
                    <span>{t(`widgets.${type}.label`, widget.label)}</span>
                  </div>,
                );
                ghostRef.current = { el: ghost, root };
                e.dataTransfer.setDragImage(ghost, 20, 20);
              }}
              onDragEnd={() => {
                destroyGhost();
                setDraggingType(null);
                notifyMouseLeave();
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
              className="flex items-center gap-2.5 rounded px-2.5 py-1.5 text-xs text-gray-300 hover:bg-white/5 hover:text-white transition-colors text-left"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-gray-700/60 text-gray-300">
                <widget.icon size={13} />
              </span>
              <span className="font-medium truncate">{t(`widgets.${type}.label`, widget.label)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
