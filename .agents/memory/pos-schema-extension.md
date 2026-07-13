---
name: POS schema extension pattern
description: How to safely add optional columns and new tables, and update the full stack.
---

## Steps to extend the schema

1. **Edit schema files** in `lib/db/src/schema/`
   - New tables → new file, export from `index.ts`
   - New columns → add to existing schema file (use `.default()` or nullable for backwards compat)

2. **Run migration**
   ```bash
   pnpm --filter @workspace/db run push
   ```
   Uses `drizzle-kit push` — applies changes directly to the dev DB.

3. **Update API routes** in `artifacts/api-server/src/routes/`
   - Register new routers in `artifacts/api-server/src/routes/index.ts`

4. **Restart API server** if it doesn't auto-reload (it uses esbuild + node, not ts-node):
   ```bash
   # via WorkflowsRestart or restart the workflow
   ```

5. **Codegen** (if new endpoints need TypeScript client types):
   ```bash
   pnpm --filter @workspace/api-client run generate
   ```

## Tables added in catalog-orders session
- `catalog_orders` — id, status enum (pending/invoiced/cancelled), customer fields, total, invoiced_sale_id, timestamps
- `catalog_order_items` — id, order_id FK, product_id (nullable), product_name snapshot, qty, unit_price, subtotal

## Columns added to `sales`
- `payment_link` (text, nullable) — Bold payment URL
- `bold_fee` (numeric, nullable) — Bold fee amount in COP
- `catalog_order_id` (integer, nullable, FK) — links sale back to originating catalog order

## Why nullable / optional
All new sales columns are nullable so existing sales records don't break on migration.
