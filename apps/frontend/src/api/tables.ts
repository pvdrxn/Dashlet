import type {
  CreateTableDto,
  CreateTableRowDto,
  TableDto,
  TableRowDto,
  TableSummaryDto,
  UpdateTableDto,
  UpdateTableRowDto,
} from '@widget-master/shared';
import { request } from './request';

const BASE = import.meta.env.PROD ? 'http://localhost:3001/api/v1/tables' : '/api/v1/tables';

/**
 * Los resumenes de todas las tablas, sin filas.
 *
 * Es la unica lectura de la lista: el selector de tablas de la vista y el "¿esta
 * tabla ya existe?" del widget se resuelven con esto, asi que ninguno tiene que
 * bajar filas que no va a dibujar.
 */
export async function fetchTables(): Promise<TableSummaryDto[]> {
  return request<TableSummaryDto[]>(BASE);
}

/**
 * Una tabla con sus columnas y sus filas.
 *
 * Trae el esquema y los datos JUNTOS a proposito: la grilla siempre dibuja uno
 * contra el otro, y separarlos obligaria a dos requests y a un estado
 * intermediario en el que hay columnas sin filas o filas sin columnas.
 *
 * `rows` viene capado en el servidor a `MAX_ROWS_PER_TABLE`; `rowCount` trae el
 * total real para poder avisar cuando no se esta viendo todo.
 */
export async function fetchTable(id: string): Promise<TableDto> {
  return request<TableDto>(`${BASE}/${id}`);
}

/** Sin `columns`, el servidor siembra `Name` y `Value`. Es el caso del widget al crearse solo. */
export async function createTable(dto: CreateTableDto = {}): Promise<TableDto> {
  return request<TableDto>(BASE, {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

/**
 * Renombra la tabla y/o reemplaza su esquema entero.
 *
 * Mandar `columns` REESCRIBE el esquema, no lo fusiona: es la lista completa de
 * columnas en su orden final. El servidor limpia en la misma transaccion los
 * valores de las columnas que desaparecieron.
 */
export async function updateTable(id: string, dto: UpdateTableDto): Promise<TableDto> {
  return request<TableDto>(`${BASE}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(dto),
  });
}

export async function deleteTable(id: string): Promise<{ id: string; name: string }> {
  return request<{ id: string; name: string }>(`${BASE}/${id}`, { method: 'DELETE' });
}

export async function createTableRow(
  tableId: string,
  dto: CreateTableRowDto = {},
): Promise<TableRowDto> {
  return request<TableRowDto>(`${BASE}/${tableId}/rows`, {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

/**
 * Edita una celda o mueve la fila.
 *
 * `values` REEMPLAZA el objeto entero, no lo fusiona: mandando solo la celda que
 * cambio se borrarian las demas de esa fila. Quien llama tiene que mandar las
 * filas completas.
 */
export async function updateTableRow(
  tableId: string,
  rowId: string,
  dto: UpdateTableRowDto,
): Promise<TableRowDto> {
  return request<TableRowDto>(`${BASE}/${tableId}/rows/${rowId}`, {
    method: 'PATCH',
    body: JSON.stringify(dto),
  });
}

export async function deleteTableRow(tableId: string, rowId: string): Promise<{ id: string }> {
  return request<{ id: string }>(`${BASE}/${tableId}/rows/${rowId}`, { method: 'DELETE' });
}
