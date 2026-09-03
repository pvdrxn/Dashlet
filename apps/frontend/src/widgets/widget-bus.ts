type BusEvents = {
  'timer:start': { taskId: string; taskName: string; technique: string };
  'timer:pause': { taskId: string };
  'timer:reset': { taskId: string };
  'timer:complete': { taskId: string };
  'timer:tick': { taskId: string; elapsed: number; remaining: number };
  'task:select': { taskId: string; taskName: string; estimatedMinutes?: number; widgetId: string; targetWidgetId?: string };
  'task:deselect': Record<string, never>;
  'request-task-link': { taskId: string; taskName: string; estimatedMinutes?: number; widgetId: string };
  'request-timer-index': { widgetId: string };
  'timer-index': { widgetId: string; timerIndex: number };
  'timer-highlight': { widgetId: string };
  'open-task-picker': Record<string, never>;
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
