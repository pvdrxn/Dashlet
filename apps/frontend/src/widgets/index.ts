import { lazy } from 'react';
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
  icon: '\u2611',
  defaultConfig: { title: 'Todo List', items: [] },
  defaultSize: { w: 300, h: 300 },
  minSize: { w: 260, h: 180 },
});

registerWidget('pomodoro', {
  component: PomodoroWidget,
  label: 'Pomodoro',
  icon: '\u23F1',
  defaultConfig: { workMinutes: 25, restMinutes: 5, state: 'idle', remainingSeconds: 1500, cycleCount: 0 },
  defaultSize: { w: 280, h: 340 },
  minSize: { w: 220, h: 280 },
});

registerWidget('notes', {
  component: NotesWidget,
  label: 'Notes',
  icon: '\uD83D\uDCDD',
  defaultConfig: { content: '', lastModified: null },
  defaultSize: { w: 320, h: 280 },
  minSize: { w: 240, h: 180 },
});

registerWidget('calculator', {
  component: CalculatorWidget,
  label: 'Calculator',
  icon: '\uD83D\uDD22',
  defaultConfig: { history: [], lastResult: '' },
  defaultSize: { w: 260, h: 360 },
  minSize: { w: 220, h: 310 },
});

registerWidget('habit-tracker', {
  component: HabitTrackerWidget,
  label: 'Habit Tracker',
  icon: '\uD83D\uDCC5',
  defaultConfig: { habits: [] },
  defaultSize: { w: 280, h: 280 },
  minSize: { w: 240, h: 180 },
});

registerWidget('diary', {
  component: DiaryWidget,
  label: 'Diary',
  icon: '\uD83D\uDCD6',
  defaultConfig: { entries: {} },
  defaultSize: { w: 320, h: 300 },
  minSize: { w: 260, h: 200 },
});

export { WidgetGrid } from './WidgetGrid';
export { getAllWidgets } from './registry';
