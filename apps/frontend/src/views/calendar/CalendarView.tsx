import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FiPlus, FiTrash2, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { TabStrip } from '../../components/TabStrip';
import { TagPicker } from './TagPicker';
import { TagFilterRow } from './TagFilterRow';
import * as api from '../../api/calendar';
import * as tagsApi from '../../api/tags';
import type { CalendarEventDto, TagDto, UpdateTagDto } from '@widget-master/shared';
import { DEFAULT_DURATION_MIN, MONTH_TABS_AFTER, MONTH_TABS_BEFORE, tagColorHex } from '@widget-master/shared';
import {
  addMonths,
  dateKey,
  dayNumber,
  formatDayLabel,
  formatHour,
  formatMonthLabel,
  hourBlocks,
  isToday,
  MONTH_KEY_RE,
  monthGrid,
  monthKey,
  monthRange,
  weekdayInitials,
} from './date-utils';

/*
 * Vista de calendario.
 *
 * Tres piezas, de arriba hacia abajo:
 *
 *   1. `TabStrip` con los meses EFIMEROS -- un ventana alrededor del mes actual,
 *      derivada de la fecha en cada arranque. No son entidades: no se crean, no
 *      se renombran, no se reordenan. Son un desplazamiento sobre el eje del
 *      tiempo, y por eso el padre (`CalendarView`) los arma y el strip solo los
 *      dibuja.
 *
 *   2. La grilla del mes: 6 filas x 7 columnas, siempre 6 filas para que el alto
 *      no cambie de un mes a otro.
 *
 *   3. El panel del dia seleccionado: 24 bloques de hora, con los eventos
 *      apoyados sobre la columna de la hora que les corresponde.
 *
 * El dia seleccionado se inicializa en HOY, no en el 1 del mes: al abrir la
 * vista lo que el usuario quiere ver es lo que tiene que pasar hoy, no un mes
 * entero por delante.
 */

/** Los meses de la tira: una ventana fija alrededor del actual. */
function buildMonthTabs(anchorMonth: string): string[] {
  const months: string[] = [];
  for (let i = -MONTH_TABS_BEFORE; i <= MONTH_TABS_AFTER; i++) {
    months.push(addMonths(anchorMonth, i));
  }
  return months;
}

/**
 * El editor de la barra de abajo.
 *
 * Es una union y no un `draft` con un id opcional porque los dos modos hacen
 * cosas distintas de verdad: crear necesita la fecha y la hora donde se hizo
 * click, editar necesita el id para saber a que PATCH mandarle el cambio. Con
 * un solo objeto, guardar tendria que preguntar por el id y el caso "crear sin
 * id" seria indistinguible de "editar con id".
 */
type Editor =
  | {
      mode: 'create';
      date: string;
      startMin: number;
      title: string;
      tagId: string | null;
      pendingTagName: string;
    }
  | {
      mode: 'edit';
      id: string;
      date: string;
      startMin: number;
      title: string;
      tagId: string | null;
      pendingTagName: string;
    }
  | null;

export function CalendarView({ leading }: { leading?: ReactNode }) {
  const today = dateKey(new Date());
  const anchorMonth = monthKey(new Date());

  const months = useMemo(() => buildMonthTabs(anchorMonth), [anchorMonth]);
  const [activeMonth, setActiveMonth] = useState(anchorMonth);
  const [selectedDate, setSelectedDate] = useState(today);
  const [events, setEvents] = useState<CalendarEventDto[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editor, setEditor] = useState<Editor>(null);
  const draftTitleRef = useRef<HTMLInputElement>(null);

  /* Etiquetas: el vocabulario completo y el filtro activo. */
  const [tags, setTags] = useState<TagDto[]>([]);
  const [activeTagIds, setActiveTagIds] = useState<string[]>([]);

  /* ---------------------------------------------------------------------- */
  /* Carga                                                                   */
  /* ---------------------------------------------------------------------- */

  /*
   * Un unico fetch por mes. La grilla pide el rango del mes activo, no el ano
   * entero: el endpoint esta indexado por `(userId, date)` justamente para que
   * esto sea una query y no un filtrado en cliente.
   */
  useEffect(() => {
    let cancelled = false;
    const { from, to } = monthRange(activeMonth);
    api
      .fetchEvents(from, to)
      .then((data) => {
        if (cancelled) return;
        setEvents(data);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setEvents([]);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [activeMonth]);

  /*
   * El vocabulario se baja una vez y no depende del mes.
   *
   * Va por separado del fetch de eventos a proposito: la fila de filtro tiene
   * que mostrar TODAS las etiquetas siempre, incluidas las que no estan en el
   * mes que se esta mirando. Si se derivara de los eventos cargados, al mirar
   * otro mes desaparecerian toggles que no tienen nada que ver con el filtro.
   */
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

  /*
   * Al cambiar de mes, el dia seleccionado tiene que caer DENTRO del mes que se
   * esta viendo. Sin esto, mirar noviembre deja el panel del dia hungueado en
   * octubre, que ya no esta en pantalla y no tiene eventos a la vista.
   *
   * Se lleva al dia 1 y no al "mismo numero de dia": el dia 31 no existe en
   * todos los meses, y el 1 siempre esta.
   */
  useEffect(() => {
    setSelectedDate((prev) => {
      if (MONTH_KEY_RE.test(activeMonth) && prev.slice(0, 7) === activeMonth) return prev;
      return `${activeMonth}-01`;
    });
  }, [activeMonth]);

  /* ---------------------------------------------------------------------- */
  /* Etiquetas: filtro y resolucion                                        */
  /* ---------------------------------------------------------------------- */

  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  /**
   * Los eventos que pasan el filtro.
   *
   * OR: con varias etiquetas elegidas pasa el que tenga CUALQUIERA. Es lo que
   * se quiere en un calendario personal ("mostrame lo del trabajo y lo
   * personal"); el AND sirve para buscar una interseccion, que es una pregunta
   * distinta.
   *
   * Vacio = sin filtro, no "cero resultados": asi el estado inicial es el
   * calendario completo y no hace falta un caso mas.
   */
  const visibleEvents = useMemo(() => {
    if (!activeTagIds.length) return events;
    const wanted = new Set(activeTagIds);
    return events.filter((e) => e.tagId !== null && wanted.has(e.tagId));
  }, [events, activeTagIds]);

  /**
   * Si una etiqueta que se esta filtrando desaparece -- porque se borro, o
   * porque la recarga la traigo sin ella -- sale del filtro sola. Sin esto el
   * toggle ya no se dibujaria pero el filtro seguiria activo y el calendario
   * quedaria filtrado por algo que no se ve.
   */
  useEffect(() => {
    if (!activeTagIds.length) return;
    const known = new Set(tags.map((t) => t.id));
    const next = activeTagIds.filter((id) => known.has(id));
    if (next.length !== activeTagIds.length) setActiveTagIds(next);
  }, [tags, activeTagIds]);

  const handleToggleTag = useCallback((id: string) => {
    setActiveTagIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }, []);

  const handleClearTags = useCallback(() => setActiveTagIds([]), []);

  /* ---------------------------------------------------------------------- */
  /* Derivados                                                               */
  /* ---------------------------------------------------------------------- */

  const grid = useMemo(() => monthGrid(activeMonth), [activeMonth]);

  /**
   * Cuentas por dia para la grilla del mes.
   *
   * Sale de los eventos YA FILTRADOS: si el filtro dice "solo work", la
   * pregunta que responde la celda es "cuantos hay con work ese dia". Mostrar
   * el total sin filtrar haria que el filtro pareciera no funcionar.
   */
  const countsByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of visibleEvents) {
      map.set(e.date, (map.get(e.date) ?? 0) + 1);
    }
    return map;
  }, [visibleEvents]);

  const dayEvents = useMemo(
    () =>
      visibleEvents
        .filter((e) => e.date === selectedDate)
        .sort((a, b) => a.startMin - b.startMin),
    [visibleEvents, selectedDate],
  );

  const hours = useMemo(() => hourBlocks(), []);

  /* ---------------------------------------------------------------------- */
  /* Mutaciones de bloques                                                   */
  /* ---------------------------------------------------------------------- */

  const startCreate = useCallback((date: string, startMin: number) => {
    setEditor({
      mode: 'create',
      date,
      startMin,
      title: '',
      tagId: null,
      pendingTagName: '',
    });
  }, []);

  const startEdit = useCallback((event: CalendarEventDto) => {
    setEditor({
      mode: 'edit',
      id: event.id,
      date: event.date,
      startMin: event.startMin,
      title: event.title,
      tagId: event.tagId,
      pendingTagName: '',
    });
  }, []);

  /*
   * Enfoca el titulo SOLO cuando la barra se abre.
   *
   * La dependencia NO puede ser `[editor]`: cada tecla tipeada en el nombre de la
   * etiqueta produce un objeto `editor` nuevo, la identidad cambia y el efecto
   * volvia a enfoc ar el titulo -- con lo cual escribir "reuniones" empezaba en
   * la etiqueta y terminaba en el titulo. Depende del booleano, que solo cambia
   * al abrir y al cerrar.
   */
  const editorOpen = editor !== null;
  useEffect(() => {
    if (editorOpen) draftTitleRef.current?.focus();
  }, [editorOpen]);

  /**
   * Crea la etiqueta en modo creacion y devuelve su id, o conserva la que ya
   * habia.
   *
   * Va creations separadas y NO dentro del PATCH del bloque: si el nombre ya
   * existe el servidor devuelve la etiqueta existente en vez de fallar, y el
   * guardado del titulo no deberia depender de eso. Si la creacion falla, el
   * bloque se guarda igual con la etiqueta que tenia.
   */
  const resolveTagId = useCallback(
    async (tagId: string | null, pendingTagName: string): Promise<string | null> => {
      if (!pendingTagName) return tagId;
      try {
        const created = await tagsApi.createTag({ name: pendingTagName });
        setTags((prev) => (prev.some((t) => t.id === created.id) ? prev : [...prev, created]));
        return created.id;
      } catch {
        return tagId;
      }
    },
    [],
  );

  /** Refresca las cuentas de la fila sin bajar los eventos. */
  const refreshTags = useCallback(() => {
    tagsApi
      .fetchTags()
      .then(setTags)
      .catch(() => {});
  }, []);

  const commitEditor = useCallback(async () => {
    if (!editor) return;
    const title = editor.title.trim();
    setEditor(null);
    if (!title) return;

    const tagId = await resolveTagId(editor.tagId, editor.pendingTagName);

    if (editor.mode === 'edit') {
      const previous = events.find((e) => e.id === editor.id);
      // Optimista: el cambio se ve al instante y la respuesta confirma.
      setEvents((prev) => prev.map((e) => (e.id === editor.id ? { ...e, title, tagId } : e)));
      api
        .updateEvent(editor.id, { title, tagId })
        .then((saved) => {
          setEvents((prev) => prev.map((e) => (e.id === saved.id ? saved : e)));
          refreshTags();
        })
        .catch(() => {
          // Se revierte al valor que tenia antes: sin esto, un fallo dejaba la
          // pantalla mostrando un cambio que el servidor no tiene.
          if (previous) {
            setEvents((prev) => prev.map((e) => (e.id === editor.id ? previous : e)));
          }
        });
      return;
    }

    const next: CalendarEventDto = {
      id: `tmp-${Date.now()}`,
      userId: 'hardcoded-user-id',
      date: editor.date,
      startMin: editor.startMin,
      durationMin: DEFAULT_DURATION_MIN,
      title,
      tagId,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    // Optimista: el bloque aparece al instante y la respuesta lo reemplaza con
    // el id real. Un calendario donde crear una tarea tarda un round-trip se
    // siente roto.
    setEvents((prev) => [...prev, next]);
    api
      .createEvent({ date: editor.date, startMin: editor.startMin, title, tagId })
      .then((saved) => {
        setEvents((prev) => prev.map((e) => (e.id === next.id ? saved : e)));
        refreshTags();
      })
      .catch(() => {
        setEvents((prev) => prev.filter((e) => e.id !== next.id));
      });
  }, [editor, events, resolveTagId, refreshTags]);

  const removeEvent = useCallback((id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    api.deleteEvent(id).catch(() => {});
    // Las cuentas de la fila bajan con el bloque, asi que hay que recontarlas.
    tagsApi
      .fetchTags()
      .then(setTags)
      .catch(() => {});
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Mutaciones de etiquetas                                                 */
  /* ---------------------------------------------------------------------- */

  const handleRenameTag = useCallback(
    async (id: string, dto: UpdateTagDto) => {
      // Optimista: el toggle cambia de nombre al instante.
      setTags((prev) => prev.map((t) => (t.id === id ? { ...t, ...dto } : t)));
      try {
        const saved = await tagsApi.updateTag(id, dto);
        setTags((prev) => prev.map((t) => (t.id === id ? saved : t)));
      } catch {
        refreshTags();
      }
    },
    [refreshTags],
  );

  const handleDeleteTag = useCallback(async (id: string) => {
    setTags((prev) => prev.filter((t) => t.id !== id));
    try {
      await tagsApi.deleteTag(id);
      /*
       * Los bloques NO se borran, solo pierden la etiqueta. El `SetNull` del
       * servidor ya dejo la columna en NULL; aca se refleja en el cliente para
       * que el chip no siga mostrando un nombre que ya no existe.
       */
      setEvents((prev) =>
        prev.map((e) => (e.tagId === id ? { ...e, tagId: null } : e)),
      );
      refreshTags();
    } catch {
      refreshTags();
    }
  }, [refreshTags]);

  const handleSelectMonth = useCallback((id: string) => {
    if (MONTH_KEY_RE.test(id)) setActiveMonth(id);
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Render                                                                  */
  /* ---------------------------------------------------------------------- */

  const stripItems = months.map((m) => ({ id: m, label: formatMonthLabel(m, true) }));

  return (
    /*
     * `h-dvh`, no `min-h-screen`.
     *
     * Es la diferencia entre que la pagina scrollee o no. `min-h-screen` deja
     * que la raiz CREZCA por debajo del viewport, asi que las 24 filas de hora
     * empujaban el documento y habia que scrollear para llegar al final. Acá la
     * raiz mide EXACTO el alto de la ventana y `overflow-hidden` impide que algo
     * la desborde: si no entra, scrollea adentro del panel, no la pagina entera.
     *
     * `dvh` y no `vh` porque en Electron la barra de titulo y la barra de tareas
     * cambian el alto util entre ventanas, y `vh` no las tiene en cuenta.
     */
    <div className="flex h-dvh flex-col overflow-hidden bg-gray-900">
      <TabStrip
        items={stripItems}
        activeId={activeMonth}
        onSelect={handleSelectMonth}
        leading={leading}
        trailing={
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveMonth((m) => addMonths(m, -1))}
              aria-label="Previous month"
              className="flex h-7 w-7 items-center justify-center rounded text-gray-400 transition-colors hover:bg-white/5 hover:text-gray-200"
            >
              <FiChevronLeft size={15} />
            </button>
            <button
              type="button"
              onClick={() => setActiveMonth((m) => addMonths(m, 1))}
              aria-label="Next month"
              className="flex h-7 w-7 items-center justify-center rounded text-gray-400 transition-colors hover:bg-white/5 hover:text-gray-200"
            >
              <FiChevronRight size={15} />
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveMonth(anchorMonth);
                setSelectedDate(today);
              }}
              className="ml-1 rounded px-2 py-1 text-xs text-gray-400 transition-colors hover:bg-white/5 hover:text-gray-200"
            >
              Today
            </button>
          </div>
        }
      />

      {/*
         * `min-h-0` en el contenedor: sin el, un hijo flexible no baja de su
         * altura de contenido y `flex-1` no alcanza -- es el `min-height: auto`
         * por defecto de los items flex. Es lo que hacia que esta caja midiera
         * lo que quisieran sus hijos en vez de lo que le sobra.
         */}
        {/*
         * Fila de etiquetas: arriba de las dos columnas y a ancho completo.
         *
         * A ancho completo y no dentro de una de las dos secciones porque el
         * filtro afecta a las DOS: esconde bloques del panel del dia Y cambia
         * los contadores de la grilla del mes. Ponerlo en el mes lo haria parecer
         * que filtra solo el mes, que es justo la confusion a evitar.
         */}
        <TagFilterRow
          tags={tags}
          activeIds={activeTagIds}
          onToggle={handleToggleTag}
          onClear={handleClearTags}
          onRename={handleRenameTag}
          onDelete={handleDeleteTag}
        />

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4 lg:flex-row">
        {/* ---------------------------------------------------------------- */}
        {/* Grilla del mes                                                     */}
        {/* ---------------------------------------------------------------- */}
        {/*
           * Abajo de `lg` las dos secciones se apilan y cada una toma la mitad
           * (`flex-1`). Arriba conviven: el mes queda fijo en 420px con
           * `lg:flex-none` y el panel del dia se lleva el resto.
           */}
          <section className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-lg border border-gray-600 bg-gray-800/90 lg:w-[420px] lg:flex-none">
          <header className="flex items-baseline justify-between border-b border-gray-700/60 px-4 py-3">
            <h2 className="text-sm font-medium text-white">{formatMonthLabel(activeMonth)}</h2>
            <span className="text-xs text-gray-500">
              {/*
                * Cuenta de los eventos YA FILTRADOS, como los contadores de las
                * celdas. Con el filtro puesto, decir el total sin filtrar
                * mientras abajo solo se ven tres hace pensar que el filtro no
                * esta haciendo nada.
                */}
                {visibleEvents.length} {visibleEvents.length === 1 ? 'event' : 'events'}
            </span>
          </header>

          <div className="grid grid-cols-7 border-b border-gray-700/60">
            {weekdayInitials().map((w, i) => (
              <div
                key={i}
                className="py-2 text-center text-xs font-medium text-gray-500"
                aria-hidden="true"
              >
                {w}
              </div>
            ))}
          </div>

          {/*
           * `grid-rows-6` sobre una caja `flex-1`: las 6 filas se estiran hasta
           * llenar el panel, que es lo que hace que las dos secciones queden a
           * la misma altura sin que la pagina scrollee. `min-h-0` es lo que le
           * permite BAJAR de la altura natural de las 42 celdas.
           */}
          <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
            {grid.map((row, ri) =>
              row.map((cell) => {
                const isSelected = cell.key === selectedDate;
                const isCurrentMonth = cell.inMonth;
                const count = countsByDate.get(cell.key) ?? 0;
                return (
                  <button
                    key={`${ri}-${cell.key}`}
                    type="button"
                    onClick={() => {
                      setSelectedDate(cell.key);
                      /*
                       * Un dia del mes vecino se puede clickear igual: lleva su
                       * `date` puesta y arrastra el mes con ella. Sin este salto
                       * el panel de abajo mostraria un dia de otro mes, cuyos
                       * eventos ni siquiera estan cargados.
                       */
                      if (!cell.inMonth) setActiveMonth(cell.key.slice(0, 7));
                    }}
                    onDoubleClick={() => startCreate(cell.key, 9 * 60)}
                    aria-label={`${formatDayLabel(cell.key)}${count ? `, ${count} ${count === 1 ? 'event' : 'events'}` : ''}`}
                    aria-current={isToday(cell.key) ? 'date' : undefined}
                    className={`relative flex flex-col items-center justify-start gap-1 border-r border-b border-gray-700/30 p-1 text-sm transition-colors [&:nth-child(7n)]:border-r-0 [&:nth-child(n+36)]:border-b-0 ${
                      isSelected
                        ? 'bg-p2/10'
                        : isCurrentMonth
                          ? 'text-gray-300 hover:bg-white/[0.04]'
                          : 'text-gray-600 hover:bg-white/[0.02]'
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                        isToday(cell.key)
                          ? 'bg-p2 font-medium text-gray-900'
                          : isSelected
                            ? 'text-white'
                            : ''
                      }`}
                    >
                      {dayNumber(cell.key)}
                    </span>
                    {/*
                     * Cantidad de bloques del dia, no un punto.
                     *
                     * El punto decia "este dia tiene algo" y obligaba a entrar a
                     * ver cuanto. El numero dice cuanto, y es la pregunta que uno
                     * se hace mirando un mes. Ademas el punto ocupaba 4px y el
                     * numero ocupa el hueco que ya estaba ahi abajo.
                     *
                     * El color lo decide el estado, como en el resto de la app:
                     * ambar cuando el dia esta seleccionado, gris en reposo. El
                     * numero va en `tabular-nums` para que las columnas de la
                     * grilla alineen los digitos de a uno.
                     */}
                    {count > 0 && (
                      <span
                        className={`text-[11px] font-medium leading-none tabular-nums ${
                          isSelected ? 'text-p2' : 'text-gray-500'
                        }`}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              }),
            )}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Panel del dia: bloques por hora                                  */}
        {/* ---------------------------------------------------------------- */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-gray-600 bg-gray-800/90">
          <header className="flex items-baseline justify-between border-b border-gray-700/60 px-4 py-3">
            <h2 className="text-sm font-medium text-white">{formatDayLabel(selectedDate)}</h2>
            <span className="text-xs text-gray-500">
              {dayEvents.length} {dayEvents.length === 1 ? 'block' : 'blocks'}
            </span>
          </header>

          {/*
           * Rejilla de horas.
           *
           * El contenedor es `flex flex-col` y CADA fila lleva `flex-1`: las 24
           * se reparten el alto que sobra en partes iguales, asi que el panel
           * entra entero sin scroll. Antes cada fila tomaba la altura de su
           * contenido y las 24 juntas empujaban el documento.
           *
           * El `min-h-[22px]` es el piso de legibilidad de la etiqueta de hora
           * mas el borde. Si la ventana es TAN baja que las 24 no pueden
           * respectfulo ese piso, el `overflow-y-auto` scrollea aca adentro -- y
           * solo aca. Prefiero un scroll interno a uno de pagina: la barra de
           * meses y el dia seleccionado no se van.
           */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {hours.map((block) => {
              const inDay = dayEvents.filter((e) => Math.floor(e.startMin / 60) === block.hour);
              const addProps = {
                type: 'button' as const,
                onClick: () => startCreate(selectedDate, block.startMin),
                'aria-label': `Add block at ${block.label}`,
              };
              /*
               * El `+` aparece con el hover de la fila. Es el gesto de la rata:
               * el teclado no pasa por ahi, asi que el anillo de foco lo tiene que
               * volver visible o el boton queda enfocable y sin verse.
               *
               * Comparte el tratamiento entre las dos ramas de abajo y solo
               * cambia el ancho, asi que la clase base vive una sola vez.
               */
              const addClass =
                'flex min-h-5 items-center gap-1 rounded text-xs text-gray-600 opacity-0 transition-opacity hover:bg-white/[0.04] hover:text-gray-300 focus-visible:opacity-100 group-hover:opacity-100';
              return (
                <div
                  key={block.hour}
                  /*
                   * `flex-[1_0_auto]`, no `flex-1`.
                   *
                   * `flex-1` es `1 1 0%`: base cero, o sea que las 24 filas se
                   * reparten el alto IGUAL y ninguna puede crecer mas alla de su
                   * parte -- justo lo contrario de lo que hace falta cuando una
                   * hora tiene tareas que envuelven a varias lineas.
                   *
                   * Los tres numeros tienen una funcion:
                   *
                   *   basis auto   la fila mide lo que mide su contenido, asi
                   *                 que una hora con dos lineas de tareas mide
                   *                 lo que ocupa y no se recorta.
                   *   grow 1       lo que sobra se reparte entre las 24, que es
                   *                 lo que evita el hueco al final del panel.
                   *   shrink 0     Y ACA ESTA EL PUNTO: con `shrink: 1` una fila
                   *                 con dos lineas se aplastaba al piso de 22px
                   *                 en ventana baja y la segunda linea se
                   *                 cortaba sin avisar. Sin shrink, la fila con
                   *                 contenido gana siempre, y si las 24 juntas no
                   *                 entran lo que scrollea es el `overflow-y-auto`
                   *                 del panel, no el recorte silencioso.
                   */
                  className="group flex min-h-[22px] flex-[1_0_auto] items-stretch border-b border-gray-700/20 last:border-b-0"
                >
                  {/*
                   * La etiqueta de la hora se enciende en p2 cuando esa hora
                   * tiene bloques.
                   *
                   * Antes cada bloque llevaba su hora propia adentro, y con dos
                   * o tres en la misma hora se leia "09:15 09:45 09:50" tres
                   * veces seguidas al lado de una columna que ya decia 09:00: la
                   * misma informacion dos veces, en el lugar mas caro de la
                   * pantalla. Ahora la columna es la que dice la hora, una vez,
                   * y el bloque solo dice que hay que hacer.
                   *
                   * El `font-medium` va con el color a proposito: p2 y nada mas
                   * seria decir la misma informacion solo con color, que es
                   * justo lo que no se ve sin distinguish la fuente del gris.
                   */}
                  <div
                    className={`flex w-14 shrink-0 items-center justify-end px-2 text-right text-xs tabular-nums ${
                      inDay.length ? 'font-medium text-p2' : 'text-gray-500'
                    }`}
                  >
                    {block.label}
                  </div>
                  <div className="flex min-w-0 flex-1 items-stretch">
                    {inDay.length === 0 ? (
                      !loaded ? null : (
                        <button {...addProps} className={`${addClass} flex-1 px-1`}>
                          <FiPlus size={12} />
                        </button>
                      )
                    ) : (
                      <>
                        {/*
                         * `flex-wrap` en flujo, no absoluto.
                         *
                         * Cuando las tareas de la hora no entran en una linea,
                         * la caja envuelve a la de abajo y -- como ya no esta
                         * fijada con `absolute inset-0`, sino que manda en el
                         * flujo -- la fila crece y el bloque las contiene. Antes
                         * el contenedor era absoluto con `overflow-hidden`: el
                         * alto lo fijaba la fila y lo que no entraba se cortaba.
                         *
                         * `overflow-hidden` queda igual, pero ahora solo recorta
                         * cuando la fila se achico por ventana baja, que es el
                         * respaldo, no el caso normal.
                         */}
                        <div className="flex min-w-0 flex-1 flex-wrap gap-0.5 overflow-hidden p-0.5">
                          {inDay.map((e) => {
                            /*
                             * Resuelto una vez por bloque y no en el JSX: el
                             * nombre y el color salen de la lista que ya esta en
                             * memoria, asi que es una busqueda en un Map. Un id
                             * que no resuelva -- una etiqueta borrada en otra
                             * pestana antes del fetch -- dibuja el chip sin
                             * etiqueta, no uno con un nombre vacio.
                             */
                            const chipTag = e.tagId ? tagById.get(e.tagId) : undefined;
                            return (
                            <div
                              key={e.id}
                              /*
                               * Click = editar. No hay otro uso que darle al click
                               * sobre un bloque, asi que no se pierde ningun gesto;
                               * el borrado tiene boton propio y las etiquetas se
                               * editan desde la barra.
                               */
                              onClick={() => startEdit(e)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(ev) => {
                                if (ev.key === 'Enter' || ev.key === ' ') {
                                  ev.preventDefault();
                                  startEdit(e);
                                }
                              }}
                              aria-label={`Edit ${e.title}`}
                              title={`${formatHour(e.startMin)} · ${e.title}`}
                              /*
                               * `flex-[1_1_130px]`: base de 130px. ES lo que
                               * decide cuando envuelve -- con base cero (lo que
                               * daria `flex-1`) todas las tareas entrarian en
                               * una sola linea estrechas hasta la nada y nunca
                               * habria un salto de linea.
                               *
                               * La base va en px y no en el ancho del texto a
                               * proposito: si fuera el contenido, un titulo
                               * largo haria envolver antes que uno corto y el
                               * reparto dependeria del texto.
                               *
                               * `min-w-0` es lo que le permite BAJAR de ahi
                               * cuando no entra ni en una linea propia: sin el,
                               * un item flex no baja de su ancho de contenido y
                               * la caja se saldria de la fila en vez de dejar que
                               * el texto envuelva adentro.
                               */
                              className="flex min-w-0 flex-[1_1_130px] cursor-pointer items-center gap-1.5 rounded bg-p2/15 px-1.5 text-xs text-gray-200 transition-colors hover:bg-p2/25"
                            >
                              {/*
                               * Las etiquetas van como texto de su color, antes del
                               * titulo y en `shrink-0`: nunca se truncan y el
                               * titulo sigue envolviendo.
                               *
                               * El color NO esta en el fondo del chip, y es a
                               * proposito. Si una etiqueta tintara el fondo, ese
                               * fondo dejaria de ser la superficie que la app usa
                               * para separar superficies, y la jerarquia de
                               * elevacion -- que en `index.css` esta medida
                               * contra estos mismos tonos -- se rompe. El ambar
                               * del fondo sigue significando lo que significaba:
                               * hay algo ahi.
                               */}
                              {e.tagId &&
                                chipTag && (
                                  <span className="flex shrink-0 items-center gap-1">
                                    <span style={{ color: tagColorHex(chipTag.color) }}>
                                      {chipTag.name}
                                    </span>
                                    <span className="text-gray-500">·</span>
                                  </span>
                                )}
                              <span className="min-w-0 flex-1 break-words">{e.title}</span>
                              <button
                                type="button"
                                onClick={(ev) => {
                                  // Sin esto, el click del tacho dispara la edicion
                                  // del bloque que esta debajo.
                                  ev.stopPropagation();
                                  removeEvent(e.id);
                                }}
                                aria-label={`Delete ${e.title}`}
                                className="shrink-0 text-gray-500 transition-colors hover:text-danger"
                              >
                                <FiTrash2 size={12} />
                              </button>
                            </div>
                            );
                          })}
                        </div>
                        {loaded && (
                          /*
                           * El `+` va FUERA de la caja que envuelve, y por eso
                           * no se va con una linea propia cuando las tareas
                           * llenan el ancho. Es una columna propia del bloque:
                           * con tareas se achica a un botoncito de 24px, y la
                           * fila vacia de arriba lo usa a lo ancho como blanco
                           * de click.
                           */
                          <button {...addProps} className={`${addClass} w-6 shrink-0 justify-center`}>
                            <FiPlus size={12} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/*
           * La barra es la MISMA para crear y para editar, y solo cambian el
           * boton y el encabezado. Dos barras distintas serian dos lugares donde
           * escribir el mismo titulo y las mismas etiquetas, y se desincronizan.
           */}
          {editor && (
            <div className="flex flex-wrap items-center gap-2 border-t border-gray-700/60 bg-gray-800 px-4 py-2">
              <span className="shrink-0 text-xs tabular-nums text-p2">
                {formatDayLabel(editor.date)} {formatHour(editor.startMin)}
              </span>
              <input
                ref={draftTitleRef}
                type="text"
                value={editor.title}
                onChange={(e) => setEditor({ ...editor, title: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void commitEditor();
                  if (e.key === 'Escape') setEditor(null);
                }}
                placeholder="Block title"
                aria-label="Block title"
                className="min-w-[8rem] flex-1 rounded bg-gray-700 px-2 py-1 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500/50"
              />
              <TagPicker
                tags={tags}
                tagId={editor.tagId}
                pendingName={editor.pendingTagName}
                onChange={(next) => setEditor({ ...editor, tagId: next.tagId, pendingTagName: next.pendingName })}
              />
              <button
                type="button"
                onClick={() => setEditor(null)}
                className="shrink-0 rounded px-2 py-1 text-xs text-gray-400 transition-colors hover:bg-white/5 hover:text-gray-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void commitEditor()}
                className="shrink-0 rounded bg-p2/20 px-3 py-1 text-xs text-p2 transition-colors hover:bg-p2/30"
              >
                {editor.mode === 'edit' ? 'Save' : 'Add'}
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
