import { memo, useState, useCallback, useRef, useEffect, Suspense } from 'react';
import { FiChevronUp, FiChevronDown, FiX, FiMoreVertical } from 'react-icons/fi';
import { widgetBus } from './widget-bus';
import type { ComponentType } from './types';
/** Alto de la barra de titulo. */
const HEADER_HEIGHT = 25;
interface WidgetFrameProps {
  id: string;
  config: Record<string, unknown>;
  component: ComponentType;
  onDelete: (id: string) => void;
  onConfigChange: (id: string, config: Record<string, unknown>) => void;
  label: string;
  /** props de dnd-kit para el tirador de arrastre */
  dragHandleProps: DragHandleProps;
  dragHandleRef: (node: HTMLElement | null) => void;
  /** El widget esta siguiendo al cursor. Enciende la senal de color. */
  isDragging?: boolean;
}
/** Handlers de dnd-kit que se componen con los del frame. */
export interface DragHandleProps {
  onPointerDown?: (e: React.PointerEvent) => void;
  onPointerUp?: (e: React.PointerEvent) => void;
  onPointerCancel?: (e: React.PointerEvent) => void;
  onPointerMove?: (e: React.PointerEvent) => void;
  [key: string]: unknown;
}
/*
 * El frame ya no posiciona nada: la grilla define donde vive el widget y que
 * tamaño tiene. Solo quedan el encabezado, el arrastre y las acciones.
 */
export const WidgetFrame = memo(function WidgetFrame({
  id,
  config,
  component: WidgetComponent,
  onDelete,
  onConfigChange,
  label,
  dragHandleProps,
  dragHandleRef,
  isDragging = false,
}: WidgetFrameProps) {
  const [highlighted, setHighlighted] = useState(false);
  // El colapso lo decide la celda, que es la que mide su alto (ver
  // cellHeight en grid-utils.ts). Aca solo se refleja para pintar el fondo.
  const collapsed = (config.collapsed as boolean) ?? false;
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerPosRef = useRef({ x: 0, y: 0 });
  const HOLD_THRESHOLD = 450;
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdPosRef = useRef({ x: 0, y: 0 });
  const isHoldTargetInteractive = useCallback((target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return true;
    return !!target.closest(
      'button, input, textarea, select, a, [contenteditable="true"], [role="button"], [aria-roledescription]',
    );
  }, []);
  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);
  const fireHoldToggle = useCallback(() => {
    holdTimerRef.current = null;
    onConfigChange(id, { ...config, collapsed: !collapsed });
  }, [onConfigChange, id, config, collapsed]);
  const handleHoldPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      if (isHoldTargetInteractive(e.target)) return;
      holdPosRef.current = { x: e.clientX, y: e.clientY };
      clearHoldTimer();
      holdTimerRef.current = setTimeout(fireHoldToggle, HOLD_THRESHOLD);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
    },
    [isHoldTargetInteractive, clearHoldTimer, fireHoldToggle],
  );
  const handleTitleHoldPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      holdPosRef.current = { x: e.clientX, y: e.clientY };
      clearHoldTimer();
      holdTimerRef.current = setTimeout(fireHoldToggle, HOLD_THRESHOLD);
    },
    [clearHoldTimer, fireHoldToggle],
  );
  const handleHoldPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!holdTimerRef.current) return;
      if ((e.buttons & 1) === 0) return clearHoldTimer();
      const dx = Math.abs(e.clientX - holdPosRef.current.x);
      const dy = Math.abs(e.clientY - holdPosRef.current.y);
      if (dx > 5 || dy > 5) clearHoldTimer();
    },
    [clearHoldTimer],
  );
  const handleHoldPointerUp = useCallback(
    (e: React.PointerEvent) => {
      clearHoldTimer();
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    },
    [clearHoldTimer],
  );
  const handleHeaderPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    pointerPosRef.current = { x: e.clientX, y: e.clientY };
    // dnd-kit escucha en el tirador; este timeout solo evita que un clic
    // simple (sin movimiento) dispare un arrastre.
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
    }, 25);
  }, []);
  const handleHeaderPointerUp = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);
  const handleHeaderPointerMove = useCallback((e: React.PointerEvent) => {
    if (!longPressTimerRef.current) return;
    if ((e.buttons & 1) === 0) return handleHeaderPointerUp();
    const dx = Math.abs(e.clientX - pointerPosRef.current.x);
    const dy = Math.abs(e.clientY - pointerPosRef.current.y);
    if (dx > 5 || dy > 5) handleHeaderPointerUp();
  }, [handleHeaderPointerUp]);
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    };
  }, []);
  useEffect(() => {
    const off = widgetBus.on('timer-highlight', (data) => {
      if (data.widgetId !== id) return;
      setHighlighted(true);
      setTimeout(() => setHighlighted(false), 1500);
    });
    return () => {
      off();
    };
  }, [id]);
  const handleConfigChangeWrapped = useCallback(
    (newConfig: Record<string, unknown>) => onConfigChange(id, newConfig),
    [id, onConfigChange],
  );
  return (
    <div
      data-widget-id={id}
      className={`group flex h-full w-full flex-col overflow-hidden rounded-lg border transition-all duration-300 ${
        highlighted
          ? 'border-p2 shadow-[0_8px_28px_-6px_rgba(217,164,65,0.22),inset_0_1px_0_rgba(255,255,255,0.07)]'
          : isDragging
            ? 'border-p2 bg-gray-800/90 shadow-[0_18px_44px_-10px_rgba(217,164,65,0.32),inset_0_1px_0_rgba(255,255,255,0.07)]'
            : 'border-gray-600 bg-gray-800/90 shadow-[0_8px_24px_-6px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.08)]'
      }`}
      onWheel={(e) => e.stopPropagation()}
    >
      <div
        className={`flex w-full shrink-0 items-center select-none ${
          isDragging ? 'bg-p2/15' : collapsed ? 'bg-p2/10' : 'bg-transparent'
        }`}
        style={{ height: HEADER_HEIGHT }}
        onPointerDown={handleHoldPointerDown}
        onPointerMove={handleHoldPointerMove}
        onPointerUp={handleHoldPointerUp}
        onPointerCancel={handleHoldPointerUp}
        onLostPointerCapture={clearHoldTimer}
      >
        <span
          {...dragHandleProps}
          ref={dragHandleRef}
          className="flex shrink-0 cursor-grab touch-none items-center self-stretch pl-[6px] pr-1 active:cursor-grabbing"
          /*
           * Ojo con el orden: los handlers de dnd-kit (`dragHandleProps`) traen
           * su propio onPointerDown, y este onPointerDown lo SOBREESCRIBE. Si
           * se pierde, el sensor nunca arranca y el widget no se puede mover.
           * Por eso se componen en vez de reemplazarse.
           */
          onPointerDown={(e) => {
            handleHeaderPointerDown(e);
            dragHandleProps.onPointerDown?.(e);
          }}
          onPointerUp={(e) => {
            handleHeaderPointerUp();
            dragHandleProps.onPointerUp?.(e);
          }}
          onPointerCancel={(e) => {
            handleHeaderPointerUp();
            dragHandleProps.onPointerCancel?.(e);
          }}
          onPointerMove={(e) => {
            handleHeaderPointerMove(e);
            dragHandleProps.onPointerMove?.(e);
          }}
        >
          <FiMoreVertical size={15} className="text-gray-500" />
        </span>
        <input
          type="text"
          spellCheck={false}
          value={(config.title as string) ?? ''}
          onChange={(e) => onConfigChange(id, { ...config, title: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={handleTitleHoldPointerDown}
          onPointerMove={(e) => {
            e.stopPropagation();
            handleHoldPointerMove(e);
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
            handleHoldPointerUp(e);
          }}
          onPointerCancel={(e) => {
            e.stopPropagation();
            handleHoldPointerUp(e);
          }}
          className="min-w-0 flex-1 cursor-text truncate border border-transparent bg-transparent text-sm font-medium tracking-[-0.01em] text-white focus:border-gray-400 focus:bg-gray-700/40 focus:ring-1 focus:ring-gray-500/40 focus:outline-none"
          placeholder={label}
          aria-label="Widget title"
        />
        <div className="ml-1 flex shrink-0 items-center divide-x divide-gray-700/60 bg-gray-800/50 ring-1 ring-gray-600/40">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onConfigChange(id, { ...config, collapsed: !collapsed });
            }}
            className={`relative flex h-6 w-6 items-center justify-center transition-all duration-150 after:pointer-events-auto after:absolute after:-inset-1 after:content-[''] active:scale-90 ${collapsed ? 'bg-p2/10 text-p2' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}
            title={collapsed ? 'Expand widget' : 'Collapse widget'}
            aria-label={collapsed ? 'Expand widget' : 'Collapse widget'}
            aria-pressed={collapsed}
          >
            {collapsed ? <FiChevronDown size={15} /> : <FiChevronUp size={15} />}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(id);
            }}
            className="relative flex h-6 w-6 items-center justify-center text-gray-500 transition-all duration-150 after:pointer-events-auto after:absolute after:-inset-1 after:content-[''] hover:bg-danger/10 hover:text-danger active:scale-90"
            title="Delete widget"
            aria-label="Delete widget"
          >
            <FiX size={15} />
          </button>
        </div>
      </div>
      {!collapsed && (
        <div
          className="min-h-0 flex-1 overflow-hidden p-3"
          onPointerDown={handleHoldPointerDown}
          onPointerMove={handleHoldPointerMove}
          onPointerUp={handleHoldPointerUp}
          onPointerCancel={handleHoldPointerUp}
          onLostPointerCapture={clearHoldTimer}
        >
          <Suspense
            fallback={
              <div className="flex flex-col gap-2" aria-hidden="true">
                <div className="skeleton h-3 w-3/4 rounded" />
                <div className="skeleton h-3 w-1/2 rounded" />
                <div className="skeleton h-3 w-2/3 rounded" />
              </div>
            }
          >
            <WidgetComponent
              config={config}
              onConfigChange={handleConfigChangeWrapped}
              widgetId={id}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
});