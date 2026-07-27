import { useCallback, useState } from 'react';
import { WidgetGrid } from './widgets';
import { Toolbar } from './components/Toolbar';
import { createWidget } from './api/widgets';
import { getWidget } from './widgets/registry';
import { snapUpW, snapUpH, findFreeGridSlot } from './widgets/grid-utils';
import type { WidgetData } from './widgets/types';

function loadWidgetsCache(): WidgetData[] {
  try {
    const cached = localStorage.getItem('dashlet-widgets');
    return cached ? JSON.parse(cached) : [];
  } catch {
    return [];
  }
}

function App() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [gridMode, setGridMode] = useState(false);

  const handleAddWidget = useCallback(async (type: string) => {
    const def = getWidget(type);
    if (!def) return;
    const snappedW = snapUpW(def.minSize.w);
    const snappedH = snapUpH(def.minSize.h);
    const existing = loadWidgetsCache();
    const slot = findFreeGridSlot(existing, snappedW, snappedH);
    const position = { x: slot.x, y: slot.y, w: snappedW, h: snappedH };
    await createWidget(type, def.defaultConfig, position);
    setRefreshKey((k) => k + 1);
  }, []);

  const handleToggleGridMode = useCallback(() => {
    setGridMode((prev) => !prev);
  }, []);

  return (
    <main className="min-h-screen bg-gray-900">
      <Toolbar onAddWidget={handleAddWidget} gridMode={gridMode} onToggleGridMode={handleToggleGridMode} />
      <div className="p-4">
        <WidgetGrid key={refreshKey} gridMode={gridMode} onAddWidget={() => handleAddWidget('todo-list')} />
      </div>
    </main>
  );
}

export default App;
