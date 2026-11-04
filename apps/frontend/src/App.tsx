import { useCallback, useState, useRef, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { WidgetGrid } from './widgets';
import { OPEN_TABLE_EVENT } from './widgets/data-table/DataTableWidget';
import { OPEN_CALENDAR_EVENT } from './widgets/calendar/open-calendar';
import { HubHeader } from './components/HubHeader';
import { AddWidgetButton } from './components/AddWidgetButton';
import { TabBar } from './components/TabBar';
import { TrashWindow } from './components/TrashWindow';
import { TaskPickerModal } from './components/TaskPickerModal';
import { SettingsModal } from './components/SettingsModal';
import { CalendarView, TableView, getView, type ViewId } from './views';
import { widgetBus } from './widgets/widget-bus';
import * as tabsApi from './api/tabs';
import * as widgetsApi from './api/widgets';
import type { TabDto } from '@widget-master/shared';
import type { Position } from './widgets/types';
import {
  beginDragSession,
  clearDragSession,
  updateDragPointer,
  type TransferAction,
} from './widgets/drag-session';

const ACTIVE_TAB_KEY = 'dashlet-active-tab';
const ACTIVE_VIEW_KEY = 'dashlet-active-view';

const VIEW_INDEX: Record<ViewId, number> = {
  widgets: 0,
  calendar: 1,
  table: 2,
};

function readStoredView(): ViewId {
  const stored = localStorage.getItem(ACTIVE_VIEW_KEY);
  return stored && getView(stored as ViewId) ? (stored as ViewId) : 'widgets';
}

interface DashboardProps {
  initialOpenSettings?: boolean;
}

function Dashboard({ initialOpenSettings = false }: DashboardProps) {
  const { t } = useTranslation();
  const [trashOpen, setTrashOpen] = useState(false);
  const [taskPickerOpen, setTaskPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(initialOpenSettings);

  const [activeView, setActiveView] = useState<ViewId>(readStoredView);
  const [exitingView, setExitingView] = useState<ViewId | null>(null);
  const [viewSlideDirection, setViewSlideDirection] = useState<'right' | 'left' | null>(null);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSelectView = useCallback((nextView: ViewId) => {
    setActiveView((current) => {
      if (current === nextView) return current;
      const prevIdx = VIEW_INDEX[current] ?? 0;
      const nextIdx = VIEW_INDEX[nextView] ?? 0;
      setViewSlideDirection(nextIdx >= prevIdx ? 'right' : 'left');

      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
      }
      setExitingView(current);
      transitionTimerRef.current = setTimeout(() => {
        setExitingView(null);
        transitionTimerRef.current = null;
      }, 280);
      return nextView;
    });
  }, []);

  const handleEscape = useCallback(() => {
    if (settingsOpen) {
      setSettingsOpen(false);
      return;
    }
    if (trashOpen) {
      setTrashOpen(false);
      return;
    }
    if (taskPickerOpen) {
      setTaskPickerOpen(false);
      return;
    }
    window.electronAPI?.hideWindow?.();
  }, [settingsOpen, trashOpen, taskPickerOpen]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleEscape();
      } else if (e.key === 'F11') {
        e.preventDefault();
        window.electronAPI?.toggleFullscreen?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleEscape]);

  useEffect(() => {
    const unsubEscape = window.electronAPI?.onEscapePressed?.(() => {
      handleEscape();
    });
    return () => {
      unsubEscape?.();
    };
  }, [handleEscape]);

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const onOpenTable = () => {
      handleSelectView('table');
    };
    const onOpenCalendar = () => {
      handleSelectView('calendar');
    };
    window.addEventListener(OPEN_TABLE_EVENT, onOpenTable);
    window.addEventListener(OPEN_CALENDAR_EVENT, onOpenCalendar);
    return () => {
      window.removeEventListener(OPEN_TABLE_EVENT, onOpenTable);
      window.removeEventListener(OPEN_CALENDAR_EVENT, onOpenCalendar);
    };
  }, [handleSelectView]);

  const taskPickerTargetRef = useRef<string | undefined>(undefined);
  const [tabs, setTabs] = useState<TabDto[]>([]);
  const [tabsLoaded, setTabsLoaded] = useState(false);
  const [activeTabId, setActiveTabId] = useState<string | null>(() =>
    localStorage.getItem(ACTIVE_TAB_KEY),
  );
  const [slideDirection, setSlideDirection] = useState<'right' | 'left' | null>(null);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [widgetDragActive, setWidgetDragActive] = useState(false);
  const addWidgetRefs = useRef(
    new Map<
      string,
      (
        type: string,
        dropPoint?: { x: number; y: number },
        opts?: { deferCommit?: boolean },
      ) => Promise<Position | null>
    >(),
  );
  const predictAddRefs = useRef(new Map<string, (type: string) => Position | null>());
  const revealAddRefs = useRef(new Map<string, () => void>());
  const refreshWidgetsRefs = useRef(new Map<string, () => void>());
  const transferWidgetRefs = useRef(new Map<string, (action: TransferAction) => void>());

  const tabBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    function fetch() {
      tabsApi
        .fetchTabs()
        .then((data) => {
          if (cancelled) return;
          setTabs(data);
          setTabsLoaded(true);
          setActiveTabId((prev) => {
            if (prev && data.some((t) => t.id === prev)) return prev;
            return data[0]?.id ?? null;
          });
        })
        .catch(() => {
          if (!cancelled) setTimeout(fetch, 1000);
        });
    }

    fetch();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const off = widgetBus.on('open-task-picker', (data) => {
      taskPickerTargetRef.current = data.widgetId;
      setTaskPickerOpen(true);
    });
    return () => {
      off();
    };
  }, []);

  useEffect(() => {
    const off = widgetBus.on('request-timer-index', async () => {
      if (!activeTabId) return;
      const widgets = await widgetsApi.fetchWidgets(activeTabId);
      const timers = widgets.filter((w) => w.type === 'pomodoro');
      timers.forEach((t, i) => {
        widgetBus.emit('timer-index', { widgetId: t.id, timerIndex: timers.length - i });
      });
    });
    return () => {
      off();
    };
  }, [activeTabId]);

  useEffect(() => {
    if (activeTabId) localStorage.setItem(ACTIVE_TAB_KEY, activeTabId);
    else localStorage.removeItem(ACTIVE_TAB_KEY);
  }, [activeTabId]);

  useEffect(() => {
    localStorage.setItem(ACTIVE_VIEW_KEY, activeView);
  }, [activeView]);

  const handleSelectTab = useCallback(
    (id: string) => {
      setActiveTabId((current) => {
        if (current === id) return current;
        const prevIndex = tabs.findIndex((t) => t.id === current);
        const nextIndex = tabs.findIndex((t) => t.id === id);
        if (prevIndex !== -1 && nextIndex !== -1) {
          setSlideDirection(nextIndex >= prevIndex ? 'right' : 'left');
        } else {
          setSlideDirection(null);
        }
        return id;
      });
    },
    [tabs],
  );

  const handleWidgetDragStart = useCallback((widgetId: string, sourceTabId: string) => {
    beginDragSession({ widgetId, sourceTabId });
    setWidgetDragActive(true);
  }, []);

  const handleWidgetDragEnd = useCallback(() => {
    clearDragSession();
    setWidgetDragActive(false);
  }, []);

  useEffect(() => {
    if (!widgetDragActive) return;
    const onPointerMove = (e: PointerEvent) => updateDragPointer(e.clientX, e.clientY);
    document.addEventListener('pointermove', onPointerMove);
    return () => document.removeEventListener('pointermove', onPointerMove);
  }, [widgetDragActive]);

  const handleCreateTab = useCallback(async () => {
    try {
      const defaultName = t('dashboard.newTab', 'New tab');
      const tab = await tabsApi.createTab(defaultName);
      setSlideDirection('right');
      setTabs((prev) => [...prev, tab]);
      setActiveTabId(tab.id);
    } catch {}
  }, [t]);

  const handleRenameTab = useCallback(async (id: string, name: string) => {
    try {
      const updated = await tabsApi.renameTab(id, name);
      setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, name: updated.name } : t)));
    } catch {}
  }, []);

  const handleDeleteTab = useCallback(
    async (id: string) => {
      try {
        await tabsApi.deleteTab(id);
        setTabs((prev) => {
          const next = prev.filter((t) => t.id !== id);
          setActiveTabId((current) => {
            if (current === id) {
              setSlideDirection('left');
              return next[0]?.id ?? null;
            }
            return current;
          });
          return next;
        });
        if (editingTabId === id) setEditingTabId(null);
      } catch {}
    },
    [editingTabId],
  );

  const handleReorderTabs = useCallback((orderedIds: string[]) => {
    setTabs((prev) => {
      const byId = new Map(prev.map((t) => [t.id, t]));
      return orderedIds.map((id) => byId.get(id)).filter((t): t is TabDto => Boolean(t));
    });
    tabsApi.reorderTabs(orderedIds).catch(() => {});
  }, []);

  const registerAddWidgetRef = useCallback(
    (tabId: string, fn: (type: string) => Promise<Position | null>) => {
      addWidgetRefs.current.set(tabId, fn);
    },
    [],
  );

  const registerRefreshRef = useCallback((tabId: string, fn: () => void) => {
    refreshWidgetsRefs.current.set(tabId, fn);
  }, []);

  const registerTransferRef = useCallback((tabId: string, fn: (action: TransferAction) => void) => {
    transferWidgetRefs.current.set(tabId, fn);
  }, []);

  const handleWidgetTransferred = useCallback((targetTabId: string, action: TransferAction) => {
    transferWidgetRefs.current.get(targetTabId)?.(action);
  }, []);

  const handleWidgetSynced = useCallback((targetTabId: string) => {
    refreshWidgetsRefs.current.get(targetTabId)?.();
  }, []);

  const handleAddWidget = useCallback(
    (type: string): Promise<Position | null> => {
      if (!activeTabId) return Promise.resolve(null);
      return addWidgetRefs.current.get(activeTabId)?.(type) ?? Promise.resolve(null);
    },
    [activeTabId],
  );

  const handleAddWidgetDeferred = useCallback(
    (type: string): Promise<Position | null> => {
      if (!activeTabId) return Promise.resolve(null);
      return (
        addWidgetRefs.current.get(activeTabId)?.(type, undefined, { deferCommit: true }) ??
        Promise.resolve(null)
      );
    },
    [activeTabId],
  );

  useEffect(() => {
    const off = widgetBus.on('request-task-link', async (data) => {
      if (!activeTabId) return;

      const widgets = await widgetsApi.fetchWidgets(activeTabId);
      const timers = widgets.filter((w) => w.type === 'pomodoro');

      const alreadyLinked = timers.find((t) => t.config.linkedTaskId === data.taskId);
      if (alreadyLinked) {
        widgetBus.emit('timer-highlight', { widgetId: alreadyLinked.id });
        return;
      }

      const freeTimer = timers.find((t) => !t.config.linkedTaskId);

      if (!freeTimer) {
        const prevIds = new Set(timers.map((t) => t.id));
        await handleAddWidget('pomodoro');
        await new Promise((r) => setTimeout(r, 150));
        const updatedWidgets = await widgetsApi.fetchWidgets(activeTabId);
        const newTimers = updatedWidgets.filter((w) => w.type === 'pomodoro');
        const newestTimer = newTimers.find((t) => !prevIds.has(t.id));
        widgetBus.emit('task:select', { ...data, targetWidgetId: newestTimer?.id });
      } else {
        widgetBus.emit('task:select', { ...data, targetWidgetId: freeTimer.id });
      }
    });
    return () => {
      off();
    };
  }, [activeTabId, handleAddWidget]);

  const registerPredictAddRef = useCallback(
    (tabId: string, fn: (type: string) => Position | null) => {
      predictAddRefs.current.set(tabId, fn);
    },
    [],
  );

  const registerRevealRef = useCallback((tabId: string, fn: () => void) => {
    revealAddRefs.current.set(tabId, fn);
  }, []);

  const handlePredictAdd = useCallback(
    (type: string): Position | null => {
      if (!activeTabId) return null;
      return predictAddRefs.current.get(activeTabId)?.(type) ?? null;
    },
    [activeTabId],
  );

  const handleRevealWidgets = useCallback(() => {
    if (!activeTabId) return;
    revealAddRefs.current.get(activeTabId)?.();
  }, [activeTabId]);

  const handleRestoreComplete = useCallback(() => {
    refreshWidgetsRefs.current.forEach((fn) => fn());
    tabsApi
      .fetchTabs()
      .then((data) => {
        setTabs(data);
        setActiveTabId((prev) =>
          prev && data.some((t) => t.id === prev) ? prev : (data[0]?.id ?? null),
        );
      })
      .catch(() => {});
  }, []);

  const renderWidgetsView = () => {
    return (
      <div className="flex h-full w-full flex-col overflow-hidden bg-[#0F1013]">
        <div
          ref={tabBarRef}
          className="relative flex items-end justify-between px-6 pt-3.5 pb-0 bg-[#0F1013] shrink-0 gap-3 border-b border-white/[0.08]"
        >
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
              widgetDragActive={widgetDragActive}
            />
          </div>
          <div className="pb-2 shrink-0">
            <AddWidgetButton
              onAddWidget={handleAddWidget}
              onAddWidgetDeferred={handleAddWidgetDeferred}
              onPredictAdd={handlePredictAdd}
              onRevealWidgets={handleRevealWidgets}
            />
          </div>
        </div>
        <div className="relative flex-1 min-h-0 overflow-hidden">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={
                activeTabId === tab.id
                  ? `h-full w-full ${
                      slideDirection === 'right'
                        ? 'animate-tab-slide-right'
                        : slideDirection === 'left'
                          ? 'animate-tab-slide-left'
                          : ''
                    }`
                  : 'hidden'
              }
            >
              <WidgetGrid
                tabId={tab.id}
                onAddWidgetRef={registerAddWidgetRef}
                onPredictAddRef={registerPredictAddRef}
                onRevealRef={registerRevealRef}
                onRefreshRef={registerRefreshRef}
                onTransferRef={registerTransferRef}
                onWidgetDragStart={handleWidgetDragStart}
                onWidgetDragEnd={handleWidgetDragEnd}
                onWidgetTransferred={handleWidgetTransferred}
                onWidgetSynced={handleWidgetSynced}
              />
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderViewContent = (viewId: ViewId) => {
    if (viewId === 'widgets') {
      return renderWidgetsView();
    }

    return (
      <div className="flex-1 min-h-0 h-full w-full overflow-hidden bg-[#0F1013]">
        {viewId === 'calendar' ? (
          <CalendarView onClose={() => handleSelectView('widgets')} />
        ) : (
          <TableView onClose={() => handleSelectView('widgets')} />
        )}
      </div>
    );
  };

  if (!tabsLoaded) {
    return (
      <main className="flex h-screen w-screen items-center justify-center bg-[#0F1013]">
        <div
          className="h-6 w-6 animate-spin rounded-full border-2 border-p2/20 border-t-p2"
          role="status"
          aria-label="Cargando..."
        />
      </main>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#0F1013] text-[#F1F3F5] select-none">
      <HubHeader
        activeView={activeView}
        onSelectView={handleSelectView}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenTrash={() => setTrashOpen(true)}
        trashOpen={trashOpen}
      />

      {/* Vistas persistentes en el DOM con transición crossfade */}
      <div className="flex flex-1 flex-col min-w-0 h-full overflow-hidden relative">
        <div className="relative h-full w-full overflow-hidden">
          {(['widgets', 'calendar', 'table'] as const).map((viewId) => {
            const isActive = activeView === viewId;
            const isExiting = exitingView === viewId;

            if (!isActive && !isExiting) {
              return (
                <div
                  key={viewId}
                  className="absolute inset-0 z-0 overflow-hidden opacity-0 pointer-events-none"
                  aria-hidden="true"
                >
                  {renderViewContent(viewId)}
                </div>
              );
            }

            if (isExiting) {
              return (
                <div
                  key={`exit-${viewId}`}
                  className="absolute inset-0 pointer-events-none z-0 overflow-hidden animate-view-fade-out"
                  aria-hidden="true"
                >
                  {renderViewContent(viewId)}
                </div>
              );
            }

            return (
              <div
                key={`active-${viewId}`}
                className={`absolute inset-0 z-10 overflow-hidden opacity-100 ${
                  viewSlideDirection === 'right'
                    ? 'animate-tab-slide-right'
                    : viewSlideDirection === 'left'
                      ? 'animate-tab-slide-left'
                      : exitingView
                        ? 'animate-view-fade-in'
                        : ''
                }`}
              >
                {renderViewContent(viewId)}
              </div>
            );
          })}
        </div>
      </div>

      {trashOpen && (
        <TrashWindow
          onClose={() => setTrashOpen(false)}
          onRestoreComplete={handleRestoreComplete}
        />
      )}

      {taskPickerOpen && (
        <TaskPickerModal
          targetWidgetId={taskPickerTargetRef.current}
          onClose={() => {
            taskPickerTargetRef.current = undefined;
            setTaskPickerOpen(false);
          }}
        />
      )}

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/settings" element={<Dashboard initialOpenSettings />} />
        <Route path="/" element={<Dashboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
