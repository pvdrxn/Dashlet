import { useState, useRef, useCallback, useEffect, memo } from 'react';
import {
  FiPlus,
  FiGrid,
  FiCalendar,
  FiTable,
  FiTrash2,
  FiChevronUp,
  FiChevronLeft,
  FiMoreHorizontal,
  FiMoreVertical,
} from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { createRoot, type Root } from 'react-dom/client';
import type { TabDto } from '@widget-master/shared';
import type { ViewId } from '../views';
import type { Position } from '../widgets/types';
import { getAllWidgets } from '../widgets/registry';
import { setPendingWidgetType, WIDGET_DRAG_MIME } from '../widgets/drag-session';
import { clampButtonPosition } from './floating-utils';

export function getDockOrientation(pos: { x: number; y: number }): 'horizontal' | 'vertical' {
  const windowW = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const windowH = typeof window !== 'undefined' ? window.innerHeight : 800;

  const distTop = Math.max(0, pos.y);
  const distBottom = Math.max(0, windowH - (pos.y + 48));
  const distLeft = Math.max(0, pos.x);
  const distRight = Math.max(0, windowW - (pos.x + 48));

  const minVertical = Math.min(distTop, distBottom);
  const minHorizontal = Math.min(distLeft, distRight);

  // Borde superior o inferior -> horizontal (se expande a la derecha)
  // Borde izquierdo o derecho -> vertical (se expande hacia abajo)
  return minVertical < minHorizontal ? 'horizontal' : 'vertical';
}

export interface GlassSidebarProps {
  activeView: ViewId;
  onSelectView: (view: ViewId) => void;
  trashOpen: boolean;
  onOpenTrash: () => void;
  onCloseTrash: () => void;
  onAddWidget: (type: string) => Promise<Position | null>;
  onAddWidgetDeferred: (type: string) => Promise<Position | null>;
  onPredictAdd: (type: string) => Position | null;
  onRevealWidgets: () => void;
  tabs?: TabDto[];
  activeTabId?: string | null;
  onSelectTab?: (id: string) => void;
  onCreateTab?: () => void;
}

interface SidebarItem {
  id: 'add-widget' | 'widgets' | 'calendar' | 'table' | 'trash';
  label: string;
  icon: typeof FiGrid;
}

const ITEMS: SidebarItem[] = [
  { id: 'add-widget', label: 'Agregar widget', icon: FiPlus },
  { id: 'widgets', label: 'Widgets', icon: FiGrid },
  { id: 'calendar', label: 'Calendario', icon: FiCalendar },
  { id: 'table', label: 'Tablas', icon: FiTable },
  { id: 'trash', label: 'Papelera', icon: FiTrash2 },
];

export const GlassSidebar = memo(function GlassSidebar({
  activeView,
  onSelectView,
  trashOpen,
  onOpenTrash,
  onCloseTrash,
  onAddWidget,
  onAddWidgetDeferred,
  onPredictAdd,
  onRevealWidgets,
}: GlassSidebarProps) {
  const { t } = useTranslation();
  const availableWidgets = getAllWidgets();

  // Estado colapsado hacia arriba (cuando true, solo queda un botón redondo)
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('dashlet-sidebar-collapsed') === 'true';
  });

  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [draggingType, setDraggingType] = useState<string | null>(null);

  // Animación de colapso / expansión
  const [isClosing, setIsClosing] = useState(false);
  const collapseTimeoutRef = useRef<number | null>(null);

  // Posición del dock flotante
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    const saved = localStorage.getItem('dashlet-sidebar-pos') || localStorage.getItem('dashlet-dock-pos');
    if (saved) {
      try {
        return clampButtonPosition(JSON.parse(saved));
      } catch {}
    }
    return clampButtonPosition({ x: 20, y: 50 });
  });
  const posRef = useRef(pos);
  posRef.current = pos;

  // Orientación (horizontal = expande a derecha, vertical = expande hacia abajo).
  // Se fija en estado para que NO cambie mientras se arrastra, sino únicamente al soltarlo.
  const [orientation, setOrientation] = useState<'horizontal' | 'vertical'>(() => {
    return getDockOrientation(pos);
  });

  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ startX: number; startY: number; posX: number; posY: number } | null>(
    null,
  );
  const hasMovedRef = useRef(false);
  const ghostRef = useRef<{ el: HTMLDivElement; root: Root } | null>(null);

  const toggleCollapse = useCallback(() => {
    if (isClosing) return;

    if (isCollapsed) {
      const targetW = orientation === 'horizontal' ? 330 : 64;
      const targetH = orientation === 'horizontal' ? 64 : 330;
      setPos((currentPos) => {
        const clamped = clampButtonPosition(currentPos, targetW, targetH);
        posRef.current = clamped;
        localStorage.setItem('dashlet-sidebar-pos', JSON.stringify(clamped));
        return clamped;
      });
      setIsCollapsed(false);
      localStorage.setItem('dashlet-sidebar-collapsed', 'false');
    } else {
      setIsClosing(true);
      if (collapseTimeoutRef.current) clearTimeout(collapseTimeoutRef.current);
      collapseTimeoutRef.current = window.setTimeout(() => {
        setIsCollapsed(true);
        setIsClosing(false);
        localStorage.setItem('dashlet-sidebar-collapsed', 'true');
      }, 180);
    }
    setIsAddMenuOpen(false);
  }, [isCollapsed, isClosing, orientation]);

  useEffect(() => {
    return () => {
      if (collapseTimeoutRef.current) clearTimeout(collapseTimeoutRef.current);
    };
  }, []);

  const destroyGhost = useCallback(() => {
    setPendingWidgetType(null);
    if (ghostRef.current) {
      ghostRef.current.root.unmount();
      ghostRef.current.el.remove();
      ghostRef.current = null;
    }
  }, []);

  useEffect(() => destroyGhost, [destroyGhost]);

  // Arrastre por pantalla
  const handleDragPointerDown = (e: React.PointerEvent) => {
    // Si se hace clic en un botón de acción no arrastrar inmediatamente
    const target = e.target as HTMLElement;
    if (target.closest('button[data-no-drag]')) {
      return;
    }
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: pos.x,
      posY: pos.y,
    };
    hasMovedRef.current = false;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handleDragPointerMove = (e: React.PointerEvent) => {
    if (!dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.startX;
    const dy = e.clientY - dragStartRef.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      hasMovedRef.current = true;
      setIsDragging(true);
      const targetW = isCollapsed ? 48 : orientation === 'horizontal' ? 330 : 64;
      const targetH = isCollapsed ? 48 : orientation === 'horizontal' ? 64 : 330;
      const next = clampButtonPosition(
        {
          x: dragStartRef.current.posX + dx,
          y: dragStartRef.current.posY + dy,
        },
        targetW,
        targetH,
      );
      posRef.current = next;
      setPos(next);
    }
  };

  const handleDragPointerUp = (e: React.PointerEvent) => {
    if (dragStartRef.current) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch {}
      dragStartRef.current = null;
    }
    if (hasMovedRef.current) {
      const currentPos = posRef.current;
      // Solo conmuta la orientación al soltar el botón
      const nextOrientation = getDockOrientation(currentPos);
      setOrientation(nextOrientation);

      const targetW = isCollapsed ? 48 : nextOrientation === 'horizontal' ? 330 : 64;
      const targetH = isCollapsed ? 48 : nextOrientation === 'horizontal' ? 64 : 330;
      const finalPos = clampButtonPosition(currentPos, targetW, targetH);
      posRef.current = finalPos;
      setPos(finalPos);
      localStorage.setItem('dashlet-sidebar-pos', JSON.stringify(finalPos));
    }
    setIsDragging(false);
  };

  const notifyMouseEnter = useCallback(() => {
    window.electronAPI?.setIgnoreMouseEvents?.(false);
  }, []);

  const notifyMouseLeave = useCallback(() => {
    if (!isAddMenuOpen && !draggingType) {
      window.electronAPI?.setIgnoreMouseEvents?.(true, { forward: true });
    }
  }, [isAddMenuOpen, draggingType]);

  const handleItemClick = (id: SidebarItem['id']) => {
    if (hasMovedRef.current) return;

    if (id === 'add-widget') {
      setIsAddMenuOpen((prev) => !prev);
      return;
    }

    setIsAddMenuOpen(false);

    if (id === 'trash') {
      if (trashOpen) {
        onCloseTrash();
      } else {
        onOpenTrash();
      }
      return;
    }

    if (trashOpen) {
      onCloseTrash();
    }
    onSelectView(id);
  };

  // Determinar icono activo para el botón redondo colapsado
  const getActiveIcon = () => {
    if (trashOpen) return FiTrash2;
    if (activeView === 'calendar') return FiCalendar;
    if (activeView === 'table') return FiTable;
    return FiGrid;
  };
  const ActiveIcon = getActiveIcon();
  const isHorizontal = orientation === 'horizontal';

  return (
    <div
      className="pointer-events-auto fixed z-[var(--z-modal)] select-none"
      style={{ left: `${pos.x}px`, top: `${pos.y}px` }}
      onMouseEnter={notifyMouseEnter}
      onMouseLeave={notifyMouseLeave}
    >
      {/* 
        Estado completamente colapsado: Solo un botón redondo en pantalla
      */}
      {isCollapsed && !isClosing ? (
        <button
          type="button"
          onPointerDown={handleDragPointerDown}
          onPointerMove={handleDragPointerMove}
          onPointerUp={handleDragPointerUp}
          onClick={() => {
            if (!hasMovedRef.current) toggleCollapse();
          }}
          className={`animate-dock-round-pop group relative flex h-12 w-12 items-center justify-center rounded-full transition-transform duration-200 active:scale-95 outline-none ${
            isDragging ? 'cursor-grabbing shadow-2xl ring-1 ring-p2/50 scale-105' : 'cursor-pointer hover:scale-105'
          }`}
          style={{
            background:
              'linear-gradient(180deg, rgba(255, 255, 255, 0.10) 0%, rgba(255, 255, 255, 0.03) 100%), rgba(18, 18, 22, 0.60)',
            backdropFilter: 'blur(28px) saturate(1.8)',
            WebkitBackdropFilter: 'blur(28px) saturate(1.8)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.50)',
          }}
          title={isHorizontal ? 'Expandir barra a la derecha' : 'Expandir barra hacia abajo'}
          aria-label={isHorizontal ? 'Expandir barra a la derecha' : 'Expandir barra hacia abajo'}
        >
          {/* Icono de vista activa con acento p2 */}
          <div className="flex items-center justify-center text-p2 transition-transform duration-200 group-hover:scale-110">
            <ActiveIcon size={20} />
          </div>
        </button>
      ) : isHorizontal ? (
        /* 
          Estado expandido horizontal (bordes superior / inferior): se expande a la derecha
        */
        <div
          className={`relative isolate flex h-16 flex-row items-center rounded-3xl p-2.5 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            isClosing ? 'animate-dock-collapse-left' : 'animate-dock-expand-right'
          } ${isDragging ? 'cursor-grabbing shadow-2xl ring-1 ring-white/20' : ''}`}
          style={{
            background:
              'linear-gradient(180deg, rgba(255, 255, 255, 0.09) 0%, rgba(255, 255, 255, 0.02) 100%), rgba(18, 18, 22, 0.55)',
            backdropFilter: 'blur(28px) saturate(1.8)',
            WebkitBackdropFilter: 'blur(28px) saturate(1.8)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            boxShadow: '0 8px 40px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.10)',
          }}
        >
          {/* Asa de arrastre izquierda */}
          <div
            onPointerDown={handleDragPointerDown}
            onPointerMove={handleDragPointerMove}
            onPointerUp={handleDragPointerUp}
            className="flex h-full items-center justify-center px-1 cursor-grab active:cursor-grabbing text-white/30 hover:text-white/70 transition-colors"
            title="Arrastrar barra"
            aria-hidden="true"
          >
            <FiMoreVertical size={14} />
          </div>

          {/* Lista de botones horizontal */}
          <div className="flex h-full flex-row items-center gap-2 ml-1">
            {ITEMS.map((item) => {
              const Icon = item.icon;
              const isAdd = item.id === 'add-widget';
              const isActive = isAdd
                ? isAddMenuOpen
                : item.id === 'trash'
                  ? trashOpen
                  : !trashOpen && activeView === item.id;

              return (
                <div key={item.id} className="relative flex h-full items-center justify-center">
                  {hoveredItemId === item.id && !isAddMenuOpen && (
                    <div
                      className={`pointer-events-none absolute ${
                        pos.y > (typeof window !== 'undefined' ? window.innerHeight / 2 : 400)
                          ? 'bottom-[calc(100%+12px)]'
                          : 'top-[calc(100%+12px)]'
                      } left-1/2 -translate-x-1/2 z-50 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-semibold text-white/90 shadow-xl backdrop-blur-2xl`}
                      style={{
                        background:
                          'linear-gradient(180deg, rgba(255, 255, 255, 0.09) 0%, rgba(255, 255, 255, 0.02) 100%), rgba(18, 18, 22, 0.75)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
                      }}
                    >
                      {item.label}
                    </div>
                  )}

                  <button
                    type="button"
                    data-no-drag
                    onClick={() => handleItemClick(item.id)}
                    onMouseEnter={() => setHoveredItemId(item.id)}
                    onMouseLeave={() => setHoveredItemId(null)}
                    className="group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl cursor-pointer transition-all duration-200 active:scale-95 outline-none"
                    style={{
                      background: isActive
                        ? 'rgba(217, 164, 65, 0.20)'
                        : 'rgba(255, 255, 255, 0.04)',
                      border: isActive
                        ? '1px solid rgba(217, 164, 65, 0.50)'
                        : '1px solid rgba(255, 255, 255, 0.10)',
                      boxShadow: isActive
                        ? '0 0 16px rgba(217, 164, 65, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.20)'
                        : 'none',
                    }}
                    aria-label={item.label}
                  >
                    <Icon
                      size={19}
                      className={`transition-transform duration-200 ${
                        isActive
                          ? 'text-p2 scale-105'
                          : 'text-gray-400 group-hover:text-white group-hover:scale-110'
                      } ${isAdd && isAddMenuOpen ? 'rotate-45' : ''}`}
                    />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Divisor vertical */}
          <div className="mx-2 h-7 w-[1px] bg-white/10 shrink-0" />

          {/* Botón de colapso a la izquierda */}
          <div className="flex h-full items-center justify-center">
            <button
              type="button"
              data-no-drag
              onClick={toggleCollapse}
              className="flex h-11 w-8 items-center justify-center rounded-xl cursor-pointer text-gray-400 hover:text-white hover:bg-white/[0.10] active:scale-95 transition-all duration-200 outline-none"
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.10)',
              }}
              title="Colapsar hacia la izquierda"
              aria-label="Colapsar hacia la izquierda"
            >
              <FiChevronLeft size={16} />
            </button>
          </div>
        </div>
      ) : (
        /* 
          Estado expandido vertical (bordes izquierdo / derecho): se expande hacia abajo
        */
        <div
          className={`relative isolate flex w-16 flex-col items-center rounded-3xl p-2.5 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            isClosing ? 'animate-dock-collapse-up' : 'animate-dock-expand-down'
          } ${isDragging ? 'cursor-grabbing shadow-2xl ring-1 ring-white/20' : ''}`}
          style={{
            background:
              'linear-gradient(180deg, rgba(255, 255, 255, 0.09) 0%, rgba(255, 255, 255, 0.02) 100%), rgba(18, 18, 22, 0.55)',
            backdropFilter: 'blur(28px) saturate(1.8)',
            WebkitBackdropFilter: 'blur(28px) saturate(1.8)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            boxShadow: '0 8px 40px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.10)',
          }}
        >
          {/* Reflejo especular superior */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-3 right-3 top-0 z-10 h-[1px]"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.20), transparent)',
            }}
          />

          {/* Asa de arrastre superior */}
          <div
            onPointerDown={handleDragPointerDown}
            onPointerMove={handleDragPointerMove}
            onPointerUp={handleDragPointerUp}
            className="flex w-full items-center justify-center py-1 cursor-grab active:cursor-grabbing text-white/30 hover:text-white/70 transition-colors"
            title="Arrastrar barra"
            aria-hidden="true"
          >
            <FiMoreHorizontal size={14} />
          </div>

          {/* Lista de botones centrados horizontalmente */}
          <div className="flex w-full flex-col items-center gap-2 mt-1">
            {ITEMS.map((item) => {
              const Icon = item.icon;
              const isAdd = item.id === 'add-widget';
              const isActive = isAdd
                ? isAddMenuOpen
                : item.id === 'trash'
                  ? trashOpen
                  : !trashOpen && activeView === item.id;

              return (
                <div key={item.id} className="relative flex w-full items-center justify-center">
                  {hoveredItemId === item.id && !isAddMenuOpen && (
                    <div
                      className={`pointer-events-none absolute ${
                        pos.x > (typeof window !== 'undefined' ? window.innerWidth / 2 : 600)
                          ? 'right-[calc(100%+12px)]'
                          : 'left-[calc(100%+12px)]'
                      } top-1/2 -translate-y-1/2 z-50 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-semibold text-white/90 shadow-xl backdrop-blur-2xl`}
                      style={{
                        background:
                          'linear-gradient(180deg, rgba(255, 255, 255, 0.09) 0%, rgba(255, 255, 255, 0.02) 100%), rgba(18, 18, 22, 0.75)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
                      }}
                    >
                      {item.label}
                    </div>
                  )}

                  <button
                    type="button"
                    data-no-drag
                    onClick={() => handleItemClick(item.id)}
                    onMouseEnter={() => setHoveredItemId(item.id)}
                    onMouseLeave={() => setHoveredItemId(null)}
                    className="group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl cursor-pointer transition-all duration-200 active:scale-95 outline-none"
                    style={{
                      background: isActive
                        ? 'rgba(217, 164, 65, 0.20)'
                        : 'rgba(255, 255, 255, 0.04)',
                      border: isActive
                        ? '1px solid rgba(217, 164, 65, 0.50)'
                        : '1px solid rgba(255, 255, 255, 0.10)',
                      boxShadow: isActive
                        ? '0 0 16px rgba(217, 164, 65, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.20)'
                        : 'none',
                    }}
                    aria-label={item.label}
                  >
                    <Icon
                      size={19}
                      className={`transition-transform duration-200 ${
                        isActive
                          ? 'text-p2 scale-105'
                          : 'text-gray-400 group-hover:text-white group-hover:scale-110'
                      } ${isAdd && isAddMenuOpen ? 'rotate-45' : ''}`}
                    />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Divisor */}
          <div className="my-2 w-full h-[1px] bg-white/10 shrink-0" />

          {/* Botón inferior: Colapsa hacia arriba hasta convertirse en el botón redondo */}
          <div className="flex w-full items-center justify-center">
            <button
              type="button"
              data-no-drag
              onClick={toggleCollapse}
              className="flex h-8 w-11 items-center justify-center rounded-xl cursor-pointer text-gray-400 hover:text-white hover:bg-white/[0.10] active:scale-95 transition-all duration-200 outline-none"
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.10)',
              }}
              title="Colapsar hacia arriba"
              aria-label="Colapsar hacia arriba"
            >
              <FiChevronUp size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Menú flotante de widgets disponibles (al hacer clic en Agregar widget) */}
      {isAddMenuOpen && (
        <div
          className={`absolute ${
            isHorizontal
              ? pos.y > (typeof window !== 'undefined' ? window.innerHeight / 2 : 400)
                ? 'bottom-[calc(100%+14px)] left-0'
                : 'top-[calc(100%+14px)] left-0'
              : pos.x > (typeof window !== 'undefined' ? window.innerWidth / 2 : 600)
                ? 'right-[calc(100%+14px)] top-2'
                : 'left-[calc(100%+14px)] top-2'
          } flex flex-col gap-1.5 rounded-2xl p-2.5 min-w-[200px] shadow-2xl backdrop-blur-2xl z-50 animate-view-fade-in`}
          style={{
            background:
              'linear-gradient(180deg, rgba(255, 255, 255, 0.09) 0%, rgba(255, 255, 255, 0.02) 100%), rgba(18, 18, 22, 0.70)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.10)',
          }}
          onMouseEnter={notifyMouseEnter}
        >
          <div className="flex items-center justify-between mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-p2">
            <span>{t('toolbar.addWidget', 'Agregar Widget')}</span>
            <span className="text-[10px] text-white/40 lowercase">clic o arrastra</span>
          </div>

          <div className="flex flex-col gap-1 max-h-[60vh] overflow-y-auto pr-1">
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
                    <div className="flex items-center gap-2 rounded-xl border border-white/20 bg-gray-900/90 px-3 py-2 text-xs font-medium text-white shadow-2xl backdrop-blur-md">
                      <span className="text-p2"><widget.icon size={15} /></span>
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
                  setIsAddMenuOpen(false);
                  if (activeView !== 'widgets') {
                    onSelectView('widgets');
                  }
                  if (targetPos) {
                    onRevealWidgets();
                    await onAddWidgetDeferred(type);
                  } else {
                    await onAddWidget(type);
                  }
                }}
                className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs text-white/70 hover:bg-white/[0.08] hover:text-white transition-all text-left group cursor-grab active:cursor-grabbing"
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
