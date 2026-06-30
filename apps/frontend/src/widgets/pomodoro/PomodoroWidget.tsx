import { useCallback, useRef, useEffect } from 'react';

function playAlarm() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.frequency.value = 1100;
    osc2.type = 'sine';
    gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.6);
    gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.1);
    osc2.start(ctx.currentTime + 0.6);
    osc2.stop(ctx.currentTime + 1.1);
  } catch {
    // audio not supported
  }
}

interface PomodoroConfig {
  workMinutes: number;
  restMinutes: number;
  state: 'idle' | 'running' | 'paused' | 'break';
  remainingSeconds: number;
  cycleCount: number;
}

interface PomodoroWidgetProps {
  config: Record<string, unknown>;
  onConfigChange: (config: Record<string, unknown>) => void;
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function PomodoroWidget({ config, onConfigChange }: PomodoroWidgetProps) {
  const c = config as PomodoroConfig;
  const { workMinutes = 25, restMinutes = 5, state = 'idle', remainingSeconds = workMinutes * 60, cycleCount = 0 } = c;

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const configRef = useRef(config);
  const remainingRef = useRef(remainingSeconds);
  const onConfigChangeRef = useRef(onConfigChange);

  configRef.current = config;
  remainingRef.current = remainingSeconds;
  onConfigChangeRef.current = onConfigChange;

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const tick = useCallback(() => {
    const curCfg = configRef.current as PomodoroConfig;
    const curRemaining = remainingRef.current;

    if (curRemaining <= 1) {
      clearTimer();
      playAlarm();
      const isWork = curCfg.state === 'running';
      onConfigChangeRef.current({
        ...curCfg,
        state: isWork ? 'break' : 'idle',
        remainingSeconds: isWork ? curCfg.restMinutes * 60 : curCfg.workMinutes * 60,
        cycleCount: isWork ? curCfg.cycleCount + 1 : curCfg.cycleCount,
      });
      return;
    }

    remainingRef.current = curRemaining - 1;
    onConfigChangeRef.current({ ...curCfg, remainingSeconds: curRemaining - 1 });
  }, [clearTimer]);

  useEffect(() => {
    if (state === 'running') {
      intervalRef.current = setInterval(tick, 1000);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [state, tick]);

  const start = useCallback(() => {
    const init = state === 'idle' || state === 'break' ? workMinutes * 60 : remainingSeconds;
    remainingRef.current = init;
    onConfigChange({ ...config, state: 'running', remainingSeconds: init });
  }, [state, remainingSeconds, workMinutes, config, onConfigChange]);

  const pause = useCallback(() => {
    clearTimer();
    onConfigChange({ ...config, state: 'paused' });
  }, [config, onConfigChange, clearTimer]);

  const reset = useCallback(() => {
    clearTimer();
    onConfigChange({ ...config, state: 'idle', remainingSeconds: workMinutes * 60 });
  }, [workMinutes, config, onConfigChange, clearTimer]);

  const isRunning = state === 'running';
  const totalSeconds = state === 'break' ? restMinutes * 60 : workMinutes * 60;
  const progress = totalSeconds > 0 ? ((totalSeconds - remainingSeconds) / totalSeconds) * 100 : 0;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <div className="relative flex items-center justify-center">
        <svg width="140" height="140" className="-rotate-90">
          <circle cx="70" cy="70" r="60" fill="none" stroke="#374151" strokeWidth="6" />
          <circle cx="70" cy="70" r="60" fill="none"
            stroke={state === 'break' ? '#22c55e' : '#3b82f6'} strokeWidth="6"
            strokeDasharray={`${2 * Math.PI * 60}`}
            strokeDashoffset={`${2 * Math.PI * 60 * (1 - Math.min(progress, 100) / 100)}`}
            strokeLinecap="round" className="transition-all duration-1000" />
        </svg>
        <span className="absolute text-2xl font-mono font-bold text-gray-200">{formatTime(remainingSeconds)}</span>
      </div>

      <div className="flex gap-2">
        {isRunning ? (
          <button onClick={pause} className="rounded bg-yellow-500 px-4 py-1 text-sm text-white hover:bg-yellow-600">Pause</button>
        ) : (
          <button onClick={start} disabled={state === 'break'}
            className="rounded bg-blue-500 px-4 py-1 text-sm text-white hover:bg-blue-600 disabled:opacity-50">Start</button>
        )}
        <button onClick={reset} className="rounded bg-gray-600 px-4 py-1 text-sm text-gray-300 hover:bg-gray-500">Reset</button>
      </div>

      <div className="text-xs text-gray-500">
        {state === 'break' ? `Break (${restMinutes}min)` : state === 'running' ? 'Focus' : state === 'paused' ? 'Paused' : 'Ready'}
        {cycleCount > 0 && ` \u00b7 ${cycleCount} cycles`}
      </div>

      <div className="flex gap-2 text-xs">
        <label className="flex items-center gap-1 text-gray-400">
          Work
          <input type="number" min={1} max={60} value={workMinutes}
            onChange={(e) => { clearTimer(); onConfigChange({ ...config, workMinutes: Number(e.target.value), remainingSeconds: Number(e.target.value) * 60, state: 'idle' }); }}
            className="w-12 rounded border border-gray-600 bg-gray-700 px-1 py-0.5 text-center text-gray-200" disabled={isRunning} />
        </label>
        <label className="flex items-center gap-1 text-gray-400">
          Rest
          <input type="number" min={1} max={30} value={restMinutes}
            onChange={(e) => onConfigChange({ ...config, restMinutes: Number(e.target.value) })}
            className="w-12 rounded border border-gray-600 bg-gray-700 px-1 py-0.5 text-center text-gray-200" disabled={isRunning} />
        </label>
      </div>
    </div>
  );
}
