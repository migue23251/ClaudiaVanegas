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
- Helper: `artifacts/api-server/src/lib/bold.ts` → `createBoldPaymentLink({ amountCOP, description, reference, customer })`
- Endpoint: `POST https://integrations.api.bold.co/online/link/v1`
- Auth header: `Authorization: x-api-key <BOLD_API_KEY>` (the literal string "x-api-key" goes inside the `Authorization` header value, not as its own header)
- Amount in whole COP (pesos, NOT centavos) — **must be an integer**, Bold has rejected requests with 403 when `total_amount` had decimals; always round before sending. See [Bold link 403 troubleshooting](bold-payment-link-403.md).
- A unique `reference` field (alphanumeric/`_`/`-`, ≤60 chars) should be included per Bold's docs to avoid collisions — we append a timestamp. This exact string is stored as `sales.bold_reference` and is the ONLY key Bold's webhook echoes back to correlate a sale — see [Bold webhook shape](bold-webhook-shape.md).
- Response field: `payload.payment_link` / `payload.url`
- Fee: 5% (`BOLD_FEE_RATE = 0.05`), stored in `sales.bold_fee`
- **Bold failure is silent** — sale commits regardless; error is logged only
- On any non-OK response, the exact request body and Bold's response body are logged server-side — check API server logs first when debugging Bold errors instead of guessing.
- Webhook (`/api/webhooks/bold`) signature and payload shape must match Bold's real docs (base64-then-HMAC, CloudEvents payload) — see [Bold webhook shape](bold-webhook-shape.md) for the corrected implementation and the URL-registration step in Bold's dashboard that's easy to forget.

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
