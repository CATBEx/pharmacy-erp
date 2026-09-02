import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { randomInt } from 'node:crypto';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/client.js';
import { purchases } from '../db/schema.js';
import { ProductsService } from '../products/products.service.js';
import { SuppliersService } from '../suppliers/suppliers.service.js';
import type { CreatePurchaseDto } from './dto/create-purchase.dto.js';

// Auto-generated when the batch number is left blank (bug #8) -- same ambiguity-free charset used
// for generated passwords elsewhere. Format: B-YYMMDD-XXXX, e.g. B-260902-K7QX -- human-scannable
// on a printed label, sorts roughly chronologically, and won't collide with a batch number a
// pharmacy typed by hand.
const BATCH_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateBatchNumber() {
  const now = new Date();
  const yy = String(now.getFullYear() % 100).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const suffix = Array.from({ length: 4 }, () => BATCH_CHARS[randomInt(BATCH_CHARS.length)]).join('');
  return `B-${yy}${mm}${dd}-${suffix}`;
}

@Injectable()
export class PurchasesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly productsService: ProductsService,
    private readonly suppliersService: SuppliersService,
  ) {}

  async list(pharmacyId: number) {
    return this.db
      .select()
      .from(purchases)
      .where(eq(purchases.pharmacyId, pharmacyId))
      .orderBy(desc(purchases.purchaseDate));
  }

  async create(pharmacyId: number, userId: number, dto: CreatePurchaseDto) {
    // Both checks throw NotFoundException if the id doesn't belong to this pharmacy --
    // this is what stops a pharmacy from recording stock against another pharmacy's product/supplier.
    await this.productsService.assertBelongsToPharmacy(dto.productId, pharmacyId);
    if (dto.supplierId) {
      await this.suppliersService.assertBelongsToPharmacy(dto.supplierId, pharmacyId);
    }

    const [purchase] = await this.db
      .insert(purchases)
      .values({
        pharmacyId,
        productId: dto.productId,
        supplierId: dto.supplierId,
        qty: dto.qty,
        qtyRemaining: dto.qty, // full batch is unsold at the moment it's recorded
        purchasePrice: dto.purchasePrice,
        batchNumber: dto.batchNumber?.trim() || generateBatchNumber(),
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
        createdByUserId: userId,
      })
      .returning();

    return purchase;
  }
}
