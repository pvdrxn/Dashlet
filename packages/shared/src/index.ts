export interface Position {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WidgetDto {
  id: string;
  userId: string;
  type: string;
  config: Record<string, unknown>;
  position: Position;
  zIndex: number;
}

export interface CreateWidgetDto {
  type: string;
  config?: Record<string, unknown>;
  position?: Position;
}

export interface UpdateWidgetDto {
  config?: Record<string, unknown>;
  position?: Position;
  zIndex?: number;
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

export type WidgetType = 'todo-list' | 'pomodoro' | 'notes' | 'calculator' | 'habit-tracker' | 'diary';

export const WIDGET_TYPES: WidgetType[] = ['todo-list', 'pomodoro', 'notes', 'calculator', 'habit-tracker', 'diary'];
