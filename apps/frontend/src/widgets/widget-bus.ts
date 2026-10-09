type BusEvents = {
  'timer:start': { taskId: string; taskName: string; technique: string };
  'timer:pause': { taskId: string };
  'timer:reset': { taskId: string };
  'timer:complete': { taskId: string };
  'timer:tick': { taskId: string; elapsed: number; remaining: number };
  'task:select': { taskId: string; taskName: string; estimatedMinutes?: number; widgetId: string; targetWidgetId?: string };
  'task:deselect': Record<string, never>;
  /**
   * La tarea se renombro. Lo emite el todo-list al confirmar el nombre y el
   * pomodoro lo escucha para corregir `linkedTaskName`, que si no queda con el
   * texto del momento en que se vinculo.
   */
  'task:rename': { taskId: string; taskName: string };
  /**
   * La tarea se borro. El pomodoro lo escucha para desvincularse: el enlace vive en
   * el config del POMODORO, no en el de la tarea, asi que borrar la tarea no lo
   * deshace por si solo y el reloj seguia corriendo con un nombre que ya no existe.
   */
  'task:deleted': { taskId: string };
  'request-task-link': { taskId: string; taskName: string; estimatedMinutes?: number; widgetId: string };
  'request-timer-index': { widgetId: string };
  'timer-index': { widgetId: string; timerIndex: number };
  'timer-highlight': { widgetId: string };
  /**
   * Alguien quiere vincular una tarea y necesita elegirla. Lleva QUIEN lo pide:
   * sin esto el selector no tiene forma de saber a que timer atar la tarea y lo
   * ataba a todos.
   */
  'open-task-picker': { widgetId: string };
};

type EventHandler<T> = (data: T) => void;

class WidgetBus {
  private listeners = new Map<string, Set<EventHandler<unknown>>>();

  on<K extends keyof BusEvents>(event: K, handler: EventHandler<BusEvents[K]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const set = this.listeners.get(event)!;
    set.add(handler as EventHandler<unknown>);
    return () => {
      set.delete(handler as EventHandler<unknown>);
      if (set.size === 0) this.listeners.delete(event);
    };
  }

  emit<K extends keyof BusEvents>(event: K, data: BusEvents[K]): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const handler of set) {
        handler(data);
      }
    }
  }
}

export const widgetBus = new WidgetBus();
