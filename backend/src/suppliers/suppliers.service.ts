import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/client.js';
import { suppliers, purchases, supplierPayments } from '../db/schema.js';
import type { CreateSupplierDto } from './dto/create-supplier.dto.js';
import type { RecordPaymentDto } from './dto/record-payment.dto.js';

@Injectable()
export class SuppliersService {
  constructor(@Inject(DB) private readonly db: Database) {}

  // Balance owed = total purchased from this supplier minus total paid to them.
  // Computed live from purchases + supplier_payments, never stored -- can't drift out of sync.
  async list(pharmacyId: number) {
    const supplierRows = await this.db.select().from(suppliers).where(eq(suppliers.pharmacyId, pharmacyId));

    const purchaseTotals = await this.db
      .select({
        supplierId: purchases.supplierId,
        total: sql<string>`coalesce(sum(${purchases.qty} * ${purchases.purchasePrice}), 0)`,
      })
      .from(purchases)
      .where(eq(purchases.pharmacyId, pharmacyId))
      .groupBy(purchases.supplierId);

    const paymentTotals = await this.db
      .select({
        supplierId: supplierPayments.supplierId,
        total: sql<string>`coalesce(sum(${supplierPayments.amount}), 0)`,
      })
      .from(supplierPayments)
      .where(eq(supplierPayments.pharmacyId, pharmacyId))
      .groupBy(supplierPayments.supplierId);

    const purchaseMap = new Map(
      purchaseTotals.filter((r) => r.supplierId != null).map((r) => [r.supplierId as number, Number(r.total)]),
    );
    const paymentMap = new Map(paymentTotals.map((r) => [r.supplierId, Number(r.total)]));

    return supplierRows.map((s) => {
      const totalPurchased = purchaseMap.get(s.id) ?? 0;
      const totalPaid = paymentMap.get(s.id) ?? 0;
      return { ...s, totalPurchased, totalPaid, balance: Number((totalPurchased - totalPaid).toFixed(2)) };
    });
  }

  async create(pharmacyId: number, dto: CreateSupplierDto) {
    const [supplier] = await this.db
      .insert(suppliers)
      .values({ pharmacyId, name: dto.name, contact: dto.contact })
      .returning();
    return supplier;
  }

  // Used internally by the purchases module to validate a supplierId belongs to this pharmacy.
  async assertBelongsToPharmacy(supplierId: number, pharmacyId: number) {
    const [supplier] = await this.db
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.id, supplierId), eq(suppliers.pharmacyId, pharmacyId)))
      .limit(1);
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }

  async recordPayment(pharmacyId: number, supplierId: number, userId: number, dto: RecordPaymentDto) {
    await this.assertBelongsToPharmacy(supplierId, pharmacyId);
    const [payment] = await this.db
      .insert(supplierPayments)
      .values({
        pharmacyId,
        supplierId,
        amount: dto.amount,
        note: dto.note,
        createdByUserId: userId,
      })
      .returning();
    return payment;
  }

  // Full transaction history for one supplier: every purchase (money owed) and
  // every payment (money paid), newest first.
  async ledger(pharmacyId: number, supplierId: number) {
    await this.assertBelongsToPharmacy(supplierId, pharmacyId);

    const purchaseRows = await this.db
      .select({
        type: sql<'purchase'>`'purchase'`,
        id: purchases.id,
        amount: sql<string>`(${purchases.qty} * ${purchases.purchasePrice})`,
        date: purchases.purchaseDate,
        note: sql<string | null>`null`,
      })
      .from(purchases)
      .where(and(eq(purchases.pharmacyId, pharmacyId), eq(purchases.supplierId, supplierId)));

    const paymentRows = await this.db
      .select({
        type: sql<'payment'>`'payment'`,
        id: supplierPayments.id,
        amount: supplierPayments.amount,
        date: supplierPayments.paymentDate,
        note: supplierPayments.note,
      })
      .from(supplierPayments)
      .where(and(eq(supplierPayments.pharmacyId, pharmacyId), eq(supplierPayments.supplierId, supplierId)));

    return [...purchaseRows, ...paymentRows].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  }
}
