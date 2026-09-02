import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
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
    const [pharmacy] = await this.db
      .update(pharmacies)
      .set({
        subscriptionStatus: dto.status,
        subscriptionExpiry: dto.expiry ? new Date(dto.expiry) : null,
      })
      .where(eq(pharmacies.id, id))
      .returning();

    if (!pharmacy) {
      throw new NotFoundException('Pharmacy not found');
    }
    return { ...pharmacy, code: pharmacyCode(pharmacy.id) };
  }
}
