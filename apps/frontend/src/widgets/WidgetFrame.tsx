import { memo, useState, useCallback, useRef, useEffect, Suspense, type ComponentType } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { FiChevronUp, FiChevronDown, FiX, FiMenu, FiLayers } from 'react-icons/fi';
import { snapUpW, snapUpH } from './grid-utils';

interface WidgetFrameProps {
  id: string;
  position: { x: number; y: number; w: number; h: number };
  zIndex: number;
  minSize: { w: number; h: number };
  config: Record<string, unknown>;
  component: ComponentType<{ config: Record<string, unknown>; onConfigChange: (config: Record<string, unknown>) => void }>;
  onResize: (id: string, w: number, h: number) => void;
  onDelete: (id: string) => void;
  onConfigChange: (id: string, config: Record<string, unknown>) => void;
  gridMode: boolean;
  label: string;
  maxZIndex: number;
}

export const WidgetFrame = memo(function WidgetFrame({ id, position, zIndex, minSize, config, component: WidgetComponent, onResize, onDelete, onConfigChange, gridMode, label, maxZIndex }: WidgetFrameProps) {
  const [size, setSize] = useState({ w: position.w, h: position.h });
  const [isResizing, setIsResizing] = useState(false);
  const resizeStateRef = useRef({ w: position.w, h: position.h });
  const collapsed = (config.collapsed as boolean) ?? false;

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `widget-${id}`,
  });

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerPosRef = useRef({ x: 0, y: 0 });

  const HEADER_HEIGHT = 25;

  const handleHeaderPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      pointerPosRef.current = { x: e.clientX, y: e.clientY };
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        listeners.onPointerDown(e);
      }, 25);
    },
    [listeners]
  );

  const handleHeaderPointerUp = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleHeaderPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!longPressTimerRef.current) return;
      const dx = Math.abs(e.clientX - pointerPosRef.current.x);
      const dy = Math.abs(e.clientY - pointerPosRef.current.y);
      if (dx > 5 || dy > 5) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    },
    []
  );

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, []);

  const style: React.CSSProperties = {
    position: 'absolute',
    left: position.x,
    top: position.y,
    width: size.w,
    height: collapsed ? HEADER_HEIGHT : size.h,
    zIndex: isDragging ? 999 : ((config.zIndex as number) ?? zIndex),
    opacity: isDragging ? 0.85 : 1,
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
    transition: gridMode ? 'width 0.15s ease-in-out, height 0.15s ease-in-out' : 'none',
  };

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = size.w;
    const startH = size.h;

    const handleMouseMove = (me: MouseEvent) => {
      let newW = Math.max(minSize.w, startW + me.clientX - startX);
      let newH = Math.max(minSize.h, startH + me.clientY - startY);
      if (gridMode) {
        newW = snapUpW(newW);
        newH = snapUpH(newH);
      }
      resizeStateRef.current = { w: newW, h: newH };
      setSize({ w: newW, h: newH });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      onResize(id, resizeStateRef.current.w, resizeStateRef.current.h);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [id, size, onResize, minSize, gridMode]);

  const handleConfigChangeWrapped = useCallback(
    (newConfig: Record<string, unknown>) => onConfigChange(id, newConfig),
    [id, onConfigChange]
  );

  return (
    <div style={style} className="group border border-gray-700 bg-gray-800 shadow-lg overflow-hidden rounded-[4px]">
      <div
        className={`w-full flex items-center h-[25px] bg-transparent select-none`}
      >
        <span
          ref={setNodeRef}
          {...attributes}
          className="cursor-grab active:cursor-grabbing shrink-0 flex items-center self-stretch pl-[6px] pr-1"
          style={{ touchAction: 'none' }}
          onPointerDown={handleHeaderPointerDown}
          onPointerUp={handleHeaderPointerUp}
          onPointerCancel={handleHeaderPointerUp}
          onPointerMove={handleHeaderPointerMove}
        >
          <FiMenu size={18} className="text-gray-500" />
        </span>
        <input
          type="text"
          spellCheck={false}
          value={(config.title as string) ?? ''}
          onChange={(e) => onConfigChange(id, { ...config, title: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 min-w-0 bg-transparent border-transparent outline-none text-base text-white truncate cursor-text"
          placeholder={label}
          aria-label="Widget title"
        />
        <div className="flex items-center shrink-0 ml-1 bg-gray-800/50 ring-1 ring-gray-600/40 overflow-hidden">
          {(() => {
            const isLayered = (config.layered as boolean) ?? false;
            return (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onConfigChange(id, { ...config, zIndex: isLayered ? 0 : maxZIndex + 1, layered: !isLayered });
                }}
                className={`flex h-7 w-7 items-center justify-center transition-colors ${isLayered ? 'bg-blue-500/10 text-blue-400' : 'text-gray-400 hover:bg-blue-500/10 hover:text-blue-400'}`}
                title={isLayered ? 'Bring to back' : 'Bring to front'}
                aria-pressed={isLayered}
              >
                <FiLayers size={15} />
              </button>
            );
          })()}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onConfigChange(id, { ...config, collapsed: !collapsed });
            }}
            className={`flex h-7 w-7 items-center justify-center border-l border-gray-700 transition-colors ${collapsed ? 'bg-blue-500/10 text-blue-400' : 'text-gray-400 hover:bg-blue-500/10 hover:text-blue-400'}`}
            title={collapsed ? 'Expand widget' : 'Collapse widget'}
            aria-pressed={collapsed}
          >
            {collapsed ? <FiChevronDown size={15} /> : <FiChevronUp size={15} />}
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(id); }}
            className="flex h-7 w-7 items-center justify-center border-l border-gray-700 text-gray-500 transition-colors hover:bg-blue-500/10 hover:text-blue-400"
            title="Delete widget"
          >
            <FiX size={15} />
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          <div className="overflow-hidden p-3" style={{ height: 'calc(100% - 25px)' }}>
            <Suspense fallback={<div className="text-xs text-gray-500">Loading...</div>}>
              <WidgetComponent config={config} onConfigChange={handleConfigChangeWrapped} />
            </Suspense>
          </div>

          <button
            type="button"
            aria-label="Resize widget"
            onMouseDown={handleResizeStart}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleResizeStart(e as unknown as React.MouseEvent); } }}
            className={`absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize ${isResizing ? 'bg-blue-200' : ''}`}
            style={{
              backgroundImage: 'linear-gradient(135deg, transparent 50%, #999 50%)',
              backgroundSize: '8px 8px',
              backgroundPosition: 'bottom right',
              backgroundRepeat: 'no-repeat',
              border: 'none',
              padding: 0,
            }}
          />
        </>
      )}
    </div>
  );
});
