import * as api from '../../api/widgets';
import { widgetBus } from '../widget-bus';
import { normalizeConfig, playSound, sendNotification, type PomodoroConfig } from './shared';

/*
 * El reloj del pomodoro, a nivel de modulo.
 *
 * Antes vivia dentro del componente, y eso lo hacia morir dos veces: `WidgetFrame`
 * renderiza el cuerpo con `{!collapsed && ...}`, asi que retraer un pomodoro
 * desmontaba el componente, `w.terminate()` mataba el Worker, y el `startTimeRef`
 * -- un `useRef` -- se iba con el. Al desplegar, el reloj se reconstruia desde
 * un `remainingSeconds` congelado y todo el tiempo que estuvo retraido se perdia.
 *
 * Ahora la vida del tick es la del widget en el dashboard, no la de su UI. Si el
 * componente esta montado escribe por el callback que le registro el widget; si
 * esta retraido escribe directo contra la API. El config es la verdad en los dos
 * casos, asi que no hay dos fuentes.
 *
 * Un Worker para todos los pomodoros, no uno por widget: el blob solo posta 't'
 * una vez por segundo y quien decide a quien le toca es `tickAll`.
 */

type Write = (config: Record<string, unknown>) => void;

interface Entry {
  widgetId: string;
  /** Config normalizada vigente. El tick nunca lee otra cosa. */
  cfg: PomodoroConfig;
  /**
   * Instante de pared desde el que se mide el avance. Es lo que el tick usa para
   * no acumular deriva, y sobrevive al desmontaje a proposito: perderlo era
   * media mitad del bug.
   */
  startTime: number;
  /** Callback del componente mientras esta montado; null si esta retraido. */
  write: Write | null;
}

const entries = new Map<string, Entry>();

let worker: Worker | null = null;
let ticking = false;

/** El Worker es un simple reloj de 1s. Quien decide es `tickAll`. */
function ensureWorker(): Worker {
  if (worker) return worker;
  const blob = new Blob(
    [
      `let i = null; onmessage = function(e) {
        if (e.data.t === 'start' && !i) { i = setInterval(() => postMessage('t'), 1000); }
        if (e.data.t === 'stop' && i) { clearInterval(i); i = null; }
      };`,
    ],
    { type: 'application/javascript' },
  );
  const w = new Worker(URL.createObjectURL(blob));
  w.onmessage = tickAll;
  worker = w;
  return w;
}

/* El intervalo es global: si queda uno corriendo, el Worker queda andando. */
function syncWorker() {
  const w = ensureWorker();
  const any = [...entries.values()].some((e) => e.cfg.state === 'running');
  if (any && !ticking) {
    w.postMessage({ t: 'start' });
    ticking = true;
  } else if (!any && ticking) {
    w.postMessage({ t: 'stop' });
    ticking = false;
  }
}

/** Instante de pared al que se ancla `remainingSeconds`. */
function anchorFor(cfg: PomodoroConfig): number {
  if (cfg.technique === 'countup') return Date.now() - cfg.elapsedSeconds * 1000;
  const total = cfg.phase === 'break' ? cfg.restMinutes * 60 : cfg.workMinutes * 60;
  return Date.now() - (total - cfg.remainingSeconds) * 1000;
}

/**
 * Avance contra el reloj de pared.
 *
 * Vive en un solo lugar a proposito: lo usan el tick y el registro al reconectar
 * un componente. Si las dos copias se desfasaran, el flash que arregla una
 * volvería por la otra.
 */
function progress(cfg: PomodoroConfig, startTime: number) {
  const total = cfg.phase === 'break' ? cfg.restMinutes * 60 : cfg.workMinutes * 60;
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  return { total, elapsed, remaining: Math.max(0, total - elapsed) };
}

/** Escribe el config por donde toque y deja el registro al día. */
function commit(entry: Entry, next: Record<string, unknown>) {
  const cfg = normalizeConfig(next);
  entry.cfg = cfg;
  if (entry.write) entry.write(next);
  else void api.updateWidget(entry.widgetId, { config: next });
}

function tickAll() {
  for (const entry of entries.values()) {
    const cfg = entry.cfg;
    if (cfg.state !== 'running') continue;

    if (cfg.technique === 'countup') {
      const elapsed = cfg.elapsedSeconds + 1;
      commit(entry, { ...cfg, elapsedSeconds: elapsed });
      if (cfg.linkedTaskId) {
        widgetBus.emit('timer:tick', { taskId: cfg.linkedTaskId, elapsed, remaining: 0 });
      }
      continue;
    }

    const { elapsed, remaining } = progress(cfg, entry.startTime);

    if (remaining <= 0) {
      playSound(cfg.alarmSound);
      sendNotification();
      if (cfg.linkedTaskId) {
        widgetBus.emit('timer:complete', { taskId: cfg.linkedTaskId });
      }
      if (cfg.phase === 'work') {
        const cycleCount = cfg.cycleCount + 1;
        const isLongRest = cycleCount % 4 === 0;
        const rest = isLongRest ? cfg.longRestMinutes : cfg.restMinutes;
        commit(entry, {
          ...cfg,
          state: 'break',
          phase: 'break',
          remainingSeconds: rest * 60,
          cycleCount,
        });
      } else {
        commit(entry, {
          ...cfg,
          state: 'idle',
          phase: 'work',
          remainingSeconds: cfg.workMinutes * 60,
        });
      }
      // El registro quedo en `break`/`idle`, o sea que ya no corre. Reanclar para
      // que un `start` posterior mida desde el valor recien escrito.
      entry.startTime = anchorFor(entry.cfg);
      syncWorker();
      continue;
    }

    commit(entry, { ...cfg, remainingSeconds: remaining });
    if (cfg.linkedTaskId) {
      widgetBus.emit('timer:tick', {
        taskId: cfg.linkedTaskId,
        elapsed,
        remaining,
      });
    }
  }
  syncWorker();
}

/*
 * Registro desde el componente.
 *
 * Se llama en cada cambio de config, no solo al montar. Es el unico lugar que
 * decide si un reloj corre o no: mira el `state`. Por eso los botones de pausa y
 * reset ya no mandan `postMessage('stop')` -- cambian el `state` y el reloj se
 * para solo, sin un segundo canal que pueda quedar desincronizado.
 */
export function registerPomodoroTimer(widgetId: string, raw: Record<string, unknown>, write: Write) {
  const next = normalizeConfig(raw);
  const entry = entries.get(widgetId);
  if (!entry) {
    entries.set(widgetId, { widgetId, cfg: next, startTime: anchorFor(next), write });
    syncWorker();
    return;
  }
  // Solo se reancla si cambia el estado o la duracion. Reanclar en cada tick
  // reintroduce la deriva que el reloj de pared justamente evita.
  const prev = entry.cfg;
  const durationChanged =
    prev.phase !== next.phase ||
    prev.technique !== next.technique ||
    prev.workMinutes !== next.workMinutes ||
    prev.restMinutes !== next.restMinutes;
  const wasRunning = prev.state === 'running';
  /*
   * El config que llega por props puede estar VIEJO, pero SOLO cuando no habia
   * nadie leyendo: si el widget estuvo retraido, el componente no estaba
   * montado y el tick escribia directo contra la API, asi que el arbol de React
   * se quedo congelado en el momento del colapso.
   *
   * El guard mira eso y no otra cosa. Con un `write` presente las props vienen
   * del camino vivo y son frescas, y reconciliarlas cada vez que el tick cambia
   * el config se pelearia con el tick: dos escrituras por segundo con valores
   * que difieren en 1, y el display parpadeando.
   */
  const wasUnwatched = entry.write === null;

  /*
   * Cuando el reloj sigue corriendo y las props estan viejas, el valor
   * autoritativo no es el de las props: es el del reloj de pared, o en countup el
   * acumulado que el tick ya lleva. Se corrige aca y se escribe de vuelta, asi el
   * componente ve el valor real en el mismo render en vez de dar un salto y
   * corregirse al segundo siguiente.
   */
  if (wasUnwatched && wasRunning && next.state === 'running') {
    if (next.technique === 'countup') {
      if (prev.elapsedSeconds > next.elapsedSeconds) {
        next.elapsedSeconds = prev.elapsedSeconds;
        write({ ...next });
      }
    } else {
      const live = progress(prev, entry.startTime).remaining;
      if (live !== next.remainingSeconds) {
        next.remainingSeconds = live;
        write({ ...next });
      }
    }
  }

  entry.write = write;
  entry.cfg = next;
  if (!wasRunning && next.state === 'running') entry.startTime = anchorFor(next);
  else if (durationChanged) entry.startTime = anchorFor(next);
  syncWorker();
}

/** Saca el callback del componente sin parar el reloj. Es el camino del repliegue. */
export function unregisterPomodoroTimer(widgetId: string) {
  const entry = entries.get(widgetId);
  if (entry) entry.write = null;
}

/** Para y olvida el reloj. Para el borrado del widget. */
export function disposePomodoroTimer(widgetId: string) {
  entries.delete(widgetId);
  syncWorker();
}

/** Hay un reloj vivo para este widget? Lo usa el anillo en miniatura del colapsado. */
export function readRunningPomodoro(widgetId: string): PomodoroConfig | null {
  const entry = entries.get(widgetId);
  return entry && entry.cfg.state === 'running' ? entry.cfg : null;
}

/** El contenido de un reloj oprimido, para pintar sin volverlo a montar. */
export function readPomodoroState(widgetId: string): Record<string, unknown> | null {
  const entry = entries.get(widgetId);
  return entry ? { ...entry.cfg } : null;
}