import { Inject, Injectable } from '@nestjs/common';
import { eq, ilike, sql } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/client.js';
import { medicineMaster, manufacturers } from '../db/schema.js';

@Injectable()
export class MedicineMasterService {
  constructor(@Inject(DB) private readonly db: Database) {}

  // Autocomplete search across the shared, platform-wide medicine catalog. Ranked by relevance,
  // not just filtered -- an unordered ILIKE match would happily put "Lonapam" (which contains
  // "napa" mid-word) ahead of "Napa" itself, since both satisfy the same %query% filter. Tiers,
  // best first: exact match, starts-with, query starts a word within the name, everything else
  // (mid-word matches) last -- alphabetical as the tiebreaker within each tier.
  async search(query: string) {
    const q = query?.trim();
    if (!q || q.length < 2) return [];
    const startsWith = `${q}%`;
    const wordStart = `% ${q}%`;

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
      .where(ilike(medicineMaster.name, `%${q}%`))
      .orderBy(
        sql`case
          when ${medicineMaster.name} ilike ${q} then 0
          when ${medicineMaster.name} ilike ${startsWith} then 1
          when ${medicineMaster.name} ilike ${wordStart} then 2
          else 3
        end`,
        medicineMaster.name,
      )
      .limit(25);
  }

  async count() {
    const [row] = await this.db.select({ count: sql<number>`count(*)::int` }).from(medicineMaster);
    return row?.count ?? 0;
  }
}
