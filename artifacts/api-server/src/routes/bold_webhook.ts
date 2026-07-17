/**
 * POST /webhooks/bold
 *
 * Receives Bold webhook events (CloudEvents-style) and updates the
 * boldPaymentStatus on the corresponding sale, matched via
 * `data.metadata.reference` (the exact `reference` we sent when creating
 * the payment link — Bold never echoes back the link ID itself).
 *
 * This route is PUBLIC (no JWT auth) — Bold calls it from their servers.
 * Signature verification uses HMAC-SHA256 with BOLD_WEBHOOK_SECRET if set.
 *
 * Real Bold webhook payload shape (https://developers.bold.co/webhook):
 * {
 *   id: string,               // notification UUID
 *   type: "SALE_APPROVED" | "SALE_REJECTED" | "VOID_APPROVED" | "VOID_REJECTED",
 *   subject: string,          // Bold transaction ID
 *   source: string,
 *   spec_version: "1.0",
 *   time: number,              // POSIX time (nanoseconds)
 *   data: {
 *     payment_id: string,
 *     merchant_id: string,
 *     amount: { currency: string, total: number, taxes: unknown[], tip: number },
 *     metadata: { reference: string | null },
 *     payment_method: string,
 *     ...
 *   }
 * }
 */

import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "node:crypto";
import { eq, or } from "drizzle-orm";
import { db, salesTable } from "@workspace/db";

const router: IRouter = Router();

// ── Status normalisation ──────────────────────────────────────────────────────

type BoldPaymentStatus = "pending" | "paid" | "failed" | "expired";

// Returns the new status to write, or null to acknowledge without updating.
function normaliseBoldType(type: string | undefined): BoldPaymentStatus | null {
  switch (type) {
    case "SALE_APPROVED":
      return "paid";
    case "SALE_REJECTED":
      return "failed";
    case "VOID_APPROVED":
      // Payment was reversed after approval — no longer counts as paid.
      return "failed";
    case "VOID_REJECTED":
      // Void attempt failed — the original payment status is unaffected.
      return null;
    case "SALE_IN_VALIDATION":
      // PSE / async payment in progress — Bold will follow up with
      // SALE_APPROVED or SALE_REJECTED once the bank confirms.
      // Acknowledge without touching the status (keep it "pending").
      return null;
    default:
      return null;
  }
}

// ── Signature verification ────────────────────────────────────────────────────
//
// Per Bold's docs, the signature is NOT a plain HMAC of the raw body. It is:
//   1. Base64-encode the raw request body (as a UTF-8 string).
//   2. HMAC-SHA256 that base64 string using the webhook secret key.
//   3. Hex-encode the result and compare against the `x-bold-signature` header
//      (sent as a bare hex string, no "sha256=" prefix).

function verifySignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  const secret = process.env.BOLD_WEBHOOK_SECRET;
  if (!secret) {
    // Secret not configured — log a warning but accept the event (dev mode)
    console.warn("[bold-webhook] BOLD_WEBHOOK_SECRET not set — skipping signature verification");
    return true;
  }
  if (!signatureHeader) {
    console.warn("[bold-webhook] Missing x-bold-signature header — rejecting");
    return false;
  }

  const encodedBody = Buffer.from(rawBody.toString("utf8"), "utf8").toString("base64");
  const expected = crypto
    .createHmac("sha256", secret)
    .update(encodedBody)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

// ── Webhook handler ───────────────────────────────────────────────────────────

router.post("/webhooks/bold", async (req: Request, res: Response): Promise<void> => {
  // Body is raw Buffer (registered in app.ts before express.json())
  const rawBody: Buffer = req.body as unknown as Buffer;

  const sigHeader = req.headers["x-bold-signature"] as string | undefined;

  if (!verifySignature(rawBody, sigHeader)) {
    res.status(400).json({ error: "Invalid signature" });
    return;
  }

  // Parse body
  let payload: {
    id?: string;
    type?: string;
    subject?: string;
    data?: {
      payment_id?: string;
      payment_method?: string;
      metadata?: { reference?: string | null };
      amount?: { total?: number; currency?: string };
    };
  };
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }

  // Log everything so PSE-specific payloads can be diagnosed from server logs.
  const paymentMethod = payload.data?.payment_method ?? "unknown";
  const reference = payload.data?.metadata?.reference ?? null;
  const paymentId = payload.data?.payment_id ?? null;

  console.info(
    `[bold-webhook] type=${payload.type} method=${paymentMethod} ` +
    `reference=${reference ?? "null"} payment_id=${paymentId ?? "null"} ` +
    `subject=${payload.subject ?? "null"} full=${JSON.stringify(payload)}`
  );

  const status = normaliseBoldType(payload.type);

  // Bold must always be acknowledged with 200 within 2s, even for events we
  // don't act on (unknown type, void-rejected, SALE_IN_VALIDATION) — otherwise
  // Bold treats the webhook as failed and retries indefinitely.
  if (!status) {
    console.info(`[bold-webhook] type='${payload.type}' → no status change, acknowledging`);
    res.status(200).json({ received: true, updated: false, reason: `type=${payload.type}` });
    return;
  }

  // ── Match sale ────────────────────────────────────────────────────────────
  // Primary: match by boldReference (the reference we sent when creating the link).
  // Fallback: match by boldLinkId using the payment_id Bold echoes back.
  // PSE payments sometimes arrive with reference=null in data.metadata —
  // in that case the fallback via payment_id is the only way to correlate.
  let sale: typeof salesTable.$inferSelect | undefined;

  if (reference) {
    [sale] = await db
      .select()
      .from(salesTable)
      .where(eq(salesTable.boldReference, reference))
      .limit(1);
  }

  if (!sale && paymentId) {
    console.warn(
      `[bold-webhook] No sale matched by reference='${reference}' — ` +
      `trying fallback match by payment_id='${paymentId}'`
    );
    [sale] = await db
      .select()
      .from(salesTable)
      .where(eq(salesTable.boldLinkId, paymentId))
      .limit(1);
  }

  if (!sale) {
    console.warn(
      `[bold-webhook] Could not match any sale ` +
      `(reference='${reference}', payment_id='${paymentId}', subject='${payload.subject}')`
    );
    res.status(200).json({ received: true, updated: false, reason: "sale_not_found" });
    return;
  }

  await db
    .update(salesTable)
    .set({
      boldPaymentStatus: status,
      boldLinkId: paymentId ?? sale.boldLinkId,
    })
    .where(eq(salesTable.id, sale.id));

  console.info(
    `[bold-webhook] Sale #${sale.id} updated: boldPaymentStatus → ${status} ` +
    `(method=${paymentMethod}, type=${payload.type})`
  );

  res.status(200).json({ received: true, updated: true, saleId: sale.id, status });
});

export default router;
