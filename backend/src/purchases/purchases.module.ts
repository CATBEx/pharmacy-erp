import { Module } from '@nestjs/common';
import { PurchasesService } from './purchases.service.js';
import { PurchasesController } from './purchases.controller.js';
import { ProductsModule } from '../products/products.module.js';
import { SuppliersModule } from '../suppliers/suppliers.module.js';

@Module({
  imports: [ProductsModule, SuppliersModule],
  controllers: [PurchasesController],
  providers: [PurchasesService],
})
export class PurchasesModule {}
