import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { CreateCalendarEventDto, UpdateCalendarEventDto } from '@widget-master/shared';

/*
 * Rutas bajo `calendar/events`. El controller cuelga de `calendar` y no de la
 * raiz para que el dia de agregar otro recurso del calendario (recordatorios,
 * journals) sea `calendar/<recurso>` sin tocar este archivo.
 *
 * `hardcoded-user-id` en vez de pedirlo: no hay auth en la app, es el mismo
 * criterio que usan WidgetsController y TabsService.
 */
@Controller('calendar/events')
export class CalendarController {
  constructor(private readonly service: CalendarService) {}

  @Get()
  findRange(@Query('from') from: string, @Query('to') to: string) {
    return this.service.findRange('hardcoded-user-id', from, to);
  }

  @Post()
  create(@Body() dto: CreateCalendarEventDto) {
    return this.service.create('hardcoded-user-id', dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCalendarEventDto) {
    return this.service.update('hardcoded-user-id', id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove('hardcoded-user-id', id);
  }

  @Post(':id/restore')
  restore(@Param('id') id: string) {
    return this.service.restore('hardcoded-user-id', id);
  }

  @Delete(':id/forever')
  removeForever(@Param('id') id: string) {
    return this.service.removeForever('hardcoded-user-id', id);
  }
}
