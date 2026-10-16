import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  COLUMN_TYPES,
  CellValue,
  ColumnType,
  CreateTableDto,
  CreateTableRowDto,
  MAX_COLUMN_NAME_LENGTH,
  MAX_COLUMN_WIDTH,
  MAX_ROWS_PER_TABLE,
  MIN_COLUMN_WIDTH,
  RowValues,
  TableColumnDto,
  TableDto,
  TableRowDto,
  TableSummaryDto,
  UpdateTableDto,
  UpdateTableRowDto,
  defaultTableColumns,
  normalizeDate,
  isStatusValue,
  isOptionValue,
  MAX_OPTION_LENGTH,
  NUMBER_FORMATS,
  NumberFormat,
  STATUS_VALUES,
} from '@widget-master/shared';

/*
 * Tablas de datos propias del usuario.
 *
 * `columns` y `values` son texto con JSON adentro, no columnas de Prisma. Es la
 * misma convencion que `Widget.config`: el schema no usa el tipo `Json` en
 * ninguna parte. Todo el parseo pasa por `parseJson` para que el error sea
 * siempre el mismo y no dependa de que camino se tomo.
 */
function parseJson(raw: string, fallback: unknown, what: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new BadRequestException(`${what} is not valid JSON`);
  }
}

function isColumnType(value: unknown): value is ColumnType {
  return typeof value === 'string' && (COLUMN_TYPES as string[]).includes(value);
}

/**
 * Normaliza y valida el esquema de columnas.
 *
 * Tres reglas que el cliente no puede romper:
 *
 *   1. El `type` tiene que ser `text` o `number`. Sin esto un tipo inventado
 *      llegaria a la grilla y la celda no sabria que input ponerle.
 *   2. El `id` se conserva, y se genera solo si falta. Es la clave de `RowValues`,
 *      de modo que regenerarlo dejaria huerfanas todas las celdas de esa columna.
 *   3. No hay ids repetidos: dos columnas con la misma clave se pisarian entre si
 *      al escribir una celda, y el `PATCH` de filas no tendria forma de saber a
 *      cual de las dos se referia el cliente.
 */
function normalizeColumns(input: unknown): TableColumnDto[] {
  if (!Array.isArray(input)) {
    throw new BadRequestException('columns must be an array');
  }
  const seen = new Set<string>();
  return input.map((raw, i) => {
    const c = raw as Partial<TableColumnDto>;
    if (!isColumnType(c.type)) {
      throw new BadRequestException(
        `Column ${i} has invalid type "${String(c.type)}", expected ${COLUMN_TYPES.join(', ')}`,
      );
    }
    const name = typeof c.name === 'string' ? c.name.trim() : '';
    if (!name) {
      throw new BadRequestException(`Column ${i} needs a name`);
    }
    if (name.length > MAX_COLUMN_NAME_LENGTH) {
      throw new BadRequestException(
        `Column name must be ${MAX_COLUMN_NAME_LENGTH} characters or fewer`,
      );
    }
    const id = typeof c.id === 'string' && c.id ? c.id : crypto.randomUUID();
    if (seen.has(id)) {
      throw new BadRequestException(`Duplicate column id "${id}"`);
    }
    seen.add(id);
    /*
     * El ancho se normaliza en vez de confiar: es un numero que el cliente manda
     * arrastrando y arrastrar produce decimales, negativos y valores de NaN si el
     * puntero se escapa de la pantalla. Un `NaN` en el ancho revienta el
     * `gridTemplateColumns` entero, no solo la columna que lo tiene.
     *
     * Sin ancho se devuelve `undefined`, que el `JSON.stringify` se come: asi la
     * columna vuelve a medirse por su contenido y no queda un `width: null` que el
     * cliente tendria que distinguir del ausente.
     */
    const width =
      typeof c.width === 'number' && Number.isFinite(c.width)
        ? Math.min(Math.max(Math.round(c.width), MIN_COLUMN_WIDTH), MAX_COLUMN_WIDTH)
        : undefined;
    return { id, name, type: c.type, width, ...ajustesDeColumna(c) };
  });
}

/**
 * Las opciones de una `select` y el formato de un `number`, ya limpios.
 *
 * Se devuelven como un objeto para poder esparcirlo en la columna: asi el
 * `JSON.stringify` se come lo que no aplica --una `select` sin formato, un `text`
 * con moneda-- en vez de guardar claves que nadie lee.
 *
 * Las opciones se limpian igual que el ancho, y por la misma razon de confianza:
 * vienen de un editor de texto libre. Se recortan, se les corta el vacio, se
 * descartan las vacias y se deduplican por `id` --el `id` repetido haria que dos
 * opciones distintas fueran la misma celda--. El `id` que falta se genera, igual
 * que el de la columna.
 */
function ajustesDeColumna(c: Partial<TableColumnDto>): Partial<TableColumnDto> {
  if (c.type === 'select') {
    const vistos = new Set<string>();
    const opciones = (Array.isArray(c.options) ? c.options : [])
      .map((o) => ({
        id: typeof o?.id === 'string' && o.id ? o.id : crypto.randomUUID(),
        label: typeof o?.label === 'string' ? o.label.trim().slice(0, MAX_OPTION_LENGTH) : '',
      }))
      .filter((o) => {
        if (!o.label || vistos.has(o.id)) return false;
        vistos.add(o.id);
        return true;
      });
    return { options: opciones };
  }
  if (c.type === 'number') {
    const format =
      typeof c.format === 'string' && (NUMBER_FORMATS as string[]).includes(c.format)
        ? (c.format as NumberFormat)
        : undefined;
    const currency =
      typeof c.currency === 'string' && c.currency.trim()
        ? c.currency.trim().slice(0, MAX_OPTION_LENGTH)
        : undefined;
    return { format, currency };
  }
  return {};
}

/**
 * Convierte un numero escrito a `number`, `null` si esta vacio, o falla.
 *
 * El vacio es "sin valor" y NO un error: es exactamente lo que manda el input
 * cuando el usuario borra el contenido de una celda numerica. Lo que no puede
 * pasar es que se guarde como CERO, y `Number('')` es 0 -- de ahi el chequeo
 * explicito de la cadena en blanco en vez de confiar en el `Number`.
 */
function coerceNumber(raw: unknown, columnName: string): number | null {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) {
      throw new BadRequestException(`Value for "${columnName}" is not a finite number`);
    }
    return raw;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      throw new BadRequestException(`Value for "${columnName}" is not a number`);
    }
    return parsed;
  }
  throw new BadRequestException(`Value for "${columnName}" is not a number`);
}

/**
 * Una fecha de SOLO dia en el formato guardado, `null` si esta vacia, o falla.
 *
 * Misma forma que `coerceNumber`: el vacio es "sin valor" y no un error, porque es
 * lo que manda el editor de fecha cuando el usuario lo borra. Lo demas tiene que
 * ser una fecha de verdad --`normalizeDate` acepta el formato en que se muestra y
 * devuelve el en que se guarda--; guardar "16/10/2026" y que la grilla lo muestre
 * como texto en una columna de fechas es un valor invalido en el servidor.
 */
function coerceDate(raw: unknown, columnName: string): string | null {
  const iso = normalizeDate(raw);
  if (iso) return iso;
  if (typeof raw === 'string' && !raw.trim()) return null;
  throw new BadRequestException(`Value for "${columnName}" is not a date like 16/10/2026`);
}

/**
 * Valida los valores de una fila CONTRA el esquema de la tabla.
 *
 * Es la parte que hace que los dos tipos sirvan de algo: un `number` nunca queda
 * guardado como texto, porque despues la columna no suma y el widget colapsado
 * muestra un `NaN` que el usuario no sabe de donde salio.
 *
 * Una clave que no existe en el esquema se RECHAZA con 400 y no se ignora: si el
 * cliente manda una columna desconocida es que el esquema cambio entre que abrio
 * la vista y que guardo, y descartar el dato en silencio deja la fila a medias
 * sin que nadie se entere.
 */
function normalizeValues(input: unknown, columns: TableColumnDto[]): RowValues {
  if (input === undefined || input === null) return {};
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new BadRequestException('values must be an object');
  }
  const byId = new Map(columns.map((c) => [c.id, c]));
  const out: RowValues = {};
  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    const column = byId.get(key);
    if (!column) {
      throw new BadRequestException(`Unknown column "${key}"`);
    }
    if (raw === null || raw === undefined) {
      out[key] = null;
      continue;
    }
    if (column.type === 'checkbox') {
      /*
       * Solo `true` o `false`, y cualquier otra cosa es un 400.
       *
       * Aceptar "lo que se pueda leer como booleano" --truthiness, 1/0, "si"--
       * deja pasar un valor que la grilla dibuja de una forma y que el usuario
       * leyo de otra. Es el unico valor que la UI manda y el unico que tiene
       * sentido: una casilla tiene dos estados y el que no se toco ya es `false`
       * en pantalla.
       */
      if (typeof raw !== 'boolean') {
        throw new BadRequestException(`Value for "${column.name}" must be true or false`);
      }
      out[key] = raw;
      continue;
    }
    if (column.type === 'date') {
      out[key] = coerceDate(raw, column.name);
      continue;
    }
    /*
     * Un status es UNO de los tres estados, y nada mas.
     *
     * Igual de estricto que la casilla: guardar un estado que la grilla no sabe
     * pintar deja la celda en blanco o con un color que no corresponde, y el
     * usuario no tiene forma de saber que hay algo ahi. Lo que nunca se toco se
     * guarda como `null` y la grilla lo dibuja como "not started".
     */
    if (column.type === 'status') {
      if (!isStatusValue(raw)) {
        throw new BadRequestException(
          `Value for "${column.name}" must be one of ${STATUS_VALUES.join(', ')}`,
        );
      }
      out[key] = raw;
      continue;
    }
    /*
     * Una `select` guarda el `id` de UNA de sus opciones, y nada mas.
     *
     * Es la misma regla que el status y por la misma razon: un valor que la grilla
     * no sabe dibujar deja la celda en blanco sin que nadie entienda por que. El
     * `id` y no la `label` es lo que se valida justamente para que renombrar una
     * opcion no invalide las filas que ya la usan.
     */
    if (column.type === 'select') {
      if (!isOptionValue(column.options, raw)) {
        const opciones = (column.options ?? []).map((o) => o.label).join(', ');
        throw new BadRequestException(
          `Value for "${column.name}" must be one of ${opciones || 'its options (none defined)'}`,
        );
      }
      out[key] = raw;
      continue;
    }
    out[key] = column.type === 'number' ? coerceNumber(raw, column.name) : String(raw);
  }
  return out;
}

/**
 * Saca del JSON de una fila las claves que ya no son columnas.
 *
 * Sin esto, borrar una columna dejaria su clave colgando en el JSON de cada fila
 * para siempre: invisible en la grilla porque no hay columna que la dibuje, pero
 * ocupando espacio y volviendo si alguien recrea una columna con el mismo id.
 * Se limpia en el servidor y no solo en el cliente, que es donde no se ve.
 *
 * `cambiaColumna` son las columnas cuyo tipo cambio en este PATCH, y es lo unico
 * que toca los valores. Un reorden o un renombrado pasan enteros por aqui y dejan
 * las celdas como estaban.
 *
 * `podarOpcion` son las opciones que YA NO EXISTEN en su columna --al borrar una
 * opcion de una `select`-- con la columna a la que pertenecian. Las celdas que las
 * usaban se vacian, y no se borra la clave: vacia es "sin valor", que es un
 * estado que la grilla sabe dibujar, mientras que la clave desaparece seria una
 * fila a medias sin que nadie lo pidiera.
 *
 * Es la unica vez que un cambio de esquema toca celdas sin que cambie el tipo, y
 * tiene que ser aca y no en el cliente: el `PATCH` de columnas es el unico que
 * ve TODAS las filas, incluidas las que el cliente tiene paginadas y no conoce.
 */
function stripOrphanValues(
  row: TableRowDto,
  keep: Set<string>,
  cambiaColumna: Map<string, { antes: TableColumnDto; despues: TableColumnDto }>,
  podarOpcion: Map<string, Set<string>>,
): string {
  const values: RowValues = {};
  for (const [k, v] of Object.entries(row.values)) {
    if (!keep.has(k)) continue;
    const cambio = cambiaColumna.get(k);
    if (cambio === undefined) {
      if (podarOpcion.get(k)?.has(v as string)) {
        values[k] = null;
        continue;
      }
      values[k] = v;
      continue;
    }
    const convertido = coerceValue(cambio.antes, cambio.despues, v);
    // `undefined` es "este valor no se puede guardar en una columna de este
    // tipo": la clave no se escribe, en vez de quedar con un valor invalido.
    if (convertido !== undefined) values[k] = convertido;
  }
  return JSON.stringify(values);
}

/**
 * Pone un valor en la forma que el tipo de la columna admite.
 *
 * Existe por cambiar el tipo de una columna que ya tiene datos. Sin esto, una
 * columna de texto con "A1" que pasa a `number` guardaria "A1" en una celda
 * numerica: la grilla la dibujaria sin quejarse y al editarla saltaria "Not a
 * number", con un valor invalido guardado en el servidor.
 *
 * Lo numerico que SI se puede leer se conserva --"10" pasa a 10-- para no tirar
 * datos de una columna que se llama "Qty" y tiene 10, 20 y 30 escritos como
 * texto. Lo que de verdad no es un numero se descarta, y ese caso lo avisa el
 * cliente antes de aplicar el cambio.
 *
 * A `checkbox` no se le puede dejar nada: sobrevive unicamente lo que ya es
 * `true`/`false`, porque "algo truthy" no es un estado de una casilla. Todo lo
 * demas se descarta, y el cliente lo cuenta antes de aplicar el cambio.
 *
 * Recibe la columna de ANTES y la de DESPUES porque hay una conversion que
 * necesita las dos: al pasar de `select` a `text` no se puede guardar el `id` de
 * la opcion, porque es un identificador de 36 caracteres que no le dice nada a
 * nadie. Se guarda la etiqueta, que es lo que el usuario estaba viendo.
 *
 * Devuelve `undefined` para "no hay valor guardable", que es distinto de `null`,
 * que es "vacio a proposito".
 */
function coerceValue(
  antes: TableColumnDto | undefined,
  column: TableColumnDto,
  value: CellValue,
): CellValue | undefined {
  if (value === null || value === undefined) return null;
  const { type } = column;
  if (type === 'text') {
    if (antes?.type === 'select' && typeof value === 'string') {
      return antes.options?.find((o) => o.id === value)?.label ?? null;
    }
    return typeof value === 'string' ? value : String(value);
  }
  if (type === 'checkbox') return typeof value === 'boolean' ? value : undefined;
  if (type === 'date') return normalizeDate(value) ?? undefined;
  if (type === 'status') return isStatusValue(value) ? value : undefined;
  if (type === 'select') return isOptionValue(column.options, value) ? value : undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

function toColumns(raw: Record<string, unknown>): TableColumnDto[] {
  const parsed = parseJson(raw.columns as string, [], 'columns');
  return Array.isArray(parsed) ? (parsed as TableColumnDto[]) : [];
}

function toRowDto(raw: Record<string, unknown>): TableRowDto {
  const parsed = parseJson(raw.values as string, {}, 'values');
  return {
    id: raw.id as string,
    values: (parsed ?? {}) as RowValues,
    position: raw.position as number,
  };
}

@Injectable()
export class TablesService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureUser(userId: string) {
    const existing = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      await this.prisma.user.create({
        data: { id: userId, email: 'dev@widget-master.local', password: 'dev' },
      });
    }
  }

  /**
   * Una tabla ajena responde 404 y no 403.
   *
   * Mismo criterio que el calendario: no hay auth, no existe el "sabes que esta
   * ahi pero no puedes tocarla" que proteger, y un 403 haria que el cliente lo
   * tratara como un caso distinto del "no existe", que es el unico real.
   */
  private async findOwned(userId: string, id: string) {
    const table = await this.prisma.dataTable.findUnique({ where: { id } });
    if (!table || table.userId !== userId) {
      throw new NotFoundException('Table not found');
    }
    return table;
  }

  private async findOwnedRow(userId: string, tableId: string, rowId: string) {
    await this.findOwned(userId, tableId);
    const row = await this.prisma.dataRow.findUnique({ where: { id: rowId } });
    if (!row || row.tableId !== tableId) {
      throw new NotFoundException('Row not found');
    }
    return row;
  }

  /**
   * Toca `updatedAt` de la tabla.
   *
   * Editar una fila actualiza `DataRow` y no `DataTable`, asi que el `@updatedAt`
   * automatico no se dispara y la tabla se quedaria con la fecha de su creacion.
   * La lista ordena por `updatedAt`, asi que "la tabla que toque ultima" seria
   * siempre la mas vieja.
   */
  private async touchTable(tableId: string) {
    await this.prisma.dataTable.update({
      where: { id: tableId },
      data: { updatedAt: new Date() },
    });
  }

  /**
   * Resumenes de todas las tablas, sin filas.
   *
   * El `rowCount` es un `_count` y no `rows.length`: esto lo pide el selector de
   * tablas, que solo necesita el numero, y traer las filas seria descargar la
   * base entera para pintar un menu.
   */
  async findAll(userId: string): Promise<TableSummaryDto[]> {
    await this.ensureUser(userId);
    const tables = await this.prisma.dataTable.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { rows: true } } },
    });
    return tables.map((t) => ({
      id: t.id,
      name: t.name,
      rowCount: t._count.rows,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    }));
  }

  /**
   * Una tabla con sus filas ordenadas, capadas a `MAX_ROWS_PER_TABLE`.
   *
   * El `_count` va en la misma query que las filas: son el mismo `_count` de la
   * misma tabla y sale gratis, mientras que contarlas aparte seria un segundo
   * viaje por cada lectura.
   */
  async findOne(userId: string, id: string): Promise<TableDto> {
    const table = await this.prisma.dataTable.findUniqueOrThrow({
      where: { id },
      include: {
        rows: { orderBy: { position: 'asc' }, take: MAX_ROWS_PER_TABLE },
        _count: { select: { rows: true } },
      },
    });
    if (table.userId !== userId) {
      throw new NotFoundException('Table not found');
    }
    return {
      id: table.id,
      name: table.name,
      columns: toColumns(table),
      rows: table.rows.map(toRowDto),
      rowCount: table._count.rows,
      createdAt: table.createdAt.toISOString(),
      updatedAt: table.updatedAt.toISOString(),
    };
  }

  async create(userId: string, dto: CreateTableDto = {}): Promise<TableDto> {
    await this.ensureUser(userId);
    const name = dto.name?.trim() || 'Untitled table';
    /*
     * Sin columnas llega el widget creandose su propia tabla. Se le siembra el
     * esquema por defecto ACA y no en el cliente: el widget puede instanciarse en
     * cinco pestañas a la vez y todas necesitan columnas sin que ninguna haya
     * escrito nada todavia.
     */
    const columns = dto.columns ? normalizeColumns(dto.columns) : defaultTableColumns();
    const table = await this.prisma.dataTable.create({
      data: { userId, name, columns: JSON.stringify(columns) },
    });
    return {
      id: table.id,
      name: table.name,
      columns,
      rows: [],
      rowCount: 0,
      createdAt: table.createdAt.toISOString(),
      updatedAt: table.updatedAt.toISOString(),
    };
  }

  /**
   * Renombra la tabla y/o cambia su esquema.
   *
   * Cambiar columnas y limpiar las filas es UNA operacion y por eso van en la
   * misma transaccion: si el PATCH de la tabla entrara sin el de las filas, un
   * corte a mitad dejaba columnas borradas con las claves huerfanas ya guardadas.
   */
  async update(userId: string, id: string, dto: UpdateTableDto): Promise<TableDto> {
    const table = await this.findOwned(userId, id);

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('Name cannot be empty');
      table.name = name;
    }

    if (dto.columns !== undefined) {
      const columns = normalizeColumns(dto.columns);
      const rows = await this.prisma.dataRow.findMany({ where: { tableId: id } });
      const keep = new Set(columns.map((c) => c.id));
      /*
       * Solo se tocan los valores de las columnas cuyo TIPO cambio, y no los de
       * todas. Reordenar o renombrar tambien pasa por aca, y si normalizara todo
       * cada vez, un simple arrastre de columna reescribiria las 500 filas.
       */
      const previos = new Map(toColumns(table).map((c) => [c.id, c]));
      const cambiaColumna = new Map(
        columns
          .filter((c) => previos.has(c.id) && previos.get(c.id)!.type !== c.type)
          .map((c) => [c.id, { antes: previos.get(c.id)!, despues: c }]),
      );
      /*
       * Las opciones que desaparecieron, por columna. Solo cuenta cuando la
       * columna YA era `select` y lo sigue siendo: si el tipo acaba de cambiar, lo
       * que vale es `cambiaColumna`, que ya descarta lo que no es una opcion.
       */
      const podarOpcion = new Map<string, Set<string>>();
      for (const c of columns) {
        const prev = previos.get(c.id);
        if (!prev || prev.type !== 'select' || c.type !== 'select') continue;
        const vivas = new Set((c.options ?? []).map((o) => o.id));
        const muertas = (prev.options ?? []).filter((o) => !vivas.has(o.id)).map((o) => o.id);
        if (muertas.length) podarOpcion.set(c.id, new Set(muertas));
      }
      await this.prisma.$transaction([
        this.prisma.dataTable.update({
          where: { id },
          data: { name: table.name, columns: JSON.stringify(columns) },
        }),
        ...rows.map((row) =>
          this.prisma.dataRow.update({
            where: { id: row.id },
            data: { values: stripOrphanValues(toRowDto(row), keep, cambiaColumna, podarOpcion) },
          }),
        ),
      ]);
    } else {
      await this.prisma.dataTable.update({ where: { id }, data: { name: table.name } });
    }

    return this.findOne(userId, id);
  }

  /**
   * Devuelve `{ id, name }` y no el registro de Prisma.
   *
   * El crudo lleva `columns` como el string JSON en que esta guardado, o sea que
   * el cliente veria la forma de almacenamiento en un endpoint donde en todos los
   * demas ve `TableColumnDto[]`. Los `DELETE` de las etiquetas devuelven lo mismo
   * por el mismo motivo: lo unico que el cliente necesita de un borrado es saber
   * que se borro y que se borro.
   */
  async remove(userId: string, id: string) {
    const table = await this.findOwned(userId, id);
    // Las filas caen por el `onDelete: Cascade` del schema.
    await this.prisma.dataTable.delete({ where: { id } });
    return { id, name: table.name };
  }

  async createRow(userId: string, tableId: string, dto: CreateTableRowDto = {}) {
    const table = await this.findOwned(userId, tableId);
    const values = normalizeValues(dto.values, toColumns(table));
    /*
     * `position` va al final y no como "el maximo + 1": las posiciones son
     * promedios entre vecinos, asi que el maximo puede ser `0.5` y sumarle uno
     * apuntaria a un hueco arbitrario.
     */
    const last = await this.prisma.dataRow.findFirst({
      where: { tableId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const row = await this.prisma.dataRow.create({
      data: {
        tableId,
        values: JSON.stringify(values),
        position: last ? last.position + 1 : 0,
      },
    });
    await this.touchTable(tableId);
    return toRowDto(row);
  }

  async updateRow(userId: string, tableId: string, rowId: string, dto: UpdateTableRowDto) {
    const table = await this.findOwned(userId, tableId);
    const row = await this.findOwnedRow(userId, tableId, rowId);

    const data: Record<string, unknown> = {};
    if (dto.values !== undefined) {
      /*
       * El objeto entero se VALIDA y se REEMPLAZA, no se fusiona clave por clave.
       * Fusionar deja pasar valores viejos de columnas que el cliente todavia no
       * conoce, y al recargar aparecerian celdas que el usuario ya habia borrado.
       */
      data.values = JSON.stringify(normalizeValues(dto.values, toColumns(table)));
    }
    if (dto.position !== undefined) {
      if (typeof dto.position !== 'number' || !Number.isFinite(dto.position)) {
        throw new BadRequestException('position must be a finite number');
      }
      data.position = dto.position;
    }
    if (!Object.keys(data).length) {
      throw new BadRequestException('Nothing to update');
    }
    const updated = await this.prisma.dataRow.update({ where: { id: row.id }, data });
    await this.touchTable(tableId);
    return toRowDto(updated);
  }

  async removeRow(userId: string, tableId: string, rowId: string) {
    const row = await this.findOwnedRow(userId, tableId, rowId);
    await this.prisma.dataRow.delete({ where: { id: row.id } });
    await this.touchTable(tableId);
    return { id: row.id };
  }
}
