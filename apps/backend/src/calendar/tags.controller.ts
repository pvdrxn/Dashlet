import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { TagsService } from './tags.service';
import { CreateTagDto, UpdateTagDto } from '@widget-master/shared';

/*
 * Rutas bajo `calendar/tags`, al lado de `calendar/events`: las etiquetas
 * pertenecen al calendario, no son un recurso suelto de la app. Si el dia de
 * agregarse algo que use etiquetas (reglas, recordatorios) la jerarquia ya esta
 * puesta.
 *
 * `hardcoded-user-id` por el mismo criterio que el resto: no hay auth.
 */
@Controller('calendar/tags')
export class TagsController {
  constructor(private readonly service: TagsService) {}

  @Get()
  findAll() {
    return this.service.findAll('hardcoded-user-id');
  }

  @Post()
  create(@Body() dto: CreateTagDto) {
    return this.service.create('hardcoded-user-id', dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTagDto) {
    return this.service.update('hardcoded-user-id', id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove('hardcoded-user-id', id);
  }
}