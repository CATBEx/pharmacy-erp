import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../common/types/jwt-payload.js';

// Same audience as the rest of the cost-bearing pages: admin + manager see profit/cash
// numbers, salesmen never do (they don't get a dashboard route on the frontend at all).
@Roles('pharmacy_admin', 'manager')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  summary(@CurrentUser() user: AuthUser) {
    return this.dashboardService.summary(user.pharmacyId!);
  }

  @Get('trend')
  trend(@CurrentUser() user: AuthUser, @Query('days') days?: string) {
    const n = days === '30' ? 30 : 7;
    return this.dashboardService.trend(user.pharmacyId!, n);
  }

  @Get('recent-sales')
  recentSales(@CurrentUser() user: AuthUser) {
    return this.dashboardService.recentSales(user.pharmacyId!, 5);
  }
}
