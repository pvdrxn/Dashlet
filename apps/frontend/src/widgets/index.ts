import { lazy } from 'react';
import { FiCheckSquare, FiClock, FiEdit3, FiBook } from 'react-icons/fi';
import { LuListChecks } from 'react-icons/lu';
import { LuCalculator } from 'react-icons/lu';
import { registerWidget } from './registry';
import {
  todoListSummary,
  habitSummary,
  pomodoroSummary,
  pomodoroActions,
  calculatorSummary,
  diarySummary,
  notesSummary,
} from './collapsed-summaries';

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
  collapsedSummary: todoListSummary,
});

registerWidget('pomodoro', {
  component: PomodoroWidget,
  label: 'Timer',
  icon: FiClock,
  defaultConfig: { title: 'Timer', technique: 'pomodoro', workMinutes: 25, restMinutes: 5, state: 'idle', remainingSeconds: 1500, elapsedSeconds: 0, cycleCount: 0 },
  collapsedSummary: pomodoroSummary,
  // Play/pausa tambien en el readout: con el widget retraido el cuerpo esta
  // desmontado y sin esto no habria forma de arrancar el reloj sin desplegarlo.
  collapsedActions: pomodoroActions,
  // Su tick sigue corriendo con el widget retraido, o sea que el readout tiene
  // que leer el estado vivo y no el config congelado del arbol de React.
  live: true,
});

registerWidget('notes', {
  component: NotesWidget,
  label: 'Notes',
  icon: FiEdit3,
  defaultConfig: { title: 'Notes', content: '', lastModified: null },
  collapsedSummary: notesSummary,
});

registerWidget('calculator', {
  component: CalculatorWidget,
  label: 'Calculator',
  icon: LuCalculator,
  defaultConfig: { title: 'Calculator', history: [], lastResult: '' },
  collapsedSummary: calculatorSummary,
});

registerWidget('habit-tracker', {
  component: HabitTrackerWidget,
  label: 'Habit Tracker',
  icon: LuListChecks,
  defaultConfig: { title: 'Habits', habits: [] },
  collapsedSummary: habitSummary,
});

registerWidget('diary', {
  component: DiaryWidget,
  label: 'Diary',
  icon: FiBook,
  defaultConfig: { title: 'Diary', entries: {} },
  collapsedSummary: diarySummary,
});

export { WidgetGrid } from './WidgetGrid';
export { getAllWidgets } from './registry';
