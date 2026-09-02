import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/client.js';
import { products, purchases } from '../db/schema.js';
import type { CreateProductDto } from './dto/create-product.dto.js';
import type { UpdateProductDto } from './dto/update-product.dto.js';

@Injectable()
export class ProductsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  // qtyOnHand is derived live from purchase batches (sum of what hasn't been sold yet),
  // never stored redundantly -- that's what keeps stock always correct after every sale/purchase.
  listWithStock(pharmacyId: number) {
    return this.db
      .select({
        id: products.id,
        name: products.name,
        unit: products.unit,
        reorderLevel: products.reorderLevel,
        active: products.active,
        medicineMasterId: products.medicineMasterId,
        qtyOnHand: sql<number>`coalesce(sum(${purchases.qtyRemaining}), 0)::int`,
      })
      .from(products)
      .leftJoin(purchases, eq(purchases.productId, products.id))
      .where(eq(products.pharmacyId, pharmacyId))
      .groupBy(products.id)
      .orderBy(products.name);
  }

  async lowStock(pharmacyId: number) {
    const all = await this.listWithStock(pharmacyId);
    return all.filter((p) => p.qtyOnHand <= p.reorderLevel);
  }

  async create(pharmacyId: number, dto: CreateProductDto) {
    const [product] = await this.db
      .insert(products)
      .values({
        pharmacyId,
        medicineMasterId: dto.medicineMasterId,
        name: dto.name,
        unit: dto.unit ?? 'pcs',
        reorderLevel: dto.reorderLevel ?? 10,
      })
      .returning();
    return product;
  }

  async update(pharmacyId: number, id: number, dto: UpdateProductDto) {
    const [product] = await this.db
      .update(products)
      .set(dto)
      .where(and(eq(products.id, id), eq(products.pharmacyId, pharmacyId)))
      .returning();
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  // Used by the purchases module to validate a productId belongs to this pharmacy before stock-in.
  async assertBelongsToPharmacy(id: number, pharmacyId: number) {
    const [product] = await this.db
      .select()
      .from(products)
      .where(and(eq(products.id, id), eq(products.pharmacyId, pharmacyId)))
      .limit(1);
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }
}
