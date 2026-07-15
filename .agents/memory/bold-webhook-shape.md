---
name: Bold webhook — real signature scheme and payload shape
description: The correct HMAC signature algorithm and CloudEvents-style payload for Bold (bold.co) webhooks — an earlier implementation guessed both wrong.
---

## Symptom
Sales paid via a Bold payment link stayed `pending` in the sales history forever, even with `BOLD_WEBHOOK_SECRET` configured. No incoming requests to `/api/webhooks/bold` ever appeared in server logs.

## Root causes (two, compounding)
1. **The webhook was never registered with Bold.** Bold does not discover your endpoint automatically — you must add the URL in the **Panel de Comercios → Integraciones** (https://panel.bold.co/panel/integrations). If nothing ever hits the endpoint, that's the first thing to check (server logs show zero `[bold-webhook]` lines).
2. **The signature verification and payload parsing were both guessed wrong in an earlier session** (never checked against https://developers.bold.co/webhook):
   - Bold's real signature is HMAC-SHA256 over the **Base64-encoded** raw body (not the raw body itself), hex-compared against the bare `x-bold-signature` header (no `sha256=` prefix). The earlier code HMAC'd the raw body directly — every real Bold signature would have failed verification (400).
   - Bold's real payload is CloudEvents-shaped: `{ id, type: "SALE_APPROVED"|"SALE_REJECTED"|"VOID_APPROVED"|"VOID_REJECTED", subject, data: { payment_id, metadata: { reference }, amount, ... } }`. There is no `data.order.id`/`data.id`/`data.status` field — the earlier code looked for fields that don't exist in the real payload.
   - Bold **never echoes the payment-link ID** back in the webhook. The only reliable correlation key is `data.metadata.reference`, which must equal the exact `reference` string sent when creating the link (see `createBoldPaymentLink`). Match sales by a stored `boldReference` column, not by link ID.

**Why:** Two independent agent sessions built the Bold integration off assumptions instead of the docs page, and both bugs silently produced "it looks configured but nothing happens" — no error, just permanently-pending sales.
**How to apply:** Before touching Bold webhook code again, fetch https://developers.bold.co/webhook directly rather than trusting prior code or memory — Bold's docs are the only source of truth for signature scheme and payload shape. To test end-to-end without waiting for a real Bold event, simulate a signed request: base64-encode a JSON body, HMAC-SHA256 it with `BOLD_WEBHOOK_SECRET` (read via env in a script, never print the secret itself), and `curl` it to `/api/webhooks/bold` with `x-bold-signature: <hex>`.
