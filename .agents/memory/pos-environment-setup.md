---
name: POS environment setup
description: How to (re)provision the Claudia Vanegas POS project after a fresh import/clone — JWT_SECRET and seed users are not automated.
---

## JWT_SECRET is not pre-provisioned by the app
Unlike `DATABASE_URL` (auto-provisioned), this project's `JWT_SECRET` has no scaffold-time source — `auth.ts` throws at startup if missing.

**Why:** it's a self-generated internal signing key with no user-known value, but `setEnvVars`/shared env vars are written into the tracked `.replit` file (`[userenv.shared]`) in plaintext — committing a live signing key to git history. Discovered via code review after using `setEnvVars` for it.
**How to apply:** generate the random value in code (`crypto.randomBytes(48).toString("hex")`), then hand it to the user through `requestSecrets({ keys: ["JWT_SECRET"], userMessage: "...paste this value: <value>" })` so it lands in the encrypted Secrets store, not a tracked file. Never use `setEnvVars` for signing keys or any credential-like value, even self-generated ones. Restart the API server workflow after the secret is confirmed added.

## No DB seed script exists
`lib/db` has no seed command — a fresh Postgres push creates empty tables, so the default login credentials documented in replit.md don't work until users are inserted.

**Why:** discovered when login returned "Credenciales inválidas" right after `drizzle-kit push` on a freshly imported project with an empty DB.
**How to apply:** after `pnpm --filter @workspace/db run push`, hash the default passwords from replit.md with bcryptjs and `INSERT INTO users (...)` via `psql "$DATABASE_URL"` directly (see replit.md's "Default Credentials" section for the actual values — don't duplicate them here).
