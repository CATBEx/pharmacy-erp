import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { SuppliersService } from './suppliers.service.js';
import { CreateSupplierDto } from './dto/create-supplier.dto.js';
import { RecordPaymentDto } from './dto/record-payment.dto.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../common/types/jwt-payload.js';

@Roles('pharmacy_admin', 'manager')
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.suppliersService.list(user.pharmacyId!);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSupplierDto) {
    return this.suppliersService.create(user.pharmacyId!, dto);
  }

  @Get(':id/ledger')
  ledger(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.suppliersService.ledger(user.pharmacyId!, id);
  }

  @Post(':id/payments')
  recordPayment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecordPaymentDto,
  ) {
    return this.suppliersService.recordPayment(user.pharmacyId!, id, user.sub, dto);
  }
}
