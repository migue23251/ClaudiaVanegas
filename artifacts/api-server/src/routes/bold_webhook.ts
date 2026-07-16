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
import { eq } from "drizzle-orm";
import { db, salesTable } from "@workspace/db";

const router: IRouter = Router();

// ── Status normalisation ──────────────────────────────────────────────────────

type BoldPaymentStatus = "pending" | "paid" | "failed" | "expired";

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
    data?: { payment_id?: string; metadata?: { reference?: string | null } };
  };
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }

  console.info("[bold-webhook] Event received:", JSON.stringify(payload));

  const reference = payload.data?.metadata?.reference;
  const status = normaliseBoldType(payload.type);

  // Bold must always be acknowledged with 200 within 2s, even for events we
  // don't act on (unknown type, void-rejected, missing reference) — otherwise
  // Bold treats the webhook as failed and may retry indefinitely.
  if (!status) {
    console.warn(`[bold-webhook] Type '${payload.type}' does not change payment status — acknowledging only`);
    res.status(200).json({ received: true, updated: false });
    return;
  }

  if (!reference) {
    console.warn("[bold-webhook] Event missing data.metadata.reference — cannot match a sale");
    res.status(200).json({ received: true, updated: false });
    return;
  }

  const [sale] = await db.select().from(salesTable).where(eq(salesTable.boldReference, reference)).limit(1);

  if (!sale) {
    console.warn(`[bold-webhook] No sale found with boldReference='${reference}' (bold subject='${payload.subject}')`);
    // Respond 200 so Bold doesn't retry (the event may be for an unknown reference)
    res.status(200).json({ received: true, updated: false });
    return;
  }

  await db
    .update(salesTable)
    .set({ boldPaymentStatus: status, boldLinkId: payload.data?.payment_id ?? sale.boldLinkId })
    .where(eq(salesTable.id, sale.id));

  console.info(`[bold-webhook] Sale #${sale.id} boldPaymentStatus → ${status}`);

  res.status(200).json({ received: true, updated: true, saleId: sale.id, status });
});

export default router;
