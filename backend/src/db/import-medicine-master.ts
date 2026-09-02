// Bulk-seeds the shared medicine_master catalog from the "Assorted Medicine Dataset of
// Bangladesh" CSVs (manufacturer.csv, medicine.csv - see README for the source).
// Safe to re-run: both tables have a uniqueness guard and inserts use onConflictDoNothing.
//
// Usage: npm run db:import-medicines --workspace=backend -- "/path/to/Medicine Data"
// (defaults to "../Medicine Data" relative to the backend/ folder if no path is given)
import 'dotenv/config';
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { createDb } from './client.js';
import { manufacturers, medicineMaster } from './schema.js';

const BATCH_SIZE = 500;

function loadCsv(filePath: string): Record<string, string>[] {
  const raw = readFileSync(filePath, 'utf-8');
  return parse(raw, { columns: true, skip_empty_lines: true, trim: true });
}

function clean(value: string | undefined, maxLen: number): string | null {
  const v = (value ?? '').trim();
  if (!v) return null;
  return v.length > maxLen ? v.slice(0, maxLen) : v;
}

async function main() {
  const dir = process.argv[2] || path.resolve(process.cwd(), '../Medicine Data');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const db = createDb(url);

  console.log(`Reading medicine data from: ${dir}`);

  // ---------- Manufacturers ----------
  const manufacturerRows = loadCsv(path.join(dir, 'manufacturer.csv'));
  const manufacturerNames = [...new Set(manufacturerRows.map((r) => clean(r['manufacturer name'], 255)).filter((v): v is string => !!v))];

  console.log(`Manufacturers: ${manufacturerNames.length} unique names found, upserting...`);
  for (let i = 0; i < manufacturerNames.length; i += BATCH_SIZE) {
    const batch = manufacturerNames.slice(i, i + BATCH_SIZE).map((name) => ({ name }));
    await db.insert(manufacturers).values(batch).onConflictDoNothing();
  }

  const allManufacturers = await db.select().from(manufacturers);
  const manufacturerIdByName = new Map(allManufacturers.map((m) => [m.name, m.id]));
  console.log(`Manufacturers table now has ${allManufacturers.length} rows.`);

  // ---------- Medicines ----------
  const medicineRows = loadCsv(path.join(dir, 'medicine.csv'));
  console.log(`Medicines: ${medicineRows.length} rows found, importing in batches of ${BATCH_SIZE}...`);

  let skippedNoName = 0;
  for (let i = 0; i < medicineRows.length; i += BATCH_SIZE) {
    const chunk = medicineRows.slice(i, i + BATCH_SIZE);
    const values = chunk
      .map((r) => ({
        name: clean(r['brand name'], 255),
        genericName: clean(r['generic'], 255),
        strength: clean(r['strength'], 100),
        form: clean(r['dosage form'], 100),
        type: clean(r['type'], 50),
        manufacturerId: manufacturerIdByName.get((r['manufacturer'] ?? '').trim()) ?? null,
      }))
      .filter((v): v is typeof v & { name: string } => {
        if (!v.name) {
          skippedNoName++;
          return false;
        }
        return true;
      });

    if (values.length > 0) {
      await db.insert(medicineMaster).values(values).onConflictDoNothing();
    }
    if (i % 5000 === 0) console.log(`  ...${Math.min(i + BATCH_SIZE, medicineRows.length)}/${medicineRows.length}`);
  }

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(medicineMaster);
  console.log(`Done. medicine_master now has ${count} rows (skipped ${skippedNoName} rows with no brand name).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
