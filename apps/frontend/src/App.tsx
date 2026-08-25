import { useCallback, useState, useRef, useEffect } from 'react';
import { WidgetGrid } from './widgets';
import { Toolbar } from './components/Toolbar';
import { TabBar } from './components/TabBar';
import { TrashWindow } from './components/TrashWindow';
import * as tabsApi from './api/tabs';
import type { TabDto } from '@widget-master/shared';
import {
  beginDragSession,
  clearDragSession,
  updateDragPointer,
  type TransferAction,
} from './widgets/drag-session';

const ACTIVE_TAB_KEY = 'dashlet-active-tab';

function App() {
  const [trashOpen, setTrashOpen] = useState(false);
  const [tabs, setTabs] = useState<TabDto[]>([]);
  const [tabsLoaded, setTabsLoaded] = useState(false);
  const [activeTabId, setActiveTabId] = useState<string | null>(() =>
    localStorage.getItem(ACTIVE_TAB_KEY),
  );
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [widgetDragActive, setWidgetDragActive] = useState(false);
  const addWidgetRefs = useRef(new Map<string, (type: string) => void>());
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

  const registerAddWidgetRef = useCallback((tabId: string, fn: (type: string) => void) => {
    addWidgetRefs.current.set(tabId, fn);
  }, []);

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
    (type: string) => {
      if (!activeTabId) return;
      addWidgetRefs.current.get(activeTabId)?.(type);
    },
    [activeTabId],
  );

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
    </main>
  );
}

export default App;
