import type { CollapsedAction, CollapsedSummary } from './registry';
import { normalizeConfig, formatStopwatch, formatTarget } from './pomodoro/shared';
import { togglePomodoro } from './pomodoro/timer';

/*
 * Que muestra cada widget cuando esta retraido.
 *
 * Viven aca y NO adentro de cada widget a proposito: `index.ts` los registra con
 * `lazy(() => import(...))`, y si el resumen fuera un export del mismo modulo del
 * componente, importarlo arriba cancelaria el lazy y el widget se descargaria en
 * el arranque aunque nunca se despliegue. Este archivo no importa ningun
 * componente.
 *
 * Todos son funciones PURAS sobre el config. Nada se monta: el cuerpo retraido
 * sigue desmontado, y mantenerlo vivo para leer estado seria devolver el
 * problema del reloj del pomodoro.
 */

/** `YYYY-MM-DD`, el mismo formato que usa el habit-tracker para `completedDates`. */
function today(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/* -------------------------------------------------------------------------- */

export function todoListSummary(config: Record<string, unknown>): CollapsedSummary | null {
  const items = Array.isArray(config.items) ? config.items : [];
  const total = items.length;
  if (!total) return null;
  /*
   * `items` es plano y los hijos se enlazan con `parentId`, asi que alcanza con
   * contar sobre el array entero: roots y descendientes. Es el mismo criterio que
   * usa el widget para su seccion `Completed (N)`.
   */
  const done = items.filter((i) => (i as { completed?: boolean }).completed).length;
  return { value: `${done}/${total}`, bar: { done, total } };
}

/* -------------------------------------------------------------------------- */

export function habitSummary(config: Record<string, unknown>): CollapsedSummary | null {
  const habits = Array.isArray(config.habits) ? config.habits : [];
  const total = habits.length;
  if (!total) return null;
  const day = today();
  const done = habits.filter((h) => {
    const dates = (h as { completedDates?: unknown }).completedDates;
    return Array.isArray(dates) && dates.includes(day);
  }).length;
  return { value: `${done}/${total}`, detail: 'hoy', bar: { done, total } };
}

/* -------------------------------------------------------------------------- */

export function pomodoroSummary(config: Record<string, unknown>): CollapsedSummary | null {
  const cfg = normalizeConfig(config);
  const tone = cfg.state === 'running' ? 'p2' : 'neutral';
  /*
   * El contexto de QUE estas cronometrando, no el dato: el dato es cuanto falta.
   * Y sale del config vivo cuando el widget esta retraido, asi que sigue al reloj
   * sin necesidad de montar nada.
   *
   * Sin tarea vinculada el contexto es la seccion, con las mismas palabras que usa
   * el widget desplegado -- BREAK / FOCUS / STOPWATCH -- para que retraer no
   * cambie el idioma. Un retraido con el hueco vacio no dice si estas trabajando o
   * descansando.
   *
   * Countup va con la forma CORTA. La fila retraida deja para el detalle lo que
   * sobra despues del anillo, del tiempo y de la barra: unas pocas decenas de
   * pixeles, y "STOPWATCH" no entra ni de lejos. Decidirlo midiendo el ancho en
   * JS seria volver a la medicion que hace un rato hubo que sacar -- y aqui no
   * hace falta, porque la fila retraida es angosta siempre.
   */
  const linked = cfg.linkedTaskName?.trim() ? cfg.linkedTaskName.trim() : undefined;
  const detail =
    linked ?? (cfg.technique === 'countup' ? 'STOPW' : cfg.phase === 'break' ? 'BREAK' : 'FOCUS');

  if (cfg.technique === 'countup') {
    /*
     * El objetivo es lo que la tarea estimada aporta. Sin el, `workMinutes` no lo
     * lee nadie en countup y vincular una tarea con tiempo no cambiaba nada visible:
     * el estimado llegaba al config y se quedaba ahi.
     *
     * Se muestra solo si hay referencia. Un stopwatch sin estimado es un stopwatch
     * sin techo, y `/ 00:00` al lado del numero seria mentira.
     */
    const budget = Math.round(cfg.workMinutes);
    return {
      value: formatStopwatch(cfg.elapsedMs),
      target: budget > 0 ? formatTarget(budget) : undefined,
      detail,
      tone,
    };
  }
  const total = cfg.phase === 'break' ? cfg.restMinutes * 60 : cfg.workMinutes * 60;
  if (!total) return null;
  const remaining = Math.max(0, Math.min(total, cfg.remainingSeconds));
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return {
    value: `${m}:${String(s).padStart(2, '0')}`,
    detail,
    // El anillo va en gris salvo que el reloj este corriendo: el ambar esta
    // reservado para "esto esta corriendo", no para cualquier barra de progreso.
    ring: { done: total - remaining, total },
    tone,
  };
}

/* -------------------------------------------------------------------------- */

export function calculatorSummary(config: Record<string, unknown>): CollapsedSummary | null {
  const last = typeof config.lastResult === 'string' ? config.lastResult : '';
  const history = Array.isArray(config.history) ? (config.history as unknown[]) : [];
  const first = history[0];
  if (typeof first === 'string' && first.trim() && last) {
    /*
     * `handleEquals` guarda la entrada como `${formula} ${result}` y el
     * resultado aparte en `lastResult`. Se recorta por la cola en vez de partir
     * por el "=", que no es un separador confiable: un resultado negativo
     * ("2 - 5 = -3") mete otro "=" que no existe pero el string igual lo tiene
     * una sola vez, y partir por el primero es fragil si la formula trae parensis.
     */
    const suffix = ` ${last}`;
    if (first.endsWith(suffix)) {
      return { formula: first.slice(0, -suffix.length), value: last };
    }
  }
  if (last.trim()) return { value: last };
  return null;
}

/* -------------------------------------------------------------------------- */

export function diarySummary(config: Record<string, unknown>): CollapsedSummary | null {
  const entries = (config.entries ?? {}) as Record<string, string>;
  if (typeof entries !== 'object' || entries === null) return null;
  /*
   * Las claves son numeros de pagina, NO fechas: el diario es paginado. Asi que
   * "donde quedaste" es la pagina mas alta con texto, no la de hoy.
   */
  let lastPage = -1;
  let lastText = '';
  for (const [key, text] of Object.entries(entries)) {
    const page = Number(key);
    if (!Number.isInteger(page) || typeof text !== 'string' || !text.trim()) continue;
    if (page > lastPage) {
      lastPage = page;
      lastText = text;
    }
  }
  if (lastPage < 0) return null;
  const words = lastText.trim().split(/\s+/).length;
  return { value: `${words} palabras`, detail: `p.${lastPage}` };
}

/* -------------------------------------------------------------------------- */

/*
 * Notes no aporta nada, y eso es una decision y no un faltante: no hay un numero
 * honesto para un texto libre. Un conteo de palabras es aburrido y cierto, y un
 * excerpt del contenido lo filtra en una vista que se lee de un vistazo. El
 * espacio en blanco es la respuesta.
 */
export function notesSummary(): CollapsedSummary | null {
  return null;
}

/* -------------------------------------------------------------------------- */

/*
 * Botonera del pomodoro retraido.
 *
 * `togglePomodoro` va al modulo y no al componente justamente porque esto se
 * dibuja con el widget COLLAPSADO, o sea sin componente montado. El readout no
 * puede llamar a un handler del cuerpo que no existe.
 *
 * El estado sale del config que le pasa el frame, que ya viene del store vivo:
 * asi el icono cambia en el mismo clic, sin esperar el siguiente tick.
 */
export function pomodoroActions(widgetId: string, config: Record<string, unknown>): CollapsedAction[] {
  const cfg = normalizeConfig(config);
  const running = cfg.state === 'running';
  return [
    {
      label: running ? 'Pause' : 'Start',
      tone: running ? 'p2' : 'neutral',
      onSelect: () => {
        togglePomodoro(widgetId);
      },
    },
  ];
}
