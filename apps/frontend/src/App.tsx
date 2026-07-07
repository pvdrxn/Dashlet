import { Suspense, useCallback, useState } from 'react';
import { WidgetGrid } from './widgets';
import { Toolbar } from './components/Toolbar';
import { createWidget } from './api/widgets';
import { getWidget } from './widgets/registry';

function App() {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleAddWidget = useCallback(async (type: string) => {
    const def = getWidget(type);
    if (!def) return;
    await createWidget(type, def.defaultConfig);
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <main className="min-h-screen bg-gray-900">
      <Toolbar onAddWidget={handleAddWidget} />
      <div className="p-4">
        <Suspense fallback={<div className="flex items-center justify-center py-20 text-gray-400">Loading widgets...</div>}>
          <WidgetGrid key={refreshKey} onAddWidget={() => handleAddWidget('todo-list')} />
        </Suspense>
      </div>
    </main>
  );
}

export default App;
