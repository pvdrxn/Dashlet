import type { ComponentType as ReactComponentType, LazyExoticComponent, JSXElementConstructor } from 'react';

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

interface WidgetComponentProps {
  config: Record<string, unknown>;
  onConfigChange: (config: Record<string, unknown>) => void;
}

export type ComponentType = ReactComponentType<WidgetComponentProps> | LazyExoticComponent<JSXElementConstructor<WidgetComponentProps>>;
