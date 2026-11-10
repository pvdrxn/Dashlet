import { useState, useEffect, useLayoutEffect, useCallback, useRef, memo } from 'react';
import {
  FiGrid,
  FiCalendar,
  FiTable,
  FiTrash2,
  FiSettings,
  FiLayers,
  FiBarChart2,
} from 'react-icons/fi';
import {
  VscChromeMinimize,
  VscChromeMaximize,
  VscChromeRestore,
  VscChromeClose,
} from 'react-icons/vsc';
import { useTranslation } from 'react-i18next';
import type { ViewId } from '../views';

export interface HubHeaderProps {
  activeView: ViewId;
  onSelectView: (view: ViewId) => void;
  onOpenSettings: () => void;
  onOpenTrash: () => void;
  trashOpen: boolean;
}

export const HubHeader = memo(function HubHeader({
  activeView,
  onSelectView,
  onOpenSettings,
  onOpenTrash,
  trashOpen,
}: HubHeaderProps) {
  const { t } = useTranslation();
  const [isMaximized, setIsMaximized] = useState(() => {
    return window.electronAPI?.isMaximized?.() ?? false;
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number; ready: boolean }>({
    left: 0,
    width: 0,
    ready: false,
  });
  const [animate, setAnimate] = useState(false);

  const updateIndicator = useCallback(() => {
    if (!containerRef.current || trashOpen) {
      setIndicator((prev) => (prev.ready ? { ...prev, ready: false } : prev));
      return;
    }
    const targetId = activeView === 'widgets' ? 'dashboard' : activeView;
    const activeEl = containerRef.current.querySelector(
      `[data-view-id="${targetId}"]`,
    ) as HTMLElement | null;
    if (!activeEl) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const activeRect = activeEl.getBoundingClientRect();
    setIndicator({
      left: activeRect.left - containerRect.left,
      width: activeRect.width,
      ready: true,
    });
  }, [activeView, trashOpen]);

  useLayoutEffect(() => {
    updateIndicator();
    const timer = setTimeout(() => setAnimate(true), 50);
    return () => clearTimeout(timer);
  }, [updateIndicator]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateIndicator);
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateIndicator]);

  useEffect(() => {
    const unsub = window.electronAPI?.onMaximizeChanged?.((max) => {
      setIsMaximized(max);
    });
    return () => {
      unsub?.();
    };
  }, []);

  const viewItems = [
    { id: 'dashboard' as const, label: t('sidebar.dashboard.label', 'Dashboard'), icon: FiGrid },
    { id: 'calendar' as const, label: t('sidebar.calendar.label', 'Calendario'), icon: FiCalendar },
    { id: 'table' as const, label: t('sidebar.table.label', 'Tablas'), icon: FiTable },
    { id: 'stats' as const, label: t('sidebar.stats.label', 'Estadísticas'), icon: FiBarChart2 },
  ];

  return (
    <header className="relative flex h-11 w-full shrink-0 items-center justify-between border-b border-[#232B3B] bg-[#141A26]/90 px-3 select-none backdrop-blur-xl z-[var(--z-sticky)] app-region-drag">
      {/* Left: Brand */}
      <div className="flex items-center gap-2 app-region-no-drag">
        <div
          className="flex items-center gap-2 cursor-pointer group"
          onClick={() => onSelectView('dashboard')}
          title="Dashlet"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#232B3B] bg-[#1C2436] text-[#FFC20D] shadow-[0_0_10px_rgba(255,194,13,0.15)]">
            <FiLayers size={14} />
          </div>
          <span className="font-semibold text-xs tracking-wider text-[#DCE4EC] uppercase">
            Dashlet
          </span>
        </div>
      </div>

      {/* Center: View Switcher Segmented Control */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center app-region-no-drag pointer-events-auto">
        <div
          ref={containerRef}
          className="relative flex items-center rounded-lg border border-[#232B3B] bg-[#0D111A]/80 p-0.5 shadow-inner"
        >
          {/* Animated sliding indicator pill */}
          <span
            aria-hidden="true"
            style={{
              transform: `translateX(${indicator.left}px)`,
              width: `${indicator.width}px`,
            }}
            className={`absolute top-0.5 bottom-0.5 left-0 rounded-md bg-[#FFC20D] shadow-sm pointer-events-none z-0 ${
              indicator.ready ? 'opacity-100' : 'opacity-0'
            } ${animate ? 'transition-all duration-300 ease-[cubic-bezier(0.34,1.4,0.64,1)]' : ''}`}
          />

          {viewItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              (activeView === item.id || (activeView === 'widgets' && item.id === 'dashboard')) &&
              !trashOpen;
            return (
              <button
                key={item.id}
                data-view-id={item.id}
                type="button"
                onClick={() => onSelectView(item.id)}
                className={`relative z-10 flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors duration-200 ${
                  isActive
                    ? 'text-[#0D111A] font-semibold'
                    : 'text-[#8B9BB0] hover:text-[#DCE4EC] hover:bg-[#1C2436]'
                }`}
              >
                <Icon
                  size={12}
                  className={`transition-colors duration-200 ${
                    isActive ? 'text-[#0D111A]' : 'text-[#8B9BB0]'
                  }`}
                />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: Utilities & Window Controls */}
      <div className="flex items-center gap-1.5 shrink-0 app-region-no-drag ml-auto">
        {/* Trash Window Trigger */}
        <button
          type="button"
          onClick={onOpenTrash}
          className={`flex h-7 w-7 items-center justify-center rounded-lg border transition-all cursor-pointer ${
            trashOpen
              ? 'border-[#FFC20D]/40 bg-[#FFC20D]/15 text-[#FFC20D]'
              : 'border-[#232B3B] bg-[#1C2436] text-[#8B9BB0] hover:text-[#DCE4EC] hover:bg-[#232B3B]'
          }`}
          title={t('trash.title', 'Papelera')}
          aria-label={t('trash.title', 'Papelera')}
        >
          <FiTrash2 size={13} />
        </button>

        {/* Settings Modal Trigger */}
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#232B3B] bg-[#1C2436] text-[#8B9BB0] hover:text-[#DCE4EC] hover:bg-[#232B3B] transition-all cursor-pointer"
          title={t('settings.title', 'Ajustes')}
          aria-label={t('settings.title', 'Ajustes')}
        >
          <FiSettings size={13} />
        </button>

        {/* Window Controls (Minimize, Maximize/Restore, Close) */}
        <div className="flex items-center gap-0.5 ml-1.5 pl-2 border-l border-[#232B3B]">
          <button
            type="button"
            onClick={() => window.electronAPI?.minimize?.()}
            className="flex h-7 w-7 items-center justify-center rounded text-[#8B9BB0] hover:text-[#DCE4EC] hover:bg-[#1C2436] transition-colors cursor-pointer"
            title={t('window.minimize', 'Minimizar')}
            aria-label={t('window.minimize', 'Minimizar')}
          >
            <VscChromeMinimize size={13} />
          </button>
          <button
            type="button"
            onClick={() => window.electronAPI?.maximize?.()}
            className="flex h-7 w-7 items-center justify-center rounded text-[#8B9BB0] hover:text-[#DCE4EC] hover:bg-[#1C2436] transition-colors cursor-pointer"
            title={isMaximized ? t('window.restore', 'Restaurar') : t('window.maximize', 'Maximizar')}
            aria-label={isMaximized ? t('window.restore', 'Restaurar') : t('window.maximize', 'Maximizar')}
          >
            {isMaximized ? <VscChromeRestore size={12} /> : <VscChromeMaximize size={12} />}
          </button>
          <button
            type="button"
            onClick={() => window.electronAPI?.close?.(true)}
            className="flex h-7 w-7 items-center justify-center rounded text-[#8B9BB0] hover:text-white hover:bg-red-500/80 transition-colors cursor-pointer"
            title={t('window.close', 'Cerrar')}
            aria-label={t('window.close', 'Cerrar')}
          >
            <VscChromeClose size={13} />
          </button>
        </div>
      </div>
    </header>
  );
});
