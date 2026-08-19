import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { TabsService } from './tabs.service';
import { CreateTabDto, UpdateTabDto } from '@widget-master/shared';

@Controller('tabs')
export class TabsController {
  constructor(private readonly service: TabsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get('trash')
  findTrash() {
    return this.service.findTrash();
  }

  @Post()
  create(@Body() dto: CreateTabDto) {
    return this.service.create(dto);
  }

  @Post('reorder')
  reorder(@Body('ids') ids: string[]) {
    return this.service.reorder(ids ?? []);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTabDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/restore')
  restore(@Param('id') id: string) {
    return this.service.restore(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Delete(':id/forever')
  removeForever(@Param('id') id: string) {
    return this.service.removeForever(id);
  }
}