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
  /**
   * Total del stopwatch en MILISEGUNDOS, con fraccion. Es el que alimenta el
   * formato `HH:MM:SS,SP`.
   *
   * `elapsedSeconds` no se saca: el tick lo emite en `timer:tick` y lo leian otros
   * widgets. Tener los dos es redundante a proposito -- el entero para el bus, el
   * ms para el display -- y el ms es el que manda. Si un config viejo llega sin
   * `elapsedMs`, `normalizeConfig` lo deriva del entero, asi que no hay migracion.
   */
  elapsedMs: number;
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
  'countup': { label: 'Stopwatch', workMinutes: 0, restMinutes: 0, longRestMinutes: 0 },
};

export const TECHNIQUE_KEYS: Technique[] = ['pomodoro', 'custom', '52-17', 'countup'];

export function normalizeConfig(config: Record<string, unknown>): PomodoroConfig {
  const technique = TECHNIQUE_KEYS.includes(config.technique as Technique)
    ? (config.technique as Technique)
    : 'pomodoro';
  const preset = TECHNIQUES[technique];
  /*
   * `elapsedMs` es la VERDAD del stopwatch y `elapsedSeconds` se deriva de el.
   *
   * Que sean dos campos que alguien pueda escribir por separado ya costo un bug:
   * el reinicio ponia `elapsedSeconds: 0` y dejaba `elapsedMs` con el valor viejo,
   * asi que el contador no volvia a cero -- el boton "pausaba" y nada mas.
   * Derivando uno del otro no hay nada que sincronizar, y los sitios que reinician
   * escriben un solo numero.
   *
   * Si viene un config viejo sin `elapsedMs`, se deriva del entero: no hace falta
   * migracion.
   */
  const elapsedMs =
    typeof config.elapsedMs === 'number'
      ? config.elapsedMs
      : (typeof config.elapsedSeconds === 'number' ? config.elapsedSeconds : 0) * 1000;
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
    elapsedSeconds: Math.floor(elapsedMs / 1000),
    elapsedMs,
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

/**
 * El display del cronografo: `HH:MM:SS,SP`.
 *
 * La coma separa la centesima en vez de un punto, que es como lo muestran los
 * cronografos. `SP` son dos digitos de centesima.
 */
export function formatStopwatch(ms: number): string {
  const safe = Math.max(0, ms);
  const cs = Math.floor(safe / 10) % 100;
  const total = Math.floor(safe / 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(total / 3600))}:${p(Math.floor(total / 60) % 60)}:${p(total % 60)},${p(cs)}`;
}

/**
 * El objetivo del stopwatch, que va al lado del numero: `10:00`, o `1:05:00` si
 * pasa de la hora.
 *
 * Formato DISTINTO del reloj a proposito. El reloj se cuenta y por eso lleva horas
 * fijas y centesimas; el objetivo se lee de un vistazo y por eso no las lleva --
 * `00:10:00` al lado de `00:04:12,34` seria ruido de relleno.
 */
export function formatTarget(totalMinutes: number): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const secs = Math.max(0, Math.round(totalMinutes)) * 60;
  const h = Math.floor(secs / 3600);
  const m = Math.floor(secs / 60) % 60;
  return h > 0 ? `${p(h)}:${p(m)}:${p(secs % 60)}` : `${p(m)}:${p(secs % 60)}`;
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