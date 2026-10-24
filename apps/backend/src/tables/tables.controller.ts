import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { TablesService } from './tables.service';
import {
  CreateTableDto,
  CreateTableRowDto,
  UpdateTableDto,
  UpdateTableRowDto,
} from '@widget-master/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/*
 * Rutas bajo `tables`. El controller cuelga de `tables` y no de la raiz para que
 * el dia de agregar otro recurso con tablas (inventarios, notas) sea
 * `tables/<recurso>` sin tocar este archivo.
 *
 * Las filas van anidadas bajo la tabla (`tables/:id/rows`) y no al reves porque la
 * fila no existe sola: sin el esquema de la tabla no se puede validar un valor, y
 * sin el esquema no hay ni id de columna al que guardarlo.
 */
@Controller('tables')
@UseGuards(JwtAuthGuard)
export class TablesController {
  constructor(private readonly service: TablesService) {}

  @Get()
  findAll(@Req() req: Request & { user: { sub: string } }) {
    return this.service.findAll(req.user.sub);
  }

  @Post()
  create(@Req() req: Request & { user: { sub: string } }, @Body() dto: CreateTableDto) {
    return this.service.create(req.user.sub, dto);
  }

  @Get(':id')
  findOne(@Req() req: Request & { user: { sub: string } }, @Param('id') id: string) {
    return this.service.findOne(req.user.sub, id);
  }

  @Patch(':id')
  update(@Req() req: Request & { user: { sub: string } }, @Param('id') id: string, @Body() dto: UpdateTableDto) {
    return this.service.update(req.user.sub, id, dto);
  }

  @Delete(':id')
  remove(@Req() req: Request & { user: { sub: string } }, @Param('id') id: string) {
    return this.service.remove(req.user.sub, id);
  }

  @Post(':id/rows')
  createRow(@Req() req: Request & { user: { sub: string } }, @Param('id') id: string, @Body() dto: CreateTableRowDto) {
    return this.service.createRow(req.user.sub, id, dto);
  }

  @Patch(':id/rows/:rowId')
  updateRow(@Req() req: Request & { user: { sub: string } }, @Param('id') id: string, @Param('rowId') rowId: string, @Body() dto: UpdateTableRowDto) {
    return this.service.updateRow(req.user.sub, id, rowId, dto);
  }

  @Delete(':id/rows/:rowId')
  removeRow(@Req() req: Request & { user: { sub: string } }, @Param('id') id: string, @Param('rowId') rowId: string) {
    return this.service.removeRow(req.user.sub, id, rowId);
  }
}
