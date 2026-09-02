import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ProductsService } from './products.service.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../common/types/jwt-payload.js';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // Everyone in the pharmacy can read the product list (salesmen need it to sell),
  // but only pharmacy_admin/manager can create/edit -- see method-level @Roles below.
  @Roles('pharmacy_admin', 'manager', 'salesman')
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.productsService.listWithStock(user.pharmacyId!);
  }

  @Roles('pharmacy_admin', 'manager', 'salesman')
  @Get('low-stock')
  lowStock(@CurrentUser() user: AuthUser) {
    return this.productsService.lowStock(user.pharmacyId!);
  }

  @Roles('pharmacy_admin', 'manager')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProductDto) {
    return this.productsService.create(user.pharmacyId!, dto);
  }

  @Roles('pharmacy_admin', 'manager')
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductDto) {
    return this.productsService.update(user.pharmacyId!, id, dto);
  }
}
