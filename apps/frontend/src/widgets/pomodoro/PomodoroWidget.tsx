import { memo, useCallback, useRef, useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { FiArrowLeft, FiPause, FiPlay, FiRotateCcw, FiSettings, FiCheck, FiX, FiClock, FiEdit } from 'react-icons/fi';
import { widgetBus } from '../widget-bus';

let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playDing() {
  try {
    const ctx = getAudioCtx();
    const t = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const g1 = ctx.createGain();
    osc1.connect(g1); g1.connect(ctx.destination);
    osc1.frequency.value = 880; osc1.type = 'sine';
    g1.gain.setValueAtTime(0.3, t);
    g1.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
    osc1.start(t); osc1.stop(t + 0.5);

    const osc2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    osc2.connect(g2); g2.connect(ctx.destination);
    osc2.frequency.value = 1100; osc2.type = 'sine';
    g2.gain.setValueAtTime(0.3, t + 0.6);
    g2.gain.exponentialRampToValueAtTime(0.01, t + 1.1);
    osc2.start(t + 0.6); osc2.stop(t + 1.1);
  } catch { /* */ }
}

function playChime() {
  try {
    const ctx = getAudioCtx();
    const t = ctx.currentTime;
    const notes = [523, 659, 784];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.frequency.value = freq; osc.type = 'sine';
      const start = t + i * 0.2;
      g.gain.setValueAtTime(0.25, start);
      g.gain.exponentialRampToValueAtTime(0.01, start + 0.6);
      osc.start(start); osc.stop(start + 0.6);
    });
  } catch { /* */ }
}

function playDigital() {
  try {
    const ctx = getAudioCtx();
    const t = ctx.currentTime;
    for (let i = 0; i <3; i++) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.frequency.value = 1000; osc.type = 'square';
      const start = t + i * 0.15;
      g.gain.setValueAtTime(0.15, start);
      g.gain.exponentialRampToValueAtTime(0.01, start + 0.1);
      osc.start(start); osc.stop(start + 0.1);
    }
  } catch { /* */ }
}

function playSound(name: string) {
  if (name === 'chime') playChime();
  else if (name === 'digital') playDigital();
  else playDing();
}

function sendNotification() {
  try {
    if (Notification.permission === 'granted') {
      new Notification('Pomodoro', { body: 'Timer finished!' });
    } else if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  } catch { /* */ }
}

interface PomodoroConfig {
  technique: Technique;
  workMinutes: number;
  restMinutes: number;
  longRestMinutes: number;
  alarmSound: string;
  state: 'idle' | 'running' | 'paused' | 'break';
  remainingSeconds: number;
  elapsedSeconds: number;
  cycleCount: number;
  phase: 'work' | 'break';
  linkedTaskId?: string;
  linkedTaskName?: string;
  timerIndex?: number;
  title?: string;
}

interface PomodoroWidgetProps {
  config: Record<string, unknown>;
  onConfigChange: (config: Record<string, unknown>) => void;
  widgetId?: string;
}

function formatTimeShort(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (s === 0) return `${m}m`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function formatTimeCountup(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${String(s).padStart(2, '0')}s`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

type Technique = 'pomodoro' | 'custom' | '52-17' | 'countup';

interface TechniquePreset {
  label: string;
  workMinutes: number;
  restMinutes: number;
  longRestMinutes: number;
}

const TECHNIQUES: Record<Technique, TechniquePreset> = {
  'pomodoro':  { label: 'Pomodoro', workMinutes: 25, restMinutes: 5,  longRestMinutes: 15 },
  'custom':    { label: 'Custom',   workMinutes: 30, restMinutes: 10, longRestMinutes: 20 },
  '52-17':     { label: '52/17',    workMinutes: 52, restMinutes: 17, longRestMinutes: 17 },
  'countup':   { label: 'Flow',     workMinutes: 0,  restMinutes: 0,  longRestMinutes: 0 },
};

const TECHNIQUE_KEYS: Technique[] = ['pomodoro', 'custom', '52-17', 'countup'];

function normalizeConfig(config: Record<string, unknown>): PomodoroConfig {
  const technique = TECHNIQUE_KEYS.includes(config.technique as Technique)
    ? (config.technique as Technique)
    : 'pomodoro';
  const preset = TECHNIQUES[technique];
  return {
    technique,
    workMinutes: typeof config.workMinutes === 'number' ? config.workMinutes : preset.workMinutes,
    restMinutes: typeof config.restMinutes === 'number' ? config.restMinutes : preset.restMinutes,
    longRestMinutes: typeof config.longRestMinutes === 'number' ? config.longRestMinutes : preset.longRestMinutes,
    alarmSound: typeof config.alarmSound === 'string' ? config.alarmSound : 'ding',
    state:
      config.state === 'running' || config.state === 'paused' || config.state === 'break'
        ? config.state
        : 'idle',
    phase: config.phase === 'break' ? 'break' : 'work',
    remainingSeconds:
      typeof config.remainingSeconds === 'number'
        ? config.remainingSeconds
        : (typeof config.workMinutes === 'number' ? config.workMinutes : preset.workMinutes) * 60,
    elapsedSeconds: typeof config.elapsedSeconds === 'number' ? config.elapsedSeconds : 0,
    cycleCount: typeof config.cycleCount === 'number' ? config.cycleCount : 0,
    linkedTaskId: typeof config.linkedTaskId === 'string' ? config.linkedTaskId : undefined,
    linkedTaskName: typeof config.linkedTaskName === 'string' ? config.linkedTaskName : undefined,
    timerIndex: typeof config.timerIndex === 'number' ? config.timerIndex : undefined,
    title: typeof config.title === 'string' ? config.title : undefined,
  };
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

  const startTimeRef = useRef(0);
  const configRef = useRef(c);
  const remainingRef = useRef(remainingSeconds);
  const onConfigChangeRef = useRef(onConfigChange);
  const workerRef = useRef<Worker | null>(null);
  const isRunningRef = useRef(state === 'running');

  configRef.current = c;
  remainingRef.current = remainingSeconds;
  onConfigChangeRef.current = onConfigChange;
  isRunningRef.current = state === 'running';

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

  useEffect(() => {
    const blob = new Blob([
      `let i = null; onmessage = function(e) {
        if (e.data.t === 'start' && !i) { i = setInterval(() => postMessage('t'), 1000); }
        if (e.data.t === 'stop' && i) { clearInterval(i); i = null; }
      };`,
    ], { type: 'application/javascript' });
    const w = new Worker(URL.createObjectURL(blob));
    w.onmessage = () => {
      if (!isRunningRef.current) return;
      const curCfg = configRef.current;

      if (curCfg.technique === 'countup') {
        const newElapsed = curCfg.elapsedSeconds + 1;
        onConfigChangeRef.current({ ...curCfg, elapsedSeconds: newElapsed });
        if (curCfg.linkedTaskId) {
          widgetBus.emit('timer:tick', { taskId: curCfg.linkedTaskId, elapsed: newElapsed, remaining: 0 });
        }
        return;
      }

      const totalSecs = curCfg.phase === 'break' ? curCfg.restMinutes * 60 : curCfg.workMinutes * 60;
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const newRemaining = Math.max(0, totalSecs - elapsed);

      if (newRemaining <= 0) {
        w.postMessage({ t: 'stop' });
        playSound(curCfg.alarmSound);
        sendNotification();
        if (curCfg.linkedTaskId) {
          widgetBus.emit('timer:complete', { taskId: curCfg.linkedTaskId });
        }
        if (curCfg.phase === 'work') {
          const newCycle = curCfg.cycleCount + 1;
          const isLongRest = newCycle % 4 === 0;
          const breakDur = isLongRest ? curCfg.longRestMinutes : curCfg.restMinutes;
          onConfigChangeRef.current({
            ...curCfg,
            state: 'break',
            phase: 'break',
            remainingSeconds: breakDur * 60,
            cycleCount: newCycle,
          });
        } else {
          onConfigChangeRef.current({
            ...curCfg,
            state: 'idle',
            phase: 'work',
            remainingSeconds: curCfg.workMinutes * 60,
          });
        }
        return;
      }

      remainingRef.current = newRemaining;
      onConfigChangeRef.current({ ...curCfg, remainingSeconds: newRemaining });
      if (curCfg.linkedTaskId) {
        widgetBus.emit('timer:tick', { taskId: curCfg.linkedTaskId, elapsed: totalSecs - newRemaining, remaining: newRemaining });
      }
    };
    workerRef.current = w;
    return () => w.terminate();
  }, []);

  useEffect(() => {
    if (state === 'running') {
      if (technique === 'countup') {
        startTimeRef.current = Date.now() - elapsedSeconds * 1000;
      } else {
        const totalSecs = phase === 'break' ? restMinutes * 60 : workMinutes * 60;
        const alreadyElapsed = totalSecs - remainingSeconds;
        startTimeRef.current = Date.now() - alreadyElapsed * 1000;
      }
      workerRef.current?.postMessage({ t: 'start' });
    } else {
      workerRef.current?.postMessage({ t: 'stop' });
    }
  }, [state, workMinutes, restMinutes, phase, technique, elapsedSeconds]);

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
    remainingRef.current = init;
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
    workerRef.current?.postMessage({ t: 'stop' });
    onConfigChange({ ...config, state: 'paused' });
    if (linkedTaskId) {
      widgetBus.emit('timer:pause', { taskId: linkedTaskId });
    }
  }, [config, linkedTaskId, onConfigChange]);

  const goSettings = useCallback(() => {
    workerRef.current?.postMessage({ t: 'stop' });
    onConfigChange({ ...config, state: 'paused' });
    setView('settings');
  }, [config, onConfigChange]);

  const goBackAndReset = useCallback(() => {
    workerRef.current?.postMessage({ t: 'stop' });
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
    workerRef.current?.postMessage({ t: 'stop' });
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

  const ringColor = phase === 'break' ? '#22c55e' : '#22d3ee';

  const openTaskPicker = useCallback(() => {
    widgetBus.emit('open-task-picker', {});
  }, []);

  const unlinkTask = useCallback(() => {
    workerRef.current?.postMessage({ t: 'stop' });
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
                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
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
                      className="mt-0.5 w-full rounded bg-gray-800 px-2 py-1 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-cyan-400"
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
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
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
                className={`mt-1 flex w-full items-center justify-between rounded bg-gray-800 px-2 py-1.5 text-sm text-gray-200 outline-none transition-colors ${
                  alarmOpen ? 'ring-1 ring-cyan-400' : ''
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
                          ? 'bg-cyan-500/15 text-cyan-400'
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
        <div className="mt-2 text-sm font-medium text-cyan-400 truncate max-w-[200px]">
          {linkedTaskName}
        </div>
      ) : (
        <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
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
                filled ? 'bg-cyan-400' : 'bg-white/15'
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
              ? 'bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500/25'
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
                className="flex items-center gap-1 rounded bg-cyan-600 px-2.5 py-1 text-xs text-white hover:bg-cyan-500"
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
