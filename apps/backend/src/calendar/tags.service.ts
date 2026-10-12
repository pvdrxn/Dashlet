import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateTagDto,
  UpdateTagDto,
  TagDto,
  TagColorId,
  isTagColorId,
  nextTagColorId,
  normalizeTagName,
  tagKey,
} from '@widget-master/shared';

const HARDCODED_USER_ID = 'hardcoded-user-id';

function toTagDto(tag: Record<string, unknown>, eventCount: number): TagDto {
  const color = tag.color;
  return {
    id: tag.id as string,
    userId: tag.userId as string,
    name: tag.name as string,
    // Un color guardado que ya no esta en la paleta cae al primero: la paleta
    // puede achicarse en una version futura y una etiqueta vieja no puede
    // quedar sin pintar.
    color: isTagColorId(color) ? (color as TagColorId) : 'blue',
    eventCount,
    createdAt: new Date(tag.createdAt as string).toISOString(),
    updatedAt: new Date(tag.updatedAt as string).toISOString(),
  };
}

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureUser(userId: string) {
    const existing = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      await this.prisma.user.create({
        data: { id: userId, email: 'dev@widget-master.local', password: 'dev' },
      });
    }
  }

  /**
   * Todas las etiquetas con su cuenta de bloques.
   *
   * La cuenta sale de `_count`, no de un count por etiqueta: son dos queries en
   * vez de N+1, y es lo que muestra cada toggle de la fila de filtro. Cuenta
   * solo bloques NO borrados, porque un bloque en la papelera no se puede
   * filtrar desde la vista.
   */
  async findAll(userId: string) {
    await this.ensureUser(userId);
    const tags = await this.prisma.tag.findMany({
      where: { userId },
      orderBy: { nameLower: 'asc' },
      include: {
        _count: {
          select: { events: { where: { deletedAt: null } } },
        },
      },
    });
    return tags.map((t) => toTagDto(t, t._count.events));
  }

  async create(userId: string, dto: CreateTagDto) {
    await this.ensureUser(userId);
    const name = normalizeTagName(dto.name ?? '');
    if (!name) {
      throw new BadRequestException('Tag name cannot be empty');
    }

    const key = tagKey(name);
    const existing = await this.prisma.tag.findUnique({
      where: { userId_nameLower: { userId, nameLower: key } },
    });
    if (existing) {
      /*
       * Crear una etiqueta que ya existe no es un error: el editor ofrece "crear
       * nueva" para cada palabra que no reconoce, y una mayuscula distinta o
       * un espacio de mas llevan al mismo lugar. Devolver la existente hace que
       * el guardado nunca falle por eso y ademas reutiliza el color que ya
       * tenia, en vez de dejar dos casi iguales.
       */
      return toTagDto(existing, await this.countEvents(userId, existing.id));
    }

    const total = await this.prisma.tag.count({ where: { userId } });
    /*
     * Un color que viene pero no esta en la paleta es un ERROR, no una razon
     * para asignar otro. Si el usuario eligio un color y le guardamos uno
     * distinto, la etiqueta queda de un color que nunca eligio y no hay forma de
     * saber cual pidio. La paleta solo se aplica sola cuando NO vino ninguno.
     */
    let color: TagColorId;
    if (dto.color === undefined) {
      color = nextTagColorId(total);
    } else if (isTagColorId(dto.color)) {
      color = dto.color;
    } else {
      throw new BadRequestException(`Unknown tag color "${String(dto.color)}"`);
    }

    const tag = await this.prisma.tag.create({
      data: { userId, name, nameLower: key, color },
    });
    return toTagDto(tag, 0);
  }

  /**
   * Renombra o repinta. UNA operacion para todos los bloques que la usan,
   * que es toda la razon de que la etiqueta sea entidad.
   */
  async update(userId: string, id: string, dto: UpdateTagDto) {
    const existing = await this.prisma.tag.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('Tag not found');
    }

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) {
      const name = normalizeTagName(dto.name);
      if (!name) {
        throw new BadRequestException('Tag name cannot be empty');
      }
      const key = tagKey(name);
      if (key !== existing.nameLower) {
        const clash = await this.prisma.tag.findUnique({
          where: { userId_nameLower: { userId, nameLower: key } },
        });
        if (clash) {
          throw new BadRequestException(`A tag named "${name}" already exists`);
        }
      }
      data.name = name;
      data.nameLower = key;
    }
    if (dto.color !== undefined) {
      if (!isTagColorId(dto.color)) {
        throw new BadRequestException(`Unknown tag color "${String(dto.color)}"`);
      }
      data.color = dto.color;
    }

    const tag = await this.prisma.tag.update({ where: { id }, data });
    return toTagDto(tag, await this.countEvents(userId, id));
  }

  /**
   * Borra la etiqueta. El `Cascade` de `CalendarEventTag.tagId` la saca de
   * todos los bloques: los bloques quedan, solo pierden la etiqueta.
   */
  async remove(userId: string, id: string) {
    const existing = await this.prisma.tag.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('Tag not found');
    }
    await this.prisma.tag.delete({ where: { id } });
    return { id };
  }

  private async countEvents(userId: string, tagId: string) {
    return this.prisma.calendarEvent.count({ where: { userId, tagId, deletedAt: null } });
  }
}