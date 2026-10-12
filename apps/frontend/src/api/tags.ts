import type { CreateTagDto, TagDto, UpdateTagDto } from '@widget-master/shared';

const BASE = import.meta.env.PROD
  ? 'http://localhost:3001/api/v1/calendar/tags'
  : '/api/v1/calendar/tags';

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
 * Todas las etiquetas con su cuenta de bloques.
 *
 * Es la unica lectura del vocabulario: la fila de filtro la dibuja entera y el
 * editor resuelve los `tagIds` de cada bloque contra esta misma lista, asi que
 * no hace falta volver a pegarle al servidor.
 */
export async function fetchTags(): Promise<TagDto[]> {
  return request<TagDto[]>(BASE);
}

export async function createTag(dto: CreateTagDto): Promise<TagDto> {
  return request<TagDto>(BASE, {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

/**
 * Renombra o repinta UNA vez, para todos los bloques que usan la etiqueta.
 */
export async function updateTag(id: string, dto: UpdateTagDto): Promise<TagDto> {
  return request<TagDto>(`${BASE}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(dto),
  });
}

/** Borra la etiqueta. Los bloques quedan, solo pierden la etiqueta. */
export async function deleteTag(id: string): Promise<{ id: string }> {
  return request<{ id: string }>(`${BASE}/${id}`, { method: 'DELETE' });
}