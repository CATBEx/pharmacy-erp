import { Inject, Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/client.js';
import { users, pharmacies } from '../db/schema.js';
import type { JwtPayload } from '../common/types/jwt-payload.js';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const [user] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user || !user.active) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Non-super-admin users belong to a pharmacy; block login if that pharmacy's
    // subscription has been deactivated by the super admin.
    if (user.role !== 'super_admin') {
      if (!user.pharmacyId) {
        throw new UnauthorizedException('Account is not linked to a pharmacy');
      }
      const [pharmacy] = await this.db
        .select()
        .from(pharmacies)
        .where(eq(pharmacies.id, user.pharmacyId))
        .limit(1);

      if (!pharmacy || pharmacy.subscriptionStatus === 'inactive') {
        throw new ForbiddenException('This pharmacy\'s subscription is inactive. Contact support.');
      }
    }

    const payload: JwtPayload = {
      sub: user.id,
      role: user.role,
      pharmacyId: user.pharmacyId,
    };

    return {
      accessToken: await this.jwt.signAsync(payload),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        pharmacyId: user.pharmacyId,
      },
    };
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }
}
