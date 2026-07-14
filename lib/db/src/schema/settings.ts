import { pgTable, serial, text, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  storeName: text("store_name").notNull().default("Claudia Vanegas"),
  storeEmail: text("store_email"),
  storePhone: text("store_phone"),
  storeAddress: text("store_address"),
  smtpHost: text("smtp_host"),
  smtpPort: integer("smtp_port"),
  smtpUser: text("smtp_user"),
  smtpPass: text("smtp_pass"),
  smtpFrom: text("smtp_from"),
  logoUrl: text("logo_url"),
  primaryColor: text("primary_color"),
  instagramUrl: text("instagram_url"),
  tiktokUrl: text("tiktok_url"),
  sendInvoiceEmail: boolean("send_invoice_email").notNull().default(true),
  sendPaymentLinkEmail: boolean("send_payment_link_email").notNull().default(true),
});

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({ id: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settingsTable.$inferSelect;
