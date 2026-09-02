import {
  pgTable,
  serial,
  text,
  varchar,
  integer,
  numeric,
  timestamp,
  pgEnum,
  boolean,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// ---------- Enums ----------
// manager: trusted staff who can handle stock-in/purchases/suppliers (sees cost) but
// cannot manage other staff. salesman: sells only, never sees purchase price or profit.
export const roleEnum = pgEnum('role', ['super_admin', 'pharmacy_admin', 'manager', 'salesman']);
export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'trial',
  'active',
  'inactive',
]);

// ---------- Tenants ----------
export const pharmacies = pgTable('pharmacies', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  address: text('address'),
  phone: varchar('phone', { length: 50 }),
  subscriptionStatus: subscriptionStatusEnum('subscription_status').notNull().default('trial'),
  subscriptionExpiry: timestamp('subscription_expiry'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ---------- Users ----------
// Super admins have pharmacyId = null (they manage the platform, not a single tenant).
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  pharmacyId: integer('pharmacy_id').references(() => pharmacies.id, { onDelete: 'cascade' }),
  role: roleEnum('role').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  emailUnique: uniqueIndex('users_email_unique').on(table.email),
}));

// ---------- Global medicine master catalog (shared across all pharmacies) ----------
export const manufacturers = pgTable('manufacturers', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull().unique(),
});

export const medicineMaster = pgTable('medicine_master', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(), // e.g. brand name "Napa"
  genericName: varchar('generic_name', { length: 255 }), // e.g. "Paracetamol"
  strength: varchar('strength', { length: 100 }), // e.g. "500mg"
  form: varchar('form', { length: 100 }), // e.g. "Tablet", "Syrup", "Injection"
  type: varchar('type', { length: 50 }), // "allopathic" | "herbal" | ...
  manufacturerId: integer('manufacturer_id').references(() => manufacturers.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  // Lets the bulk importer use onConflictDoNothing so re-running it is always safe.
  dedupe: uniqueIndex('medicine_master_dedupe').on(table.name, table.strength, table.manufacturerId),
}));

// ---------- Per-pharmacy product (links to master catalog, or a custom item) ----------
export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  pharmacyId: integer('pharmacy_id').notNull().references(() => pharmacies.id, { onDelete: 'cascade' }),
  medicineMasterId: integer('medicine_master_id').references(() => medicineMaster.id),
  name: varchar('name', { length: 255 }).notNull(), // denormalized for fast display / custom items
  unit: varchar('unit', { length: 50 }).notNull().default('pcs'), // pcs, box, bottle...
  // Packaging hierarchy for this pharmacy's own stock of this product: 1 box = stripsPerBox
  // strips, 1 strip = piecesPerStrip individual pieces. Both default to 1 for anything sold
  // loose (syrups, bottles, single vials) -- stock/purchase/sale quantities are still tracked
  // in plain pieces underneath (unchanged), these two fields are purely for converting a
  // Box/Strip/Pcs UI entry to that piece count and back. See architecture-plan.md "pack/piece
  // conversion" for the full design, including the cross-pharmacy suggested-value feature these
  // fields feed into.
  piecesPerStrip: integer('pieces_per_strip').notNull().default(1),
  stripsPerBox: integer('strips_per_box').notNull().default(1),
  reorderLevel: integer('reorder_level').notNull().default(10),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ---------- Suppliers ----------
// Balance owed is NOT stored here -- it's computed as
// SUM(purchases against this supplier) - SUM(supplier_payments), so it can never drift
// out of sync with the actual purchase/payment history (same principle as product stock).
export const suppliers = pgTable('suppliers', {
  id: serial('id').primaryKey(),
  pharmacyId: integer('pharmacy_id').notNull().references(() => pharmacies.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  contact: varchar('contact', { length: 255 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ---------- Supplier ledger: payments made to a supplier ----------
export const supplierPayments = pgTable('supplier_payments', {
  id: serial('id').primaryKey(),
  pharmacyId: integer('pharmacy_id').notNull().references(() => pharmacies.id, { onDelete: 'cascade' }),
  supplierId: integer('supplier_id').notNull().references(() => suppliers.id, { onDelete: 'cascade' }),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  note: text('note'),
  paymentDate: timestamp('payment_date').notNull().defaultNow(),
  createdByUserId: integer('created_by_user_id').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ---------- Purchases (stock-in batches) ----------
export const purchases = pgTable('purchases', {
  id: serial('id').primaryKey(),
  pharmacyId: integer('pharmacy_id').notNull().references(() => pharmacies.id, { onDelete: 'cascade' }),
  productId: integer('product_id').notNull().references(() => products.id),
  supplierId: integer('supplier_id').references(() => suppliers.id),
  qty: integer('qty').notNull(),
  qtyRemaining: integer('qty_remaining').notNull(), // decremented as sales draw FIFO from this batch
  purchasePrice: numeric('purchase_price', { precision: 12, scale: 2 }).notNull(), // per unit
  batchNumber: varchar('batch_number', { length: 100 }),
  expiryDate: timestamp('expiry_date'),
  purchaseDate: timestamp('purchase_date').notNull().defaultNow(),
  createdByUserId: integer('created_by_user_id').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ---------- Sales ----------
// One checkout = one invoice with one or more line items, like a real till receipt.
// totalAmount is stored (not derived) because it's fixed at the moment of sale --
// unlike stock/balance, there's nothing later that should change what a past sale totaled.
export const saleInvoices = pgTable('sale_invoices', {
  id: serial('id').primaryKey(),
  pharmacyId: integer('pharmacy_id').notNull().references(() => pharmacies.id, { onDelete: 'cascade' }),
  salesmanUserId: integer('salesman_user_id').notNull().references(() => users.id),
  totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull(),
  saleDate: timestamp('sale_date').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const sales = pgTable('sales', {
  id: serial('id').primaryKey(),
  pharmacyId: integer('pharmacy_id').notNull().references(() => pharmacies.id, { onDelete: 'cascade' }),
  invoiceId: integer('invoice_id').notNull().references(() => saleInvoices.id, { onDelete: 'cascade' }),
  productId: integer('product_id').notNull().references(() => products.id),
  qty: integer('qty').notNull(),
  salePrice: numeric('sale_price', { precision: 12, scale: 2 }).notNull(), // per unit
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ---------- FIFO cost allocation: which purchase batch(es) a sale drew stock from ----------
// This is what makes daily-profit accurate even when the same product was bought at different prices.
export const saleAllocations = pgTable('sale_allocations', {
  id: serial('id').primaryKey(),
  saleId: integer('sale_id').notNull().references(() => sales.id, { onDelete: 'cascade' }),
  purchaseId: integer('purchase_id').notNull().references(() => purchases.id),
  qty: integer('qty').notNull(),
  unitCost: numeric('unit_cost', { precision: 12, scale: 2 }).notNull(), // snapshot of purchase price at allocation time
});
