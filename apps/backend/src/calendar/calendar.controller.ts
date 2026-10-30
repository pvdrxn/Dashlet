import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { CreateCalendarEventDto, UpdateCalendarEventDto } from '@widget-master/shared';
import { LOCAL_USER_ID } from '../prisma/prisma.service';

@Controller('calendar/events')
export class CalendarController {
  constructor(private readonly service: CalendarService) {}

  @Get()
  findRange(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.findRange(LOCAL_USER_ID, from, to);
  }

  @Post()
  create(@Body() dto: CreateCalendarEventDto) {
    return this.service.create(LOCAL_USER_ID, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCalendarEventDto) {
    return this.service.update(LOCAL_USER_ID, id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(LOCAL_USER_ID, id);
  }

  @Post(':id/restore')
  restore(@Param('id') id: string) {
    return this.service.restore(LOCAL_USER_ID, id);
  }

  @Delete(':id/forever')
  removeForever(@Param('id') id: string) {
    return this.service.removeForever(LOCAL_USER_ID, id);
  }
}
