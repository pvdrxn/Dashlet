import { lazy } from 'react';
import { FiCalendar, FiCheckSquare, FiClock, FiEdit3, FiBook, FiMaximize2 } from 'react-icons/fi';
import { LuListChecks } from 'react-icons/lu';
import { registerWidget } from './registry';
import { openCalendarView } from './calendar/open-calendar';
import i18n from '../i18n';
import {
  todoListSummary,
  habitSummary,
  pomodoroSummary,
  pomodoroActions,
  diarySummary,
  notesSummary,
  calendarSummary,
} from './collapsed-summaries';

const TodoListWidget = lazy(() => import('./todo-list/TodoListWidget').then(m => ({ default: m.TodoListWidget })));
const PomodoroWidget = lazy(() => import('./pomodoro/PomodoroWidget').then(m => ({ default: m.PomodoroWidget })));
const NotesWidget = lazy(() => import('./notes/NotesWidget').then(m => ({ default: m.NotesWidget })));
const HabitTrackerWidget = lazy(() => import('./habit-tracker/HabitTrackerWidget').then(m => ({ default: m.HabitTrackerWidget })));
const DiaryWidget = lazy(() => import('./diary/DiaryWidget').then(m => ({ default: m.DiaryWidget })));
const CalendarWidget = lazy(() => import('./calendar/CalendarWidget').then(m => ({ default: m.CalendarWidget })));

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
  collapsedActions: pomodoroActions,
  live: true,
});

registerWidget('notes', {
  component: NotesWidget,
  label: 'Notes',
  icon: FiEdit3,
  defaultConfig: { title: 'Notes', content: '', lastModified: null },
  collapsedSummary: notesSummary,
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

registerWidget('calendar', {
  component: CalendarWidget,
  get label() {
    return i18n.t('calendar.widget.title', 'Calendar');
  },
  icon: FiCalendar,
  get defaultConfig() {
    return { title: i18n.t('calendar.widget.title', 'Calendar'), viewMode: 'month', agenda: null };
  },
  collapsedSummary: calendarSummary,
  headerAction: (_widgetId, config) => ({
    label: i18n.t('calendar.widget.openFull', 'Open in Calendar View'),
    icon: FiMaximize2,
    onSelect: () =>
      openCalendarView(typeof config.selectedDate === 'string' ? config.selectedDate : undefined),
  }),
});

export { WidgetGrid } from './WidgetGrid';
export { getAllWidgets } from './registry';
