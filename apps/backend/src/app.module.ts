import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { WidgetsModule } from './widgets/widgets.module';
import { TabsModule } from './tabs/tabs.module';

@Module({
  imports: [PrismaModule, WidgetsModule, TabsModule],
})
export class AppModule {}
