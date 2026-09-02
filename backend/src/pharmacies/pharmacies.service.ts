import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { and, eq, lte } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/client.js';
import { pharmacies, users } from '../db/schema.js';
import type { CreatePharmacyDto } from './dto/create-pharmacy.dto.js';
import type { UpdateSubscriptionDto } from './dto/update-subscription.dto.js';

// Human-readable pharmacy code (for invoices, support calls, etc). Derived from the
// row id rather than stored -- same "computed, not stored" principle used for stock
// and supplier balances elsewhere: it's always correct, always unique (the id already
// is), and needs no migration or uniqueness check of its own.
function pharmacyCode(id: number) {
  return `PH-${String(id).padStart(4, '0')}`;
}

// Generates the new admin's login password -- the super admin never types one in.
// Charset drops visually-ambiguous characters (0/O, 1/I/L). One continuous 8-char
// string, no separator -- it's relayed by copy/paste (the "Your Credentials" tap-to-copy
// block), not dictated, so a hyphen would only add an extra keyboard-switch tap when
// someone has to type it in by hand. Only ever shown once, in the create-pharmacy
// response -- it's stored solely as a bcrypt hash after that, exactly like a normal password.
const PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generatePassword() {
  return Array.from({ length: 8 }, () => PASSWORD_CHARS[randomInt(PASSWORD_CHARS.length)]).join('');
}

@Injectable()
export class PharmaciesService {
  private readonly logger = new Logger(PharmaciesService.name);

  constructor(@Inject(DB) private readonly db: Database) {}

  async list() {
    const rows = await this.db.select().from(pharmacies).orderBy(pharmacies.createdAt);
    return rows.map((p) => ({ ...p, code: pharmacyCode(p.id) }));
  }

  async create(dto: CreatePharmacyDto) {
    const [existing] = await this.db.select().from(users).where(eq(users.email, dto.adminEmail)).limit(1);
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    // Trial by default -- super admin flips to "active" once the pharmacy pays.
    const [pharmacy] = await this.db
      .insert(pharmacies)
      .values({ name: dto.pharmacyName, address: dto.address, phone: dto.phone })
      .returning();

    // The admin's login name reuses the business name -- there's no separate
    // "owner name" field in v1 (see architecture-plan.md).
    const generatedPassword = generatePassword();
    const passwordHash = await bcrypt.hash(generatedPassword, 10);
    const [admin] = await this.db
      .insert(users)
      .values({
        pharmacyId: pharmacy.id,
        role: 'pharmacy_admin',
        name: dto.pharmacyName,
        email: dto.adminEmail,
        passwordHash,
      })
      .returning();

    return {
      pharmacy: { ...pharmacy, code: pharmacyCode(pharmacy.id) },
      admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role },
      // Only returned this one time -- only the hash is kept after this. The super
      // admin relays this to the pharmacy owner (call/WhatsApp/SMS); there's no
      // automated email/SMS delivery in v1.
      generatedPassword,
    };
  }

  async updateSubscription(id: number, dto: UpdateSubscriptionDto) {
    // `days` is the normal path from the super-admin panel: "activate for 7/30/365
    // days" computes the expiry server-side (never trust a client-computed date).
    // `expiry` stays as an escape hatch for setting an exact date directly. Neither
    // given -> no expiry (matches "trial"/"inactive", or "active" with no auto-cutoff).
    const expiry = dto.days
      ? new Date(Date.now() + dto.days * 24 * 60 * 60 * 1000)
      : dto.expiry
        ? new Date(dto.expiry)
        : null;

    const [pharmacy] = await this.db
      .update(pharmacies)
      .set({
        subscriptionStatus: dto.status,
        subscriptionExpiry: expiry,
      })
      .where(eq(pharmacies.id, id))
      .returning();

    if (!pharmacy) {
      throw new NotFoundException('Pharmacy not found');
    }
    return { ...pharmacy, code: pharmacyCode(pharmacy.id) };
  }

  // Super admin's "View Details" panel: the row itself, plus who logs in as its
  // admin and who else works there. Split from `staff` so the frontend can show
  // "Admin" separately from the manager/salesman roster without re-deriving it.
  async getDetails(id: number) {
    const [pharmacy] = await this.db.select().from(pharmacies).where(eq(pharmacies.id, id)).limit(1);
    if (!pharmacy) {
      throw new NotFoundException('Pharmacy not found');
    }

    const people = await this.db
      .select({
        id: users.id,
        role: users.role,
        name: users.name,
        email: users.email,
        active: users.active,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.pharmacyId, id))
      .orderBy(users.role, users.name);

    return {
      ...pharmacy,
      code: pharmacyCode(pharmacy.id),
      admin: people.find((u) => u.role === 'pharmacy_admin') ?? null,
      staff: people.filter((u) => u.role !== 'pharmacy_admin'),
    };
  }

  // Password recovery for a pharmacy admin who's locked out -- there's no "forgot
  // password" self-service flow (no email delivery in v1), so the super admin does
  // it on their behalf. Same one-time-display contract as `create()`: only the hash
  // survives after this response.
  async regeneratePassword(id: number) {
    const [admin] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.pharmacyId, id), eq(users.role, 'pharmacy_admin')))
      .limit(1);
    if (!admin) {
      throw new NotFoundException('Pharmacy admin not found');
    }

    const generatedPassword = generatePassword();
    const passwordHash = await bcrypt.hash(generatedPassword, 10);
    await this.db.update(users).set({ passwordHash }).where(eq(users.id, admin.id));

    return { email: admin.email, generatedPassword };
  }

  // Auto-deactivation for time-boxed subscriptions: runs every 10 minutes and flips
  // any pharmacy whose chosen duration has passed from 'active' to 'inactive'. Blocks
  // new logins immediately (see AuthService); anyone already logged in keeps working
  // until their token naturally expires (max 8h) -- same behavior as a manual
  // deactivation, just triggered by the clock instead of a super-admin click.
  @Cron(CronExpression.EVERY_10_MINUTES)
  async deactivateExpiredSubscriptions() {
    const expired = await this.db
      .update(pharmacies)
      .set({ subscriptionStatus: 'inactive' })
      .where(and(eq(pharmacies.subscriptionStatus, 'active'), lte(pharmacies.subscriptionExpiry, new Date())))
      .returning({ id: pharmacies.id, name: pharmacies.name });

    if (expired.length > 0) {
      this.logger.log(`Auto-deactivated ${expired.length} expired subscription(s): ${expired.map((p) => p.name).join(', ')}`);
    }
  }
}
