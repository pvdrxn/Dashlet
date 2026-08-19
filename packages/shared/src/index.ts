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
