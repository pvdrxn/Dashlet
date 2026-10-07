import { lazy } from 'react';
import { FiCheckSquare, FiClock, FiEdit3, FiBook } from 'react-icons/fi';
import { LuListChecks } from 'react-icons/lu';
import { LuCalculator } from 'react-icons/lu';
import { registerWidget } from './registry';

const TodoListWidget = lazy(() => import('./todo-list/TodoListWidget').then(m => ({ default: m.TodoListWidget })));
const PomodoroWidget = lazy(() => import('./pomodoro/PomodoroWidget').then(m => ({ default: m.PomodoroWidget })));
const NotesWidget = lazy(() => import('./notes/NotesWidget').then(m => ({ default: m.NotesWidget })));
const CalculatorWidget = lazy(() => import('./calculator/CalculatorWidget').then(m => ({ default: m.CalculatorWidget })));
const HabitTrackerWidget = lazy(() => import('./habit-tracker/HabitTrackerWidget').then(m => ({ default: m.HabitTrackerWidget })));
const DiaryWidget = lazy(() => import('./diary/DiaryWidget').then(m => ({ default: m.DiaryWidget })));

registerWidget('todo-list', {
  component: TodoListWidget,
  label: 'Todo List',
  icon: FiCheckSquare,
  defaultConfig: { title: 'Todo List', items: [] },
});

registerWidget('pomodoro', {
  component: PomodoroWidget,
  label: 'Timer',
  icon: FiClock,
  defaultConfig: { title: 'Timer', technique: 'pomodoro', workMinutes: 25, restMinutes: 5, state: 'idle', remainingSeconds: 1500, elapsedSeconds: 0, cycleCount: 0 },
});

registerWidget('notes', {
  component: NotesWidget,
  label: 'Notes',
  icon: FiEdit3,
  defaultConfig: { title: 'Notes', content: '', lastModified: null },
});

registerWidget('calculator', {
  component: CalculatorWidget,
  label: 'Calculator',
  icon: LuCalculator,
  defaultConfig: { title: 'Calculator', history: [], lastResult: '' },
});

registerWidget('habit-tracker', {
  component: HabitTrackerWidget,
  label: 'Habit Tracker',
  icon: LuListChecks,
  defaultConfig: { title: 'Habits', habits: [] },
});

registerWidget('diary', {
  component: DiaryWidget,
  label: 'Diary',
  icon: FiBook,
  defaultConfig: { title: 'Diary', entries: {} },
});

export { WidgetGrid } from './WidgetGrid';
export { getAllWidgets } from './registry';
