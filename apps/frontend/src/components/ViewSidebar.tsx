import { useEffect } from 'react';
import { FiX } from 'react-icons/fi';
import { getAllViews, type ViewId } from '../views';

/*
 * Drawer de navegacion entre vistas.
 *
 * Se abre con el boton de la izquierda del TabBar y se cierra con Escape, con
 * el fondo o eligiendo una vista. Es un drawer y no un menu desplegable porque
 * las entradas tienen icono, etiqueta y descripcion: tres lineas por opción no
 * entran en el menu angosto del toolbar.
 *
 * El fondo es un velo y no un borde: el drawer tapa la barra de pestañas y el
 * calendario que hay detras, y sin el velo no se distingue donde termina la
 * app y donde empieza el panel.
 */

interface ViewSidebarProps {
  open: boolean;
  activeViewId: ViewId;
  onSelect: (id: ViewId) => void;
  onClose: () => void;
}

export function ViewSidebar({ open, activeViewId, onSelect, onClose }: ViewSidebarProps) {
  // Escape cierra. Va en un efecto del drawer y no en App para que el atajo
  // exista solo mientras esta abierto.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[var(--z-modal)]">
      {/* Velo. Cierra al hacer click, sin propagar al drawer de abajo. */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-[1px]"
      />
      <aside
        role="dialog"
        aria-label="Change view"
        className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-gray-700/60 bg-gray-800 shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-gray-700/60 px-4 py-3">
          <h2 className="text-sm font-medium text-white">Views</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-gray-500 transition-colors hover:text-gray-200"
          >
            <FiX size={16} />
          </button>
        </header>

        <nav className="flex flex-col gap-1 p-2">
          {getAllViews().map((view) => {
            const isActive = view.id === activeViewId;
            return (
              <button
                key={view.id}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => {
                  onSelect(view.id);
                  onClose();
                }}
                className={`flex items-center gap-3 rounded px-3 py-2.5 text-left transition-colors ${
                  isActive
                    ? 'bg-p2/10 text-white'
                    : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded ${
                    isActive ? 'bg-p2/15 text-p2' : 'bg-gray-700/80 text-gray-300'
                  }`}
                >
                  <view.icon size={14} />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{view.label}</span>
                  <span className="truncate text-xs text-gray-500">{view.description}</span>
                </span>
              </button>
            );
          })}
        </nav>
      </aside>
    </div>
  );
}
