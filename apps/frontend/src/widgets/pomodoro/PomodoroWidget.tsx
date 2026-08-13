import { memo, useCallback, useRef, useEffect } from 'react';

let audioCtx: AudioContext | null = null;

function playAlarm() {
  try {
    if (!audioCtx) {
      audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.5);

    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    osc2.frequency.value = 1100;
    osc2.type = 'sine';
    gain2.gain.setValueAtTime(0.3, audioCtx.currentTime + 0.6);
    gain2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1.1);
    osc2.start(audioCtx.currentTime + 0.6);
    osc2.stop(audioCtx.currentTime + 1.1);
  } catch {
    // audio not supported
  }

  try {
    if (Notification.permission === 'granted') {
      new Notification('Pomodoro', { body: 'Timer finished!' });
    } else if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  } catch {
    // notifications not supported
  }
}

interface PomodoroConfig {
  workMinutes: number;
  restMinutes: number;
  state: 'idle' | 'running' | 'paused' | 'break';
  remainingSeconds: number;
  cycleCount: number;
  phase: 'work' | 'break';
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

function normalizeConfig(config: Record<string, unknown>): PomodoroConfig {
  const workMinutes = typeof config.workMinutes === 'number' ? config.workMinutes : 25;
  const restMinutes = typeof config.restMinutes === 'number' ? config.restMinutes : 5;
  const state =
    config.state === 'running' || config.state === 'paused' || config.state === 'break'
      ? config.state
      : 'idle';
  const phase = config.phase === 'break' ? 'break' : 'work';
  const remainingSeconds =
    typeof config.remainingSeconds === 'number' ? config.remainingSeconds : workMinutes * 60;
  const cycleCount = typeof config.cycleCount === 'number' ? config.cycleCount : 0;
  return { workMinutes, restMinutes, state, remainingSeconds, cycleCount, phase };
}

export const PomodoroWidget = memo(function PomodoroWidget({ config, onConfigChange }: PomodoroWidgetProps) {
  const c = normalizeConfig(config);
  const { workMinutes, restMinutes, state, remainingSeconds, cycleCount, phase } = c;

  const startTimeRef = useRef(0);
  const configRef = useRef(normalizeConfig(config));
  const remainingRef = useRef(remainingSeconds);
  const onConfigChangeRef = useRef(onConfigChange);
  const workerRef = useRef<Worker | null>(null);
  const isRunningRef = useRef(state === 'running');

  configRef.current = normalizeConfig(config);
  remainingRef.current = remainingSeconds;
  onConfigChangeRef.current = onConfigChange;
  isRunningRef.current = state === 'running';

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
      const totalSecs = curCfg.phase === 'break' ? curCfg.restMinutes * 60 : curCfg.workMinutes * 60;
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const newRemaining = Math.max(0, totalSecs - elapsed);

      if (newRemaining <= 0) {
        w.postMessage({ t: 'stop' });
        playAlarm();
        if (curCfg.phase === 'work') {
          onConfigChangeRef.current({
            ...curCfg,
            state: 'break',
            phase: 'break',
            remainingSeconds: curCfg.restMinutes * 60,
            cycleCount: curCfg.cycleCount + 1,
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
    };
    workerRef.current = w;
    return () => w.terminate();
  }, []);

  useEffect(() => {
    if (state === 'running') {
      const totalSecs = phase === 'break' ? restMinutes * 60 : workMinutes * 60;
      const alreadyElapsed = totalSecs - remainingSeconds;
      startTimeRef.current = Date.now() - alreadyElapsed * 1000;
      workerRef.current?.postMessage({ t: 'start' });
    } else {
      workerRef.current?.postMessage({ t: 'stop' });
    }
  }, [state, workMinutes, restMinutes, phase]);

  const start = useCallback(() => {
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
  }, [state, phase, remainingSeconds, workMinutes, restMinutes, config, onConfigChange]);

  const pause = useCallback(() => {
    workerRef.current?.postMessage({ t: 'stop' });
    onConfigChange({ ...config, state: 'paused' });
  }, [config, onConfigChange]);

  const reset = useCallback(() => {
    workerRef.current?.postMessage({ t: 'stop' });
    onConfigChange({ ...config, state: 'idle', phase: 'work', remainingSeconds: workMinutes * 60, cycleCount: 0 });
  }, [workMinutes, config, onConfigChange]);

  const isRunning = state === 'running';
  const totalSeconds = phase === 'break' ? restMinutes * 60 : workMinutes * 60;
  const progress = totalSeconds > 0 ? ((totalSeconds - remainingSeconds) / totalSeconds) * 100 : 0;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <div className="flex items-center justify-center gap-3">
        <div className="relative flex items-center justify-center">
          <svg width="140" height="140" className="-rotate-90">
            <circle cx="70" cy="70" r="60" fill="none" stroke="#222936" strokeWidth="6" />
            <circle cx="70" cy="70" r="60" fill="none"
              stroke={phase === 'break' ? '#22c55e' : '#3b82f6'} strokeWidth="6"
              strokeDasharray={`${2 * Math.PI * 60}`}
              strokeDashoffset={`${2 * Math.PI * 60 * (1 - Math.min(progress, 100) / 100)}`}
              strokeLinecap="round" className="transition-all duration-1000" />
          </svg>
          <span className="absolute text-2xl font-mono font-bold text-gray-200">{formatTime(remainingSeconds)}</span>
        </div>
      </div>

      <div className="flex gap-2">
        {isRunning ? (
          <button type="button" onClick={pause} className="rounded bg-yellow-500 px-4 py-1 text-sm text-white hover:bg-yellow-600">Pause</button>
        ) : (
          <button type="button" onClick={start}
            className="rounded bg-blue-500 px-4 py-1 text-sm text-white hover:bg-blue-600 disabled:opacity-50">Start</button>
        )}
        <button type="button" onClick={reset} className="rounded bg-gray-600 px-4 py-1 text-sm text-gray-300 hover:bg-gray-500">Reset</button>
      </div>

      {cycleCount > 0 && (
        <div className="text-xs text-gray-500">
          {cycleCount} cycles
        </div>
      )}

      <div className="flex gap-2 text-xs">
        <label className="flex items-center gap-1 text-gray-400">
          Work
          <input type="number" min={1} max={60} value={workMinutes}
            onChange={(e) => { workerRef.current?.postMessage({ t: 'stop' }); onConfigChange({ ...config, workMinutes: Number(e.target.value), remainingSeconds: Number(e.target.value) * 60, state: 'idle', phase: 'work' }); }}
            className="w-12 rounded border border-gray-600 bg-gray-700 px-1 py-0.5 text-center text-gray-200" disabled={isRunning} />
        </label>
        <label className="flex items-center gap-1 text-gray-400">
          Rest
          <input type="number" min={1} max={30} value={restMinutes}
            onChange={(e) => { const v = Number(e.target.value); onConfigChange({ ...config, restMinutes: v, ...(phase === 'break' && state !== 'running' ? { remainingSeconds: v * 60 } : {}) }); }}
            className="w-12 rounded border border-gray-600 bg-gray-700 px-1 py-0.5 text-center text-gray-200" disabled={isRunning} />
        </label>
      </div>
    </div>
  );
});
