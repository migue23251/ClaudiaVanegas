import { pgTable, serial, text, integer, numeric, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { customersTable } from "./customers";

export const salesTable = pgTable("sales", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  customerId: integer("customer_id").references(() => customersTable.id),
  paymentType: text("payment_type", { enum: ["contado", "credito"] }).notNull(),
  total: numeric("total", { precision: 12, scale: 2 }).notNull(),
  notes: text("notes"),
  voided: boolean("voided").notNull().default(false),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  voidReason: text("void_reason"),
  paymentLink: text("payment_link"),
  boldFee: numeric("bold_fee", { precision: 12, scale: 2 }),
  catalogOrderId: integer("catalog_order_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const saleItemsTable = pgTable("sale_items", {
  id: serial("id").primaryKey(),
  saleId: integer("sale_id").notNull().references(() => salesTable.id),
  productId: integer("product_id").notNull(),
  qty: integer("qty").notNull(),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
});

export const insertSaleSchema = createInsertSchema(salesTable).omit({ id: true, createdAt: true });
export const insertSaleItemSchema = createInsertSchema(saleItemsTable).omit({ id: true });
export type InsertSale = z.infer<typeof insertSaleSchema>;
export type Sale = typeof salesTable.$inferSelect;
export type SaleItem = typeof saleItemsTable.$inferSelect;
