import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { WidgetsModule } from './widgets/widgets.module';
import { TabsModule } from './tabs/tabs.module';
import { CalendarModule } from './calendar/calendar.module';
import { TablesModule } from './tables/tables.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule, WidgetsModule, TabsModule, CalendarModule, TablesModule],
})
export class AppModule {}
