import { Module } from '@nestjs/common';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';

/*
 * Eventos y etiquetas en el mismo modulo a proposito: comparten `PrismaService`
 * y, mas importante, son la misma unidad de trabajo. Crear un bloque con
 * etiquetas toca las dos tablas, y partirlo en dos modulos obligaria a exposing
 * el service del otro para algo que siempre va junto.
 *
 * `PrismaModule` es `@Global`, asi que `PrismaService` esta disponible sin
 * importarlo: por eso `imports` queda vacio, igual que en `TabsModule` y
 * `WidgetsModule`.
 */
@Module({
  imports: [],
  controllers: [CalendarController, TagsController],
  providers: [CalendarService, TagsService],
})
export class CalendarModule {}