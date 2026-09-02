import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/client.js';
import { products, purchases, saleAllocations, saleInvoices, sales, supplierPayments, users } from '../db/schema.js';

function dayStart(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function addDays(d: Date, n: number) {
  return new Date(d.getTime() + n * 24 * 60 * 60 * 1000);
}
function round2(n: number) {
  return Number(n.toFixed(2));
}
// null means "no meaningful percentage" (previous period was zero) -- the frontend
// shows "new" instead of a misleading +infinity%.
function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

@Injectable()
export class DashboardService {
  constructor(@Inject(DB) private readonly db: Database) {}

  // All "today" / "yesterday" boundaries are UTC calendar days for now -- v1 has no
  // per-pharmacy timezone setting yet. Deploying the VPS with TZ=Asia/Dhaka (or adding
  // a pharmacy.timezone column later) would make "today" match the pharmacy's actual day.
  async summary(pharmacyId: number) {
    const todayStart = dayStart(new Date());
    const yesterdayStart = addDays(todayStart, -1);
    const tomorrowStart = addDays(todayStart, 1);

    const invoiceRows = await this.db
      .select({ totalAmount: saleInvoices.totalAmount, saleDate: saleInvoices.saleDate })
      .from(saleInvoices)
      .where(
        and(
          eq(saleInvoices.pharmacyId, pharmacyId),
          gte(saleInvoices.saleDate, yesterdayStart),
          lt(saleInvoices.saleDate, tomorrowStart),
        ),
      );

    let revenueToday = 0;
    let revenueYesterday = 0;
    for (const row of invoiceRows) {
      const amt = Number(row.totalAmount);
      if (new Date(row.saleDate) >= todayStart) revenueToday += amt;
      else revenueYesterday += amt;
    }

    // Cost of goods sold, from the exact FIFO batches each sale drew from -- not a
    // flat average cost. Same yesterday/today window, joined out to sale_invoices for the date.
    const cogsRows = await this.db
      .select({ qty: saleAllocations.qty, unitCost: saleAllocations.unitCost, saleDate: saleInvoices.saleDate })
      .from(saleAllocations)
      .innerJoin(sales, eq(sales.id, saleAllocations.saleId))
      .innerJoin(saleInvoices, eq(saleInvoices.id, sales.invoiceId))
      .where(
        and(
          eq(saleInvoices.pharmacyId, pharmacyId),
          gte(saleInvoices.saleDate, yesterdayStart),
          lt(saleInvoices.saleDate, tomorrowStart),
        ),
      );

    let cogsToday = 0;
    let cogsYesterday = 0;
    for (const row of cogsRows) {
      const cost = row.qty * Number(row.unitCost);
      if (new Date(row.saleDate) >= todayStart) cogsToday += cost;
      else cogsYesterday += cost;
    }

    // Cash out: what was paid to suppliers, same window -- this is what makes "cash flow"
    // a different (and more useful) number than plain revenue.
    const paymentRows = await this.db
      .select({ amount: supplierPayments.amount, paymentDate: supplierPayments.paymentDate })
      .from(supplierPayments)
      .where(
        and(
          eq(supplierPayments.pharmacyId, pharmacyId),
          gte(supplierPayments.paymentDate, yesterdayStart),
          lt(supplierPayments.paymentDate, tomorrowStart),
        ),
      );

    let paymentsToday = 0;
    let paymentsYesterday = 0;
    for (const row of paymentRows) {
      const amt = Number(row.amount);
      if (new Date(row.paymentDate) >= todayStart) paymentsToday += amt;
      else paymentsYesterday += amt;
    }

    const profitToday = revenueToday - cogsToday;
    const profitYesterday = revenueYesterday - cogsYesterday;
    const cashFlowToday = revenueToday - paymentsToday;
    const cashFlowYesterday = revenueYesterday - paymentsYesterday;

    // Inventory value at cost + stock counts -- computed live from purchase batches
    // (same principle as ProductsService.listWithStock: never stored, can't drift).
    const [inv] = await this.db
      .select({
        value: sql<string>`coalesce(sum(${purchases.qtyRemaining} * ${purchases.purchasePrice}), 0)`,
        units: sql<string>`coalesce(sum(${purchases.qtyRemaining}), 0)`,
      })
      .from(purchases)
      .where(eq(purchases.pharmacyId, pharmacyId));

    const stockByProduct = await this.db
      .select({
        productId: products.id,
        reorderLevel: products.reorderLevel,
        qtyOnHand: sql<number>`coalesce(sum(${purchases.qtyRemaining}), 0)::int`,
      })
      .from(products)
      .leftJoin(purchases, eq(purchases.productId, products.id))
      .where(eq(products.pharmacyId, pharmacyId))
      .groupBy(products.id);

    const skus = stockByProduct.filter((p) => p.qtyOnHand > 0).length;
    const lowStockCount = stockByProduct.filter((p) => p.qtyOnHand <= p.reorderLevel).length;

    return {
      cashFlowToday: round2(cashFlowToday),
      cashFlowDeltaPct: pctDelta(cashFlowToday, cashFlowYesterday),
      dailyRevenue: round2(revenueToday),
      revenueDeltaPct: pctDelta(revenueToday, revenueYesterday),
      dailyProfit: round2(profitToday),
      profitDeltaPct: pctDelta(profitToday, profitYesterday),
      profitMarginPct: revenueToday > 0 ? Number(((profitToday / revenueToday) * 100).toFixed(1)) : 0,
      inventoryValue: round2(Number(inv?.value ?? 0)),
      availableStockUnits: Number(inv?.units ?? 0),
      availableStockSkus: skus,
      lowStockCount,
    };
  }

  // Daily revenue for the last `days` days (today included), oldest first. Days with
  // no sales come back as 0 rather than being missing, so the chart never has gaps.
  async trend(pharmacyId: number, days: number) {
    const todayStart = dayStart(new Date());
    const rangeStart = addDays(todayStart, -(days - 1));
    const tomorrowStart = addDays(todayStart, 1);

    const rows = await this.db
      .select({ totalAmount: saleInvoices.totalAmount, saleDate: saleInvoices.saleDate })
      .from(saleInvoices)
      .where(
        and(
          eq(saleInvoices.pharmacyId, pharmacyId),
          gte(saleInvoices.saleDate, rangeStart),
          lt(saleInvoices.saleDate, tomorrowStart),
        ),
      );

    const byDay = new Map<string, number>();
    for (let i = 0; i < days; i++) {
      byDay.set(addDays(rangeStart, i).toISOString().slice(0, 10), 0);
    }
    for (const row of rows) {
      const key = dayStart(new Date(row.saleDate)).toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) ?? 0) + Number(row.totalAmount));
    }

    return Array.from(byDay.entries()).map(([date, revenue]) => ({ date, revenue: round2(revenue) }));
  }

  recentSales(pharmacyId: number, limit: number) {
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
      .orderBy(desc(saleInvoices.saleDate))
      .limit(limit);
  }
}
