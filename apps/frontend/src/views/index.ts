import { lazy } from 'react';
import { FiGrid } from 'react-icons/fi';
import { LuCalendar } from 'react-icons/lu';
import { registerView } from './registry';

/*
 * El componente de la vista de widgets es el dashboard de siempre, que ya vive
 * en `App.tsx`. No se registra el componente en el registro: lo que el registro
 * describe es la ENTRADA del sidebar (icono, etiqueta, descripcion), y el
 * render de cada vista lo decide `App.tsx` segun el id. Meter el componente
 * aca obligaria a mover el dashboard entero adentro de un archivo que hoy es
 * el composition root de la app.
 *
 * El calendario si va con `lazy()`: es lo unico que se puede cargar acá, y es
 * exactamente el caso para el que el lazy sirve -- la mayoria de las sesiones
 * van a estar en la vista de widgets y no hay que bajar la grilla de meses.
 */
const CalendarView = lazy(() =>
  import('./calendar/CalendarView').then((m) => ({ default: m.CalendarView })),
);

export { CalendarView };
export type { ViewId, ViewDefinition } from './registry';
export { getView, getAllViews } from './registry';

registerView({
  id: 'widgets',
  label: 'Widget View',
  description: 'Your widget dashboards',
  icon: FiGrid,
});

registerView({
  id: 'calendar',
  label: 'Calendar View',
  description: 'Agenda by months and hours',
  icon: LuCalendar,
});
