import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { WidgetsService } from './widgets.service';
import { CreateWidgetDto, UpdateWidgetDto } from '@widget-master/shared';

@Controller('widgets')
export class WidgetsController {
  constructor(private readonly service: WidgetsService) {}

  @Get()
  async findAll() {
    return this.service.findAll('hardcoded-user-id');
  }

  @Post()
  async create(@Body() dto: CreateWidgetDto) {
    return this.service.create('hardcoded-user-id', dto);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateWidgetDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
