import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/client.js';
import { products, purchases, medicineMaster, manufacturers } from '../db/schema.js';
import type { CreateProductDto } from './dto/create-product.dto.js';
import type { UpdateProductDto } from './dto/update-product.dto.js';

@Injectable()
export class ProductsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  // qtyOnHand is derived live from purchase batches (sum of what hasn't been sold yet),
  // never stored redundantly -- that's what keeps stock always correct after every sale/purchase.
  //
  // Also left-joins the shared catalog (medicine_master/manufacturers) for products linked to it
  // via medicineMasterId -- genericName/form/manufacturerName come back null for a product typed
  // in fresh with no catalog link. Every page that loads /products (Products, Purchases, Sell)
  // gets this for free, so a search box or extra detail column on any of them needs no new
  // endpoint (bugs #10/#11/#12) -- same "one enrichment, every consumer benefits" shape as the
  // pack-size suggestion feature.
  listWithStock(pharmacyId: number) {
    return this.db
      .select({
        id: products.id,
        name: products.name,
        unit: products.unit,
        piecesPerStrip: products.piecesPerStrip,
        stripsPerBox: products.stripsPerBox,
        reorderLevel: products.reorderLevel,
        active: products.active,
        medicineMasterId: products.medicineMasterId,
        genericName: medicineMaster.genericName,
        form: medicineMaster.form,
        manufacturerName: manufacturers.name,
        qtyOnHand: sql<number>`coalesce(sum(${purchases.qtyRemaining}), 0)::int`,
      })
      .from(products)
      .leftJoin(purchases, eq(purchases.productId, products.id))
      .leftJoin(medicineMaster, eq(medicineMaster.id, products.medicineMasterId))
      .leftJoin(manufacturers, eq(manufacturers.id, medicineMaster.manufacturerId))
      .where(eq(products.pharmacyId, pharmacyId))
      .groupBy(products.id, medicineMaster.genericName, medicineMaster.form, manufacturers.name)
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
        piecesPerStrip: dto.piecesPerStrip ?? 1,
        stripsPerBox: dto.stripsPerBox ?? 1,
        reorderLevel: dto.reorderLevel ?? 10,
      })
      .returning();
    return product;
  }

  // Cross-pharmacy pack-size suggestions for the "add product" dropdowns: for a given shared
  // catalog medicine, how many pharmacies (platform-wide) have set each pieces-per-strip /
  // strips-per-box value, most-used first. Purely a live count -- no separate table to keep in
  // sync, same "computed, not stored" principle used elsewhere (stock, supplier balances). Safe
  // to aggregate across tenants: only a number and a count are exposed, no pharmacy identity or
  // business data, matching how medicine_master is already shared platform-wide.
  async packSizeSuggestions(medicineMasterId: number) {
    const [piecesPerStripRows, stripsPerBoxRows] = await Promise.all([
      this.db
        .select({
          value: products.piecesPerStrip,
          pharmacyCount: sql<number>`count(distinct ${products.pharmacyId})::int`,
        })
        .from(products)
        .where(eq(products.medicineMasterId, medicineMasterId))
        .groupBy(products.piecesPerStrip)
        .orderBy(desc(sql`count(distinct ${products.pharmacyId})`)),
      this.db
        .select({
          value: products.stripsPerBox,
          pharmacyCount: sql<number>`count(distinct ${products.pharmacyId})::int`,
        })
        .from(products)
        .where(eq(products.medicineMasterId, medicineMasterId))
        .groupBy(products.stripsPerBox)
        .orderBy(desc(sql`count(distinct ${products.pharmacyId})`)),
    ]);
    return { piecesPerStrip: piecesPerStripRows, stripsPerBox: stripsPerBoxRows };
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
