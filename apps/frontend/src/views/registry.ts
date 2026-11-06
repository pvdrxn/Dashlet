import type { ComponentType } from 'react';

/*
 * Registro de vistas de nivel superior.
 *
 * - dashboard: Vista unificada de herramientas y analíticas
 * - calendar: Vista de agenda y bloques horarios
 * - table: Vista tabular y gestión de datos dinámicos
 * - stats: Métricas de productividad y hábitos
 */

export type ViewId = 'dashboard' | 'calendar' | 'table' | 'stats' | 'widgets';

export interface ViewDefinition {
  id: ViewId;
  label: string;
  description: string;
  icon: ComponentType<{ size?: number }>;
}

const registry = new Map<ViewId, ViewDefinition>();

export function registerView(def: ViewDefinition) {
  registry.set(def.id, def);
}

export function getView(id: ViewId): ViewDefinition | undefined {
  if (id === 'widgets') return registry.get('dashboard');
  return registry.get(id);
}

export function getAllViews(): ViewDefinition[] {
  return Array.from(registry.values());
}
