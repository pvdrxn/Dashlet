/**
 * Ranura (slot) del dashboard, en unidades de celda y no de pixeles.
 *
 * `x` es la columna dentro del bloque (0..BLOCK_COLS-1) e `y` es la fila
 * absoluta del dashboard. El layout es una grilla de 2 columnas: cada bloque
 * de 2x2 son dos filas consecutivas de `y`.
 *
 * No hay ancho ni alto persistido: el tamaño lo impose la celda. Ver
 * `apps/frontend/src/widgets/grid-utils.ts`.
 */
/**
 * Posicion y tamano de un widget, en celdas de la grilla (no en pixeles).
 *
 * `x`/`y` son la celda donde arranca, y `w`/`h` cuantas celdas ocupa hacia
 * derecha y hacia abajo. GRID_COLS es el ancho de la grilla; ver
 * `apps/frontend/src/widgets/grid-utils.ts`.
 */
export interface Position {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TabDto {
  id: string;
  userId: string;
  name: string;
  order: number;
  widgetCount?: number;
  deletedAt: string | null;
}

export interface CreateTabDto {
  name?: string;
}

export interface UpdateTabDto {
  name?: string;
  order?: number;
}

export interface WidgetDto {
  id: string;
  userId: string;
  tabId: string | null;
  type: string;
  config: Record<string, unknown>;
  position: Position;
  zIndex: number;
  deletedAt: string | null;
}

export interface CreateWidgetDto {
  type: string;
  tabId?: string;
  config?: Record<string, unknown>;
  position?: Position;
}

export interface UpdateWidgetDto {
  config?: Record<string, unknown>;
  position?: Position;
  zIndex?: number;
  tabId?: string | null;
}

export interface TodoListDto {
  id: string;
  userId: string;
  title: string;
  items: TodoItemDto[];
}

export interface TodoItemDto {
  id: string;
  listId: string;
  text: string;
  completed: boolean;
  order: number;
  urgency: 0 | 1 | 2 | 3;
}

export type WidgetType =
  'todo-list' | 'pomodoro' | 'notes' | 'calculator' | 'habit-tracker' | 'diary';

export const WIDGET_TYPES: WidgetType[] = [
  'todo-list',
  'pomodoro',
  'notes',
  'calculator',
  'habit-tracker',
  'diary',
];
