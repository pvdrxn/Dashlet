import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { TagsService } from './tags.service';
import { CreateTagDto, UpdateTagDto } from '@widget-master/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/*
 * Rutas bajo `calendar/tags`, al lado de `calendar/events`: las etiquetas
 * pertenecen al calendario, no son un recurso suelto de la app. Si el dia de
 * agregarse algo que use etiquetas (reglas, recordatorios) la jerarquia ya esta
 * puesta.
 */
@Controller('calendar/tags')
@UseGuards(JwtAuthGuard)
export class TagsController {
  constructor(private readonly service: TagsService) {}

  @Get()
  findAll(@Req() req: Request & { user: { sub: string } }) {
    return this.service.findAll(req.user.sub);
  }

  @Post()
  create(@Req() req: Request & { user: { sub: string } }, @Body() dto: CreateTagDto) {
    return this.service.create(req.user.sub, dto);
  }

  @Patch(':id')
  update(@Req() req: Request & { user: { sub: string } }, @Param('id') id: string, @Body() dto: UpdateTagDto) {
    return this.service.update(req.user.sub, id, dto);
  }

  @Delete(':id')
  remove(@Req() req: Request & { user: { sub: string } }, @Param('id') id: string) {
    return this.service.remove(req.user.sub, id);
  }
}