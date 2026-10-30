import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { TablesService } from './tables.service';
import {
  CreateTableDto,
  CreateTableRowDto,
  UpdateTableDto,
  UpdateTableRowDto,
} from '@widget-master/shared';
import { LOCAL_USER_ID } from '../prisma/prisma.service';

@Controller('tables')
export class TablesController {
  constructor(private readonly service: TablesService) {}

  @Get()
  findAll() {
    return this.service.findAll(LOCAL_USER_ID);
  }

  @Post()
  create(@Body() dto: CreateTableDto) {
    return this.service.create(LOCAL_USER_ID, dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(LOCAL_USER_ID, id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTableDto) {
    return this.service.update(LOCAL_USER_ID, id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(LOCAL_USER_ID, id);
  }

  @Post(':id/rows')
  createRow(@Param('id') id: string, @Body() dto: CreateTableRowDto) {
    return this.service.createRow(LOCAL_USER_ID, id, dto);
  }

  @Patch(':id/rows/:rowId')
  updateRow(@Param('id') id: string, @Param('rowId') rowId: string, @Body() dto: UpdateTableRowDto) {
    return this.service.updateRow(LOCAL_USER_ID, id, rowId, dto);
  }

  @Delete(':id/rows/:rowId')
  removeRow(@Param('id') id: string, @Param('rowId') rowId: string) {
    return this.service.removeRow(LOCAL_USER_ID, id, rowId);
  }
}
