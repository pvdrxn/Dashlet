import { memo, useCallback, useRef, useEffect, useState, useMemo, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { FiArrowLeft, FiPause, FiPlay, FiRotateCcw, FiSettings, FiCheck, FiX, FiCheckSquare, FiEdit } from 'react-icons/fi';
import { WidgetInternalTabs } from '../../components/WidgetInternalTabs';
import { widgetBus } from '../widget-bus';
import { getLiveConfig, subscribeLiveConfig } from '../live-config';
import {
  TECHNIQUES,
  TECHNIQUE_KEYS,
  formatTimeShort,
  formatStopwatch,
  formatTarget,
  normalizeConfig,
  playSound,
  type Technique,
} from './shared';
import { registerPomodoroTimer, unregisterPomodoroTimer, startConfig } from './timer';

interface PomodoroWidgetProps {
  config: Record<string, unknown>;
  onConfigChange: (config: Record<string, unknown>) => void;
  widgetId?: string;
}

const RING_RADIUS = 58;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const RING_SIZE = 140;

export interface PomodoroTabItem {
  id: string;
  name: string;
  technique: Technique;
  workMinutes: number;
  restMinutes: number;
  longRestMinutes: number;
  alarmSound: string;
  state: 'idle' | 'running' | 'paused' | 'break';
  remainingSeconds: number;
  elapsedSeconds: number;
  elapsedMs: number;
  cycleCount: number;
  phase: 'work' | 'break';
  linkedTaskId?: string;
  linkedTaskName?: string;
  [key: string]: unknown;
}

export const PomodoroWidget = memo(function PomodoroWidget({ config, onConfigChange, widgetId }: PomodoroWidgetProps) {
  const rawTabs: PomodoroTabItem[] = useMemo(() => {
    if (Array.isArray(config.tabs) && config.tabs.length > 0) {
      return (config.tabs as Record<string, unknown>[]).map((t, i) => {
        const norm = normalizeConfig(t);
        return {
          id: typeof t.id === 'string' ? t.id : `timer-${i + 1}`,
          name: typeof t.name === 'string' && t.name.trim() ? t.name : `Timer ${i + 1}`,
          ...norm,
        };
      });
    }
    const norm = normalizeConfig(config);
    return [
      {
        id: 'timer-1',
        name: typeof config.title === 'string' && config.title.trim() ? config.title : 'Sprint 25/5',
        ...norm,
      },
    ];
  }, [config.tabs, config]);

  const activeTabId =
    typeof config.activeTabId === 'string' && rawTabs.some((t) => t.id === config.activeTabId)
      ? (config.activeTabId as string)
      : rawTabs[0]?.id ?? 'timer-1';

  const currentTab = rawTabs.find((t) => t.id === activeTabId) ?? rawTabs[0];
  const c = normalizeConfig(currentTab);
  const { technique, workMinutes, restMinutes, longRestMinutes, alarmSound, state, remainingSeconds, elapsedMs, cycleCount, phase, linkedTaskId, linkedTaskName } = c;
  const isCountup = technique === 'countup';

  const [view, setView] = useState<'main' | 'settings'>('main');
  const [editingField, setEditingField] = useState<string | null>(null);
  const [alarmOpen, setAlarmOpen] = useState(false);
  const alarmBtnRef = useRef<HTMLButtonElement>(null);
  const [alarmPos, setAlarmPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [pendingTechnique, setPendingTechnique] = useState<Technique | null>(null);

  const configRef = useRef(c);
  const onConfigChangeRef = useRef(onConfigChange);

  const updateCurrentTimer = useCallback(
    (patch: Record<string, unknown>) => {
      const mergedCurrent = { ...currentTab, ...patch };
      const normalizedCurrent = normalizeConfig(mergedCurrent);
      const updatedTab: PomodoroTabItem = {
        ...currentTab,
        ...normalizedCurrent,
      };
      const nextTabs = rawTabs.map((t) => (t.id === activeTabId ? updatedTab : t));

      onConfigChange({
        ...config,
        ...normalizedCurrent,
        tabs: nextTabs,
        activeTabId,
        title: updatedTab.name,
      });
    },
    [currentTab, rawTabs, activeTabId, config, onConfigChange],
  );

  const handleSelectTab = useCallback(
    (id: string) => {
      if (id === activeTabId) return;

      const currentTabPaused: PomodoroTabItem = {
        ...currentTab,
        ...c,
        state: c.state === 'running' ? 'paused' : c.state,
      };

      const nextTabs = rawTabs.map((t) =>
        t.id === activeTabId ? currentTabPaused : t,
      );
      const targetTab = nextTabs.find((t) => t.id === id) ?? nextTabs[0];
      const targetNormalized = normalizeConfig(targetTab);

      setView('main');
      setEditingField(null);

      onConfigChange({
        ...config,
        ...targetNormalized,
        tabs: nextTabs,
        activeTabId: id,
        title: targetTab.name,
      });
    },
    [activeTabId, currentTab, c, rawTabs, config, onConfigChange],
  );

  const handleAddTab = useCallback(() => {
    const newId = `timer-${Date.now()}`;
    const count = rawTabs.length;
    const isSecond = count === 1;
    const newName = isSecond ? 'Lectura 50/10' : `Timer ${count + 1}`;
    const newWork = isSecond ? 50 : 25;
    const newRest = isSecond ? 10 : 5;

    const currentTabSaved: PomodoroTabItem = {
      ...currentTab,
      ...c,
      state: c.state === 'running' ? 'paused' : c.state,
    };

    const newTab: PomodoroTabItem = {
      id: newId,
      name: newName,
      technique: 'pomodoro',
      workMinutes: newWork,
      restMinutes: newRest,
      longRestMinutes: 15,
      alarmSound: 'ding',
      state: 'idle',
      remainingSeconds: newWork * 60,
      elapsedSeconds: 0,
      elapsedMs: 0,
      cycleCount: 0,
      phase: 'work',
    };

    const nextTabs = [
      ...rawTabs.map((t) => (t.id === activeTabId ? currentTabSaved : t)),
      newTab,
    ];

    setView('main');
    setEditingField(null);

    onConfigChange({
      ...config,
      ...newTab,
      tabs: nextTabs,
      activeTabId: newId,
      title: newName,
    });
  }, [rawTabs, currentTab, c, activeTabId, config, onConfigChange]);

  const handleRenameTab = useCallback(
    (id: string, newName: string) => {
      const nextTabs = rawTabs.map((t) =>
        t.id === id ? { ...t, name: newName } : t,
      );
      onConfigChange({
        ...config,
        tabs: nextTabs,
        ...(id === activeTabId ? { title: newName } : {}),
      });
    },
    [rawTabs, activeTabId, config, onConfigChange],
  );

  const handleDeleteTab = useCallback(
    (id: string) => {
      if (rawTabs.length <= 1) return;
      const nextTabs = rawTabs.filter((t) => t.id !== id);
      const nextActive = nextTabs.find((t) => t.id === activeTabId) ?? nextTabs[0];
      const nextNorm = normalizeConfig(nextActive);

      onConfigChange({
        ...config,
        ...nextNorm,
        tabs: nextTabs,
        activeTabId: nextActive.id,
        title: nextActive.name,
      });
    },
    [rawTabs, activeTabId, config, onConfigChange],
  );

  /*
   * El store vivo, para la centesima del stopwatch.
   */
  const liveCfg = useSyncExternalStore(
    useCallback((cb: () => void) => (widgetId ? subscribeLiveConfig(cb) : () => {}), [widgetId]),
    useCallback(() => (widgetId ? getLiveConfig(widgetId) : null), [widgetId]),
  );
  const showMs =
    isCountup && state === 'running' && typeof liveCfg?.elapsedMs === 'number'
      ? liveCfg.elapsedMs
      : elapsedMs;

  configRef.current = c;
  onConfigChangeRef.current = onConfigChange;

  useEffect(() => {
    if (!widgetId) return;
    return () => unregisterPomodoroTimer(widgetId);
  }, [widgetId]);

  useEffect(() => {
    if (!widgetId) return;
    registerPomodoroTimer(widgetId, config, updateCurrentTimer);
  }, [widgetId, config, updateCurrentTimer]);

  useEffect(() => {
    if (!alarmOpen) return;
    const handle = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (alarmBtnRef.current && !alarmBtnRef.current.contains(t)) {
        setAlarmOpen(false);
      }
    };
    document.addEventListener('pointerdown', handle, true);
    return () => document.removeEventListener('pointerdown', handle, true);
  }, [alarmOpen]);

  useEffect(() => {
    const offSelect = widgetBus.on('task:select', (data) => {
      if (data.targetWidgetId !== widgetId) return;
      const workMin = data.estimatedMinutes ?? configRef.current.workMinutes;
      updateCurrentTimer({
        linkedTaskId: data.taskId,
        linkedTaskName: data.taskName,
        workMinutes: workMin,
        state: 'idle',
        phase: 'work',
        remainingSeconds: workMin * 60,
        elapsedMs: 0,
        cycleCount: 0,
      });
    });
    return () => { offSelect(); };
  }, [widgetId, updateCurrentTimer]);

  const start = useCallback(() => {
    const next = startConfig(c);
    updateCurrentTimer(next as unknown as Record<string, unknown>);
    if (linkedTaskId) {
      widgetBus.emit('timer:start', { taskId: linkedTaskId, taskName: linkedTaskName ?? '', technique });
    }
  }, [c, linkedTaskId, linkedTaskName, technique, updateCurrentTimer]);

  const pause = useCallback(() => {
    updateCurrentTimer({ state: 'paused' });
    if (linkedTaskId) {
      widgetBus.emit('timer:pause', { taskId: linkedTaskId });
    }
  }, [linkedTaskId, updateCurrentTimer]);

  const goSettings = useCallback(() => {
    updateCurrentTimer({ state: 'paused' });
    setView('settings');
  }, [updateCurrentTimer]);

  const reset = useCallback(() => {
    updateCurrentTimer({
      state: 'idle',
      phase: 'work',
      remainingSeconds: workMinutes * 60,
      elapsedMs: 0,
      cycleCount: 0,
    });
    setEditingField(null);
  }, [workMinutes, updateCurrentTimer]);

  const goBack = useCallback(() => {
    setView('main');
    setEditingField(null);
  }, []);

  const selectTechnique = useCallback((tech: Technique) => {
    if (tech === technique) return;
    const isActive = state === 'running' || state === 'paused';
    if (isActive) {
      setPendingTechnique(tech);
      return;
    }
    applyTechnique(tech);
  }, [technique, state]);

  const applyTechnique = useCallback((tech: Technique) => {
    const preset = TECHNIQUES[tech];
    updateCurrentTimer({
      technique: tech,
      workMinutes: preset.workMinutes,
      restMinutes: preset.restMinutes,
      longRestMinutes: preset.longRestMinutes,
      state: 'idle',
      phase: 'work',
      remainingSeconds: preset.workMinutes * 60,
      elapsedMs: 0,
      cycleCount: 0,
    });
  }, [updateCurrentTimer]);

  const confirmTechniqueChange = useCallback(() => {
    if (pendingTechnique) {
      applyTechnique(pendingTechnique);
      setPendingTechnique(null);
    }
  }, [pendingTechnique, applyTechnique]);

  const updateField = useCallback((field: string, value: number | string) => {
    const patch: Record<string, unknown> = { [field]: value };
    if (field === 'workMinutes' && state !== 'running') {
      patch.remainingSeconds = (value as number) * 60;
      patch.phase = 'work';
      patch.state = 'idle';
    }
    updateCurrentTimer(patch);
    setEditingField(null);
  }, [state, updateCurrentTimer]);

  const isRunning = state === 'running';
  /*
   * El techo del stopwatch: el estimado de la tarea vinculada, que `task:select`
   * escribe en `workMinutes`. Solo cuenta si la tecnica es countup -- en un
   * countdown `workMinutes` es la duracion y ya se ve en el anillo.
   */
  const budget = isCountup ? Math.round(workMinutes) : 0;
  const totalSeconds = phase === 'break' ? restMinutes * 60 : workMinutes * 60;
  const progress = isCountup ? 0 : totalSeconds > 0 ? ((totalSeconds - remainingSeconds) / totalSeconds) * 100 : 0;
  const dashOffset = RING_CIRCUMFERENCE * (1 - Math.min(progress, 100) / 100);

  // Un solo sistema de color: trabajando es p2 (ambar, calido y bright) y en
  // descanso el anillo baja a p1 (acero, frio y apagado). El cambio de
  // temperatura dice la fase sin inventar un segundo color.
  const ringColor = phase === 'break' ? 'var(--color-p1)' : 'var(--color-p2)';

  const openTaskPicker = useCallback(() => {
    if (!widgetId) return;
    /*
     * Va el `widgetId` en el pedido, no se resuelve despues. El selector tiene que
     * saber a que timer atar la tarea: si lo deja sin destino, `task:select` lo
     * reciben TODOS los pomodoros y cada uno se creeria elegido.
     */
    widgetBus.emit('open-task-picker', { widgetId });
    console.log('[pomo] abre picker', widgetId);
  }, [widgetId]);

  const unlinkTask = useCallback(() => {
    updateCurrentTimer({
      linkedTaskId: undefined,
      linkedTaskName: undefined,
      state: 'idle',
      phase: 'work',
      remainingSeconds: workMinutes * 60,
      elapsedMs: 0,
      cycleCount: 0,
    });
    if (linkedTaskId) {
      widgetBus.emit('timer:reset', { taskId: linkedTaskId });
    }
  }, [workMinutes, linkedTaskId, updateCurrentTimer]);

  const cycleDots = useMemo(() => {
    const dots = [];
    const count = cycleCount % 4;
    for (let i = 0; i < 4; i++) {
      dots.push(i < count);
    }
    return dots;
  }, [cycleCount]);

  const alarmOptions = useMemo(() => [
    { key: 'ding', label: 'Ding' },
    { key: 'chime', label: 'Chime' },
    { key: 'digital', label: 'Digital' },
  ], []);

  if (view === 'settings') {
    return (
      <div className="flex h-full flex-col">
        <WidgetInternalTabs
          tabs={rawTabs}
          activeTabId={activeTabId}
          onSelectTab={handleSelectTab}
          onAddTab={handleAddTab}
          onRenameTab={handleRenameTab}
          onDeleteTab={handleDeleteTab}
          maxTabs={3}
          addLabel="Nuevo timer"
        />
        <button
          type="button"
          onClick={goBack}
          className="mb-2 flex items-center text-gray-400 hover:text-gray-200 transition-colors"
        >
          <FiArrowLeft size={18} />
        </button>

        <div className="flex-1 space-y-4 overflow-y-auto pr-2" onPointerDown={(e) => e.stopPropagation()}>
            {(() => {
              const isCustomOrCountup = technique === 'custom' || technique === 'countup';
              const prefix = isCustomOrCountup ? 'Custom ' : '';
              return [
                { key: 'workMinutes', label: `${prefix}FOCUS`, value: workMinutes, suffix: 'min', editable: isCustomOrCountup },
                ...(!isCountup ? [
                  { key: 'restMinutes', label: `${prefix}BREAK`, value: restMinutes, suffix: 'min', editable: isCustomOrCountup },
                  { key: 'longRestMinutes', label: `${prefix}REST`, value: longRestMinutes, suffix: 'min', editable: isCustomOrCountup },
                ] : []),
              ];
            })().map((item) => (
              <div key={item.key} className="px-1">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#8B9BB0]">
                  {item.label}
                </div>
                {item.editable ? (
                  editingField === item.key ? (
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      min={1}
                      max={120}
                      defaultValue={item.value}
                      autoFocus
                      onBlur={(e) => {
                        const v = Math.max(1, Math.min(120, Number(e.target.value) || item.value));
                        updateField(item.key, v);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const v = Math.max(1, Math.min(120, Number((e.target as HTMLInputElement).value) || item.value));
                          updateField(item.key, v);
                        }
                        if (e.key === 'Escape') setEditingField(null);
                      }}
                      className="mt-0.5 w-full rounded-lg border border-[#232B3B] bg-[#1C2436] px-2 py-1 text-sm text-[#DCE4EC] outline-none focus:border-[#FFC20D]/60"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingField(item.key)}
                      className="mt-0.5 flex w-full items-center justify-between rounded-lg border border-[#232B3B] bg-[#1C2436] px-2 py-1.5 text-sm text-[#DCE4EC] hover:bg-[#232B3B] transition-colors"
                    >
                      <span>{item.value} {item.suffix}</span>
                    </button>
                  )
                ) : (
                  <div className="mt-0.5 flex w-full items-center justify-between rounded-lg border border-[#232B3B] bg-[#182030] px-2 py-1.5 text-sm text-[#8B9BB0]">
                    <span>{item.value} {item.suffix}</span>
                  </div>
                )}
              </div>
            ))}

            <div className="px-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#8B9BB0]">
                ALARM
              </div>
              <button
                ref={alarmBtnRef}
                type="button"
                onClick={() => {
                  if (!alarmOpen && alarmBtnRef.current) {
                    const r = alarmBtnRef.current.getBoundingClientRect();
                    setAlarmPos({ top: r.bottom + 2, left: r.left, width: r.width });
                  }
                  setAlarmOpen((v) => !v);
                }}
                className={`mt-1 flex w-full items-center justify-between rounded-lg border border-[#232B3B] bg-[#1C2436] px-2 py-1.5 text-sm text-[#DCE4EC] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[#FFC20D] ${
                  alarmOpen ? 'ring-1 ring-[#FFC20D]/50' : ''
                }`}
              >
                <span>{alarmOptions.find((o) => o.key === alarmSound)?.label ?? alarmSound}</span>
                <svg className={`h-4 w-4 text-[#8B9BB0] transition-transform ${alarmOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
              </button>
              {alarmOpen && alarmPos && createPortal(
                <div
                  className="z-50 rounded-xl border border-[#232B3B] bg-[#141A26] py-1 shadow-2xl backdrop-blur-xl"
                  style={{ position: 'fixed', top: alarmPos.top, left: alarmPos.left, width: alarmPos.width }}
                >
                  {alarmOptions.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        playSound(opt.key);
                        updateField('alarmSound', opt.key);
                        setAlarmOpen(false);
                      }}
                      className={`flex w-full items-center px-2 py-1.5 text-left text-sm transition-colors ${
                        alarmSound === opt.key
                          ? 'bg-[#FFC20D]/15 text-[#FFC20D]'
                          : 'text-[#DCE4EC] hover:bg-[#1C2436]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>,
                document.body,
              )}
            </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <WidgetInternalTabs
        tabs={rawTabs}
        activeTabId={activeTabId}
        onSelectTab={handleSelectTab}
        onAddTab={handleAddTab}
        onRenameTab={handleRenameTab}
        onDeleteTab={handleDeleteTab}
        maxTabs={3}
        addLabel="Nuevo timer"
      />
      <div className="flex flex-1 flex-col items-center justify-center min-h-0">
      <div className="flex w-full items-center justify-center gap-1 rounded-lg border border-[#232B3B] bg-[#182030] p-1 shadow-inner">
        {TECHNIQUE_KEYS.map((tech) => {
          const isActive = !linkedTaskId && technique === tech;
          return (
            <button
              key={tech}
              type="button"
              onClick={() => selectTechnique(tech)}
              className={`min-w-0 flex-1 truncate rounded-md px-1.5 py-1 text-[11px] font-medium transition-all duration-150 ${
                isActive
                  ? 'border border-[#313D53] bg-[#1C2436] text-[#DCE4EC] font-semibold shadow-sm'
                  : 'border border-transparent text-[#8B9BB0] hover:bg-[#1C2436]/60 hover:text-[#DCE4EC]'
              }`}
              title={tech === 'custom' ? 'Custom' : TECHNIQUES[tech].label}
            >
              {tech === 'custom' ? <FiEdit size={12} className="mx-auto" /> : TECHNIQUES[tech].label}
            </button>
          );
        })}
      </div>

      {linkedTaskId ? (
        <div className="mt-2 w-full truncate text-center text-sm font-medium text-[#FFC20D] tabular-nums">
          {linkedTaskName}
        </div>
      ) : (
        <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-[#8B9BB0]">
          {isCountup ? 'STOPWATCH' : phase === 'break' ? 'BREAK' : 'FOCUS'}
        </div>
      )}

      <div className="relative my-2 flex items-center justify-center">
        {isCountup ? (
          <div className="flex h-[140px] w-[140px] flex-col items-center justify-center">
            <span className="text-xl font-semibold tracking-wide text-[#DCE4EC] tabular-nums">
              {formatStopwatch(showMs)}
            </span>
            {budget > 0 && (
              <span className="mt-1 text-xs tabular-nums text-[#8B9BB0]">/ {formatTarget(budget)}</span>
            )}
          </div>
        ) : (
          <>
            <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90">
              <circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                fill="none"
                stroke="#232B3B"
                strokeWidth="5"
              />
              <circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                fill="none"
                stroke={ringColor}
                strokeWidth="5"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
                className="transition-[stroke-dashoffset] duration-1000 ease-linear"
              />
            </svg>
            <span className="absolute text-xl font-semibold tracking-wide text-[#DCE4EC] tabular-nums">
              {formatTimeShort(remainingSeconds)}
            </span>
          </>
        )}
      </div>

      {!isCountup && (
        <div className="flex items-center gap-1.5 py-1">
          {cycleDots.map((filled, i) => (
            <span
              key={i}
              className={`h-1.5 w-1.5 rounded-full transition-colors ${
                filled ? 'bg-[#FFC20D]' : 'bg-[#232B3B]'
              }`}
            />
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={linkedTaskId ? unlinkTask : openTaskPicker}
          className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors cursor-pointer ${
            linkedTaskId
              ? 'bg-[#FFC20D]/15 text-[#FFC20D] hover:bg-[#FFC20D]/25'
              : 'bg-[#1C2436] text-[#8B9BB0] hover:bg-[#232B3B] hover:text-[#DCE4EC]'
          }`}
          title={linkedTaskId ? `Unlink: ${linkedTaskName}` : 'Link task'}
        >
          <FiCheckSquare size={16} />
        </button>

        <button
          type="button"
          onClick={reset}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1C2436] text-[#8B9BB0] transition-colors hover:bg-[#232B3B] hover:text-[#DCE4EC] cursor-pointer"
          title="Reset"
        >
          <FiRotateCcw size={16} />
        </button>

        <button
          type="button"
          onClick={isRunning ? pause : start}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[#FFC20D] text-[#0D111A] transition-transform hover:bg-[#E6AD05] active:scale-95 shadow-[0_2px_12px_rgba(255,194,13,0.35)] cursor-pointer font-semibold"
          title={isRunning ? 'Pause' : 'Start'}
        >
          {isRunning ? <FiPause size={18} /> : <FiPlay size={18} className="ml-0.5" />}
        </button>

        <button
          type="button"
          onClick={goSettings}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1C2436] text-[#8B9BB0] transition-colors hover:bg-[#232B3B] hover:text-[#DCE4EC] cursor-pointer"
          title="Settings"
        >
          <FiSettings size={16} />
        </button>
      </div>

      {pendingTechnique && (
        <div className="absolute -inset-3 z-10 flex items-center justify-center rounded bg-black/70 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Change technique"
            className="w-full max-w-52 rounded-xl border border-[#232B3B] bg-[#141A26] p-3 shadow-2xl backdrop-blur-xl"
          >
            <p className="text-sm text-[#DCE4EC]">
              Change technique? Current timer will be reset.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingTechnique(null)}
                className="flex items-center gap-1 rounded bg-[#1C2436] px-2.5 py-1 text-xs text-[#8B9BB0] hover:bg-[#232B3B] hover:text-[#DCE4EC] cursor-pointer"
              >
                <FiX size={12} /> Cancel
              </button>
              <button
                type="button"
                onClick={confirmTechniqueChange}
                className="flex items-center gap-1 rounded bg-[#FFC20D] px-2.5 py-1 text-xs text-[#0D111A] font-semibold hover:bg-[#E6AD05] cursor-pointer"
              >
                <FiCheck size={12} /> Change
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
});

