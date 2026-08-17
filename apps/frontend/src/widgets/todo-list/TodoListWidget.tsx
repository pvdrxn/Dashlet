import {
  Fragment,
  memo,
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  type ComponentType,
  type InputHTMLAttributes,
  type ReactNode,
  type RefObject,
} from 'react';
import { FiChevronDown, FiChevronRight, FiCornerDownRight, FiPlus, FiTrash2 } from 'react-icons/fi';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  completedAt?: number;
  parentId?: string | null;
  collapsed?: boolean;
}

interface TaskRowProps {
  item: TodoItem;
  level: number;
  childCount: number;
  completedChildCount: number;
  toggleItem: (id: string) => void;
  removeItem: (id: string) => void;
  editItem: (id: string, text: string) => void;
  toggleIndent: (id: string) => void;
  toggleCollapse: (id: string) => void;
}

interface TodoListConfig {
  title?: string;
  items?: TodoItem[];
}

interface TodoListWidgetProps {
  config: Record<string, unknown>;
  onConfigChange: (config: Record<string, unknown>) => void;
}

function genId(prefix = 'todo'): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function ensureUniqueIds(items: TodoItem[]): TodoItem[] {
  const seen = new Set<string>();
  let hasDuplicates = false;

  const sanitized = items.map((item) => {
    if (!item || !item.id || seen.has(item.id)) {
      hasDuplicates = true;
      return {
        id: genId('todo'),
        text: item?.text ?? '',
        completed: Boolean(item?.completed),
        completedAt: item?.completedAt ?? undefined,
        parentId: item?.parentId ?? undefined,
        collapsed: Boolean(item?.collapsed),
      };
    }
    seen.add(item.id);
    return item;
  });

  return hasDuplicates ? sanitized : items;
}

function buildChildrenMap(items: TodoItem[]): Map<string, TodoItem[]> {
  const map = new Map<string, TodoItem[]>();
  for (const item of items) {
    if (!item.parentId) continue;
    const siblings = map.get(item.parentId);
    if (siblings) {
      siblings.push(item);
    } else {
      map.set(item.parentId, [item]);
    }
  }
  return map;
}

function toTreeOrder(items: TodoItem[]): TodoItem[] {
  const childrenMap = buildChildrenMap(items);
  const ids = new Set(items.map((i) => i.id));
  const roots = items.filter((i) => !i.parentId || !ids.has(i.parentId));
  const ordered: TodoItem[] = [];
  const visit = (item: TodoItem) => {
    ordered.push(item);
    for (const child of childrenMap.get(item.id) ?? []) visit(child);
  };
  for (const root of roots) visit(root);
  return ordered;
}

function AutoGrowInput({
  value,
  inputRef,
  minWidth = 48,
  maxWidth = 240,
  expand = false,
  className = '',
  placeholder,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  inputRef?: RefObject<HTMLInputElement | null>;
  minWidth?: number;
  maxWidth?: number | string;
  expand?: boolean;
}) {
  const spanRef = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (spanRef.current) setWidth(spanRef.current.offsetWidth);
  }, [value, placeholder]);

  const fontClass = className.includes('text-xs') ? 'text-xs' : 'text-sm';
  const paddingClass = className.includes('px-2') ? 'px-2' : 'px-1';
  const verticalPadClass = className.includes('py-1') ? 'py-1' : 'py-0.5';

  return (
    <div
      className={`relative inline-block ${expand ? 'min-w-0 flex-1' : ''}`}
      style={
        expand
          ? undefined
          : { width: Math.max(width, minWidth), minWidth, maxWidth }
      }
    >
      <span
        ref={spanRef}
        aria-hidden
        className={`invisible inline-block whitespace-pre ${fontClass} ${paddingClass} ${verticalPadClass} border border-transparent`}
      >
        {value || placeholder || ''}
      </span>
      <input
        {...rest}
        ref={inputRef}
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        className={`absolute inset-0 w-full ${className}`}
      />
    </div>
  );
}

const TaskRowContent = memo(function TaskRowContent({
  item,
  level,
  childCount,
  completedChildCount,
  editing,
  onEditingChange,
  toggleItem,
  removeItem,
  editItem,
  toggleIndent,
  toggleCollapse,
}: {
  item: TodoItem;
  level: number;
  childCount: number;
  completedChildCount: number;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  toggleItem: (id: string) => void;
  removeItem: (id: string) => void;
  editItem: (id: string, text: string) => void;
  toggleIndent: (id: string) => void;
  toggleCollapse: (id: string) => void;
}) {
  const [editText, setEditText] = useState(item.text);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditText(item.text);
  }, [item.text]);

  useEffect(() => {
    if (editing && editInputRef.current) editInputRef.current.focus();
  }, [editing]);

  return (
    <>
      <button
        type="button"
        onClick={() => toggleIndent(item.id)}
        style={{ left: 4 + level * 16 }}
        title={item.parentId ? 'Outdent (make it a task)' : 'Indent (make it a subtask)'}
        className={`absolute top-1/2 -translate-y-1/2 flex items-center px-0 leading-none ${
          item.parentId
            ? 'text-blue-400'
            : 'invisible text-gray-600 group-hover/item:visible hover:text-gray-300'
        }`}
        aria-label={
          item.parentId
            ? `Convert subtask ${item.text} to a task`
            : `Convert task ${item.text} to a subtask`
        }
      >
        <FiCornerDownRight size={15} />
      </button>
      <input
        type="checkbox"
        checked={item.completed}
        onChange={() => toggleItem(item.id)}
        className="h-3.5 w-3.5 shrink-0 accent-blue-500"
        aria-label={`Mark "${item.text}" as completed`}
      />
      {editing ? (
        <AutoGrowInput
          inputRef={editInputRef}
          value={editText}
          minWidth={48}
          maxWidth="calc(100% - 4rem)"
          onChange={(e) => setEditText(e.target.value)}
          onBlur={() => {
            if (editText.trim() !== item.text) {
              editItem(item.id, editText.trim());
            }
            onEditingChange(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (editText.trim() !== item.text) {
                editItem(item.id, editText.trim());
              }
              onEditingChange(false);
            }
            if (e.key === 'Escape') {
              setEditText(item.text);
              onEditingChange(false);
            }
          }}
          className="rounded border border-blue-500 bg-gray-800 px-1 py-0.5 text-sm text-gray-200 outline-none"
          aria-label="Edit task text"
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setEditText(item.text);
            onEditingChange(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setEditText(item.text);
              onEditingChange(true);
            }
          }}
          className={`min-w-0 flex-1 cursor-text break-words bg-transparent p-0 text-left text-sm ${
            item.completed ? 'text-gray-500 line-through' : 'text-gray-300'
          }`}
        >
          {item.text}
        </button>
      )}
      <div className="ml-auto flex items-center gap-1.5">
        {childCount > 0 && (
          <button
            type="button"
            onClick={() => toggleCollapse(item.id)}
            className="flex items-center text-gray-400 hover:text-gray-200"
            aria-label={
              item.collapsed
                ? `Expand subtasks of ${item.text}`
                : `Collapse subtasks of ${item.text}`
            }
          >
            {item.collapsed ? <FiChevronDown size={16} /> : <FiChevronRight size={16} />}
          </button>
        )}
        {childCount > 0 && (
          <span className="rounded-full bg-gray-600/50 px-1.5 text-xs leading-4 text-gray-300 tabular-nums">
            {completedChildCount}/{childCount}
          </span>
        )}
        <button
          type="button"
          onClick={() => removeItem(item.id)}
          className="invisible mr-1 text-base text-gray-500 group-hover/item:visible hover:text-red-400"
          aria-label={`Delete task ${item.text}`}
        >
          &#x2715;
        </button>
      </div>
    </>
  );
});

const SortableItem = memo(function SortableItem({
  item,
  level,
  childCount,
  completedChildCount,
  toggleItem,
  removeItem,
  editItem,
  toggleIndent,
  toggleCollapse,
}: TaskRowProps) {
  const [editing, setEditing] = useState(false);

  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: editing,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      style={{ ...style, paddingLeft: 21 + level * 16 }}
      className="group/item mx-0.5 relative flex cursor-grab touch-none items-center gap-1.5 rounded py-0.5 hover:bg-gray-700/50 active:cursor-grabbing"
    >
      <TaskRowContent
        item={item}
        level={level}
        childCount={childCount}
        completedChildCount={completedChildCount}
        editing={editing}
        onEditingChange={setEditing}
        toggleItem={toggleItem}
        removeItem={removeItem}
        editItem={editItem}
        toggleIndent={toggleIndent}
        toggleCollapse={toggleCollapse}
      />
    </div>
  );
});

const StaticItemRow = memo(function StaticItemRow({
  item,
  level,
  childCount,
  completedChildCount,
  toggleItem,
  removeItem,
  editItem,
  toggleIndent,
  toggleCollapse,
}: TaskRowProps) {
  const [editing, setEditing] = useState(false);

  return (
    <div
      style={{ paddingLeft: 21 + level * 16 }}
      className="group/item mx-0.5 relative flex cursor-default items-center gap-1.5 rounded py-0.5 hover:bg-gray-700/50"
    >
      <TaskRowContent
        item={item}
        level={level}
        childCount={childCount}
        completedChildCount={completedChildCount}
        editing={editing}
        onEditingChange={setEditing}
        toggleItem={toggleItem}
        removeItem={removeItem}
        editItem={editItem}
        toggleIndent={toggleIndent}
        toggleCollapse={toggleCollapse}
      />
    </div>
  );
});

export const TodoListWidget = memo(function TodoListWidget({ config, onConfigChange }: TodoListWidgetProps) {
  const { items: rawItems = [] } = (config ?? {}) as TodoListConfig;
  const [newText, setNewText] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [completedExpanded, setCompletedExpanded] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);

  const items = useMemo(() => ensureUniqueIds(rawItems), [rawItems]);
  const childrenMap = useMemo(() => buildChildrenMap(items), [items]);

  const activeItem = activeId ? items.find((i) => i.id === activeId) ?? null : null;
  const activeChildren = activeItem ? (childrenMap.get(activeItem.id) ?? []) : [];

  useEffect(() => {
    if (items !== rawItems) {
      onConfigChange({ ...config, items });
    }
  }, [items, rawItems, config, onConfigChange]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const addItem = useCallback(() => {
    const trimmed = newText.trim();
    if (!trimmed) return;

    const newItem: TodoItem = {
      id: genId('todo'),
      text: trimmed,
      completed: false,
    };

    onConfigChange({
      ...config,
      items: [...items, newItem],
    });
    setNewText('');
  }, [newText, config, items, onConfigChange]);

  const toggleItem = useCallback((id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const willComplete = !item.completed;
    const now = Date.now();
    let toggled = items.map((i) =>
      i.id === id
        ? willComplete
          ? { ...i, completed: true, completedAt: now }
          : { ...i, completed: false, completedAt: undefined }
        : i,
    );

    if (willComplete && item.parentId) {
      const siblings = toggled.filter((i) => i.parentId === item.parentId);
      if (siblings.length > 0 && siblings.every((s) => s.completed)) {
        toggled = toggled.map((i) =>
          i.id === item.parentId
            ? { ...i, completed: true, completedAt: now }
            : i,
        );
      }
    }

    onConfigChange({ ...config, items: toggled });
  }, [config, items, onConfigChange]);

  const editItem = useCallback((id: string, text: string) => {
    onConfigChange({
      ...config,
      items: items.map((item) =>
        item.id === id ? { ...item, text } : item,
      ),
    });
  }, [config, items, onConfigChange]);

  const removeItem = useCallback((id: string) => {
    onConfigChange({
      ...config,
      items: items
        .filter((item) => item.id !== id)
        .map((item) => (item.parentId === id ? { ...item, parentId: undefined } : item)),
    });
  }, [config, items, onConfigChange]);

  const clearCompleted = useCallback(() => {
    const removedIds = new Set(
      items.filter((item) => item.completed).map((item) => item.id),
    );
    onConfigChange({
      ...config,
      items: items
        .filter((item) => !removedIds.has(item.id))
        .map((item) =>
          item.parentId && removedIds.has(item.parentId)
            ? { ...item, parentId: undefined }
            : item,
        ),
    });
    setConfirmClear(false);
  }, [config, items, onConfigChange]);

  const toggleIndent = useCallback((id: string) => {
    const index = items.findIndex((i) => i.id === id);
    if (index === -1) return;

    if (items[index].parentId) {
      onConfigChange({
        ...config,
        items: items.map((item) =>
          item.id === id ? { ...item, parentId: undefined } : item,
        ),
      });
      return;
    }

    const previousRoot = [...items]
      .slice(0, index)
      .reverse()
      .find((item) => !item.parentId);
    if (!previousRoot) return;
    onConfigChange({
      ...config,
      items: items.map((item) =>
        item.id === id || item.parentId === id
          ? { ...item, parentId: previousRoot.id }
          : item,
      ),
    });
  }, [items, config, onConfigChange]);

  const toggleCollapse = useCallback((id: string) => {
    onConfigChange({
      ...config,
      items: items.map((item) =>
        item.id === id ? { ...item, collapsed: !item.collapsed } : item,
      ),
    });
  }, [config, items, onConfigChange]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const oldIndex = items.findIndex((i) => i.id === activeId);
    const newIndex = items.findIndex((i) => i.id === overId);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = [...items];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);

    let result = reordered;
    if (moved.parentId) {
      const movedIndex = reordered.findIndex((i) => i.id === moved.id);
      const newParent = [...reordered]
        .slice(0, movedIndex)
        .reverse()
        .find((i) => !i.parentId);
      result = reordered.map((i) =>
        i.id === moved.id
          ? { ...i, parentId: newParent?.id ?? undefined }
          : i,
      );
    }

    onConfigChange({ ...config, items: toTreeOrder(result) });
  }, [items, config, onConfigChange]);

  const view = useMemo(() => {
    const ids = new Set(items.map((i) => i.id));
    const isRoot = (item: TodoItem) => !item.parentId || !ids.has(item.parentId);
    const roots = items.filter(isRoot);

    const completedRoots = roots
      .filter((root) => root.completed)
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));

    const excludedIds = new Set<string>();
    const collect = (parentId: string) => {
      for (const child of items) {
        if (child.parentId === parentId && !excludedIds.has(child.id)) {
          excludedIds.add(child.id);
          collect(child.id);
        }
      }
    };
    for (const root of completedRoots) {
      excludedIds.add(root.id);
      collect(root.id);
    }

    const renderNode = (
      node: TodoItem,
      level: number,
      Row: ComponentType<TaskRowProps>,
    ): ReactNode => {
      const children = childrenMap.get(node.id) ?? [];
      return (
        <Fragment key={node.id}>
          <Row
            item={node}
            level={level}
            childCount={children.length}
            completedChildCount={children.filter((child) => child.completed).length}
            toggleItem={toggleItem}
            removeItem={removeItem}
            editItem={editItem}
            toggleIndent={toggleIndent}
            toggleCollapse={toggleCollapse}
          />
          <div
            className={`grid transition-[grid-template-rows] duration-150 ease-in-out ${
              node.collapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'
            }`}
          >
            <div className="min-h-0 space-y-0.5 overflow-hidden">
              {children.map((child) => renderNode(child, level + 1, Row))}
            </div>
          </div>
        </Fragment>
      );
    };

    const activeRoots = roots.filter((root) => !root.completed);
    let completedCount = 0;
    for (const root of completedRoots) {
      completedCount += 1;
      const stack = [...(childrenMap.get(root.id) ?? [])];
      while (stack.length) {
        completedCount += 1;
        const node = stack.pop()!;
        stack.push(...(childrenMap.get(node.id) ?? []));
      }
    }

    return {
      sortableIds: items.filter((i) => !excludedIds.has(i.id)).map((i) => i.id),
      activeTree: activeRoots.map((root) => renderNode(root, 0, SortableItem)),
      completedTree: completedExpanded
        ? completedRoots.map((root) => renderNode(root, 0, StaticItemRow))
        : null,
      completedCount,
    };
  }, [items, childrenMap, toggleItem, removeItem, editItem, toggleIndent, toggleCollapse, completedExpanded]);

  return (
    <div className="relative flex h-full flex-col gap-2">

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={view.sortableIds} strategy={verticalListSortingStrategy}>
          <div className="-mx-3 flex-1 space-y-0.5 overflow-auto">
            {view.activeTree}
            {view.completedCount > 0 && (
              <div className="mt-2 border-t border-gray-700/70 pt-1">
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => setCompletedExpanded((v) => !v)}
                    className="flex min-w-0 flex-1 items-center gap-1 rounded px-1 py-0.5 text-left text-xs font-medium text-gray-500 hover:text-gray-300"
                    aria-expanded={completedExpanded}
                  >
                    {completedExpanded ? (
                      <FiChevronDown size={14} />
                    ) : (
                      <FiChevronRight size={14} />
                    )}
                    <span>Completed ({view.completedCount})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(true)}
                    title="Delete all completed tasks"
                    aria-label="Delete all completed tasks"
                    className="rounded p-1 text-gray-500 hover:bg-red-500/10 hover:text-red-400"
                  >
                    <FiTrash2 size={14} />
                  </button>
                </div>
                {view.completedTree}
              </div>
            )}
          </div>
        </SortableContext>
        <DragOverlay>
          {activeItem ? (
            <div
              className="pointer-events-none group/item relative inline-flex cursor-grabbing touch-none items-center gap-1.5 rounded bg-gray-800 py-0.5 shadow-2xl ring-1 ring-gray-600"
              style={{ paddingLeft: 21 + (activeItem.parentId ? 1 : 0) * 16 }}
            >
              <TaskRowContent
                item={activeItem}
                level={activeItem.parentId ? 1 : 0}
                childCount={activeChildren.length}
                completedChildCount={activeChildren.filter((c) => c.completed).length}
                editing={false}
                onEditingChange={() => {}}
                toggleItem={toggleItem}
                removeItem={removeItem}
                editItem={editItem}
                toggleIndent={toggleIndent}
                toggleCollapse={toggleCollapse}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <form
        onSubmit={(e) => { e.preventDefault(); addItem(); }}
        className="flex gap-1 border-t border-gray-700 pt-1"
      >
        <AutoGrowInput
          expand
          value={newText}
          placeholder="Add a task..."
          onChange={(e) => setNewText(e.target.value)}
          className="rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-200 outline-none placeholder-gray-500 focus:border-blue-400"
          aria-label="New task text"
        />
        <button
          type="submit"
          title="Add task"
          className="rounded bg-blue-600 p-1 text-white hover:bg-blue-500 disabled:opacity-50"
          disabled={!newText.trim()}
          aria-label="Add task"
        >
          <FiPlus size={16} />
        </button>
      </form>

      {confirmClear && (
        <div className="absolute -inset-3 z-10 flex items-center justify-center rounded-[4px] bg-black/70 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Confirm delete completed tasks"
            className="w-full max-w-56 rounded-lg border border-gray-600 bg-gray-800 p-3 shadow-xl"
          >
            <p className="text-sm text-gray-200">
              Delete {view.completedCount} completed{' '}
              {view.completedCount === 1 ? 'task' : 'tasks'}?
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="rounded bg-gray-600 px-2.5 py-1 text-xs text-white hover:bg-gray-500"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={clearCompleted}
                className="rounded bg-red-600 px-2.5 py-1 text-xs text-white hover:bg-red-500"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
