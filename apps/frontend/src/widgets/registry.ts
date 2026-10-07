import type { ComponentType } from 'react';
import type { ComponentType as WidgetComponentType } from './types';

export interface WidgetDefinition {
  component: WidgetComponentType;
  label: string;
  icon: ComponentType<{ size?: number }>;
  defaultConfig: Record<string, unknown>;
  // El dashboard es una grilla de celdas de tamano fijo, asi que el widget no
  // tiene un tamano propio: no hay defaultSize ni minSize que mantener aca.
}

const registry = new Map<string, WidgetDefinition>();

export function registerWidget(type: string, def: WidgetDefinition) {
  registry.set(type, def);
}

export function getWidget(type: string): WidgetDefinition | undefined {
  return registry.get(type);
}

export function getAllWidgets(): [string, WidgetDefinition][] {
  return Array.from(registry.entries());
}
