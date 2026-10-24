import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTabDto, UpdateTabDto, TabDto } from '@widget-master/shared';

const DEFAULT_TAB_NAME = 'Nuevo entorno';

function toTabDto(tab: Record<string, unknown>, widgetCount?: number): TabDto {
  return {
    id: tab.id as string,
    userId: tab.userId as string,
    name: tab.name as string,
    order: tab.order as number,
    widgetCount,
    deletedAt: tab.deletedAt ? new Date(tab.deletedAt as string).toISOString() : null,
  };
}

@Injectable()
export class TabsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string) {
    const tabs = await this.prisma.tab.findMany({
      where: { userId, deletedAt: null },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { widgets: { where: { deletedAt: null } } } } },
    });
    return tabs.map((t) => toTabDto(t, t._count.widgets));
  }

  async findTrash(userId: string) {
    const tabs = await this.prisma.tab.findMany({
      where: { userId, deletedAt: { not: null } },
      orderBy: { deletedAt: 'desc' },
      include: { _count: { select: { widgets: { where: { deletedAt: null } } } } },
    });
    return tabs.map((t) => toTabDto(t, t._count.widgets));
  }

  async create(userId: string, dto: CreateTabDto) {
    const maxOrder = await this.prisma.tab.aggregate({
      where: { userId, deletedAt: null },
      _max: { order: true },
    });
    const tab = await this.prisma.tab.create({
      data: {
        userId,
        name: dto.name?.trim() || 'Nueva pestaña',
        order: (maxOrder._max.order ?? -1) + 1,
      },
    });
    return toTabDto(tab, 0);
  }

  async update(userId: string, id: string, dto: UpdateTabDto) {
    const existing = await this.prisma.tab.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('Tab not found');
    }
    const name = dto.name?.trim();
    if (name !== undefined && name === '') {
      throw new BadRequestException('Tab name cannot be empty');
    }
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (dto.order !== undefined) data.order = Math.max(0, Math.floor(dto.order));
    const tab = await this.prisma.tab.update({
      where: { id },
      data,
    });
    return toTabDto(tab);
  }

  async reorder(userId: string, ids: string[]) {
    const tabs = await this.prisma.tab.findMany({
      where: { id: { in: ids }, userId, deletedAt: null },
    });
    if (tabs.length !== ids.length) {
      throw new NotFoundException('One or more tabs not found');
    }
    await this.prisma.$transaction(
      ids.map((id, order) =>
        this.prisma.tab.update({ where: { id }, data: { order } }),
      ),
    );
    return { ids };
  }

  async remove(userId: string, id: string) {
    const existing = await this.prisma.tab.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('Tab not found');
    }
    const activeCount = await this.prisma.tab.count({
      where: { userId, deletedAt: null },
    });
    if (activeCount <= 1) {
      throw new BadRequestException('Cannot delete the last tab');
    }
    const tab = await this.prisma.tab.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return toTabDto(tab);
  }

  async restore(userId: string, id: string) {
    const existing = await this.prisma.tab.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('Tab not found');
    }
    const tab = await this.prisma.tab.update({
      where: { id },
      data: { deletedAt: null },
    });
    return toTabDto(tab);
  }

  async removeForever(userId: string, id: string) {
    const existing = await this.prisma.tab.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('Tab not found');
    }
    await this.prisma.widget.deleteMany({ where: { tabId: id } });
    return this.prisma.tab.delete({ where: { id } });
  }
}