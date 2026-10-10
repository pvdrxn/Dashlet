import { memo, useState, useCallback, useRef, useEffect, useSyncExternalStore, Suspense } from 'react';
import { FiChevronUp, FiChevronDown, FiX, FiMoreVertical, FiPlay, FiPause } from 'react-icons/fi';
import { widgetBus } from './widget-bus';
import { getWidget } from './registry';
import { getLiveConfig, subscribeLiveConfig } from './live-config';
import type { ComponentType } from './types';
/** Alto de la barra de titulo. */
const HEADER_HEIGHT = 25;
/*
 * Geometria del readout retraido.
 *
 * El anillo va en la fila del readout y NO en el slot del Ã­cono del header. El
 * header tiene 25px y no da: el anillo grande es radio 58 sobre caja 140 con
 * trazo 5; escalado a 18px el trazo queda en 0.64px y no se ve. En la fila del
 * readout entra holgado y el tiempo sigue a su derecha.
 *
 * El trazo NO es proporcional a proposito. Escalado da 1.43px a 40px, ilegible.
 * El piso de 3px lo hace visible aunque lo vuelva mas grueso en relacion que el
 * grande: es una desviacion deliberada, no un descuido.
 */
const MINI_RING_R = 16;
const MINI_RING_C = 2 * Math.PI * MINI_RING_R;
const MINI_RING_SIZE = 40;
/* Pista fija: dos widgets con 3/5 y 1/2 tienen que tener la misma para que los
 * rellenos sean comparables. */
const BAR_W = 'w-16';
/*
 * 8px: lo alto de las cifras de un `text-sm`. La barra pesa lo mismo que el
 * numero que tiene al lado, en vez de leerse como una regla de pelo al lado de un
 * dato solido.
 */
const BAR_H = 'h-2';

function toneColor(tone: 'neutral' | 'p2' | 'p3' | undefined): string {
  if (tone === 'p3') return 'var(--color-p3)';
  if (tone === 'p2') return 'var(--color-p2)';
  return 'var(--color-gray-400)';
}

function MiniRing({
  done,
  total,
  tone,
}: {
  done: number;
  total: number;
  tone?: 'neutral' | 'p2' | 'p3';
}) {
  const pct = total > 0 ? Math.max(0, Math.min(1, done / total)) : 0;
  return (
    <svg
      width={MINI_RING_SIZE}
      height={MINI_RING_SIZE}
      viewBox={`0 0 ${MINI_RING_SIZE} ${MINI_RING_SIZE}`}
      className="-rotate-90 shrink-0"
      aria-hidden="true"
    >
      <circle
        cx={MINI_RING_SIZE / 2}
        cy={MINI_RING_SIZE / 2}
        r={MINI_RING_R}
        fill="none"
        stroke="var(--color-gray-700)"
        strokeWidth={3}
      />
      <circle
        cx={MINI_RING_SIZE / 2}
        cy={MINI_RING_SIZE / 2}
        r={MINI_RING_R}
        fill="none"
        stroke={toneColor(tone)}
        strokeWidth={3}
        strokeDasharray={MINI_RING_C}
        strokeDashoffset={MINI_RING_C * (1 - pct)}
        strokeLinecap="round"
        /* 1s como el tick del reloj: el arco avanza al ritmo del segundo. */
        className="transition-[stroke-dashoffset] duration-1000 ease-linear"
      />
    </svg>
  );
}

/**
 * El config que hay que dibujar.
 *
 * Los widgets que publican estado que avanza solo lo escriben en `live-config`,
 * asi que con el retraido --sin componente montado-- las props quedan
 * congeladas en el momento del colapso. Para el resto, `config` ya es la
 * verdad y no hay nada que seguir.
 *
 * El hook se llama SIEMPRE, con suscripcion no-op si el widget no es vivo: si se
 * llamara solo en el caso vivo se romperia la regla de hooks.
 */
function useEffectiveConfig(
  type: string,
  widgetId: string,
  config: Record<string, unknown>,
): Record<string, unknown> {
  const live = getWidget(type)?.live === true;
  const subscribe = useCallback(
    (cb: () => void) => (live ? subscribeLiveConfig(cb) : () => {}),
    [live],
  );
  const snapshot = useCallback(
    () => (live ? getLiveConfig(widgetId) : null),
    [live, widgetId],
  );
  return useSyncExternalStore(subscribe, snapshot, snapshot) ?? config;
}

function CollapsedBody({
  type,
  widgetId,
  config,
}: {
  type: string;
  widgetId: string;
  config: Record<string, unknown>;
}) {
  const effective = useEffectiveConfig(type, widgetId, config);
  const def = getWidget(type);
  const summary = def?.collapsedSummary?.(effective);
  const actions = def?.collapsedActions?.(widgetId, effective) ?? [];
  /*
   * El readout puede no existir --el pomodoro sin resumen, el todo-list vacio-- y
   * la botonera igual se dibuja. `if (!summary && !actions.length) return null`
   * seria correcto pero dejaria sin play a un widget que solo tiene boton, que es
   * justo el caso que se quiere cubrir.
   */
  if (!summary && !actions.length) return null;
  const bar = summary?.bar && summary.bar.total > 0 ? summary.bar : null;
  const ring = summary?.ring && summary.ring.total > 0 ? summary.ring : null;
  return (
    <div className="flex min-h-0 flex-1 items-center gap-2 px-3">
      {ring && <MiniRing done={ring.done} total={ring.total} tone={summary!.tone} />}
      {/*
       * Todo el readout va al MISMO tamano que el texto de tarea del todo-list
       * (`text-sm`), que es donde el usuario ya lee texto de esta app. No hay
       * salto tipografico entre valor y contexto: la jerarquia la carga el color
       * -- el valor en el tono del widget, el contexto en `gray-500` -- y no un
       * numero mas grande que otro.
       *
       * Formula y detalle se recortan antes que el valor: son lo menos
       * importante de la fila, y un nombre de tarea cortado se lee peor que un
       * "24:31" que se ve entero.
       */}
      {summary?.formula && (
        <span className="min-w-0 truncate text-sm text-gray-500">{summary.formula}</span>
      )}
      {summary && (
        <span className="shrink-0 text-sm tabular-nums" style={{ color: toneColor(summary.tone) }}>
          {summary.value}
        </span>
      )}
      {/*
       * El objetivo va pegado al valor y en `gray-500`, no en el tono del widget:
       * es una referencia, no el dato. La barra de "/" es lo que lo separa del
       * reloj sin necesitar otra fila -- en el widget desplegado va debajo por lo
       * mismo, pero alli no entra al lado a `text-xl`.
       */}
      {summary?.target && (
        <span className="shrink-0 text-sm tabular-nums text-gray-500">/ {summary.target}</span>
      )}
      {summary?.detail && (
        <span className="min-w-0 truncate text-sm text-gray-500">{summary.detail}</span>
      )}
      {bar && (
        /*
         * La barra va PEGADA al valor, no al extremo derecho de la fila. El `ml-auto`
         * que la empujaba al borde se saco: dejaba un hueco entre el detalle y la
         * barra, y en habitos se leia como que faltaba algo entre "3/5 hoy" y el
         * relleno. Pegadas, el numero, su contexto y su avance se leen como una
         * sola unidad.
         */
        <span className={`inline-block ${BAR_W} ${BAR_H} shrink-0 overflow-hidden bg-gray-700`}>
          <span
            className="block h-full"
            style={{
              width: `${Math.max(0, Math.min(100, (bar.done / bar.total) * 100))}%`,
              background: 'var(--color-gray-400)',
            }}
          />
        </span>
      )}
      {/*
       * La botonera va al extremo derecho con `ml-auto`, y no pegada al readout
       * como la barra: es la unica accion de la fila, asi que tiene que cair en
       * un lugar estable -- el que se mueve al respirar el texto o al cambiar
       * la fase es el que hay que acertar a ciegas con el mouse.
       *
       * El color lo decide el estado, no el widget: en `p2` esta corriendo y el
       * boton se lee como "esto sigue vivo" sinacificarle el mouse encima.
       */}
      {actions.length > 0 && (
        <div className="ml-auto flex shrink-0 items-center gap-1 pl-2">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={(e) => {
                /*
                 * El header de arriba usa long-press para retraer, y `pointerdown`
                 * en el boton caeria dentro de ese gesto. Con `stopPropagation` el
                 * boton es un boton y no un disparador del colapso.
                 */
                e.stopPropagation();
                a.onSelect();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              /*
               * `h-8` y no `h-6` como los del header: el readout es la fila que
               * se mira de pasada y el play es la unica accion de ahi. Con 24px
               * competia en escala con los botones de la barra de arriba, que ya
               * son chicos de por si; a 32px se lee como el control principal
               * del widget y no como un icono mas de la fila.
               *
               * El cuerpo del retraido mide 55px (80 de celda menos los 25 del
               * header), asi que 32 entra de sobra y el `items-center` del padre
               * lo centra sin empujar el readout.
               */
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors active:scale-90 ${
                a.tone === 'p2'
                  ? 'bg-p2/15 text-p2 hover:bg-p2/25'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200'
              }`}
              title={a.label}
              aria-label={a.label}
            >
              {a.label === 'Pause' ? <FiPause size={17} /> : <FiPlay size={17} className="ml-0.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
interface WidgetFrameProps {
  id: string;
  /** Clave del tipo en el registro. Solo la usa el readout retraido. */
  type: string;
  config: Record<string, unknown>;
  component: ComponentType;
  onDelete: (id: string) => void;
  onConfigChange: (id: string, config: Record<string, unknown>) => void;
  label: string;
  /** props de dnd-kit para el tirador de arrastre */
  dragHandleProps: DragHandleProps;
  dragHandleRef: (node: HTMLElement | null) => void;
  /** El widget esta siguiendo al cursor. Enciende la senal de color. */
  isDragging?: boolean;
}
/** Handlers de dnd-kit que se componen con los del frame. */
export interface DragHandleProps {
  onPointerDown?: (e: React.PointerEvent) => void;
  onPointerUp?: (e: React.PointerEvent) => void;
  onPointerCancel?: (e: React.PointerEvent) => void;
  onPointerMove?: (e: React.PointerEvent) => void;
  [key: string]: unknown;
}
/*
 * El frame ya no posiciona nada: la grilla define donde vive el widget y que
 * tamaÃ±o tiene. Solo quedan el encabezado, el arrastre y las acciones.
 */
export const WidgetFrame = memo(function WidgetFrame({
  id,
  type,
  config,
  component: WidgetComponent,
  onDelete,
  onConfigChange,
  label,
  dragHandleProps,
  dragHandleRef,
  isDragging = false,
}: WidgetFrameProps) {
  const [highlighted, setHighlighted] = useState(false);
  // El colapso lo decide la celda, que es la que mide su alto (ver
  // cellHeight en grid-utils.ts). Aca solo se refleja para pintar el fondo.
  const collapsed = (config.collapsed as boolean) ?? false;
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerPosRef = useRef({ x: 0, y: 0 });
  const HOLD_THRESHOLD = 450;
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdPosRef = useRef({ x: 0, y: 0 });
  const isHoldTargetInteractive = useCallback((target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return true;
    return !!target.closest(
      'button, input, textarea, select, a, [contenteditable="true"], [role="button"], [aria-roledescription]',
    );
  }, []);
  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);
  const fireHoldToggle = useCallback(() => {
    holdTimerRef.current = null;
    onConfigChange(id, { ...config, collapsed: !collapsed });
  }, [onConfigChange, id, config, collapsed]);
  const handleHoldPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      if (isHoldTargetInteractive(e.target)) return;
      holdPosRef.current = { x: e.clientX, y: e.clientY };
      clearHoldTimer();
      holdTimerRef.current = setTimeout(fireHoldToggle, HOLD_THRESHOLD);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
    },
    [isHoldTargetInteractive, clearHoldTimer, fireHoldToggle],
  );
  const handleTitleHoldPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      holdPosRef.current = { x: e.clientX, y: e.clientY };
      clearHoldTimer();
      holdTimerRef.current = setTimeout(fireHoldToggle, HOLD_THRESHOLD);
    },
    [clearHoldTimer, fireHoldToggle],
  );
  const handleHoldPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!holdTimerRef.current) return;
      if ((e.buttons & 1) === 0) return clearHoldTimer();
      const dx = Math.abs(e.clientX - holdPosRef.current.x);
      const dy = Math.abs(e.clientY - holdPosRef.current.y);
      if (dx > 5 || dy > 5) clearHoldTimer();
    },
    [clearHoldTimer],
  );
  const handleHoldPointerUp = useCallback(
    (e: React.PointerEvent) => {
      clearHoldTimer();
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    },
    [clearHoldTimer],
  );
  const handleHeaderPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    pointerPosRef.current = { x: e.clientX, y: e.clientY };
    // dnd-kit escucha en el tirador; este timeout solo evita que un clic
    // simple (sin movimiento) dispare un arrastre.
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
    }, 25);
  }, []);
  const handleHeaderPointerUp = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);
  const handleHeaderPointerMove = useCallback((e: React.PointerEvent) => {
    if (!longPressTimerRef.current) return;
    if ((e.buttons & 1) === 0) return handleHeaderPointerUp();
    const dx = Math.abs(e.clientX - pointerPosRef.current.x);
    const dy = Math.abs(e.clientY - pointerPosRef.current.y);
    if (dx > 5 || dy > 5) handleHeaderPointerUp();
  }, [handleHeaderPointerUp]);
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    };
  }, []);
  useEffect(() => {
    const off = widgetBus.on('timer-highlight', (data) => {
      if (data.widgetId !== id) return;
      setHighlighted(true);
      setTimeout(() => setHighlighted(false), 1500);
    });
    return () => {
      off();
    };
  }, [id]);
  const handleConfigChangeWrapped = useCallback(
    (newConfig: Record<string, unknown>) => onConfigChange(id, newConfig),
    [id, onConfigChange],
  );
  return (
    <div
      data-widget-id={id}
      className={`group flex h-full w-full flex-col overflow-hidden rounded-lg border transition-all duration-300 ${
        highlighted
          ? 'border-p2 shadow-[0_8px_28px_-6px_rgba(217,164,65,0.22),inset_0_1px_0_rgba(255,255,255,0.07)]'
          : isDragging
            ? 'border-p2 bg-gray-800/90 shadow-[0_18px_44px_-10px_rgba(217,164,65,0.32),inset_0_1px_0_rgba(255,255,255,0.07)]'
            : 'border-gray-600 bg-gray-800/90 shadow-[0_8px_24px_-6px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.08)]'
      }`}
      onWheel={(e) => e.stopPropagation()}
    >
      <div
        /*
         * `transition-colors` y no `transition-all`: lo unico que cambia de golpe
         * acÃ¡ es el fondo. El alto viene de un style inline y no debe animarse.
         *
         * Comparte `--motion-sizing` con la transicion de la caja. No coincide
         * con el colapso de items del todo-list (150ms) y a proposito: son gestos
         * de escala distinta, una fila dentro de un widget contra el widget
         * entero. Lo que si tiene que coincidir es con la caja, que se retrae a la
         * vez que esta barra se tiÃ±e.
         */
        className={`flex w-full shrink-0 select-none items-center transition-colors duration-[var(--motion-sizing)] ease-in-out ${
          isDragging ? 'bg-p2/15' : collapsed ? 'bg-p2/10' : 'bg-transparent'
        }`}
        style={{ height: HEADER_HEIGHT }}
        onPointerDown={handleHoldPointerDown}
        onPointerMove={handleHoldPointerMove}
        onPointerUp={handleHoldPointerUp}
        onPointerCancel={handleHoldPointerUp}
        onLostPointerCapture={clearHoldTimer}
      >
        <span
          {...dragHandleProps}
          ref={dragHandleRef}
          className="flex shrink-0 cursor-grab touch-none items-center self-stretch pl-[6px] pr-1 active:cursor-grabbing"
          /*
           * Ojo con el orden: los handlers de dnd-kit (`dragHandleProps`) traen
           * su propio onPointerDown, y este onPointerDown lo SOBREESCRIBE. Si
           * se pierde, el sensor nunca arranca y el widget no se puede mover.
           * Por eso se componen en vez de reemplazarse.
           */
          onPointerDown={(e) => {
            handleHeaderPointerDown(e);
            dragHandleProps.onPointerDown?.(e);
          }}
          onPointerUp={(e) => {
            handleHeaderPointerUp();
            dragHandleProps.onPointerUp?.(e);
          }}
          onPointerCancel={(e) => {
            handleHeaderPointerUp();
            dragHandleProps.onPointerCancel?.(e);
          }}
          onPointerMove={(e) => {
            handleHeaderPointerMove(e);
            dragHandleProps.onPointerMove?.(e);
          }}
        >
          <FiMoreVertical size={15} className="text-gray-500" />
        </span>
        <input
          type="text"
          spellCheck={false}
          value={(config.title as string) ?? ''}
          onChange={(e) => onConfigChange(id, { ...config, title: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={handleTitleHoldPointerDown}
          onPointerMove={(e) => {
            e.stopPropagation();
            handleHoldPointerMove(e);
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
            handleHoldPointerUp(e);
          }}
          onPointerCancel={(e) => {
            e.stopPropagation();
            handleHoldPointerUp(e);
          }}
          className="min-w-0 flex-1 cursor-text truncate border border-transparent bg-transparent text-sm font-medium tracking-[-0.01em] text-white focus:border-gray-400 focus:bg-gray-700/40 focus:ring-1 focus:ring-gray-500/40 focus:outline-none"
          placeholder={label}
          aria-label="Widget title"
        />
        <div className="ml-1 flex shrink-0 items-center divide-x divide-gray-700/60 bg-gray-800/50 ring-1 ring-gray-600/40">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onConfigChange(id, { ...config, collapsed: !collapsed });
            }}
            className={`relative flex h-6 w-6 items-center justify-center transition-all duration-150 after:pointer-events-auto after:absolute after:-inset-1 after:content-[''] active:scale-90 ${collapsed ? 'bg-p2/10 text-p2' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}
            title={collapsed ? 'Expand widget' : 'Collapse widget'}
            aria-label={collapsed ? 'Expand widget' : 'Collapse widget'}
            aria-pressed={collapsed}
          >
            {collapsed ? <FiChevronDown size={15} /> : <FiChevronUp size={15} />}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(id);
            }}
            className="relative flex h-6 w-6 items-center justify-center text-gray-500 transition-all duration-150 after:pointer-events-auto after:absolute after:-inset-1 after:content-[''] hover:bg-danger/10 hover:text-danger active:scale-90"
            title="Delete widget"
            aria-label="Delete widget"
          >
            <FiX size={15} />
          </button>
        </div>
      </div>
      {collapsed ? (
        /*
         * El readout ocupa lo que el cuerpo deja libre. Ojo: el cuerpo sigue
         * DESMONTADO en el otro lado del ternario, y tiene que seguir asi. El
         * readout es una funcion pura sobre el config --mas el store vivo para
         * los que avanzan solos-- justamente para no tener que montar nada.
         */
        <CollapsedBody type={type} widgetId={id} config={config} />
      ) : (
        <div
          className="min-h-0 flex-1 overflow-hidden p-3"
          onPointerDown={handleHoldPointerDown}
          onPointerMove={handleHoldPointerMove}
          onPointerUp={handleHoldPointerUp}
          onPointerCancel={handleHoldPointerUp}
          onLostPointerCapture={clearHoldTimer}
        >
          <Suspense
            fallback={
              <div className="flex flex-col gap-2" aria-hidden="true">
                <div className="skeleton h-3 w-3/4 rounded" />
                <div className="skeleton h-3 w-1/2 rounded" />
                <div className="skeleton h-3 w-2/3 rounded" />
              </div>
            }
          >
            <WidgetComponent
              config={config}
              onConfigChange={handleConfigChangeWrapped}
              widgetId={id}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
});
