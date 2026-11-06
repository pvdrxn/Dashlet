import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { WidgetsModule } from './widgets/widgets.module';
import { TabsModule } from './tabs/tabs.module';
import { CalendarModule } from './calendar/calendar.module';
import { TablesModule } from './tables/tables.module';
import { StatsModule } from './stats/stats.module';
import { NotesModule } from './notes/notes.module';

@Module({
  imports: [
    PrismaModule,
    WidgetsModule,
    TabsModule,
    CalendarModule,
    TablesModule,
    StatsModule,
    NotesModule,
  ],
})
export class AppModule {}
