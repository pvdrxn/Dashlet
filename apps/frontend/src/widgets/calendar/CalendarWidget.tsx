import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { FiChevronLeft, FiChevronRight, FiGrid, FiList, FiPlus, FiTrash2, FiX, FiCalendar } from 'react-icons/fi';
import { DEFAULT_DURATION_MIN, tagColorHex } from '@widget-master/shared';
import type { CalendarEventDto, TagDto } from '@widget-master/shared';
import * as api from '../../api/calendar';
import * as tagsApi from '../../api/tags';
import {
  addDays,
  addMonths,
  dateKey,
  dayNumber,
  formatDayLabel,
  formatHour,
  formatMonthLabel,
  isToday,
  monthGrid,
  monthKey,
  weekdayInitials,
} from '../../views/calendar/date-utils';
import { OPEN_CALENDAR_EVENT, openCalendarView } from './open-calendar';

/*
 * Widget de calendario: la MISMA agenda de la vista, en compacto.
 *
 * No guarda eventos. Viven en el servidor y el widget los lee y los escribe por
 * `api/calendar`, igual que `DataTableWidget` con las tablas: hay una agenda y dos
 * ventanas. Lo unico que va al `config` es lo que el widget necesita recordar o lo
 * que otros necesitan leer SIN montarlo:
 *
 *   - `viewMode`      'month' (grilla + lista del dia) o 'day' (solo la lista).
 *   - `selectedDate`  el dia elegido. Lo lee el boton "abrir completo" de la barra,
 *                     que solo tiene el `config` y no el estado del widget.
 *   - `agenda`        los bloques de HOY como `[startMin, durationMin]`. Es lo que
 *                     usa el readout retraido: el cuerpo no se monta, asi que el
 *                     resumen tiene que salir del config. Guarda los bloques y no el
 *                     conteo de pendientes porque el conteo envejece con el reloj.
 *
 * Reexporta el puente con la vista: ver `open-calendar.ts` para por que vive aparte.
 */
export { OPEN_CALENDAR_EVENT, openCalendarView };

interface CalendarWidgetProps {
  config: Record<string, unknown>;
  onConfigChange: (config: Record<string, unknown>) => void;
  widgetId?: string;
}

type ViewMode = 'month' | 'day';

type Draft = {
  title: string;
  tagId: string | null;
  startMin: number;
};

type Editor = ({ mode: 'create' } & Draft) | ({ mode: 'edit'; id: string } & Draft) | null;

/** Puntos de etiqueta por celda del mes. Mas de tres no entran en 22px. */
const MAX_DOTS = 3;

const NEUTRAL_DOT = 'var(--color-gray-500)';

const HEADER_BUTTON =
  'flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-white/5 hover:text-gray-200';

function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/** Hoy: la proxima hora en punto. Otro dia: las 9, como el doble click del mes. */
function defaultStartMin(date: string): number {
  if (date !== dateKey(new Date())) return 9 * 60;
  return Math.min(23, new Date().getHours() + 1) * 60;
}

export function CalendarWidget({ config, onConfigChange, widgetId }: CalendarWidgetProps) {
  const { t } = useTranslation();
  const viewMode: ViewMode = config.viewMode === 'day' ? 'day' : 'month';
  const today = dateKey(new Date());

  /*
   * El config y el callback, en refs.
   *
   * Los caminos que escriben despues de un await -- sincronizar la agenda -- no
   * pueden cerrar sobre el `config` del render en que nacieron: escribirian un
   * objeto viejo y pisarian lo que cambio mientras esperaban, el `collapsed`
   * incluido. Y `patchConfig` compone sobre la ref en vez de sobre la prop, asi
   * que dos parches seguidos en el mismo tick no se pisan entre si.
   */
  const configRef = useRef(config);
  configRef.current = config;
  const onChangeRef = useRef(onConfigChange);
  onChangeRef.current = onConfigChange;
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const patchConfig = useCallback((patch: Record<string, unknown>) => {
    // Retraer desmonta el cuerpo: una respuesta que llega despues no escribe.
    if (!aliveRef.current) return;
    configRef.current = { ...configRef.current, ...patch };
    onChangeRef.current(configRef.current);
  }, []);

  const [selectedDate, setSelectedDate] = useState(today);
  const [cursorMonth, setCursorMonth] = useState(() => monthKey(new Date()));
  const [events, setEvents] = useState<CalendarEventDto[]>([]);
  const [tags, setTags] = useState<TagDto[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reload, setReload] = useState(0);
  const [editor, setEditor] = useState<Editor>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  /*
   * Los 42 dias de la grilla, no el mes: los dias de los meses vecinos tambien
   * llevan sus puntos, y asi un dia vecino se puede abrir sin otra consulta.
   * `cursorMonth` siempre contiene a `selectedDate`, asi que la lista del dia
   * esta cubierta tambien en el modo dia.
   */
  const grid = useMemo(() => monthGrid(cursorMonth), [cursorMonth]);
  const rangeFrom = grid[0][0].key;
  const rangeTo = grid[5][6].key;

  useEffect(() => {
    let cancelled = false;
    api
      .fetchEvents(rangeFrom, rangeTo)
      .then((data) => {
        if (cancelled) return;
        setEvents(data);
        setStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setEvents([]);
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [rangeFrom, rangeTo, reload]);

  useEffect(() => {
    let cancelled = false;
    tagsApi
      .fetchTags()
      .then((data) => {
        if (!cancelled) setTags(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Guarda en el config los bloques de hoy, para el readout retraido.
   *
   * Pide el dia aparte y no lo deriva de `events`: el widget puede estar mirando
   * otro mes y hoy no estaria cargado. Solo escribe si cambio algo, o cada montaje
   * generaria un guardado.
   */
  const syncAgenda = useCallback(() => {
    const day = dateKey(new Date());
    api
      .fetchEvents(day, day)
      .then((list) => {
        const blocks = list
          .map((e) => [e.startMin, e.durationMin] as [number, number])
          .sort((a, b) => a[0] - b[0]);
        const prev = configRef.current.agenda as { date?: unknown; blocks?: unknown } | undefined;
        if (prev && prev.date === day && JSON.stringify(prev.blocks) === JSON.stringify(blocks)) {
          return;
        }
        patchConfig({ agenda: { date: day, blocks } });
      })
      .catch(() => {});
  }, [patchConfig]);

  useEffect(() => {
    syncAgenda();
    /*
     * Al abrir, el dia elegido es hoy. Se escribe para que el boton "abrir
     * completo" de la barra no apunte al dia que quedo elegido ayer mientras el
     * widget muestra hoy.
     */
    if (configRef.current.selectedDate !== dateKey(new Date())) {
      patchConfig({ selectedDate: dateKey(new Date()) });
    }
  }, [syncAgenda, patchConfig]);

  /* ---------------------------------------------------------------------- */
  /* Navegacion                                                              */
  /* ---------------------------------------------------------------------- */

  const select = useCallback(
    (date: string) => {
      setEditor(null);
      setSelectedDate(date);
      setCursorMonth(date.slice(0, 7));
      patchConfig({ selectedDate: date });
    },
    [patchConfig],
  );

  const goMonth = (delta: number) => {
    const m = addMonths(cursorMonth, delta);
    // El mes de hoy cae en hoy; los demas, en el dia 1 -- que existe siempre.
    const next = m === monthKey(new Date()) ? today : `${m}-01`;
    select(next);
  };

  const goPrev = () => (viewMode === 'month' ? goMonth(-1) : select(addDays(selectedDate, -1)));
  const goNext = () => (viewMode === 'month' ? goMonth(1) : select(addDays(selectedDate, 1)));

  const toggleMode = () => patchConfig({ viewMode: viewMode === 'month' ? 'day' : 'month' });

  /* ---------------------------------------------------------------------- */
  /* Derivados                                                               */
  /* ---------------------------------------------------------------------- */

  const tagById = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags]);

  const dayEvents = useMemo(
    () =>
      events.filter((e) => e.date === selectedDate).sort((a, b) => a.startMin - b.startMin),
    [events, selectedDate],
  );

  /** Cuenta y puntos de color por dia, para la grilla. */
  const byDate = useMemo(() => {
    const map = new Map<string, { count: number; dots: string[] }>();
    for (const e of events) {
      const hex =
        e.tagId ? tagColorHex(tagById.get(e.tagId)?.color ?? null) : null;
      const entry = map.get(e.date) ?? { count: 0, dots: [] };
      entry.count += 1;
      if (hex && entry.dots.length < MAX_DOTS && !entry.dots.includes(hex)) entry.dots.push(hex);
      map.set(e.date, entry);
    }
    return map;
  }, [events, tagById]);

  const eventsLabel = (n: number) =>
    `${n} ${n === 1 ? t('calendar.event', 'event') : t('calendar.events', 'events')}`;

  /* ---------------------------------------------------------------------- */
  /* Edicion                                                                 */
  /* ---------------------------------------------------------------------- */

  const startCreate = () =>
    setEditor({ mode: 'create', title: '', tagId: null, startMin: defaultStartMin(selectedDate) });

  const startEdit = (e: CalendarEventDto) =>
    setEditor({ mode: 'edit', id: e.id, title: e.title, tagId: e.tagId, startMin: e.startMin });

  // Enfoca el titulo al abrir el formulario o al pasar de un bloque a otro.
  const editorKey = editor ? (editor.mode === 'edit' ? editor.id : 'new') : '';
  useEffect(() => {
    if (editorKey) titleRef.current?.focus();
  }, [editorKey]);

  const commit = () => {
    if (!editor) return;
    const title = editor.title.trim();
    const tagId = editor.tagId && tagById.has(editor.tagId) ? editor.tagId : null;
    const { startMin } = editor;
    setEditor(null);
    if (!title) return;

    if (editor.mode === 'edit') {
      const previous = events.find((e) => e.id === editor.id);
      // Optimista, como la vista: el cambio se ve al instante y la respuesta lo confirma.
      setEvents((prev) =>
        prev.map((e) => (e.id === editor.id ? { ...e, title, tagId, startMin } : e)),
      );
      api
        .updateEvent(editor.id, { title, tagId, startMin })
        .then((saved) => {
          setEvents((prev) => prev.map((e) => (e.id === saved.id ? saved : e)));
          if (saved.date === dateKey(new Date())) syncAgenda();
        })
        .catch(() => {
          // Sin esto, un fallo dejaba en pantalla un cambio que el servidor no tiene.
          if (previous) setEvents((prev) => prev.map((e) => (e.id === previous.id ? previous : e)));
        });
      return;
    }

    const date = selectedDate;
    const draft: CalendarEventDto = {
      id: `tmp-${Date.now()}`,
      userId: '',
      date,
      startMin,
      durationMin: DEFAULT_DURATION_MIN,
      title,
      tagId,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setEvents((prev) => [...prev, draft]);
    api
      .createEvent({ date, startMin, title, tagId })
      .then((saved) => {
        setEvents((prev) => prev.map((e) => (e.id === draft.id ? saved : e)));
        if (date === dateKey(new Date())) syncAgenda();
      })
      .catch(() => setEvents((prev) => prev.filter((e) => e.id !== draft.id)));
  };

  const remove = (target: CalendarEventDto) => {
    setEvents((prev) => prev.filter((e) => e.id !== target.id));
    if (editor?.mode === 'edit' && editor.id === target.id) setEditor(null);
    api
      .deleteEvent(target.id)
      .then(() => {
        if (target.date === dateKey(new Date())) syncAgenda();
      })
      // El borrado fallo: se vuelve a pedir el rango, que trae el bloque de vuelta.
      .catch(() => setReload((n) => n + 1));
  };

  /* ---------------------------------------------------------------------- */
  /* Render                                                                  */
  /* ---------------------------------------------------------------------- */

  const nowMin = nowMinutes();
  const showPast = selectedDate === today;
  const headerLabel = viewMode === 'month' ? formatMonthLabel(cursorMonth) : formatDayLabel(selectedDate);

  return (
    /*
     * `@container`: el widget se acomoda al ancho que tiene EL, no al de la
     * ventana. Angosto apila la grilla sobre la lista; desde `@md` --cinco celdas
     * o mas-- las pone lado a lado y la lista gana el alto entero.
     */
    <div className="@container relative flex h-full min-h-0 flex-col gap-2 text-gray-200">
      <header className="flex h-6 shrink-0 items-center gap-0.5">
        <h3 className="min-w-0 flex-1 truncate text-sm font-medium text-white" title={headerLabel}>
          {headerLabel}
        </h3>
        <button
          type="button"
          onClick={goPrev}
          aria-label={
            viewMode === 'month' ? t('calendar.prevMonth', 'Previous month') : t('calendar.widget.prevDay', 'Previous day')
          }
          className={HEADER_BUTTON}
        >
          <FiChevronLeft size={14} />
        </button>
        <button
          type="button"
          onClick={() => select(today)}
          className="h-6 shrink-0 rounded px-1.5 text-xs text-gray-400 transition-colors hover:bg-white/5 hover:text-gray-200"
        >
          {t('calendar.today', 'Today')}
        </button>
        <button
          type="button"
          onClick={goNext}
          aria-label={
            viewMode === 'month' ? t('calendar.nextMonth', 'Next month') : t('calendar.widget.nextDay', 'Next day')
          }
          className={HEADER_BUTTON}
        >
          <FiChevronRight size={14} />
        </button>
        {/* El icono es el del modo al que se pasa, no el del actual. */}
        <button
          type="button"
          onClick={toggleMode}
          aria-label={viewMode === 'month' ? t('calendar.widget.dayView', 'Day view') : t('calendar.widget.monthView', 'Month view')}
          title={viewMode === 'month' ? t('calendar.widget.dayView', 'Day view') : t('calendar.widget.monthView', 'Month view')}
          className={HEADER_BUTTON}
        >
          {viewMode === 'month' ? <FiList size={13} /> : <FiGrid size={13} />}
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 @md:flex-row @md:gap-3">
        {viewMode === 'month' && (
          <div className="flex shrink-0 flex-col @md:w-56">
            <div className="grid grid-cols-7" aria-hidden="true">
              {weekdayInitials().map((w, i) => (
                <span key={i} className="h-4 text-center text-[10px] leading-4 text-gray-500">
                  {w}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {grid.flat().map((cell) => {
                const info = byDate.get(cell.key);
                const isSelected = cell.key === selectedDate;
                const isCurrent = isToday(cell.key);
                const label = info
                  ? `${formatDayLabel(cell.key)}, ${eventsLabel(info.count)}`
                  : formatDayLabel(cell.key);
                return (
                  <button
                    key={cell.key}
                    type="button"
                    onClick={() => select(cell.key)}
                    aria-label={label}
                    title={label}
                    aria-pressed={isSelected}
                    aria-current={isCurrent ? 'date' : undefined}
                    className={`relative flex h-[22px] items-center justify-center rounded transition-colors ${
                      isSelected
                        ? 'bg-p2/25 ring-1 ring-p2/60 text-white'
                        : info && info.count > 0
                          ? 'bg-p2/15 font-medium text-p2 hover:bg-p2/25'
                          : cell.inMonth
                            ? 'hover:bg-white/[0.04]'
                            : 'hover:bg-white/[0.02]'
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] tabular-nums ${
                        isCurrent
                          ? 'bg-p2 font-medium text-gray-900'
                          : isSelected
                            ? 'text-white'
                            : cell.inMonth
                              ? 'text-gray-300'
                              : 'text-gray-600'
                      }`}
                    >
                      {dayNumber(cell.key)}
                    </span>
                    {info && (
                      <span
                        aria-hidden="true"
                        className={`absolute bottom-px flex gap-[2px] ${cell.inMonth ? '' : 'opacity-40'}`}
                      >
                        {info.dots.map((hex) => (
                          <span
                            key={hex}
                            className="h-[3px] w-[3px] rounded-full"
                            style={{ backgroundColor: hex }}
                          />
                        ))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex h-6 shrink-0 items-center gap-2">
            {viewMode === 'month' && (
              <span className="min-w-0 truncate text-xs font-medium text-gray-300">
                {formatDayLabel(selectedDate)}
              </span>
            )}
            <span className="shrink-0 text-xs tabular-nums text-gray-500">
              {eventsLabel(dayEvents.length)}
            </span>
            <button
              type="button"
              onClick={startCreate}
              aria-label={t('calendar.widget.addBlock', 'Add block')}
              title={t('calendar.widget.addBlock', 'Add block')}
              className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-white/5 hover:text-gray-200"
            >
              <FiPlus size={13} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {status === 'loading' && (
              <div className="flex flex-col gap-1.5 py-1" aria-hidden="true">
                <div className="skeleton h-4 w-full rounded" />
                <div className="skeleton h-4 w-2/3 rounded" />
              </div>
            )}

            {status === 'error' && (
              <div role="alert" className="flex flex-wrap items-center gap-x-2 px-1 py-1 text-xs text-danger">
                <span>{t('calendar.widget.loadError', 'Could not load events.')}</span>
                <button
                  type="button"
                  onClick={() => {
                    setStatus('loading');
                    setReload((n) => n + 1);
                  }}
                  className="rounded px-1 underline hover:bg-danger/15"
                >
                  {t('calendar.widget.retry', 'Retry')}
                </button>
              </div>
            )}

            {status === 'ready' && dayEvents.length === 0 && editor?.mode !== 'create' && (
              <div className="flex flex-col items-start gap-0.5 px-1 py-1 text-xs text-gray-500">
                <p>{t('calendar.widget.emptyDay', 'Nothing planned for this day.')}</p>
                <button
                  type="button"
                  onClick={startCreate}
                  className="rounded py-0.5 text-gray-300 underline underline-offset-2 transition-colors hover:text-white"
                >
                  {t('calendar.widget.emptyAction', 'Add a block')}
                </button>
              </div>
            )}

            {dayEvents.map((e) => {
              const tag = e.tagId ? tagById.get(e.tagId) : undefined;
              const hex = tag ? tagColorHex(tag.color) : null;
              const past = showPast && e.startMin + e.durationMin <= nowMin;
              return (
                <div
                  key={e.id}
                  className="flex items-center gap-1 rounded px-1 py-0.5 text-xs transition-colors hover:bg-white/[0.04]"
                >
                  <button
                    type="button"
                    onClick={() => startEdit(e)}
                    aria-label={t('calendar.widget.editEvent', { title: e.title, defaultValue: `Edit ${e.title}` })}
                    title={`${formatHour(e.startMin)} · ${e.title}`}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  >
                    <span className="w-9 shrink-0 tabular-nums text-gray-500">{formatHour(e.startMin)}</span>
                    {/*
                     * El color va en el punto y, cuando hay ancho, en el nombre de la
                     * etiqueta. Nunca en el fondo: el fondo sigue siendo la superficie
                     * del widget, igual que en el panel del dia de la vista.
                     */}
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: hex ?? NEUTRAL_DOT }}
                    />
                    {tag && (
                      <span
                        className="hidden max-w-[5rem] shrink-0 truncate @md:inline"
                        style={{ color: hex ?? 'var(--color-gray-300)' }}
                      >
                        {tag.name}
                      </span>
                    )}
                    <span className={`min-w-0 flex-1 truncate ${past ? 'text-gray-500' : 'text-gray-200'}`}>
                      {e.title}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(e)}
                    aria-label={t('calendar.widget.deleteEvent', { title: e.title, defaultValue: `Delete ${e.title}` })}
                    className="shrink-0 rounded p-0.5 text-gray-500 transition-colors hover:text-danger"
                  >
                    <FiTrash2 size={11} />
                  </button>
                </div>
              );
            })}


          </div>
        </section>
      </div>

      {editor && (
        <EventModal
          editor={editor}
          tags={tags}
          titleRef={titleRef}
          onChange={setEditor}
          onSubmit={commit}
          onCancel={() => setEditor(null)}
          widgetId={widgetId}
        />
      )}
    </div>
  );
}

interface EventFormProps {
  editor: NonNullable<Editor>;
  tags: TagDto[];
  titleRef: React.RefObject<HTMLInputElement | null>;
  onChange: (next: NonNullable<Editor>) => void;
  onSubmit: () => void;
  onCancel: () => void;
  widgetId?: string;
}

/**
 * Crear y editar usan el mismo formulario, igual que la barra de la vista: dos
 * formularios serian dos sitios donde escribir el mismo titulo.
 *
 * Solo ELIGE etiquetas, no las crea: el widget no tiene sitio para el desplegable
 * que renombra y borra, y ese vocabulario se administra en la vista completa.
 */
function EventModal({ editor, tags, titleRef, onChange, onSubmit, onCancel, widgetId }: EventFormProps) {
  const frameEl = useMemo(() => (widgetId ? document.querySelector(`[data-widget-id="${widgetId}"]`) : null), [widgetId]);
  const { t } = useTranslation();

  const hours = useMemo(() => {
    const list = Array.from({ length: 24 }, (_, h) => h * 60);
    if (!list.includes(editor.startMin)) list.push(editor.startMin);
    return list.sort((a, b) => a - b);
  }, [editor.startMin]);

  const modalContent = (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center rounded-lg bg-black/65 p-3 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="flex max-h-full w-full max-w-[22rem] flex-col overflow-hidden rounded-lg border border-gray-700 bg-gray-800 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-700 bg-gray-700 px-4 py-2.5 select-none">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <FiCalendar size={15} className="text-p2" />
            <span>
              {editor.mode === 'edit'
                ? t('calendar.editEventModal', 'Edit event')
                : t('calendar.newEventModal', 'New event')}
            </span>
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="rounded p-0.5 text-gray-400 transition-colors hover:bg-danger/10 hover:text-danger leading-none"
            title={t('calendar.cancel', 'Cancel')}
            aria-label={t('calendar.cancel', 'Cancel')}
          >
            <FiX size={16} />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          className="flex flex-col gap-2.5 overflow-y-auto p-3 text-xs"
        >
          <div className="flex items-center justify-between rounded bg-gray-900/60 px-3 py-2 text-xs">
            <div className="flex items-center gap-2">
              <label htmlFor="widget-event-start-min" className="text-gray-400">
                {t('calendar.widget.startTime', 'Start time')}
              </label>
              <select
                id="widget-event-start-min"
                value={editor.startMin}
                onChange={(e) => onChange({ ...editor, startMin: Number(e.target.value) })}
                className="rounded bg-gray-700 px-2 py-0.5 text-xs tabular-nums text-white focus:outline-none focus:ring-1 focus:ring-p2"
              >
                {hours.map((m) => (
                  <option key={m} value={m}>
                    {formatHour(m)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="widget-event-title-input" className="text-xs font-medium text-gray-300">
              {t('calendar.blockTitle', 'Block title')}
            </label>
            <input
              id="widget-event-title-input"
              ref={titleRef}
              type="text"
              value={editor.title}
              onChange={(e) => onChange({ ...editor, title: e.target.value })}
              placeholder={t('calendar.blockTitle', 'Block title')}
              className="w-full rounded bg-gray-700 px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-p2"
            />
          </div>

          {tags.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-gray-300">
                {t('calendar.addTag', 'Add a tag')}
              </span>
              <div className="flex min-w-0 flex-wrap items-center gap-1.5" role="group" aria-label={t('calendar.addTag', 'Add a tag')}>
                {tags.map((tag) => {
                  const active = editor.tagId === tag.id;
                  const hex = tagColorHex(tag.color) ?? 'var(--color-gray-500)';
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => onChange({ ...editor, tagId: active ? null : tag.id })}
                      aria-pressed={active}
                      title={tag.name}
                      aria-label={t('calendar.widget.tagLabel', { name: tag.name, defaultValue: `Tag: ${tag.name}` })}
                      className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors ${
                        active ? 'bg-p2/20 ring-1 ring-p2 text-white' : 'bg-gray-700/60 text-gray-300 hover:bg-gray-700'
                      }`}
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: hex }}
                      />
                      <span>{tag.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-2 flex items-center justify-end gap-2 border-t border-gray-700/60 pt-3">
            <button
              type="button"
              onClick={onCancel}
              className="rounded px-3 py-1.5 text-xs text-gray-400 transition-colors hover:bg-white/5 hover:text-gray-200"
            >
              {t('calendar.cancel', 'Cancel')}
            </button>
            <button
              type="submit"
              className="rounded bg-p2 px-4 py-1.5 text-xs font-medium text-gray-900 transition-colors hover:bg-p2/90"
            >
              {editor.mode === 'edit' ? t('calendar.save', 'Save') : t('calendar.add', 'Add')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return frameEl ? createPortal(modalContent, frameEl) : modalContent;
}
