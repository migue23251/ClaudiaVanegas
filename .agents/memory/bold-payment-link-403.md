---
name: Bold payment link 403 troubleshooting
description: Why Bold's link-de-pagos API can return 403 even when the API key and GET endpoints work fine, and how it was fixed in this project.
---

## Symptom
`GET /online/link/v1/payment_methods` succeeds (200) with a given `BOLD_API_KEY`, but `POST /online/link/v1` (create payment link) returns 403 for the same key — misleadingly suggesting an auth/permissions problem.

## Root cause found here
The request body didn't send an integer `amount.total_amount` (a float/decimal COP total, e.g. from unrounded product prices) and omitted the `reference` field that Bold's docs recommend per link. Rounding the total to an integer and adding a unique `reference` (alphanumeric/`_`/`-`, ≤60 chars, with a timestamp suffix) resolved it.

**Why:** GET requests only need the API key, so they succeed regardless of body issues — the 403 only surfaces on the POST that actually validates the payload, which made it look like an auth problem when it was actually a payload problem.
**How to apply:** Before assuming a Bold 403 is a key/activation issue, verify the outgoing body has an integer amount and a `reference` field. Reproduce the exact call server-side (`curl`/`node fetch` with the real `BOLD_API_KEY`) rather than only testing GET endpoints — GET succeeding does not mean POST will.

## Debugging tip
`artifacts/api-server/src/lib/bold.ts` now logs the full outgoing request body and Bold's raw response body whenever the API call fails — check API server workflow logs first instead of re-guessing the payload.

## Related: sales stuck on "pending" (webhook)
This 403 fix is unrelated to sales staying `pending` forever after a Bold payment link is paid — see [Bold webhook real shape](bold-webhook-shape.md) for that issue (wrong signature algorithm + wrong payload shape were both guessed incorrectly in an earlier session, never verified against Bold's actual docs).
