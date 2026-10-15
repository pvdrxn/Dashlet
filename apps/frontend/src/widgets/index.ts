import { lazy } from 'react';
import { FiCheckSquare, FiClock, FiEdit3, FiBook, FiMaximize2 } from 'react-icons/fi';
import { LuListChecks } from 'react-icons/lu';
import { LuCalculator } from 'react-icons/lu';
import { LuTable2 } from 'react-icons/lu';
import { registerWidget } from './registry';
import { formatNumber, openTableView } from './data-table/DataTableWidget';
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
const DataTableWidget = lazy(() => import('./data-table/DataTableWidget').then(m => ({ default: m.DataTableWidget })));

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

registerWidget('data-table', {
  component: DataTableWidget,
  label: 'Table',
  icon: LuTable2,
  /*
   * `tableId: null` es lo que dispara la creacion perezosa: el widget se hace su
   * tabla al montarse. `rows` y `sum` los escribe el widget para que este
   * readout --que es una funcion PURA sobre el config-- tenga algo que mostrar con
   * el cuerpo desmontado.
   */
  defaultConfig: { title: 'Table', tableId: null, rows: 0, sum: null },
  collapsedSummary: (config) => {
    const rows = typeof config.rows === 'number' ? config.rows : 0;
    const sum = typeof config.sum === 'number' ? config.sum : null;
    return {
      value: `${rows} ${rows === 1 ? 'row' : 'rows'}`,
      // El `Σ` solo aparece si hay una columna numerica con algo dentro. Un
      // `Σ 0` en una tabla de texto seria mentira.
      detail: sum === null ? undefined : `Σ ${formatNumber(sum)}`,
    };
  },
  /*
   * "Abrir completo" vive en la barra y no en el cuerpo: el cuerpo del widget es
   * la tabla y cada linea de cromo le come alto. Ademas asi sigue disponible con
   * el widget retraido, que es justo cuando uno quiere la tabla grande.
   *
   * El `tableId` sale del config --que es donde el widget lo escribe--, asi que
   * el frame no necesita la tabla.
   */
  headerAction: (_widgetId, config) => {
    const tableId = typeof config.tableId === 'string' ? config.tableId : null;
    if (!tableId) return null;
    return {
      label: 'Open in Table View',
      icon: FiMaximize2,
      onSelect: () => openTableView(tableId),
    };
  },
});

export { WidgetGrid } from './WidgetGrid';
export { getAllWidgets } from './registry';
