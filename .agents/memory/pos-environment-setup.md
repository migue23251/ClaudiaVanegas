---
name: POS environment setup
description: How to (re)provision the Claudia Vanegas POS project after a fresh import/clone — JWT_SECRET and seed users are not automated.
---

## JWT_SECRET is not pre-provisioned by the app
Unlike `DATABASE_URL` (auto-provisioned) and `SESSION_SECRET` (some templates auto-provision it), this project's `JWT_SECRET` has no scaffold-time source — `auth.ts` throws at startup if missing.

**Why:** it's a self-generated internal signing key, not a third-party credential, so there's nothing for the user to "know" or paste in.
**How to apply:** generate a random value in code (`crypto.randomBytes(48).toString("hex")`) and set it with `setEnvVars` (not `requestSecrets`, since there's no user-known value to collect). Restart the API server workflow after setting it.

## No DB seed script exists
`lib/db` has no seed command — a fresh Postgres push creates empty tables. The documented default credentials in replit.md (`admin@claudiavanegas.com`/`admin123`, `cajero@claudiavanegas.com`/`cajero123`) are not inserted automatically.

**Why:** discovered when login returned "Credenciales inválidas" right after `drizzle-kit push` on a freshly imported project with an empty DB.
**How to apply:** after `pnpm --filter @workspace/db run push`, hash the default passwords with bcryptjs and `INSERT INTO users (...)` via `psql "$DATABASE_URL"` directly, matching the roles/emails documented in replit.md.
