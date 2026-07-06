import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWidgetDto, UpdateWidgetDto, WidgetDto } from '@widget-master/shared';

const HARDCODED_USER_ID = 'hardcoded-user-id';

function parseJsonField<T>(value: string | null, fallback: T): T {
  try {
    return JSON.parse(value ?? 'null') ?? fallback;
  } catch {
    return fallback;
  }
}

function toWidgetDto(widget: Record<string, unknown>): WidgetDto {
  return {
    ...widget,
    config: parseJsonField(widget.config as string, {}),
    position: parseJsonField(widget.position as string, { x: 0, y: 0, w: 300, h: 200 }),
  } as WidgetDto;
}

@Injectable()
export class WidgetsService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureUser(userId: string) {
    const existing = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      await this.prisma.user.create({
        data: { id: userId, email: 'dev@widget-master.local', password: 'dev' },
      });
    }
  }

  async findAll(userId: string) {
    const widgets = await this.prisma.widget.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return widgets.map(toWidgetDto);
  }

  async create(userId: string, dto: CreateWidgetDto) {
    await this.ensureUser(userId);
    const defaultPosition = { x: 100, y: 100, w: 300, h: 250 };
    const widget = await this.prisma.widget.create({
      data: {
        userId,
        type: dto.type,
        config: JSON.stringify(dto.config ?? {}),
        position: JSON.stringify(dto.position ?? defaultPosition),
      },
    });
    return toWidgetDto(widget);
  }

  async update(id: string, dto: UpdateWidgetDto) {
    const existing = await this.prisma.widget.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Widget not found');

    const data: Record<string, unknown> = {};
    if (dto.config !== undefined) data.config = JSON.stringify(dto.config);
    if (dto.position !== undefined) data.position = JSON.stringify(dto.position);
    if (dto.zIndex !== undefined) data.zIndex = dto.zIndex;

    const widget = await this.prisma.widget.update({ where: { id }, data });
    return toWidgetDto(widget);
  }

  async remove(id: string) {
    const existing = await this.prisma.widget.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Widget not found');

    return this.prisma.widget.delete({ where: { id } });
  }
}
