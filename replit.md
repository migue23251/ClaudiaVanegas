# Claudia Vanegas POS

Sistema de Punto de Venta (POS) completo para la tienda de ropa, zapatos y accesorios "Claudia Vanegas" (Bogotá, Colombia).

## First-time bootstrap (after cloning / importing)

1. `pnpm install` — install all workspace dependencies
2. Set secrets in Replit Secrets (never in files):
   - `JWT_SECRET` — generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` and paste the output
   - `DATABASE_URL` is auto-provisioned by Replit; do not set it manually
3. `pnpm --filter @workspace/db run push` — apply schema to the database
4. `pnpm --filter @workspace/db run seed` — insert default admin + cajero accounts (idempotent; safe to run again)
5. Start workflows via the Replit UI (or `pnpm --filter @workspace/api-server run dev` + `pnpm --filter @workspace/pos run dev`)

## Run & Operate

- **API Server workflow**: `PORT=8080 pnpm --filter @workspace/api-server run dev` — proxied at `/api`
- **POS Frontend workflow**: `PORT=24730 pnpm --filter @workspace/pos run dev` — proxied at `/`
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/db run seed` — re-seed default users (idempotent)
- Required env: `DATABASE_URL` (auto-provisioned by Replit), `JWT_SECRET` (set manually in Replit Secrets), `BASE_PATH=/` (set as shared env var in Replit)

## Default Credentials

- **Admin**: `admin@claudiavanegas.com` / `admin123`
- **Cajero**: `cajero@claudiavanegas.com` / `cajero123`

## Stack

- pnpm workspaces, Node.js 20 (this environment), TypeScript 5.9
- **Frontend**: React 19 + Vite + Wouter + TanStack Query + Tailwind CSS + Recharts + Zustand
- **API**: Express 5 + JWT auth (jsonwebtoken + bcryptjs)
- **DB**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (zod/v4), drizzle-zod
- **API codegen**: Orval (from OpenAPI spec in `lib/api-spec/openapi.yaml`)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI contract (source of truth)
- `lib/db/src/schema/` — Drizzle DB schema (users, products, customers, suppliers, purchase_orders, sales, ledger, settings)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/api-server/src/lib/auth.ts` — JWT auth middleware
- `artifacts/pos/src/` — React frontend
- `artifacts/pos/src/hooks/use-auth.ts` — Zustand auth store
- `artifacts/pos/src/AppRouter.tsx` — Route definitions with role-based protection
- `lib/api-client-react/src/generated/` — Generated React Query hooks (do not edit manually)

## Modules

1. **Login** — JWT auth with roles (admin / cajero)
2. **Dashboard** — Monthly stats, billing vs collection chart, top products
3. **Inventario** — Product CRUD with images, admin only
4. **Punto de Venta** — Fast checkout interface, supports contado/crédito
5. **Clientes** — Customer CRUD
6. **Proveedores** — Supplier CRUD, admin only
7. **Órdenes de Compra** — Purchase orders with partial reception, admin only
8. **Cuentas por Pagar** — AP from credit purchase orders, admin only
9. **Cuentas por Cobrar** — AR from credit sales, with overdue alerts
10. **Ventas** — Sales history (cajero sees own; admin sees all)
11. **Informes** — Charts by month, category, payment type, admin only
12. **Configuración** — Store info + SMTP settings, admin only
13. **Usuarios** — User management, admin only

## Architecture decisions

- JWT stored in localStorage as `pos_token`; attached via custom-fetch.ts to all API requests
- Zustand for client-side auth state, initialized from localStorage on app load
- Credit sales automatically create accounts_receivable; credit purchase orders create accounts_payable
- Orval generates type-safe React Query hooks from the OpenAPI spec; never hand-write API calls
- DB numeric fields (prices, totals) stored as `numeric` strings in Postgres; parsed to float in route responses

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Bold Webhook

- Endpoint: `POST /api/webhooks/bold` (público — Bold lo llama desde sus servidores)
- URL de producción: `https://<tu-dominio>/api/webhooks/bold`
- Para verificar firma HMAC-SHA256, agrega el secret del dashboard Bold como `BOLD_WEBHOOK_SECRET` en Replit Secrets
- Si `BOLD_WEBHOOK_SECRET` no está configurado, el webhook acepta eventos sin verificar (útil en desarrollo)
- El estado del pago (`boldPaymentStatus`: pending / paid / failed / expired) se actualiza en la venta cuando Bold envía el evento
- Tipos de evento Bold que se mapean: `APPROVED`→paid, `REJECTED/FAILED`→failed, `EXPIRED`→expired, `PENDING`→pending

## Gotchas

- Run `pnpm --filter @workspace/api-spec run codegen` after every OpenAPI spec change before touching frontend code
- After schema changes run `pnpm --filter @workspace/db run push` to sync the DB
- Route handlers must use `Promise<void>` return type for Express 5 async handlers
- `req.params.id` is `string | string[]` in Express 5 — always parse with `parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10)`
- SMTP password is masked in GET /settings response; only updated if a new non-masked value is sent
