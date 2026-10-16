import { useCallback, useEffect, useRef, useState } from 'react';
import { FiX } from 'react-icons/fi';
import { TableGrid } from '../../views/table/TableGrid';
import * as tablesApi from '../../api/tables';
import { apiErrorMessage } from '../../api/error';
import type { CellValue, TableColumnDto, TableDto, TableRowDto } from '@widget-master/shared';

/*
 * Widget de tabla: la MISMA tabla de la vista, en compacto.
 *
 * No guarda los datos. La tabla vive en el servidor y este widget es un
 * `tableId` guardado en el `config`; la vista la edita en pantalla completa. Es
 * lo que hace que las dos superficies no puedan divergir: no hay dos copias, hay
 * una y dos ventanas.
 *
 * El `TableGrid` es el mismo componente que usa la vista, con `density="compact"`.
 * Toda la edicion de celdas y de columnas --renombrar, borrar con confirmacion,
 * mover, agregar-- es identica en las dos. Lo unico que cambia es el tamano.
 *
 * Props declaradas aca y no importadas de `../types`, que no las exporta: es lo
 * que hacen los demas widgets (`DiaryWidgetProps`, etc.).
 */
interface DataTableWidgetProps {
  config: Record<string, unknown>;
  onConfigChange: (config: Record<string, unknown>) => void;
}

/** Llave del evento con el que el widget pide abrir la vista de tabla. */
export const OPEN_TABLE_EVENT = 'dashlet:open-table';

/** Tabla que el widget quiere que se abra. La vista la lee y la borra. */
const PENDING_TABLE_KEY = 'dashlet-pending-table';

/**
 * El reloj local, para fechar el cambio en el estado antes de que responda el
 * servidor.
 *
 * `changeCell`, `addRow` y `changeRowOrder` actualizan la tabla en local y
 * descartan la respuesta --para no perder el foco ni el arrastre--, asi que el
 * `updatedAt` del servidor llega viejo. Sin este sello, el "last updated 2 hours
 * ago" del pie se queda congelado despues de editar, que es justo cuando el
 * usuario lo mira. Lo corrige el proximo guardado que si adopta la respuesta,
 * que es el de columnas.
 */
const ahora = () => new Date().toISOString();

/**
 * "Abrir completo": deja la tabla apuntada y avisa a la app.
 *
 * Es una FUNCION suelta y no un boton del cuerpo porque el boton quedo en la
 * barra del frame, y el frame no tiene la tabla -- solo el `config`, donde el
 * `tableId` ya esta escrito.
 *
 * Escribir la llave en `localStorage` NO alcanza por si solo: `App.tsx` tiene la
 * vista en estado de React y no se entera de que cambio. Por eso el evento.
 */
export function openTableView(tableId: string): void {
  localStorage.setItem(PENDING_TABLE_KEY, tableId);
  window.dispatchEvent(new CustomEvent(OPEN_TABLE_EVENT, { detail: { tableId } }));
}

export function DataTableWidget({ config, onConfigChange }: DataTableWidgetProps) {
  const tableId = typeof config.tableId === 'string' ? config.tableId : null;
  const [table, setTable] = useState<TableDto | null>(null);
  /*
   * La tabla del ultimo render, para leerla desde un camino que se completa
   * DESPUES de un await.
   *
   * React no repinta en el microtask que sigue a un `setState` hecho desde una
   * continuation: el render se agenda para despues. Asi que un callback que se
   * agarro antes del await sigue teniendo la tabla de ese momento, y como
   * `changeCell` escribe el objeto entero --`{ ...tabla, rows }`-- termina
   * revirtiendo lo que otro cambio habia hecho mientras esperaba. Asi se perdia
   * la categoria recien creada: el PATCH de las columnas llegaba bien, el de la
   * celda tambien, y el estado local volvia atras.
   *
   * Con el ref, el callback lee la tabla de ahora y escribe sobre esa.
   */
  const tablaRef = useRef(table);
  tablaRef.current = table;
  const [loading, setLoading] = useState(Boolean(tableId));
  const [error, setError] = useState<string | null>(null);

  /*
   * Numero de cambio de columnas en curso.
   *
   * Dos cambios de esquema pueden cruzarse y el que responde ultimo no es el que
   * se mando ultimo. Sin este contador, un fallo tardio --o una respuesta vieja--
   * reventaba hacia atras un cambio que ya estaba guardado y dejaba el cartel de
   * error al lado de una tabla que si se habia cambiado.
   */
  const cambioRef = useRef(0);

  /*
   * Creacion perezosa de la tabla.
   *
   * UNA tabla por instancia: cada widget es su tabla, y eso no necesita ninguna
   * coordinacion aunque `WidgetGrid` monte todas las pestanas a la vez, porque
   * dos instancias son dos widgets distintos con dos configs distintos.
   *
   * El candado en un ref y no en un estado es a proposito: en desarrollo los
   * efectos se ejecutan dos veces, y con estado el segundo disparo veria el
   * `tableId` todavia en `null` -- porque el `PATCH` del primero no ha vuelto --
   * y crearia una tabla que se queda huerfana.
   */
  const creatingRef = useRef(false);
  useEffect(() => {
    if (tableId || creatingRef.current) return;
    creatingRef.current = true;
    void (async () => {
      try {
        const t = await tablesApi.createTable({});
        onConfigChange({ ...config, tableId: t.id });
      } catch {
        creatingRef.current = false;
        setError('Could not create the table');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId]);

  // Carga. Vuelve a traerla cada vez que cambia el id.
  useEffect(() => {
    if (!tableId) {
      setTable(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const t = await tablesApi.fetchTable(tableId);
        if (cancelled) return;
        setTable(t);
        setError(null);
      } catch {
        if (!cancelled) setError('Could not load the table');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tableId]);

  /*
   * Titulo y resumen van en LOS DOS SENTIDOS, desde UN SOLO efecto.
   *
   * Eran dos efectos y se peleaban: el de tabla->config escribia el nombre de la
   * tabla, y el de config->tabla corria en el MISMO commit con el `config.title`
   * de antes -- porque esa escritura todavia no habia llegado -- y renombraba la
   * tabla a "Table". Medido en consola: ping-pong infinito entre "Table" y
   * "Untitled table", con un PATCH al servidor por cada vuelta.
   *
   * Uno solo no alcanza, porque hace falta saber DE QUE LADO viene el cambio:
   *
   *   - `parRef` guarda el ultimo par (nombre de tabla, titulo de la barra). Si
   *     cambio solo la tabla, la copio al config; si cambio solo la barra, la
   *     copio a la tabla. Los dos a la vez no pasan salvo que sean el mismo
   *     nombre, porque el renombre desde la barra PATCHea la tabla y despues
   *     ambas quedan iguales.
   *
   *   - `titleSource` en el config resuelve el PRIMER contacto despues de una
   *     recarga, donde no hay par previo. Sin el, un titulo que escribio este
   *     mismo widget se confundia con uno que puso el usuario, y el renombre
   *     hecho desde la vista se revertia en cada recarga. Va en el config porque
   *     tiene que sobrevivirla.
   *
   * El resumen va al config porque el readout retraido es una FUNCION PURA sobre
   * el config: con el cuerpo desmontado no hay estado de React al que preguntarle.
   *
   * Solo la dimension --filas y columnas--. Antes sumaba las columnas numericas y
   * contaba las marcadas de la primera de casillas, y las dos cosas quedaron
   * huerfanas cuando el readout paso a mostrar solo `12 × 3`.
   */
  const parRef = useRef<{ tabla: string; barra: string } | null>(null);
  const resumenRef = useRef('');
  useEffect(() => {
    if (!table) return;
    const barra = (typeof config.title === 'string' ? config.title : '').trim();
    const prev = parRef.current;
    parRef.current = { tabla: table.name, barra };

    const resumen = {
      rows: table.rowCount,
      columns: table.columns.length,
      updatedAt: table.updatedAt,
    };
    const guardar = (extra: Record<string, unknown>) => {
      const serial = JSON.stringify(resumen);
      if (serial === resumenRef.current && !Object.keys(extra).length) return;
      resumenRef.current = serial;
      onConfigChange({ ...config, ...extra, ...resumen });
    };
    const renombrarTabla = (nombre: string) => {
      void tablesApi
        .updateTable(table.id, { name: nombre })
        .then((saved) => setTable(saved))
        .catch((e) => setError(apiErrorMessage(e, 'Could not rename the table')));
    };

    const cambioTabla = prev !== null && prev.tabla !== table.name && prev.barra === barra;
    const cambioBarra = prev !== null && prev.barra !== barra && prev.tabla === table.name;

    if (cambioBarra) {
      // Lo escribio el usuario en la barra del frame: la tabla lo adopta y se
      // marca como suyo para que una recarga futura no lo revierta.
      renombrarTabla(barra);
      guardar({ titleSource: 'user' });
      return;
    }
    if (cambioTabla) {
      guardar(barra === table.name ? {} : { title: table.name, titleSource: 'table' });
      return;
    }
    // Primer contacto: manda el nombre de la tabla, salvo que el titulo sea
    // del usuario.
    if (barra !== table.name) {
      if (config.titleSource === 'user') renombrarTabla(barra);
      else guardar({ title: table.name, titleSource: 'table' });
      return;
    }
    guardar({ titleSource: 'table' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, config.title]);

  /**
   * Carga el objeto entero de `values`.
   *
   * El backend REEMPLAZA y no fusiona, asi que mandar solo la celda que cambio
   * borraria el resto de la fila.
   */
  const changeCell = useCallback(
    (rowId: string, columnId: string, value: CellValue) => {
      /* Del ref y no del closure: ver `tablaRef`. */
      const t = tablaRef.current;
      if (!t) return;
      const row = t.rows.find((r) => r.id === rowId);
      if (!row) return;
      setError(null);
      /*
       * La escritura es FUNCIONAL y no `{ ...t, rows }`.
       *
       * Esta celda se puede escribir despues de un await --crear una categoria y
       * elegirla en la celda-- y para entonces React todavia no repinto: `t` es la
       * tabla de antes de que se agregara la categoria. Escribiendo el objeto
       * entero se pisaba ese cambio y la categoria nueva desaparecia de la
       * pantalla hasta recargar, con el PATCH hecho y bien. Con `v =>` React lo
       * aplica sobre el estado acumulado, que ya la incluye.
       */
      setTable((v) =>
        v
          ? {
              ...v,
              updatedAt: ahora(),
              rows: v.rows.map((r) =>
                r.id === rowId ? { ...r, values: { ...r.values, [columnId]: value } } : r,
              ),
            }
          : v,
      );
      void tablesApi
        .updateTableRow(t.id, rowId, { values: { ...row.values, [columnId]: value } })
        /* El rollback devuelve SOLO la fila que fallo y no la tabla entera: si
         * mientras tanto se toco el esquema --una categoria nueva, un ancho--,
         * revertir el objeto entero se llevaria ese cambio tambien. */
        .catch(() =>
          setTable((v) =>
            v ? { ...v, rows: v.rows.map((r) => (r.id === rowId ? row : r)) } : v,
          ),
        );
    },
    [],
  );

  const addRow = useCallback(async () => {
    if (!table) return;
    try {
      setError(null);
      const row = await tablesApi.createTableRow(table.id, { values: {} });
      setTable({
        ...table,
        updatedAt: ahora(),
        rows: [...table.rows, row],
        rowCount: table.rowCount + 1,
      });
    } catch (e) {
      setError(apiErrorMessage(e, 'Could not add the row'));
    }
  }, [table]);

  /*
   * Borrar fila ya no tiene entrada en la UI: la papelera de la columna de acciones
   * paso a ser el asa de arrastre. El endpoint sigue vivo (`deleteTableRow`).
   */

  /**
   * Mueve una fila a otra posicion.
   *
   * Solo se persiste la `position` de la fila movida: las del servidor son
   * promedios entre vecinos, asi que ese unico numero alcanza y las demas no se
   * tocan. El estado local ya viene en el orden final, asi que no hace falta
   * esperar la respuesta.
   */
  const changeRowOrder = useCallback(
    async (next: TableRowDto[], rowId: string, position: number) => {
      if (!table) return;
      const previous = table;
      setError(null);
      setTable({ ...table, updatedAt: ahora(), rows: next });
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
        // Se adopta la respuesta y no se parchea el estado local: el servidor
        // quita en la misma transaccion la clave de las columnas que
        // desaparecieron de todas las filas, y el `TableDto` ya viene limpio.
        const guardado = await tablesApi.updateTable(table.id, { columns: next });
        // Un cambio VIEJO no puede pisar uno NUEVO que ya se guardo: dos
        // arrastres seguidos dejan dos PATCH en vuelo y el que responde ultimo
        // no es el que se mando ultimo.
        if (cambioRef.current !== ticket) return;
        setTable(guardado);
      } catch (e) {
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
   * Mismo camino que `changeColumns`: el ancho es parte de la columna, asi que va
   * en el mismo PATCH y no hay un segundo canal por donde el servidor pueda ver
   * dos versiones de la misma columna.
   */
  const setColumnWidth = useCallback(
    (columnId: string, width: number) => {
      if (!table) return;
      void changeColumns(table.columns.map((c) => (c.id === columnId ? { ...c, width } : c)));
    },
    [table, changeColumns],
  );

  /*
   * Tres guardas y no una, porque son tres estados distintos que se ven igual de
   * vacios pero no son lo mismo: todavia no tiene tabla, la esta bajando, o la
   * bajada fallo. Encadenarlos en un `||` dejo a TypeScript sin estrechamiento y
   * el error seeria visible: con la tabla en `null` por un fallo de red, el
   * `TableGrid` recibiria `table.columns` de la nada.
   */
  if (!tableId || loading || !table) {
    return (
      <div className="flex h-full items-center justify-center px-2 text-center text-xs text-gray-600">
        {error ?? 'Setting up...'}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error && (
        /* Con su boton de cerrar: el mensaje tiene que poder irse solo. */
        <div role="alert" className="flex shrink-0 items-start gap-1 text-[10px] text-danger">
          <span className="min-w-0 flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss"
            title="Dismiss"
            className="-mt-0.5 shrink-0 rounded p-0.5 transition-colors hover:bg-danger/15"
          >
            <FiX size={10} />
          </button>
        </div>
      )}

      {/*
        * `flex flex-col` y no un bloque: la tabla es `flex-1` dentro de esto, y un
        * `flex-1` dentro de un padre que no es flex no hace nada -- el alto se
        * quedaba con el contenido y el widget le pagaba 180px de alto a la
        * nada. Medido: 432px de widget con 175px de tabla.
        */}
      <div className="flex min-h-0 flex-1 flex-col">
        <TableGrid
          columns={table.columns}
          rows={table.rows}
          density="compact"
          onCellChange={changeCell}
          onRowAdd={() => void addRow()}
          onColumnsChange={changeColumns}
          onColumnWidth={setColumnWidth}
          onRowReorder={(next, rowId, position) => void changeRowOrder(next, rowId, position)}
          hiddenRowCount={Math.max(0, table.rowCount - table.rows.length)}
          updatedAt={table.updatedAt}
        />
      </div>
    </div>
  );
}
