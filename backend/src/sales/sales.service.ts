import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gt, gte, ilike, inArray, lt, sql } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/client.js';
import { saleInvoices, sales, saleAllocations, purchases, products, users } from '../db/schema.js';
import { ProductsService } from '../products/products.service.js';
import type { CreateSaleDto } from './dto/create-sale.dto.js';

export interface SalesListOptions {
  limit?: number;
  offset?: number;
  search?: string; // matches the salesman's name OR any line item's product name
  dateFrom?: string; // ISO date, inclusive
  dateTo?: string; // ISO date, inclusive
  // Bug #18: force-scopes the query to one salesman's own invoices, regardless of any
  // other filter. Set by the controller from the verified JWT (never client-supplied)
  // for the /sales/mine route -- this is what stops a salesman from ever seeing anyone
  // else's sales, even by hand-crafting a request.
  salesmanUserId?: number;
}

@Injectable()
export class SalesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly productsService: ProductsService,
  ) {}

  // Attaches the real line items ({ productName, qty }[]) to a batch of invoice ids in one
  // extra query, grouped in application code -- bug #13's fix. Shared by list() (paginated
  // history) and DashboardService.recentSales() (latest-5 widget), same "resolve ids, then
  // fetch the real rows" shape used throughout this codebase (see architecture-plan.md).
  static async fetchItemsFor(db: Database, invoiceIds: number[]) {
    const map = new Map<number, { productName: string; qty: number }[]>();
    if (invoiceIds.length === 0) return map;
    const rows = await db
      .select({ invoiceId: sales.invoiceId, productName: products.name, qty: sales.qty })
      .from(sales)
      .innerJoin(products, eq(products.id, sales.productId))
      .where(inArray(sales.invoiceId, invoiceIds))
      .orderBy(asc(sales.id));
    for (const row of rows) {
      const arr = map.get(row.invoiceId) ?? [];
      arr.push({ productName: row.productName, qty: row.qty });
      map.set(row.invoiceId, arr);
    }
    return map;
  }

  // Server-side search + date range + pagination (bug #13) -- unlike Products/Purchases
  // (a bounded few-hundred-row list, fine to load whole and filter client-side), a pharmacy's
  // sales history grows one invoice per checkout and can run into the thousands over months, so
  // this pages on the server and never fetches more than one page of full rows.
  async list(pharmacyId: number, opts: SalesListOptions = {}) {
    const limit = opts.limit && opts.limit > 0 ? Math.min(opts.limit, 100) : 20;
    const offset = opts.offset && opts.offset > 0 ? opts.offset : 0;

    const conditions = [eq(saleInvoices.pharmacyId, pharmacyId)];
    if (opts.salesmanUserId) conditions.push(eq(saleInvoices.salesmanUserId, opts.salesmanUserId));
    if (opts.dateFrom) conditions.push(gte(saleInvoices.saleDate, new Date(`${opts.dateFrom}T00:00:00.000Z`)));
    if (opts.dateTo) conditions.push(lt(saleInvoices.saleDate, new Date(new Date(`${opts.dateTo}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000)));

    const search = opts.search?.trim();
    if (search) {
      // Resolve which invoice ids match first (salesman name OR a line item's product name),
      // then filter the real invoice-list query to those ids -- the same two-step shape as
      // fetchItemsFor above, not a new pattern.
      const q = `%${search}%`;
      const [bySalesman, byProduct] = await Promise.all([
        this.db
          .select({ id: saleInvoices.id })
          .from(saleInvoices)
          .leftJoin(users, eq(users.id, saleInvoices.salesmanUserId))
          .where(and(eq(saleInvoices.pharmacyId, pharmacyId), ilike(users.name, q))),
        this.db
          .select({ id: sales.invoiceId })
          .from(sales)
          .innerJoin(products, eq(products.id, sales.productId))
          .where(and(eq(sales.pharmacyId, pharmacyId), ilike(products.name, q))),
      ]);
      const matchingIds = Array.from(new Set([...bySalesman.map((r) => r.id), ...byProduct.map((r) => r.id)]));
      if (matchingIds.length === 0) return { items: [], total: 0 };
      conditions.push(inArray(saleInvoices.id, matchingIds));
    }

    const where = and(...conditions);

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(saleInvoices)
      .where(where);

    const invoices = await this.db
      .select({
        id: saleInvoices.id,
        totalAmount: saleInvoices.totalAmount,
        saleDate: saleInvoices.saleDate,
        salesmanName: users.name,
      })
      .from(saleInvoices)
      .leftJoin(users, eq(users.id, saleInvoices.salesmanUserId))
      .where(where)
      .orderBy(desc(saleInvoices.saleDate))
      .limit(limit)
      .offset(offset);

    const itemsByInvoice = await SalesService.fetchItemsFor(this.db, invoices.map((i) => i.id));

    return {
      items: invoices.map((inv) => ({ ...inv, items: itemsByInvoice.get(inv.id) ?? [] })),
      total: count,
    };
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
