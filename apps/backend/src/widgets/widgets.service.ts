import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWidgetDto, UpdateWidgetDto, WidgetDto } from '@widget-master/shared';

const HARDCODED_USER_ID = 'hardcoded-user-id';
const TRASH_RETENTION_DAYS = 30;
const TRASH_PURGE_INTERVAL_MS = 60 * 60 * 1000;

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
    deletedAt: widget.deletedAt ? new Date(widget.deletedAt as string).toISOString() : null,
  } as WidgetDto;
}

@Injectable()
export class WidgetsService implements OnModuleInit {
  private purgeTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.purgeExpired().catch(() => {});
    this.purgeTimer = setInterval(() => {
      this.purgeExpired().catch(() => {});
    }, TRASH_PURGE_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.purgeTimer) clearInterval(this.purgeTimer);
  }

  private async ensureUser(userId: string) {
    const existing = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      await this.prisma.user.create({
        data: { id: userId, email: 'dev@widget-master.local', password: 'dev' },
      });
    }
  }

  private async resolveTabId(userId: string, tabId?: string): Promise<string | null> {
    if (tabId) {
      const tab = await this.prisma.tab.findUnique({ where: { id: tabId } });
      if (tab && tab.userId === userId && !tab.deletedAt) return tab.id;
      return null;
    }
    const defaultTab = await this.prisma.tab.findFirst({
      where: { userId, deletedAt: null },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    return defaultTab?.id ?? null;
  }

  private activeTabFilter() {
    return { OR: [{ tab: { deletedAt: null } }, { tabId: null }] };
  }

  private async purgeExpired() {
    const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    await this.prisma.widget.deleteMany({ where: { deletedAt: { lt: cutoff } } });
  }

  async findAll(userId: string, tabId?: string) {
    await this.purgeExpired();
    const widgets = await this.prisma.widget.findMany({
      where: {
        userId,
        deletedAt: null,
        ...this.activeTabFilter(),
        ...(tabId ? { tabId } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
    return widgets.map(toWidgetDto);
  }

  async findTrash(userId: string) {
    await this.purgeExpired();
    const widgets = await this.prisma.widget.findMany({
      where: {
        userId,
        deletedAt: { not: null },
        ...this.activeTabFilter(),
      },
      orderBy: { deletedAt: 'desc' },
    });
    return widgets.map(toWidgetDto);
  }

  async create(userId: string, dto: CreateWidgetDto) {
    await this.ensureUser(userId);
    const tabId = await this.resolveTabId(userId, dto.tabId);
    const defaultPosition = { x: 100, y: 100, w: 300, h: 250 };
    const widget = await this.prisma.widget.create({
      data: {
        userId,
        tabId,
        type: dto.type,
        config: JSON.stringify(dto.config ?? {}),
        position: JSON.stringify(dto.position ?? defaultPosition),
      },
    });
    return toWidgetDto(widget);
  }

  async update(userId: string, id: string, dto: UpdateWidgetDto) {
    const existing = await this.prisma.widget.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Widget not found');

    const data: Record<string, unknown> = {};
    if (dto.config !== undefined) data.config = JSON.stringify(dto.config);
    if (dto.position !== undefined) data.position = JSON.stringify(dto.position);
    if (dto.zIndex !== undefined) data.zIndex = dto.zIndex;
    if (dto.tabId !== undefined) {
      if (dto.tabId === null) {
        data.tabId = null;
      } else {
        const tabId = await this.resolveTabId(userId, dto.tabId);
        if (!tabId) throw new NotFoundException('Tab not found');
        data.tabId = tabId;
      }
    }

    const widget = await this.prisma.widget.update({ where: { id }, data });
    return toWidgetDto(widget);
  }

  async remove(id: string) {
    const existing = await this.prisma.widget.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Widget not found');

    const widget = await this.prisma.widget.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return toWidgetDto(widget);
  }

  async restore(id: string) {
    const existing = await this.prisma.widget.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Widget not found');

    const widget = await this.prisma.widget.update({
      where: { id },
      data: { deletedAt: null },
    });
    return toWidgetDto(widget);
  }

  async removeForever(id: string) {
    const existing = await this.prisma.widget.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Widget not found');

    return this.prisma.widget.delete({ where: { id } });
  }
}
