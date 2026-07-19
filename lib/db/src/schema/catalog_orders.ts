import { pgTable, serial, text, integer, numeric, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const catalogOrderStatusEnum = pgEnum("catalog_order_status", [
  "pending",
  "invoiced",
  "cancelled",
]);

export const catalogOrdersTable = pgTable("catalog_orders", {
  id: serial("id").primaryKey(),
  status: catalogOrderStatusEnum("status").notNull().default("pending"),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
  customerEmail: text("customer_email"),
  customerAddress: text("customer_address"),
  notes: text("notes"),
  total: numeric("total", { precision: 12, scale: 2 }).notNull(),
  invoicedSaleId: integer("invoiced_sale_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const catalogOrderItemsTable = pgTable("catalog_order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => catalogOrdersTable.id),
  productId: integer("product_id"),
  productName: text("product_name").notNull(),
  qty: integer("qty").notNull(),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
  variantId: integer("variant_id"),
  variantColor: text("variant_color"),
  variantSize: text("variant_size"),
});

export type CatalogOrder = typeof catalogOrdersTable.$inferSelect;
export type CatalogOrderItem = typeof catalogOrderItemsTable.$inferSelect;
