---
name: POS backend patterns
description: Critical patterns for Express 5 routes, transactions, auth, and Bold integration in this project.
---

## Express 5 async routes
All route handlers must be `async` — Express 5 does NOT auto-catch promise rejections in non-async handlers.

## Transaction pattern (Drizzle + node-postgres)
```ts
await db.transaction(async (tx) => {
  // all queries use tx, not db
});
```

## Auth middleware
```ts
import { requireAuth, requireAdmin } from "../middleware/auth";
router.get("/protected", requireAuth, requireAdmin, handler);
```
Public routes (e.g. `POST /catalog/order`, `GET /catalog`) skip both.

## Bold payment link integration
- Helper: `artifacts/api-server/src/lib/bold.ts` → `createBoldPaymentLink({ amount, description, currency })`
- Endpoint: `POST https://checkout.bold.co/integration/payment_links`
- Auth header: `Authorization: x-api-key <BOLD_API_KEY>`
- Amount in centavos (×100), currency `"COP"`
- Response field: `payload.payment_link` (string URL)
- Fee: 5% (`BOLD_FEE_RATE = 0.05`), stored in `sales.bold_fee`
- **Bold failure is silent** — sale commits regardless; error is logged only

## Catalog orders flow
1. Public `POST /api/catalog/order` → creates `catalog_orders` + `catalog_order_items` (status: `pending`)
2. Admin `GET /api/catalog-orders` → list all with items joined
3. Admin `POST /api/catalog-orders/:id/invoice` → checks stock, creates `sales` record, marks order `invoiced`
4. Admin `PUT /api/catalog-orders/:id/cancel` → marks order `cancelled`

## Sales `withBoldLink` param
Pass `withBoldLink: true` in the request body of `POST /api/sales` to generate a Bold link after the sale transaction commits.
Response includes `paymentLink`, `boldFee`, `catalogOrderId` fields.

## Why
- Express 5 change caught us off-guard on earlier routes — always async.
- Bold silent-failure keeps the sale from rolling back on gateway errors.
