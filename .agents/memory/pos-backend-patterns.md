---
name: POS Backend Patterns
description: Critical patterns and gotchas for the Claudia Vanegas POS Express 5 backend.
---

## Express 5 param types
`req.params.id` is `string | string[]` — always parse with:
```ts
parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10)
```

## JWT_SECRET enforcement
Auth module throws at startup if JWT_SECRET is missing (no fallback).
TypeScript narrowing workaround: assign to a second `const JWT_SECRET: string = _rawSecret` after the throw to appease the compiler.

## Role enforcement on financial endpoints
- Accounts Receivable (list, get, post payment) — `requireAdmin` required.
- Accounts Payable — `requireAdmin` required.
- Sales GET list/by-id — `requireAuth` only; cajero is filtered to own sales in query logic.

## Transaction safety
Sales creation and purchase-order creation/receiving are wrapped in `db.transaction(async tx => { ... })`.
Pattern: validate all inputs *before* opening the transaction; fail fast with 400 if invalid.

**Why:** partial failures (header inserted, items not, stock not decremented) corrupt accounting/inventory — discovered in code review.

## Zustand auth store initialization
`use-auth.ts` initializes from localStorage at module load time via `useAuth.setState(...)`.
Do NOT call `useAuth` (the hook) inside inline render functions in wouter `<Route>` children — extract to a named component (`RootRedirect`, `ProtectedRoute`) to comply with React hook rules.
