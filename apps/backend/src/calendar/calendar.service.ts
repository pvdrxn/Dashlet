import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CalendarEventDto,
  CreateCalendarEventDto,
  UpdateCalendarEventDto,
  DEFAULT_DURATION_MIN,
} from '@widget-master/shared';

const MAX_DURATION_MIN = 24 * 60;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Valida que el string sea un `YYYY-MM-DD` que exista de verdad.
 *
 * El regex solo mira la forma, asi que `2026-13-45` lo pasaria. Round-trip por
 * `Date`: se construye la fecha y se vuelve a formatear; si no vuelve igual, el
 * dia no existia. Es la forma barata de rechazar el 31 de abril sin una tabla
 * de dias por mes.
 */
function assertDate(value: string): string {
  if (!DATE_RE.test(value)) {
    throw new BadRequestException(`Invalid date "${value}", expected YYYY-MM-DD`);
  }
  const [y, m, d] = value.split('-').map(Number);
  const probe = new Date(y, m - 1, d);
  const roundtrip = `${probe.getFullYear()}-${String(probe.getMonth() + 1).padStart(2, '0')}-${String(probe.getDate()).padStart(2, '0')}`;
  if (roundtrip !== value) {
    throw new BadRequestException(`Invalid date "${value}"`);
  }
  return value;
}

function assertStartMin(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 1439) {
    throw new BadRequestException('startMin must be an integer between 0 and 1439');
  }
  return value;
}

function assertDuration(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > MAX_DURATION_MIN) {
    throw new BadRequestException(
      `durationMin must be an integer between 1 and ${MAX_DURATION_MIN}`,
    );
  }
  return value;
}

function toEventDto(event: Record<string, unknown>): CalendarEventDto {
  return {
    id: event.id as string,
    userId: event.userId as string,
    date: event.date as string,
    startMin: event.startMin as number,
    durationMin: event.durationMin as number,
    title: event.title as string,
    tagId: (event.tagId as string | null) ?? null,
    deletedAt: event.deletedAt ? new Date(event.deletedAt as string).toISOString() : null,
    createdAt: new Date(event.createdAt as string).toISOString(),
    updatedAt: new Date(event.updatedAt as string).toISOString(),
  };
}

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Valida un id de etiqueta y devuelve el que existe, o `null`.
   *
   * Un id que no existe se IGNORA en vez de tirar error: el editor ofrece
   * "crear nueva" para cada palabra que no reconoce, asi que entre el click y el
   * guardado puede pasar que una etiqueta se haya borrado en otra pestana, y que
   * el guardado del titulo no se caiga por eso vale mas que exigir el id.
   *
   * Distingue tres casos y los tres importan: `undefined` (no se toco la
   * etiqueta, queda fuera del patch), `null` (se la saca, escribe NULL) y un
   * id valido (se asigna).
   */
  private async resolveTagId(
    userId: string,
    tagId: string | null | undefined,
  ): Promise<string | null | undefined> {
    if (tagId === undefined) return undefined;
    if (tagId === null) return null;
    const found = await this.prisma.tag.findFirst({
      where: { id: tagId, userId },
      select: { id: true },
    });
    return found?.id ?? null;
  }

  /**
   * Eventos en un rango de dias, INCLUSIVE en los dos extremos.
   *
   * Es la unica lectura que hace la vista: la grilla mensual pide `01..31` y
   * recibe el mes entero en una query. Por eso el indice es `(userId, date)`.
   */
  async findRange(userId: string, from: string, to: string) {
    assertDate(from);
    assertDate(to);
    if (from > to) {
      throw new BadRequestException('`from` must be before or equal to `to`');
    }
    const events = await this.prisma.calendarEvent.findMany({
      where: {
        userId,
        deletedAt: null,
        date: { gte: from, lte: to },
      },
      orderBy: [{ date: 'asc' }, { startMin: 'asc' }],
    });
    // `tagId` viene en la fila: no hace falta ningun `include`. El nombre y el
    // color los resuelve el cliente desde la lista de etiquetas que ya baja
    // para la fila de filtro.
    return events.map(toEventDto);
  }

  async create(userId: string, dto: CreateCalendarEventDto) {
    const title = dto.title?.trim();
    if (!title) {
      throw new BadRequestException('Title is required');
    }
    const tagId = await this.resolveTagId(userId, dto.tagId);
    const event = await this.prisma.calendarEvent.create({
      data: {
        userId,
        date: assertDate(dto.date),
        startMin: assertStartMin(dto.startMin),
        durationMin: assertDuration(dto.durationMin ?? DEFAULT_DURATION_MIN),
        title,
        // Solo se escribe si vino algo: si el cliente no manda etiqueta, el
        // bloque nace sin ella sin tener que escribir NULL explicito.
        ...(tagId === undefined ? {} : { tagId }),
      },
    });
    return toEventDto(event);
  }

  async update(userId: string, id: string, dto: UpdateCalendarEventDto) {
    const existing = await this.prisma.calendarEvent.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('Calendar event not found');
    }

    const data: Record<string, unknown> = {};
    if (dto.date !== undefined) data.date = assertDate(dto.date);
    if (dto.startMin !== undefined) data.startMin = assertStartMin(dto.startMin);
    if (dto.durationMin !== undefined) data.durationMin = assertDuration(dto.durationMin);
    if (dto.title !== undefined) {
      const title = dto.title.trim();
      if (!title) {
        throw new BadRequestException('Title cannot be empty');
      }
      data.title = title;
    }
    /*
     * La etiqueta se REEMPLAZA, no se agrega: es lo que espera un editor, donde
     * cambiar de etiqueta tiene que hacer desaparecer la anterior.
     *
     * `null` la saca y `undefined` no toca el campo -- por eso el chequeo es por
     * `!== undefined` y no por truthiness, que trataria `null` como "no vino".
     */
    const tagId = await this.resolveTagId(userId, dto.tagId);
    if (tagId !== undefined) data.tagId = tagId;

    const event = await this.prisma.calendarEvent.update({ where: { id }, data });
    return toEventDto(event);
  }

  async remove(userId: string, id: string) {
    const existing = await this.prisma.calendarEvent.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('Calendar event not found');
    }
    const event = await this.prisma.calendarEvent.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return toEventDto(event);
  }

  async restore(userId: string, id: string) {
    const existing = await this.prisma.calendarEvent.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('Calendar event not found');
    }
    /*
     * El soft delete no toca `tagId`, asi que el bloque vuelve con su etiqueta.
     * Ahora sale gratis -- es una columna de la misma fila -- donde antes habia
     * que releer la tabla puente para no reportarla vacia.
     */
    const event = await this.prisma.calendarEvent.update({
      where: { id },
      data: { deletedAt: null },
    });
    return toEventDto(event);
  }

  async removeForever(userId: string, id: string) {
    const existing = await this.prisma.calendarEvent.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('Calendar event not found');
    }
    return this.prisma.calendarEvent.delete({ where: { id } });
  }
}
