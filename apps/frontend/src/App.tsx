import { useCallback, useState } from 'react';
import { WidgetGrid } from './widgets';
import { Toolbar } from './components/Toolbar';
import { createWidget } from './api/widgets';
import { getWidget } from './widgets/registry';

function App() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [gridMode, setGridMode] = useState(false);

  const handleAddWidget = useCallback(async (type: string) => {
    const def = getWidget(type);
    if (!def) return;
    await createWidget(type, def.defaultConfig);
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
