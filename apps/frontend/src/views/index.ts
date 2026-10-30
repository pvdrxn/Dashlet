import { lazy } from 'react';
import { FiGrid } from 'react-icons/fi';
import { LuCalendar } from 'react-icons/lu';
import { LuTable2 } from 'react-icons/lu';
import { registerView } from './registry';

const CalendarView = lazy(() =>
  import('./calendar/CalendarView').then((m) => ({ default: m.CalendarView })),
);

const TableView = lazy(() =>
  import('./table/TableView').then((m) => ({ default: m.TableView })),
);

const SettingsView = lazy(() =>
  import('./SettingsView').then((m) => ({ default: m.SettingsView })),
);

export { CalendarView, TableView, SettingsView };
export type { ViewId, ViewDefinition } from './registry';
export { getView, getAllViews } from './registry';

registerView({
  id: 'widgets',
  label: 'Widget View',
  icon: FiGrid,
  description: 'Panel principal de widgets',
});

registerView({
  id: 'calendar',
  label: 'Calendar View',
  icon: LuCalendar,
  description: 'Vista de agenda y bloques horarios',
});

registerView({
  id: 'table',
  label: 'Table View',
  icon: LuTable2,
  description: 'Vista tabular y gestión de datos',
});
