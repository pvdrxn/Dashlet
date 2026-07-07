import type { WidgetData, Position } from '../widgets/types';

const BASE = import.meta.env.PROD
  ? 'http://localhost:3001/api/v1/widgets'
  : '/api/v1/widgets';

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

export async function fetchWidgets(): Promise<WidgetData[]> {
  return request<WidgetData[]>(BASE);
}

export async function createWidget(type: string, config?: Record<string, unknown>): Promise<WidgetData> {
  return request<WidgetData>(BASE, {
    method: 'POST',
    body: JSON.stringify({ type, config }),
  });
}

export async function updateWidget(
  id: string,
  data: { config?: Record<string, unknown>; position?: Position; zIndex?: number },
): Promise<WidgetData> {
  return request<WidgetData>(`${BASE}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteWidget(id: string): Promise<void> {
  return request<void>(`${BASE}/${id}`, { method: 'DELETE' });
}
