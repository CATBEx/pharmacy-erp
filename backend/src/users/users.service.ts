import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/client.js';
import { users } from '../db/schema.js';
import type { CreateStaffDto } from './dto/create-staff.dto.js';
import { generatePassword } from '../common/utils/generate-password.js';

@Injectable()
export class UsersService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async listStaff(pharmacyId: number) {
    return this.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        active: users.active,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(and(eq(users.pharmacyId, pharmacyId), inArray(users.role, ['salesman', 'manager'])))
      // Explicit, stable order -- without this, Postgres is free to return rows in
      // whatever order is cheapest (e.g. differently before/after an UPDATE), which
      // reads as "the list randomly reshuffles" once bug #15's regenerate-password/
      // deactivate actions started making mutations visible from this same page.
      .orderBy(users.name);
  }

  async createStaff(pharmacyId: number, dto: CreateStaffDto) {
    const [existing] = await this.db.select().from(users).where(eq(users.email, dto.email)).limit(1);
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const [staff] = await this.db
      .insert(users)
      .values({
        pharmacyId,
        role: dto.role,
        name: dto.name,
        email: dto.email,
        passwordHash,
      })
      .returning();

    return { id: staff.id, name: staff.name, email: staff.email, role: staff.role };
  }

  // Shared "find my own staff member" lookup -- both regeneratePassword and setActive
  // need it, and both need the exact same tenant/role scoping: pharmacyId must come
  // from the verified JWT (never a client-supplied value) so one pharmacy_admin can
  // never reach into another pharmacy's staff, and the role filter (same one listStaff
  // already uses) means this endpoint can never be pointed at a pharmacy_admin or
  // super_admin row -- there's no "staff" row for a pharmacy_admin's own account.
  private async findOwnStaff(pharmacyId: number, staffId: number) {
    const [staff] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, staffId), eq(users.pharmacyId, pharmacyId), inArray(users.role, ['salesman', 'manager'])))
      .limit(1);
    if (!staff) {
      throw new NotFoundException('Staff member not found');
    }
    return staff;
  }

  // Bug #15: a pharmacy admin resetting a locked-out salesman/manager's password.
  // Same one-time-display contract as PharmaciesService.regeneratePassword -- only the
  // hash survives after this response, so "view password" is never possible, only
  // "issue a new one."
  async regeneratePassword(pharmacyId: number, staffId: number) {
    const staff = await this.findOwnStaff(pharmacyId, staffId);

    const generatedPassword = generatePassword();
    const passwordHash = await bcrypt.hash(generatedPassword, 10);
    await this.db.update(users).set({ passwordHash }).where(eq(users.id, staff.id));

    return { email: staff.email, generatedPassword };
  }

  // Bug #15: deactivate/reactivate, not delete -- a staff member's past sales/purchases
  // still reference their userId (sales history "sold by", audit trail), so hard-deleting
  // the row would either orphan that history or force a cascading delete that destroys
  // real transaction records. Deactivating just blocks login (AuthService.login() already
  // refuses active=false) while their name stays correct on every past sale.
  async setActive(pharmacyId: number, staffId: number, active: boolean) {
    const staff = await this.findOwnStaff(pharmacyId, staffId);
    const [updated] = await this.db
      .update(users)
      .set({ active })
      .where(eq(users.id, staff.id))
      .returning({ id: users.id, name: users.name, email: users.email, role: users.role, active: users.active });
    return updated;
  }
}
