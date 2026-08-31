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
  defaultSize: { w: 300, h: 300 },
  minSize: { w: 260, h: 180 },
});

registerWidget('pomodoro', {
  component: PomodoroWidget,
  label: 'Timer',
  icon: FiClock,
  defaultConfig: { title: 'Timer', workMinutes: 25, restMinutes: 5, state: 'idle', remainingSeconds: 1500, cycleCount: 0 },
  defaultSize: { w: 280, h: 340 },
  minSize: { w: 220, h: 305 },
});

registerWidget('notes', {
  component: NotesWidget,
  label: 'Notes',
  icon: FiEdit3,
  defaultConfig: { title: 'Notes', content: '', lastModified: null },
  defaultSize: { w: 320, h: 280 },
  minSize: { w: 240, h: 180 },
});

registerWidget('calculator', {
  component: CalculatorWidget,
  label: 'Calculator',
  icon: LuCalculator,
  defaultConfig: { title: 'Calculator', history: [], lastResult: '' },
  defaultSize: { w: 260, h: 380 },
  minSize: { w: 220, h: 340 },
});

registerWidget('habit-tracker', {
  component: HabitTrackerWidget,
  label: 'Habit Tracker',
  icon: LuListChecks,
  defaultConfig: { title: 'Habits', habits: [] },
  defaultSize: { w: 280, h: 280 },
  minSize: { w: 240, h: 180 },
});

registerWidget('diary', {
  component: DiaryWidget,
  label: 'Diary',
  icon: FiBook,
  defaultConfig: { title: 'Diary', entries: {} },
  defaultSize: { w: 320, h: 300 },
  minSize: { w: 260, h: 200 },
});

export { WidgetGrid } from './WidgetGrid';
export { getAllWidgets } from './registry';
