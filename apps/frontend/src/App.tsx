import { useCallback, useState, useRef, useEffect, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { OPEN_TABLE_EVENT } from './widgets/data-table/DataTableWidget';
import { OPEN_CALENDAR_EVENT } from './widgets/calendar/open-calendar';
import { HubHeader } from './components/HubHeader';
import { TrashWindow } from './components/TrashWindow';
import { TaskPickerModal } from './components/TaskPickerModal';
import { SettingsModal } from './components/SettingsModal';
import {
  DashboardView,
  CalendarView,
  TableView,
  InsightsView,
  getView,
  type ViewId,
} from './views';
import { widgetBus } from './widgets/widget-bus';

const ACTIVE_VIEW_KEY = 'dashlet-active-view';

const VIEW_INDEX: Record<ViewId, number> = {
  dashboard: 0,
  widgets: 0,
  calendar: 1,
  table: 2,
  stats: 3,
};

function readStoredView(): ViewId {
  const stored = localStorage.getItem(ACTIVE_VIEW_KEY);
  if (stored === 'widgets' || !stored) return 'dashboard';
  return getView(stored as ViewId) ? (stored as ViewId) : 'dashboard';
}

interface DashboardProps {
  initialOpenSettings?: boolean;
}

function Dashboard({ initialOpenSettings = false }: DashboardProps) {
  const [trashOpen, setTrashOpen] = useState(false);
  const [taskPickerOpen, setTaskPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(initialOpenSettings);

  const [activeView, setActiveView] = useState<ViewId>(readStoredView);
  const [exitingView, setExitingView] = useState<ViewId | null>(null);
  const [viewSlideDirection, setViewSlideDirection] = useState<'right' | 'left' | null>(null);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taskPickerTargetRef = useRef<string | undefined>(undefined);

  const handleSelectView = useCallback((nextView: ViewId) => {
    setActiveView((current) => {
      const resolvedNext = nextView === 'widgets' ? 'dashboard' : nextView;
      const resolvedCurr = current === 'widgets' ? 'dashboard' : current;
      if (resolvedCurr === resolvedNext) return resolvedNext;

      const prevIdx = VIEW_INDEX[resolvedCurr] ?? 0;
      const nextIdx = VIEW_INDEX[resolvedNext] ?? 0;
      setViewSlideDirection(nextIdx >= prevIdx ? 'right' : 'left');

      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
      }
      setExitingView(resolvedCurr);
      transitionTimerRef.current = setTimeout(() => {
        setExitingView(null);
        transitionTimerRef.current = null;
      }, 280);
      return resolvedNext;
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
    localStorage.setItem(ACTIVE_VIEW_KEY, activeView);
  }, [activeView]);

  const renderViewContent = (viewId: ViewId) => {
    if (viewId === 'dashboard' || viewId === 'widgets') {
      return (
        <DashboardView
          onOpenCalendar={() => handleSelectView('calendar')}
          onOpenTable={() => handleSelectView('table')}
        />
      );
    }

    return (
      <div className="flex-1 min-h-0 h-full w-full overflow-hidden bg-[#0D111A]">
        {viewId === 'calendar' ? (
          <CalendarView onClose={() => handleSelectView('dashboard')} />
        ) : viewId === 'table' ? (
          <TableView onClose={() => handleSelectView('dashboard')} />
        ) : (
          <Suspense
            fallback={
              <div className="flex h-full w-full items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-p2/20 border-t-p2" />
              </div>
            }
          >
            <InsightsView onClose={() => handleSelectView('dashboard')} />
          </Suspense>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#0D111A] text-[#DCE4EC] select-none font-sans">
      <HubHeader
        activeView={activeView}
        onSelectView={handleSelectView}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenTrash={() => setTrashOpen(true)}
        trashOpen={trashOpen}
      />

      {/* Vistas persistentes en el DOM con animación */}
      <div className="flex flex-1 flex-col min-w-0 h-full overflow-hidden relative">
        <div className="relative h-full w-full overflow-hidden">
          {(['dashboard', 'calendar', 'table', 'stats'] as const).map((viewId) => {
            const isActive =
              activeView === viewId || (activeView === 'widgets' && viewId === 'dashboard');
            const isExiting =
              exitingView === viewId || (exitingView === 'widgets' && viewId === 'dashboard');

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
          onRestoreComplete={() => {}}
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
