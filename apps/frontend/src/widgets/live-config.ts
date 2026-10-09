/*
 * Store de config "vivo", por widget.
 *
 * Existe por un motivo puntual: hay widgets cuyo estado avanza solo --hoy, solo
 * el pomodoro-- y mientras estan retraidos su componente no esta montado, asi
 * que no hay nada que escriba en el estado de React. Un readout que leyera del
 * config de props se dibujaria una vez y quedaria congelado.
 *
 * Va GENERICO a proposito y no adentro de `pomodoro/timer.ts`. Si el emitter
 * estuviera ahi, `WidgetFrame` tendria que importar de pomodoro para suscribirse
 * y el frame pasaria a saber de un widget en particular: se rompe la unica regla
 * que hace que los seis sean intercambiables. Quien publica (el reloj) y quien
 * lee (el frame) se conocen uno del otro solo por este modulo.
 *
 * El snapshot se guarda por REFERENCIA y nunca se copia: `useSyncExternalStore`
 * compara con `Object.is`, asi que devolver una copia nueva en cada lectura
 * seria un render loop infinito.
 */

type Listener = () => void;

const listeners = new Set<Listener>();
const live = new Map<string, Record<string, unknown>>();

function emit() {
  // Copia antes de iterar: un listener puede desuscribirse durante el recorrido.
  for (const cb of [...listeners]) cb();
}

export function setLiveConfig(id: string, config: Record<string, unknown>) {
  live.set(id, config);
  emit();
}

export function clearLiveConfig(id: string) {
  if (live.delete(id)) emit();
}

/** Devuelve la referencia almacenada. No clonar: ver nota arriba. */
export function getLiveConfig(id: string): Record<string, unknown> | null {
  return live.get(id) ?? null;
}

export function subscribeLiveConfig(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}