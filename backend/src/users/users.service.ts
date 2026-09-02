import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/client.js';
import { users } from '../db/schema.js';
import type { CreateStaffDto } from './dto/create-staff.dto.js';

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
      .where(and(eq(users.pharmacyId, pharmacyId), inArray(users.role, ['salesman', 'manager'])));
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
}
