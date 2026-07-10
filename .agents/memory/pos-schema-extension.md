---
name: POS schema extension pattern
description: How to safely add optional columns and update the full stack (DB → spec → codegen → frontend) in this project.
---

## Rule
When adding optional fields to the customer/product/sale/PO schemas, follow this exact order:

1. Edit `lib/db/src/schema/<table>.ts` (add nullable column, e.g. `phone: text("phone")`)
2. Run `pnpm --filter @workspace/db run push` (applies the DDL migration safely)
3. Edit `lib/api-spec/openapi.yaml` — update affected schemas (Customer, SaleItem, PurchaseOrderItem, etc.)
4. Run `pnpm --filter @workspace/api-spec run codegen` (regenerates hooks + zod validators)
5. Update backend routes (`artifacts/api-server/src/routes/*.ts`)
6. Update frontend pages

**Why:** codegen generates TS types from the spec; if routes change before codegen runs, the types are wrong and tsc will fail. The DB push must precede codegen since Drizzle reflects the live schema.

## Empty-string vs undefined in update handlers
When a user clears an optional field (email, phone) in an edit form, send the field explicitly as an empty string `""` — NOT `|| undefined`. The backend uses `if (field !== undefined) updates.field = field || null`, which correctly converts `""` → `null` and skips the field when `undefined`. Sending `undefined` silently prevents clearing the field.

**How to apply:** In edit form submit handlers, use `formData.get("email") as string` directly, not `(formData.get("email") as string) || undefined`.

## as any casts for new fields
After codegen, remove any `as any` casts added to access newly-generated fields (e.g. `customer.phone`). The generated types are in `lib/api-client-react/src/generated/api.schemas.ts`.
