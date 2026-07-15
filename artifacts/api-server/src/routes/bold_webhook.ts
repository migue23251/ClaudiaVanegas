/**
 * POST /webhooks/bold
 *
 * Receives Bold payment-link webhook events and updates the boldPaymentStatus
 * on the corresponding sale.
 *
 * This route is PUBLIC (no JWT auth) — Bold calls it from their servers.
 * Signature verification uses HMAC-SHA256 with BOLD_WEBHOOK_SECRET if set.
 *
 * Bold webhook payload (approximate — they may vary by API version):
 * {
 *   type: "PAYMENT",
 *   event: "PURCHASE" | "REJECTED" | "ABANDONED" | ...,
 *   data: {
 *     order: { id: string, status: "APPROVED"|"REJECTED"|"PENDING"|"EXPIRED", ... }
 *   }
 * }
 * or newer event shape:
 * {
 *   event: "payment_link.paid" | "payment_link.expired" | ...,
 *   data: { id: string, status: "APPROVED"|..., payment_link?: string }
 * }
 */

import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "node:crypto";
import { eq, or } from "drizzle-orm";
import { db, salesTable } from "@workspace/db";

const router: IRouter = Router();

// ── Status normalisation ──────────────────────────────────────────────────────

type BoldPaymentStatus = "pending" | "paid" | "failed" | "expired";

function normaliseBoldStatus(raw: string | undefined): BoldPaymentStatus | null {
  if (!raw) return null;
  const s = raw.toUpperCase();
  if (s === "APPROVED" || s === "PAID" || s === "COMPLETED" || s === "SUCCESS") return "paid";
  if (s === "REJECTED" || s === "DECLINED" || s === "FAILED" || s === "ERROR") return "failed";
  if (s === "EXPIRED") return "expired";
  if (s === "PENDING" || s === "IN_PROGRESS") return "pending";
  return null;
}

// ── Signature verification ────────────────────────────────────────────────────

function verifySignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  const secret = process.env.BOLD_WEBHOOK_SECRET;
  if (!secret) {
    // Secret not configured — log a warning but accept the event (dev mode)
    console.warn("[bold-webhook] BOLD_WEBHOOK_SECRET not set — skipping signature verification");
    return true;
  }
  if (!signatureHeader) {
    console.warn("[bold-webhook] Missing signature header — rejecting");
    return false;
  }

  // Bold sends "sha256=<hex>" or just the hex digest
  const receivedSig = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice(7)
    : signatureHeader;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(receivedSig, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

// ── Webhook handler ───────────────────────────────────────────────────────────

router.post("/webhooks/bold", async (req: Request, res: Response): Promise<void> => {
  // Body is raw Buffer (registered in app.ts before express.json())
  const rawBody: Buffer = req.body as unknown as Buffer;

  // Verify signature
  const sigHeader =
    (req.headers["x-bold-signature"] as string | undefined) ??
    (req.headers["bold-signature"] as string | undefined);

  if (!verifySignature(rawBody, sigHeader)) {
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  // Parse body
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody.toString("utf8")) as Record<string, unknown>;
  } catch {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }

  console.info("[bold-webhook] Event received:", JSON.stringify(payload));

  // ── Extract event data (handle multiple payload shapes) ──────────────────

  // Shape A: { type, event, data: { order: { id, status } } }
  // Shape B: { event, data: { id, status, payment_link } }

  const data = payload.data as Record<string, unknown> | undefined;
  const order = (data?.order as Record<string, unknown> | undefined) ?? data;

  const boldId =
    (order?.id as string | undefined) ??
    (order?.payment_link_id as string | undefined) ??
    (data?.id as string | undefined);

  const boldStatusRaw =
    (order?.status as string | undefined) ??
    (data?.status as string | undefined);

  const paymentLinkUrl =
    (order?.payment_link as string | undefined) ??
    (data?.payment_link as string | undefined);

  const status = normaliseBoldStatus(boldStatusRaw);

  if (!status) {
    // Unknown status — acknowledge but do nothing
    console.warn("[bold-webhook] Unrecognised status:", boldStatusRaw, "— skipping update");
    res.status(200).json({ received: true, updated: false });
    return;
  }

  // ── Find the sale ─────────────────────────────────────────────────────────

  let sale: (typeof salesTable.$inferSelect) | undefined;

  const conditions = [];
  if (boldId) conditions.push(eq(salesTable.boldLinkId, boldId));
  if (paymentLinkUrl) conditions.push(eq(salesTable.paymentLink, paymentLinkUrl));

  if (conditions.length > 0) {
    const rows = await db
      .select()
      .from(salesTable)
      .where(conditions.length === 1 ? conditions[0] : or(...conditions))
      .limit(1);
    sale = rows[0];
  }

  if (!sale) {
    console.warn("[bold-webhook] No matching sale found for boldId:", boldId, "url:", paymentLinkUrl);
    // Respond 200 so Bold doesn't retry (the event may be for an unknown link)
    res.status(200).json({ received: true, updated: false });
    return;
  }

  // ── Update payment status ─────────────────────────────────────────────────

  await db
    .update(salesTable)
    .set({ boldPaymentStatus: status })
    .where(eq(salesTable.id, sale.id));

  console.info(`[bold-webhook] Sale #${sale.id} boldPaymentStatus → ${status}`);

  res.status(200).json({ received: true, updated: true, saleId: sale.id, status });
});

export default router;
