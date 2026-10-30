import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { TabsService } from './tabs.service';
import { CreateTabDto, UpdateTabDto } from '@widget-master/shared';
import { LOCAL_USER_ID } from '../prisma/prisma.service';

@Controller('tabs')
export class TabsController {
  constructor(private readonly service: TabsService) {}

  @Get()
  findAll() {
    return this.service.findAll(LOCAL_USER_ID);
  }

  @Get('trash')
  findTrash() {
    return this.service.findTrash(LOCAL_USER_ID);
  }

  @Post()
  create(@Body() dto: CreateTabDto) {
    return this.service.create(LOCAL_USER_ID, dto);
  }

  @Post('reorder')
  reorder(@Body('ids') ids: string[]) {
    return this.service.reorder(LOCAL_USER_ID, ids ?? []);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTabDto) {
    return this.service.update(LOCAL_USER_ID, id, dto);
  }

  @Post(':id/restore')
  restore(@Param('id') id: string) {
    return this.service.restore(LOCAL_USER_ID, id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(LOCAL_USER_ID, id);
  }

  @Delete(':id/forever')
  removeForever(@Param('id') id: string) {
    return this.service.removeForever(LOCAL_USER_ID, id);
  }
}
