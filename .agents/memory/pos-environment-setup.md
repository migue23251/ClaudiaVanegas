---
name: POS environment setup
description: How to (re)provision the Claudia Vanegas POS project after a fresh import/clone — JWT_SECRET and seed users are not automated.
---

## JWT_SECRET is not pre-provisioned by the app
Unlike `DATABASE_URL` (auto-provisioned), this project's `JWT_SECRET` has no scaffold-time source — `auth.ts` throws at startup if missing.

**Why:** it's a self-generated internal signing key with no user-known value, but `setEnvVars`/shared env vars are written into the tracked `.replit` file (`[userenv.shared]`) in plaintext — committing a live signing key to git history. Discovered via code review after using `setEnvVars` for it.
**How to apply:** generate the random value in code (`crypto.randomBytes(48).toString("hex")`), then hand it to the user through `requestSecrets({ keys: ["JWT_SECRET"], userMessage: "...paste this value: <value>" })` so it lands in the encrypted Secrets store, not a tracked file. Never use `setEnvVars` for signing keys or any credential-like value, even self-generated ones. Restart the API server workflow after the secret is confirmed added.

## DB seed script now exists
`pnpm --filter @workspace/db run seed` (runs `lib/db/src/seed.ts`) inserts the default admin + cajero accounts and is idempotent — safe to re-run. Use this instead of hand-inserting users via psql.

**Why:** an earlier version of this project had no seed script and required manual `INSERT INTO users` via psql; a seed script was added later. Always check for a seed script before falling back to manual inserts.
**How to apply:** after `pnpm --filter @workspace/db run push` on a fresh/empty DB, run `pnpm --filter @workspace/db run seed` before testing login.
