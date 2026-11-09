import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FiClock,
  FiCheckCircle,
  FiCalendar,
  FiBarChart2,
  FiRefreshCw,
  FiChevronDown,
  FiChevronUp,
} from 'react-icons/fi';
import { LuFlame } from 'react-icons/lu';
import { fetchStatsOverview } from '../../api/stats';
import type {
  StatsOverviewResponseDto,
  HabitHeatmapCellDto,
} from '@widget-master/shared';

export interface InsightsHeaderProps {
  className?: string;
  defaultCollapsed?: boolean;
}

type TimeRangeKey = '30d' | '90d' | 'year';

export function getHabitLevel(count: number, target: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count >= target) return 4;
  if (target <= 1) return 4;

  if (target === 2) {
    return 2;
  }

  if (target === 3) {
    return count === 1 ? 2 : 3;
  }

  if (target === 4) {
    if (count === 1) return 1;
    if (count === 2) return 2;
    return 3;
  }

  // target >= 5: rangos de completación
  const s = Math.max(1, Math.floor(target / 4));
  if (count <= s) return 1;
  if (count <= s * 2) return 2;
  return 3;
}

const PAD = (n: number) => String(n).padStart(2, '0');

function formatYMD(d: Date): string {
  return `${d.getFullYear()}-${PAD(d.getMonth() + 1)}-${PAD(d.getDate())}`;
}

function formatHoursMinutes(totalMinutes: number): string {
  if (!totalMinutes || totalMinutes <= 0) return '0h 0m';
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

const WEEKDAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

const MONTH_NAMES = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

const STORAGE_COLLAPSED_KEY = 'dashlet-insights-collapsed';

export function InsightsHeader({
  className = '',
  defaultCollapsed = false,
}: InsightsHeaderProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    const saved = localStorage.getItem(STORAGE_COLLAPSED_KEY);
    return saved !== null ? saved === 'true' : defaultCollapsed;
  });

  const [range, setRange] = useState<TimeRangeKey>('30d');
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<StatsOverviewResponseDto | null>(null);

  const [selectedHabitId, setSelectedHabitId] = useState<string>('all');
  const habits = data?.habits ?? [];
  const selectedHabit = useMemo(
    () => habits.find((h) => h.id === selectedHabitId) || null,
    [habits, selectedHabitId],
  );

  const [hoveredCell, setHoveredCell] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);

  const handleToggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_COLLAPSED_KEY, String(next));
      return next;
    });
  };

  const { from, to } = useMemo(() => {
    const today = new Date();
    const toStr = formatYMD(today);
    let fromDate = new Date();

    if (range === '30d') {
      fromDate.setDate(today.getDate() - 30);
    } else if (range === '90d') {
      fromDate.setDate(today.getDate() - 90);
    } else if (range === 'year') {
      fromDate = new Date(today.getFullYear(), 0, 1);
    }

    return { from: formatYMD(fromDate), to: toStr };
  }, [range]);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchStatsOverview(from, to);
      setData(res);
    } catch {
      // Manejo silencioso en el header
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const summary = data?.summary;
  const dailyFocus = data?.dailyFocus ?? [];
  const habitHeatmap = data?.habitHeatmap ?? [];
  const tagDistribution = data?.tagDistribution ?? [];

  const totalCalendarMinutes = useMemo(() => {
    return tagDistribution.reduce((acc, curr) => acc + curr.totalMinutes, 0);
  }, [tagDistribution]);

  // Cuadrícula para el Heatmap de Hábitos (siempre cubre todo el año actual)
  const { weeks, monthLabels } = useMemo(() => {
    const today = new Date();
    const todayStr = formatYMD(today);
    const currentYear = today.getFullYear();
    const yearStartStr = `${currentYear}-01-01`;
    const yearEndStr = `${currentYear}-12-31`;

    const cellMap = new Map<string, HabitHeatmapCellDto>();
    habitHeatmap.forEach((c) => cellMap.set(c.date, c));

    const startDate = new Date(`${yearStartStr}T00:00:00`);
    const endDate = new Date(`${yearEndStr}T00:00:00`);

    const startDayOfWeek = (startDate.getDay() + 6) % 7;
    const gridStart = new Date(startDate);
    gridStart.setDate(gridStart.getDate() - startDayOfWeek);

    const endDayOfWeek = (endDate.getDay() + 6) % 7;
    const gridEnd = new Date(endDate);
    if (endDayOfWeek < 6) {
      gridEnd.setDate(gridEnd.getDate() + (6 - endDayOfWeek));
    }

    const allDays: {
      date: string;
      level: 0 | 1 | 2 | 3 | 4;
      count: number;
      inRange: boolean;
      isToday: boolean;
      month: number;
    }[] = [];

    const cursor = new Date(gridStart);
    while (cursor <= gridEnd) {
      const dateStr = formatYMD(cursor);
      const inRange = dateStr >= yearStartStr && dateStr <= yearEndStr;
      const isToday = dateStr === todayStr;

      let count = 0;
      let level: 0 | 1 | 2 | 3 | 4 = 0;

      if (selectedHabit) {
        const target = selectedHabit.targetValue || 1;
        if (selectedHabit.mode === 'quantitative') {
          count = selectedHabit.completions?.[dateStr] ?? 0;
        } else {
          count =
            selectedHabit.completedDates?.includes(dateStr) ||
            (selectedHabit.completions?.[dateStr] ?? 0) > 0
              ? 1
              : 0;
        }
        level = getHabitLevel(count, target);
      } else {
        const cell = cellMap.get(dateStr);
        count = cell ? cell.count : 0;
        level = cell ? cell.level : 0;
      }

      allDays.push({
        date: dateStr,
        level,
        count,
        inRange,
        isToday,
        month: cursor.getMonth(),
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    const weekCols: (typeof allDays)[] = [];
    for (let i = 0; i < allDays.length; i += 7) {
      weekCols.push(allDays.slice(i, i + 7));
    }

    const labels: { colIndex: number; name: string }[] = [];
    let lastMonth = -1;

    weekCols.forEach((week, colIdx) => {
      const firstValidDay = week.find((d) => d.inRange);
      if (firstValidDay && firstValidDay.month !== lastMonth) {
        labels.push({
          colIndex: colIdx,
          name: MONTH_NAMES[firstValidDay.month] || '',
        });
        lastMonth = firstValidDay.month;
      }
    });

    return { weeks: weekCols, monthLabels: labels };
  }, [habitHeatmap, selectedHabit]);

  const legendTitles = useMemo(() => {
    if (!selectedHabit) {
      return {
        l0: 'Nivel 0: Sin actividad',
        l1: 'Nivel 1: 1 hábito',
        l2: 'Nivel 2: 2 hábitos',
        l3: 'Nivel 3: 3 hábitos',
        l4: 'Nivel 4: 4+ hábitos (Máxima consistencia)',
      };
    }
    const t = selectedHabit.targetValue || 1;
    if (t === 1) {
      return {
        l0: '0 completados',
        l1: '—',
        l2: '—',
        l3: '—',
        l4: '1 completado (Meta alcanzada)',
      };
    }
    if (t === 2) {
      return {
        l0: '0 completados',
        l1: '—',
        l2: '1 completado',
        l3: '—',
        l4: '2 completados (Meta alcanzada)',
      };
    }
    if (t === 3) {
      return {
        l0: '0 completados',
        l1: '—',
        l2: '1 completado',
        l3: '2 completados',
        l4: '3 completados (Meta alcanzada)',
      };
    }
    if (t === 4) {
      return {
        l0: '0 completados',
        l1: '1 completado',
        l2: '2 completados',
        l3: '3 completados',
        l4: '4 completados (Meta alcanzada)',
      };
    }
    const s = Math.max(1, Math.floor(t / 4));
    return {
      l0: '0 completados',
      l1: `1-${s} completados`,
      l2: `${s + 1}-${s * 2} completados`,
      l3: `${s * 2 + 1}-${t - 1} completados`,
      l4: `${t}+ completados (Meta alcanzada)`,
    };
  }, [selectedHabit]);

  // Escala para el gráfico de barras SVG
  const chartMetrics = useMemo(() => {
    if (!dailyFocus.length) return null;
    const maxVal = Math.max(60, ...dailyFocus.map((d) => d.minutes));
    const maxScale = Math.ceil(maxVal / 60) * 60;

    return {
      maxScale,
      ticks: [0, Math.round(maxScale * 0.5), maxScale],
    };
  }, [dailyFocus]);

  return (
    <div
      className={`border-b border-[#262930] bg-[#121418] transition-all duration-300 ${className}`}
    >
      {/* Barra superior de control del panel */}
      <div className="flex h-11 items-center justify-between px-6 bg-[#16181D]/60 select-none">
        <div className="flex items-center gap-2.5">
          <div className="flex h-6 w-6 items-center justify-center rounded border border-p2/40 bg-p2/15 text-p2">
            <FiBarChart2 size={13} />
          </div>
          <span className="text-xs font-semibold tracking-wide text-white uppercase">
            {t('sidebar.stats.label', 'Estadísticas')}
          </span>
          <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-white/50">
            Insights & Heatmap
          </span>

          {collapsed && summary && (
            <div className="hidden sm:flex items-center gap-4 ml-4 text-[11px] font-mono text-[#868e9a]">
              <span>
                Foco:{' '}
                <strong className="text-white font-medium">
                  {formatHoursMinutes(summary.totalFocusMinutes)}
                </strong>
              </span>
              <span>
                Tareas:{' '}
                <strong className="text-emerald-400 font-medium">
                  {summary.completionRate}%
                </strong>
              </span>
              <span>
                Racha:{' '}
                <strong className="text-p2 font-medium">
                  {summary.longestStreak}d
                </strong>
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!collapsed && (
            <>
              {/* Selector de Rango */}
              <div className="flex items-center rounded border border-[#262930] bg-[#0F1013] p-0.5">
                {(
                  [
                    { id: '30d', label: '30d' },
                    { id: '90d', label: '90d' },
                    { id: 'year', label: 'Año' },
                  ] as const
                ).map((item) => {
                  const active = range === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setRange(item.id)}
                      className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer ${
                        active
                          ? 'bg-p2/20 text-p2 font-semibold ring-1 ring-p2/40'
                          : 'text-white/60 hover:text-white'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>

              {/* Botón de Recarga */}
              <button
                type="button"
                onClick={() => void loadStats()}
                title="Recargar métricas"
                className="flex h-7 w-7 items-center justify-center rounded border border-[#262930] bg-[#16181D] text-white/60 hover:text-white transition-colors cursor-pointer"
              >
                <FiRefreshCw size={11} className={loading ? 'animate-spin text-p2' : ''} />
              </button>
            </>
          )}

          {/* Toggle Colapsar */}
          <button
            type="button"
            onClick={handleToggleCollapsed}
            className="flex items-center gap-1 rounded border border-[#262930] bg-[#16181D] px-2 py-1 text-[11px] text-white/70 hover:text-white hover:border-white/20 transition-colors cursor-pointer"
          >
            {collapsed ? (
              <>
                <span>Mostrar</span>
                <FiChevronDown size={12} />
              </>
            ) : (
              <>
                <span>Ocultar</span>
                <FiChevronUp size={12} />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Contenido desplegado */}
      {!collapsed && (
        <div className="p-6 space-y-5">
          {/* Fila de Scorecards (KPIs) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* KPI 1: Horas de Foco */}
            <div className="flex flex-col justify-between rounded-lg border border-[#262930] bg-[#16181D] p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs text-white/50 mb-2">
                <span className="font-mono text-[10px] uppercase tracking-wider">
                  Horas de Foco
                </span>
                <div className="flex h-6 w-6 items-center justify-center rounded bg-p2/15 text-p2 border border-p2/30">
                  <FiClock size={12} />
                </div>
              </div>
              <div>
                <div className="text-xl font-bold tracking-tight text-white">
                  {summary ? formatHoursMinutes(summary.totalFocusMinutes) : '—'}
                </div>
                <p className="mt-1 text-[10px] text-[#868e9a]">
                  Pomodoro y bloques de agenda
                </p>
              </div>
            </div>

            {/* KPI 2: Tasa de Tareas */}
            <div className="flex flex-col justify-between rounded-lg border border-[#262930] bg-[#16181D] p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs text-white/50 mb-2">
                <span className="font-mono text-[10px] uppercase tracking-wider">
                  Finalización de Tareas
                </span>
                <div className="flex h-6 w-6 items-center justify-center rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  <FiCheckCircle size={12} />
                </div>
              </div>
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold tracking-tight text-white">
                    {summary ? `${summary.completionRate}%` : '—'}
                  </span>
                  {summary && (
                    <span className="text-[11px] text-emerald-400 font-mono">
                      {summary.tasksCompleted}/{summary.tasksCompleted + summary.tasksPending}
                    </span>
                  )}
                </div>
                <div className="mt-2 h-1 w-full rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${summary?.completionRate ?? 0}%` }}
                  />
                </div>
                <p className="mt-1.5 text-[10px] text-[#868e9a]">
                  {summary ? `${summary.tasksCompleted} completadas · ${summary.tasksPending} pendientes` : '—'}
                </p>
              </div>
            </div>

            {/* KPI 3: Racha de Hábitos */}
            <div className="flex flex-col justify-between rounded-lg border border-[#262930] bg-[#16181D] p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs text-white/50 mb-2">
                <span className="font-mono text-[10px] uppercase tracking-wider">
                  Racha Máxima
                </span>
                <div className="flex h-6 w-6 items-center justify-center rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  <LuFlame size={13} />
                </div>
              </div>
              <div>
                <div className="text-xl font-bold tracking-tight text-white">
                  {summary ? `${summary.longestStreak} días` : '—'}
                </div>
                <p className="mt-1 text-[10px] text-[#868e9a]">
                  {summary ? `${summary.activeHabitsCount} hábitos monitorizados` : '—'}
                </p>
              </div>
            </div>

            {/* KPI 4: Tiempo en Agenda */}
            <div className="flex flex-col justify-between rounded-lg border border-[#262930] bg-[#16181D] p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs text-white/50 mb-2">
                <span className="font-mono text-[10px] uppercase tracking-wider">
                  Tiempo en Agenda
                </span>
                <div className="flex h-6 w-6 items-center justify-center rounded bg-blue-500/15 text-blue-400 border border-blue-500/30">
                  <FiCalendar size={12} />
                </div>
              </div>
              <div>
                <div className="text-xl font-bold tracking-tight text-white">
                  {formatHoursMinutes(totalCalendarMinutes)}
                </div>
                <p className="mt-1 text-[10px] text-[#868e9a]">
                  {tagDistribution.length} categorías registradas
                </p>
              </div>
            </div>
          </div>

          {/* Gráfico y Heatmap en 2 columnas */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Gráfico de Foco Diario (5 columnas) */}
            <div className="lg:col-span-5 rounded-lg border border-[#262930] bg-[#16181D] p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-xs font-semibold text-white">Foco Diario</h3>
                  <p className="text-[10px] text-[#868e9a]">Minutos de concentración por día</p>
                </div>
                <span className="text-[11px] font-mono text-p2">
                  {formatHoursMinutes(summary?.totalFocusMinutes ?? 0)}
                </span>
              </div>

              <div className="relative w-full h-36 pt-1 select-none">
                {chartMetrics && dailyFocus.length > 0 ? (
                  <svg
                    viewBox="0 0 500 120"
                    className="w-full h-full overflow-visible"
                    preserveAspectRatio="none"
                  >
                    {chartMetrics.ticks.map((tickVal) => {
                      const y = 100 - (tickVal / chartMetrics.maxScale) * 85;
                      return (
                        <g key={tickVal}>
                          <line
                            x1="25"
                            y1={y}
                            x2="495"
                            y2={y}
                            stroke="#262930"
                            strokeDasharray={tickVal === 0 ? 'none' : '2 2'}
                            strokeWidth="1"
                          />
                          <text
                            x="20"
                            y={y + 3}
                            textAnchor="end"
                            fontSize="8"
                            fill="#868e9a"
                            fontFamily="monospace"
                          >
                            {tickVal}m
                          </text>
                        </g>
                      );
                    })}

                    {dailyFocus.map((d, idx) => {
                      const totalBars = dailyFocus.length;
                      const availableWidth = 470;
                      const barSlot = availableWidth / totalBars;
                      const barWidth = Math.max(3, barSlot * 0.7);
                      const x = 25 + idx * barSlot + (barSlot - barWidth) / 2;
                      const height =
                        chartMetrics.maxScale > 0
                          ? (d.minutes / chartMetrics.maxScale) * 85
                          : 0;
                      const y = 100 - height;
                      const hasFocus = d.minutes > 0;

                      return (
                        <rect
                          key={d.date}
                          x={x}
                          y={y}
                          width={barWidth}
                          height={Math.max(1, height)}
                          rx="1.5"
                          className={`transition-all duration-150 cursor-pointer ${
                            hasFocus
                              ? 'fill-[var(--color-p2)] hover:fill-[#f0b555]'
                              : 'fill-white/[0.04]'
                          }`}
                          onMouseEnter={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setHoveredCell({
                              text: `${d.date}: ${formatHoursMinutes(d.minutes)}`,
                              x: rect.left + rect.width / 2,
                              y: rect.top - 8,
                            });
                          }}
                          onMouseLeave={() => setHoveredCell(null)}
                        />
                      );
                    })}
                  </svg>
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-white/40">
                    Sin datos de foco en el rango seleccionado
                  </div>
                )}
              </div>
            </div>

            {/* Matriz / Heatmap de Hábitos (7 columnas) */}
            <div className="lg:col-span-7 rounded-lg border border-[#262930] bg-[#16181D] p-4 flex flex-col justify-between">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-semibold text-white">Matriz de Hábitos</h3>
                    <span className="rounded bg-p2/15 text-p2 px-1.5 py-0.2 text-[9px] font-mono">
                      Consistencia
                    </span>
                  </div>

                  {/* Selector para filtrar por hábito */}
                  {habits.length > 0 && (
                    <select
                      value={selectedHabitId}
                      onChange={(e) => setSelectedHabitId(e.target.value)}
                      className="rounded border border-[#262930] bg-[#0F1013] px-2 py-0.5 text-[11px] font-medium text-white/90 hover:border-white/20 focus:border-p2/60 focus:outline-none transition-colors cursor-pointer"
                      title="Filtrar por hábito específico"
                    >
                      <option value="all">Todos los hábitos</option>
                      {habits.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name} ({h.targetValue > 1 ? `${h.targetValue}/día` : '1/día'})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Leyenda */}
                <div className="flex items-center gap-1.5 text-[10px] text-white/50 font-mono">
                  <span>-</span>
                  <div className="flex items-center gap-1">
                    <div
                      title={legendTitles.l0}
                      className="h-2.5 w-2.5 rounded-[2px] bg-gray-800/60 border border-gray-700/40"
                    />
                    <div
                      title={legendTitles.l1}
                      className="h-2.5 w-2.5 rounded-[2px] bg-amber-500/25 border border-amber-500/30"
                    />
                    <div
                      title={legendTitles.l2}
                      className="h-2.5 w-2.5 rounded-[2px] bg-amber-500/50 border border-amber-500/50"
                    />
                    <div
                      title={legendTitles.l3}
                      className="h-2.5 w-2.5 rounded-[2px] bg-amber-500/75 border border-amber-500/70"
                    />
                    <div
                      title={legendTitles.l4}
                      className="h-2.5 w-2.5 rounded-[2px] bg-[#d9a441] border border-[#d9a441] shadow-[0_0_6px_rgba(217,164,65,0.4)]"
                    />
                  </div>
                  <span>+</span>
                </div>
              </div>

              {/* Heatmap Grid */}
              <div className="w-full overflow-x-auto pb-1">
                <div className="min-w-fit inline-block">
                  {/* Meses */}
                  <div className="flex ml-[18px] h-3.5 mb-1 text-[9px] font-mono text-[#868e9a] relative">
                    {monthLabels.map((lbl, idx) => (
                      <span
                        key={`${lbl.name}-${idx}`}
                        style={{ left: `${lbl.colIndex * 14}px` }}
                        className="absolute"
                      >
                        {lbl.name}
                      </span>
                    ))}
                  </div>

                  {/* Matriz */}
                  <div className="flex gap-1.5">
                    {/* Días Y */}
                    <div className="flex flex-col gap-1 text-[9px] font-mono text-white/40 pt-0.5">
                      {WEEKDAY_LABELS.map((dayLabel, idx) => (
                        <div
                          key={`row-lbl-${idx}`}
                          className="h-2.5 w-3 flex items-center justify-center leading-none"
                        >
                          {idx % 2 === 0 ? dayLabel : ''}
                        </div>
                      ))}
                    </div>

                    {/* Columnas Semanales */}
                    <div className="flex gap-1">
                      {weeks.map((week, wIdx) => (
                        <div key={`week-${wIdx}`} className="flex flex-col gap-1">
                          {week.map((day, dIdx) => {
                            let levelClass = 'bg-gray-800/60 border border-gray-700/40';
                            if (day.inRange) {
                              if (day.level === 1) {
                                levelClass = 'bg-amber-500/25 border border-amber-500/30';
                              } else if (day.level === 2) {
                                levelClass = 'bg-amber-500/50 border border-amber-500/50';
                              } else if (day.level === 3) {
                                levelClass = 'bg-amber-500/75 border border-amber-500/70';
                              } else if (day.level === 4) {
                                levelClass =
                                  'bg-[#d9a441] border border-[#d9a441] shadow-[0_0_6px_rgba(217,164,65,0.4)]';
                              }
                            } else {
                              levelClass = 'opacity-0 pointer-events-none';
                            }

                            const todayOutline =
                              day.isToday && day.inRange
                                ? 'outline outline-1 outline-[var(--color-p2)] outline-offset-1 z-10 shadow-[0_0_4px_rgba(217,164,65,0.4)]'
                                : '';

                            const tooltipText = selectedHabit
                              ? `${day.date}${day.isToday ? ' (Hoy)' : ''}: ${day.count}/${
                                  selectedHabit.targetValue || 1
                                }${selectedHabit.unit ? ` ${selectedHabit.unit}` : ''}${
                                  day.count >= (selectedHabit.targetValue || 1)
                                    ? ' (Completado)'
                                    : day.count > 0
                                      ? ' (En progreso)'
                                      : ' (Sin actividad)'
                                }`
                              : `${day.date}${day.isToday ? ' (Hoy)' : ''}: ${day.count} ${
                                  day.count === 1 ? 'hábito cumplido' : 'hábitos cumplidos'
                                }`;

                            return (
                              <div
                                key={day.date || `pad-${dIdx}`}
                                className={`h-2.5 w-2.5 rounded-[2px] cursor-pointer transition-transform duration-100 hover:scale-125 ${levelClass} ${todayOutline}`}
                                onMouseEnter={(e) => {
                                  if (!day.inRange) return;
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setHoveredCell({
                                    text: tooltipText,
                                    x: rect.left + rect.width / 2,
                                    y: rect.top - 8,
                                  });
                                }}
                                onMouseLeave={() => setHoveredCell(null)}
                              />
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Tooltip */}
      {hoveredCell && (
        <div
          style={{
            position: 'fixed',
            left: `${hoveredCell.x}px`,
            top: `${hoveredCell.y}px`,
            transform: 'translate(-50%, -100%)',
          }}
          className="pointer-events-none z-[var(--z-overlay)] rounded border border-[#262930] bg-[#16181D] px-2 py-1 text-[11px] font-mono text-white shadow-xl"
        >
          {hoveredCell.text}
        </div>
      )}
    </div>
  );
}
