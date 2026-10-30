import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import { join } from 'path';

export const LOCAL_USER_ID = 'local-user';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    if (process.env.NODE_ENV !== 'production') {
      const prismaDir = join(__dirname, '..', '..', 'prisma');
      try {
        execSync('npx prisma db push --skip-generate', { cwd: prismaDir, stdio: 'pipe' });
      } catch (err) {
        console.error('prisma db push error:', err);
      }
    }
    await this.$connect();
    await this.ensureLocalUser();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  private async ensureLocalUser() {
    try {
      // 1. Ensure local-user exists
      await this.user.upsert({
        where: { id: LOCAL_USER_ID },
        update: {},
        create: {
          id: LOCAL_USER_ID,
          email: 'local@dashlet.app',
          username: 'Dashlet',
          password: '',
          language: 'es',
        },
      });

      // 2. Migrate existing tabs from any other user
      await this.tab.updateMany({
        where: { userId: { not: LOCAL_USER_ID } },
        data: { userId: LOCAL_USER_ID },
      });

      // 3. Migrate calendar events
      await this.calendarEvent.updateMany({
        where: { userId: { not: LOCAL_USER_ID } },
        data: { userId: LOCAL_USER_ID },
      });

      // 4. Migrate tags safely (handle @@unique([userId, nameLower]))
      const foreignTags = await this.tag.findMany({
        where: { userId: { not: LOCAL_USER_ID } },
      });
      for (const tag of foreignTags) {
        const existing = await this.tag.findUnique({
          where: {
            userId_nameLower: {
              userId: LOCAL_USER_ID,
              nameLower: tag.nameLower,
            },
          },
        });
        if (!existing) {
          await this.tag.update({
            where: { id: tag.id },
            data: { userId: LOCAL_USER_ID },
          });
        } else {
          await this.calendarEvent.updateMany({
            where: { tagId: tag.id },
            data: { tagId: existing.id },
          });
          await this.tag.delete({ where: { id: tag.id } });
        }
      }

      // 5. Migrate data tables
      await this.dataTable.updateMany({
        where: { userId: { not: LOCAL_USER_ID } },
        data: { userId: LOCAL_USER_ID },
      });

      // 6. Ensure at least one active tab exists
      const activeTabsCount = await this.tab.count({
        where: { userId: LOCAL_USER_ID, deletedAt: null },
      });
      if (activeTabsCount === 0) {
        await this.tab.create({
          data: {
            userId: LOCAL_USER_ID,
            name: 'New tab',
            order: 0,
          },
        });
      }
    } catch (err) {
      console.error('Error ensuring local user and migrating data:', err);
    }
  }
}
