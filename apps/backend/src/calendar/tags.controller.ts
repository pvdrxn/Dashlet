import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { TagsService } from './tags.service';
import { CreateTagDto, UpdateTagDto } from '@widget-master/shared';
import { LOCAL_USER_ID } from '../prisma/prisma.service';

@Controller('calendar/tags')
export class TagsController {
  constructor(private readonly service: TagsService) {}

  @Get()
  findAll() {
    return this.service.findAll(LOCAL_USER_ID);
  }

  @Post()
  create(@Body() dto: CreateTagDto) {
    return this.service.create(LOCAL_USER_ID, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTagDto) {
    return this.service.update(LOCAL_USER_ID, id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(LOCAL_USER_ID, id);
  }
}
