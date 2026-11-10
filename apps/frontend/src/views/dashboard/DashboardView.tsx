import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FiCheckSquare,
  FiClock,
  FiCalendar,
  FiMaximize2,
} from 'react-icons/fi';
import { LuListChecks } from 'react-icons/lu';
import { TaskPickerModal } from '../../components/TaskPickerModal';
import { LocalNotesModule } from '../../components/notes/LocalNotesModule';
import { TodoListWidget } from '../../widgets/todo-list/TodoListWidget';
import { PomodoroWidget } from '../../widgets/pomodoro/PomodoroWidget';
import { HabitTrackerWidget } from '../../widgets/habit-tracker/HabitTrackerWidget';
import { CalendarWidget, openCalendarView } from '../../widgets/calendar/CalendarWidget';
import { widgetBus } from '../../widgets/widget-bus';
import * as widgetsApi from '../../api/widgets';
import type { WidgetData } from '../../widgets/types';

export interface DashboardViewProps {
  onOpenCalendar?: () => void;
  onOpenTable?: () => void;
}

const DEFAULT_CONFIGS: Record<string, Record<string, unknown>> = {
  'todo-list': { title: 'To-Do List', items: [] },
  pomodoro: {
    title: 'Timer',
    technique: 'pomodoro',
    workMinutes: 25,
    restMinutes: 5,
    state: 'idle',
    remainingSeconds: 1500,
    elapsedSeconds: 0,
    cycleCount: 0,
  },
  'habit-tracker': { title: 'Hábitos diarios', habits: [] },
  calendar: { title: 'Calendar', viewMode: 'month', agenda: null },
};

export function DashboardView({ onOpenCalendar }: DashboardViewProps) {
  const { t } = useTranslation();

  // Estados de widgets modulares para la pantalla única
  const [widgetsMap, setWidgetsMap] = useState<Record<string, WidgetData>>({});
  const [loadingWidgets, setLoadingWidgets] = useState(true);

  // Selector modal de tareas vinculado a Pomodoro
  const [taskPickerOpen, setTaskPickerOpen] = useState(false);
  const taskPickerTargetRef = useRef<string | undefined>(undefined);

  const updateTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Cargar y asegurar los 4 widgets modulares de la pantalla única
  useEffect(() => {
    let cancelled = false;
    setLoadingWidgets(true);

    async function syncWidgets() {
      try {
        const existingList = await widgetsApi.fetchWidgets();
        if (cancelled) return;

        const map: Record<string, WidgetData> = {};
        const typesNeeded = ['todo-list', 'pomodoro', 'habit-tracker', 'calendar'];

        for (const type of typesNeeded) {
          let found = existingList.find((w) => w.type === type && !w.deletedAt);
          if (!found) {
            found = await widgetsApi.createWidget(
              type,
              DEFAULT_CONFIGS[type],
              { x: 0, y: 0, w: 1, h: 1 },
            );
          }
          if (found) {
            map[type] = found;
          }
        }

        if (!cancelled) {
          setWidgetsMap(map);
          setLoadingWidgets(false);
        }
      } catch {
        if (!cancelled) {
          setLoadingWidgets(false);
        }
      }
    }

    void syncWidgets();
    return () => {
      cancelled = true;
    };
  }, []);

  // Listener para enlazar tareas con Pomodoro
  useEffect(() => {
    const offLink = widgetBus.on('request-task-link', (data) => {
      const pomodoroWidget = widgetsMap['pomodoro'];
      if (pomodoroWidget) {
        widgetBus.emit('task:select', {
          ...data,
          targetWidgetId: pomodoroWidget.id,
        });
      }
    });

    const offPicker = widgetBus.on('open-task-picker', (data) => {
      taskPickerTargetRef.current = data.widgetId;
      setTaskPickerOpen(true);
    });

    return () => {
      offLink();
      offPicker();
    };
  }, [widgetsMap]);

  // Guardado debounced de la configuración de un widget
  const handleConfigChange = useCallback(
    (widgetId: string, type: string, newConfig: Record<string, unknown>) => {
      setWidgetsMap((prev) => {
        const current = prev[type];
        if (!current) return prev;
        return {
          ...prev,
          [type]: {
            ...current,
            config: newConfig,
          },
        };
      });

      const existingTimer = updateTimersRef.current.get(widgetId);
      if (existingTimer) clearTimeout(existingTimer);

      const timer = setTimeout(() => {
        widgetsApi.updateWidget(widgetId, { config: newConfig }).catch(() => {});
        updateTimersRef.current.delete(widgetId);
      }, 350);

      updateTimersRef.current.set(widgetId, timer);
    },
    [],
  );

  const todoWidget = widgetsMap['todo-list'];
  const pomodoroWidget = widgetsMap['pomodoro'];
  const habitWidget = widgetsMap['habit-tracker'];
  const calendarWidget = widgetsMap['calendar'];

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#0D111A] text-[#DCE4EC] font-sans">
      {/* Cuadrícula Modular de 5 Herramientas */}
      <main className="flex-1 min-h-0 overflow-y-auto p-6">
        {loadingWidgets ? (
          <div className="flex h-64 w-full items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#FFC20D]/20 border-t-[#FFC20D]" />
          </div>
        ) : (
          <div className="w-full max-w-[1920px] mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 min-[1440px]:grid-cols-4 gap-5">
            {/* Tarjeta 1: To-Do List */}
            <div className="flex flex-col h-[480px] rounded-xl border border-[#232B3B] bg-[#141A26] shadow-sm overflow-hidden">
              <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#232B3B] bg-[#0D111A]/80 px-4 select-none">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded bg-[#1C2436] text-emerald-400 border border-[#232B3B]">
                    <FiCheckSquare size={13} />
                  </div>
                  <h2 className="text-xs font-semibold text-[#DCE4EC] tracking-wide">
                    {t('widgets.todo.title', 'To-Do List')}
                  </h2>
                </div>
                <span className="text-[10px] font-mono text-[#8B9BB0] uppercase">
                  Checklist & Prioridad
                </span>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-4">
                {todoWidget && (
                  <TodoListWidget
                    config={todoWidget.config}
                    onConfigChange={(newCfg) =>
                      handleConfigChange(todoWidget.id, 'todo-list', newCfg)
                    }
                  />
                )}
              </div>
            </div>

            {/* Tarjeta 2: Timer & Pomodoro */}
            <div className="flex flex-col h-[480px] rounded-xl border border-[#232B3B] bg-[#141A26] shadow-sm overflow-hidden">
              <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#232B3B] bg-[#0D111A]/80 px-4 select-none">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded bg-[#1C2436] text-[#FFC20D] border border-[#232B3B]">
                    <FiClock size={13} />
                  </div>
                  <h2 className="text-xs font-semibold text-[#DCE4EC] tracking-wide">
                    {t('widgets.pomodoro.title', 'Timer & Pomodoro')}
                  </h2>
                </div>
                <span className="text-[10px] font-mono text-[#8B9BB0] uppercase font-medium">
                  Sesiones de Foco
                </span>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-4">
                {pomodoroWidget && (
                  <PomodoroWidget
                    config={pomodoroWidget.config}
                    onConfigChange={(newCfg) =>
                      handleConfigChange(pomodoroWidget.id, 'pomodoro', newCfg)
                    }
                    widgetId={pomodoroWidget.id}
                  />
                )}
              </div>
            </div>

            {/* Tarjeta 3: Habit Tracker */}
            <div className="flex flex-col h-[480px] rounded-xl border border-[#232B3B] bg-[#141A26] shadow-sm overflow-hidden">
              <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#232B3B] bg-[#0D111A]/80 px-4 select-none">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded bg-[#1C2436] text-amber-400 border border-[#232B3B]">
                    <LuListChecks size={13} />
                  </div>
                  <h2 className="text-xs font-semibold text-[#DCE4EC] tracking-wide">
                    {t('widgets.habits.title', 'Habit Tracker')}
                  </h2>
                </div>
                <span className="text-[10px] font-mono text-[#8B9BB0] uppercase">
                  Consistencia Diaria
                </span>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-4">
                {habitWidget && (
                  <HabitTrackerWidget
                    config={habitWidget.config}
                    onConfigChange={(newCfg) =>
                      handleConfigChange(habitWidget.id, 'habit-tracker', newCfg)
                    }
                  />
                )}
              </div>
            </div>

            {/* Tarjeta 4: Mini-Calendar */}
            <div className="flex flex-col h-[480px] rounded-xl border border-[#232B3B] bg-[#141A26] shadow-sm overflow-hidden">
              <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#232B3B] bg-[#0D111A]/80 px-4 select-none">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded bg-[#1C2436] text-blue-400 border border-[#232B3B]">
                    <FiCalendar size={13} />
                  </div>
                  <h2 className="text-xs font-semibold text-[#DCE4EC] tracking-wide">
                    {t('widgets.calendar.title', 'Agenda & Calendario')}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (onOpenCalendar) onOpenCalendar();
                    else openCalendarView();
                  }}
                  className="flex items-center gap-1.5 rounded border border-[#232B3B] bg-[#1C2436] px-2 py-1 text-[11px] text-[#8B9BB0] hover:text-[#DCE4EC] hover:border-[#313D53] transition-colors cursor-pointer"
                  title="Abrir vista de agenda completa"
                >
                  <FiMaximize2 size={11} />
                  <span className="hidden sm:inline">Ver agenda</span>
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-4">
                {calendarWidget && (
                  <CalendarWidget
                    config={calendarWidget.config}
                    onConfigChange={(newCfg) =>
                      handleConfigChange(calendarWidget.id, 'calendar', newCfg)
                    }
                    widgetId={calendarWidget.id}
                  />
                )}
              </div>
            </div>

            {/* Tarjeta 5: Notas & Diario (Ancho adaptativo) */}
            <div className="col-span-1 md:col-span-2 lg:col-span-2 min-[1440px]:col-span-4 h-[480px]">
              <LocalNotesModule className="h-full" />
            </div>
          </div>
        )}
      </main>

      {/* Modal selector de tareas para Pomodoro */}
      {taskPickerOpen && (
        <TaskPickerModal
          targetWidgetId={taskPickerTargetRef.current}
          onClose={() => setTaskPickerOpen(false)}
        />
      )}
    </div>
  );
}
