import * as api from '../../api/widgets';
import { widgetBus } from '../widget-bus';
import { setLiveConfig, clearLiveConfig } from '../live-config';
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
  /**
   * Milisegundos ya acumulados en el momento de anclar `startTime`. El total
   * corriente es `baselineMs + (Date.now() - startTime)`.
   *
   * Va aparte de `startTime` porque el tick NO reancla: si lo hiciera, el tiempo
   * ya consumido se perderia en cada tick. `startTime` es el instante en que empezo
   * el tramo actual --arrancar, reanudar, cambiar de duracion-- y `baselineMs` lo
   * que se habia acumulado hasta ahi.
   */
  baselineMs: number;
  /** Callback del componente mientras esta montado; null si esta retraido. */
  write: Write | null;
  /**
   * Ultimo config que se publico en el store generico.
   *
   * Sin esto, el registro solo podia saber si publicar mirando el `state`, y eso
   * es demasiado angosto: vincular o desvincular una tarea, o cambiar la duracion,
   * no mueven el `state` y el store se quedaba con el valor viejo. El readout
   * retraido lee del store, no de las props -- frozen -- asi que se veÃ­a la tarea
   * que ya no estaba vinculada.
   */
  published: PomodoroConfig | null;
}

const entries = new Map<string, Entry>();

const TICK_MS = 1000;
/**
 * Con un stopwatch corriendo el tick va diez veces mas rapido: sin esto no hay
 * fraccion que mostrar, porque `HH:MM:SS,SP` con el tick de un segundo solo
 * cambiaria una vez por segundo -- es decir, la centesima no se moveria.
 *
 * Solo baja la cadencia cuando hace falta. Con un pomodoro normal o con todos
 * los widgets retraidos corre a 1s como antes.
 */
const FAST_MS = 100;

let worker: Worker | null = null;
let ticking = false;
let tickingMs = TICK_MS;

/** El Worker es un reloj. Quien decide el ritmo y a quien le toca es `tickAll`. */
function ensureWorker(): Worker {
  if (worker) return worker;
  const blob = new Blob(
    [
      `let i = null, ms = 1000;
       onmessage = function(e) {
         var d = e.data;
         if (d.t === 'start' && (!i || d.ms !== ms)) {
           if (i) clearInterval(i);
           ms = d.ms;
           i = setInterval(function(){ postMessage('t'); }, ms);
         }
         if (d.t === 'stop' && i) { clearInterval(i); i = null; }
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
  const running = [...entries.values()].filter((e) => e.cfg.state === 'running');
  const ms = running.some((e) => e.cfg.technique === 'countup') ? FAST_MS : TICK_MS;
  if (running.length) {
    if (!ticking || tickingMs !== ms) {
      w.postMessage({ t: 'start', ms });
      ticking = true;
      tickingMs = ms;
    }
  } else if (ticking) {
    w.postMessage({ t: 'stop' });
    ticking = false;
    tickingMs = TICK_MS;
  }
}

/** Instante de pared al que se ancla `remainingSeconds`, o desde el que corre el stopwatch. */
function anchorFor(cfg: PomodoroConfig): number {
  if (cfg.technique === 'countup') return Date.now() - cfg.elapsedMs;
  const total = cfg.phase === 'break' ? cfg.restMinutes * 60 : cfg.workMinutes * 60;
  return Date.now() - (total - cfg.remainingSeconds) * 1000;
}

/**
 * Avance contra el reloj de pared.
 *
 * Vive en un solo lugar a proposito: lo usan el tick y el registro al reconectar
 * un componente. Si las dos copias se desfasaran, el flash que arregla una
 * volverÃ­a por la otra.
 */
function progress(cfg: PomodoroConfig, startTime: number) {
  const total = cfg.phase === 'break' ? cfg.restMinutes * 60 : cfg.workMinutes * 60;
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  return { total, elapsed, remaining: Math.max(0, total - elapsed) };
}

/**
 * El store vivo guarda `Record<string, unknown>`, y una interface sin index
 * signature no es asignable a ese tipo. El casteo va aca y no en cada llamada.
 */
const asConfig = (c: PomodoroConfig) => c as unknown as Record<string, unknown>;

/**
 * Si el config publico se aparta del que llega.
 *
 * Se mira TODO, no el `state`: desvincular una tarea no cambia el estado y aun
 * asi el readout tiene que enterarse. Como `normalizeConfig` devuelve un objeto
 * plano de primitivos, comparar campo por campo alcanza y sale mas barato que
 * serializar.
 */
function differs(a: PomodoroConfig | null, b: PomodoroConfig): boolean {
  if (!a) return true;
  return (
    a.state !== b.state ||
    a.phase !== b.phase ||
    a.technique !== b.technique ||
    a.remainingSeconds !== b.remainingSeconds ||
    a.elapsedSeconds !== b.elapsedSeconds ||
    a.cycleCount !== b.cycleCount ||
    a.workMinutes !== b.workMinutes ||
    a.restMinutes !== b.restMinutes ||
    a.longRestMinutes !== b.longRestMinutes ||
    a.alarmSound !== b.alarmSound ||
    a.linkedTaskId !== b.linkedTaskId ||
    a.linkedTaskName !== b.linkedTaskName ||
    a.timerIndex !== b.timerIndex ||
    a.title !== b.title
  );
}

/** Escribe el config por donde toque y deja el registro al dÃ­a. */
function commit(entry: Entry, next: Record<string, unknown>) {
  const cfg = normalizeConfig(next);
  entry.cfg = cfg;
  /*
   * Publica en el store generico para que el readout retraido se entere. `commit`
   * es el embudo unico de los cuatro caminos del tick, asi que notificar aca
   * alcanza: mientras el widget esta retraido no hay componente, no se puede
   * pausar ni resetear, y los unicos cambios posibles son los del tick.
   *
   * Se marca como publicado para que el registro no vuelva a disparar el store en
   * el mismo tick con el mismo valor y otra referencia.
   */
  entry.published = cfg;
  setLiveConfig(entry.widgetId, asConfig(cfg));
  if (entry.write) entry.write(next);
  else void api.updateWidget(entry.widgetId, { config: next });
}

function tickAll() {
  for (const entry of entries.values()) {
    const cfg = entry.cfg;
    if (cfg.state !== 'running') continue;

    if (cfg.technique === 'countup') {
      /*
       * El total sale del RELOJ DE PARED, no de un `+1`. Con el tick a 100ms un
       * acumulador entero de segundos solo podria redondear al segundo mas
       * cercano, y la centesima --que es justo lo que se pidio mostrar-- quedaria
       * clavada. Ademas el `setInterval` del Worker deriva, asi que el contador
       * perderia tiempo respecto de la realidad.
       *
       * El tick NO reancla: `startTime` es el instante en que arranco este tramo
       * y el consumo ya esta en `baselineMs`.
       */
      const totalMs = entry.baselineMs + (Date.now() - entry.startTime);
      const seconds = Math.floor(totalMs / 1000);
      const next = { ...cfg, elapsedMs: totalMs, elapsedSeconds: seconds };
      const norm = normalizeConfig(next);
      entry.cfg = norm;
      entry.published = norm;
      /*
       * Dos ritmos, a proposito: el store va en CADA tick, porque es lo que mueve
       * el digito de centesima, pero la base una vez por segundo. Diez escrituras
       * por segundo contra la API --que es lo que hay cuando el widget esta
       * retraido-- no lo aguanta, y tampoco hacen falta: el store ya lleva la
       * fraccion y se reconstruye desde el reloj al desplegar.
       */
      setLiveConfig(entry.widgetId, asConfig(norm));
      if (seconds !== cfg.elapsedSeconds) {
        if (entry.write) entry.write(next);
        else void api.updateWidget(entry.widgetId, { config: next });
      }
      if (cfg.linkedTaskId) {
        widgetBus.emit('timer:tick', { taskId: cfg.linkedTaskId, elapsed: seconds, remaining: 0 });
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
    /*
     * Se publica tambien en el alta. Antes no, y dejaba un agujero: un pomodoro
     * que nunca habia corrido no tenia entrada en el store, asi que el readout
     * retraido caia a las props -- congeladas en el momento del repliegue. Si
     * despues se desvinculara la tarea en estado `idle` (que no cambia el estado
     * y por lo tanto no disparaba ninguna publicacion), la tarea vieja se
     * quedaba pegada en el retraido.
     */
    entries.set(widgetId, {
      widgetId,
      cfg: next,
      startTime: anchorFor(next),
      baselineMs: next.elapsedMs,
      write,
      published: next,
    });
    setLiveConfig(widgetId, asConfig(next));
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
      // El ms manda: el entero solo no distingue dos ticks del mismo segundo.
      if (prev.elapsedMs > next.elapsedMs) {
        next.elapsedMs = prev.elapsedMs;
        next.elapsedSeconds = Math.floor(prev.elapsedMs / 1000);
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
  if (!wasRunning && next.state === 'running') {
    entry.startTime = anchorFor(next);
    entry.baselineMs = next.elapsedMs;
  } else if (durationChanged) {
    entry.startTime = anchorFor(next);
    entry.baselineMs = next.elapsedMs;
  }
  /*
   * Publica solo cuando el config se aparta del ultimo publicado, en vez de en
   * cada pasada.
   *
   * Publicar siempre alcanzaria, pero acÃ¡ se entra una vez por tick mientras
   * corre: serian dos disparos del store por segundo para escribir el mismo valor
   * con otra referencia. Y publicar solo cuando cambia el `state` --que fue lo
   * que habia-- dejaba sin notificar todo lo que no mueve el estado: vincular o
   * desvincular una tarea, cambiar la duracion, cambiar de tecnica en reposo.
   */
  if (differs(entry.published, next)) {
    entry.published = next;
    setLiveConfig(widgetId, asConfig(next));
  }
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
  clearLiveConfig(widgetId);
  syncWorker();
}

/*
 * Renombre de una tarea vinculada.
 *
 * Va a nivel de modulo y no en el widget por el mismo motivo que el tick: con el
 * pomodoro retraido no hay componente montado, asi que un listener de componente
 * no existiria y el reloj se quedaria con el nombre viejo. Aca corre siempre.
 *
 * `commit` escribe por donde toque segun haya componente o no, y publica en el
 * store, asi que el nombre corregido llega igual al readout retraido.
 */
widgetBus.on('task:rename', ({ taskId, taskName }) => {
  for (const entry of entries.values()) {
    if (entry.cfg.linkedTaskId !== taskId) continue;
    if (entry.cfg.linkedTaskName === taskName) continue;
    commit(entry, { ...entry.cfg, linkedTaskName: taskName });
  }
});

/*
 * Baja de una tarea vinculada.
 *
 * Mismo motivo que el renombre: a nivel de modulo, porque con el pomodoro retraido
 * no hay componente y el reloj tiene que enterarse igual.
 *
 * El enlace vive en el config del pomodoro, no en el de la tarea. Por eso borrar la
 * tarea NO lo deshace sola: sin esto el reloj seguia corriendo y el readout retraido
 * seguia mostrando un nombre que ya no existia en ninguna parte.
 *
 * El estado que queda es el mismo que dejaria el boton de desvincular del widget --
 * en `idle`, fase `work`, reloj y ciclo en cero -- para que borrar la tarea y
 * desvincular a mano sean indistinguibles de entrada.
 */
widgetBus.on('task:deleted', ({ taskId }) => {
  for (const entry of entries.values()) {
    if (entry.cfg.linkedTaskId !== taskId) continue;
    commit(entry, {
      ...entry.cfg,
      linkedTaskId: undefined,
      linkedTaskName: undefined,
      state: 'idle',
      phase: 'work',
      remainingSeconds: entry.cfg.workMinutes * 60,
      elapsedMs: 0,
      cycleCount: 0,
    });
    // El registro quedo en `idle`, o sea que ya no corre. Reanclar para que un
    // `start` posterior mida desde el valor recien escrito.
    entry.startTime = anchorFor(entry.cfg);
    widgetBus.emit('timer:reset', { taskId });
  }
  syncWorker();
});

/**
 * Que tareas tienen un pomodoro vinculado ahora mismo.
 *
 * Vive aca y no en el widget porque la verdad del enlace es del POMODORO: el
 * todo-list guarda que tarea esta corriendo, no a que timer esta atado. Preguntarle
 * al registro es la unica forma de que la respuesta no dependa de que widget este
 * expandido.
 *
 * Copia en un Set nuevo: el registro sigue siendo de este modulo.
 */
export function linkedTaskIds(): ReadonlySet<string> {
  return new Set(
    [...entries.values()]
      .map((e) => e.cfg.linkedTaskId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  );
}

/*
 * Lo unico que sale del registro es `linkedTaskIds`, y es una pregunta, no estado.
 * El readout retraido sigue sin enterarse de que existe un reloj: lee de
 * `live-config`, que es el store generico. Y lo que este modulo expone del reloj es
 * solo lo que otro widget necesita PARA COORDINARSE con el -- que tarea esta
 * atada --, nunca su config ni su cuenta regresiva.
 */
