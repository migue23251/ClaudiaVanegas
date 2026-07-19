import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";

export const VARIANT_COLORS = [
  "blanco", "negro", "gris", "beige", "crema",
  "rojo", "rosa", "fucsia", "naranja", "amarillo",
  "verde", "azul", "morado", "vinotinto", "café",
  "multicolor",
] as const;

export const VARIANT_SIZES = [
  "XS", "S", "M", "L", "XL", "XXL",
  "34", "35", "36", "37", "38", "39", "40", "41", "42",
  "6", "8", "10", "12", "14", "16",
  "Único",
] as const;

// Hex swatches for display in UI
export const COLOR_HEX: Record<string, string> = {
  blanco: "#FFFFFF",
  negro: "#111111",
  gris: "#9CA3AF",
  beige: "#D4B896",
  crema: "#FFF8E7",
  rojo: "#EF4444",
  rosa: "#F9A8D4",
  fucsia: "#EC4899",
  naranja: "#F97316",
  amarillo: "#FACC15",
  verde: "#22C55E",
  azul: "#3B82F6",
  morado: "#A855F7",
  vinotinto: "#7F1D1D",
  café: "#78350F",
  multicolor: "linear-gradient(135deg,#f00,#0f0,#00f)",
};

export type VariantColor = (typeof VARIANT_COLORS)[number];
export type VariantSize = (typeof VARIANT_SIZES)[number];

export const productVariantsTable = pgTable("product_variants", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  color: text("color").notNull(),
  size: text("size").notNull(),
  sku: text("sku").notNull().unique(),
  stock: integer("stock").notNull().default(0),
  images: jsonb("images").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertProductVariantSchema = createInsertSchema(productVariantsTable).omit({ id: true, createdAt: true });
export type InsertProductVariant = z.infer<typeof insertProductVariantSchema>;
export type ProductVariant = typeof productVariantsTable.$inferSelect;
