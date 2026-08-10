import { useCallback, useState, useRef } from 'react';
import { WidgetGrid } from './widgets';
import { Toolbar } from './components/Toolbar';
import { TrashWindow } from './components/TrashWindow';

function App() {
  const [gridMode, setGridMode] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const addWidgetRef = useRef<((type: string) => void) | null>(null);
  const refreshWidgetsRef = useRef<(() => void) | null>(null);

  const handleToggleGridMode = useCallback(() => {
    setGridMode((prev) => !prev);
  }, []);

  const handleRestoreComplete = useCallback(() => {
    refreshWidgetsRef.current?.();
  }, []);

  return (
    <main className="min-h-screen bg-gray-900">
      <Toolbar
        onAddWidget={(type) => addWidgetRef.current?.(type)}
        gridMode={gridMode}
        onToggleGridMode={handleToggleGridMode}
        onOpenTrash={() => setTrashOpen(true)}
      />
      <div className="p-4">
        <WidgetGrid gridMode={gridMode} onAddWidgetRef={addWidgetRef} onRefreshRef={refreshWidgetsRef} />
      </div>
      {trashOpen && <TrashWindow onClose={() => setTrashOpen(false)} onRestoreComplete={handleRestoreComplete} />}
    </main>
  );
}

export default App;