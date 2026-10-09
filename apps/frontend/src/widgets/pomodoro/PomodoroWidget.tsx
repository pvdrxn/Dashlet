import { memo, useCallback, useRef, useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { FiArrowLeft, FiPause, FiPlay, FiRotateCcw, FiSettings, FiCheck, FiX, FiClock, FiEdit } from 'react-icons/fi';
import { widgetBus } from '../widget-bus';
import {
  TECHNIQUES,
  TECHNIQUE_KEYS,
  formatTimeShort,
  formatTimeCountup,
  normalizeConfig,
  playSound,
  type Technique,
} from './shared';
import { registerPomodoroTimer, unregisterPomodoroTimer } from './timer';

interface PomodoroWidgetProps {
  config: Record<string, unknown>;
  onConfigChange: (config: Record<string, unknown>) => void;
  widgetId?: string;
}

const RING_RADIUS = 58;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const RING_SIZE = 140;

export const PomodoroWidget = memo(function PomodoroWidget({ config, onConfigChange, widgetId }: PomodoroWidgetProps) {
  const c = normalizeConfig(config);
  const { technique, workMinutes, restMinutes, longRestMinutes, alarmSound, state, remainingSeconds, elapsedSeconds, cycleCount, phase, linkedTaskId, linkedTaskName } = c;

  const [view, setView] = useState<'main' | 'settings'>('main');
  const [editingField, setEditingField] = useState<string | null>(null);
  const [alarmOpen, setAlarmOpen] = useState(false);
  const alarmBtnRef = useRef<HTMLButtonElement>(null);
  const [alarmPos, setAlarmPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [pendingTechnique, setPendingTechnique] = useState<Technique | null>(null);

  const configRef = useRef(c);
  const onConfigChangeRef = useRef(onConfigChange);

  configRef.current = c;
  onConfigChangeRef.current = onConfigChange;

  /*
   * El reloj vive en `./timer`, no aca. Este efecto es lo unico que lo conecta:
   * se registra en cada cambio de config y se saca el callback al desmontar.
   *
   * Sacar el callback NO para el reloj -- eso es lo que hace que el pomodoro siga
   * corriendo con el widget retraido, donde el componente no esta montado. Para
   *olo hace falta `disposePomodoroTimer`, que se llama al borrar el widget.
   *
   * El unico canal es el `state` del config: pausa, reset y cambio de tecnica
   * cambian el `state` y el reloj se para solo.
   *
   * El `config` va como dependencia a proposito: el registro tiene que enterarse
   * de cada cambio para decidir si corre o no. Es un efecto sin estado propio y
   * sin DOM, asi que el costo es nulo.
   */
  useEffect(() => {
    if (!widgetId) return;
    registerPomodoroTimer(widgetId, config, onConfigChange);
    return () => unregisterPomodoroTimer(widgetId);
  }, [widgetId, config, onConfigChange]);

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
      if (data.targetWidgetId && data.targetWidgetId !== widgetId) return;
      const workMin = data.estimatedMinutes ?? configRef.current.workMinutes;
      onConfigChangeRef.current({
        ...configRef.current,
        linkedTaskId: data.taskId,
        linkedTaskName: data.taskName,
        workMinutes: workMin,
        state: 'idle',
        phase: 'work',
        remainingSeconds: workMin * 60,
        elapsedSeconds: 0,
        cycleCount: 0,
      });
    });
    return () => { offSelect(); };
  }, [widgetId]);

  useEffect(() => {
    if (!widgetId) return;
    widgetBus.emit('request-timer-index', { widgetId });
    const offIdx = widgetBus.on('timer-index', (data) => {
      if (data.widgetId !== widgetId) return;
      onConfigChangeRef.current({
        ...configRef.current,
        timerIndex: data.timerIndex,
        title: `Timer ${data.timerIndex}`,
      });
    });
    return () => { offIdx(); };
  }, [widgetId]);

  const start = useCallback(() => {
    if (technique === 'countup') {
      onConfigChange({
        ...config,
        state: 'running',
      });
      if (linkedTaskId) {
        widgetBus.emit('timer:start', { taskId: linkedTaskId, taskName: linkedTaskName ?? '', technique });
      }
      return;
    }
    const isBreak = phase === 'break' || state === 'break';
    const totalSecs = isBreak ? restMinutes * 60 : workMinutes * 60;
    const init = state === 'paused' ? remainingSeconds : totalSecs;
    onConfigChange({
      ...config,
      state: 'running',
      remainingSeconds: init,
      phase: isBreak ? 'break' : 'work',
    });
    if (linkedTaskId) {
      widgetBus.emit('timer:start', { taskId: linkedTaskId, taskName: linkedTaskName ?? '', technique });
    }
  }, [state, phase, technique, remainingSeconds, workMinutes, restMinutes, linkedTaskId, linkedTaskName, config, onConfigChange]);

  const pause = useCallback(() => {
    onConfigChange({ ...config, state: 'paused' });
    if (linkedTaskId) {
      widgetBus.emit('timer:pause', { taskId: linkedTaskId });
    }
  }, [config, linkedTaskId, onConfigChange]);

  const goSettings = useCallback(() => {
    onConfigChange({ ...config, state: 'paused' });
    setView('settings');
  }, [config, onConfigChange]);

  const goBackAndReset = useCallback(() => {
    onConfigChange({
      ...config,
      state: 'idle',
      phase: 'work',
      remainingSeconds: workMinutes * 60,
      cycleCount: 0,
    });
    setView('main');
    setEditingField(null);
  }, [workMinutes, config, onConfigChange]);

  const selectTechnique = useCallback((tech: Technique) => {
    if (tech === technique) return;
    const isActive = state === 'running' || state === 'paused';
    if (isActive) {
      setPendingTechnique(tech);
      return;
    }
    applyTechnique(tech);
  }, [technique, state, config, onConfigChange]);

  const applyTechnique = useCallback((tech: Technique) => {
    const preset = TECHNIQUES[tech];
    onConfigChange({
      ...config,
      technique: tech,
      workMinutes: preset.workMinutes,
      restMinutes: preset.restMinutes,
      longRestMinutes: preset.longRestMinutes,
      state: 'idle',
      phase: 'work',
      remainingSeconds: preset.workMinutes * 60,
      elapsedSeconds: 0,
      cycleCount: 0,
    });
  }, [config, onConfigChange]);

  const confirmTechniqueChange = useCallback(() => {
    if (pendingTechnique) {
      applyTechnique(pendingTechnique);
      setPendingTechnique(null);
    }
  }, [pendingTechnique, applyTechnique]);

  const updateField = useCallback((field: string, value: number | string) => {
    const patch: Record<string, unknown> = { [field]: value };
    if (field === 'workMinutes' && state !== 'running') {
      patch.remainingSeconds = value as number * 60;
      patch.phase = 'work';
      patch.state = 'idle';
    }
    onConfigChange({ ...config, ...patch });
    setEditingField(null);
  }, [config, state, onConfigChange]);

  const isRunning = state === 'running';
  const isCountup = technique === 'countup';
  const totalSeconds = phase === 'break' ? restMinutes * 60 : workMinutes * 60;
  const progress = isCountup ? 0 : totalSeconds > 0 ? ((totalSeconds - remainingSeconds) / totalSeconds) * 100 : 0;
  const dashOffset = RING_CIRCUMFERENCE * (1 - Math.min(progress, 100) / 100);

  // Un solo sistema de color: trabajando es p2 (ambar, calido y bright) y en
  // descanso el anillo baja a p1 (acero, frio y apagado). El cambio de
  // temperatura dice la fase sin inventar un segundo color.
  const ringColor = phase === 'break' ? 'var(--color-p1)' : 'var(--color-p2)';

  const openTaskPicker = useCallback(() => {
    widgetBus.emit('open-task-picker', {});
  }, []);

  const unlinkTask = useCallback(() => {
    onConfigChange({
      ...config,
      linkedTaskId: undefined,
      linkedTaskName: undefined,
      state: 'idle',
      phase: 'work',
      remainingSeconds: workMinutes * 60,
      elapsedSeconds: 0,
      cycleCount: 0,
    });
    if (linkedTaskId) {
      widgetBus.emit('timer:reset', { taskId: linkedTaskId });
    }
  }, [config, workMinutes, linkedTaskId, onConfigChange]);

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
        <button
          type="button"
          onClick={goBackAndReset}
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
                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
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
                      className="mt-0.5 w-full rounded bg-gray-800 px-2 py-1 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-gray-500"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingField(item.key)}
                      className="mt-0.5 flex w-full items-center justify-between rounded bg-gray-800 px-2 py-1.5 text-sm text-gray-200 hover:bg-white/5 transition-colors"
                    >
                      <span>{item.value} {item.suffix}</span>
                    </button>
                  )
                ) : (
                  <div className="mt-0.5 flex w-full items-center justify-between rounded bg-gray-800/50 px-2 py-1.5 text-sm text-gray-400">
                    <span>{item.value} {item.suffix}</span>
                  </div>
                )}
              </div>
            ))}

            <div className="px-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
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
                className={`mt-1 flex w-full items-center justify-between rounded bg-gray-800 px-2 py-1.5 text-sm text-gray-200 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-gray-500 ${
                  alarmOpen ? 'ring-1 ring-gray-500' : ''
                }`}
              >
                <span>{alarmOptions.find((o) => o.key === alarmSound)?.label ?? alarmSound}</span>
                <svg className={`h-4 w-4 text-gray-400 transition-transform ${alarmOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
              </button>
              {alarmOpen && alarmPos && createPortal(
                <div
                  className="z-50 rounded-b bg-gray-800 py-0.5 shadow-xl"
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
                          ? 'bg-p2/15 text-p2'
                          : 'text-gray-200 hover:bg-white/5'
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
    <div className="flex h-full flex-col items-center justify-center">
      <div className="flex w-full justify-center gap-0.5 rounded border border-gray-700 bg-gray-800 p-0.5">
        {TECHNIQUE_KEYS.map((tech) => (
          <button
            key={tech}
            type="button"
            onClick={() => selectTechnique(tech)}
            className={`flex-1 rounded px-1.5 py-1 text-[10px] font-medium transition-colors ${
              !linkedTaskId && technique === tech
                ? 'bg-gray-600 text-gray-100'
                : 'text-gray-500 hover:text-gray-300'
            }`}
            title={tech === 'custom' ? 'Custom' : TECHNIQUES[tech].label}
          >
            {tech === 'custom' ? <FiEdit size={12} className="mx-auto" /> : TECHNIQUES[tech].label}
          </button>
        ))}
      </div>

      {linkedTaskId ? (
        <div className="mt-2 text-sm font-medium text-p2 truncate max-w-[200px] tabular-nums">
          {linkedTaskName}
        </div>
      ) : (
        <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          {isCountup ? 'FLOW' : phase === 'break' ? 'BREAK' : 'FOCUS'}
        </div>
      )}

      <div className="relative my-2 flex items-center justify-center">
        {isCountup ? (
          <div className="flex h-[140px] w-[140px] items-center justify-center">
            <span className="text-xl font-semibold tracking-wide text-gray-100 tabular-nums">
              {formatTimeCountup(elapsedSeconds)}
            </span>
          </div>
        ) : (
          <>
            <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90">
              <circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                fill="none"
                stroke="rgba(255,255,255,0.06)"
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
            <span className="absolute text-xl font-semibold tracking-wide text-gray-100 tabular-nums">
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
                filled ? 'bg-p2' : 'bg-white/15'
              }`}
            />
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={linkedTaskId ? unlinkTask : openTaskPicker}
          className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
            linkedTaskId
              ? 'bg-p2/15 text-p2 hover:bg-p2/25'
              : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200'
          }`}
          title={linkedTaskId ? `Unlink: ${linkedTaskName}` : 'Link task'}
        >
          <FiClock size={16} />
        </button>

        <button
          type="button"
          onClick={goBackAndReset}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-gray-400 transition-colors hover:bg-white/10 hover:text-gray-200"
          title="Reset"
        >
          <FiRotateCcw size={16} />
        </button>

        <button
          type="button"
          onClick={isRunning ? pause : start}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-gray-100 transition-colors hover:bg-white/15"
          title={isRunning ? 'Pause' : 'Start'}
        >
          {isRunning ? <FiPause size={18} /> : <FiPlay size={18} className="ml-0.5" />}
        </button>

        <button
          type="button"
          onClick={goSettings}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-gray-400 transition-colors hover:bg-white/10 hover:text-gray-200"
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
            className="w-full max-w-52 rounded-lg border border-gray-600 bg-gray-800 p-3 shadow-xl"
          >
            <p className="text-sm text-gray-200">
              Change technique? Current timer will be reset.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingTechnique(null)}
                className="flex items-center gap-1 rounded bg-gray-600 px-2.5 py-1 text-xs text-white hover:bg-gray-500"
              >
                <FiX size={12} /> Cancel
              </button>
              <button
                type="button"
                onClick={confirmTechniqueChange}
                className="flex items-center gap-1 rounded bg-gray-700 px-2.5 py-1 text-xs text-white hover:bg-gray-600"
              >
                <FiCheck size={12} /> Change
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

