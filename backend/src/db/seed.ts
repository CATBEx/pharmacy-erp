// One-time setup script: creates the platform super admin account if it doesn't
// exist yet. Run with: npm run db:seed --workspace=backend
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { createDb } from './client.js';
import { users } from './schema.js';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const db = createDb(url);

  const email = process.env.SUPER_ADMIN_EMAIL || 'admin@pharmacy-erp.local';
  const password = process.env.SUPER_ADMIN_PASSWORD || 'ChangeMe123!';

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    console.log(`Super admin already exists: ${email}`);
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await db.insert(users).values({
    pharmacyId: null,
    role: 'super_admin',
    name: 'Platform Super Admin',
    email,
    passwordHash,
  });

  console.log(`Created super admin: ${email} / ${password}`);
  console.log('Change this password after first login (or set SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD env vars before seeding).');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
