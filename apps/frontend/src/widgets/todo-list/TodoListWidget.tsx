import { useState, useCallback, useRef, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
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
}

interface TodoListConfig {
  title?: string;
  items?: TodoItem[];
}

interface TodoListWidgetProps {
  config: Record<string, unknown>;
  onConfigChange: (config: Record<string, unknown>) => void;
}

let nextId = 1;
function genId() { return `todo-${nextId++}`; }

function SortableItem({
  item,
  toggleItem,
  removeItem,
  editItem,
}: {
  item: TodoItem;
  toggleItem: (id: string) => void;
  removeItem: (id: string) => void;
  editItem: (id: string, text: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(item.text);
  const editInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing && editInputRef.current) editInputRef.current.focus(); }, [editing]);

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 group/item rounded px-0.5 hover:bg-gray-700/50">
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none text-gray-600 hover:text-gray-400 text-sm leading-none px-0.5"
      >
        &#x2630;
      </button>
      <input
        type="checkbox"
        checked={item.completed}
        onChange={() => toggleItem(item.id)}
        className="h-3.5 w-3.5 accent-blue-500 shrink-0"
        aria-label={`Mark "${item.text}" as completed`}
      />
      {editing ? (
        <input
          ref={editInputRef}
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={() => { editItem(item.id, editText); setEditing(false); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { editItem(item.id, editText); setEditing(false); }
            if (e.key === 'Escape') { setEditText(item.text); setEditing(false); }
          }}
          className="flex-1 rounded border border-blue-500 bg-gray-800 px-1 py-0.5 text-sm text-gray-200 outline-none"
          aria-label="Edit task text"
        />
      ) : (
        <button
          type="button"
          onClick={() => { setEditText(item.text); setEditing(true); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditText(item.text); setEditing(true); } }}
          className={`flex-1 text-sm cursor-text bg-transparent border-none p-0 text-left ${item.completed ? 'text-gray-500 line-through' : 'text-gray-300'}`}
        >
          {item.text}
        </button>
      )}
      <button
        type="button"
        onClick={() => removeItem(item.id)}
        className="invisible group-hover/item:visible text-xs text-gray-500 hover:text-red-400"
      >
        &#x2715;
      </button>
    </div>
  );
}

export function TodoListWidget({ config, onConfigChange }: TodoListWidgetProps) {
  const { title = 'Todo List', items = [] } = config as TodoListConfig;
  const [newText, setNewText] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const addItem = useCallback(() => {
    if (!newText.trim()) return;
    onConfigChange({
      ...config,
      items: [...items, { id: genId(), text: newText.trim(), completed: false }],
    });
    setNewText('');
  }, [newText, config, items, onConfigChange]);

  const toggleItem = useCallback((id: string) => {
    onConfigChange({
      ...config,
      items: items.map((item) =>
        item.id === id ? { ...item, completed: !item.completed } : item,
      ),
    });
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
      items: items.filter((item) => item.id !== id),
    });
  }, [config, items, onConfigChange]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = [...items];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);

    onConfigChange({ ...config, items: reordered });
  }, [items, config, onConfigChange]);

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-2 border-b border-gray-700 pb-1">
        <input
          value={title}
          onChange={(e) => onConfigChange({ ...config, title: e.target.value })}
          className="flex-1 border-none bg-transparent text-sm font-semibold text-gray-200 outline-none"
          aria-label="List title"
        />
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div className="flex-1 overflow-auto space-y-0.5">
            {items.map((item) => (
              <SortableItem key={item.id} item={item} toggleItem={toggleItem} removeItem={removeItem} editItem={editItem} />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <form
        onSubmit={(e) => { e.preventDefault(); addItem(); }}
        className="flex gap-1 border-t border-gray-700 pt-1"
      >
        <input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder="Add a task..."
          className="flex-1 rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-200 outline-none focus:border-blue-400 placeholder-gray-500"
          aria-label="New task text"
        />
        <button
          type="submit"
          className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-500 disabled:opacity-50"
          disabled={!newText.trim()}
        >
          Add
        </button>
      </form>
    </div>
  );
}