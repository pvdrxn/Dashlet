import type {
  NoteFileDto,
  NoteContentDto,
  CreateNoteDto,
  UpdateNoteDto,
} from '@widget-master/shared';
import { request } from './request';

const BASE = import.meta.env.PROD
  ? 'http://localhost:3001/api/v1/notes'
  : '/api/v1/notes';

/**
 * Lista todos los archivos de notas (.md / .txt) almacenados localmente.
 */
export async function fetchNotes(): Promise<NoteFileDto[]> {
  return request<NoteFileDto[]>(BASE);
}

/**
 * Obtiene el contenido completo de una nota específica según su nombre de archivo o ID.
 */
export async function fetchNoteContent(filename: string): Promise<NoteContentDto> {
  return request<NoteContentDto>(`${BASE}/${encodeURIComponent(filename)}`);
}

/**
 * Crea una nueva nota en el sistema de archivos local.
 */
export async function createNote(dto: CreateNoteDto): Promise<NoteContentDto> {
  return request<NoteContentDto>(BASE, {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

/**
 * Actualiza el título o contenido de una nota existente.
 */
export async function updateNote(
  filename: string,
  dto: UpdateNoteDto,
): Promise<NoteContentDto> {
  return request<NoteContentDto>(`${BASE}/${encodeURIComponent(filename)}`, {
    method: 'PATCH',
    body: JSON.stringify(dto),
  });
}

/**
 * Elimina una nota del sistema de archivos local.
 */
export async function deleteNote(filename: string): Promise<void> {
  return request<void>(`${BASE}/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
  });
}
