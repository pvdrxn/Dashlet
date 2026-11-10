import { memo } from 'react';
import {
  FiGrid,
  FiCalendar,
  FiTable,
  FiTrash2,
  FiSettings,
  FiBarChart2,
} from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import type { ViewId } from '../views';

export interface FloatingSidebarProps {
  activeViewId: ViewId;
  onSelectView: (id: ViewId) => void;
  onOpenSettings: () => void;
  onOpenTrash: () => void;
  trashOpen?: boolean;
}

export const FloatingSidebar = memo(function FloatingSidebar({
  activeViewId,
  onSelectView,
  onOpenSettings,
  onOpenTrash,
  trashOpen = false,
}: FloatingSidebarProps) {
  const { t } = useTranslation();

  const isDashboardActive =
    (activeViewId === 'dashboard' || activeViewId === 'widgets') && !trashOpen;
  const isCalendarActive = activeViewId === 'calendar' && !trashOpen;
  const isTableActive = activeViewId === 'table' && !trashOpen;
  const isStatsActive = activeViewId === 'stats' && !trashOpen;

  const views = [
    {
      id: 'dashboard' as const,
      label: t('sidebar.dashboard.label', 'Dashboard'),
      icon: FiGrid,
      isActive: isDashboardActive,
    },
    {
      id: 'calendar' as const,
      label: t('sidebar.calendar.label', 'Calendario'),
      icon: FiCalendar,
      isActive: isCalendarActive,
    },
    {
      id: 'table' as const,
      label: t('sidebar.table.label', 'Tablas'),
      icon: FiTable,
      isActive: isTableActive,
    },
    {
      id: 'stats' as const,
      label: t('sidebar.stats.label', 'Estadísticas'),
      icon: FiBarChart2,
      isActive: isStatsActive,
    },
  ];

  return (
    <aside
      aria-label={t('sidebar.title', 'Navegación principal')}
      className="fixed left-6 top-6 z-40 flex w-16 flex-col items-center gap-3 rounded-full border border-[#232B3B] bg-[#141A26] py-4 px-2.5 shadow-[0_12px_32px_rgba(0,0,0,0.6)] select-none app-region-no-drag"
    >
      {/* Top: Circular Logo Badge */}
      <button
        type="button"
        onClick={() => onSelectView('dashboard')}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FFC20D] text-[#0D111A] font-bold text-lg leading-none shadow-[0_0_16px_rgba(255,194,13,0.35)] hover:bg-[#E6AD05] transition-all duration-200 cursor-pointer"
        title="Dashlet"
        aria-label="Dashlet"
      >
        D
      </button>

      {/* Top Divider */}
      <div className="w-6 h-px bg-[#232B3B] shrink-0" aria-hidden="true" />

      {/* Main Views Stack */}
      <nav className="flex flex-col items-center gap-2 w-full shrink-0">
        {views.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectView(item.id)}
              className={`flex h-11 w-11 items-center justify-center rounded-full transition-all duration-200 cursor-pointer ${
                item.isActive
                  ? 'bg-[#FFC20D] text-[#0D111A] shadow-[0_0_16px_rgba(255,194,13,0.35)]'
                  : 'text-[#8B9BB0] hover:text-[#DCE4EC] hover:bg-[#1C2436]'
              }`}
              title={item.label}
              aria-label={item.label}
            >
              <Icon size={19} />
            </button>
          );
        })}
      </nav>

      {/* Bottom Divider */}
      <div className="w-6 h-px bg-[#232B3B] shrink-0" aria-hidden="true" />

      {/* Bottom Utilities Stack */}
      <div className="flex flex-col items-center gap-2 w-full shrink-0">
        {/* Trash */}
        <button
          type="button"
          onClick={onOpenTrash}
          className={`flex h-11 w-11 items-center justify-center rounded-full transition-all duration-200 cursor-pointer ${
            trashOpen
              ? 'bg-[#FFC20D] text-[#0D111A] shadow-[0_0_16px_rgba(255,194,13,0.35)]'
              : 'text-[#8B9BB0] hover:text-[#DCE4EC] hover:bg-[#1C2436]'
          }`}
          title={t('trash.title', 'Papelera')}
          aria-label={t('trash.title', 'Papelera')}
        >
          <FiTrash2 size={18} />
        </button>

        {/* Settings */}
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex h-11 w-11 items-center justify-center rounded-full text-[#8B9BB0] hover:text-[#DCE4EC] hover:bg-[#1C2436] transition-all duration-200 cursor-pointer"
          title={t('settings.title', 'Ajustes')}
          aria-label={t('settings.title', 'Ajustes')}
        >
          <FiSettings size={18} />
        </button>
      </div>
    </aside>
  );
});

export default FloatingSidebar;
