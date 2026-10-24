import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { TabsService } from './tabs.service';
import { CreateTabDto, UpdateTabDto } from '@widget-master/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('tabs')
@UseGuards(JwtAuthGuard)
export class TabsController {
  constructor(private readonly service: TabsService) {}

  @Get()
  findAll(@Req() req: Request & { user: { sub: string } }) {
    return this.service.findAll(req.user.sub);
  }

  @Get('trash')
  findTrash(@Req() req: Request & { user: { sub: string } }) {
    return this.service.findTrash(req.user.sub);
  }

  @Post()
  create(@Req() req: Request & { user: { sub: string } }, @Body() dto: CreateTabDto) {
    return this.service.create(req.user.sub, dto);
  }

  @Post('reorder')
  reorder(@Req() req: Request & { user: { sub: string } }, @Body('ids') ids: string[]) {
    return this.service.reorder(req.user.sub, ids ?? []);
  }

  @Patch(':id')
  update(@Req() req: Request & { user: { sub: string } }, @Param('id') id: string, @Body() dto: UpdateTabDto) {
    return this.service.update(req.user.sub, id, dto);
  }

  @Post(':id/restore')
  restore(@Req() req: Request & { user: { sub: string } }, @Param('id') id: string) {
    return this.service.restore(req.user.sub, id);
  }

  @Delete(':id')
  remove(@Req() req: Request & { user: { sub: string } }, @Param('id') id: string) {
    return this.service.remove(req.user.sub, id);
  }

  @Delete(':id/forever')
  removeForever(@Req() req: Request & { user: { sub: string } }, @Param('id') id: string) {
    return this.service.removeForever(req.user.sub, id);
  }
}