import { lazy } from 'react';
import { FiGrid, FiBarChart2 } from 'react-icons/fi';
import { LuCalendar, LuTable2 } from 'react-icons/lu';
import { registerView } from './registry';
import { DashboardView } from './dashboard/DashboardView';
import { CalendarView } from './calendar/CalendarView';
import { TableView } from './table/TableView';
import { SettingsView } from './SettingsView';

export const InsightsView = lazy(() =>
  import('./stats/InsightsView').then((m) => ({ default: m.InsightsView })),
);

export { DashboardView, CalendarView, TableView, SettingsView };
export type { ViewId, ViewDefinition } from './registry';
export { getView, getAllViews } from './registry';

registerView({
  id: 'dashboard',
  label: 'Dashboard',
  icon: FiGrid,
  description: 'Panel unificado de herramientas y analíticas',
});

registerView({
  id: 'calendar',
  label: 'Calendario',
  icon: LuCalendar,
  description: 'Vista de agenda y bloques horarios',
});

registerView({
  id: 'table',
  label: 'Tablas',
  icon: LuTable2,
  description: 'Vista tabular y gestión de datos',
});

registerView({
  id: 'stats',
  label: 'Estadísticas',
  icon: FiBarChart2,
  description: 'Métricas de productividad y hábitos',
});
