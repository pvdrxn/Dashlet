import { useCallback, useState, useRef, useEffect } from 'react';
import { WidgetGrid } from './widgets';
import { Toolbar } from './components/Toolbar';
import { TabBar } from './components/TabBar';
import { TrashWindow } from './components/TrashWindow';
import * as tabsApi from './api/tabs';
import type { TabDto } from '@widget-master/shared';

const ACTIVE_TAB_KEY = 'dashlet-active-tab';

function App() {
  const [gridMode, setGridMode] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [tabs, setTabs] = useState<TabDto[]>([]);
  const [tabsLoaded, setTabsLoaded] = useState(false);
  const [activeTabId, setActiveTabId] = useState<string | null>(() =>
    localStorage.getItem(ACTIVE_TAB_KEY),
  );
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const addWidgetRefs = useRef(new Map<string, (type: string) => void>());
  const refreshWidgetsRefs = useRef(new Map<string, () => void>());
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
      tabsApi.fetchTabs().then((data) => {
        if (cancelled) return;
        setTabs(data);
        setTabsLoaded(true);
        setActiveTabId((prev) => {
          if (prev && data.some((t) => t.id === prev)) return prev;
          return data[0]?.id ?? null;
        });
      }).catch(() => {
        if (!cancelled) setTimeout(fetch, 1000);
      });
    }

    fetch();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (activeTabId) localStorage.setItem(ACTIVE_TAB_KEY, activeTabId);
    else localStorage.removeItem(ACTIVE_TAB_KEY);
  }, [activeTabId]);

  const handleSelectTab = useCallback((id: string) => {
    setActiveTabId(id);
  }, []);

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

  const handleDeleteTab = useCallback(async (id: string) => {
    try {
      await tabsApi.deleteTab(id);
      setTabs((prev) => {
        const next = prev.filter((t) => t.id !== id);
        setActiveTabId((current) => (current === id ? (next[0]?.id ?? null) : current));
        return next;
      });
      if (editingTabId === id) setEditingTabId(null);
    } catch {}
  }, [editingTabId]);

  const handleReorderTabs = useCallback((orderedIds: string[]) => {
    setTabs((prev) => {
      const byId = new Map(prev.map((t) => [t.id, t]));
      return orderedIds.map((id) => byId.get(id)).filter((t): t is TabDto => Boolean(t));
    });
    tabsApi.reorderTabs(orderedIds).catch(() => {});
  }, []);

  const handleToggleGridMode = useCallback(() => {
    setGridMode((prev) => !prev);
  }, []);

  const registerAddWidgetRef = useCallback((tabId: string, fn: (type: string) => void) => {
    addWidgetRefs.current.set(tabId, fn);
  }, []);

  const registerRefreshRef = useCallback((tabId: string, fn: () => void) => {
    refreshWidgetsRefs.current.set(tabId, fn);
  }, []);

  const handleAddWidget = useCallback((type: string) => {
    if (!activeTabId) return;
    addWidgetRefs.current.get(activeTabId)?.(type);
  }, [activeTabId]);

  const handleRestoreComplete = useCallback(() => {
    refreshWidgetsRefs.current.forEach((fn) => fn());
    tabsApi.fetchTabs().then((data) => {
      setTabs(data);
      setActiveTabId((prev) => (prev && data.some((t) => t.id === prev) ? prev : data[0]?.id ?? null));
    }).catch(() => {});
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
          gridMode={gridMode}
          onToggleGridMode={handleToggleGridMode}
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
      />
      <div className="p-4">
        {tabs.map((tab) => (
          <div key={tab.id} className={activeTabId === tab.id ? '' : 'hidden'}>
            <WidgetGrid
              tabId={tab.id}
              gridMode={gridMode}
              onAddWidgetRef={registerAddWidgetRef}
              onRefreshRef={registerRefreshRef}
            />
          </div>
        ))}
      </div>
      {trashOpen && <TrashWindow onClose={() => setTrashOpen(false)} onRestoreComplete={handleRestoreComplete} />}
    </main>
  );
}

export default App;