import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { WidgetsService } from './widgets.service';
import { CreateWidgetDto, UpdateWidgetDto } from '@widget-master/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('widgets')
@UseGuards(JwtAuthGuard)
export class WidgetsController {
  constructor(private readonly service: WidgetsService) {}

  @Get()
  async findAll(@Req() req: Request & { user: { sub: string } }, @Query('tabId') tabId?: string) {
    return this.service.findAll(req.user.sub, tabId);
  }

  @Get('trash')
  async findTrash(@Req() req: Request & { user: { sub: string } }) {
    return this.service.findTrash(req.user.sub);
  }

  @Post()
  async create(@Req() req: Request & { user: { sub: string } }, @Body() dto: CreateWidgetDto) {
    return this.service.create(req.user.sub, dto);
  }

  @Patch(':id')
  async update(@Req() req: Request & { user: { sub: string } }, @Param('id') id: string, @Body() dto: UpdateWidgetDto) {
    return this.service.update(req.user.sub, id, dto);
  }

  @Post(':id/restore')
  async restore(@Req() req: Request & { user: { sub: string } }, @Param('id') id: string) {
    return this.service.restore(req.user.sub, id);
  }

  @Delete(':id')
  async remove(@Req() req: Request & { user: { sub: string } }, @Param('id') id: string) {
    return this.service.remove(req.user.sub, id);
  }

  @Delete(':id/forever')
  async removeForever(@Req() req: Request & { user: { sub: string } }, @Param('id') id: string) {
    return this.service.removeForever(req.user.sub, id);
  }
}
