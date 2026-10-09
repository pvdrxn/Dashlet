/*
 * Piezas compartidas entre el widget y el reloj.
 *
 * Esto vivia dentro de `PomodoroWidget.tsx`. Se extrajo cuando el reloj (`timer.ts`)
 * paso a ser modulo aparte: el tick necesita leer el config, disparar la alarma y
 * la notificacion, y si los importara del componente se armaria un ciclo
 * (`PomodoroWidget` importa `timer`, `timer` importa `PomodoroWidget`). Tres
 * archivos, una responsabilidad cada uno: forma del config y alarmas, reloj, y UI.
 */

export type Technique = 'pomodoro' | 'custom' | '52-17' | 'countup';

export interface PomodoroConfig {
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

export interface TechniquePreset {
  label: string;
  workMinutes: number;
  restMinutes: number;
  longRestMinutes: number;
}

export const TECHNIQUES: Record<Technique, TechniquePreset> = {
  'pomodoro': { label: 'Pomodoro', workMinutes: 25, restMinutes: 5, longRestMinutes: 15 },
  'custom': { label: 'Custom', workMinutes: 30, restMinutes: 10, longRestMinutes: 20 },
  '52-17': { label: '52/17', workMinutes: 52, restMinutes: 17, longRestMinutes: 17 },
  'countup': { label: 'Flow', workMinutes: 0, restMinutes: 0, longRestMinutes: 0 },
};

export const TECHNIQUE_KEYS: Technique[] = ['pomodoro', 'custom', '52-17', 'countup'];

export function normalizeConfig(config: Record<string, unknown>): PomodoroConfig {
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

/** Segundos restantes en la forma corta que muestra el widget: "25m", "4m 07s". */
export function formatTimeShort(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (s === 0) return `${m}m`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

export function formatTimeCountup(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${String(s).padStart(2, '0')}s`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

/* -------------------------------------------------------------------------- */
/* Alarma. Vive aqui y no en el widget porque tiene que sonar con el widget    */
/* retraido, o sea con el componente desmontado.                              */
/* -------------------------------------------------------------------------- */

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

export function playSound(name: string) {
  if (name === 'chime') playChime();
  else if (name === 'digital') playDigital();
  else playDing();
}

export function sendNotification() {
  try {
    if (Notification.permission === 'granted') {
      new Notification('Pomodoro', { body: 'Timer finished!' });
    } else if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  } catch { /* */ }
}