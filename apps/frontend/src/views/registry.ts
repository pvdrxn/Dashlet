import type { ComponentType } from 'react';

/*
 * Registro de vistas de nivel superior.
 *
 * Es el paralelo de `widgets/registry.ts`, pero para las superficies grandes de
 * la app. Lo que hay hoy:
 *
 *   - la vista de widgets, que es el dashboard de siempre (la de `App.tsx`)
 *   - la vista de calendario, con meses y bloques por hora
 *   - la vista de tabla, con columnas que define el usuario y filas que edita
 *
 * La diferencia con un widget no es el tamano: es que la vista no vive dentro
 * de la grilla de 80px, no se arrastra, no se redimensiona y no compite por
 * celdas. Por eso tiene su propia entrada y no se registra como widget.
 *
 * El id es lo que se persiste en `localStorage` (`dashlet-active-view`), asi
 * que no se renombra: renombrar la etiqueta es libre, cambiar el string del id
 * rompe la preferencia guardada de quien ya la tenga.
 */

export type ViewId = 'widgets' | 'calendar' | 'table';

export interface ViewDefinition {
  id: ViewId;
  /** Lo que dice el sidebar. */
  label: string;
  /** Subtitulo del sidebar: que se ve cuando se entra. */
  description: string;
  icon: ComponentType<{ size?: number }>;
}

const registry = new Map<ViewId, ViewDefinition>();

export function registerView(def: ViewDefinition) {
  registry.set(def.id, def);
}

export function getView(id: ViewId): ViewDefinition | undefined {
  return registry.get(id);
}

export function getAllViews(): ViewDefinition[] {
  return Array.from(registry.values());
}
