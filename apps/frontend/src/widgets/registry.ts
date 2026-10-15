import type { ComponentType } from 'react';
import type { ComponentType as WidgetComponentType } from './types';

export interface CollapsedSummary {
  /** Lo que se lee de un vistazo: "3/5", "24:31", "180 palabras". */
  value: string;
  /** Texto chico que acompana al valor. */
  detail?: string;
  /**
   * Se dibuja ANTES del valor y mas apagado: es la pregunta que termina en el
   * valor, no el dato en si. Lo usa la calculadora, que muestra "2 + 2 =" al
   * lado del "4".
   */
  formula?: string;
  /**
   * Progreso. `total` es SIEMPRE el total, nunca lo que falta: si fuera lo
   * pendiente, con 2 hechas y 3 pendientes la barra se veria al 67% cuando vas
   * al 40%. El `/` y la barra comparten denominador.
   */
  bar?: { done: number; total: number };
  /**
   * Objetivo, al lado del valor y mas apagado: "10:00". Solo lo usa el stopwatch,
   * que cuenta hacia arriba y necesita a mano el tiempo que se le puso como
   * referencia -- el estimado de la tarea vinculada.
   */
  target?: string;
  /** Anillo de avance. Lo usa el pomodoro; el resto muestra barra. */
  ring?: { done: number; total: number };
  tone?: 'neutral' | 'p2' | 'p3';
}

export interface CollapsedAction {
  /** Texto del tooltip y del `aria-label`. */
  label: string;
  onSelect: () => void;
  /** El boton se pinta en el tono del widget: el color ya dice "esta corriendo". */
  tone?: 'neutral' | 'p2';
}

/**
 * Boton de la barra del widget, al lado del de retraer.
 *
 * Solo icono: la barra es de 25px y el texto no entra. Va como funcion y no
 * como config porque la accion necesita hacer algo --y lo unico que tiene el
 * frame a mano es el `config`, nunca el estado del widget--.
 */
export interface HeaderAction {
  /** Texto del tooltip y del `aria-label`. */
  label: string;
  icon: ComponentType<{ size?: number }>;
  onSelect: () => void;
}

export interface WidgetDefinition {
  component: WidgetComponentType;
  label: string;
  icon: ComponentType<{ size?: number }>;
  defaultConfig: Record<string, unknown>;
  // El dashboard es una grilla de celdas de tamano fijo, asi que el widget no
  // tiene un tamano propio: no hay defaultSize ni minSize que mantener aca.
  /**
   * Que muestra el widget retraido. Funcion pura sobre el config: nada se
   * monta, el cuerpo retraido sigue desmontado.
   */
  collapsedSummary?: (config: Record<string, unknown>) => CollapsedSummary | null;
  /**
   * Botonera del readout retraido.
   *
   * Va aparte de `collapsedSummary` porque ese es una funcion PURA: no puede
   * tener un callback adentro. Esto si lo tiene, asi que el readout colapsado
   * deja de ser "nada se monta" en el sentido estricto: el boton vive en el
   * frame y actua contra el modulo, no contra un componente.
   *
   * Se pasa el `widgetId` porque la accion suele ser la del widget sobre si
   * mismo, y la necesita para que el reloj o la lista sepan a quien obedecer.
   */
  collapsedActions?: (widgetId: string, config: Record<string, unknown>) => CollapsedAction[];
  /**
   * Boton propio del widget en la barra de arriba, al lado del de retraer.
   *
   * `null` cuando todavia no se puede usar --la tabla que aun no creo su
   * `tableId`-- y la accion desaparece en vez de fallar.
   */
  headerAction?: (widgetId: string, config: Record<string, unknown>) => HeaderAction | null;
  /**
   * El widget publica estado que avanza solo, asi que su readout tiene que
   * seguirlo en vivo en vez de leer el config congelado. Hoy solo el pomodoro.
   */
  live?: boolean;
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
