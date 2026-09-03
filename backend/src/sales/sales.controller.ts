import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { SalesService } from './sales.service.js';
import { CreateSaleDto } from './dto/create-sale.dto.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../common/types/jwt-payload.js';

@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  // Salesmen use this to check out a cart. pharmacy_admin can too (covering the counter).
  // Note manager is deliberately excluded -- their role is stock/inventory, not the till.
  @Roles('pharmacy_admin', 'salesman')
  @Post()
  checkout(@CurrentUser() user: AuthUser, @Body() dto: CreateSaleDto) {
    return this.salesService.checkout(user.pharmacyId!, user.sub, dto);
  }

  @Roles('pharmacy_admin', 'manager')
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('search') search?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.salesService.list(user.pharmacyId!, {
      search,
      dateFrom,
      dateTo,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  // Bug #18: a salesman's own sales, plain list -- no search/date/pagination controls
  // (confirmed with the user), and always force-scoped to their own invoices via
  // salesmanUserId (from the verified JWT, never client-supplied) so they can never see
  // anyone else's sales, or the pharmacy's totals, through this route.
  @Roles('salesman')
  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.salesService.list(user.pharmacyId!, { salesmanUserId: user.sub, limit: 100 });
  }
}
