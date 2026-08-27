import { Suspense, useState, useRef, useEffect } from 'react';
import { getAllWidgets, getWidget, type WidgetDefinition } from '../widgets/registry';
import type { Position } from '../widgets/types';
import { FiPlus, FiTrash2, FiMoreVertical } from 'react-icons/fi';
import { createRoot, type Root } from 'react-dom/client';
import { snapUpW, snapUpH } from '../widgets/grid-utils';

interface ToolbarProps {
  onAddWidget: (type: string) => Promise<Position | null>;
  onAddWidgetDeferred: (type: string) => Promise<Position | null>;
  onPredictAdd: (type: string) => Position | null;
  onRevealWidgets: () => void;
  onCheckPlacement: (clientX: number, clientY: number, w: number, h: number) => boolean | null;
  onOpenTrash: () => void;
}

function getActiveDropArea(): HTMLElement | null {
  const areas = document.querySelectorAll<HTMLElement>('[data-dashboard-tab-id]');
  for (const area of areas) {
    if (area.getClientRects().length > 0) return area;
  }
  return null;
}

function isInsideDashboard(clientX: number, clientY: number): boolean {
  const r = getActiveDropArea()?.getBoundingClientRect();
  if (!r) return false;
  return (
    clientX >= r.left && clientX <= r.right &&
    clientY >= r.top && clientY <= r.bottom
  );
}

export function Toolbar({
  onAddWidget,
  onAddWidgetDeferred,
  onPredictAdd,
  onRevealWidgets,
  onCheckPlacement,
  onOpenTrash,
}: ToolbarProps) {
  const availableWidgets = getAllWidgets();
  const [menuOpen, setMenuOpen] = useState(false);
  const ghostRef = useRef<{
    el: HTMLDivElement;
    root: Root;
    def: WidgetDefinition;
    mode: 'button' | 'widget';
  } | null>(null);

  const destroyGhost = () => {
    if (ghostRef.current) {
      ghostRef.current.root.unmount();
      ghostRef.current.el.remove();
      ghostRef.current = null;
    }
  };

  useEffect(() => destroyGhost, []);

  const applyPlacementTint = (clientX: number, clientY: number) => {
    const ghost = ghostRef.current;
    if (!ghost || ghost.mode !== 'widget') return;
    const w = snapUpW(ghost.def.minSize.w);
    const h = snapUpH(ghost.def.minSize.h);
    const area = getActiveDropArea();
    if (!area) return;
    const rect = area.getBoundingClientRect();
    const x = clientX - rect.left - w / 2;
    const y = clientY - rect.top - h / 2;
    const valid = onCheckPlacement(x, y, ghost.def.minSize.w, ghost.def.minSize.h);
    if (valid === null) return;
    ghost.el.style.borderColor = valid ? 'rgba(59,130,246,0.6)' : 'rgba(239,68,68,0.6)';
  };

  const renderButtonGhost = (def: WidgetDefinition) => (
    <div className="flex items-center gap-2 rounded-[4px] border border-gray-700/80 bg-gray-800/90 py-1.5 pl-1.5 pr-3 text-sm shadow-xl">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] bg-gray-700/80 text-gray-300">
        <def.icon size={14} />
      </span>
      <span className="whitespace-nowrap text-gray-300">{def.label}</span>
    </div>
  );

  const renderWidgetGhost = (def: WidgetDefinition) => (
    <div className="flex h-full flex-col">
      <div className="flex h-[25px] shrink-0 items-center gap-1.5 border-b border-gray-700/60 px-2">
        <FiMoreVertical size={15} className="text-gray-500" />
        <span className="truncate text-sm text-white">{def.label}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden p-3">
        <Suspense fallback={null}>
          <def.component config={def.defaultConfig} onConfigChange={() => {}} />
        </Suspense>
      </div>
    </div>
  );

  const moveGhost = (clientX: number, clientY: number) => {
    if (!ghostRef.current) return;
    const w = ghostRef.current.el.offsetWidth;
    const h = ghostRef.current.el.offsetHeight;
    ghostRef.current.el.style.transform = `translate(${clientX - w / 2}px,${clientY - h / 2}px)`;
  };

  const setGhostMode = (mode: 'button' | 'widget') => {
    if (!ghostRef.current || ghostRef.current.mode === mode) return;
    const { el, root, def } = ghostRef.current;
    ghostRef.current.mode = mode;
    if (mode === 'widget') {
      el.style.width = `${def.minSize.w}px`;
      el.style.height = `${def.minSize.h}px`;
      el.style.background = '#1f2937';
      el.style.border = '1px solid #4b5563';
      el.style.borderRadius = '4px';
      el.style.boxShadow = '0 18px 44px rgba(0,0,0,0.6)';
      el.style.overflow = 'hidden';
      el.style.opacity = '0.92';
    } else {
      el.style.width = 'auto';
      el.style.height = 'auto';
      el.style.background = '';
      el.style.border = '';
      el.style.borderRadius = '';
      el.style.boxShadow = '';
      el.style.overflow = '';
      el.style.opacity = '';
    }
    root.render(mode === 'widget' ? renderWidgetGhost(def) : renderButtonGhost(def));
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = 'ghost-pop 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)';
  };

  const startGhost = (e: React.DragEvent, type: string) => {
    const def = getWidget(type);
    if (!def) return;
    destroyGhost();
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    e.dataTransfer.setDragImage(canvas, 0, 0);

    const el = document.createElement('div');
    el.style.cssText = `position:fixed;left:0;top:0;width:auto;height:auto;pointer-events:none;z-index:9999;transform:translate(${e.clientX}px,${e.clientY}px);`;
    document.body.appendChild(el);

    const root = createRoot(el);
    root.render(renderButtonGhost(def));
    ghostRef.current = { el, root, def, mode: 'button' };
    moveGhost(e.clientX, e.clientY);
  };

  const flyToDashboard = (fromRect: DOMRect, def: WidgetDefinition, pos: Position) => {
    return new Promise<void>((resolve) => {
      const area = getActiveDropArea();
      if (!area) {
        resolve();
        return;
      }
      const areaRect = area.getBoundingClientRect();

      const el = document.createElement('div');
      el.style.cssText = `position:fixed;left:${fromRect.left + fromRect.width / 2}px;top:${
        fromRect.top + fromRect.height / 2
      }px;width:${Math.max(fromRect.width, 40)}px;height:${fromRect.height}px;transform:translate(-50%,-50%);z-index:9998;pointer-events:none;border-radius:4px;overflow:hidden;opacity:0.95;box-shadow:0 18px 44px rgba(0,0,0,0.6);transition:all 0.45s cubic-bezier(0.4,0,0.2,1);`;
      document.body.appendChild(el);
      const root = createRoot(el);
      root.render(renderButtonGhost(def));

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.style.left = `${areaRect.left + pos.x + pos.w / 2}px`;
          el.style.top = `${areaRect.top + pos.y + pos.h / 2}px`;
          el.style.width = `${pos.w}px`;
          el.style.height = `${pos.h}px`;
          el.style.border = '1px solid rgba(59,130,246,0.5)';
        });
      });

      setTimeout(() => {
        resolve();
        el.style.opacity = '0';
        setTimeout(() => {
          root.unmount();
          el.remove();
        }, 250);
      }, 460);
    });
  };

  const handleMenuAdd = async (e: React.MouseEvent<HTMLButtonElement>, type: string) => {
    const fromRect = e.currentTarget.getBoundingClientRect();
    const def = getWidget(type);
    if (!def) return;

    // predict the landing slot locally so the flight starts immediately,
    // then reveal the real widget only once the ghost has landed
    const predictedPos = onPredictAdd(type);
    if (predictedPos) {
      const flight = flyToDashboard(fromRect, def, predictedPos);
      try {
        await onAddWidgetDeferred(type);
      } finally {
        await flight;
        onRevealWidgets();
      }
      return;
    }

    const pos = await onAddWidget(type);
    if (!pos) return;
    void flyToDashboard(fromRect, def, pos);
  };

  return (
    <div className="sticky top-0 z-40 flex items-center gap-2 border-b border-gray-700/60 bg-gray-900/90 px-4 py-2 backdrop-blur-sm">
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Add widget"
          aria-expanded={menuOpen}
          className={`flex items-center justify-center border border-transparent py-1.5 transition-all duration-300 active:scale-90 ${
            menuOpen || Object.keys(availableWidgets).length === 0
              ? 'text-blue-400 drop-shadow-[0_0_5px_rgba(59,130,246,1)]'
              : 'text-gray-400 hover:text-blue-400 hover:drop-shadow-[0_0_5px_rgba(59,130,246,1)]'
          }`}
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center">
            <FiPlus
              key={menuOpen ? 'open' : 'closed'}
              size={26}
              style={{
                animation: `${menuOpen ? 'widget-menu-spin-open' : 'widget-menu-spin-close'} 0.9s cubic-bezier(0.4, 0, 0.2, 1) forwards`,
              }}
            />
          </span>
        </button>
        <div
          className="absolute left-full top-0 z-50 ml-2 flex items-center gap-1.5"
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
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', type);
                e.dataTransfer.effectAllowed = 'copy';
                startGhost(e, type);
              }}
              onDrag={(e) => {
                moveGhost(e.clientX, e.clientY);
                setGhostMode(isInsideDashboard(e.clientX, e.clientY) ? 'widget' : 'button');
                applyPlacementTint(e.clientX, e.clientY);
              }}
              onDragEnd={destroyGhost}
              onClick={(e) => handleMenuAdd(e, type)}
              className="group flex items-center gap-2.5 overflow-hidden whitespace-nowrap rounded-[4px] border border-gray-700/80 bg-gray-800/80 py-1.5 pl-1.5 pr-3 text-sm shadow-lg transition-all duration-150 hover:border-blue-500/40 hover:bg-blue-500/10 active:scale-90"
              style={{
                ['--i' as string]: i,
                animation: menuOpen
                  ? `widget-menu-deal 0.6s cubic-bezier(0.4, 0, 0.2, 1) ${i * 100}ms backwards`
                  : 'widget-menu-deal 0.6s cubic-bezier(0.4, 0, 0.2, 1) reverse forwards',
              }}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] bg-gray-700/80 text-gray-300 transition-colors group-hover:bg-blue-500/20 group-hover:text-blue-400">
                <def.icon size={14} />
              </span>
              <span className="text-gray-300 transition-colors group-hover:text-blue-300">{def.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenTrash}
          className="rounded-md border border-gray-600 px-2.5 py-1 text-sm text-gray-400 transition-all duration-150 hover:bg-gray-700 hover:text-gray-200 active:scale-90"
          title="Open trash"
        >
          <FiTrash2 size={15} className="inline-block -mt-0.5" />
        </button>
      </div>
    </div>
  );
}
