import { Module } from '@nestjs/common';
import { TablesController } from './tables.controller';
import { TablesService } from './tables.service';

/*
 * Tablas de datos propias del usuario: el esquema (`DataTable.columns`) y las
 * filas (`DataRow`) son la misma unidad de trabajo, asi que van juntos en un
 * modulo. Partirlos obligaria a exponer el service del otro para algo que
 * siempre sale junto --validar un valor necesita el esquema--.
 *
 * `PrismaModule` es `@Global`, asi que `PrismaService` esta disponible sin
 * importarlo: por eso `imports` queda vacio, igual que en `CalendarModule`,
 * `TabsModule` y `WidgetsModule`.
 */
@Module({
  imports: [],
  controllers: [TablesController],
  providers: [TablesService],
})
export class TablesModule {}
