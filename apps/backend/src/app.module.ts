import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { WidgetsModule } from './widgets/widgets.module';

@Module({
  imports: [PrismaModule, WidgetsModule],
})
export class AppModule {}
