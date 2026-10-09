import { useState, useRef, useEffect } from 'react';
import { getAllWidgets, getWidget, type WidgetDefinition } from '../widgets/registry';
import { setPendingWidgetType, WIDGET_DRAG_MIME } from '../widgets/drag-session';
import type { Position } from '../widgets/types';
import { FiPlus, FiTrash2 } from 'react-icons/fi';
import { createRoot, type Root } from 'react-dom/client';
interface ToolbarProps {
  onAddWidget: (type: string) => Promise<Position | null>;
  onAddWidgetDeferred: (type: string) => Promise<Position | null>;
  onPredictAdd: (type: string) => Position | null;
  onRevealWidgets: () => void;
  onOpenTrash: () => void;
  /** Alto del TabBar, que va arriba. La barra se pega debajo. */
  topOffset: number;
}
export function Toolbar({
  onAddWidget,
  onAddWidgetDeferred,
  onPredictAdd,
  onRevealWidgets,
  onOpenTrash,
  topOffset,
}: ToolbarProps) {
  const availableWidgets = getAllWidgets();
  const [menuOpen, setMenuOpen] = useState(false);
  // Que boton se esta arrastrando. El arrastre es DnD nativo, asi que el
  // navegador deja de avisar por `:active` sobre el boton de origen: sin esto
  // no hay forma de saber en JS que sigue en uso.
  const [draggingType, setDraggingType] = useState<string | null>(null);
  const ghostRef = useRef<{ el: HTMLDivElement; root: Root } | null>(null);
  const destroyGhost = () => {
    setPendingWidgetType(null);
    if (ghostRef.current) {
      ghostRef.current.root.unmount();
      ghostRef.current.el.remove();
      ghostRef.current = null;
    }
  };
  useEffect(() => destroyGhost, []);
  const renderButtonGhost = (def: WidgetDefinition) => (
    <div className="flex items-center gap-2 rounded border border-gray-700/80 bg-gray-800/90 py-1.5 pl-1.5 pr-3 text-sm shadow-xl">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-gray-700/80 text-gray-300">
        <def.icon size={14} />
      </span>
      <span className="whitespace-nowrap text-gray-300">{def.label}</span>
    </div>
  );
  const startGhost = (e: React.DragEvent, type: string) => {
    const def = getWidget(type);
    if (!def) return;
    destroyGhost();
    // Se oculta la imagen nativa: el boton arrastrado ya es el ghost.
    e.dataTransfer.setDragImage(new Image(), 0, 0);
    setPendingWidgetType(type);
    setDraggingType(type);
    const el = document.createElement('div');
    el.style.cssText = `position:fixed;left:0;top:0;pointer-events:none;z-index:9999;transform:translate(${e.clientX}px, ${e.clientY}px);`;
    document.body.appendChild(el);
    const root = createRoot(el);
    root.render(renderButtonGhost(def));
    ghostRef.current = { el, root };
  };
  const moveGhost = (clientX: number, clientY: number) => {
    const g = ghostRef.current;
    if (!g) return;
    const w = g.el.offsetWidth;
    const h = g.el.offsetHeight;
    g.el.style.transform = `translate(${clientX - w / 2}px, ${clientY - h / 2}px)`;
  };
  // `destroyGhost` sola se usa tambien como cleanup de unmount, donde no se
  // debe tocar estado de React; el estado lo baja este wrapper.
  const endDrag = () => {
    setDraggingType(null);
    destroyGhost();
  };
  const handleMenuAdd = async (type: string) => {
    const def = getWidget(type);
    if (!def) return;
    // El widget siempre cae en la primera celda libre: no hay drop por pixel.
    const predicted = onPredictAdd(type);
    if (predicted) {
      try {
        await onAddWidgetDeferred(type);
      } finally {
        onRevealWidgets();
      }
      return;
    }
    await onAddWidget(type);
  };
  return (
    /*
      * La barra va DEBAJO del TabBar (topOffset). El borde inferior queda
      * solo en la fila de arriba: dos border-b apilados se leen como una
      * linea doble cuando se hace scroll.
      *
      * El + va a la izquierda (inicio) y la papelera a la derecha (fin).
      */
    <div
      className="sticky z-[var(--z-sticky)] flex items-center gap-2 bg-gray-900/90 px-4 py-1.5 backdrop-blur-sm"
      style={{ top: topOffset }}
    >
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Add widget"
          aria-expanded={menuOpen}
          className={`flex items-center justify-center border border-transparent p-1 transition-all duration-300 active:scale-90 ${
            menuOpen || availableWidgets.length === 0
              ? 'text-p2 drop-shadow-[0_0_5px_rgba(217,164,65,0.5)]'
              : 'text-gray-400 hover:text-gray-200 hover:drop-shadow-[0_0_5px_rgba(255,255,255,0.08)]'
          }`}
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center">
            <FiPlus
              key={menuOpen ? 'open' : 'closed'}
              size={20}
              style={{
                animation: `${menuOpen ? 'widget-menu-spin-open' : 'widget-menu-spin-close'} 0.9s cubic-bezier(0.4, 0, 0.2, 1) forwards`,
              }}
            />
          </span>
        </button>
        {/* El boton esta a la izquierda: el menu se abre hacia la derecha. */}
        <div
          className="absolute left-full top-0 z-[var(--z-menu)] ml-2 flex items-center gap-1.5"
          style={{
            visibility: menuOpen ? 'visible' : 'hidden',
            transition: menuOpen ? undefined : 'visibility 0s linear 2s',
            pointerEvents: menuOpen ? 'auto' : 'none',
          }}
        >
          {availableWidgets.map(([type, def], i) => (
            <button
              key={`${type}-${menuOpen ? 'open' : 'closed'}`}
              type="button"
              draggable
              data-active={draggingType === type}
              onDragStart={(e) => {
                e.dataTransfer.setData(WIDGET_DRAG_MIME, type);
                e.dataTransfer.effectAllowed = 'copy';
                startGhost(e, type);
              }}
              onDrag={(e) => moveGhost(e.clientX, e.clientY)}
              onDragEnd={endDrag}
              onClick={() => handleMenuAdd(type)}
              className="add-widget-item flex items-center gap-2.5 overflow-hidden whitespace-nowrap rounded border border-gray-700/80 bg-gray-800/80 py-1.5 pl-1.5 pr-3 text-sm shadow-lg transition-all duration-150 active:scale-90"
              style={{
                ['--i' as string]: i,
                animation: menuOpen
                  ? `widget-menu-deal 0.6s cubic-bezier(0.4, 0, 0.2, 1) ${i * 100}ms backwards`
                  : 'widget-menu-deal 0.6s cubic-bezier(0.4, 0, 0.2, 1) reverse forwards',
              }}
            >
              <span className="add-widget-item-icon flex h-6 w-6 shrink-0 items-center justify-center rounded bg-gray-700/80 text-gray-300 transition-colors">
                <def.icon size={14} />
              </span>
              <span className="add-widget-item-label text-gray-300 transition-colors">
                {def.label}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="ml-auto">
        <button
          type="button"
          onClick={onOpenTrash}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-gray-400 transition-all duration-150 hover:bg-white/5 hover:text-gray-200 active:scale-90"
          title="Open trash"
          aria-label="Open trash"
        >
          <FiTrash2 size={15} />
        </button>
      </div>
    </div>
  );
}
