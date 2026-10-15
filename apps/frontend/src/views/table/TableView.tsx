import { useCallback, useEffect, useRef, useState } from 'react';
import { FiPlus, FiChevronDown, FiTrash2, FiX } from 'react-icons/fi';
import { TableGrid } from './TableGrid';
import * as tablesApi from '../../api/tables';
import { apiErrorMessage } from '../../api/error';
import type { CellValue, TableColumnDto, TableDto, TableRowDto, TableSummaryDto } from '@widget-master/shared';

/*
 * Vista de tabla: el sitio donde se trabaja.
 *
 * El widget muestra la MISMA tabla en compacto, pero esta es la superficie de
 * verdad: aca se elige entre tablas, se crea una y se le cambia el nombre. El
 * widget solo edita celdas de la suya.
 *
 * Lista TODAS las tablas y no "la primera": una tabla por instancia de widget
 * significa que puede haber varias, y sin selector la vista no sabria cual abrir.
 */

interface TableViewProps {
  /** Boton de cambiar vista, que la app pone delante de las pestanas. */
  leading?: React.ReactNode;
}

/** Clave de la tabla que el widget pidio abrir. La consume y se borra. */
const PENDING_TABLE_KEY = 'dashlet-pending-table';

export function TableView({ leading }: TableViewProps) {
  const [tables, setTables] = useState<TableSummaryDto[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [table, setTable] = useState<TableDto | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pickerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  /*
   * Numero de cambio de columnas en curso.
   *
   * Dos cambios de esquema pueden cruzarse --uno esperando el PATCH mientras el
   * otro ya se mando-- y el que responde ultimo NO es el que se mando ultimo. Sin
   * este contador, un fallo tardio reventaba hacia atras un cambio que ya se
   * habia guardado, y la tabla se quedaba mostrando un esquema que el servidor
   * ya no tiene, con un cartel de error al lado.
   */
  const cambioRef = useRef(0);

  const loadList = useCallback(async () => {
    const list = await tablesApi.fetchTables();
    setTables(list);
    return list;
  }, []);

  /*
   * Montaje: trae la lista, y si el widget dejo una tabla pendiente la abre.
   *
   * El widget escribe `dashlet-pending-table` antes de cambiar de vista, asi que
   * es la forma de que "abrir completo" landing en la tabla correcta y no en la
   * primera. Se borra en cuanto se lee: si se quedara, la proxima vez que se
   * abriera la vista saltaria sola a otra tabla sin que nadie lo pidiera.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pending = localStorage.getItem(PENDING_TABLE_KEY);
        if (pending) localStorage.removeItem(PENDING_TABLE_KEY);
        const list = await loadList();
        if (cancelled) return;
        const wanted =
          (pending && list.some((t) => t.id === pending) ? pending : null) ??
          list[0]?.id ??
          null;
        setActiveId(wanted);
      } catch {
        if (!cancelled) setError('Could not load tables');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadList]);

  // Carga la tabla activa. La vista se desmonta al cambiar de vista, asi que
  // entrar siempre relee: es lo que hace que lo que se edito en el widget ya este
  // aqui sin ningun cache compartido entre superficies.
  useEffect(() => {
    if (!activeId) {
      setTable(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const t = await tablesApi.fetchTable(activeId);
        if (!cancelled) setTable(t);
      } catch {
        if (!cancelled) setError('Could not load this table');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  // Click afuera cierra el selector.
  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [pickerOpen]);

  const createTable = useCallback(async () => {
    try {
      setError(null);
      const t = await tablesApi.createTable({});
      await loadList();
      setActiveId(t.id);
      setTable(t);
      titleRef.current?.focus();
    } catch (e) {
      setError(apiErrorMessage(e, 'Could not create the table'));
    }
  }, [loadList]);

  const renameTable = useCallback(
    async (name: string) => {
      if (!table) return;
      const trimmed = name.trim();
      // Nombre vacio no se guarda: el servidor lo rechaza y sin este chequeo la
      // caja se quedaria en blanco esperando un error que nadie ve.
      if (!trimmed || trimmed === table.name) {
        setTable({ ...table, name: trimmed || table.name });
        return;
      }
      setTable({ ...table, name: trimmed });
      setTables((prev) => prev.map((t) => (t.id === table.id ? { ...t, name: trimmed } : t)));
      try {
        setError(null);
        await tablesApi.updateTable(table.id, { name: trimmed });
      } catch (e) {
        setTable(table);
        setError(apiErrorMessage(e, 'Could not rename the table'));
      }
    },
    [table],
  );

  const deleteTable = useCallback(
    async (id: string) => {
      const previous = table;
      setTables((prev) => prev.filter((t) => t.id !== id));
      setActiveId(null);
      setTable(null);
      setError(null);
      try {
        await tablesApi.deleteTable(id);
        const list = await loadList();
        setActiveId(list[0]?.id ?? null);
      } catch (e) {
        // Se revierte con el `update` optimista: la fila habia salido de la lista
        // y sin esto la vista se quedaria mostrando una tabla que ya no existe.
        setTables((prev) =>
          previous
            ? [...prev, { id: previous.id, name: previous.name, rowCount: previous.rowCount, createdAt: previous.createdAt, updatedAt: previous.updatedAt }]
            : prev,
        );
        setActiveId(id);
        setTable(previous);
        setError(apiErrorMessage(e, 'Could not delete the table'));
      }
    },
    [table, loadList],
  );

  /**
   * Guarda una celda.
   *
   * Se manda el objeto `values` ENTERO, no solo la celda que cambio: el backend
   * reemplaza en vez de fusionar, asi que mandar una parte borraria el resto de
   * la fila.
   *
   * El estado se actualiza antes de la respuesta --optimista-- porque una celda
   * que tarda medio segundo en poblarse se siente rota. Si el PATCH falla se
   * vuelve al valor anterior, que es un error puntual y visible.
   */
  const changeCell = useCallback(
    (rowId: string, columnId: string, value: CellValue) => {
      if (!table) return;
      const previous = table;
      setError(null);
      setTable({
        ...table,
        rows: table.rows.map((r) =>
          r.id === rowId ? { ...r, values: { ...r.values, [columnId]: value } } : r,
        ),
      });
      const row = previous.rows.find((r) => r.id === rowId);
      if (!row) return;
      void tablesApi
        .updateTableRow(table.id, rowId, { values: { ...row.values, [columnId]: value } })
        .catch(() => setTable(previous));
    },
    [table],
  );

  /**
   * Cambia el esquema: alta, baja, renombre o reorden.
   *
   * Se manda la lista COMPLETA y se ADOPTA la respuesta del servidor en vez de
   * parchear el estado local. Es lo unico correcto para borrar una columna: el
   * servidor quita esa clave de los valores de todas las filas dentro de la misma
   * transaccion, y el `TableDto` que devuelve ya viene con las filas limpias.
   * Rehacer esa limpieza en el cliente seria duplicar una regla que vive en un
   * solo sitio, y cualquier diferencia entre las dos copias dejaria claves
   * huerfanas que nadie ve pero que vuelven si alguien recrea la columna con el
   * mismo id.
   *
   * El encabezado se cambia de forma optimista para que la columna nueva se vea
   * al instante; si el PATCH falla se vuelve al esquema anterior.
   */
  /**
   * Mueve una fila a otra posicion.
   *
   * `next` es la lista YA en el orden final, y solo se persiste la `position` de
   * la fila movida: las del servidor son promedios entre vecinos, asi que alcanza
   * con guardar ese unico numero y las demas no se tocan.
   *
   * El estado se actualiza de una con `next` y no se espera la respuesta, por lo
   * mismo que las celdas: media tabla girada se siente rota. Si el PATCH falla se
   * vuelve al orden anterior.
   */
  const changeRowOrder = useCallback(
    async (next: TableRowDto[], rowId: string, position: number) => {
      if (!table) return;
      const previous = table;
      setTable({ ...table, rows: next });
      try {
        await tablesApi.updateTableRow(table.id, rowId, { position });
      } catch (e) {
        setTable(previous);
        setError(apiErrorMessage(e, 'Could not move the row'));
      }
    },
    [table],
  );

  const changeColumns = useCallback(
    async (next: TableColumnDto[]) => {
      if (!table) return;
      const ticket = ++cambioRef.current;
      const previous = table;
      setError(null);
      setTable({ ...table, columns: next });
      try {
        const guardado = await tablesApi.updateTable(table.id, { columns: next });
        // Si mientras tanto entro otro cambio de columnas, este ya no es el
        //Ultimo: su respuesta es mas vieja que lo que hay en pantalla y adoptarla
        // rebobinaria al usuario.
        if (cambioRef.current !== ticket) return;
        setTable(guardado);
      } catch (e) {
        // Mismo criterio para el fallo: un error VIEJO no puede deshacer un cambio
        // NUEVO que ya se guardo. Antes pasaba: dos cambios seguidos, el primero
        // fallaba tarde y revolvia el estado al anterior, dejando en pantalla un
        // esquema que el servidor ya no tiene.
        if (cambioRef.current !== ticket) return;
        setTable(previous);
        setError(apiErrorMessage(e, 'Could not change the columns'));
      }
    },
    [table],
  );

  /**
   * El ancho ajustado a una columna.
   *
   * Va por `changeColumns` y no por un endpoint propio porque el ancho ES parte de
   * la columna: es lo unico que hay, y asi un reorden que todavia no se guardo no
   * pisa el ancho que el usuario acaba de ajustar.
   */
  const setColumnWidth = useCallback(
    (columnId: string, width: number) => {
      if (!table) return;
      void changeColumns(table.columns.map((c) => (c.id === columnId ? { ...c, width } : c)));
    },
    [table, changeColumns],
  );

  const addRow = useCallback(async () => {
    if (!table) return;
    try {
      setError(null);
      const row = await tablesApi.createTableRow(table.id, { values: {} });
      setTable({ ...table, rows: [...table.rows, row], rowCount: table.rowCount + 1 });
    } catch (e) {
      setError(apiErrorMessage(e, 'Could not add the row'));
    }
  }, [table]);

  /*
   * Borrar fila ya no tiene entrada en la UI: la papelera de la columna de
   * acciones paso a ser el asa de arrastre. El endpoint sigue vivo
   * (`deleteTableRow`) y volver a colgarlo es una linea, cuando se decida donde.
   */

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-gray-900 text-white">
      {/*
       * Barra superior: el boton de vistas, el selector de tablas y el nombre.
       *
       * `shrink-0` en los tres: sin el, el flex los aplasta para dejarle lugar al
       * contenido, y el nombre de la tabla es justo lo que mas se encoge.
       */}
      <header className="flex shrink-0 items-center gap-2 border-b border-gray-700 px-3 py-2">
        {leading}

        {loading ? (
          <div className="skeleton h-6 w-40 rounded" />
        ) : (
          <div ref={pickerRef} className="relative">
            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              disabled={!tables.length}
              className="flex max-w-[16rem] items-center gap-1.5 rounded border border-gray-700 px-2 py-1 text-sm text-gray-200 transition-colors hover:border-gray-600 disabled:opacity-40"
            >
              <span className="truncate">{table?.name ?? 'No tables'}</span>
              {tables.length > 0 && <FiChevronDown size={13} className="shrink-0 text-gray-500" />}
            </button>

            {pickerOpen && (
              <div className="absolute top-full left-0 z-[var(--z-menu)] mt-1 w-64 overflow-hidden rounded border border-gray-600 bg-gray-800 shadow-xl">
                <div className="max-h-64 overflow-y-auto">
                  {tables.map((t) => (
                    <div key={t.id} className="flex items-center gap-1 pr-1">
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setActiveId(t.id);
                          setPickerOpen(false);
                        }}
                        className={`flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-white/5 ${
                          t.id === activeId ? 'text-white' : 'text-gray-300'
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate">{t.name}</span>
                        <span className="shrink-0 text-xs tabular-nums text-gray-600">
                          {t.rowCount}
                        </span>
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setPickerOpen(false);
                          void deleteTable(t.id);
                        }}
                        aria-label={`Delete table ${t.name}`}
                        title="Delete table"
                        className="shrink-0 rounded p-1 text-gray-600 transition-colors hover:bg-danger/15 hover:text-danger"
                      >
                        <FiTrash2 size={11} />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setPickerOpen(false);
                    void createTable();
                  }}
                  className="flex w-full items-center gap-2 border-t border-gray-700 px-2 py-1.5 text-left text-sm text-gray-300 hover:bg-white/5"
                >
                  <FiPlus size={12} className="text-gray-500" />
                  New table
                </button>
              </div>
            )}
          </div>
        )}

        {table && (
          <>
            <input
              ref={titleRef}
              defaultValue={table.name}
              key={table.id}
              onBlur={(e) => void renameTable(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') {
                  e.currentTarget.value = table.name;
                  e.currentTarget.blur();
                }
              }}
              aria-label="Table name"
              className="min-w-0 flex-1 rounded bg-transparent px-1.5 py-1 text-sm text-gray-400 transition-colors hover:bg-white/[0.03] focus:bg-gray-800 focus:text-white focus:outline-none"
            />
            <span className="shrink-0 text-xs tabular-nums text-gray-600">
              {table.rowCount} {table.rowCount === 1 ? 'row' : 'rows'}
            </span>
          </>
        )}

        {!loading && !tables.length && (
          <button
            type="button"
            onClick={() => void createTable()}
            className="ml-auto flex shrink-0 items-center gap-1.5 rounded bg-p2 px-2.5 py-1 text-sm font-medium text-gray-900 transition-colors hover:bg-p2/85"
          >
            <FiPlus size={13} />
            New table
          </button>
        )}
      </header>

      {error && (
        /*
         * Con su boton de cerrar, y no como un <p> fijo.
         *
         * Antes el cartel no se iba nunca: no habia un solo `setError(null)` en
         * el archivo, asi que un fallo puntual --la vista abierta sin backend, un
         * PATCH que se cayo-- dejaba el mensaje pegado para siempre. Y ahi esta
         * la mitad del bug que reporto el usuario: el aviso "Could not change the
         * columns" seguia ahi mientras las columnas se cambiaban bien, porque ya
         * no decia nada del estado actual sino de uno viejo.
         */
        <div
          role="alert"
          className="flex shrink-0 items-start gap-2 bg-danger/15 px-3 py-1.5 text-xs text-danger"
        >
          <span className="min-w-0 flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss"
            title="Dismiss"
            className="-mr-1 shrink-0 rounded p-0.5 transition-colors hover:bg-danger/20"
          >
            <FiX size={12} />
          </button>
        </div>
      )}

      <main className="flex min-h-0 flex-1 flex-col px-3 py-3">
        {loading ? (
          <div className="skeleton h-full w-full rounded-lg" />
        ) : table ? (
          <TableGrid
            columns={table.columns}
            rows={table.rows}
            density="full"
            onCellChange={changeCell}
            onRowAdd={() => void addRow()}
            onColumnsChange={(next) => void changeColumns(next)}
            onColumnWidth={setColumnWidth}
            onRowReorder={(next, rowId, position) => void changeRowOrder(next, rowId, position)}
            hiddenRowCount={Math.max(0, table.rowCount - table.rows.length)}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-gray-500">No tables yet.</p>
            <button
              type="button"
              onClick={() => void createTable()}
              className="flex items-center gap-1.5 rounded bg-p2 px-3 py-1.5 text-sm font-medium text-gray-900 transition-colors hover:bg-p2/85"
            >
              <FiPlus size={14} />
              New table
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
