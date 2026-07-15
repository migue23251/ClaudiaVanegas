import { Router, type IRouter } from "express";
import { db, settingsTable } from "@workspace/db";
import { requireAuth, requireAdmin } from "../lib/auth";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

async function getOrCreateSettings() {
  const [existing] = await db.select().from(settingsTable);
  if (existing) return existing;
  const [created] = await db.insert(settingsTable).values({ storeName: "Claudia Vanegas" }).returning();
  return created;
}

router.get("/settings", requireAuth, async (_req, res): Promise<void> => {
  const settings = await getOrCreateSettings();
  // Don't expose SMTP password in GET
  const { smtpPass: _, ...safeSettings } = settings;
  res.json({ ...safeSettings, smtpPass: settings.smtpPass ? "••••••••" : null });
});

// Public, unauthenticated subset — used to render the logo/brand color on the
// login screen and app shell before a user has signed in, and to keep every
// browser/device in sync with what's stored in the database (not localStorage).
router.get("/settings/public", async (_req, res): Promise<void> => {
  const settings = await getOrCreateSettings();
  res.json({
    storeName: settings.storeName,
    logoUrl: settings.logoUrl,
    primaryColor: settings.primaryColor,
  });
});

router.put("/settings", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const settings = await getOrCreateSettings();
  const {
    storeName, storeEmail, storePhone, storeAddress,
    smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom,
    logoUrl, primaryColor, instagramUrl, tiktokUrl,
    sendInvoiceEmail, sendPaymentLinkEmail,
  } = req.body;
  const updates: Record<string, unknown> = {};
  if (storeName != null) updates.storeName = storeName;
  if (storeEmail !== undefined) updates.storeEmail = storeEmail;
  if (storePhone !== undefined) updates.storePhone = storePhone;
  if (storeAddress !== undefined) updates.storeAddress = storeAddress;
  if (smtpHost !== undefined) updates.smtpHost = smtpHost;
  if (smtpPort !== undefined) {
    const parsedPort = smtpPort === "" || smtpPort === null ? null : parseInt(String(smtpPort), 10);
    updates.smtpPort = parsedPort != null && Number.isNaN(parsedPort) ? null : parsedPort;
  }
  if (smtpUser !== undefined) updates.smtpUser = smtpUser;
  if (smtpPass && smtpPass !== "••••••••") updates.smtpPass = smtpPass;
  if (smtpFrom !== undefined) updates.smtpFrom = smtpFrom;
  if (logoUrl !== undefined) updates.logoUrl = logoUrl || null;
  if (primaryColor !== undefined) updates.primaryColor = primaryColor || null;
  if (instagramUrl !== undefined) updates.instagramUrl = instagramUrl || null;
  if (tiktokUrl !== undefined) updates.tiktokUrl = tiktokUrl || null;
  if (sendInvoiceEmail !== undefined) updates.sendInvoiceEmail = !!sendInvoiceEmail;
  if (sendPaymentLinkEmail !== undefined) updates.sendPaymentLinkEmail = !!sendPaymentLinkEmail;

  const [updated] = await db.update(settingsTable).set(updates).where(eq(settingsTable.id, settings.id)).returning();
  const { smtpPass: __, ...safeSettings } = updated;
  res.json({ ...safeSettings, smtpPass: updated.smtpPass ? "••••••••" : null });
});

export default router;
