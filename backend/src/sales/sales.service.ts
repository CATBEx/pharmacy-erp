import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gt, sql } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/client.js';
import { saleInvoices, sales, saleAllocations, purchases, users } from '../db/schema.js';
import { ProductsService } from '../products/products.service.js';
import type { CreateSaleDto } from './dto/create-sale.dto.js';

@Injectable()
export class SalesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly productsService: ProductsService,
  ) {}

  async list(pharmacyId: number) {
    return this.db
      .select({
        id: saleInvoices.id,
        totalAmount: saleInvoices.totalAmount,
        saleDate: saleInvoices.saleDate,
        salesmanName: users.name,
        itemCount: sql<number>`count(${sales.id})::int`,
      })
      .from(saleInvoices)
      .leftJoin(sales, eq(sales.invoiceId, saleInvoices.id))
      .leftJoin(users, eq(users.id, saleInvoices.salesmanUserId))
      .where(eq(saleInvoices.pharmacyId, pharmacyId))
      .groupBy(saleInvoices.id, users.name)
      .orderBy(desc(saleInvoices.saleDate));
  }

  // The whole checkout is one DB transaction: either every line item's stock is
  // successfully FIFO-allocated and the invoice is recorded, or none of it is --
  // a sale can never be half-recorded or oversell stock.
  async checkout(pharmacyId: number, salesmanUserId: number, dto: CreateSaleDto) {
    // Validate every product belongs to this pharmacy *before* opening the transaction --
    // this also gives us product names for a useful error message if stock runs short.
    const products = new Map<number, string>();
    for (const item of dto.items) {
      const product = await this.productsService.assertBelongsToPharmacy(item.productId, pharmacyId);
      products.set(item.productId, product.name);
    }

    // dto.items[].saleAmount is the total charged for that line (bug #12), not per-unit. The
    // invoice's totalAmount is the exact sum of what was actually typed -- never recomputed as
    // qty x a rounded per-unit price -- so what the salesman entered across all lines is exactly
    // what the invoice says, penny for penny. Only the per-line stored salePrice (used for FIFO
    // cost/profit bookkeeping, never shown as "the total") carries the sub-cent rounding that
    // comes from storing a per-unit cost at 2 decimal places at all -- see Bugs.md #9/#12.
    let totalAmount = 0;
    for (const item of dto.items) {
      totalAmount += Number(item.saleAmount);
    }

    return this.db.transaction(async (tx) => {
      const [invoice] = await tx
        .insert(saleInvoices)
        .values({ pharmacyId, salesmanUserId, totalAmount: totalAmount.toFixed(2) })
        .returning();

      for (const item of dto.items) {
        const salePrice = (Number(item.saleAmount) / item.qty).toFixed(2);
        const [line] = await tx
          .insert(sales)
          .values({
            pharmacyId,
            invoiceId: invoice.id,
            productId: item.productId,
            qty: item.qty,
            salePrice,
          })
          .returning();

        // Draw stock oldest-batch-first (FIFO), locking each batch row so two
        // concurrent checkouts can't both allocate from the same remaining stock.
        const batches = await tx
          .select()
          .from(purchases)
          .where(and(eq(purchases.pharmacyId, pharmacyId), eq(purchases.productId, item.productId), gt(purchases.qtyRemaining, 0)))
          .orderBy(asc(purchases.purchaseDate), asc(purchases.id))
          .for('update');

        let remaining = item.qty;
        for (const batch of batches) {
          if (remaining <= 0) break;
          const take = Math.min(remaining, batch.qtyRemaining);

          await tx.insert(saleAllocations).values({
            saleId: line.id,
            purchaseId: batch.id,
            qty: take,
            unitCost: batch.purchasePrice,
          });
          await tx
            .update(purchases)
            .set({ qtyRemaining: batch.qtyRemaining - take })
            .where(eq(purchases.id, batch.id));

          remaining -= take;
        }

        if (remaining > 0) {
          // Throwing inside a Drizzle transaction rolls the whole thing back --
          // no partial invoice, no partial stock deduction.
          throw new BadRequestException(
            `Insufficient stock for "${products.get(item.productId)}": short by ${remaining} ${item.qty === remaining ? '' : '(after using what was available)'}`.trim(),
          );
        }
      }

      return invoice;
    });
  }
}
