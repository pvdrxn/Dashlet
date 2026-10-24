import type { WidgetData, Position } from '../widgets/types';
import { request } from './request';

const BASE = import.meta.env.PROD ? 'http://localhost:3001/api/v1/widgets' : '/api/v1/widgets';

export async function fetchWidgets(tabId?: string): Promise<WidgetData[]> {
  const query = tabId ? `?tabId=${encodeURIComponent(tabId)}` : '';
  return request<WidgetData[]>(`${BASE}${query}`);
}

export async function createWidget(
  type: string,
  config?: Record<string, unknown>,
  position?: Position,
  tabId?: string,
): Promise<WidgetData> {
  return request<WidgetData>(BASE, {
    method: 'POST',
    body: JSON.stringify({ type, tabId, config, position }),
  });
}

export async function updateWidget(
  id: string,
  data: {
    config?: Record<string, unknown>;
    position?: Position;
    zIndex?: number;
    tabId?: string | null;
  },
): Promise<WidgetData> {
  return request<WidgetData>(`${BASE}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteWidget(id: string): Promise<WidgetData> {
  return request<WidgetData>(`${BASE}/${id}`, { method: 'DELETE' });
}

export async function fetchTrashedWidgets(): Promise<WidgetData[]> {
  return request<WidgetData[]>(`${BASE}/trash`);
}

export async function restoreWidget(id: string): Promise<WidgetData> {
  return request<WidgetData>(`${BASE}/${id}/restore`, { method: 'POST' });
}

export async function deleteWidgetForever(id: string): Promise<void> {
  return request<void>(`${BASE}/${id}/forever`, { method: 'DELETE' });
}
