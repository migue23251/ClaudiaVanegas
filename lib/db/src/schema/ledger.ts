import { pgTable, serial, text, integer, numeric, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { purchaseOrdersTable } from "./purchase_orders";
import { salesTable } from "./sales";

// Accounts Payable
export const accountsPayableTable = pgTable("accounts_payable", {
  id: serial("id").primaryKey(),
  purchaseOrderId: integer("purchase_order_id").notNull().references(() => purchaseOrdersTable.id),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
  paidAmount: numeric("paid_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  dueDate: date("due_date"),
  status: text("status", { enum: ["pending", "partial", "paid"] }).notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const apPaymentsTable = pgTable("ap_payments", {
  id: serial("id").primaryKey(),
  accountPayableId: integer("account_payable_id").notNull().references(() => accountsPayableTable.id),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  notes: text("notes"),
  paidAt: timestamp("paid_at", { withTimezone: true }).defaultNow().notNull(),
});

// Accounts Receivable
export const accountsReceivableTable = pgTable("accounts_receivable", {
  id: serial("id").primaryKey(),
  saleId: integer("sale_id").notNull().references(() => salesTable.id),
  customerId: integer("customer_id"),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
  paidAmount: numeric("paid_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  advanceAmount: numeric("advance_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  dueDate: date("due_date"),
  status: text("status", { enum: ["pending", "partial", "paid"] }).notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const arPaymentsTable = pgTable("ar_payments", {
  id: serial("id").primaryKey(),
  accountReceivableId: integer("account_receivable_id").notNull().references(() => accountsReceivableTable.id),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  notes: text("notes"),
  paidAt: timestamp("paid_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AccountPayable = typeof accountsPayableTable.$inferSelect;
export type AccountReceivable = typeof accountsReceivableTable.$inferSelect;
