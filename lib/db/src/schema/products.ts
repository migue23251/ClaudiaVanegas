import { pgTable, serial, text, integer, numeric, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const PRODUCT_CATEGORIES = [
  "blusas",
  "jeans",
  "vestidos",
  "conjuntos",
  "faldas",
  "chaquetas",
  "zapatos",
  "bolsos",
  "accesorios",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  costPrice: numeric("cost_price", { precision: 12, scale: 2 }).notNull(),
  salePrice: numeric("sale_price", { precision: 12, scale: 2 }).notNull(),
  stock: integer("stock").notNull().default(0),
  category: text("category", { enum: PRODUCT_CATEGORIES }).notNull(),
  images: jsonb("images").$type<string[]>().notNull().default([]),
  isVisible: boolean("is_visible").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true, createdAt: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
