/*
 * Puente entre el widget de calendario y la vista completa.
 *
 * Vive en un modulo aparte, sin componentes, por la misma razon que
 * `collapsed-summaries.ts`: `index.ts` y `App.tsx` necesitan estas dos cosas, y si
 * las importaran desde `CalendarWidget.tsx` el `lazy()` del widget quedaria
 * cancelado y se bajaria en el arranque. `CalendarWidget.tsx` las reexporta.
 */

/** Llave del evento con el que el widget pide abrir la vista de calendario. */
export const OPEN_CALENDAR_EVENT = 'dashlet:open-calendar';

/**
 * Dia que el widget quiere que la vista muestre. La vista la lee y la borra.
 *
 * Escribirla en `localStorage` NO alcanza por si solo: `App.tsx` tiene la vista en
 * estado de React y no se entera. Por eso el evento. Y el evento solo tampoco: la
 * vista de calendario todavia no esta montada cuando se dispara, asi que la fecha
 * tiene que esperarla en algun sitio.
 */
export const PENDING_CALENDAR_DATE_KEY = 'dashlet-pending-calendar-date';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * "Abrir completo": deja el dia apuntado (si hay) y avisa a la app.
 *
 * Una fecha con forma rara se ignora en vez de guardarse: la vista abriria en
 * un mes que no existe.
 */
export function openCalendarView(date?: string): void {
  if (date && DATE_RE.test(date)) {
    localStorage.setItem(PENDING_CALENDAR_DATE_KEY, date);
  } else {
    localStorage.removeItem(PENDING_CALENDAR_DATE_KEY);
  }
  window.dispatchEvent(new CustomEvent(OPEN_CALENDAR_EVENT, { detail: { date } }));
}
