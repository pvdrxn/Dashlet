import type {
  CalendarEventDto,
  CreateCalendarEventDto,
  UpdateCalendarEventDto,
} from '@widget-master/shared';

const BASE = import.meta.env.PROD
  ? 'http://localhost:3001/api/v1/calendar/events'
  : '/api/v1/calendar/events';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }
  return res.json();
}

/**
 * Eventos de un rango de dias, INCLUSIVE. `from` y `to` son `YYYY-MM-DD`.
 *
 * Es la unica lectura que hace la vista: la grilla del mes pide el mes entero
 * y lo recibe en una query. Por eso no hay un `fetchEvent(id)`: la vista siempre
 * trabaja contra un rango ya cargado.
 */
export async function fetchEvents(from: string, to: string): Promise<CalendarEventDto[]> {
  const query = `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  return request<CalendarEventDto[]>(`${BASE}${query}`);
}

export async function createEvent(dto: CreateCalendarEventDto): Promise<CalendarEventDto> {
  return request<CalendarEventDto>(BASE, {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

export async function updateEvent(
  id: string,
  dto: UpdateCalendarEventDto,
): Promise<CalendarEventDto> {
  return request<CalendarEventDto>(`${BASE}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(dto),
  });
}

export async function deleteEvent(id: string): Promise<CalendarEventDto> {
  return request<CalendarEventDto>(`${BASE}/${id}`, { method: 'DELETE' });
}
