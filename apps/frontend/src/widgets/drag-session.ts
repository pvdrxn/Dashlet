import type { WidgetData } from './types';

export interface DragSession {
  widgetId: string;
  sourceTabId: string;
  pointerX: number;
  pointerY: number;
}

export type TransferAction =
  { type: 'insert'; widget: WidgetData } | { type: 'remove'; widgetId: string };

let session: DragSession | null = null;

export function beginDragSession(drag: Omit<DragSession, 'pointerX' | 'pointerY'>) {
  session = { ...drag, pointerX: 0, pointerY: 0 };
}

export function updateDragPointer(x: number, y: number) {
  if (session) {
    session.pointerX = x;
    session.pointerY = y;
  }
}

export function getDragSession(): DragSession | null {
  return session;
}

export function clearDragSession() {
  session = null;
}

/*
 * Arrastrar un widget NUEVO desde el menu "+" usa el DnD nativo del navegador,
 * no dnd-kit: el boton vive en el Toolbar, fuera del DndContext del grid, y el
 * ghost es un div propio en vez de un overlay de dnd-kit.
 *
 * Por eso viaja un MIME propio y no "text/plain". Durante `dragover` el
 * navegador bloquea la lectura de los datos y solo deja ver `types`, asi que
 * un tipo propio es la unica forma de distinguir este arrastre de una
 * seleccion de texto o de un archivo soltado desde el escritorio.
 */
export const WIDGET_DRAG_MIME = 'application/x-dashlet-widget';

let pendingType: string | null = null;

/*
 * El tipo solo se puede leer en `drop`. Para pintar la celda de destino durante
 * `dragover` hace falta antes, asi que viaja aparte por este modulo.
 */
export function setPendingWidgetType(type: string | null) {
  pendingType = type;
}

export function getPendingWidgetType() {
  return pendingType;
}
