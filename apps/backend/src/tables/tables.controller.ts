import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { TablesService } from './tables.service';
import {
  CreateTableDto,
  CreateTableRowDto,
  UpdateTableDto,
  UpdateTableRowDto,
} from '@widget-master/shared';

/*
 * Rutas bajo `tables`. El controller cuelga de `tables` y no de la raiz para que
 * el dia de agregar otro recurso con tablas (inventarios, notas) sea
 * `tables/<recurso>` sin tocar este archivo.
 *
 * `hardcoded-user-id` en vez de pedirlo: no hay auth en la app, mismo criterio que
 * `CalendarController`, `WidgetsController` y `TabsService`.
 *
 * Las filas van anidadas bajo la tabla (`tables/:id/rows`) y no al reves porque la
 * fila no existe sola: sin el esquema de la tabla no se puede validar un valor, y
 * sin el esquema no hay ni id de columna al que guardarlo.
 */
@Controller('tables')
export class TablesController {
  constructor(private readonly service: TablesService) {}

  @Get()
  findAll() {
    return this.service.findAll('hardcoded-user-id');
  }

  @Post()
  create(@Body() dto: CreateTableDto) {
    return this.service.create('hardcoded-user-id', dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne('hardcoded-user-id', id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTableDto) {
    return this.service.update('hardcoded-user-id', id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove('hardcoded-user-id', id);
  }

  @Post(':id/rows')
  createRow(@Param('id') id: string, @Body() dto: CreateTableRowDto) {
    return this.service.createRow('hardcoded-user-id', id, dto);
  }

  @Patch(':id/rows/:rowId')
  updateRow(@Param('id') id: string, @Param('rowId') rowId: string, @Body() dto: UpdateTableRowDto) {
    return this.service.updateRow('hardcoded-user-id', id, rowId, dto);
  }

  @Delete(':id/rows/:rowId')
  removeRow(@Param('id') id: string, @Param('rowId') rowId: string) {
    return this.service.removeRow('hardcoded-user-id', id, rowId);
  }
}
