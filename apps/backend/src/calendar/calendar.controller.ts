import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { CreateCalendarEventDto, UpdateCalendarEventDto } from '@widget-master/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/*
 * Rutas bajo `calendar/events`. El controller cuelga de `calendar` y no de la
 * raiz para que el dia de agregar otro recurso del calendario (recordatorios,
 * journals) sea `calendar/<recurso>` sin tocar este archivo.
 */
@Controller('calendar/events')
@UseGuards(JwtAuthGuard)
export class CalendarController {
  constructor(private readonly service: CalendarService) {}

  @Get()
  findRange(@Req() req: Request & { user: { sub: string } }, @Query('from') from: string, @Query('to') to: string) {
    return this.service.findRange(req.user.sub, from, to);
  }

  @Post()
  create(@Req() req: Request & { user: { sub: string } }, @Body() dto: CreateCalendarEventDto) {
    return this.service.create(req.user.sub, dto);
  }

  @Patch(':id')
  update(@Req() req: Request & { user: { sub: string } }, @Param('id') id: string, @Body() dto: UpdateCalendarEventDto) {
    return this.service.update(req.user.sub, id, dto);
  }

  @Delete(':id')
  remove(@Req() req: Request & { user: { sub: string } }, @Param('id') id: string) {
    return this.service.remove(req.user.sub, id);
  }

  @Post(':id/restore')
  restore(@Req() req: Request & { user: { sub: string } }, @Param('id') id: string) {
    return this.service.restore(req.user.sub, id);
  }

  @Delete(':id/forever')
  removeForever(@Req() req: Request & { user: { sub: string } }, @Param('id') id: string) {
    return this.service.removeForever(req.user.sub, id);
  }
}
