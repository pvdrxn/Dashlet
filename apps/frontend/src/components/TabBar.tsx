import {
  useState,
  useCallback,
  useRef,
  useEffect,
  type CSSProperties,
  type RefObject,
} from 'react';
import { FiPlus, FiX, FiEdit2 } from 'react-icons/fi';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { TabDto } from '@widget-master/shared';

const HOLD_THRESHOLD = 180;
const MOVE_THRESHOLD = 6;

// Banda de capa de widget en arrastre. Debe coincidir con WidgetFrame.tsx y
// quedar por debajo del chrome (sticky = 1000). Ver la escala en index.css.
const Z_WIDGET_TOP = 100;

function TabName({ name }: { name: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflowing(el.scrollWidth > el.clientWidth + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [name]);

  return (
    <span
      ref={ref}
      className={`min-w-0 whitespace-nowrap overflow-hidden ${
        overflowing ? '[mask-image:linear-gradient(to_right,black_70%,transparent_96%)]' : ''
      }`}
    >
      {name}
    </span>
  );
}

interface TabPillProps {
  tab: TabDto;
  isActive: boolean;
  isEditing: boolean;
  draftName: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onDraftNameChange: (value: string) => void;
  onCommit: () => void;
  onCancelEdit: () => void;
  onActivate: (id: string) => void;
  onStartEdit: (tab: TabDto) => void;
  onDelete: (id: string) => void;
}

function TabPill({
  tab,
  isActive,
  isEditing,
  draftName,
  inputRef,
  onDraftNameChange,
  onCommit,
  onCancelEdit,
  onActivate,
  onStartEdit,
  onDelete,
}: TabPillProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.id,
    disabled: isEditing,
  });

  const nodeRef = useRef<HTMLDivElement | null>(null);
  const [dragBounds, setDragBounds] = useState<{ min: number; max: number } | null>(null);

  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      nodeRef.current = node;
      setNodeRef(node);
    },
    [setNodeRef],
  );

  useEffect(() => {
    if (isDragging && nodeRef.current?.parentElement) {
      const rect = nodeRef.current.getBoundingClientRect();
      const rowRect = nodeRef.current.parentElement.getBoundingClientRect();
      setDragBounds({
        min: rowRect.left - rect.left,
        max: rowRect.right - rect.right,
      });
    } else {
      setDragBounds(null);
    }
  }, [isDragging]);

  const clampedX = transform
    ? Math.min(Math.max(transform.x, dragBounds?.min ?? -Infinity), dragBounds?.max ?? Infinity)
    : 0;

  const style: CSSProperties = {
    transform: transform
      ? CSS.Transform.toString({ ...transform, x: clampedX, y: 0, scaleX: 1, scaleY: 1 })
      : undefined,
    transition,
    zIndex: isDragging ? Z_WIDGET_TOP : undefined,
  };

  return (
    <div
      ref={setRefs}
      style={style}
      {...attributes}
      data-tab-id={tab.id}
      role="tab"
      aria-selected={isActive}
      className={`group relative flex h-9 shrink-0 cursor-pointer select-none items-center px-3 text-sm transition-colors ${
        isEditing ? 'gap-0' : 'gap-1.5'
      } ${
        isActive ? 'text-white' : 'text-gray-400 hover:text-gray-200'
      } ${isDragging ? 'cursor-grabbing opacity-80' : ''}`}
      onClick={() => onActivate(tab.id)}
      {...listeners}
    >
      {/*
        Indicador de la tab activa: una regla de 2px en p2, no una caja.
        La tab deja de usar `bg-gray-800`, que es la superficie de widget: con
        relleno, radio y sombra era indistinguible de un widget. Asi la regla
        la conecta con el contenido de abajo y con el mismo token que marca
        "esto esta activo" (Pomodoro corriendo, widget en arrastre).
      */}
      {isActive && <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 bg-p2" />}
      {isEditing ? (
        <div className="relative min-w-0">
          <span aria-hidden className="invisible whitespace-nowrap text-sm">
            {draftName || '\u00A0'}
          </span>
          <input
            ref={inputRef}
            type="text"
            value={draftName}
            spellCheck={false}
            maxLength={40}
            onChange={(e) => onDraftNameChange(e.target.value)}
            onBlur={onCommit}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') onCommit();
              if (e.key === 'Escape') onCancelEdit();
            }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute inset-0 w-full select-text rounded-sm bg-gray-700/60 px-2 text-sm text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-gray-500/50"
            aria-label="Tab name"
          />
        </div>
      ) : (
        <TabName name={tab.name} />
      )}
      {!isEditing && (
        <button
          type="button"
          title="Rename tab"
          aria-label={`Rename tab ${tab.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onStartEdit(tab);
          }}
          className={`p-0.5 leading-none text-gray-500 transition-all duration-150 hover:text-gray-200 active:scale-90 ${
            isActive ? 'visible' : 'invisible group-hover:visible'
          }`}
        >
          <FiEdit2 size={13} />
        </button>
      )}
      <button
        type="button"
        title="Delete tab"
        aria-label={`Delete tab ${tab.name}`}
        onClick={(e) => {
          e.stopPropagation();
          onDelete(tab.id);
        }}
        className={`p-0.5 leading-none text-gray-500 transition-all duration-150 hover:bg-danger/10 hover:text-danger active:scale-90 ${
          isActive ? 'visible' : 'invisible group-hover:visible'
        }`}
      >
        <FiX size={13} />
      </button>
    </div>
  );
}

interface TabBarProps {
  tabs: TabDto[];
  activeTabId: string | null;
  widgetDragActive: boolean;
  onSelectTab: (id: string) => void;
  onCreateTab: () => void;
  onRenameTab: (id: string, name: string) => void;
  onDeleteTab: (id: string) => void;
  onReorderTabs: (orderedIds: string[]) => void;
  editingTabId: string | null;
  onEditingTabIdChange: (id: string | null) => void;
  /**
   * Nodo a la izquierda de la primera pestaña: el botón que abre la sidebar de
   * vistas. Vive acá, dentro del `TabBar`, y no en un contenedor por fuera,
   * para que quede en la barra sticky y la acompañe al scroll en vez de
   * quedarse pegado arriba mientras las pestañas se van.
   */
  leading?: React.ReactNode;
}

export function TabBar({
  tabs,
  activeTabId,
  widgetDragActive,
  onSelectTab,
  onCreateTab,
  onRenameTab,
  onDeleteTab,
  onReorderTabs,
  editingTabId,
  onEditingTabIdChange,
  leading,
}: TabBarProps) {
  const [draftName, setDraftName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: HOLD_THRESHOLD, distance: MOVE_THRESHOLD },
    }),
  );

  useEffect(() => {
    if (editingTabId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingTabId]);

  const commitName = useCallback(() => {
    if (!editingTabId) return;
    const name = draftName.trim();
    onEditingTabIdChange(null);
    if (name && name !== tabs.find((t) => t.id === editingTabId)?.name) {
      onRenameTab(editingTabId, name);
    }
  }, [editingTabId, draftName, tabs, onRenameTab, onEditingTabIdChange]);

  const startEditing = useCallback(
    (tab: TabDto) => {
      if (editingTabId === tab.id) return;
      setDraftName(tab.name);
      onEditingTabIdChange(tab.id);
    },
    [editingTabId, onEditingTabIdChange],
  );

  const handleTabClick = useCallback(
    (id: string) => {
      onSelectTab(id);
    },
    [onSelectTab],
  );

  useEffect(() => {
    if (!widgetDragActive) return;
    const onPointerMove = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const tabEl = el?.closest('[data-tab-id]');
      if (!tabEl) return;
      const tabId = tabEl.getAttribute('data-tab-id');
      if (tabId && tabId !== activeTabId) onSelectTab(tabId);
    };
    document.addEventListener('pointermove', onPointerMove);
    return () => document.removeEventListener('pointermove', onPointerMove);
  }, [widgetDragActive, activeTabId, onSelectTab]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const from = tabs.findIndex((t) => t.id === active.id);
      const to = tabs.findIndex((t) => t.id === over.id);
      if (from === -1 || to === -1) return;
      const reordered = [...tabs];
      const [moved] = reordered.splice(from, 1);
      reordered.splice(to, 0, moved);
      onReorderTabs(reordered.map((t) => t.id));
    },
    [tabs, onReorderTabs],
  );

  return (
    <div
      className="sticky top-0 z-[var(--z-sticky)] flex items-center gap-1.5 overflow-hidden border-b border-gray-700/60 bg-gray-900/90 px-4 backdrop-blur-sm"
      style={{ top: 0 }}
    >
      {leading}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={tabs.map((t) => t.id)} strategy={horizontalListSortingStrategy}>
          <div className="flex min-w-0 items-center gap-1.5">
            {tabs.map((tab) => (
              <TabPill
                key={tab.id}
                tab={tab}
                isActive={tab.id === activeTabId}
                isEditing={tab.id === editingTabId}
                draftName={draftName}
                inputRef={inputRef}
                onDraftNameChange={setDraftName}
                onCommit={commitName}
                onCancelEdit={() => onEditingTabIdChange(null)}
                onActivate={handleTabClick}
                onStartEdit={startEditing}
                onDelete={onDeleteTab}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <button
        type="button"
        title="New tab"
        aria-label="New tab"
        onClick={onCreateTab}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-gray-400 transition-all duration-150 hover:text-gray-200 active:scale-90"
      >
        <FiPlus size={16} />
      </button>
    </div>
  );
}
