import { useState, useCallback, useMemo } from 'react';
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

interface HabitItem {
  id: string;
  name: string;
  completedDates: string[];
}

interface HabitTrackerConfig {
  habits?: HabitItem[];
}

interface HabitTrackerWidgetProps {
  config: Record<string, unknown>;
  onConfigChange: (config: Record<string, unknown>) => void;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function computeStreak(completedDates: string[]): number {
  const dates = new Set(completedDates);
  const today = formatDate(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (!dates.has(today) && !dates.has(formatDate(yesterday))) return 0;

  let streak = 0;
  const d = new Date();
  while (true) {
    const key = formatDate(d);
    if (dates.has(key)) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

let nextId = 1;
function genId() { return `habit-${nextId++}`; }

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function getMonthGrid(): { date: string; day: number; empty: boolean }[][] {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: { date: string; day: number; empty: boolean }[] = [];

  for (let i = 0; i < firstDay; i++) {
    cells.push({ date: '', day: 0, empty: true });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: formatDate(new Date(year, month, d)), day: d, empty: false });
  }

  const rows: { date: string; day: number; empty: boolean }[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }
  return rows;
}

function SortableHabit({
  habit,
  toggleToday,
  editHabit,
  removeHabit,
}: {
  habit: HabitItem;
  toggleToday: (id: string) => void;
  editHabit: (id: string, name: string) => void;
  removeHabit: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: habit.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editText, setEditText] = useState(habit.name);
  const today = useMemo(() => formatDate(new Date()), []);
  const isCompletedToday = habit.completedDates.includes(today);
  const streak = useMemo(() => computeStreak(habit.completedDates), [habit.completedDates]);
  const completedSet = useMemo(() => new Set(habit.completedDates), [habit.completedDates]);
  const monthGrid = useMemo(() => getMonthGrid(), []);

  return (
    <div ref={setNodeRef} style={style} className="group/item rounded px-0.5 py-1 hover:bg-gray-700/50">
      <div className="flex items-center gap-2">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing touch-none text-gray-600 hover:text-gray-400 text-sm leading-none px-0.5"
        >
          &#x2630;
        </button>
        <input
          type="checkbox"
          checked={isCompletedToday}
          onChange={() => toggleToday(habit.id)}
          className="h-4 w-4 accent-blue-500 shrink-0"
        />
        <div className="flex-1 flex items-center gap-2 min-w-0">
          {editing ? (
            <input
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onBlur={() => { editHabit(habit.id, editText); setEditing(false); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { editHabit(habit.id, editText); setEditing(false); }
                if (e.key === 'Escape') { setEditText(habit.name); setEditing(false); }
              }}
              autoFocus
              className="flex-1 rounded border border-blue-500 bg-gray-800 px-1 py-0.5 text-sm text-gray-200 outline-none min-w-0"
            />
          ) : (
            <span
              onClick={() => { setEditText(habit.name); setEditing(true); }}
              className="flex-1 text-sm text-gray-300 cursor-text truncate"
            >
              {habit.name}
            </span>
          )}
          {streak >= 2 && (
            <span className="shrink-0 text-sm font-bold text-orange-400">&#x1F525;{streak}</span>
          )}
        </div>
        <button
          onClick={() => removeHabit(habit.id)}
          className="invisible group-hover/item:visible text-xs text-gray-500 hover:text-red-400"
        >
          &#x2715;
        </button>
      </div>
      <div className="flex items-center gap-1 pl-8 mt-1">
        {DAY_LABELS.map((l) => (
          <span key={l} className="w-5 text-center text-[9px] text-gray-600">{l}</span>
        ))}
        <button
          onClick={() => setExpanded(!expanded)}
          className="ml-1 text-xs text-gray-500 hover:text-gray-300"
        >
          {expanded ? '\u25B2' : '\u25BC'}
        </button>
      </div>
      {(expanded ? monthGrid : [monthGrid.find((row) => row.some((c) => !c.empty && c.date === today)) ?? monthGrid[0]]).map((row, ri) => (
        <div key={ri} className="flex items-center gap-1 pl-8 mt-0.5">
          {row.map((cell) =>
            cell.empty ? (
              <div key={`e${ri}${cell.day}`} className="w-5 h-5" />
            ) : (
              <div
                key={cell.date}
                className={`flex items-center justify-center w-5 h-5 rounded-sm text-[10px] ${
                  cell.date === today
                    ? 'ring-1 ring-green-500'
                    : ''
                } ${
                  completedSet.has(cell.date)
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-700 text-gray-500'
                }`}
                title={cell.date}
              >
                {cell.day}
              </div>
            )
          )}
        </div>
      ))}
    </div>
  );
}

export function HabitTrackerWidget({ config, onConfigChange }: HabitTrackerWidgetProps) {
  const { habits = [] } = config as HabitTrackerConfig;
  const [newName, setNewName] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const addHabit = useCallback(() => {
    if (!newName.trim()) return;
    onConfigChange({
      ...config,
      habits: [...habits, { id: genId(), name: newName.trim(), completedDates: [] }],
    });
    setNewName('');
  }, [newName, config, habits, onConfigChange]);

  const toggleToday = useCallback((id: string) => {
    const today = formatDate(new Date());
    onConfigChange({
      ...config,
      habits: habits.map((h) =>
        h.id === id
          ? {
              ...h,
              completedDates: h.completedDates.includes(today)
                ? h.completedDates.filter((d) => d !== today)
                : [...h.completedDates, today],
            }
          : h,
      ),
    });
  }, [config, habits, onConfigChange]);

  const editHabit = useCallback((id: string, name: string) => {
    onConfigChange({
      ...config,
      habits: habits.map((h) =>
        h.id === id ? { ...h, name } : h,
      ),
    });
  }, [config, habits, onConfigChange]);

  const removeHabit = useCallback((id: string) => {
    onConfigChange({
      ...config,
      habits: habits.filter((h) => h.id !== id),
    });
  }, [config, habits, onConfigChange]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = habits.findIndex((h) => h.id === active.id);
    const newIndex = habits.findIndex((h) => h.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = [...habits];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);

    onConfigChange({ ...config, habits: reordered });
  }, [habits, config, onConfigChange]);

  return (
    <div className="flex h-full flex-col gap-1">
      <div className="border-b border-gray-700 pb-1">
        <span className="text-sm font-semibold text-gray-200">habits</span>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={habits.map((h) => h.id)} strategy={verticalListSortingStrategy}>
          <div className="flex-1 overflow-auto space-y-0.5">
            {habits.map((habit) => (
              <SortableHabit key={habit.id} habit={habit} toggleToday={toggleToday} editHabit={editHabit} removeHabit={removeHabit} />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <form
        onSubmit={(e) => { e.preventDefault(); addHabit(); }}
        className="flex gap-1 border-t border-gray-700 pt-1"
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Add a habit..."
          className="flex-1 rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-200 outline-none focus:border-blue-400 placeholder-gray-500"
        />
        <button
          type="submit"
          className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-500 disabled:opacity-50"
          disabled={!newName.trim()}
        >
          Add
        </button>
      </form>
    </div>
  );
}
