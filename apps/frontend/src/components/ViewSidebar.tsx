import { useEffect, useState } from 'react';
import { FiSettings, FiSun, FiMoon } from 'react-icons/fi';
import { getAllViews, type ViewId } from '../views';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getInitialTheme, applyTheme, type Theme } from '../theme';

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
  activeViewId?: ViewId;
  onSelect: (id: ViewId) => void;
  onClose: () => void;
}

export function ViewSidebar({ open, activeViewId, onSelect, onClose }: ViewSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const isSettings = location.pathname === '/settings';
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    const handleThemeChange = (e: Event) => {
      const custom = e as CustomEvent<Theme>;
      if (custom.detail) setTheme(custom.detail);
    };
    window.addEventListener('dashlet-theme-change', handleThemeChange);
    return () => window.removeEventListener('dashlet-theme-change', handleThemeChange);
  }, []);

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  };

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
        aria-label={t('sidebar.title', 'Views')}
        className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-gray-700/60 bg-gray-800 shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-gray-700/60 px-4 py-3">
          <h2 className="text-sm font-medium text-white">{t('sidebar.title', 'Views')}</h2>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
              className="flex h-7 w-7 items-center justify-center rounded text-gray-400 transition-colors hover:bg-white/5 hover:text-amber-400"
            >
              {theme === 'dark' ? <FiSun size={15} /> : <FiMoon size={15} />}
            </button>

          </div>
        </header>

        <nav className="flex flex-col gap-1 p-2 flex-1 overflow-y-auto">
          {getAllViews().map((view) => {
            const isActive = !isSettings && view.id === activeViewId;
            const label = t(`sidebar.${view.id}.label`, view.label);
            const description = t(`sidebar.${view.id}.desc`, view.description);

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
                  <span className="truncate text-sm font-medium">{label}</span>
                  <span className="truncate text-xs text-gray-500">{description}</span>
                </span>
              </button>
            );
          })}
        </nav>

        {/* Settings button at bottom */}
        <div className="border-t border-gray-700/60 p-2">
          <button
            type="button"
            aria-current={isSettings ? 'page' : undefined}
            onClick={() => {
              onClose();
              if (!isSettings) {
                navigate('/settings');
              }
            }}
            className={`flex items-center gap-3 w-full rounded px-3 py-2.5 text-left transition-colors ${
              isSettings
                ? 'bg-p2/10 text-white'
                : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
            }`}
          >
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded ${
                isSettings ? 'bg-p2/15 text-p2' : 'bg-gray-700/80 text-gray-300'
              }`}
            >
              <FiSettings size={14} />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">{t('common.settings', 'Settings')}</span>
              <span className="truncate text-xs text-gray-500">{t('common.settingsDesc', 'Account & preferences')}</span>
            </span>
          </button>
        </div>
      </aside>
    </div>
  );
}
