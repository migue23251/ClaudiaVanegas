/**
 * Seed script — inserts default admin and cajero users.
 * Safe to run multiple times: existing emails are skipped via ON CONFLICT DO NOTHING.
 *
 * Usage:
 *   pnpm --filter @workspace/db run seed
 */

import bcrypt from "bcryptjs";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

const client = new pg.Client({ connectionString: DATABASE_URL });

const DEFAULT_USERS = [
  {
    email: "admin@claudiavanegas.com",
    name: "Administrador",
    role: "admin" as const,
    password: "admin123",
  },
  {
    email: "cajero@claudiavanegas.com",
    name: "Cajero",
    role: "cajero" as const,
    password: "cajero123",
  },
];

async function seed() {
  await client.connect();
  console.log("Seeding default users…");

  for (const user of DEFAULT_USERS) {
    const hash = await bcrypt.hash(user.password, 10);
    const result = await client.query(
      `INSERT INTO users (email, name, role, password_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING`,
      [user.email, user.name, user.role, hash]
    );
    const inserted = (result.rowCount ?? 0) > 0;
    console.log(
      `  ${user.email} (${user.role}) — ${inserted ? "inserted" : "already exists, skipped"}`
    );
  }

  await client.end();
  console.log("Done.");
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
