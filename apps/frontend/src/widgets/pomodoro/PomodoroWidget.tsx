import { memo, useCallback, useRef, useEffect, useState, useMemo, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { FiArrowLeft, FiPause, FiPlay, FiRotateCcw, FiSettings, FiCheck, FiX, FiCheckSquare, FiEdit } from 'react-icons/fi';
import { widgetBus } from '../widget-bus';
import { getLiveConfig, subscribeLiveConfig } from '../live-config';
import {
  TECHNIQUES,
  TECHNIQUE_KEYS,
  formatTimeShort,
  formatStopwatch,
  formatTarget,
  normalizeConfig,
  playSound,
  type Technique,
} from './shared';
import { registerPomodoroTimer, unregisterPomodoroTimer, startConfig } from './timer';

interface PomodoroWidgetProps {
  config: Record<string, unknown>;
  onConfigChange: (config: Record<string, unknown>) => void;
  widgetId?: string;
}

const RING_RADIUS = 58;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const RING_SIZE = 140;

export const PomodoroWidget = memo(function PomodoroWidget({ config, onConfigChange, widgetId }: PomodoroWidgetProps) {
  const c = normalizeConfig(config);
  const { technique, workMinutes, restMinutes, longRestMinutes, alarmSound, state, remainingSeconds, elapsedMs, cycleCount, phase, linkedTaskId, linkedTaskName } = c;
  const isCountup = technique === 'countup';

  const [view, setView] = useState<'main' | 'settings'>('main');
  const [editingField, setEditingField] = useState<string | null>(null);
  const [alarmOpen, setAlarmOpen] = useState(false);
  const alarmBtnRef = useRef<HTMLButtonElement>(null);
  const [alarmPos, setAlarmPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [pendingTechnique, setPendingTechnique] = useState<Technique | null>(null);

  const configRef = useRef(c);
  const onConfigChangeRef = useRef(onConfigChange);

  /*
   * El store vivo, para la centesima del stopwatch.
   *
   * El tick corre a 100ms mientras corre un stopwatch, pero el config por props solo
   * baja UNA vez por segundo --a proposito, la base no se escribe en cada tick--.
   * Asi que sin esta suscripcion el digito de centesima daria un salto por segundo,
   * que es indistinguible de no mostrarlo.
   *
   * `live-config` es el store generico: el widget lee de donde publica su propio
   * reloj, sin entrar al modulo del reloj ni saber que existe.
   */
  const liveCfg = useSyncExternalStore(
    useCallback((cb: () => void) => (widgetId ? subscribeLiveConfig(cb) : () => {}), [widgetId]),
    useCallback(() => (widgetId ? getLiveConfig(widgetId) : null), [widgetId]),
  );
  const showMs =
    isCountup && state === 'running' && typeof liveCfg?.elapsedMs === 'number'
      ? liveCfg.elapsedMs
      : elapsedMs;

  configRef.current = c;
  onConfigChangeRef.current = onConfigChange;

  /*
   * El reloj vive en `./timer`, no aca. Estos dos efectos son lo unico que lo
   * conectan, y van SEPARADOS a proposito.
   *
   * Con uno solo, el cleanup corria en cada cambio de config --porque `config`
   * esta en las dependencias-- o sea una vez por tick: `unregister` dejaba
   * `entry.write` en null y `register` lo encontraba null al volver a entrar.
   * Entonces `wasUnwatched` decia "cambio el config", que es lo mismo que "el
   * widget esta retraido" solo cuando NO esta retraido.
   *
   * Y ahi vive la reconciliacion que cura el flash del despliegue: con el flag
   * siempre prendido, cada tick escribia una segunda vez el tiempo recalculado
   * contra el reloj de pared. Dos writers por segundo con valores que difieren en
   * uno, y el contador saltaba o repetia segundos.
   *
   * Separados, el que limpia depende solo de `widgetId` --o sea, corre cuando el
   * componente se monta o se desmonta de verdad-- y el que registra sigue
   * escuchando cada cambio de config, que es lo que necesita para decidir si el
   * reloj corre.
   *
   * Sacar el callback NO para el reloj: eso es lo que hace que el pomodoro siga
   * corriendo con el widget retraido, donde el componente no esta montado. Para
   * eso hace falta `disposePomodoroTimer`, que se llama al borrar el widget.
   */
  useEffect(() => {
    if (!widgetId) return;
    return () => unregisterPomodoroTimer(widgetId);
  }, [widgetId]);

  useEffect(() => {
    if (!widgetId) return;
    registerPomodoroTimer(widgetId, config, onConfigChange);
  }, [widgetId, config, onConfigChange]);

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
    /*
     * Destino OBLIGATORIO. Antes el guard era `si viene y no soy yo, fuera`, o sea
     * que un `task:select` sin destino --como el que mandaba el selector de tareas
     * -- entraba en todos los pomodoros y un solo click vinculaba la tarea a cada
     * timer del dashboard. Los dos emisores mandan destino, asi que exigirlo no
     * rompe ningun camino.
     */
    const offSelect = widgetBus.on('task:select', (data) => {
      console.log('[pomo]', widgetId, 'recibe select target=', data.targetWidgetId, 'acepta=', data.targetWidgetId === widgetId);
      if (data.targetWidgetId !== widgetId) return;
      const workMin = data.estimatedMinutes ?? configRef.current.workMinutes;
      onConfigChangeRef.current({
        ...configRef.current,
        linkedTaskId: data.taskId,
        linkedTaskName: data.taskName,
        workMinutes: workMin,
        state: 'idle',
        phase: 'work',
        remainingSeconds: workMin * 60,
        elapsedMs: 0,
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

  /*
   * El armado del config al arrancar vive en `startConfig`, en el modulo, y no
   * aca. Lo consume tambien el play del readout retraido, y con dos copias
   * divergen: el mismo boton arrancaria cosas distintas segun donde se apriete.
   * Aca solo queda la parte que es de UI, que es avisar a la tarea vinculada.
   */
  const start = useCallback(() => {
    const next = startConfig(c);
    onConfigChange(next as unknown as Record<string, unknown>);
    if (linkedTaskId) {
      widgetBus.emit('timer:start', { taskId: linkedTaskId, taskName: linkedTaskName ?? '', technique });
    }
  }, [c, linkedTaskId, linkedTaskName, technique, onConfigChange]);

  const pause = useCallback(() => {
    onConfigChange({ ...config, state: 'paused' });
    if (linkedTaskId) {
      widgetBus.emit('timer:pause', { taskId: linkedTaskId });
    }
  }, [config, linkedTaskId, onConfigChange]);

  const goSettings = useCallback(() => {
    onConfigChange({ ...config, state: 'paused' });
    setView('settings');
  }, [config, onConfigChange]);

  /*
   * Dos funciones y no una. Compartian `goBackAndReset`, con lo cual volver de
   * los ajustes aplastaba el reloj. Y el reinicio no reseteaba el stopwatch:
   * `goBackAndReset` ponia `remainingSeconds` en cero pero jamas tocaba
   * `elapsedSeconds`, que es lo UNICO que muestra la tecnica countup. Por eso el
   * boton de reiniciar no parecia hacer nada en el cronometro.
   */
  const reset = useCallback(() => {
    onConfigChange({
      ...config,
      state: 'idle',
      phase: 'work',
      remainingSeconds: workMinutes * 60,
      elapsedMs: 0,
      cycleCount: 0,
    });
    setEditingField(null);
  }, [workMinutes, config, onConfigChange]);

  /** Volver de los ajustes. No toca el reloj: solo cambia de vista. */
  const goBack = useCallback(() => {
    setView('main');
    setEditingField(null);
  }, []);

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
    onConfigChange({
      ...config,
      technique: tech,
      workMinutes: preset.workMinutes,
      restMinutes: preset.restMinutes,
      longRestMinutes: preset.longRestMinutes,
      state: 'idle',
      phase: 'work',
      remainingSeconds: preset.workMinutes * 60,
      elapsedMs: 0,
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
  /*
   * El techo del stopwatch: el estimado de la tarea vinculada, que `task:select`
   * escribe en `workMinutes`. Solo cuenta si la tecnica es countup -- en un
   * countdown `workMinutes` es la duracion y ya se ve en el anillo.
   */
  const budget = isCountup ? Math.round(workMinutes) : 0;
  const totalSeconds = phase === 'break' ? restMinutes * 60 : workMinutes * 60;
  const progress = isCountup ? 0 : totalSeconds > 0 ? ((totalSeconds - remainingSeconds) / totalSeconds) * 100 : 0;
  const dashOffset = RING_CIRCUMFERENCE * (1 - Math.min(progress, 100) / 100);

  // Un solo sistema de color: trabajando es p2 (ambar, calido y bright) y en
  // descanso el anillo baja a p1 (acero, frio y apagado). El cambio de
  // temperatura dice la fase sin inventar un segundo color.
  const ringColor = phase === 'break' ? 'var(--color-p1)' : 'var(--color-p2)';

  const openTaskPicker = useCallback(() => {
    if (!widgetId) return;
    /*
     * Va el `widgetId` en el pedido, no se resuelve despues. El selector tiene que
     * saber a que timer atar la tarea: si lo deja sin destino, `task:select` lo
     * reciben TODOS los pomodoros y cada uno se creeria elegido.
     */
    widgetBus.emit('open-task-picker', { widgetId });
    console.log('[pomo] abre picker', widgetId);
  }, [widgetId]);

  const unlinkTask = useCallback(() => {
    onConfigChange({
      ...config,
      linkedTaskId: undefined,
      linkedTaskName: undefined,
      state: 'idle',
      phase: 'work',
      remainingSeconds: workMinutes * 60,
      elapsedMs: 0,
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
          onClick={goBack}
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
                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
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
                      className="mt-0.5 w-full rounded bg-gray-800 px-2 py-1 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-gray-500"
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
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
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
                className={`mt-1 flex w-full items-center justify-between rounded bg-gray-800 px-2 py-1.5 text-sm text-gray-200 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-gray-500 ${
                  alarmOpen ? 'ring-1 ring-gray-500' : ''
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
                          ? 'bg-p2/15 text-p2'
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
            className={`min-w-0 flex-1 truncate rounded px-1.5 py-1 text-[10px] font-medium transition-colors ${
              !linkedTaskId && technique === tech
                ? 'bg-gray-600 text-gray-100'
                : 'text-gray-500 hover:text-gray-300'
            }`}
            title={tech === 'custom' ? 'Custom' : TECHNIQUES[tech].label}
          >
            {/*
           * `truncate` + `min-w-0` porque "Stopwatch" es el nombre mas largo de
           * la fila y con solo `flex-1` se desborda en vez de encogerse: el ancho
           * minimo de un flex item es su contenido, asi que sin `min-w-0` el
           * `truncate` no tiene nada que recortar y la pill se sale del widget.
           */}
          {tech === 'custom' ? <FiEdit size={12} className="mx-auto" /> : TECHNIQUES[tech].label}
          </button>
        ))}
      </div>

      {linkedTaskId ? (
        /*
         * `w-full` y no un tope fijo: el padre es un `items-center`, asi que sin
         * ancho el div se ajusta al contenido y agrandar el widget no cambiaba
         * nada. Con `w-full` el nombre usa todo el espacio disponible y aparece
         * de a partes segun lo achiques o lo estes.
         */
        <div className="mt-2 w-full truncate text-center text-sm font-medium text-p2 tabular-nums">
          {linkedTaskName}
        </div>
      ) : (
        <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          {isCountup ? 'STOPWATCH' : phase === 'break' ? 'BREAK' : 'FOCUS'}
        </div>
      )}

      <div className="relative my-2 flex items-center justify-center">
        {isCountup ? (
          <div className="flex h-[140px] w-[140px] flex-col items-center justify-center">
            <span className="text-xl font-semibold tracking-wide text-white tabular-nums">
              {formatStopwatch(showMs)}
            </span>
            {/*
             * El objetivo va DEBAJO y no al lado: a `text-xl` el numero
             * `00:04:12,34` ya llena los 140px de la caja. Arriba, con la misma
             * barra de "/", se lee igual.
             */}
            {budget > 0 && (
              <span className="mt-1 text-xs tabular-nums text-gray-500">/ {formatTarget(budget)}</span>
            )}
          </div>
        ) : (
          <>
            <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90">
              <circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                fill="none"
                stroke="var(--color-gray-700)"
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
            <span className="absolute text-xl font-semibold tracking-wide text-white tabular-nums">
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
                filled ? 'bg-p2' : 'bg-gray-700'
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
              ? 'bg-p2/15 text-p2 hover:bg-p2/25'
              : 'bg-gray-700/60 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
          }`}
          title={linkedTaskId ? `Unlink: ${linkedTaskName}` : 'Link task'}
        >
          {/*
           * `FiCheckSquare`, el mismo icono con el que el registro identifica al
           * widget de tareas. Antes era `FiClock`, que es el icono del pomodoro:
           * dentro de un timer un reloj no dice "vincular", dice "timer" -- y el
           * boton de al lado de play/pause ya se lee como parte del reloj. El
           * check-square es el que comunica "esto va a una lista de tareas".
           */}
          <FiCheckSquare size={16} />
        </button>

        <button
          type="button"
          onClick={reset}
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
                className="flex items-center gap-1 rounded bg-gray-700 px-2.5 py-1 text-xs text-white hover:bg-gray-600"
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

