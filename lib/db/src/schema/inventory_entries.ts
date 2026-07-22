import { pgTable, serial, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";
import { productVariantsTable } from "./product_variants";
import { suppliersTable } from "./suppliers";

export const inventoryEntriesTable = pgTable("inventory_entries", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productsTable.id),
  variantId: integer("variant_id").references(() => productVariantsTable.id),
  supplierId: integer("supplier_id").references(() => suppliersTable.id),
  qty: integer("qty").notNull(),
  unitCost: numeric("unit_cost", { precision: 12, scale: 2 }).notNull(),
  totalCost: numeric("total_cost", { precision: 12, scale: 2 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertInventoryEntrySchema = createInsertSchema(inventoryEntriesTable).omit({ id: true, createdAt: true });
export type InsertInventoryEntry = z.infer<typeof insertInventoryEntrySchema>;
export type InventoryEntry = typeof inventoryEntriesTable.$inferSelect;
