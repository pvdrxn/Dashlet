import type { TabDto } from '@widget-master/shared';
import { request } from './request';

const BASE = import.meta.env.PROD
  ? 'http://localhost:3001/api/v1/tabs'
  : '/api/v1/tabs';

export async function fetchTabs(): Promise<TabDto[]> {
  return request<TabDto[]>(BASE);
}

export async function fetchTrashedTabs(): Promise<TabDto[]> {
  return request<TabDto[]>(`${BASE}/trash`);
}

export async function createTab(name?: string): Promise<TabDto> {
  return request<TabDto>(BASE, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function renameTab(id: string, name: string): Promise<TabDto> {
  return request<TabDto>(`${BASE}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export async function reorderTabs(ids: string[]): Promise<{ ids: string[] }> {
  return request<{ ids: string[] }>(`${BASE}/reorder`, {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });
}

export async function deleteTab(id: string): Promise<TabDto> {
  return request<TabDto>(`${BASE}/${id}`, { method: 'DELETE' });
}

export async function restoreTab(id: string): Promise<TabDto> {
  return request<TabDto>(`${BASE}/${id}/restore`, { method: 'POST' });
}

export async function deleteTabForever(id: string): Promise<void> {
  return request<void>(`${BASE}/${id}/forever`, { method: 'DELETE' });
}