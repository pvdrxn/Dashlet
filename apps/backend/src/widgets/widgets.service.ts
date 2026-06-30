import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWidgetDto, UpdateWidgetDto } from '@widget-master/shared';
import { Prisma } from '@prisma/client';

const HARDCODED_USER_ID = 'hardcoded-user-id';

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
    return this.prisma.widget.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(userId: string, dto: CreateWidgetDto) {
    await this.ensureUser(userId);
    const defaultPosition = { x: 100, y: 100, w: 300, h: 250 };
    return this.prisma.widget.create({
      data: {
        userId,
        type: dto.type,
        config: (dto.config ?? {}) as unknown as Prisma.InputJsonValue,
        position: (dto.position ?? defaultPosition) as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async update(id: string, dto: UpdateWidgetDto) {
    const existing = await this.prisma.widget.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Widget not found');

    const data: Prisma.WidgetUpdateInput = {};
    if (dto.config !== undefined) data.config = dto.config as unknown as Prisma.InputJsonValue;
    if (dto.position !== undefined) data.position = dto.position as unknown as Prisma.InputJsonValue;
    if (dto.zIndex !== undefined) data.zIndex = dto.zIndex;

    return this.prisma.widget.update({ where: { id }, data });
  }

  async remove(id: string) {
    const existing = await this.prisma.widget.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Widget not found');

    return this.prisma.widget.delete({ where: { id } });
  }
}
