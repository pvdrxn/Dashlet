import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { WidgetsService } from './widgets.service';
import { CreateWidgetDto, UpdateWidgetDto } from '@widget-master/shared';
import { LOCAL_USER_ID } from '../prisma/prisma.service';

@Controller('widgets')
export class WidgetsController {
  constructor(private readonly service: WidgetsService) {}

  @Get()
  async findAll(@Query('tabId') tabId?: string) {
    return this.service.findAll(LOCAL_USER_ID, tabId);
  }

  @Get('trash')
  async findTrash() {
    return this.service.findTrash(LOCAL_USER_ID);
  }

  @Post()
  async create(@Body() dto: CreateWidgetDto) {
    return this.service.create(LOCAL_USER_ID, dto);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateWidgetDto) {
    return this.service.update(LOCAL_USER_ID, id, dto);
  }

  @Post(':id/restore')
  async restore(@Param('id') id: string) {
    return this.service.restore(LOCAL_USER_ID, id);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.service.remove(LOCAL_USER_ID, id);
  }

  @Delete(':id/forever')
  async removeForever(@Param('id') id: string) {
    return this.service.removeForever(LOCAL_USER_ID, id);
  }
}
