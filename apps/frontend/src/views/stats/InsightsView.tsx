import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FiClock,
  FiCheckCircle,
  FiBarChart2,
  FiRefreshCw,
  FiX,
  FiInfo,
} from 'react-icons/fi';
import { LuFlame } from 'react-icons/lu';
import { fetchStatsOverview } from '../../api/stats';
import * as tabsApi from '../../api/tabs';
import type {
  StatsOverviewResponseDto,
  DailyFocusSessionDto,
  HabitHeatmapCellDto,
  TabDto,
} from '@widget-master/shared';

export interface InsightsViewProps {
  onClose?: () => void;
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

export function InsightsView({ onClose }: InsightsViewProps) {
  const { t } = useTranslation();
  const [range, setRange] = useState<TimeRangeKey>('30d');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<StatsOverviewResponseDto | null>(null);

  // Estados para filtro por pestaña (contexto)
  const [tabs, setTabs] = useState<TabDto[]>([]);
  const [selectedTabId, setSelectedTabId] = useState<string | null>(null);

  // Cargar pestañas del usuario al montar
  useEffect(() => {
    let cancelled = false;
    async function loadTabs() {
      try {
        const list = await tabsApi.fetchTabs();
        if (!cancelled) {
          setTabs(list);
        }
      } catch (err) {
        console.error('Error al cargar pestañas para estadísticas:', err);
      }
    }
    void loadTabs();
    return () => {
      cancelled = true;
    };
  }, []);

  // Tooltip flotante para el gráfico o heatmap
  const [hoveredDay, setHoveredDay] = useState<{
    date: string;
    text: string;
    breakdown?: DailyFocusSessionDto[];
    x: number;
    y: number;
  } | null>(null);

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
    setError(null);
    try {
      const res = await fetchStatsOverview(from, to, selectedTabId ?? undefined);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar estadísticas');
    } finally {
      setLoading(false);
    }
  }, [from, to, selectedTabId]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const summary = data?.summary;
  const dailyFocus = data?.dailyFocus ?? [];
  const habitHeatmap = data?.habitHeatmap ?? [];
  const habits = data?.habits ?? [];

  const [selectedHabitId, setSelectedHabitId] = useState<string>('all');
  const selectedHabit = useMemo(
    () => habits.find((h) => h.id === selectedHabitId) || null,
    [habits, selectedHabitId],
  );

  const averageDailyMinutes = useMemo(() => {
    if (!dailyFocus.length) return 0;
    const total = dailyFocus.reduce((acc, curr) => acc + curr.minutes, 0);
    return Math.round(total / dailyFocus.length);
  }, [dailyFocus]);

  // Cuadrícula semanal para el Heatmap de Hábitos (siempre cubre todo el año actual)
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

    // Alinear al lunes anterior (0=Lunes, 6=Domingo)
    const startDayOfWeek = (startDate.getDay() + 6) % 7;
    const gridStart = new Date(startDate);
    gridStart.setDate(gridStart.getDate() - startDayOfWeek);

    // Alinear al domingo posterior
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

    // Dividir en semanas de 7 días
    const weekCols: (typeof allDays)[] = [];
    for (let i = 0; i < allDays.length; i += 7) {
      weekCols.push(allDays.slice(i, i + 7));
    }

    // Posición de etiquetas de meses
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

  // Cálculo de dimensiones y escala para el gráfico de barras SVG
  const chartMetrics = useMemo(() => {
    if (!dailyFocus.length) return null;
    const maxVal = Math.max(60, ...dailyFocus.map((d) => d.minutes));
    // Redondear techo al múltiplo de 60 superior
    const maxScale = Math.ceil(maxVal / 60) * 60;

    return {
      maxScale,
      ticks: [
        0,
        Math.round(maxScale * 0.33),
        Math.round(maxScale * 0.66),
        maxScale,
      ],
    };
  }, [dailyFocus]);

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-[#0D111A] text-[#DCE4EC] select-none font-sans">
      {/* Header técnico de la vista */}
      <header className="relative flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[#232B3B] bg-[#141A26]/90 px-6 py-2.5 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#232B3B] bg-[#1C2436] text-[#FFC20D] shadow-[0_0_12px_rgba(255,194,13,0.2)]">
            <FiBarChart2 size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold tracking-wide text-[#DCE4EC]">
                {t('sidebar.stats.label', 'Estadísticas')}
              </h1>
              <span className="rounded bg-[#1C2436] border border-[#232B3B] px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider text-[#8B9BB0]">
                {selectedTabId
                  ? (tabs.find((t) => t.id === selectedTabId)?.name ?? 'Panel')
                  : 'Global'}
              </span>
            </div>
            <p className="text-[11px] text-[#8B9BB0]">
              {t(
                'sidebar.stats.desc',
                'Métricas de productividad, consistencia de hábitos y tiempo de foco',
              )}
            </p>
          </div>
        </div>

        {/* Controles: Selector de Contexto / Pestaña, Selector de Rango & Botón Volver */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Selector de Contexto por Pestaña */}
          {tabs.length > 0 && (
            <div className="flex items-center rounded-md border border-[#232B3B] bg-[#0D111A]/80 p-0.5 shadow-inner max-w-xs sm:max-w-sm overflow-x-auto">
              <button
                type="button"
                onClick={() => setSelectedTabId(null)}
                title="Métricas globales de todos los paneles"
                className={`rounded px-2.5 py-1 text-xs font-medium transition-all duration-150 cursor-pointer whitespace-nowrap border ${
                  selectedTabId === null
                    ? 'bg-[#FFC20D]/15 text-[#FFC20D] border-[#FFC20D]/30 font-semibold shadow-sm'
                    : 'border-transparent text-[#8B9BB0] hover:text-[#DCE4EC] hover:bg-[#1C2436]'
                }`}
              >
                Todos los paneles
              </button>
              {tabs.map((tab) => {
                const active = selectedTabId === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSelectedTabId(tab.id)}
                    title={`Filtrar por panel: ${tab.name}`}
                    className={`rounded px-2.5 py-1 text-xs font-medium transition-all duration-150 cursor-pointer whitespace-nowrap border ${
                      active
                        ? 'bg-[#FFC20D]/15 text-[#FFC20D] border-[#FFC20D]/30 font-semibold shadow-sm'
                        : 'border-transparent text-[#8B9BB0] hover:text-[#DCE4EC] hover:bg-[#1C2436]'
                    }`}
                  >
                    {tab.name}
                  </button>
                );
              })}
            </div>
          )}

          {/* Selector de Rango Temporal */}
          <div className="flex items-center rounded-md border border-[#232B3B] bg-[#0D111A]/80 p-0.5 shadow-inner">
            {(
              [
                { id: '30d', label: '30 días' },
                { id: '90d', label: '90 días' },
                { id: 'year', label: 'Este año' },
              ] as const
            ).map((item) => {
              const active = range === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setRange(item.id)}
                  className={`rounded px-3 py-1 text-xs font-medium transition-all duration-150 cursor-pointer border ${
                    active
                      ? 'bg-[#FFC20D]/15 text-[#FFC20D] border-[#FFC20D]/30 font-semibold shadow-sm'
                      : 'border-transparent text-[#8B9BB0] hover:text-[#DCE4EC] hover:bg-[#1C2436]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => void loadStats()}
            title="Recargar datos"
            className="flex h-8 w-8 items-center justify-center rounded border border-[#232B3B] bg-[#1C2436] text-[#8B9BB0] hover:text-[#DCE4EC] hover:border-[#313D53] transition-colors cursor-pointer"
          >
            <FiRefreshCw size={13} className={loading ? 'animate-spin text-[#FFC20D]' : ''} />
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Volver a los widgets"
              className="flex h-8 items-center gap-1.5 rounded border border-[#232B3B] bg-[#1C2436] px-2.5 text-xs text-[#8B9BB0] hover:text-[#DCE4EC] hover:border-[#313D53] transition-colors cursor-pointer"
            >
              <FiX size={14} />
              <span className="hidden sm:inline">Volver</span>
            </button>
          )}
        </div>
      </header>

      {/* Contenido principal con scroll */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-400">
            <FiInfo size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* 1. FILA DE SCORECARDS (KPIs TÉCNICOS) */}
        <section aria-label="Métricas clave">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* KPI 1: Horas de Foco */}
            <div className="relative flex flex-col justify-between rounded-lg border border-[#232B3B] bg-[#141A26] p-5 shadow-sm transition-all hover:border-[#313D53]">
              <div className="flex items-center justify-between text-xs text-[#8B9BB0] mb-3">
                <span className="font-mono text-[11px] uppercase tracking-wider">
                  Horas de Foco
                </span>
                <div className="flex h-7 w-7 items-center justify-center rounded bg-[#1C2436] text-[#FFC20D] border border-[#232B3B]">
                  <FiClock size={14} />
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold tracking-tight text-[#DCE4EC]">
                  {summary ? formatHoursMinutes(summary.totalFocusMinutes) : '—'}
                </div>
                <p className="mt-1 text-[11px] text-[#8B9BB0]">
                  {selectedTabId
                    ? 'Sesiones de Pomodoro en este panel'
                    : 'Sesiones de Pomodoro acumuladas'}
                </p>
              </div>
            </div>

            {/* KPI 2: Tasa de Tareas */}
            <div className="relative flex flex-col justify-between rounded-lg border border-[#232B3B] bg-[#141A26] p-5 shadow-sm transition-all hover:border-[#313D53]">
              <div className="flex items-center justify-between text-xs text-[#8B9BB0] mb-3">
                <span className="font-mono text-[11px] uppercase tracking-wider">
                  Finalización de Tareas
                </span>
                <div className="flex h-7 w-7 items-center justify-center rounded bg-[#1C2436] text-emerald-400 border border-[#232B3B]">
                  <FiCheckCircle size={14} />
                </div>
              </div>
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold tracking-tight text-[#DCE4EC]">
                    {summary ? `${summary.completionRate}%` : '—'}
                  </span>
                  {summary && (
                    <span className="text-xs text-emerald-400 font-mono">
                      {summary.tasksCompleted}/{summary.tasksCompleted + summary.tasksPending}
                    </span>
                  )}
                </div>
                {/* Mini barra de progreso */}
                <div className="mt-2.5 h-1.5 w-full rounded-full bg-[#1C2436] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${summary?.completionRate ?? 0}%` }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-[#8B9BB0]">
                  {summary ? `${summary.tasksCompleted} completadas · ${summary.tasksPending} pendientes` : '—'}
                </p>
              </div>
            </div>

            {/* KPI 3: Racha de Hábitos */}
            <div className="relative flex flex-col justify-between rounded-lg border border-[#232B3B] bg-[#141A26] p-5 shadow-sm transition-all hover:border-[#313D53]">
              <div className="flex items-center justify-between text-xs text-[#8B9BB0] mb-3">
                <span className="font-mono text-[11px] uppercase tracking-wider">
                  Racha Máxima
                </span>
                <div className="flex h-7 w-7 items-center justify-center rounded bg-[#1C2436] text-amber-400 border border-[#232B3B]">
                  <LuFlame size={15} />
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold tracking-tight text-[#DCE4EC]">
                  {summary ? `${summary.longestStreak} días` : '—'}
                </div>
                <p className="mt-1 text-[11px] text-[#8B9BB0]">
                  {summary ? `${summary.activeHabitsCount} hábitos monitorizados` : '—'}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 2. GRÁFICO DE FOCO DIARIO / SEMANAL */}
        <section
          aria-label="Tendencia de foco diario"
          className="rounded-lg border border-[#232B3B] bg-[#141A26] p-5 shadow-sm"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
            <div>
              <h2 className="text-sm font-semibold tracking-wide text-[#DCE4EC]">
                Foco Diario
              </h2>
              <p className="text-xs text-[#8B9BB0] mt-0.5">
                {selectedTabId
                  ? 'Minutos acumulados en sesiones de Pomodoro de este panel'
                  : 'Minutos acumulados en sesiones de Pomodoro y bloques con hora'}
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono text-[#868e9a]">
              <span>
                Promedio diario:{' '}
                <strong className="text-white font-medium">
                  {formatHoursMinutes(averageDailyMinutes)}
                </strong>
              </span>
              <span>
                Total:{' '}
                <strong className="text-p2 font-medium">
                  {formatHoursMinutes(summary?.totalFocusMinutes ?? 0)}
                </strong>
              </span>
            </div>
          </div>

          {/* Gráfico de barras SVG responsivo */}
          <div className="relative w-full h-56 pt-2 select-none">
            {chartMetrics && dailyFocus.length > 0 ? (
              <svg
                viewBox="0 0 1000 200"
                className="w-full h-full overflow-visible"
                preserveAspectRatio="none"
              >
                {/* Líneas guía horizontales */}
                {chartMetrics.ticks.map((tickVal) => {
                  const y = 170 - (tickVal / chartMetrics.maxScale) * 150;
                  return (
                    <g key={tickVal}>
                      <line
                        x1="30"
                        y1={y}
                        x2="990"
                        y2={y}
                        stroke="#232B3B"
                        strokeDasharray={tickVal === 0 ? 'none' : '3 3'}
                        strokeWidth="1"
                      />
                      <text
                        x="24"
                        y={y + 3}
                        textAnchor="end"
                        fontSize="9"
                        fill="#8B9BB0"
                        fontFamily="monospace"
                      >
                        {formatHoursMinutes(tickVal)}
                      </text>
                    </g>
                  );
                })}

                {/* Barras de cada día */}
                {dailyFocus.map((d, idx) => {
                  const totalBars = dailyFocus.length;
                  const availableWidth = 960;
                  const barSlot = availableWidth / totalBars;
                  const barWidth = Math.max(3, Math.min(20, barSlot * 0.72));
                  const x = 35 + idx * barSlot + (barSlot - barWidth) / 2;

                  const barHeight = Math.max(
                    d.minutes > 0 ? 4 : 1,
                    (d.minutes / chartMetrics.maxScale) * 150,
                  );
                  const y = 170 - barHeight;

                  const isNonZero = d.minutes > 0;

                  return (
                    <g
                      key={d.date}
                      className="cursor-pointer group"
                      onMouseEnter={(e) => {
                        const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
                        setHoveredDay({
                          date: d.date,
                          text: `${d.date}: ${formatHoursMinutes(d.minutes)} de foco`,
                          breakdown: d.breakdown,
                          x: rect.x + rect.width / 2,
                          y: rect.y - 8,
                        });
                      }}
                      onMouseLeave={() => setHoveredDay(null)}
                    >
                      <rect
                        x={x}
                        y={y}
                        width={barWidth}
                        height={barHeight}
                        rx={barWidth > 6 ? 2 : 1}
                        className={`transition-all duration-150 ${
                          isNonZero
                            ? 'fill-[var(--color-p2)] group-hover:fill-amber-300 opacity-90 group-hover:opacity-100'
                            : 'fill-white/[0.08] group-hover:fill-white/20'
                        }`}
                      />
                    </g>
                  );
                })}

                {/* Etiquetas de fechas en eje X (muestreo regular) */}
                {dailyFocus.map((d, idx) => {
                  const step =
                    dailyFocus.length > 60 ? 14 : dailyFocus.length > 25 ? 5 : 2;
                  if (idx % step !== 0 && idx !== dailyFocus.length - 1) return null;

                  const totalBars = dailyFocus.length;
                  const availableWidth = 960;
                  const barSlot = availableWidth / totalBars;
                  const x = 35 + idx * barSlot + barSlot / 2;
                  const parts = d.date.split('-');
                  const label = `${parts[2]}/${parts[1]}`;

                  return (
                    <text
                      key={`lbl-${d.date}`}
                      x={x}
                      y="192"
                      textAnchor="middle"
                      fontSize="9"
                      fill="#868e9a"
                      fontFamily="monospace"
                    >
                      {label}
                    </text>
                  );
                })}
              </svg>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-white/40">
                Sin registros de foco en este intervalo
              </div>
            )}
          </div>
        </section>

        {/* 3. MATRIZ / HEATMAP DE HÁBITOS (CUADROS AMARILLO #FFC20D) */}
        <section
          aria-label="Matriz de consistencia de hábitos"
          className="rounded-lg border border-[#232B3B] bg-[#141A26] p-5 shadow-sm"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold tracking-wide text-[#DCE4EC]">
                    Matriz de Hábitos
                  </h2>
                  <span className="rounded bg-[#FFC20D]/15 text-[#FFC20D] border border-[#FFC20D]/30 px-1.5 py-0.5 text-[10px] font-mono font-medium">
                    Consistencia
                  </span>
                </div>
                <p className="text-xs text-[#8B9BB0] mt-0.5">
                  Hábitos completados por día en una escala tonal girasol
                </p>
              </div>

              {/* Selector para filtrar por hábito */}
              {habits.length > 0 && (
                <select
                  value={selectedHabitId}
                  onChange={(e) => setSelectedHabitId(e.target.value)}
                  className="rounded border border-[#232B3B] bg-[#0D111A] px-2.5 py-1 text-xs font-medium text-[#DCE4EC] hover:border-[#313D53] focus:border-[#FFC20D]/60 focus:outline-none transition-colors cursor-pointer"
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

            {/* Escala de Color Acento Semántico (Niveles 0 a 4) */}
            <div className="flex items-center gap-2 text-[11px] text-[#8B9BB0] font-mono">
              <span>Menos</span>
              <div className="flex items-center gap-1">
                {/* Nivel 0 */}
                <div
                  title={legendTitles.l0}
                  className="h-3 w-3 rounded-[2px] bg-[#1C2436] border border-[#232B3B]"
                />
                {/* Nivel 1 */}
                <div
                  title={legendTitles.l1}
                  className="h-3 w-3 rounded-[2px] bg-[#FFC20D]/20 border border-[#FFC20D]/30"
                />
                {/* Nivel 2 */}
                <div
                  title={legendTitles.l2}
                  className="h-3 w-3 rounded-[2px] bg-[#FFC20D]/40 border border-[#FFC20D]/50"
                />
                {/* Nivel 3 */}
                <div
                  title={legendTitles.l3}
                  className="h-3 w-3 rounded-[2px] bg-[#FFC20D]/70 border border-[#FFC20D]/70"
                />
                {/* Nivel 4 */}
                <div
                  title={legendTitles.l4}
                  className="h-3 w-3 rounded-[2px] bg-[#FFC20D] border border-[#FFC20D] shadow-[0_0_6px_rgba(255,194,13,0.4)]"
                />
              </div>
              <span>Más</span>
            </div>
          </div>

          {/* Cuadrícula Heatmap */}
          <div className="w-full overflow-x-auto pb-2">
            <div className="min-w-fit inline-block">
              {/* Fila de Nombres de Mes */}
              <div className="flex ml-6 h-4 mb-1 text-[10px] font-mono text-[#8B9BB0] relative">
                {monthLabels.map((lbl, idx) => (
                  <span
                    key={`${lbl.name}-${idx}`}
                    style={{ left: `${lbl.colIndex * 16}px` }}
                    className="absolute"
                  >
                    {lbl.name}
                  </span>
                ))}
              </div>

              {/* Matriz: Eje Y (Días) + Eje X (Semanas) */}
              <div className="flex gap-2">
                {/* Eje Y: Días de la semana */}
                <div className="flex flex-col gap-1 text-[10px] font-mono text-[#8B9BB0] pt-0.5">
                  {WEEKDAY_LABELS.map((dayLabel, idx) => (
                    <div
                      key={`row-lbl-${idx}`}
                      className="h-3 w-4 flex items-center justify-center leading-none"
                    >
                      {idx % 2 === 0 ? dayLabel : ''}
                    </div>
                  ))}
                </div>

                {/* Columnas de Semanas */}
                <div className="flex gap-1">
                  {weeks.map((week, wIdx) => (
                    <div key={`week-${wIdx}`} className="flex flex-col gap-1">
                      {week.map((day, dIdx) => {
                        let levelClass = 'bg-[#1C2436] border border-[#232B3B]';
                        if (day.inRange) {
                          if (day.level === 1) {
                            levelClass =
                              'bg-[#FFC20D]/20 border border-[#FFC20D]/30';
                          } else if (day.level === 2) {
                            levelClass =
                              'bg-[#FFC20D]/40 border border-[#FFC20D]/50';
                          } else if (day.level === 3) {
                            levelClass =
                              'bg-[#FFC20D]/70 border border-[#FFC20D]/70';
                          } else if (day.level === 4) {
                            levelClass =
                              'bg-[#FFC20D] border border-[#FFC20D] shadow-[0_0_6px_rgba(255,194,13,0.4)]';
                          }
                        } else {
                          levelClass = 'opacity-0 pointer-events-none';
                        }

                        const todayOutline =
                          day.isToday && day.inRange
                            ? 'outline outline-1 outline-[#FFC20D] outline-offset-1 z-10 shadow-[0_0_4px_rgba(255,194,13,0.4)]'
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
                              day.count === 1 ? 'hábito completado' : 'hábitos completados'
                            }`;

                        return (
                          <div
                            key={day.date || `pad-${dIdx}`}
                            title={day.inRange ? tooltipText : undefined}
                            onMouseEnter={(e) => {
                              if (!day.inRange) return;
                              const rect = e.currentTarget.getBoundingClientRect();
                              setHoveredDay({
                                date: day.date,
                                text: tooltipText,
                                x: rect.x + rect.width / 2,
                                y: rect.y - 8,
                              });
                            }}
                            onMouseLeave={() => setHoveredDay(null)}
                            className={`h-3 w-3 rounded-[2px] transition-transform duration-100 hover:scale-125 cursor-pointer ${levelClass} ${todayOutline}`}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Tooltip flotante interactivo */}
      {hoveredDay && (
        <div
          className="pointer-events-none fixed z-[var(--z-overlay)] -translate-x-1/2 -translate-y-full rounded border border-[#232B3B] bg-[#141A26]/95 px-3 py-2 text-[11px] font-mono text-[#DCE4EC] shadow-xl backdrop-blur-md min-w-[140px]"
          style={{ left: `${hoveredDay.x}px`, top: `${hoveredDay.y}px` }}
        >
          <div className="font-semibold text-[#DCE4EC]">{hoveredDay.text}</div>
          {selectedTabId === null && hoveredDay.breakdown && hoveredDay.breakdown.length > 0 && (
            <div className="mt-1.5 pt-1.5 border-t border-[#232B3B] space-y-1">
              <span className="text-[10px] text-[#8B9BB0] uppercase tracking-wider block font-sans">
                Sesiones por panel:
              </span>
              {hoveredDay.breakdown.map((item, i) => (
                <div key={i} className="flex items-center justify-between gap-3 text-[11px]">
                  <span className="text-[#DCE4EC]/90 truncate flex items-center gap-1.5 max-w-[140px]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#FFC20D] shrink-0" />
                    {item.tabName}
                  </span>
                  <span className="text-[#FFC20D] font-medium shrink-0">
                    {formatHoursMinutes(item.minutes)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
