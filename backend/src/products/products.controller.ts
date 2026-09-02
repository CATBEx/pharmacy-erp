import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
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

  // Cross-pharmacy pack-size suggestions for the "add product" form -- see
  // ProductsService.packSizeSuggestions. Not tenant-scoped (it aggregates across every
  // pharmacy on the platform), but still requires a logged-in admin/manager since it's only
  // useful from the add-product form they're the only ones who see.
  @Roles('pharmacy_admin', 'manager')
  @Get('pack-size-suggestions')
  packSizeSuggestions(@Query('medicineMasterId') medicineMasterId?: string) {
    const id = medicineMasterId ? Number(medicineMasterId) : null;
    if (!id) return { piecesPerStrip: [], stripsPerBox: [] };
    return this.productsService.packSizeSuggestions(id);
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
