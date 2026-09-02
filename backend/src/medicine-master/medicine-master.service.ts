import { Inject, Injectable } from '@nestjs/common';
import { eq, ilike, sql } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/client.js';
import { medicineMaster, manufacturers } from '../db/schema.js';

@Injectable()
export class MedicineMasterService {
  constructor(@Inject(DB) private readonly db: Database) {}

  // Autocomplete search across the shared, platform-wide medicine catalog.
  async search(query: string) {
    if (!query || query.trim().length < 2) return [];
    return this.db
      .select({
        id: medicineMaster.id,
        name: medicineMaster.name,
        genericName: medicineMaster.genericName,
        strength: medicineMaster.strength,
        form: medicineMaster.form,
        manufacturerName: manufacturers.name,
      })
      .from(medicineMaster)
      .leftJoin(manufacturers, eq(medicineMaster.manufacturerId, manufacturers.id))
      .where(ilike(medicineMaster.name, `%${query.trim()}%`))
      .limit(25);
  }

  async count() {
    const [row] = await this.db.select({ count: sql<number>`count(*)::int` }).from(medicineMaster);
    return row?.count ?? 0;
  }
}
