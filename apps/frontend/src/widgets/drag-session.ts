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
