import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  StatsOverviewResponseDto,
  StatsSummaryDto,
  DailyFocusDto,
  HabitHeatmapCellDto,
  TagTimeDistributionDto,
  HabitStatDto,
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

    // 2. Widgets activos del usuario
    const widgets = await this.prisma.widget.findMany({
      where: {
        userId,
        deletedAt: null,
      },
    });

    let tasksCompleted = 0;
    let tasksPending = 0;
    const pomodoroMinutesByDate = new Map<string, number>();
    let activeHabitsCount = 0;
    const completionsPerDate = new Map<string, number>();
    const habitStreaks: number[] = [];
    const habitsList: HabitStatDto[] = [];

    for (const w of widgets) {
      const config = safeJson(w.config);
      if (!config) continue;

      // Todo List: tareas completadas vs pendientes
      if (w.type === 'todo-list') {
        if (Array.isArray(config.items)) {
          for (const item of config.items) {
            if (!item || typeof item !== 'object') continue;
            if ((item as Record<string, unknown>).completed === true) {
              tasksCompleted++;
            } else {
              tasksPending++;
            }
          }
        }
      }

      // Pomodoro: sesiones acumuladas o ciclos
      else if (w.type === 'pomodoro') {
        const history = (config.history || config.sessions || config.logs) as unknown[];
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
                    : typeof config.workMinutes === 'number'
                      ? config.workMinutes
                      : 25;

            if (dateStr) {
              pomodoroMinutesByDate.set(
                dateStr,
                (pomodoroMinutesByDate.get(dateStr) || 0) + mins,
              );
            }
          }
        } else {
          const cycles = typeof config.cycleCount === 'number' ? config.cycleCount : 0;
          const workMins = typeof config.workMinutes === 'number' ? config.workMinutes : 25;
          const totalAccumulated = cycles * workMins;
          if (totalAccumulated > 0) {
            const pad = (n: number) => String(n).padStart(2, '0');
            const updateDate = w.updatedAt
              ? `${w.updatedAt.getFullYear()}-${pad(w.updatedAt.getMonth() + 1)}-${pad(w.updatedAt.getDate())}`
              : to;
            pomodoroMinutesByDate.set(
              updateDate,
              (pomodoroMinutesByDate.get(updateDate) || 0) + totalAccumulated,
            );
          }
        }
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

    let totalFocusMinutes = 0;
    const dailyFocus: DailyFocusDto[] = allDates.map((date) => {
      const mins = (pomodoroMinutesByDate.get(date) || 0) + (calendarMinutesByDate.get(date) || 0);
      totalFocusMinutes += mins;
      return { date, minutes: mins };
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
      summary,
      dailyFocus,
      habitHeatmap,
      tagDistribution,
      habits: habitsList,
    };
  }
}
