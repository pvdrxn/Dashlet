import { useCallback, useState, useRef } from 'react';
import { WidgetGrid } from './widgets';
import { Toolbar } from './components/Toolbar';

function App() {
  const [gridMode, setGridMode] = useState(false);
  const addWidgetRef = useRef<((type: string) => void) | null>(null);

  const handleToggleGridMode = useCallback(() => {
    setGridMode((prev) => !prev);
  }, []);

  return (
    <main className="min-h-screen bg-gray-900">
      <Toolbar onAddWidget={(type) => addWidgetRef.current?.(type)} gridMode={gridMode} onToggleGridMode={handleToggleGridMode} />
      <div className="p-4">
        <WidgetGrid gridMode={gridMode} onAddWidgetRef={addWidgetRef} />
      </div>
    </main>
  );
}

export default App;
