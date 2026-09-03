import { useCallback, useState, useRef, useEffect } from 'react';
import { WidgetGrid } from './widgets';
import { Toolbar } from './components/Toolbar';
import { TabBar } from './components/TabBar';
import { TrashWindow } from './components/TrashWindow';
import { TaskPickerModal } from './components/TaskPickerModal';
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

function App() {
  const [trashOpen, setTrashOpen] = useState(false);
  const [taskPickerOpen, setTaskPickerOpen] = useState(false);
  const [tabs, setTabs] = useState<TabDto[]>([]);
  const [tabsLoaded, setTabsLoaded] = useState(false);
  const [activeTabId, setActiveTabId] = useState<string | null>(() =>
    localStorage.getItem(ACTIVE_TAB_KEY),
  );
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
  const checkPlacementRefs = useRef(
    new Map<string, (x: number, y: number, w: number, h: number) => boolean>(),
  );
  const refreshWidgetsRefs = useRef(new Map<string, () => void>());
  const transferWidgetRefs = useRef(new Map<string, (action: TransferAction) => void>());
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarHeight, setToolbarHeight] = useState(0);

  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const update = () => setToolbarHeight(el.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
    const off = widgetBus.on('open-task-picker', () => setTaskPickerOpen(true));
    return () => { off(); };
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
    return () => { off(); };
  }, [activeTabId]);

  useEffect(() => {
    if (activeTabId) localStorage.setItem(ACTIVE_TAB_KEY, activeTabId);
    else localStorage.removeItem(ACTIVE_TAB_KEY);
  }, [activeTabId]);

  const handleSelectTab = useCallback((id: string) => {
    setActiveTabId(id);
  }, []);

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
      const tab = await tabsApi.createTab();
      setTabs((prev) => [...prev, tab]);
      setActiveTabId(tab.id);
      setEditingTabId(tab.id);
    } catch {}
  }, []);

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
          setActiveTabId((current) => (current === id ? (next[0]?.id ?? null) : current));
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

  const registerCheckPlacementRef = useCallback(
    (tabId: string, fn: (x: number, y: number, w: number, h: number) => boolean) => {
      checkPlacementRefs.current.set(tabId, fn);
    },
    [],
  );

  const handleCheckPlacement = useCallback(
    (clientX: number, clientY: number, w: number, h: number): boolean | null => {
      if (!activeTabId) return null;
      const fn = checkPlacementRefs.current.get(activeTabId);
      if (!fn) return null;
      return fn(clientX, clientY, w, h);
    },
    [activeTabId],
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
    return () => { off(); };
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

  if (!tabsLoaded) {
    return (
      <main className="min-h-screen bg-gray-900">
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <p>Loading tabs...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-900">
      <div ref={toolbarRef}>
        <Toolbar
          onAddWidget={handleAddWidget}
          onAddWidgetDeferred={handleAddWidgetDeferred}
          onPredictAdd={handlePredictAdd}
          onRevealWidgets={handleRevealWidgets}
          onCheckPlacement={handleCheckPlacement}
          onOpenTrash={() => setTrashOpen(true)}
        />
      </div>
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
        topOffset={toolbarHeight}
        widgetDragActive={widgetDragActive}
      />
      <div className="p-4">
        {tabs.map((tab) => (
          <div key={tab.id} className={activeTabId === tab.id ? '' : 'hidden'}>
            <WidgetGrid
              tabId={tab.id}
              onAddWidgetRef={registerAddWidgetRef}
              onPredictAddRef={registerPredictAddRef}
              onRevealRef={registerRevealRef}
              onCheckPlacementRef={registerCheckPlacementRef}
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
      {trashOpen && (
        <TrashWindow
          onClose={() => setTrashOpen(false)}
          onRestoreComplete={handleRestoreComplete}
        />
      )}
      {taskPickerOpen && (
        <TaskPickerModal
          onClose={() => setTaskPickerOpen(false)}
        />
      )}
    </main>
  );
}

export default App;
