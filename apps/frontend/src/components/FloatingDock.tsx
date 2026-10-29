import { useState, useRef, useCallback } from 'react';
import {
  FiGrid,
  FiTrash2,
  FiSettings,
  FiLogOut,
  FiPlus,
  FiCalendar,
  FiTable,
} from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import type { TabDto } from '@widget-master/shared';
import type { ViewId } from '../views';

import { clampButtonPosition } from './floating-utils';

interface FloatingDockProps {
  tabs: TabDto[];
  activeTabId: string | null;
  onSelectTab: (id: string) => void;
  onCreateTab: () => void;
  activeView: ViewId;
  onSelectView: (view: ViewId) => void;
  onOpenTrash: () => void;
}

export function FloatingDock({
  tabs,
  activeTabId,
  onSelectTab,
  onCreateTab,
  activeView,
  onSelectView,
  onOpenTrash,
}: FloatingDockProps) {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const navigate = useNavigate();

  // Posición del botón flotante (en píxeles)
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    const saved = localStorage.getItem('dashlet-dock-pos');
    if (saved) {
      try {
        return clampButtonPosition(JSON.parse(saved));
      } catch {}
    }
    return clampButtonPosition({ x: 24, y: 55 });
  });

  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ startX: number; startY: number; posX: number; posY: number } | null>(
    null,
  );
  const hasMovedRef = useRef(false);

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
      localStorage.setItem('dashlet-dock-pos', JSON.stringify(pos));
    } else {
      setIsOpen((prev) => !prev);
    }
    setIsDragging(false);
  };

  const notifyMouseEnter = useCallback(() => {
    window.electronAPI?.setIgnoreMouseEvents?.(false);
  }, []);

  const notifyMouseLeave = useCallback(() => {
    if (!isOpen) {
      window.electronAPI?.setIgnoreMouseEvents?.(true, { forward: true });
    }
  }, [isOpen]);

  return (
    <div
      className="pointer-events-auto fixed z-[var(--z-modal)] select-none"
      style={{ left: `${pos.x}px`, top: `${pos.y}px` }}
      onMouseEnter={notifyMouseEnter}
      onMouseLeave={notifyMouseLeave}
    >
      {/* Botón flotante arrastrable */}
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className={`flex h-12 w-12 items-center justify-center rounded-full border border-gray-600 bg-gray-800/95 text-white shadow-2xl backdrop-blur-md transition-transform duration-150 active:scale-95 ${
          isOpen ? 'border-p2 text-p2' : 'hover:border-gray-500'
        } ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        title="Dashlet Menu"
      >
        <FiGrid size={22} className={isOpen ? 'rotate-45 transition-transform' : 'transition-transform'} />
      </button>

      {/* Menú desplegable flotante */}
      {isOpen && (
        <div
          className={`absolute left-14 ${
            pos.y > window.innerHeight - 380 ? 'bottom-0' : 'top-0'
          } flex w-72 flex-col gap-3 rounded-lg border border-gray-700 bg-gray-800/95 p-3.5 shadow-2xl backdrop-blur-md`}
          onMouseEnter={notifyMouseEnter}
        >
          {/* Vistas principales */}
          <div>
            <div className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
              {t('sidebar.title', 'Views')}
            </div>
            <div className="grid grid-cols-3 gap-1">
              <button
                type="button"
                onClick={() => {
                  onSelectView('widgets');
                  setIsOpen(false);
                }}
                className={`flex flex-col items-center gap-1 rounded py-2 text-xs transition-colors ${
                  activeView === 'widgets'
                    ? 'bg-p2/15 font-medium text-p2'
                    : 'text-gray-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <FiGrid size={16} />
                <span>Widgets</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onSelectView('calendar');
                  setIsOpen(false);
                }}
                className={`flex flex-col items-center gap-1 rounded py-2 text-xs transition-colors ${
                  activeView === 'calendar'
                    ? 'bg-p2/15 font-medium text-p2'
                    : 'text-gray-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <FiCalendar size={16} />
                <span>Calendario</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onSelectView('table');
                  setIsOpen(false);
                }}
                className={`flex flex-col items-center gap-1 rounded py-2 text-xs transition-colors ${
                  activeView === 'table'
                    ? 'bg-p2/15 font-medium text-p2'
                    : 'text-gray-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <FiTable size={16} />
                <span>Tabla</span>
              </button>
            </div>
          </div>

          {/* Pestañas (Tabs) */}
          {activeView === 'widgets' && (
            <div className="border-t border-gray-700/60 pt-2">
              <div className="mb-1.5 flex items-center justify-between px-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Pestañas
                </span>
                <button
                  type="button"
                  onClick={onCreateTab}
                  className="flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-white/10 hover:text-white"
                  title="Nueva pestaña"
                >
                  <FiPlus size={14} />
                </button>
              </div>
              <div className="flex max-h-36 flex-col gap-1 overflow-y-auto pr-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      onSelectTab(tab.id);
                      setIsOpen(false);
                    }}
                    className={`flex items-center justify-between rounded px-2.5 py-1.5 text-xs text-left transition-colors ${
                      tab.id === activeTabId
                        ? 'bg-p2/15 font-medium text-p2'
                        : 'text-gray-300 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <span className="truncate">{tab.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Utilidades y Perfil */}
          <div className="flex items-center justify-between border-t border-gray-700/60 pt-2">
            <button
              type="button"
              onClick={() => {
                onOpenTrash();
                setIsOpen(false);
              }}
              className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-gray-400 hover:bg-white/5 hover:text-gray-200"
              title="Papelera"
            >
              <FiTrash2 size={14} />
              <span>Papelera</span>
            </button>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  navigate('/settings');
                }}
                className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-white/5 hover:text-white"
                title="Ajustes"
              >
                <FiSettings size={14} />
              </button>
              <button
                type="button"
                onClick={async () => {
                  setIsOpen(false);
                  await logout();
                  navigate('/login');
                }}
                className="flex h-7 w-7 items-center justify-center rounded text-danger hover:bg-danger/10"
                title="Cerrar sesión"
              >
                <FiLogOut size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
