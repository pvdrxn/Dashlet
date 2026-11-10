import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  StatsOverviewResponseDto,
  StatsSummaryDto,
  DailyFocusDto,
  DailyFocusSessionDto,
  HabitHeatmapCellDto,
  TagTimeDistributionDto,
  HabitStatDto,
  TaskTabStatDto,
  TimerTabStatDto,
} from '@widget-master/shared';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value?: string): boolean {
  if (!value || typeof value !== 'string' || !DATE_RE.test(value)) {
    return false;
  }
  const [y, m, d] = value.split('-').map(Number);
  const probe = new Date(y, m - 1, d);
  return (
    probe.getFullYear() === y &&
    probe.getMonth() === m - 1 &&
    probe.getDate() === d
  );
}

function resolveDateRange(fromRaw?: string, toRaw?: string): { from: string; to: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const formatDate = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  let to = toRaw;
  if (!isValidDate(to)) {
    to = formatDate(new Date());
  }

  let from = fromRaw;
  if (!isValidDate(from)) {
    const [y, m, d] = to!.split('-').map(Number);
    const fromDate = new Date(y, m - 1, d);
    fromDate.setDate(fromDate.getDate() - 30);
    from = formatDate(fromDate);
  }

  if (from! > to!) {
    throw new BadRequestException(`"from" (${from}) cannot be after "to" (${to})`);
  }

  return { from: from!, to: to! };
}

function generateDateList(from: string, to: string): string[] {
  const dates: string[] = [];
  const current = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);

  while (current <= end) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function safeJson(raw?: string | null): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(
    userId: string,
    fromRaw?: string,
    toRaw?: string,
    tabId?: string,
  ): Promise<StatsOverviewResponseDto> {
    const { from, to } = resolveDateRange(fromRaw, toRaw);

    // 1. Calendario: eventos en el rango con sus etiquetas
    const events = await this.prisma.calendarEvent.findMany({
      where: {
        userId,
        deletedAt: null,
        date: {
          gte: from,
          lte: to,
        },
      },
      include: {
        tag: true,
      },
    });

    const tagMap = new Map<string, { tagName: string; color: string; totalMinutes: number }>();
    let totalCalendarMinutes = 0;
    const calendarMinutesByDate = new Map<string, number>();

    for (const event of events) {
      const duration = event.durationMin > 0 ? event.durationMin : 60;
      totalCalendarMinutes += duration;

      calendarMinutesByDate.set(
        event.date,
        (calendarMinutesByDate.get(event.date) || 0) + duration,
      );

      const tagId = event.tagId || 'untagged';
      const tagName = event.tag?.name || 'Sin etiqueta';
      const color = event.tag?.color || '#868e9a';

      const existing = tagMap.get(tagId);
      if (existing) {
        existing.totalMinutes += duration;
      } else {
        tagMap.set(tagId, { tagName, color, totalMinutes: duration });
      }
    }

    const tagDistribution: TagTimeDistributionDto[] = Array.from(tagMap.entries())
      .map(([tagId, info]) => ({
        tagId,
        tagName: info.tagName,
        color: info.color,
        totalMinutes: info.totalMinutes,
        percentage:
          totalCalendarMinutes > 0
            ? Math.round((info.totalMinutes / totalCalendarMinutes) * 100)
            : 0,
      }))
      .sort((a, b) => b.totalMinutes - a.totalMinutes);

    // 2. Widgets activos del usuario (opcionalmente filtrados por pestaña, ignorando pestañas en papelera)
    const widgets = await this.prisma.widget.findMany({
      where: {
        userId,
        deletedAt: null,
        OR: [{ tabId: null }, { tab: { deletedAt: null } }],
        ...(tabId ? { tabId } : {}),
      },
      include: {
        tab: true,
      },
    });

    if (tabId && widgets.length === 0) {
      const allDates = generateDateList(from, to);
      const currentYear = new Date().getFullYear();
      const yearStart = `${currentYear}-01-01`;
      const yearEnd = `${currentYear}-12-31`;
      const heatmapFrom = yearStart < from ? yearStart : from;
      const heatmapTo = yearEnd > to ? yearEnd : to;
      const heatmapDates = generateDateList(heatmapFrom, heatmapTo);

      return {
        tabId,
        summary: {
          totalFocusMinutes: 0,
          tasksCompleted: 0,
          tasksPending: 0,
          completionRate: 0,
          activeHabitsCount: 0,
          longestStreak: 0,
        },
        dailyFocus: allDates.map((date) => ({ date, minutes: 0 })),
        habitHeatmap: heatmapDates.map((date) => ({ date, count: 0, level: 0 })),
        tagDistribution: [],
        habits: [],
        taskTabs: [],
        timerTabs: [],
      };
    }

    let tasksCompleted = 0;
    let tasksPending = 0;
    const taskTabsList: TaskTabStatDto[] = [];
    const timerTabsList: TimerTabStatDto[] = [];
    const pomodoroMinutesByDate = new Map<string, number>();
    const focusBreakdownByDate = new Map<string, Map<string, DailyFocusSessionDto>>();
    let activeHabitsCount = 0;
    const completionsPerDate = new Map<string, number>();
    const habitStreaks: number[] = [];
    const habitsList: HabitStatDto[] = [];

    const addBreakdown = (
      dateStr: string,
      tabName: string,
      mins: number,
      targetTabId?: string,
    ) => {
      if (mins <= 0) return;
      let dayMap = focusBreakdownByDate.get(dateStr);
      if (!dayMap) {
        dayMap = new Map();
        focusBreakdownByDate.set(dateStr, dayMap);
      }
      const key = targetTabId || tabName;
      const existing = dayMap.get(key);
      if (existing) {
        existing.minutes += mins;
      } else {
        dayMap.set(key, { tabId: targetTabId, tabName, minutes: mins });
      }
    };

    for (const w of widgets) {
      const config = safeJson(w.config);
      if (!config) continue;

      // Todo List: tareas completadas vs pendientes por pestaña interna
      if (w.type === 'todo-list') {
        if (Array.isArray(config.tabs) && config.tabs.length > 0) {
          for (const tab of config.tabs) {
            if (!tab || typeof tab !== 'object') continue;
            const tObj = tab as Record<string, unknown>;
            const tabId = typeof tObj.id === 'string' ? tObj.id : `tab-${taskTabsList.length + 1}`;
            const tabName =
              typeof tObj.name === 'string' && tObj.name.trim()
                ? tObj.name.trim()
                : `Lista ${taskTabsList.length + 1}`;
            let tabComp = 0;
            let tabPend = 0;
            if (Array.isArray(tObj.items)) {
              for (const item of tObj.items) {
                if (!item || typeof item !== 'object') continue;
                if ((item as Record<string, unknown>).completed === true) {
                  tabComp++;
                } else {
                  tabPend++;
                }
              }
            }
            const tabTotal = tabComp + tabPend;
            taskTabsList.push({
              id: tabId,
              name: tabName,
              tasksCompleted: tabComp,
              tasksPending: tabPend,
              completionRate: tabTotal > 0 ? Math.round((tabComp / tabTotal) * 100) : 0,
            });
            tasksCompleted += tabComp;
            tasksPending += tabPend;
          }
        } else if (Array.isArray(config.items)) {
          let tabComp = 0;
          let tabPend = 0;
          for (const item of config.items) {
            if (!item || typeof item !== 'object') continue;
            if ((item as Record<string, unknown>).completed === true) {
              tabComp++;
            } else {
              tabPend++;
            }
          }
          const tabTotal = tabComp + tabPend;
          taskTabsList.push({
            id: 'default',
            name: typeof config.title === 'string' && config.title.trim() ? config.title.trim() : 'General',
            tasksCompleted: tabComp,
            tasksPending: tabPend,
            completionRate: tabTotal > 0 ? Math.round((tabComp / tabTotal) * 100) : 0,
          });
          tasksCompleted += tabComp;
          tasksPending += tabPend;
        }
      }

      // Pomodoro: sesiones acumuladas o ciclos por pestaña interna
      else if (w.type === 'pomodoro') {
        const rawTabs =
          Array.isArray(config.tabs) && config.tabs.length > 0
            ? (config.tabs as Record<string, unknown>[])
            : [config];

        rawTabs.forEach((timerTab, idx) => {
          if (!timerTab || typeof timerTab !== 'object') return;
          const timerId =
            typeof timerTab.id === 'string' ? timerTab.id : `timer-${idx + 1}`;
          const timerName =
            typeof timerTab.name === 'string' && timerTab.name.trim()
              ? timerTab.name.trim()
              : typeof timerTab.title === 'string' && timerTab.title.trim()
                ? timerTab.title.trim()
                : `Temporizador ${idx + 1}`;

          let timerTotalMinutes = 0;
          const history = (timerTab.history || timerTab.sessions || timerTab.logs) as unknown[];

          if (Array.isArray(history)) {
            for (const entry of history) {
              if (!entry || typeof entry !== 'object') continue;
              const e = entry as Record<string, unknown>;
              let dateStr: string | null = null;
              if (typeof e.date === 'string' && DATE_RE.test(e.date)) {
                dateStr = e.date;
              } else if (typeof e.completedAt === 'string' || typeof e.completedAt === 'number') {
                const d = new Date(e.completedAt);
                if (!isNaN(d.getTime())) {
                  const pad = (n: number) => String(n).padStart(2, '0');
                  dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
                }
              }

              const mins =
                typeof e.minutes === 'number'
                  ? e.minutes
                  : typeof e.duration === 'number'
                    ? Math.round(e.duration / 60)
                    : typeof e.seconds === 'number'
                      ? Math.round(e.seconds / 60)
                      : typeof timerTab.workMinutes === 'number'
                        ? timerTab.workMinutes
                        : 25;

              timerTotalMinutes += mins;
              if (dateStr) {
                pomodoroMinutesByDate.set(
                  dateStr,
                  (pomodoroMinutesByDate.get(dateStr) || 0) + mins,
                );
                addBreakdown(dateStr, timerName, mins, timerId);
              }
            }
          } else {
            const cycles = typeof timerTab.cycleCount === 'number' ? timerTab.cycleCount : 0;
            const workMins = typeof timerTab.workMinutes === 'number' ? timerTab.workMinutes : 25;
            const totalAccumulated = cycles * workMins;
            timerTotalMinutes += totalAccumulated;
            if (totalAccumulated > 0) {
              const pad = (n: number) => String(n).padStart(2, '0');
              const updateDate = w.updatedAt
                ? `${w.updatedAt.getFullYear()}-${pad(w.updatedAt.getMonth() + 1)}-${pad(w.updatedAt.getDate())}`
                : to;
              pomodoroMinutesByDate.set(
                updateDate,
                (pomodoroMinutesByDate.get(updateDate) || 0) + totalAccumulated,
              );
              addBreakdown(updateDate, timerName, totalAccumulated, timerId);
            }
          }

          timerTabsList.push({
            id: timerId,
            name: timerName,
            totalMinutes: timerTotalMinutes,
          });
        });
      }

      // Habit Tracker: hábitos activos, heatmap y rachas
      else if (w.type === 'habit-tracker') {
        if (Array.isArray(config.habits)) {
          for (const h of config.habits) {
            if (!h || typeof h !== 'object') continue;
            const habit = h as Record<string, unknown>;
            const habitId = typeof habit.id === 'string' ? habit.id : String(Math.random());
            const habitName =
              typeof habit.name === 'string' && habit.name.trim() ? habit.name.trim() : 'Hábito';
            const mode = habit.mode === 'quantitative' ? 'quantitative' : 'binary';
            const targetValue =
              typeof habit.targetValue === 'number' && habit.targetValue > 0
                ? habit.targetValue
                : 1;
            const unit = typeof habit.unit === 'string' ? habit.unit : undefined;

            activeHabitsCount++;

            const completedSet = new Set<string>();
            const completedDates: string[] = [];
            if (Array.isArray(habit.completedDates)) {
              for (const d of habit.completedDates) {
                if (typeof d === 'string' && DATE_RE.test(d)) {
                  completedSet.add(d);
                  completedDates.push(d);
                }
              }
            }

            const completions: Record<string, number> = {};
            if (
              habit.mode === 'quantitative' &&
              habit.completions &&
              typeof habit.completions === 'object'
            ) {
              for (const [dStr, val] of Object.entries(habit.completions as Record<string, unknown>)) {
                if (DATE_RE.test(dStr) && typeof val === 'number') {
                  completions[dStr] = val;
                  if (val >= targetValue) {
                    completedSet.add(dStr);
                  }
                }
              }
            } else {
              for (const d of completedSet) {
                completions[d] = 1;
              }
            }

            habitsList.push({
              id: habitId,
              name: habitName,
              mode,
              targetValue,
              unit,
              completions,
              completedDates,
            });

            for (const dateStr of completedSet) {
              completionsPerDate.set(dateStr, (completionsPerDate.get(dateStr) || 0) + 1);
            }

            // Cálculo de racha consecutiva más larga
            const sortedDates = Array.from(completedSet).sort();
            let curStreak = 0;
            let maxStreak = 0;
            let prevTime: number | null = null;

            for (const dateStr of sortedDates) {
              const time = new Date(`${dateStr}T00:00:00`).getTime();
              if (prevTime === null) {
                curStreak = 1;
              } else {
                const diffDays = Math.round((time - prevTime) / (24 * 60 * 60 * 1000));
                if (diffDays === 1) {
                  curStreak++;
                } else if (diffDays > 1) {
                  curStreak = 1;
                }
              }
              if (curStreak > maxStreak) {
                maxStreak = curStreak;
              }
              prevTime = time;
            }
            habitStreaks.push(maxStreak);
          }
        }
      }
    }

    // 3. Consolidar series temporales
    const allDates = generateDateList(from, to);
    const includeCalendar = !tabId || widgets.some((w) => w.type === 'calendar');

    let totalFocusMinutes = 0;
    const dailyFocus: DailyFocusDto[] = allDates.map((date) => {
      const pomodoroMins = pomodoroMinutesByDate.get(date) || 0;
      const mins = pomodoroMins;
      totalFocusMinutes += mins;

      const dayBreakdownMap = focusBreakdownByDate.get(date);
      const breakdown: DailyFocusSessionDto[] = [];
      if (dayBreakdownMap) {
        breakdown.push(...Array.from(dayBreakdownMap.values()));
      }
      breakdown.sort((a, b) => b.minutes - a.minutes);

      return {
        date,
        minutes: mins,
        breakdown: breakdown.length > 0 ? breakdown : undefined,
      };
    });

    // La matriz de hábitos siempre cubre como mínimo todo el año actual
    const currentYear = new Date().getFullYear();
    const yearStart = `${currentYear}-01-01`;
    const yearEnd = `${currentYear}-12-31`;
    const heatmapFrom = yearStart < from ? yearStart : from;
    const heatmapTo = yearEnd > to ? yearEnd : to;
    const heatmapDates = generateDateList(heatmapFrom, heatmapTo);

    const habitHeatmap: HabitHeatmapCellDto[] = heatmapDates.map((date) => {
      const count = completionsPerDate.get(date) || 0;
      let level: 0 | 1 | 2 | 3 | 4 = 0;
      if (count === 1) level = 1;
      else if (count === 2) level = 2;
      else if (count === 3) level = 3;
      else if (count >= 4) level = 4;
      return { date, count, level };
    });

    const totalTasks = tasksCompleted + tasksPending;
    const completionRate =
      totalTasks > 0 ? Math.round((tasksCompleted / totalTasks) * 100) : 0;
    const longestStreak = habitStreaks.length > 0 ? Math.max(...habitStreaks) : 0;

    const summary: StatsSummaryDto = {
      totalFocusMinutes,
      tasksCompleted,
      tasksPending,
      completionRate,
      activeHabitsCount,
      longestStreak,
    };

    return {
      tabId,
      summary,
      dailyFocus,
      habitHeatmap,
      tagDistribution: includeCalendar ? tagDistribution : [],
      habits: habitsList,
      taskTabs: taskTabsList,
      timerTabs: timerTabsList,
    };
  }
}
