import { memo, useState, useCallback, Suspense, type ComponentType } from 'react';
import { useDraggable } from '@dnd-kit/core';

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
}

export const WidgetFrame = memo(function WidgetFrame({ id, position, zIndex, minSize, config, component: WidgetComponent, onResize, onDelete, onConfigChange }: WidgetFrameProps) {
  const [size, setSize] = useState({ w: position.w, h: position.h });
  const [isResizing, setIsResizing] = useState(false);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `widget-${id}`,
  });

  const style: React.CSSProperties = {
    position: 'absolute',
    left: position.x,
    top: position.y,
    width: size.w,
    height: size.h,
    zIndex: isDragging ? 999 : zIndex,
    opacity: isDragging ? 0.85 : 1,
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
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
      setSize({ w: Math.max(minSize.w, startW + me.clientX - startX), h: Math.max(minSize.h, startH + me.clientY - startY) });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      onResize(id, size.w, size.h);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [id, size, onResize, minSize]);

  const handleConfigChangeWrapped = useCallback(
    (newConfig: Record<string, unknown>) => onConfigChange(id, newConfig),
    [id, onConfigChange]
  );

  return (
    <div style={style} className="group rounded-lg border border-gray-700 bg-gray-800 shadow-lg">
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        className="flex cursor-grab active:cursor-grabbing items-center justify-between rounded-t-lg border-b border-gray-700 bg-gray-700 px-3 py-1.5 select-none"
        style={{ touchAction: 'none' }}
      >
        <div className="flex gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-400" />
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-yellow-400" />
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-400" />
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(id); }}
          className="invisible group-hover:visible rounded p-0.5 text-gray-500 hover:bg-gray-600 hover:text-gray-300 text-xs leading-none"
          title="Delete widget"
        >
          ✕
        </button>
      </div>

      <div className="overflow-hidden p-3" style={{ height: 'calc(100% - 32px)' }}>
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
    </div>
  );
});
