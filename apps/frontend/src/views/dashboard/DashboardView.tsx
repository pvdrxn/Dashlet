import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FiCheckSquare,
  FiClock,
  FiCalendar,
  FiMaximize2,
} from 'react-icons/fi';
import { LuListChecks } from 'react-icons/lu';
import { TabBar } from '../../components/TabBar';
import { TaskPickerModal } from '../../components/TaskPickerModal';
import { InsightsHeader } from './InsightsHeader';
import { LocalNotesModule } from '../../components/notes/LocalNotesModule';
import { TodoListWidget } from '../../widgets/todo-list/TodoListWidget';
import { PomodoroWidget } from '../../widgets/pomodoro/PomodoroWidget';
import { HabitTrackerWidget } from '../../widgets/habit-tracker/HabitTrackerWidget';
import { CalendarWidget, openCalendarView } from '../../widgets/calendar/CalendarWidget';
import { widgetBus } from '../../widgets/widget-bus';
import * as tabsApi from '../../api/tabs';
import * as widgetsApi from '../../api/widgets';
import type { TabDto } from '@widget-master/shared';
import type { WidgetData } from '../../widgets/types';

const ACTIVE_TAB_KEY = 'dashlet-active-tab';

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

  // Estados de pestañas / espacios de trabajo
  const [tabs, setTabs] = useState<TabDto[]>([]);
  const [tabsLoaded, setTabsLoaded] = useState(false);
  const [activeTabId, setActiveTabId] = useState<string | null>(() =>
    localStorage.getItem(ACTIVE_TAB_KEY),
  );
  const [editingTabId, setEditingTabId] = useState<string | null>(null);

  // Estados de widgets para la pestaña activa
  const [widgetsMap, setWidgetsMap] = useState<Record<string, WidgetData>>({});
  const [loadingWidgets, setLoadingWidgets] = useState(true);

  // Selector modal de tareas vinculado a Pomodoro
  const [taskPickerOpen, setTaskPickerOpen] = useState(false);
  const taskPickerTargetRef = useRef<string | undefined>(undefined);

  const updateTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Cargar pestañas al montar
  useEffect(() => {
    let cancelled = false;

    async function loadTabs() {
      try {
        const data = await tabsApi.fetchTabs();
        if (cancelled) return;
        setTabs(data);
        setTabsLoaded(true);
        setActiveTabId((prev) => {
          if (prev && data.some((t) => t.id === prev)) return prev;
          return data[0]?.id ?? null;
        });
      } catch {
        if (!cancelled) setTimeout(loadTabs, 1200);
      }
    }

    void loadTabs();
    return () => {
      cancelled = true;
    };
  }, []);

  // Recordar pestaña activa
  useEffect(() => {
    if (activeTabId) {
      localStorage.setItem(ACTIVE_TAB_KEY, activeTabId);
    } else {
      localStorage.removeItem(ACTIVE_TAB_KEY);
    }
  }, [activeTabId]);

  // Cargar y asegurar los 4 widgets modulares de la pestaña activa
  useEffect(() => {
    if (!activeTabId) return;

    let cancelled = false;
    setLoadingWidgets(true);

    async function syncTabWidgets() {
      try {
        const existingList = await widgetsApi.fetchWidgets(activeTabId!);
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
              activeTabId!,
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

    void syncTabWidgets();
    return () => {
      cancelled = true;
    };
  }, [activeTabId]);

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

  // Operaciones de Pestañas
  const handleSelectTab = useCallback((id: string) => {
    setActiveTabId(id);
  }, []);

  const handleCreateTab = useCallback(async () => {
    try {
      const newTab = await tabsApi.createTab('Nuevo espacio');
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(newTab.id);
      setEditingTabId(newTab.id);
    } catch {}
  }, []);

  const handleRenameTab = useCallback(async (id: string, name: string) => {
    try {
      await tabsApi.renameTab(id, name);
      setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, name } : t)));
    } catch {}
  }, []);

  const handleDeleteTab = useCallback(
    async (id: string) => {
      try {
        await tabsApi.deleteTab(id);
        setTabs((prev) => {
          const next = prev.filter((t) => t.id !== id);
          if (activeTabId === id) {
            setActiveTabId(next[0]?.id ?? null);
          }
          return next;
        });
      } catch {}
    },
    [activeTabId],
  );

  const handleReorderTabs = useCallback(async (orderedIds: string[]) => {
    setTabs((prev) => {
      const tabMap = new Map(prev.map((t) => [t.id, t]));
      return orderedIds.map((id) => tabMap.get(id)!).filter(Boolean);
    });
    try {
      await tabsApi.reorderTabs(orderedIds);
    } catch {}
  }, []);

  const todoWidget = widgetsMap['todo-list'];
  const pomodoroWidget = widgetsMap['pomodoro'];
  const habitWidget = widgetsMap['habit-tracker'];
  const calendarWidget = widgetsMap['calendar'];

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#0F1013] text-[#F1F3F5] font-sans">
      {/* 1. Cabecera de Espacios de Trabajo / Pestañas */}
      <header className="relative flex items-end justify-between px-6 pt-3 pb-0 bg-[#0F1013] shrink-0 border-b border-white/[0.08] select-none">
        <div className="flex-1 min-w-0 overflow-hidden">
          <TabBar
            tabs={tabs}
            activeTabId={activeTabId}
            onSelectTab={handleSelectTab}
            onCreateTab={handleCreateTab}
            onRenameTab={handleRenameTab}
            onDeleteTab={handleDeleteTab}
            onReorderTabs={handleReorderTabs}
            editingTabId={editingTabId}
            onEditingTabIdChange={setEditingTabId}
          />
        </div>
      </header>

      {/* 2. Contenedor unificado de scroll para toda la página */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Sección Superior: Panel Colapsable de Métricas & Heatmap */}
        <InsightsHeader />

        {/* Sección Inferior: Cuadrícula Modular de 5 Herramientas */}
        <main className="p-6">
          {loadingWidgets || !tabsLoaded ? (
            <div className="flex h-64 w-full items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-p2/20 border-t-p2" />
            </div>
          ) : (
            <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* Tarjeta 1: To-Do List */}
            <div className="flex flex-col h-[480px] rounded-xl border border-[#262930] bg-[#16181D] shadow-sm overflow-hidden">
              <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#262930] bg-[#121418]/80 px-4 select-none">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    <FiCheckSquare size={13} />
                  </div>
                  <h2 className="text-xs font-semibold text-white tracking-wide">
                    {t('widgets.todo.title', 'To-Do List')}
                  </h2>
                </div>
                <span className="text-[10px] font-mono text-white/40 uppercase">
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
            <div className="flex flex-col h-[480px] rounded-xl border border-[#262930] bg-[#16181D] shadow-sm overflow-hidden">
              <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#262930] bg-[#121418]/80 px-4 select-none">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded bg-p2/15 text-p2 border border-p2/30">
                    <FiClock size={13} />
                  </div>
                  <h2 className="text-xs font-semibold text-white tracking-wide">
                    {t('widgets.pomodoro.title', 'Timer & Pomodoro')}
                  </h2>
                </div>
                <span className="text-[10px] font-mono text-p2 uppercase font-medium">
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
            <div className="flex flex-col h-[480px] rounded-xl border border-[#262930] bg-[#16181D] shadow-sm overflow-hidden">
              <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#262930] bg-[#121418]/80 px-4 select-none">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    <LuListChecks size={13} />
                  </div>
                  <h2 className="text-xs font-semibold text-white tracking-wide">
                    {t('widgets.habits.title', 'Habit Tracker')}
                  </h2>
                </div>
                <span className="text-[10px] font-mono text-white/40 uppercase">
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
            <div className="flex flex-col h-[480px] rounded-xl border border-[#262930] bg-[#16181D] shadow-sm overflow-hidden">
              <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#262930] bg-[#121418]/80 px-4 select-none">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded bg-blue-500/15 text-blue-400 border border-blue-500/30">
                    <FiCalendar size={13} />
                  </div>
                  <h2 className="text-xs font-semibold text-white tracking-wide">
                    {t('widgets.calendar.title', 'Agenda & Calendario')}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (onOpenCalendar) onOpenCalendar();
                    else openCalendarView();
                  }}
                  className="flex items-center gap-1.5 rounded border border-[#262930] bg-[#16181D] px-2 py-1 text-[11px] text-white/70 hover:text-white hover:border-white/20 transition-colors cursor-pointer"
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

            {/* Tarjeta 5: Notas & Diario (Ancho doble) */}
            <div className="col-span-1 md:col-span-2 lg:col-span-2 h-[480px]">
              <LocalNotesModule className="h-full" />
            </div>
          </div>
        )}
      </main>
    </div>

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
