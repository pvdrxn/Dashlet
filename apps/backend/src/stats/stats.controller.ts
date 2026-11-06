import { Controller, Get, Query } from '@nestjs/common';
import { StatsService } from './stats.service';
import { LOCAL_USER_ID } from '../prisma/prisma.service';
import { StatsOverviewResponseDto } from '@widget-master/shared';

@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('overview')
  async getOverview(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<StatsOverviewResponseDto> {
    return this.statsService.getOverview(LOCAL_USER_ID, from, to);
  }
}
