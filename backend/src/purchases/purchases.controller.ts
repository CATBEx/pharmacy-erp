import { Body, Controller, Get, Post } from '@nestjs/common';
import { PurchasesService } from './purchases.service.js';
import { CreatePurchaseDto } from './dto/create-purchase.dto.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../common/types/jwt-payload.js';

// Admin + manager only: purchase price is cost data that salesmen must not see (per the
// salesman-restricted-view requirement). Manager can receive stock; salesman cannot.
@Roles('pharmacy_admin', 'manager')
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.purchasesService.list(user.pharmacyId!);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePurchaseDto) {
    return this.purchasesService.create(user.pharmacyId!, user.sub, dto);
  }
}
