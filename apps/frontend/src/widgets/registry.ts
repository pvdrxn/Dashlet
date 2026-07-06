import type { ComponentType, WidgetType } from './types';

interface WidgetDefinition {
  component: ComponentType;
  label: string;
  icon: string;
  defaultConfig: Record<string, unknown>;
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
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

function getRegisteredTypes(): string[] {
  return Array.from(registry.keys());
}
