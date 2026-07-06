import type { ComponentType as ReactComponentType } from 'react';

export interface Position {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WidgetData {
  id: string;
  userId: string;
  type: string;
  config: Record<string, unknown>;
  position: Position;
  zIndex: number;
}

export type WidgetType = 'todo-list' | 'pomodoro' | 'notes' | 'calculator' | 'habit-tracker' | 'diary';

export type ComponentType = ReactComponentType<{
  config: Record<string, unknown>;
  onConfigChange: (config: Record<string, unknown>) => void;
}>;
